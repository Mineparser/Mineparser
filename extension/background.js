chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-mineparser') return;
  await chrome.windows.create({ url: chrome.runtime.getURL('app.html'), type: 'popup', width: 760, height: 620 });
});
