import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../src/local-store.js', import.meta.url), 'utf8');
const context = { window: {}, globalThis: {} };
vm.runInNewContext(source, context);
const createLocalStore = context.globalThis.MineparserLocalStore.createLocalStore;

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('local store saves and reloads nodes', () => {
  const store = createLocalStore(memoryStorage());
  store.write({ a: { navLabel: 'Rust', content: 'fn main() {}' } });
  assert.deepEqual(JSON.parse(JSON.stringify(store.read())), { a: { navLabel: 'Rust', content: 'fn main() {}' } });
});

test('local store builds children and tree mappings', () => {
  const store = createLocalStore(memoryStorage());
  const nodes = {
    a: { navLabel: 'Tools', content: '' },
    ab: { navLabel: 'Rust', content: 'prompt' },
    ac: { navLabel: 'Node', content: '' }
  };
  assert.deepEqual([...store.children(nodes, 'a')].map((node) => node.id), ['ab', 'ac']);
  assert.equal(store.tree(nodes).a.children.b, 'ab');
  assert.equal(store.node('ab', nodes.ab).parent_id, 'a');
  assert.equal(store.node('ab', nodes.ab).contentLength, 6);
  assert.deepEqual([...store.search(nodes, 'rust')].map((node) => node.id), ['ab']);
});
