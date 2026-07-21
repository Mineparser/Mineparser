let mineparserWindowId = null;

async function openMineparser() {
  if (mineparserWindowId !== null) {
    try {
      await chrome.windows.update(mineparserWindowId, { focused: true, left: 16, top: 16 });
      return;
    } catch { mineparserWindowId = null; }
  }
  const created = await chrome.windows.create({ url: chrome.runtime.getURL('app.html'), type: 'popup', width: 760, height: 620, left: 16, top: 16, focused: true });
  mineparserWindowId = created.id;
}

chrome.commands.onCommand.addListener(command => { if (command === 'open-mineparser') openMineparser(); });
chrome.windows.onRemoved.addListener(id => { if (id === mineparserWindowId) mineparserWindowId = null; });
