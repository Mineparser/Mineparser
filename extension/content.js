(() => {
  function toggleOverlay() {
    const existing = document.querySelector('mineparser-extension-host');
    if (existing) { existing.remove(); return; }
    const host = document.createElement('mineparser-extension-host');
    host.style.cssText = 'position:fixed;z-index:2147483647;inset:16px auto auto 16px;width:min(94vw,900px);height:min(90vh,760px);border:0;box-shadow:0 18px 60px #0009;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const frame = document.createElement('iframe'); frame.src = chrome.runtime.getURL('web-app.html'); frame.title = 'Mineparser';
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0;border-radius:14px;background:#071326;';
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
