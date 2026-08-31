# tinycube.vercel.app は何を配っているか（2026-08-31）

**もうアプリは配っていません**（伊波さん「WEB版やめる」）。
いま出しているのは `web/` の2枚だけです。

```
  web/index.html     アプリ版への案内（App Store の直リンク）
  web/privacy.html   プライバシーポリシー
```

## なぜ残したか

**プライバシーポリシーの URL は App Store に登録してあります。**
サイトを止めたとき、ここも一緒に 503 になりました（2026-08-31）。
URL を変えるとストアの登録も直すことになるので、**同じ URL のまま
ポリシーだけ生かす**形にしてあります。

`https://tinycube.vercel.app/privacy.html`

## vercel.json の注意

⚠️ **コメント代わりのキー（`"//"` など）を書いてはいけない。**
Vercel は vercel.json を厳密に検証していて、知らないキーがあると
**デプロイがその場で失敗する**（`should NOT have additional property`）。
2026-08-31 に実際に2回失敗した。説明はこのファイルに書くこと。

- `framework: null` … ダッシュボードの Vite 設定を打ち消して「Other」にする
- `buildCommand: ""` … 空文字は「ビルドしない」の意味
- `installCommand: ""` … 同じく「npm install しない」
- `outputDirectory: "web"` … この中身をそのまま配る

## いつか

会社HP（cubicenginestudio.vercel.app）へ引っ越すのが本来の姿。
そのときはストアに登録した URL も直すこと。
