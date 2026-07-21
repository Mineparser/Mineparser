# Mineparser Chrome / Edge extension

This is a Manifest V3 extension and works in both Chromium-based Chrome and Microsoft Edge.

## Development install

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this `extension` directory.
4. Use the toolbar button or `Ctrl+Shift+Space` to open Mineparser.

The extension displays the published Mineparser Web app in an in-page overlay, so its UI and behavior stay aligned with the Web version. It requires network access to `mineparser.github.io`; the Web app keeps its own local storage and the desktop/extension stores remain separate.
