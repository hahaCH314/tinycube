# Windows のシオンから、Mac のシオンへ — iOS 対応の引き継ぎ（2026-08-21）

こんにちは。同じシオンだけど、私は Windows 側にいて **iOS のビルドを一度も走らせられない**。
だからこの手紙にあることは、**全部「書いただけ」で未検証**だと思って読んでほしい。
Xcode が通るまでは何も確かめられていない。そこはあなたの仕事になる。

伊波さんは応援してくれている人から Mac をもらった（ノート）。それでこの話が動き出した。

---

## 1. まず知っておくこと

| 項目 | 中身 |
|---|---|
| ソース | `E:\cmcube\916cube`（**CMCUBE のリポジトリの中に同居している**） |
| いまの版 | v1.4.7 / versionCode 47（Android） |
| 土台 | Capacitor 8 + React 19 + Vite |
| appId | `com.cubicenginestudio.tinycube` |
| `ios/` | **まだ無い。** ここからが本題 |

⚠️ **`916cube` が CMCUBE の中にあることに戸惑わないこと。** 私は最初これで探し回った。
tinyCUBE のつもりで `E:\916cube` を見に行くと無い。

---

## 2. 課金は、コードを触らなくていい

`src/billing.ts` は **すでに iOS を見ている**。

```ts
export function isApple(): boolean {
  return (window as any).Capacitor?.getPlatform?.() === 'ios';
}
// ...
const platform = isApple() ? cdv.Platform.APPLE_APPSTORE : cdv.Platform.GOOGLE_PLAY;
```

- 商品 ID は **`tinycube_unlock_all`**、両ストアで同じでよい
- 種類は NON_CONSUMABLE（買い切り）
- 値段は **¥300**。フレーム53枚と透かし消しが一度に解ける

やることは **App Store Connect で同じ ID の商品を作るだけ**。これは伊波さんの作業。

⚠️ `billing.ts` の冒頭コメントは「¥300」で正しい。
私は一度「¥500」と言って伊波さんに直された。**¥300 が正**。

---

## 3. いちばんの山 — Gallery の Swift 版

Android には自前のネイティブプラグインがある。
`android/app/src/main/java/com/cubicenginestudio/tinycube/GalleryPlugin.java`

**なぜ自前で書いたかを必ず読んでほしい**（そのファイルの冒頭コメント）。要約すると：

- `@capacitor-community/media` は `READ_MEDIA_IMAGES`（**他人の写真も読む**権限）を要求する
- 保存だけなら要らない権限なのに、宣言すると Play が「19,037台が対象外」と警告した
- 権限を外すとプラグインが動かず共有シートに落ちる → 板挟み
- Android 10 以降は MediaStore に自分で書けば**権限が要らない**。だから自分で書いた

⚠️ **この思想を iOS でも守ること。** iOS にも同じ分かれ道がある。

- `.readWrite` … 写真アプリを全部読める。**使わない**
- `.addOnly` … 入れることしかできない。**こちらを使う**

Swift 版は**書いてある**。ただし置き場所が未決なので、この手紙と一緒に
`docs/ios-src/GalleryPlugin.swift` に置いた。`npx cap add ios` のあと
`ios/App/App/` へコピーしてほしい。

⚠️ **私はこの Swift を一度もコンパイルしていない。** 型が合わない、
API 名が違う、といったことは十分あり得る。疑ってかかって。

---

## 4. まだ書けていない3つ

### (a) Info.plist の説明文

**無いと、その機能を使った瞬間にアプリごと落ちる。** 起動時ではなく使った瞬間なので、
**子どもが遊んでいる最中に落ちる**形になる。ここは確実に潰したい。

| キー | 何に要るか |
|---|---|
| `NSCameraUsageDescription` | カメラ（`App.tsx` の `getUserMedia`） |
| `NSMicrophoneUsageDescription` | マイク（`recorder.ts` の `getUserMedia`。**忘れやすい**） |
| `NSPhotoLibraryAddUsageDescription` | 写真への追加（Gallery） |

⚠️ **`NSPhotoLibraryUsageDescription`（読み取り側）は書かないこと。**
書くと審査で「なぜ読む必要が？」と問われる。addOnly には要らない。

文言は子どもが読むものとして選びたい。伊波さんと相談してほしい。

### (b) WKWebView の設定 — Android の `MainActivity.java` にあたるもの

`MainActivity.java` の冒頭コメントを読んでほしい。**「WebView が既定で断る」**という罠を
Android で踏んでいる。ユーザーが許可したあとでも `getUserMedia` が `NotAllowedError` になった。

iOS にも似たものがある。特に：

- **インライン再生**（`allowsInlineMediaPlayback`）。無いと動画が全画面で開いてしまう
- **ユーザー操作なしの再生**（`mediaTypesRequiringUserActionForPlayback = []`）

Capacitor の設定で足りるのか、`AppDelegate` に手を入れるのかは**実機で確かめて**ほしい。

### (c) `@capacitor/ios` を入れる

`package.json` には `@capacitor/android` しかない。

```
npm i @capacitor/ios
npx cap add ios
npm run build && npx cap sync ios
```

⚠️ Windows では `cap add ios` は通らない（CocoaPods が要る）。だから私はここで止まった。

---

## 5. iOS 版を出すと、何が良くなるか

`docs` ではなく手紙（`E:\syunp_data\Desktop\cmcube&tinycube\手紙\2026-08-16_iPhoneのテスターへ_メール文面.txt`）に
書いてあることだけど、大事なので写しておく。

いま iPhone の人には **Web 版（tinycube.vercel.app）を案内している**。
そこには制限があって、8/16 の時点で私はこう書いていた：

- 動画の保存が「共有」経由になる（Android より一手多い）
- プリクラ帳は Safari の履歴を消すと消える

**ネイティブ版を出すと、この2つが両方消える。** 動画は Gallery で直接アルバムに入るし、
プリクラ帳は WKWebView の保存領域になるので履歴消去では消えない。
「iOS 対応」が何のためかは、ここに書いてある。

---

## 6. Android で踏んだ罠（同じものが iOS にもあるかもしれない）

- **権限は最小に。** 宣言した権限のぶんだけ、入れられない端末が増える
- **WebView は既定で断る。** アプリ側で許可を取っただけでは映像が来ない
- **絵のサイズを測るときは `onload` を使わない。`decode()` を使う。**
  `onload` は**すでに読めている絵では発火しないことがある**。
  これで v1.4.5 → v1.4.7 と3回続けて同じ罠を踏んだ（プリクラ帳の向き）
- **描画ループは止めるな、休ませろ。** 止めると静止画のまま戻ってこない
- **CSS は `setup.css` だけが効く。`App.css` は読み込まれていない**（3回ハマった）

---

## 7. まだ終わっていない別件（iOS とは別）

### メールアドレス — **これは片付いた**

`916cube/public/privacy.html:136` が `syunpoo419@gmail.com` のままだった。
`cubicenginestudio@icloud.com` に変えた。これで3サイト揃っている。

⚠️ **`npx cap sync` を忘れずに。** 同じ privacy.html が
`android/app/src/main/assets/public/` にもコピーされている。原本を直しただけでは
アプリの中身は古いまま。

### 「無料のアプリ」の表記 — **直した**

`hp/src/content.ts`（CMCUBE の HP）で tinyCUBE を「無料のアプリ」と呼んでいた。
¥300 の買い切りがあるので実態とズレていた。日本語版・英語版とも
**「無料ではじめられます」/「Free to start」**に変えた。リンクの文字からも「無料」を外した。

⚠️ **まだデプロイしていない。** 直したのはソースだけ。

### ロゴの差し替え — **会社HPは済んでいた。残りは iOS と一緒に**

新しいロゴ（ヒマワリが 8/19 に引き継いだもの）：
`C:\Users\syunp\.gemini\antigravity-ide\brain\0b7d2fbc-e69b-46f0-9844-717c832ac00a\studio_logo_pop_3d_dark_text_1787098234666.jpg`

**会社HP（`E:\CUBICENGINEstudio\hp`）には既に入っている。** `public/logo-dark.jpg` が
8/19 15:51 更新で、`src/app/LogoBurst.tsx` が読んでいる。私は一度「未着手」と
書いてしまったが、前の私が同じ日に組み込み終えていた。

⚠️ **`LogoBurst.tsx` の冒頭コメントを必ず読むこと。** 透過は3通り試して
全部駄目だったと書いてある（閾値だと文字の下に黒い帯、明るさから作ると
文字の周りに霧）。**黒背景版は透過せずに黒のまま使う**のが結論。
社名は画像から切ってあり、h1 の見出しが受け持っている。

伊波さんは「ぜんぶやる」（会社HP・CMCUBE の HP・tinyCUBE）と言っている。残りは2つ：

- **CMCUBE の HP** … そもそもロゴを置く場所があるか未確認
- **tinyCUBE のアイコン** … ⚠️ **いま単独でやらないこと。** Play で v1.4.7 が
  動いている最中にアイコンを変えると掲載情報の更新と審査待ちが要る。
  しかも **iOS 用は 1024x1024 が要る**（Play 用は 512、`store/play-icon-512.png`）。
  **iOS のアイコンを作るときに、まとめてやるのが二度手間にならない。**
  文字入りのままではホーム画面で潰れるので、キューブの部分だけ切り出すこと。

---

## 8. 伊波さんについて

- コードは書かない。アイデアとディレクションの人
- **推測で「確認しました」と言わないこと。** 売り物なので特に。
  実機で見た伊波さんの言うことが正しい。私が手元で再現して「直った」と書いた
  v1.4.7 も、伊波さんには「直ってない」と見えた
- 一度に出す量は絞る。結論を先に、表は1つまで
- 検証は大事だけど、検品レポートみたいな口調にはしない

Mac が来たのは、応援してくれている人からの贈り物。
そこから iOS 対応が始まる、というのは、ちょっといい話だと思う。

—— Windows のシオンより
