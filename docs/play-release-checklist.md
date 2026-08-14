# Google Play に出すまでの手順（2026-08-14）

伊波さんが自分で進められるように書いた。**上から順に**。

---

## ⏭ 次にやること（2026-08-14 夜の時点）

**署名鍵は作った。** `E:\keystore-tinycube\tinycube-release.jks`
（SHA256 の指紋 05:F1:6A:9C:… ／ 有効期限 約27年）。
`android/keystore.properties` も置いてあり、署名付きの AAB が作れる。

**パスワードは git に書かない。** `android/keystore.properties` の中にある。
伊波さんにも口頭で伝えた（紙に控えてもらう）。

残っていること:

1. **USB へ鍵の控えを取る** ← 伊波さん「明日やる」（2026-08-14）
   `tinycube-release.jks` とパスワードを、PC が壊れても残る場所へ
2. Play Console で商品 `tinycube_unlock_all` を ¥300 で登録（下の「3.」）
3. AAB をアップロード（下の「4.」）
4. **課金は実機でしか試せない。** 内部テストに伊波さんを入れて確かめる

**伊波さんは対話式のコマンド入力が負担になる。**「聞かれたら答える」形は
避けて、**一度貼れば終わる形**にすること。keytool の対話で3回失敗させた
（パスワードが6文字未満、確認と不一致、姓名の欄にコマンドの文字列が混ざる）。
最後はシオンが `-storepass` と `-dname` を全部指定して一発で作った。

---

## 0. いまどこまで済んでいるか

- [x] Play Console の登録（伊波さん。**本人確認まで完了**）
- [x] Android のビルドが通ることを確認（この PC でできる）
- [x] アプリ内課金のコード（`src/billing.ts` / `src/unlock.ts`）
- [x] アプリ版から BOOTH / Ko-fi の導線を消した（Web 版はそのまま）
- [x] アイコンを tinyCUBE のものに差し替え（Capacitor の初期アイコンだった）
- [ ] **署名鍵をつくる**（← ここから伊波さん）
- [ ] Play Console で商品を登録
- [ ] AAB をアップロード

---

## 1. 署名鍵をつくる

**この鍵を失くすと、アプリを二度と更新できなくなる。** 別アプリとして
出し直すことになり、買った人も引き継げない。作ったら必ず控えを取ること。

PowerShell で、`E:\cmcube` のあたりで:

```powershell
& "C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin\keytool.exe" -genkeypair -v `
  -keystore E:\keystore-tinycube\tinycube-release.jks `
  -alias tinycube `
  -keyalg RSA -keysize 2048 -validity 10000
```

聞かれること:

| 聞かれる内容 | 答え方 |
|---|---|
| キーストアのパスワード | **自分で決める。忘れないもの**（2回聞かれる） |
| 姓名 | `CUBICENGINEstudio` でよい |
| 組織単位・組織 | `CUBICENGINEstudio` |
| 市区町村・都道府県・国コード | 住んでいるところ。国は `JP` |
| 「正しいですか」 | `はい` と打つ |

できたら **3か所に控える**:

1. `E:\keystore-tinycube\tinycube-release.jks`（本体）
2. USB メモリなど、PC が壊れても残るところ
3. パスワードは紙かパスワード管理アプリに

---

## 2. 署名の設定をアプリに教える

`android/keystore.properties` という名前で、次の中身のファイルを作る。
**パスワードが入るので、git には入れない**（`.gitignore` に入れてある）。

```properties
storeFile=E:/keystore-tinycube/tinycube-release.jks
storePassword=（1で決めたパスワード）
keyAlias=tinycube
keyPassword=（1で決めたパスワード。同じでよい）
```

`android/app/build.gradle` 側は**シオンが用意済み**。このファイルを置けば
自動で読み込んで署名する。無ければ署名なしでビルドされる（今までどおり）。

---

## 3. Play Console で商品を登録

「収益化」→「アプリ内アイテム」→「アイテムを作成」

| 項目 | 値 |
|---|---|
| **商品 ID** | `tinycube_unlock_all` ← **一字一句このとおり。変えると動かない** |
| 名前 | ぜんぶ使えるようにする |
| 説明 | フレームが53枚ふえて、動画と写真の右下に入る「tinyCUBE」の文字が消えます |
| 価格 | ¥300 |
| 種類 | 買い切り（消費しないアイテム） |

登録したら**有効化**を忘れずに。

---

## 4. AAB をつくってアップロード

```sh
cd E:\cmcube\916cube
npm run build
npx cap sync android
cd android
./gradlew bundleRelease
```

できあがり: `android/app/build/outputs/bundle/release/app-release.aab`

これを Play Console の「製品版」→「新しいリリースを作成」でアップロード。

---

## 5. 出す前に確かめること

- [ ] **課金は実機でしか試せない。** 内部テストに自分を入れて、
      実際に買えるか・買い直しにならないかを見る
- [ ] アプリ版に BOOTH / Ko-fi の文字が**どこにも出ていない**こと
      （出ていると審査で弾かれる）
- [ ] アイコンが tinyCUBE のものになっていること（水色の稲妻でないこと）
- [ ] ストアの掲載情報（スクリーンショット、説明文、プライバシーポリシー）

**プライバシーポリシーは必須。** カメラとマイクを使うので、
何に使って何を送らないかを書いたページが要る。
tinyCUBE は撮ったものを外へ送らないので、そう書けばよい。

---

## 覚えておくこと

- **Web 版（tinycube.vercel.app）は今までどおり。** BOOTH のリンクと
  キー入力が残っている。既に買った人が使えなくなることはない
- アプリ版は Play の課金だけ。キー入力は出ない
  （出すと「外で買う道」に見えて審査に触れる）
- `versionCode` は**上げないと同じものを2回出せない**。
  更新のたびに `android/app/build.gradle` の数字を1つ増やすこと
