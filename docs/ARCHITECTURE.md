# Mineparser Tauri版の構成

## 全体像

MineparserはTauri 2のデスクトップアプリです。画面はHTML/CSS/JavaScript、OS連携はRustで担当します。

- `src/index.html`: 階層ナビゲーション、検索、設定画面、表示モード
- `src/local-store.js`: `localStorage`ベースの保存・検索・ツリー生成
- `src-tauri/src/lib.rs`: 全画面表示、グローバルショートカット、前面ウィンドウ復帰、貼り付け
- `src-tauri/tauri.conf.json`: ウィンドウ、透過、バンドル設定
- `test/`: ローカルストアと入力制御の回帰テスト

## 貼り付けフロー

1. `Ctrl+Shift+Space`でグローバルショートカットを受け取る
2. Rust側で呼び出し元の前面ウィンドウを記録
3. Mineparserを全画面表示
4. Mode設定が「元のカーソル位置へ貼り付け」の場合、Mineparserを隠す
5. 記録したウィンドウへフォーカスを戻し、`Ctrl+V`を送信

## データ

階層データは`localStorage`の`mineparser.nodes.v1`に保存します。エクスポート/インポートはJSON形式です。
