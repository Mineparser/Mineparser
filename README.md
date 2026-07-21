# ✨ Mineparser

<p align="center">
  <img src="src-tauri/icons/icon.png" width="96" alt="Mineparser icon">
</p>

<p align="center">
  <a href="https://github.com/Mineparser/Mineparser/actions/workflows/build.yml"><img src="https://img.shields.io/github/actions/workflow/status/Mineparser/Mineparser/build.yml?style=for-the-badge&logo=github&label=build" alt="Build status"></a>
  <img src="https://img.shields.io/badge/Tauri-2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Rust-stable-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust stable">
  <img src="https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-supported-7C3AED?style=for-the-badge" alt="Supported platforms">
</p>

<p align="center">
  <a href="#クイックスタート">はじめる</a> ·
  <a href="#操作リファレンス">操作を見る</a> ·
  <a href="https://github.com/Mineparser/Mineparser/releases">リリース</a>
</p>

> よく使うプロンプト・コマンド・定型文を、キーボードですばやく呼び出すための Windows 向けデスクトップアプリ。

Mineparser は、登録した文字列を **階層** と **キー操作** で整理し、必要な瞬間に検索・コピーできる Tauri アプリです。作業中のアプリを離れずに起動できるランチャーマーカーを備え、コピーした文字列を元のカーソル位置へ貼り付けることもできます。

<p align="center">
  <strong>Navigate fast. Store locally. Paste anywhere.</strong><br>
  <sub>必要な文字列を、迷わず、すぐに。</sub>
</p>

> **開発状況**: v0.1.0 / 初期開発中  
> Windows・macOS・Linux の CI ビルドに対応しています。データは端末内に保存されます。

> **プラットフォームメモ**: 元のカーソル位置へ自動貼り付ける Windows API 連携は Windows 専用です。macOS／Linux では、現時点ではアプリ本体・検索・コピー・データ管理を利用できます。

## 目次

- [できること](#できること)
- [クイックスタート](#クイックスタート)
- [操作リファレンス](#操作リファレンス)
- [データとバックアップ](#データとバックアップ)
- [開発者向け](#開発者向け)
- [プロジェクト構成](#プロジェクト構成)
- [注意事項](#注意事項)
- [ライセンス](#ライセンス)

## できること

- プロンプト、コマンド、定型文を 3 階層のツリーで管理
- 階層をたどるナビゲーションと、入力による候補検索
- QWERTY 配列とテンキー配列の切り替え
- クリック中心でもキーボード中心でも使える操作設計
- 文字列のクリップボードコピー
- 呼び出し前のウィンドウへ戻って自動貼り付け
- JSON エクスポート／インポートによるバックアップと移行
- 外部サーバー不要のローカル保存
- 透過・常時最前面のコンパクトなランチャーマーカー

## クイックスタート

### 1. 起動する

リリース版は [Releases](https://github.com/Mineparser/Mineparser/releases) から各 OS 向けの成果物を入手できます。現在の CI では次の形式を生成します。

| OS | 生成物の例 |
| --- | --- |
| Windows | `.msi` / `.exe` |
| macOS | `.dmg` / `.app.tar.gz` |
| Linux | `.deb` / `.AppImage` |

### Web版（GitHub Pages）

このリポジトリには、`src/` をそのまま静的サイトとして公開する GitHub Pages 用 workflow も含まれています。`main` または `master` ブランチへ push すると自動デプロイされます。

初回だけ GitHub リポジトリの `Settings` → `Pages` → `Build and deployment` で、`Source` を **GitHub Actions** に設定してください。公開後のURLは通常、次の形式です。

```text
https://<組織名>.github.io/<リポジトリ名>/
```

Web版はブラウザの `localStorage` にデータを保存します。デスクトップ版のグローバルショートカットや元のウィンドウへの自動貼り付けは利用できず、コピー・共有を中心に動作します。

開発版を起動する場合は、[開発者向け](#開発者向け) の手順を実行してください。

### 2. 文字列を登録する

1. Mineparser を起動し、`Ctrl + Shift + Space` で展開します。
2. キーボード上のキーを選択するか、`Ctrl + Alt + 英数字キー` を押します。
3. ナビゲーションラベルと設定文字列を入力して保存します。

### 3. 呼び出して使う

作業中のアプリから Mineparser を展開し、階層を選びます。表示された文字列を `Enter` または `Ctrl + C` で実行すると、選択中のモードに応じてコピーまたは貼り付けが行われます。

## 操作リファレンス

### グローバル操作

| キー | 操作 |
| --- | --- |
| `Ctrl + Shift + Space` | Mineparser を展開／呼び出す |
| `F1` | ヘルプを表示 |
| `F2` | データを JSON でエクスポート |
| `F3` | JSON をインポート |
| `F4` | キーボード配列を切り替え |
| `F5` | 設定を開く |
| `F6` | コピー／貼り付けモードを選択 |

### ナビゲーションと編集

| キー | 操作 |
| --- | --- |
| `Ctrl + K` | 検索欄にフォーカス |
| `↑` / `↓` または `Tab` / `Shift + Tab` | 候補を移動 |
| `Enter` | 選択中の文字列をコピー／貼り付け |
| `Backspace` / `Alt + ←` | ひとつ上の階層へ戻る |
| `Ctrl + Alt + 英数字キー` | 対応キーの設定ダイアログを開く |
| `Ctrl + Shift + N` | 現在の階層のラベルを編集 |
| `Ctrl + Shift + C` | 現在の階層の文字列を編集 |
| `Ctrl + Enter` | 現在の階層のラベルと文字列を編集 |
| `Escape` | ダイアログや候補表示を閉じる |

### コピー／貼り付けモード

`F6` のモード設定から、次の動作を選べます。

| モード | 動作 |
| --- | --- |
| コピーのみ | 文字列をクリップボードへ保存 |
| 元のカーソル位置へ貼り付け | 呼び出し前のウィンドウへ戻り、`Ctrl + V` を送信 |

自動貼り付けを使うときは、Mineparser を呼び出す前に貼り付け先を入力可能な状態にしてください。

## データとバックアップ

登録データはブラウザの `localStorage` に保存され、キーは `mineparser.nodes.v1` です。外部サーバーやデータベースには送信されません。

- **バックアップ**: `F2` で JSON ファイルを書き出す
- **復元・移行**: `F3` で JSON ファイルを読み込む

ブラウザデータやアプリの保存領域を削除すると、エクスポートしていないデータは失われる可能性があります。定期的なバックアップをおすすめします。

## 開発者向け

### 必要環境

- Windows 10 / 11、macOS、または Linux
- Node.js 18 以上
- Rust stable
- WebView2
- Visual Studio C++ Build Tools（Windows の Tauri ビルドに必要）

### セットアップと実行

```bash
npm install
npm test
npm run tauri dev
```

ベンチマークとリリースビルド:

```bash
npm run benchmark
npm run tauri build
```

ビルド成果物は `src-tauri/target/release/bundle/` に出力されます。GitHub Actions では OS ごとのランナー上でテストとビルドを実行し、成果物をアーティファクトとして保存します。

ローカルでのビルドは、基本的に **ビルドしたい OS 上で** 実行してください。Tauri のネイティブバンドル（特に macOS の `.dmg` と Linux の `.deb`／`.AppImage`）は、各 OS のランナーで作るのが安全です。

詳細は [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) と [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を参照してください。
各実装の対応状況は [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md) にまとめています。

## プロジェクト構成

```text
TUARI_Mineparser/
├─ src/
│  ├─ index.html       # UI、階層ナビゲーション、検索、各種ショートカット
│  └─ local-store.js   # localStorage 保存・検索・ツリー生成
├─ src-tauri/
│  └─ src/lib.rs       # ウィンドウ制御、グローバルショートカット、貼り付け
├─ test/                # ローカルストアと入力制御のテスト
├─ extension/           # Chrome / Edge Manifest V3 拡張機能
└─ docs/                # 開発手順とアーキテクチャ
```

## Chrome / Edge 拡張機能

`extension/` はChromeとMicrosoft Edgeで共通利用できるManifest V3版です。検索、キーボードナビ、設定保存、QWERTY／テンキー切替、項目編集、JSON入出力に対応しています。

`chrome://extensions` または `edge://extensions` で開発者モードを有効にし、「パッケージ化されていない拡張機能を読み込む」から `extension/` を選択してください。拡張機能の保存領域はデスクトップ版・Web版とは分離されています。

## 注意事項

保存データは現在暗号化されていません。API キーや個人情報などの機密情報を登録する場合は、端末のアクセス権限と JSON バックアップの保管場所に注意してください。

## ライセンス

ライセンスは現在準備中です。公開利用・再配布については、正式なライセンスが追加されるまでプロジェクト管理者へ確認してください。

## リポジトリ

[github.com/Mineparser/Mineparser](https://github.com/Mineparser/Mineparser)
