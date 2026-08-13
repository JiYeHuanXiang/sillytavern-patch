#!/usr/bin/env node
/**
 * Standalone webpack build for the frontend library bundle (public/lib.js).
 *
 * Produces dist/_webpack/<version>/output/lib.js without starting the Express
 * server, so CI (and Docker pre-bake) can assert the build is green. Mirrors
 * the runtime compile that src/middleware/webpack-serve.js performs on boot,
 * but uses forceDist so the output lands under /dist and does not depend on
 * the runtime DATA_ROOT.
 *
 * Exit code is non-zero on compile error so CI can fail the job.
 */
const { default: getWebpackServeMiddleware } = await import('../src/middleware/webpack-serve.js');

const devMiddleware = getWebpackServeMiddleware();
await devMiddleware.runWebpackCompiler({ forceDist: true, pruneCache: true });
console.log('Frontend library build complete.');
