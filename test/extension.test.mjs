import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, 'extension', name), 'utf8');

test('Chromium extension manifest and required entry points are valid', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.action.default_popup, undefined);
  assert.ok(manifest.commands['open-mineparser']);
  for (const file of ['app.html', 'app.css', 'app.js', 'background.js', 'overlay.js', 'content.js']) assert.ok(fs.existsSync(path.join(root, 'extension', file)));
});

test('extension UI exposes persistence, editing, layout, and data transfer controls', () => {
  const html = read('app.html');
  const js = read('app.js');
  for (const id of ['search', 'settings', 'edit', 'export', 'import', 'keyboard']) assert.match(html, new RegExp(`id=["']${id}["']`));
  for (const token of ['chrome.storage.local', 'showModal', 'JSON.stringify', 'JSON.parse', 'layouts']) assert.match(js, new RegExp(token.replace('.', '\\.' )));
  assert.match(read('background.js'), /chrome\.scripting\.executeScript/);
  assert.match(read('background.js'), /chrome\|edge\|about\|devtools/);
  assert.match(read('overlay.js'), /mineparser-extension-host/);
  assert.match(read('overlay.js'), /web-app\.html/);
  assert.match(read('content.js'), /event\.code === 'Space'/);
  assert.match(js, /matches\('input, textarea, select/);
});

test('extension bundle contains an independent copy of the Web app', () => {
  assert.ok(fs.existsSync(path.join(root, 'extension', 'web-app.html')));
  assert.ok(fs.existsSync(path.join(root, 'extension', 'web-app.js')));
  assert.match(read('web-app.html'), /<script src="web-app\.js"><\/script>/);
});
