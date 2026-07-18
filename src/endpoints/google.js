import { Buffer } from 'node:buffer';
import fetch from 'node-fetch';
import express from 'express';
import crypto from 'node:crypto';

import { readSecret, SECRET_KEYS } from './secrets.js';
import { GEMINI_SAFETY, VERTEX_SAFETY } from '../constants.js';
import { getConfigValue, trimTrailingSlash } from '../util.js';

const API_MAKERSUITE = 'https://generativelanguage.googleapis.com';
const API_VERTEX_AI = 'https://us-central1-aiplatform.googleapis.com';

function createWavHeader(dataSize, sampleRate, numChannels = 1, bitsPerSample = 16) {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28);
    header.writeUInt16LE(numChannels * bitsPerSample / 8, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);
    return header;
}

function createCompleteWavFile(pcmData, sampleRate) {
    const header = createWavHeader(pcmData.length, sampleRate);
    return Buffer.concat([header, pcmData]);
}

// Vertex AI authentication helper functions
export async function getVertexAIAuth(request) {
    const authMode = request.body.vertexai_auth_mode || 'express';

    if (request.body.reverse_proxy) {
        return {
            authHeader: `Bearer ${request.body.proxy_password}`,
            authType: 'proxy',
        };
    }

    if (authMode === 'express') {
        const apiKey = readSecret(request.user.directories, SECRET_KEYS.VERTEXAI);
        if (apiKey) {
            return {
                authHeader: `Bearer ${apiKey}`,
                authType: 'express',
            };
        }
        throw new Error('API key is required for Vertex AI Express mode');
    } else if (authMode === 'full') {
        // Get service account JSON from backend storage
        const serviceAccountJson = readSecret(request.user.directories, SECRET_KEYS.VERTEXAI_SERVICE_ACCOUNT);

        if (serviceAccountJson) {
            try {
                const serviceAccount = JSON.parse(serviceAccountJson);
                const jwtToken = await generateJWTToken(serviceAccount);
                const accessToken = await getAccessToken(jwtToken);
                return {
                    authHeader: `Bearer ${accessToken}`,
                    authType: 'full',
                };
            } catch (error) {
                console.error('Failed to authenticate with service account:', error);
                throw new Error(`Service account authentication failed: ${error.message}`);
            }
        }
        throw new Error('Service Account JSON is required for Vertex AI Full mode');
    }

    throw new Error(`Unsupported Vertex AI authentication mode: ${authMode}`);
}

/**
 * Generates a JWT token for Google Cloud authentication using service account credentials.
 * @param {object} serviceAccount Service account JSON object
 * @returns {Promise<string>} JWT token
 */
export async function generateJWTToken(serviceAccount) {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600; // 1 hour

    const header = {
        alg: 'RS256',
        typ: 'JWT',
    };

    const payload = {
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: expiry,
    };

    const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signatureInput = `${headerBase64}.${payloadBase64}`;

    // Create signature using private key
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signatureInput);
    const signature = sign.sign(serviceAccount.private_key, 'base64url');

    return `${signatureInput}.${signature}`;
}

export async function getAccessToken(jwtToken) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwtToken,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get access token: ${error}`);
    }

    /** @type {any} */
    const data = await response.json();
    return data.access_token;
}

/**
 * Extracts the project ID from a Service Account JSON object.
 * @param {object} serviceAccount Service account JSON object
 * @returns {string} Project ID
 * @throws {Error} If project ID is not found in the service account
 */
export function getProjectIdFromServiceAccount(serviceAccount) {
    if (!serviceAccount || typeof serviceAccount !== 'object') {
        throw new Error('Invalid service account object');
    }

    const projectId = serviceAccount.project_id;
    if (!projectId || typeof projectId !== 'string') {
        throw new Error('Project ID not found in service account JSON');
    }

    return projectId;
}

/**
 * Generates Google API URL and headers based on request configuration
 * @param {express.Request} request Express request object
 * @param {string} model Model name to use
 * @param {string} endpoint API endpoint (default: 'generateContent')
 * @returns {Promise<{url: string, headers: object, apiName: string, baseUrl: string, safetySettings: object[]}>} URL, headers, and API name
 */
export async function getGoogleApiConfig(request, model, endpoint = 'generateContent') {
    const useVertexAi = request.body.api === 'vertexai';
    const region = request.body.vertexai_region || 'us-central1';
    const apiName = useVertexAi ? 'Google Vertex AI' : 'Google AI Studio';
    const safetySettings = [...GEMINI_SAFETY, ...(useVertexAi ? VERTEX_SAFETY : [])];

    let url;
    let baseUrl;
    let headers = {
        'Content-Type': 'application/json',
    };

    if (useVertexAi) {
        // Get authentication for Vertex AI
        const { authHeader, authType } = await getVertexAIAuth(request);

        if (authType === 'express') {
            // Express mode: use API key parameter
            const keyParam = authHeader.replace('Bearer ', '');
            const projectId = request.body.vertexai_express_project_id;
            baseUrl = region === 'global'
                ? 'https://aiplatform.googleapis.com/v1'
                : `https://${region}-aiplatform.googleapis.com/v1`;
            url = projectId
                ? `${baseUrl}/projects/${projectId}/locations/${region}/publishers/google/models/${model}:${endpoint}`
                : `${baseUrl}/publishers/google/models/${model}:${endpoint}`;
            headers['x-goog-api-key'] = keyParam;
        } else if (authType === 'full') {
            // Full mode: use project-specific URL with Authorization header
            // Get project ID from Service Account JSON
            const serviceAccountJson = readSecret(request.user.directories, SECRET_KEYS.VERTEXAI_SERVICE_ACCOUNT);
            if (!serviceAccountJson) {
                throw new Error('Vertex AI Service Account JSON is missing.');
            }

            let projectId;
            try {
                const serviceAccount = JSON.parse(serviceAccountJson);
                projectId = getProjectIdFromServiceAccount(serviceAccount);
            } catch (error) {
                throw new Error('Failed to extract project ID from Service Account JSON.');
            }
            // Handle global region differently - no region prefix in hostname
            baseUrl = region === 'global'
                ? 'https://aiplatform.googleapis.com/v1'
                : `https://${region}-aiplatform.googleapis.com/v1`;
            url = `${baseUrl}/projects/${projectId}/locations/${region}/publishers/google/models/${model}:${endpoint}`;
            headers['Authorization'] = authHeader;
        } else {
            // Proxy mode: use Authorization header
            const apiUrl = trimTrailingSlash(request.body.reverse_proxy || API_VERTEX_AI);
            baseUrl = `${apiUrl}/v1`;
            url = `${baseUrl}/publishers/google/models/${model}:${endpoint}`;
            headers['Authorization'] = authHeader;
        }
    } else {
        // Google AI Studio
        const apiKey = request.body.reverse_proxy ? request.body.proxy_password : readSecret(request.user.directories, SECRET_KEYS.MAKERSUITE);
        const apiUrl = trimTrailingSlash(request.body.reverse_proxy || API_MAKERSUITE);
        const apiVersion = getConfigValue('gemini.apiVersion', 'v1beta');
        baseUrl = `${apiUrl}/${apiVersion}`;
        url = `${baseUrl}/models/${model}:${endpoint}`;
        headers['x-goog-api-key'] = apiKey;
    }

    return { url, headers, apiName, baseUrl, safetySettings };
}

export const router = express.Router();
