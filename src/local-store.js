const STORAGE_KEY = 'mineparser.nodes.v1';

function createLocalStore(storage = window.localStorage) {
  const read = () => JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
  const write = (nodes) => storage.setItem(STORAGE_KEY, JSON.stringify(nodes));
  const node = (id, row) => ({
    id,
    parent_id: id.length ? id.slice(0, -1) : null,
    navLabel: row.navLabel ?? row.nav_label ?? '',
    content: row.content || '',
    contentLength: (row.content || '').length
  });
  const children = (nodes, parent) => Object.entries(nodes)
    .filter(([id]) => id.length === parent.length + 1 && id.startsWith(parent))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, row]) => node(id, row));
  const tree = (nodes) => {
    const result = {};
    Object.entries(nodes).forEach(([id, row]) => {
      result[id] = { navLabel: row.navLabel || '', content: row.content || '',
        contentLength: (row.content || '').length, children: {} };
    });
    Object.keys(nodes).forEach((id) => {
      const parent = id.slice(0, -1);
      if (result[parent]) result[parent].children[id.slice(-1)] = id;
    });
    return result;
  };
  const search = (nodes, query, limit = 100) => {
    const normalized = query.toLowerCase();
    if (!normalized) return [];
    const result = [];
    for (const [id, row] of Object.entries(nodes)) {
      if (`${row.navLabel || ''} ${row.content || ''}`.toLowerCase().includes(normalized)) {
        result.push({ id, navLabel: row.navLabel || '' });
        if (result.length >= limit) break;
      }
    }
    return result;
  };
  return { read, write, node, children, tree, search, key: STORAGE_KEY };
}

globalThis.MineparserLocalStore = { createLocalStore };
