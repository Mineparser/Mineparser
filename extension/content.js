(() => {
  function toggleOverlay() {
    const existing = document.querySelector('mineparser-extension-host');
    if (existing) { existing.remove(); return; }
    const host = document.createElement('mineparser-extension-host');
    host.style.cssText = 'position:fixed;z-index:2147483647;inset:0;width:100vw;height:100vh;border:0;pointer-events:auto;background:transparent;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const frame = document.createElement('iframe'); frame.src = chrome.runtime.getURL('web-app.html?extension=1'); frame.title = 'Mineparser';
    frame.setAttribute('allowtransparency', 'true');
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:rgba(0,0,0,0);color-scheme:normal;';
    shadow.append(frame); document.documentElement.append(host);
    window.addEventListener('message', event => { if (event.data?.type === 'mineparser-close') host.remove(); }, { once: true });
  }
  chrome.runtime.onMessage.addListener(message => { if (message?.type === 'toggle-overlay') toggleOverlay(); });
  window.addEventListener('keydown', event => {
    if (event.ctrlKey && event.shiftKey && event.code === 'Space' && !event.altKey && !event.metaKey) {
      event.preventDefault(); event.stopPropagation(); toggleOverlay();
    }
  }, true);
})();
