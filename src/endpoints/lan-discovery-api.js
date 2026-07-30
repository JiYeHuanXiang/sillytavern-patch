import express from 'express';

import { getInstances, addManualInstance, removeManualInstance } from '../lan-discovery.js';

export const router = express.Router();

/**
 * Returns whether LAN chat is enabled on this server.
 */
router.get('/status', (_req, res) => {
    res.json({ enabled: true });
    return;
});

/**
 * Lists all known instances (mDNS discovered + manually added).
 */
router.get('/instances', (_req, res) => {
    res.json({ instances: getInstances() });
    return;
});

/**
 * Adds a manual instance (for FRP / remote connectivity).
 */
router.post('/instances/add', (req, res) => {
    const name = String(req.body?.name || 'Manual Instance').slice(0, 100);
    const host = String(req.body?.host || '').trim();
    const port = Number(req.body?.port);

    if (!host) {
        return res.status(400).json({ error: 'Host is required' });
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return res.status(400).json({ error: 'Valid port (1-65535) is required' });
    }

    addManualInstance(name, host, port);
    res.json({ ok: true });
    return;
});

/**
 * Removes a manual instance.
 */
router.post('/instances/remove', (req, res) => {
    const host = String(req.body?.host || '').trim();
    const port = Number(req.body?.port);

    if (!host || !Number.isInteger(port)) {
        return res.status(400).json({ error: 'Host and port are required' });
    }

    removeManualInstance(host, port);
    res.json({ ok: true });
    return;
});
