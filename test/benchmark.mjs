import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/local-store.js', import.meta.url), 'utf8');
const context = { window: {}, globalThis: {} };
vm.runInNewContext(source, context);
const store = context.globalThis.MineparserLocalStore.createLocalStore({ getItem: () => null, setItem: () => {} });
const nodes = {};
for (let i = 0; i < 10000; i++) {
  const parent = String.fromCharCode(97 + (i % 26));
  nodes[`${parent}${String(i).padStart(4, '0')}`] = { navLabel: `Node ${i}`, content: `Content ${i}` };
}
const measure = (label, fn) => {
  const start = performance.now();
  for (let i = 0; i < 100; i++) fn();
  console.log(`${label}: ${((performance.now() - start) / 100).toFixed(3)} ms/op`);
};
console.log(`nodes: ${Object.keys(nodes).length}`);
measure('children', () => store.children(nodes, 'a'));
measure('tree', () => store.tree(nodes));
measure('search', () => store.search(nodes, 'content 9999'));
