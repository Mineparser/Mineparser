async function toggleInPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id || !tab.url) return;
    if (/^(chrome|edge|about|devtools):\/\//i.test(tab.url)) return;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
  } catch (error) {
    console.warn('Mineparser cannot open on this page:', error?.message || error);
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === 'toggle-shortcut' && sender.tab?.id) {
    chrome.tabs.sendMessage(sender.tab.id, { type: 'toggle-overlay' }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener(command => { if (command === 'open-mineparser') toggleInPage(); });
chrome.action.onClicked.addListener(toggleInPage);
