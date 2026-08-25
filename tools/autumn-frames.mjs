// 秋の限定フレームを取り込む（2026-08-25）。
//
//   node tools/autumn-frames.mjs
//
// ■ 何をするか
//
//   1. 穴（緑・マゼンタ・黒）を透明に抜く
//   2. webp に落とす（PNG のままだと1枚2MBで重い）
//   3. 穴の位置を測って、frames.ts に貼れる形で出す
//
// ⚠️ **穴の色は絵によって違う**（2026-08-25、伊波さん「マゼンダじゃない？」
//    「黒だね」）。緑＝顔ハメ、マゼンタと黒＝映像を映す窓。
//    ただし黒は顔ハメにも使われている（イカ焼き）ので、
//    **色ではなく穴の大きさで顔ハメかどうかを決める**。
//
// ⚠️ **中心から繋がっているかたまりだけを抜くこと。** 黒は夜景の暗い部分と
//    紛れるので、色だけで抜くと絵がスカスカになる（punch-holes.mjs と同じ理由）。
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';

const SRC = 'E:/syunp_data/Downloads/tinyCUBEframe秋';
const OUT = 'public/frames';

// 出す名前。日本語のファイル名はそのままだと扱いにくいので付け替える
const NAMES = {
  'お月見.png':                    { id: 'aki_tsukimi_p',   name: 'お月見' },
  'お月見１６.png':                 { id: 'aki_tsukimi_w',   name: 'お月見' },
  'りんご飴顔フレーム９.png':          { id: 'aki_ringo_p',     name: 'りんご飴（顔フレーム）' },
  'イカ焼き顔フレーム９.png':          { id: 'aki_ika_p',       name: 'イカ焼き（顔フレーム）' },
  'ブドウ１６.png':                 { id: 'aki_budou_w',     name: 'ぶどう' },
  '栗顔フレーム９.png':              { id: 'aki_kuri_p',      name: '栗（顔フレーム）' },
  '焼肉顔フレーム１６.png':           { id: 'aki_yakiniku_w',  name: '焼肉（顔フレーム）' },
  '秋祭り海.png':                   { id: 'aki_matsuri_w',   name: '秋祭り' },
  '秋１.png':                      { id: 'aki_momiji_p',    name: '紅葉' },
  '秋１６.png':                     { id: 'aki_momiji_w',    name: '紅葉' },
  '顔フレーム祭り女子.png':           { id: 'aki_matsuri_p',   name: '祭り女子（顔フレーム）' },
  '食欲の秋顔フレーム１６png.png':      { id: 'aki_shokuyoku_w', name: '食欲の秋（顔フレーム）' },
};

const b = await chromium.launch({ executablePath: await requireChrome() });
const page = await b.newPage();
const rows = [];

for (const f of fs.readdirSync(SRC)) {
  const meta = NAMES[f];
  if (!meta) { console.log('  (知らない絵) ' + f); continue; }
  const b64 = fs.readFileSync(path.join(SRC, f)).toString('base64');
  const r = await page.evaluate(async (d) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + d;
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, W, H);
    const px = im.data;

    const 判定 = (R, G, B) => {
      if (G > 140 && R < 120 && B < 120 && (G - Math.max(R, B)) > 70) return '緑';
      if (R > 180 && B > 140 && G < 110 && (Math.min(R, B) - G) > 70) return 'マゼンタ';
      if (R < 10 && G < 10 && B < 10) return '黒';
      return null;
    };
    // どの色が多いか
    const cnt = { 緑: 0, マゼンタ: 0, 黒: 0 };
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 200) continue;
      const k = 判定(px[i], px[i + 1], px[i + 2]);
      if (k) cnt[k]++;
    }
    let 色 = '', best = 0;
    for (const k of ['緑', 'マゼンタ', '黒']) if (cnt[k] > best) { best = cnt[k]; 色 = k; }
    if (!色) return null;

    // 中心から繋がったかたまりだけを抜く
    const 対象 = (x, y) => {
      const i = (y * W + x) * 4;
      return px[i + 3] >= 200 && 判定(px[i], px[i + 1], px[i + 2]) === 色;
    };
    const 済 = new Uint8Array(W * H);
    const stack = [];
    for (let dy = -H / 8; dy < H / 8; dy += H / 40)
      for (let dx = -W / 8; dx < W / 8; dx += W / 40) {
        const x = Math.round(W / 2 + dx), y = Math.round(H / 2 + dy);
        if (x >= 0 && y >= 0 && x < W && y < H && 対象(x, y)) stack.push(y * W + x);
      }
    if (!stack.length) return null;
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    while (stack.length) {
      const p = stack.pop();
      if (済[p]) continue;
      const x = p % W, y = (p - x) / W;
      if (!対象(x, y)) continue;
      済[p] = 1; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0) stack.push(p - 1); if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W); if (y < H - 1) stack.push(p + W);
    }
    // 抜く。ふちのギザギザを減らすため、周りも少しだけ薄める
    for (let p = 0; p < 済.length; p++) if (済[p]) px[p * 4 + 3] = 0;
    g.putImageData(im, 0, 0);

    return {
      W, H, 色,
      x: +(x0 / W * 100).toFixed(1), y: +(y0 / H * 100).toFixed(1),
      w: +((x1 - x0 + 1) / W * 100).toFixed(1), h: +((y1 - y0 + 1) / H * 100).toFixed(1),
      面積: +(n / (W * H) * 100).toFixed(1),
      webp: c.toDataURL('image/webp', 0.72),
    };
  }, b64);

  if (!r) { console.log('  (穴が見つからない) ' + f); continue; }
  const file = meta.id + '.webp';
  fs.writeFileSync(path.join(OUT, file), Buffer.from(r.webp.split(',')[1], 'base64'));
  const kb = Math.round(fs.statSync(path.join(OUT, file)).size / 1024);
  // ⚠️ **顔ハメかどうかは穴の大きさで決める。** 色ではない
  //    （黒はイカ焼き＝顔ハメにも、紅葉＝窓にも使われている）
  const 顔 = r.面積 < 20;
  rows.push({ ...meta, file, 横: r.W > r.H, 顔, x: r.x, y: r.y, w: r.w, h: r.h });
  console.log(`  ${r.W > r.H ? '横' : '縦'} ${顔 ? '顔' : '窓'} ${String(kb).padStart(4)}KB  ${meta.name.padEnd(18)} ${file}`);
}
await b.close();

console.log('\n--- frames.ts に貼る ---');
for (const r of rows) {
  const anchor = r.横 ? 'wide' : 'full';
  const hole = r.顔 ? `, faceHole: { x: ${r.x}, y: ${r.y}, w: ${r.w}, h: ${r.h} }` : '';
  console.log(`  { id: '${r.id}', name: '${r.name}', file: './frames/${r.file}', anchor: '${anchor}'${hole}, season: 'autumn' },`);
}

// ⚠️ **穴が2つ以上ある絵に気をつけること。**
//
//    ここは穴を「1つの塊」としてしか測っていない。二人用の枠だと、離れた
//    2つの穴を**まとめた大きな四角**が出てしまう。焼肉がそれで
//    「幅50.8 × 高さ55.5（画面の半分）」になっていた（2026-08-26 に発覚）。
//
//    比率が正方形に近い、あるいは面積が大きすぎるものは疑うこと。
//    2つある枠は faceHoles（複数形）で書く。測り直しは
//      node tools/_two-holes.mjs public/frames/xxx.webp
const あやしい = rows.filter(r => r.顔 && (r.w * r.h > 1800 || Math.abs(r.w / r.h - 1) < 0.25));
if (あやしい.length) {
  console.log('\n⚠️ 穴が2つあるかもしれないもの（tools/_two-holes.mjs で測り直すこと）');
  for (const r of あやしい) {
    console.log(`  ${r.name}  w=${r.w} h=${r.h}  比 ${(r.w / r.h).toFixed(2)}  面積 ${(r.w * r.h / 100).toFixed(1)}%`);
  }
}
