import { characterIndex } from '../src/endpoints/character-index.js';

globalThis.DATA_ROOT = process.cwd() + '/data';
const handle = 'default-user';

characterIndex.set(handle, 'test/char.png', { mtimeMs: 1.5, size: 100, ctimeMs: 1.0 }, 2.0, { shallow: true, name: 'Test', avatar: 'test/char.png' });

const hit = characterIndex.get(handle, 'test/char.png', { mtimeMs: 1.5, size: 100, ctimeMs: 1.0 }, 2.0);
const miss = characterIndex.get(handle, 'test/char.png', { mtimeMs: 9.9, size: 100, ctimeMs: 1.0 }, 2.0);
console.log('hit:', hit && hit.name, '| miss:', miss);

await characterIndex.flush();
const fs = await import('node:fs');
const p = 'data/_cache/characters-index/default-user.json';
console.log('file exists:', fs.existsSync(p), '| contents:', fs.readFileSync(p, 'utf8'));

characterIndex.prune(handle, new Set());
console.log('after prune size:', characterIndex.getStore(handle).size);
await characterIndex.flush();
console.log('after prune file contents:', fs.readFileSync(p, 'utf8'));

fs.unlinkSync(p);
console.log('OK');
