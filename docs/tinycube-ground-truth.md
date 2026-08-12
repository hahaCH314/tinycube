# tinyCUBE 実測仕様 — 三者共通の前提

**このファイルの役割**：シオン（Claude）・ヒマワリ（Gemini）・ボタンくん（v0）が、
毎回説明されなくても同じ前提に立てるようにするための1枚。
伊波さんが口頭で運ばなくて済むように、**推測を書かない。実際に測った値だけ書く**。

- 最終更新：**2026-08-12**（シオンが実測）
- 測定対象：**https://tinycube.vercel.app/ の本番ビルド**
- 測定方法：Electron で本番ページを開き、既存のスタイルシートを全部剥がして
  検証対象の CSS だけを注入し、`getBoundingClientRect` と `elementFromPoint` で測定
- ⚠️ **これはヒマワリさんの大幅アップデート前の姿**。設定画面・同意画面はまだ含まれない
- ⚠️ 測定した時点で、作業ツリーには**未コミットの変更**があった
  （`src/App.tsx` / `src/recorder.ts` / `src/frames.ts` / `src/App.css`、
  および `public/frames/` に新規の SVG 3枚：`heisei_gyaru` / `heisei_rakugaki` / `heisei_split4`）。
  **それらがデプロイされたら DOM が変わっている可能性がある。**
  そのときは 8章の手順で測り直して、このファイルを上書きすること

---

## 1. 実際の DOM 構造

```html
<div class="app-container">
  <main class="preview-stage">
    <input>                            <!-- ファイル選択。非表示にする -->
    <div class="stage-box">
      <canvas class="stage-canvas"></canvas>
    </div>
    <div class="video-placeholder">    <!-- stage-box の中ではなく、兄弟 -->
      <div class="upload-icon"><svg></svg></div>
      <p></p>
    </div>
  </main>

  <div class="ui-layer">               <!-- ★ UI は全部この中にいる -->
    <div class="city-frame top"></div>
    <div class="city-frame bottom"></div>
    <header class="header">
      <div class="logo-container"><span class="logo-text"></span></div>
      <div class="header-tools">
        <button class="tool-btn-small"></button>
        <button class="tool-btn-small"></button>
        <button class="tool-btn-small discord-btn"></button>
      </div>
    </header>
    <footer class="bottom-controls">
      <button class="preview-btn-round"></button>
      <button class="photo-btn-round"></button>
      <button class="record-btn-round"><div class="record-inner"></div></button>
      <button class="pause-btn-round"></button>
    </footer>
    <div class="side-panel left">  <div class="panel-scroll">…15個の .effect-btn…</div></div>
    <div class="side-panel right"> <div class="panel-scroll">…12個の .effect-btn…</div></div>
  </div>

  <div class="sheet-backdrop">
    <div class="sheet guide">…</div>
  </div>
</div>
```

### ここを間違えると壊れる（実際に壊した）

1. **`.header` / `.bottom-controls` / `.side-panel` は `.ui-layer` の子**。
   `.app-container` の縦並びではない。位置指定は全部これを前提にすること。
2. **`.ui-layer` に `pointer-events: none` を掛けると、画面上のボタンが全部死ぬ。**
   掛けるなら、中の `button` / `a` / `input` と3つのバーに `auto` を戻すこと。
3. `.video-placeholder` は `.stage-box` の**中ではなく兄弟**。

## 2. 実際に存在するクラス（本番ビルドで観測、51個）

```
app-container / preview-stage / stage-box / stage-canvas / video-placeholder / upload-icon
ui-layer / city-frame + top|bottom
header / logo-container / logo-text / header-tools / tool-btn-small / discord-btn
bottom-controls / record-btn-round / record-inner / preview-btn-round / photo-btn-round / pause-btn-round
side-panel + left|right / panel-scroll
effect-btn + btn-mine|btn-burst|btn-sound|btn-telop / empty / btn-icon / btn-label / number-icon
sheet-backdrop / sheet + guide / sheet-head / sheet-btn
guide-steps / guide-warn / guide-note
promo / promo-head / promo-badge / promo-lead / promo-points / promo-fold / promo-link / promo-foot
```

**`promo-fold` は当初の仕様書に載っていなかった**が、実物には存在する。
仕様書とのズレは他にもあり得るので、**このファイルが正**。

## 3. アプリが JS 側で決めていること（CSS では動かせない）

- **`.stage-box` の大きさはアプリが計算している。9:16 で画面いっぱい。**
  CSS で左右に余白を作っても効かない。
  → **UI は必ず映像の上に重なる**のが、このアプリ本来の設計。
- **`.side-panel` の `top` / `bottom` が何かに固定されている。**
  横向きで `top: 48px / bottom: 72px` になり、`!important` を付けても変わらない。
  インラインスタイルではなく、他のスタイルシートも読み込まれていない状態で再現する。
  同じルール内の `width` は効く。**原因未特定。心当たりのある人は追記してください。**

## 4. 実測値（`tinycube-skin-shibuya.css` を当てた状態）

| 画面 | .effect-btn 高さ | .stage-box |
|---|---|---|
| 320×568 | 23.5〜26.5px | 308×548 |
| 360×640 | 27.8〜29.7px | 349×620 |
| 390×844 | 40.1〜42.4px | 390×693 |
| 412×915 | 44.4〜47.1px | 412×732 |
| 844×390（横） | 30.3px | 208×370 |

**横向きはレールの高さが 270px しか取れない。** 15個 × 最低20px = 328px なので
1列では入らない。現在は横向きのみ **2列（8段×2列）** にして回避している。

## 5. 決まっていること

- **フレームは録画に焼き込む。** CSS の枠は canvas に合成できないので、
  アセット（PNG / SVG / canvas 直描き）に変換が必要
- **合成パイプラインは9スライス前提**（角は等倍、辺だけ伸縮）。
  縦横を切り替えたとき角が歪むのを防ぐため。`recorder.ts` の `drawFrame` に実装済み
- **`backdrop-filter`（枠の後ろの映像をぼかす）は、PNG でも SVG でも再現できない。**
  canvas に直接描いたときだけ可能。デザインがこれに依存していないか要確認
- **起動フローが変わる**：いきなりカメラではなく、同意画面 →
  設定（フレーム選択）画面 から始まる
- 通信するのは Web フォント取得と起動時の更新確認の2つだけ、と製品LPに明記済み。
  **ここを増やすなら先にLPを直さないと嘘になる**

## 6. 役割

| 誰 | 持ち場 |
|---|---|
| 伊波さん | 決定。方向性と「本当に動くのか」の判断 |
| ボタンくん（v0） | デザイン |
| ヒマワリ（Gemini） | アプリ実装（`App.tsx` / `recorder.ts` など `app/` 配下） |
| シオン（Claude） | スキン CSS と、実機での検証 |

- **シオンは `src/` 配下に書き込まない。** 納品は `docs/` にスキン CSS 1枚と手紙
- 変更・相談は必ず手紙に残す（`ヒマワリからの手紙_報連相.md` / `docs/tinycube-skin-letter.md`）

### このファイルの読ませ方（ボタンくん / v0 向け）

このリポジトリは公開なので、**raw URL をそのまま貼れば誰でも読める**：

```
https://raw.githubusercontent.com/hahaCH314/tinycube/main/docs/tinycube-ground-truth.md
https://raw.githubusercontent.com/hahaCH314/tinycube/main/docs/tinycube-skin-letter.md
https://raw.githubusercontent.com/hahaCH314/tinycube/main/docs/tinycube-skin-shibuya.css
```

伊波さんが口で説明し直さなくて済むように、**まずこの URL を渡す**こと。

## 7. 未着手・未解決

- **設定画面 / 同意画面のスタイルは CSS に1行も入っていない。**
  スキン CSS は既存スタイルシートの丸ごと置き換えなので、**そこに無いクラスは
  素の HTML の見た目になる**。画面を出す前にクラス名一覧をスキンへ反映すること
- `.side-panel` の `top` / `bottom` が動かない件（3章）
- 映像の上でデコラのアニメーションを流すかどうか（伊波さんの好みの判断待ち）

## 8. 自分で測り直す方法

誰でも同じ数字を出せるようにしておく。Node と Electron があれば動く。

```js
// shoot.cjs — electron.exe docs/shoot.cjs <幅> <高さ> で実行
// ★ 拡張子は .cjs のまま。package.json に "type": "module" があるため、
//    .js にすると ESM 扱いになって require が使えず、起動時にエラーで止まる。
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
app.disableHardwareAcceleration();
const CSS = fs.readFileSync('docs/tinycube-skin-shibuya.css', 'utf8');
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: +process.argv[2], height: +process.argv[3],
    useContentSize: true, show: false
  });
  await win.loadURL('https://tinycube.vercel.app/');
  await new Promise(r => setTimeout(r, 3500));
  // 既存のスタイルを剥がして、検証したい CSS だけを入れる
  await win.webContents.executeJavaScript(
    'document.querySelectorAll("style,link[rel=\'stylesheet\']").forEach(n=>n.remove());' +
    'var s=document.createElement("style"); s.textContent=' + JSON.stringify(CSS) + ';' +
    'document.head.appendChild(s); true;');
  fs.writeFileSync('shot.png', (await win.webContents.capturePage()).toPNG());
  process.exit(0);
});
```

```bash
# リポジトリのルートで実行する。
# ELECTRON_RUN_AS_NODE が環境に残っていると素の node として動くので必ず外す。
# electron.exe の場所は環境しだい（CMCUBE 側の app/node_modules/electron/dist/ にある）
env -u ELECTRON_RUN_AS_NODE "<electron.exe のパス>" docs/shoot.cjs 390 844
```

**クリックできるかの確認は必ず入れること**（見た目だけでは分からないため）：

```js
const el = document.querySelector('.record-btn-round');
const b = el.getBoundingClientRect();
el.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
// false なら、そのボタンは何かに覆われていて押せない
```

---

**このファイルは、実測し直したら上書きしてください。** 古い値が残っているほうが危ない。
