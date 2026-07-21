# 開発手順

## 必要環境

- Node.js 18+
- Rust stable
- WindowsではWebView2とVisual Studio C++ Build Tools

## コマンド

```bash
npm install
npm test
npm run benchmark
npm run tauri dev
npm run tauri build
```

## 動作確認

- `Ctrl+Shift+Space`: Mineparserを呼び出す
- `F6`: コピーのみ / 元のカーソル位置へ貼り付けを選択
- 設定ダイアログでは大文字、スペース、記号、日本語を入力できる
- Windows配布物は`src-tauri/target/release/bundle/`に生成される

## Git運用

このディレクトリ単体をGitリポジトリとして管理します。

リモート：`https://github.com/Mineparser/Mineparser`
