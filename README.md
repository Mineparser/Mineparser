# Mineparser (Tauri)

Node.jsサーバーを必要としないMineparserデスクトップ版です。階層データはアプリ内の`localStorage`へ保存します。

## 開発

```bash
npm install
npm test
npm run tauri dev
```

## Windows配布ビルド

```bash
npm run tauri build
```

生成物は`src-tauri/target/release/bundle/`以下に出力されます。
