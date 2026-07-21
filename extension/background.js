async function toggleInPage() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
}

chrome.commands.onCommand.addListener(command => { if (command === 'open-mineparser') toggleInPage(); });
chrome.action.onClicked.addListener(toggleInPage);
