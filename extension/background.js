async function toggleInPage() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) return;
  if (/^(chrome|edge|about|devtools):\/\//i.test(tab.url)) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
  } catch (error) {
    console.warn('Mineparser cannot open on this page:', error?.message || error);
  }
}

chrome.commands.onCommand.addListener(command => { if (command === 'open-mineparser') toggleInPage(); });
chrome.action.onClicked.addListener(toggleInPage);
