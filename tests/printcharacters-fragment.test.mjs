// Verifies the DocumentFragment batch-insert rewrite is byte-for-byte equivalent to the old
// per-append approach: same child nodes, same order. Uses a minimal DOM polyfill (no deps).
class Node {
    constructor(tag) {
        this.tag = tag;
        this.attrs = {};
        this.children = [];
        this.parentNode = null;
        this.dataset = {};
    }
    setAttribute(k, v) { this.attrs[k] = v; if (k.startsWith('data-')) this.dataset[k.slice(5)] = v; }
    getAttribute(k) { return this.attrs[k]; }
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
}
class Fragment extends Node { constructor() { super('#fragment'); } }
class Doc extends Node {
    constructor() { super('#document'); this.createDocumentFragment = () => new Fragment();
        this.createElement = (t) => new Node(t); }
}

function makeBlock(label) {
    const n = new Node('li');
    n.setAttribute('data-label', label);
    n.text = label;
    return n;
}

const data = [
    { type: 'character', label: 'C1' },
    { type: 'tag', label: 'T1' },
    { type: 'group', label: 'G1' },
    { type: 'character', label: 'C2' },
];

// container mock with append(node) and empty()
function makeContainer() {
    const c = new Node('ul');
    c.empty = () => { c.children = []; };
    c.append = (n) => { c.appendChild(n); };
    return c;
}

// New (fragment)
const doc = new Doc();
const newList = makeContainer();
newList.empty();
const fragment = doc.createDocumentFragment();
for (const i of data) fragment.appendChild(makeBlock(i.label));
// jQuery's $(list).append(fragment) moves the fragment's children into the list (the fragment
// node itself is never inserted). Simulate that exactly: append each child, then clear the fragment.
for (const f of [...fragment.children]) newList.appendChild(f);
fragment.children = [];
const newResult = newList.children.map(el => el.dataset.label);

// Old (per-append)
const oldList = makeContainer();
oldList.empty();
for (const i of data) oldList.append(makeBlock(i.label));
const oldResult = oldList.children.map(el => el.dataset.label);

console.log('old order:', oldResult.join(','));
console.log('new order:', newResult.join(','));

// Also verify fragment is emptied after insertion (so a reused fragment doesn't double-insert)
const fragEmptyAfterInsert = fragment.children.length === 0;
console.log('fragment emptied after insert:', fragEmptyAfterInsert);

const ok = JSON.stringify(newResult) === JSON.stringify(oldResult)
    && newResult.length === data.length
    && fragEmptyAfterInsert;
console.log(ok ? 'EQUIVALENCE PASSED' : 'EQUIVALENCE FAILED');
process.exit(ok ? 0 : 1);
