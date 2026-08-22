# App Store に出すまでの手順（2026-08-21）

Google Play 版の `docs/play-release-checklist.md` と同じ形で、伊波さんが自分で
進められるように書いた。**上から順に**。

---

## ⏭ 次にやること：課金商品の審査用スクリーンショット

**App Store Connect へのアップロードは 2026-08-21 に成功済み。**
残っているのは、課金商品 `tinycube_unlock_all` が `MISSING_METADATA` から
抜けるための「購入画面が写った写真」1枚だけ。

⚠️ **これはシオンが撮れない。** シミュレータをタップできないため、
購入画面まで進む操作は伊波さんにお願いすることになる。

## 0. いまどこまで済んでいるか（2026-08-21 時点）

- [x] Apple Developer Program 登録（伊波さん・登録済み）
- [x] Mac に Node v24.19.0 導入（`~/.local/node`。管理者パスワード不要な入れ方）
- [x] `npm ci` → **Web ビルドが Mac で通ることを確認**
- [x] `@capacitor/ios` 導入・`npx cap add ios` 成功
- [x] **課金プラグインが SPM で組み込まれた**（CocoaPods は要らなかった。下の「覚えておくこと」参照）
- [x] `Info.plist` にカメラ・マイク・写真保存の説明文を追加
- [x] **保存の iOS 版を実装**（`ios/App/App/GalleryPlugin.swift`）
- [x] アプリアイコンを tinyCUBE のものに差し替え（1024×1024・透過なし）
- [x] バージョンを Android とそろえた（`MARKETING_VERSION = 1.4.7`）
- [x] iOS プラットフォーム（8.5GB）のダウンロード
- [x] **ビルドが通ることを確認**（シミュレータ向け、exit 0）
- [x] **シミュレータで起動して「はじめに」画面が出ることを確認**
- [x] **課金プラグインが StoreKit に繋がることを確認**（`InAppPurchase load [tinycube_unlock_all]` が飛んでいる）
- [x] **カメラが動くことを確認**（`getUserMedia` 成功。`capacitor://localhost` はポート無しなので secure context が成立）
- [x] **保存が写真アプリに直接入ることを確認**（`GalleryPlugin.swift` が本物の写真IDを返した）
- [x] **Xcode に Apple ID をログイン**（チーム D8497HKMK7 / iha kanako）
- [x] **アプリIDを登録**（In-App Purchase も既定で有効だった）
- [x] **配布用証明書を作成**（Apple Distribution / 2027-08-21まで）
- [x] **App Store 用プロファイルを作成**（実機不要）
- [x] **Archive 成功 → App.ipa 39MB**
- [x] **検証・アップロード成功**（VERIFY / UPLOAD SUCCEEDED, no errors）
- [x] **App Store Connect にアプリを登録**（tinyCUBE　プリクラカメラ / App ID 6803792204）
- [x] **課金商品 `tinycube_unlock_all` を登録**（¥300・非消耗型・日本語説明つき）
- [ ] **課金商品の審査用スクリーンショット** ← いまここ
- [ ] ストア掲載情報（スクショ・説明文・プライバシーポリシー・年齢レーティング）
- [ ] TestFlight で実機確認（カメラ・課金）
- [ ] 審査へ提出

---

## 1. ビルドが通るか確かめる

ダウンロードが終わったら：

```sh
cd ~/Downloads/cmcube/916cube
npm run build
npx cap sync ios
open ios/App/App.xcodeproj
```

Xcode が開いたら、左上の実行先で iPhone のシミュレータを選んで ▶ を押す。

⚠️ **シミュレータにはカメラが無い。** カメラの画面は真っ黒か、
「カメラが使えません」になるのが正常。カメラの確認は TestFlight で行う
（Xcode 16 以降なら `SimulatorCamera` で Mac のカメラを挿す手もある）。

---

## 2. 署名（チーム）を設定する

Xcode で **App プロジェクト → Signing & Capabilities**：

| 項目 | 値 |
|---|---|
| Automatically manage signing | ✅ チェックを入れる |
| Team | CUBICENGINEstudio（Apple Developer のチーム） |
| Bundle Identifier | `com.cubicenginestudio.tinycube` ← Android と同じでよい |

同じ画面の **＋ Capability** から **In-App Purchase** を足す。
**これが無いと課金が動かない。**

---

## 3. App Store Connect にアプリを登録

https://appstoreconnect.apple.com → マイApp → ＋

| 項目 | 値 |
|---|---|
| プラットフォーム | iOS |
| 名前 | tinyCUBE |
| プライマリ言語 | 日本語 |
| バンドルID | `com.cubicenginestudio.tinycube` |
| SKU | `tinycube`（何でもよい。あとから変えられない） |

---

## 4. 課金商品を登録する

「App内課金」→「＋」→ **非消耗型**

| 項目 | 値 |
|---|---|
| **製品ID** | `tinycube_unlock_all` ← **一字一句このとおり。Android と同じ** |
| 参照名 | ぜんぶ使えるようにする |
| 価格 | ¥300（Play と同じ） |

⚠️ Play のときと同じで、**商品を作る前にビルドを1本アップロードしておく**必要がある
場合がある。弾かれたら先に 5 をやること。

⚠️ **審査には「購入の復元」ボタンが要る**（ガイドライン 3.1.1）。
これは既に `src/App.tsx` に実装済み（`unlock-restore` のボタン）。消さないこと。

---

## 5. ビルドをアップロードする

Xcode で実行先を **Any iOS Device** にして、
**Product → Archive** → Organizer が開く → **Distribute App** →
**App Store Connect** → Upload。

⚠️ `CURRENT_PROJECT_VERSION`（ビルド番号）は**アップロードのたびに1つ増やす**こと。
同じ番号だと Apple が受け取らない。Android の `versionCode` と同じ考え方。

---

## 6. TestFlight で実機を確認する

**iPhone を持っていないので、ここは人に頼む。**

App Store Connect → TestFlight → 内部テスター（または外部テスター）に
iPhone を持っている人を追加する。確かめてもらうこと：

- [ ] **カメラが映るか**（一番大事。ここだけは実機でしか分からない）
- [ ] マイクの音が動画に入るか
- [ ] **保存が写真アプリに直接入るか**（共有シートが出たら `GalleryPlugin.swift` が失敗している）
- [ ] ¥300 が買えるか・買い直しにならないか
- [ ] 「購入を復元」が効くか

---

## 7. 審査へ出す

必要なもの：

- [ ] スクリーンショット（6.7インチ iPhone は必須）
- [ ] 説明文・キーワード
- [ ] **プライバシーポリシーのURL**（ヒマワリさんが日英併記版を用意済み）
- [ ] **Appのプライバシー** → tinyCUBE は外に何も送らないので
      **「データを収集しない」** を選ぶだけ
- [ ] 年齢レーティング
- [ ] **審査用メモ（Notes for Reviewer）** ← ヒマワリさん推奨の文面：

  > 本アプリは完全ローカル完結型のカメラ＆動画編集アプリであり、
  > 120枚以上の独自測定フレームとオフライン録画機能を備えたネイティブ体験を
  > 提供しています。撮影したデータは一切外部送信されません。

---

## 覚えておくこと

### CocoaPods は要らない（2026-08-21 に判明）

事前調査では「`cordova-plugin-purchase` が SPM 非対応 → CocoaPods が必要 →
でも macOS の Ruby 2.6 では CocoaPods が入らない」と詰みかけていた。

実際に試したら、**Capacitor 8.5.0 が Cordova プラグイン用の `Package.swift` を
自動生成して、SPM のまま組み込んでくれた**。CocoaPods を入れる必要は無い。

### 保存が iOS だけ別実装になっている理由

`src/save.ts` は `registerPlugin('Gallery')` で Android と iOS の両方を同じ名前で呼ぶ。
中身は別々：

| | 実装 |
|---|---|
| Android | `android/app/src/main/java/.../GalleryPlugin.java`（MediaStore） |
| iOS | `ios/App/App/GalleryPlugin.swift`（PHPhotoLibrary） |

**引数と返り値をそろえること**（`{data, name, isVideo}` → `{uri}`）。
片方だけ変えると、もう片方が黙って共有シートに落ちる。

### iOS ではアルバムを作らない

Android 版は写真アプリに "tinyCUBE" フォルダを作るが、**iOS では作らない**。
アルバムを作るには読み取り権限（`NSPhotoLibraryUsageDescription`）が要り、
それは「他人の写真も全部読む」権限だから。保存だけなら `.addOnly` で足りる。
Android で権限を足して二度つまずいた教訓を iOS でも守っている。

### アイコンは透過があると弾かれる

App Store は**アルファチャンネルのあるアイコンを受け取らない**。
`public/favicon.svg` は角丸（`rx="120"`）なので、そのまま焼くと角が透ける。
iOS 用は `rx="0"` にして四角く焼き、アルファを落としてある
（丸くするのは iOS 側がやる）。焼き直すときは `tools/icons.mjs` の
`maskable` と同じ扱いにすること。


---

## ⚠️ iOS で二度はまらないための覚え書き（2026-08-21）

自前プラグイン（`GalleryPlugin.swift`）を動かすまでに、**黙って失敗する罠を2つ**踏んだ。
どちらもエラーが出ず、保存だけが `"Gallery" plugin is not implemented on ios` で落ちる。

### 罠1：画面を作っているのは storyboard ではない

`ios/App/App/SceneDelegate.swift` が

```swift
window?.rootViewController = MainViewController()
```

とコードで直接作っている。`Main.storyboard` の Custom Class を直しても**効かない**。
両方 `MainViewController` に向けること。

### 罠2：`registerPluginType` は既定では何もしない

Capacitor の実装がこうなっている：

```swift
public func registerPluginType(_ pluginType: CAPPlugin.Type) {
    if autoRegisterPlugins { return }   // ← 既定は true なのでここで帰る
    ...
}
```

**`registerPluginInstance(GalleryPlugin())` を使うこと。**
こちらには門番が無く、`JSExport.exportJS` まで走るので WebView 側にも見えるようになる。

### なぜ `packageClassList` に足してはいけないか

`ios/App/App/capacitor.config.json` の `packageClassList` に `GalleryPlugin` を
書き足せば動くが、**このファイルは `npx cap sync` が作り直すので消える**。
アプリの中に置いた自前プラグインは `MainViewController.capacitorDidLoad()` から
登録するのが正しい。

### 動作確認のやり方（プラグインが本当に生えているか）

ビルド成果物の `App.app/public/index.html` に調べる用の script を差し込んで
（**リポジトリの `index.html` は触らない**）、こう出れば通っている：

```
⚡️  [log] - PROBE headers=[...,Share,Gallery]      ← Gallery が居る
⚡️  To Native ->  Gallery save 64402574             ← ネイティブに届いた
⚡️  [log] - PROBE gallery=OK {"uri":"EDDBF7E1-.../L0/001"}   ← 写真が入った
```

ログの見方：

```sh
xcrun simctl launch --console-pty <シミュレータのID> com.cubicenginestudio.tinycube
```

写真の許可はコマンドでも与えられる（ダイアログを押さずに済む）：

```sh
xcrun simctl privacy <シミュレータのID> grant photos-add com.cubicenginestudio.tinycube
```


---

## ⚠️ 実機が1台も無いと自動署名は詰む（2026-08-21）

いちばん時間を取られたところ。**iPhone を持っていない人がハマる罠。**

### 何が起きるか

Archive しようとすると必ずここで止まる：

```
error: Communication with Apple failed: Your team has no devices from which
       to generate a provisioning profile.
error: No profiles for 'com.cubicenginestudio.tinycube' were found:
       Xcode couldn't find any iOS App Development provisioning profiles
```

自動署名は Archive のときに **開発用（Development）のプロファイル**を作ろうとする。
それは実機が1台以上登録されていないと作れない。以下は**全部だめだった**：

- `-destination` の指定を変える
- `-configuration Release` を明示する
- `-destination` を外す
- App Store Connect の API キーを渡す

### 回り込み方

**配布用（App Store）のプロファイルは実機が要らない。** 手動署名でそちらを指す。

```
CODE_SIGN_STYLE                = Manual
CODE_SIGN_IDENTITY             = Apple Distribution
PROVISIONING_PROFILE_SPECIFIER = tinyCUBE App Store
```

Release だけ手動にすること。Debug を自動のまま残せば、シミュレータでの
動作確認はこれまでどおり動く。

### API キーで Apple に直接話しかける

証明書もプロファイルも、画面を触らずに作れる。`tools/` には入れていないので
必要になったらこの手順で。

```sh
# 1. 秘密鍵と CSR を作る
openssl req -new -newkey rsa:2048 -nodes -keyout dist.key -out dist.csr \
  -subj "/emailAddress=syunpoo419@gmail.com/CN=CUBICENGINEstudio/C=JP"

# 2. POST /v1/certificates   （certificateType: DISTRIBUTION, csrContent: CSRの中身）
# 3. 返ってきた certificateContent を base64 デコードして .cer に
# 4. .cer と dist.key を .p12 にまとめて security import
# 5. POST /v1/profiles       （profileType: IOS_APP_STORE）
# 6. profileContent を base64 デコードして
#    ~/Library/MobileDevice/Provisioning Profiles/<UUID>.mobileprovision へ
```

JWT(ES256) は Node の `createSign` に `dsaEncoding: 'ieee-p1363'` を渡せば作れる。

### アップロード

```sh
xcrun altool --upload-app -f App.ipa -t ios \
  --apiKey H36ZG2WZ94 --apiIssuer 8c2f2e58-ffce-4312-9038-a6552f2e6d37
```

⚠️ **アプリの「枠」を App Store Connect で先に作っておくこと。**
無いと `Cannot determine the Apple ID from Bundle ID` で弾かれる。
そして**アプリの作成は API ではできない**（`apps` は CREATE 不可）。
ここだけは画面操作が要る。

⚠️ **課金商品は v2 の窓口で作ること。** `/v1/inAppPurchases` は CREATE 不可で、
`/v2/inAppPurchases` なら通る。

### Safari の画面が英語でつらいとき

**メニューバーの「表示」→「翻訳」→「日本語に翻訳」** でページごと日本語になる。
Apple のサイトは全部これでいける。

---

## Info.plist のコメントは残らない（2026-08-21）

`npx cap sync ios` が Info.plist を整形し直すとき、**XML のコメントは消える**。
注意書きをファイルの中に書いても next sync で失われるので、ここに残す。

### 消せない3つの権限説明

```
NSCameraUsageDescription          カメラ
NSMicrophoneUsageDescription      マイク
NSPhotoLibraryAddUsageDescription 写真への追加
```

**この3つが無いと、iOS はアプリを起動した瞬間に落とす。** Android の
AndroidManifest.xml と違って、iOS は「なぜ要るのか」の説明文そのものを求める。
空でも駄目で、文章が入っていないと App Store の審査でも弾かれる。
文面は利用者にそのまま表示されるので、何に使うかを具体的に書くこと。

`cap sync` で消えていないか、たまに確認すること：

```sh
plutil -extract NSCameraUsageDescription raw ios/App/App/Info.plist
```

### cap sync が足してくれるもの

`ITSAppUsesNonExemptEncryption = false` は sync が自動で入れる。
提出時の「暗号化の輸出申告」を省けるので、消さないこと。
