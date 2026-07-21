# Mineparser Chrome / Edge extension

This is a Manifest V3 extension and works in both Chromium-based Chrome and Microsoft Edge.

## Development install

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this `extension` directory.
4. Use the toolbar button or `Ctrl+Shift+Space` to open Mineparser.

The extension currently provides the keyboard-first launcher shell. Its storage is isolated in `chrome.storage.local`; the desktop/Web data store is intentionally not read automatically.
