import os from 'node:os';
import dgram from 'node:dgram';

import { getConfigValue } from './util.js';

const SERVICE_TYPE = '_sillytavern-lan._tcp.local';

/** @type {Map<string, {name: string, host: string, port: number, lastSeen: number}>} */
const discoveredInstances = new Map();

/** @type {Map<string, {name: string, host: string, port: number, addedAt: number}>} */
const manualInstances = new Map();

let mdnsSocket = null;
let broadcastInterval = null;
let cleanupInterval = null;
let isStarted = false;

const DISCOVERY_TIMEOUT_MS = 30_000; // Remove instances not seen for 30s

/**
 * Encodes a DNS name into the buffer format (length-prefixed labels).
 * @param {string} name
 * @returns {Buffer}
 */
function encodeDnsName(name) {
    const labels = name.split('.');
    const parts = labels.map(label => {
        const labelBuf = Buffer.from(label, 'utf8');
        return Buffer.concat([Buffer.from([labelBuf.length]), labelBuf]);
    });
    return Buffer.concat([...parts, Buffer.from([0])]);
}

/**
 * Decodes a DNS name from a buffer starting at the given offset.
 * @param {Buffer} buf
 * @param {number} offset
 * @returns {{name: string, nextOffset: number}}
 */
function decodeDnsName(buf, offset) {
    const labels = [];
    let pos = offset;
    let jumped = false;
    let jumpPos = 0;

    while (pos < buf.length) {
        const len = buf[pos];
        if (len === 0) {
            pos++;
            break;
        }
        if ((len & 0xc0) === 0xc0) {
            if (!jumped) {
                jumpPos = pos + 2;
            }
            pos = ((len & 0x3f) << 8) | buf[pos + 1];
            jumped = true;
            continue;
        }
        pos++;
        labels.push(buf.toString('utf8', pos, pos + len));
        pos += len;
    }

    return {
        name: labels.join('.'),
        nextOffset: jumped ? jumpPos : pos,
    };
}

/**
 * Builds a mDNS announcement packet for this instance.
 * @param {string} instanceName
 * @param {number} port
 * @returns {Buffer}
 */
function buildAnnouncementPacket(instanceName, port) {
    // Header: transaction ID (2), flags (2), questions (2), answers (2), auth (2), additional (2)
    const header = Buffer.alloc(12);
    header.writeUInt16BE(0, 0);       // Transaction ID
    header.writeUInt16BE(0x8400, 2);  // Flags: response, authoritative
    header.writeUInt16BE(0, 4);       // Questions
    header.writeUInt16BE(1, 6);       // Answers (PTR)
    header.writeUInt16BE(0, 8);       // Authority
    header.writeUInt16BE(2, 10);      // Additional (SRV + TXT)

    // PTR record: _sillytavern-lan._tcp.local -> <instance>.local
    const ptrName = encodeDnsName(SERVICE_TYPE + '.local');
    const instanceFqdn = encodeDnsName(`${instanceName}._sillytavern-lan._tcp.local`);
    const ptrRdata = instanceFqdn;
    const ptrRecord = Buffer.concat([
        ptrName,
        Buffer.from([0x00, 0x0c]),   // Type PTR
        Buffer.from([0x00, 0x01]),   // Class IN
        // TTL
        Buffer.from([0x00, 0x00, 0x11, 0x94]), // 4500s
        Buffer.from([0x00, ptrRdata.length]),  // RDLENGTH
        ptrRdata,
    ]);

    // SRV record: <instance>.local -> priority 0, weight 0, port, hostname
    const hostname = os.hostname() || 'sillytavern';
    const srvRdata = Buffer.concat([
        Buffer.from([0x00, 0x00]), // Priority
        Buffer.from([0x00, 0x00]), // Weight
        Buffer.from([(port >> 8) & 0xff, port & 0xff]), // Port
        encodeDnsName(`${hostname}.local`),
    ]);
    const srvRecord = Buffer.concat([
        instanceFqdn,
        Buffer.from([0x00, 0x21]),   // Type SRV
        Buffer.from([0x00, 0x01]),   // Class IN
        Buffer.from([0x00, 0x00, 0x11, 0x94]), // TTL
        Buffer.from([0x00, srvRdata.length]),
        srvRdata,
    ]);

    // TXT record: instance name + port (for convenience)
    const txtData = 'name=' + instanceName;
    const txtEntry = Buffer.concat([Buffer.from([txtData.length]), Buffer.from(txtData, 'utf8')]);
    const txtRecord = Buffer.concat([
        instanceFqdn,
        Buffer.from([0x00, 0x10]),   // Type TXT
        Buffer.from([0x00, 0x01]),   // Class IN
        Buffer.from([0x00, 0x00, 0x11, 0x94]), // TTL
        Buffer.from([0x00, txtEntry.length]),
        txtEntry,
    ]);

    return Buffer.concat([header, ptrRecord, srvRecord, txtRecord]);
}

/**
 * Builds a mDNS query packet for service discovery.
 * @returns {Buffer}
 */
function buildQueryPacket() {
    const header = Buffer.alloc(12);
    header.writeUInt16BE(0, 0);       // Transaction ID
    header.writeUInt16BE(0x0000, 2);  // Flags: standard query
    header.writeUInt16BE(1, 4);       // Questions
    header.writeUInt16BE(0, 6);       // Answers
    header.writeUInt16BE(0, 8);       // Authority
    header.writeUInt16BE(0, 10);      // Additional

    const question = Buffer.concat([
        encodeDnsName(SERVICE_TYPE + '.local'),
        Buffer.from([0x00, 0x0c]),  // Type PTR
        Buffer.from([0x00, 0x01]),  // Class IN
    ]);

    return Buffer.concat([header, question]);
}

/**
 * Parses an incoming mDNS packet and extracts instance info if it's a SillyTavern announcement.
 * @param {Buffer} buf
 * @returns {{instanceName: string, host: string, port: number} | null}
 */
function parseAnnouncement(buf) {
    if (buf.length < 12) return null;

    const qdcount = buf.readUInt16BE(4);
    const ancount = buf.readUInt16BE(6);
    const arcount = buf.readUInt16BE(10);

    let offset = 12;

    // Skip questions
    for (let i = 0; i < qdcount; i++) {
        const { nextOffset } = decodeDnsName(buf, offset);
        offset = nextOffset + 4; // Skip QTYPE(2) + QCLASS(2)
    }

    let foundInstance = null;
    let foundPort = null;
    let foundHost = null;

    // Parse answers + additional
    const totalRecords = ancount + arcount;
    for (let i = 0; i < totalRecords && offset < buf.length; i++) {
        const { name, nextOffset } = decodeDnsName(buf, offset);
        offset = nextOffset;

        if (offset + 10 > buf.length) break;
        const rtype = buf.readUInt16BE(offset);
        const rdlength = buf.readUInt16BE(offset + 8);
        offset += 10;
        const rdata = buf.subarray(offset, offset + rdlength);
        offset += rdlength;

        if (name === SERVICE_TYPE + '.local' && rtype === 0x000c) {
            // PTR record
            const ptr = decodeDnsName(buf, offset - rdlength);
            const parts = ptr.name.split('.');
            if (parts.length > 0) {
                foundInstance = parts[0];
            }
        }

        if (name.includes('_sillytavern-lan._tcp.local') && rtype === 0x0021) {
            // SRV record
            if (rdata.length >= 6) {
                foundPort = rdata.readUInt16BE(4);
                const hostResult = decodeDnsName(buf, offset - rdlength + 6);
                foundHost = hostResult.name.replace(/\.local$/, '');
            }
        }

        if (name.includes('_sillytavern-lan._tcp.local') && rtype === 0x0010) {
            // TXT record
            if (rdata.length > 1 && !foundInstance) {
                const txtLen = rdata[0];
                const txt = rdata.toString('utf8', 1, 1 + txtLen);
                const match = txt.match(/^name=(.+)$/);
                if (match) {
                    foundInstance = match[1];
                }
            }
        }
    }

    if (foundPort !== null) {
        return {
            instanceName: foundInstance || 'Unknown',
            host: foundHost || '',
            port: foundPort,
        };
    }

    return null;
}

/**
 * Handles an incoming mDNS message.
 * @param {Buffer} msg
 * @param {dgram.RemoteInfo} rinfo
 */
function handleMdnsMessage(msg, rinfo) {
    const info = parseAnnouncement(msg);
    if (info) {
        const key = `${rinfo.address}:${info.port}`;
        discoveredInstances.set(key, {
            name: info.instanceName,
            host: rinfo.address,
            port: info.port,
            lastSeen: Date.now(),
        });
    }
}

/**
 * Starts mDNS broadcasting and discovery.
 * @param {number} port The port this instance is listening on
 */
export function startDiscovery(port) {
    const enabled = getConfigValue('lanDiscovery.enabled', true, 'boolean');
    if (!enabled || isStarted) return;

    const serviceName = getConfigValue('lanDiscovery.serviceName', 'SillyTavern', 'string');
    const instanceName = `${serviceName}-${port}`;

    try {
        mdnsSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        mdnsSocket.on('message', handleMdnsMessage);

        mdnsSocket.on('error', (err) => {
            console.warn('mDNS discovery error:', err.message);
        });

        mdnsSocket.bind(5353, () => {
            // Join mDNS multicast group
            try {
                mdnsSocket.addMembership('224.0.0.251');
            } catch {
                // Non-fatal — some environments block multicast
            }

            mdnsSocket.setMulticastTTL(255);

            // Broadcast query immediately, then every 10s
            const query = buildQueryPacket();
            mdnsSocket.send(query, 5353, '224.0.0.251');

            // Broadcast announcement every 10s
            broadcastInterval = setInterval(() => {
                const announcement = buildAnnouncementPacket(instanceName, port);
                mdnsSocket.send(announcement, 5353, '224.0.0.251');
                // Also send a query to discover new instances
                mdnsSocket.send(query, 5353, '224.0.0.251');
            }, 10_000);
            broadcastInterval.unref();
        });

        // Cleanup stale instances every 15s
        cleanupInterval = setInterval(() => {
            const now = Date.now();
            for (const [key, info] of discoveredInstances) {
                if (now - info.lastSeen > DISCOVERY_TIMEOUT_MS) {
                    discoveredInstances.delete(key);
                }
            }
        }, 15_000);
        cleanupInterval.unref();

        isStarted = true;
        console.log(`LAN discovery started (service: ${instanceName}, port: ${port})`);
    } catch (err) {
        console.warn('Failed to start LAN discovery:', err.message);
    }
}

/**
 * Adds a manual instance address (for FRP / remote connectivity).
 * @param {string} name
 * @param {string} host
 * @param {number} port
 */
export function addManualInstance(name, host, port) {
    const key = `${host}:${port}`;
    manualInstances.set(key, { name, host, port, addedAt: Date.now() });
}

/**
 * Removes a manual instance.
 * @param {string} host
 * @param {number} port
 */
export function removeManualInstance(host, port) {
    const key = `${host}:${port}`;
    manualInstances.delete(key);
}

/**
 * Gets all known instances (discovered + manual).
 * @returns {Array<{key: string, name: string, host: string, port: number, source: 'mdns' | 'manual'}>}
 */
export function getInstances() {
    const result = [];

    for (const [key, info] of discoveredInstances) {
        result.push({
            key,
            name: info.name,
            host: info.host,
            port: info.port,
            source: 'mdns',
        });
    }

    for (const [key, info] of manualInstances) {
        result.push({
            key,
            name: info.name,
            host: info.host,
            port: info.port,
            source: 'manual',
        });
    }

    return result;
}
