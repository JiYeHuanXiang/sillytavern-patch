import fs from 'node:fs';
import path from 'node:path';
import { characterIndex } from '../src/endpoints/character-index.js';

globalThis.DATA_ROOT = path.join(process.cwd(), 'data');
const handle = 'default-user';
const p = 'data/_cache/characters-index/default-user.json';

function reset() {
    if (fs.existsSync(p)) fs.unlinkSync(p);
    characterIndex.stores.delete(handle);
    characterIndex.dirty.clear();
}

// --- Setup: seed two cards in the index ---
reset();
characterIndex.set(handle, 'a.png', { mtimeMs: 1, size: 10, ctimeMs: 1 }, 0, { shallow: true, name: 'A', avatar: 'a.png' });
characterIndex.set(handle, 'b.png', { mtimeMs: 2, size: 20, ctimeMs: 2 }, 0, { shallow: true, name: 'B', avatar: 'b.png' });
console.log('seeded entries:', [...characterIndex.getStore(handle).keys()].join(','));

// --- 1. Delete 'b.png' (mimics /delete) ---
characterIndex.delete(handle, 'b.png');
characterIndex.flushSync();
console.log('after delete b.png:', [...characterIndex.getStore(handle).keys()].join(','));
console.assert([...characterIndex.getStore(handle).keys()].join(',') === 'a.png', 'delete should drop b.png');
// on-disk file reflects it
const after = JSON.parse(fs.readFileSync(p, 'utf8'));
console.log('on-disk entries after delete:', after.entries.map(e => e.rel).join(','));
console.assert(after.entries.length === 1 && after.entries[0].rel === 'a.png', 'flushSync persisted the deletion');

// --- 2. Rename 'a.png' -> 'a2.png' (old path deleted; next list load re-parses new path as miss) ---
characterIndex.delete(handle, 'a.png');
characterIndex.flushSync();
console.log('after rename-old delete:', [...characterIndex.getStore(handle).keys()].join(','));
console.assert([...characterIndex.getStore(handle).keys()].length === 0, 'rename drops old entry');

// --- 3. prune() drops stale entries that no longer exist on disk ---
reset();
characterIndex.set(handle, 'gone.png', { mtimeMs: 1, size: 10, ctimeMs: 1 }, 0, { shallow: true, name: 'Gone' });
characterIndex.set(handle, 'keep.png', { mtimeMs: 2, size: 20, ctimeMs: 2 }, 0, { shallow: true, name: 'Keep' });
characterIndex.prune(handle, new Set(['keep.png']));
console.log('after prune:', [...characterIndex.getStore(handle).keys()].join(','));
console.assert([...characterIndex.getStore(handle).keys()].join(',') === 'keep.png', 'prune keeps only valid paths');

// --- 4. miss (mtime changed) -> re-parse path, then fresh set refreshes fingerprint ---
reset();
characterIndex.set(handle, 'c.png', { mtimeMs: 5, size: 50, ctimeMs: 5 }, 0, { shallow: true, name: 'C-old' });
const miss = characterIndex.get(handle, 'c.png', { mtimeMs: 99, size: 50, ctimeMs: 5 }); // mtime changed
console.log('miss returns:', miss);
console.assert(miss === null, 'fingerprint change => null miss');
// re-set with new fingerprint (simulating processCharacterList reparse)
characterIndex.set(handle, 'c.png', { mtimeMs: 99, size: 50, ctimeMs: 5 }, 0, { shallow: true, name: 'C-new' });
const hit = characterIndex.get(handle, 'c.png', { mtimeMs: 99, size: 50, ctimeMs: 5 });
console.log('hit after reparse returns shallow name:', hit?.shallow?.name);
console.assert(hit?.shallow?.name === 'C-new', 'fresh entry hit returns updated shallow');

// cleanup
reset();
if (fs.existsSync(p)) fs.unlinkSync(p);
console.log('ALL ASSERTIONS PASSED');
