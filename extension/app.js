const layouts = { qwerty: [['1','2','3','4','5','6','7','8','9','0'],['Q','W','E','R','T','Y','U','I','O','P'],['A','S','D','F','G','H','J','K','L'],['Z','X','C','V','B','N','M']], tenkey: [['1','2','3'],['4','5','6'],['7','8','9'],['0']] };
const keyboard = document.querySelector('#keyboard');
const search = document.querySelector('#search');
const previewLabel = document.querySelector('#previewLabel');
const previewText = document.querySelector('#previewText');
let nodes = {};
let layout = 'qwerty'; let language = 'en'; let selected = null;
document.querySelectorAll('.fkeys [data-action]').forEach(button => button.addEventListener('click', () => {
  const action=button.dataset.action; if(action==='export') document.querySelector('#export').click();
  if(action==='layout') { layout=layout==='qwerty'?'tenkey':'qwerty'; chrome.storage.local.set({layout}); render(); }
  if(action==='settings') settingsDialog.showModal();
}));
document.querySelector('#collapse').onclick=()=>window.close();
const keyId = key => key.toLowerCase();
function render() {
  keyboard.replaceChildren();
  (layouts[layout] || layouts.qwerty).forEach(keys => { const row = document.createElement('div'); row.className = 'row'; keys.forEach(key => {
    const button = document.createElement('button'); button.className = 'key'; button.dataset.key = keyId(key); button.textContent = key;
    const node = nodes[keyId(key)]; const label = document.createElement('span'); label.className = 'label'; label.textContent = node?.navLabel || '[Unassigned]'; button.prepend(label);
    button.addEventListener('click', () => select(keyId(key))); row.append(button);
  }); keyboard.append(row); });
}
function select(key) { selected = key; const node = nodes[key]; previewLabel.textContent = node ? `Nav: ${node.navLabel || 'Unassigned'}` : 'Nav: Unassigned'; previewText.textContent = node?.content || '[Unassigned]'; }
search.addEventListener('input', () => { const q = search.value.toLowerCase(); const found = Object.entries(nodes).find(([,n]) => `${n.navLabel} ${n.content}`.toLowerCase().includes(q)); if (found) select(found[0]); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.close(); const key = e.key.length === 1 ? keyId(e.key.toUpperCase()) : null; if (key && nodes[key]) select(key); });
const settingsDialog = document.querySelector('#settingsDialog');
document.querySelector('#settings').onclick = () => { document.querySelector('#language').value=language; document.querySelector('#layout').value=layout; settingsDialog.showModal(); };
document.querySelector('#saveSettings').onclick = () => { language=document.querySelector('#language').value; layout=document.querySelector('#layout').value; chrome.storage.local.set({language,layout}); render(); };
const editDialog=document.querySelector('#editDialog');
document.querySelector('#edit').onclick=()=>{ if(!selected)return; const n=nodes[selected]||{}; document.querySelector('#editLabel').value=n.navLabel||''; document.querySelector('#editContent').value=n.content||''; editDialog.showModal(); };
document.querySelector('#cancelEdit').onclick=()=>editDialog.close();
document.querySelector('#editForm').onsubmit=e=>{e.preventDefault(); if(!selected)return; nodes[selected]={navLabel:document.querySelector('#editLabel').value,content:document.querySelector('#editContent').value}; chrome.storage.local.set({nodes}); editDialog.close(); render(); select(selected);};
document.querySelector('#export').onclick=()=>{const exported=Object.entries(nodes).map(([id,n])=>({id,parent_id:id.slice(0,-1)||null,nav_label:n.navLabel||'',content:n.content||'',content_length:(n.content||'').length})); const blob=new Blob([JSON.stringify({schema_version:1,nodes:exported},null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='mineparser-export.json'; a.click(); URL.revokeObjectURL(a.href);};
document.querySelector('#import').onchange=async e=>{const file=e.target.files[0]; if(!file)return; try { const data=JSON.parse(await file.text()); const imported={}; if(Array.isArray(data.nodes)) data.nodes.forEach(n=>{const id=String(n.id||'').slice(-1).toLowerCase(); if(id) imported[id]={navLabel:n.navLabel??n.nav_label??'',content:n.content||''};}); else Object.assign(imported,data.nodes||{}); nodes=imported; await chrome.storage.local.set({nodes}); render(); } catch(err) { console.warn('Mineparser import failed',err); } e.target.value='';};
chrome.storage.local.get({ nodes: {}, language: 'en', layout: 'qwerty' }).then(result => { nodes = result.nodes || {}; language=result.language; layout=result.layout; render(); });
