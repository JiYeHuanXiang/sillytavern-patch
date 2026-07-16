import { characterIndex } from '../src/endpoints/character-index.js';
globalThis.DATA_ROOT = process.cwd() + '/data';
const handle = 'default-user';

// Measure the index round-trip cost for 9467 entries: get (hit) vs set (write).
const N = 9467;
const files = Array.from({ length: N }, (_, i) => `dir${i % 50}/char${i}.png`);

// Cold: populate (simulates first-run full parse cost attribution to index writes)
const t0 = process.hrtime.bigint();
for (const f of files) {
    characterIndex.set(handle, f, { mtimeMs: 1.5, size: 100, ctimeMs: 1.0 }, 2.0, { shallow: true, name: 'x', avatar: f });
}
const t1 = process.hrtime.bigint();
console.log('set x9467 ms:', (Number(t1 - t0) / 1e6).toFixed(2));

// Hot: all hits (simulates warm-index list load — only get + fingerprint compare)
const t2 = process.hrtime.bigint();
let hitCount = 0;
for (const f of files) {
    const e = characterIndex.get(handle, f, { mtimeMs: 1.5, size: 100, ctimeMs: 1.0 });
    if (e) hitCount++;
}
const t3 = process.hrtime.bigint();
console.log('get x9467 ms:', (Number(t3 - t2) / 1e6).toFixed(2), 'hits:', hitCount);

await characterIndex.flush();
const fs2 = await import('node:fs');
const p = 'data/_cache/characters-index/default-user.json';
const sz = fs2.statSync(p).size;
console.log('index file bytes:', sz, '(' + (sz / 1024 / 1024).toFixed(1) + ' MB)');
fs2.unlinkSync(p);
