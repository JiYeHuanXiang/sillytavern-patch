import fetch from 'node-fetch';
import { forwardFetchResponse } from '../util.js';
import { assertSafeFetchUrl } from '../url-safety.js';

/**
 * Middleware to proxy requests to a different domain
 * @param {import('express').Request} req Express request object
 * @param {import('express').Response} res Express response object
 */
export default async function corsProxyMiddleware(req, res) {
    const url = req.params.url; // get the url from the request path

    // Disallow circular requests
    const serverUrl = req.protocol + '://' + req.get('host');
    if (url.startsWith(serverUrl)) {
        return res.status(400).send('Circular requests are not allowed');
    }

    // SSRF protection: the CORS proxy has no legitimate local target, so private
    // / loopback / link-local / cloud-metadata destinations are rejected. This
    // also rejects non-http(s) schemes (file:, gopher:, data:, ...).
    try {
        await assertSafeFetchUrl(url, { allowPrivate: false });
    } catch (error) {
        return res.status(400).send(`Blocked by SSRF protection: ${error.message}`);
    }

    try {
        const headers = JSON.parse(JSON.stringify(req.headers));
        const headersToRemove = [
            'x-csrf-token', 'host', 'referer', 'origin', 'cookie',
            'x-forwarded-for', 'x-forwarded-protocol', 'x-forwarded-proto',
            'x-forwarded-host', 'x-real-ip', 'sec-fetch-mode',
            'sec-fetch-site', 'sec-fetch-dest',
        ];

        headersToRemove.forEach(header => delete headers[header]);

        const bodyMethods = ['POST', 'PUT', 'PATCH'];

        const response = await fetch(url, {
            method: req.method,
            headers: headers,
            body: bodyMethods.includes(req.method) ? JSON.stringify(req.body) : undefined,
        });

        // Copy over relevant response params to the proxy response
        await forwardFetchResponse(response, res);
    } catch (error) {
        console.error('Error in CORS proxy middleware:', error);
        if (!res.headersSent) {
            return res.sendStatus(500);
        }
        return res.end();
    }
}
