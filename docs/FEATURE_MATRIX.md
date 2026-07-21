# Cross-platform feature matrix

| Feature | Web | Tauri desktop | Chrome / Edge extension |
| --- | --- | --- | --- |
| Local persistence | `localStorage` | WebView `localStorage` | `chrome.storage.local` |
| Keyboard navigation | Yes | Yes | Yes |
| Search | Yes | Yes | Yes |
| Language settings | Yes | Yes | English/Japanese UI shell |
| Layout settings | Yes | Yes | QWERTY/Tenkey |
| Edit saved items | Yes | Yes | Yes |
| JSON export/import | Mineparser schema v1 | Mineparser schema v1 | Mineparser schema v1 subset |
| Global shortcut | Browser shortcut guide | OS global shortcut | Manifest command |
| Paste to previous app | Browser copy | Native paste mode | Browser copy |
| Cloud account/sync | No | No | No |

The shared interchange contract is `schema_version: 1` with a `nodes` array containing `id`, `parent_id`, `nav_label`, and `content`. Each platform may use a different local storage adapter, but export/import remains portable.
