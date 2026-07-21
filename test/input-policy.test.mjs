import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');

test('設定ダイアログの内容欄・ラベル欄はスペースと大文字をブロックしない', () => {
  const contentHandler = html.slice(html.indexOf('const bindContentInputEl'), html.indexOf('// ダイアログ・ラベル欄'));
  const labelHandler = html.slice(html.indexOf('const bindNavLabelInputEl'), html.indexOf('// 入力欄・テキストエリアかどうか'));
  assert.doesNotMatch(contentHandler, /e\.key === ['"] ['"]\)[\s\S]*e\.preventDefault/);
  assert.doesNotMatch(labelHandler, /e\.key === ['"] ['"]\)[\s\S]*e\.preventDefault/);
  assert.doesNotMatch(contentHandler, /isSearchCharAllowed\(e\.key\)/);
  assert.doesNotMatch(labelHandler, /isSearchCharAllowed\(e\.key\)/);
});
