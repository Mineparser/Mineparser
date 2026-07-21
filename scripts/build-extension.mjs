import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const out = path.join(root, 'extension');
let html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const inline = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
if (!inline) throw new Error('Web inline application script not found');
fs.writeFileSync(path.join(out, 'web-app.js'), `${inline[1]}\n`, 'utf8');
html = html.replace(inline[0], '<script src="web-app.js"></script>');
html = html.replace('<body>', '<body class="extension-mode">');
fs.writeFileSync(path.join(out, 'web-app.html'), html, 'utf8');
// Keep the old entry point compatible so manually opening app.html never shows the legacy demo.
fs.writeFileSync(path.join(out, 'app.html'), html, 'utf8');
fs.copyFileSync(path.join(src, 'local-store.js'), path.join(out, 'local-store.js'));
fs.cpSync(path.join(src, 'assets'), path.join(out, 'assets'), { recursive: true });
console.log('Built independent extension Web UI');
