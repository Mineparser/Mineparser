# Mineparser Chrome / Edge extension

This is a Manifest V3 extension and works in both Chromium-based Chrome and Microsoft Edge.

## Development install

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this `extension` directory.
4. Use the toolbar button or `Ctrl+Shift+Space` to open Mineparser.

The extension displays the published Mineparser Web app in an in-page overlay, so its UI and behavior stay aligned with the Web version. It requires network access to `mineparser.github.io`; the Web app keeps its own local storage and the desktop/extension stores remain separate.

## 使い方（ストアを使わずに導入する場合）

ChromeまたはEdgeの「開発者モード」を使えば、ストアから購入・申請しなくてもこの拡張機能を利用できます。

### 初回インストール

1. このリポジトリをダウンロードするか、Gitで取得します。
2. Chromeで `chrome://extensions`、Edgeで `edge://extensions` を開きます。
3. 右上の **デベロッパーモード／開発者モード** をオンにします。
4. **パッケージ化されていない拡張機能を読み込む／Load unpacked** を選択します。
5. このリポジトリ内の `extension` フォルダを選択します。
6. Mineparserを使いたいページで、拡張機能のアイコンをクリックしてMineparserを開きます。

### 更新するとき

ソースを更新した後、拡張機能の管理画面でMineparserの **再読み込み** ボタンを押してください。変更が反映されない場合は、対象ページも再読み込みします。

### 注意事項

- `extension` フォルダの中に `manifest.json` がある状態で読み込んでください。
- 拡張機能は `mineparser.github.io` にあるWebアプリを読み込むため、初回表示時にネットワーク接続が必要です。
- 登録データはブラウザのローカルストレージに保存され、デスクトップ版とは共有されません。
- ChromeやEdgeを終了しても、拡張機能を削除しない限り登録データは保持されます。
- 「エラー」や「マニフェストが見つからない」と表示された場合は、選択したフォルダが `extension` であることを確認してください。
