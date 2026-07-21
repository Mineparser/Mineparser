const rows = [['1','2','3','4','5','6','7','8','9','0'],['Q','W','E','R','T','Y','U','I','O','P'],['A','S','D','F','G','H','J','K','L'],['Z','X','C','V','B','N','M']];
const keyboard = document.querySelector('#keyboard');
const search = document.querySelector('#search');
const previewLabel = document.querySelector('#previewLabel');
const previewText = document.querySelector('#previewText');
let nodes = {};
const keyId = key => key.toLowerCase();
function render() {
  keyboard.replaceChildren();
  rows.forEach(keys => { const row = document.createElement('div'); row.className = 'row'; keys.forEach(key => {
    const button = document.createElement('button'); button.className = 'key'; button.dataset.key = keyId(key); button.textContent = key;
    const node = nodes[keyId(key)]; const label = document.createElement('span'); label.className = 'label'; label.textContent = node?.navLabel || '[Unassigned]'; button.prepend(label);
    button.addEventListener('click', () => select(keyId(key))); row.append(button);
  }); keyboard.append(row); });
}
function select(key) { const node = nodes[key]; previewLabel.textContent = node ? `Nav: ${node.navLabel || 'Unassigned'}` : 'Nav: Unassigned'; previewText.textContent = node?.content || '[Unassigned]'; }
search.addEventListener('input', () => { const q = search.value.toLowerCase(); const found = Object.entries(nodes).find(([,n]) => `${n.navLabel} ${n.content}`.toLowerCase().includes(q)); if (found) select(found[0]); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.close(); const key = e.key.length === 1 ? keyId(e.key.toUpperCase()) : null; if (key && nodes[key]) select(key); });
chrome.storage.local.get({ nodes: {} }).then(result => { nodes = result.nodes || {}; render(); });
