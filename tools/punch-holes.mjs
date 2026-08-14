// フレームの絵の「真ん中の四角」だけを透明に抜く道具。
//
// **顔ハメの穴を抜くものではない**（2026-08-14、伊波さん「これ顔はめじゃない」）。
// 対象は、真ん中が黒く塗ってあって、そこにカメラの映像を映す普通のフレーム。
//
// **枠の中の暗いところを巻き込まないこと。** アプリの
// makeFaceHoleTransparent（src/App.tsx）は「黒に近い色」を広く拾うので、
// ホラーの絵に当てたら鎖や骸骨の陰、暗い背景まで消えてスカスカになった
// （2026-08-14、伊波さんが実物を見せてくれて判明）。
// ここでは**画像の中心から繋がっている黒だけ**を抜く。枠の陰は別のかたまり
// なので残る。
//
// 使い方:
//   node tools/punch-holes.mjs <入力フォルダ or ファイル...> [--out <出力先>]
//
// 例:
//   node tools/punch-holes.mjs "E:/cmcube/assets/tinycube用" --out public/frames
//
// 何をするか:
//   - 画像の中心から繋がっている黒いかたまりだけを透明にする
//   - 枠の中の暗い装飾（陰・鎖・背景）は別のかたまりなので残る
//   - 中心が黒くない絵は抜かず、名前を知らせる

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs';
import { basename, extname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';

const PORT = 9386;
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// ---- 引数 ----------------------------------------------------------
const argv = process.argv.slice(2);
let outDir = null;
const targets = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') { outDir = argv[++i]; continue; }
  targets.push(argv[i]);
}
if (targets.length === 0) {
  console.error('入力がありません。\n  node tools/punch-holes.mjs <フォルダ|ファイル...> [--out <出力先>]');
  process.exit(1);
}

// フォルダなら中の画像を集める
const EXT = new Set(['.png', '.webp', '.jpg', '.jpeg']);
const files = [];
for (const t of targets) {
  const p = resolve(t);
  if (!existsSync(p)) { console.log('見つかりません:', p); continue; }
  if (statSync(p).isDirectory()) {
    for (const f of readdirSync(p)) {
      // 拡張子だけの名前（".png" など）は名前が付いていないので飛ばす
      if (basename(f, extname(f)) === '') { console.log('名前が無いので飛ばす:', f); continue; }
      if (EXT.has(extname(f).toLowerCase())) files.push(join(p, f));
    }
  } else if (EXT.has(extname(p).toLowerCase())) {
    files.push(p);
  }
}
if (files.length === 0) { console.error('画像が1枚も見つかりませんでした'); process.exit(1); }
if (!outDir) outDir = resolve('tools/punched');
outDir = resolve(outDir);
mkdirSync(outDir, { recursive: true });

console.log(`${files.length}枚を処理します → ${outDir}\n`);

// ---- Chrome を立てる（canvas を使うため）---------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'punch-holes-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

let list = null;
for (let i = 0; i < 40 && !list; i++) {
  await sleep(250);
  try { list = await (await fetch(`http://localhost:${PORT}/json/list`)).json(); } catch { }
}
if (!list) { console.error('Chrome を起動できませんでした'); chrome.kill(); process.exit(1); }
let page = list.find(t => t.type === 'page');
if (!page) page = await (await fetch(`http://localhost:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0;
const waiting = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => {
  const k = ++id; waiting.set(k, res);
  ws.send(JSON.stringify({ id: k, method, params }));
});
await send('Page.enable');

// ---- 1枚ずつ抜く ---------------------------------------------------
const done = [], skipped = [];
for (const file of files) {
  const name = basename(file, extname(file));
  const mime = extname(file).toLowerCase() === '.webp' ? 'image/webp'
    : extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
  const b64 = readFileSync(file).toString('base64');

  // ここは src/App.tsx の makeFaceHoleTransparent と同じ判定にしてある
  const code = `(async () => {
    const img = new Image();
    img.src = 'data:${mime};base64,' + ${JSON.stringify(b64)};
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight, N = W * H;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, W, H);
    const d = im.data;

    // 黒いところを拾う（透明な場所は対象外）
    const dark = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      if (d[o+3] > 8 && d[o] < 16 && d[o+1] < 16 && d[o+2] < 16) dark[i] = 1;
    }

    // つながっているかたまりごとに分ける
    const label = new Int32Array(N).fill(-1);
    const stack = new Int32Array(N);
    const sizes = [], edgeTouches = [];
    let next = 0;
    for (let s = 0; s < N; s++) {
      if (!dark[s] || label[s] >= 0) continue;
      let sp = 0, count = 0, touchesEdge = false;
      stack[sp++] = s; label[s] = next;
      while (sp > 0) {
        const p = stack[--sp]; count++;
        const x = p % W, y = (p / W) | 0;
        // 画像の縁に近いものは背景。抜くと枠ごと消える
        if (x < W*0.05 || x > W*0.95 || y < H*0.05 || y > H*0.95) touchesEdge = true;
        if (x > 0    && dark[p-1] && label[p-1] < 0) { label[p-1] = next; stack[sp++] = p-1; }
        if (x < W-1  && dark[p+1] && label[p+1] < 0) { label[p+1] = next; stack[sp++] = p+1; }
        if (y > 0    && dark[p-W] && label[p-W] < 0) { label[p-W] = next; stack[sp++] = p-W; }
        if (y < H-1  && dark[p+W] && label[p+W] < 0) { label[p+W] = next; stack[sp++] = p+W; }
      }
      sizes.push(count); edgeTouches.push(touchesEdge); next++;
    }

    // **画像の中心から繋がっている黒だけ**を抜く。
    // 「黒いところを全部」にすると、枠の中の暗い装飾まで消える
    let cleared = 0;
    const kept = [];
    const centerLabel = label[((H/2)|0) * W + ((W/2)|0)];
    if (centerLabel >= 0) kept.push(centerLabel);
    const keptSet = new Set(kept);
    // 抜いた場所の範囲も測っておく（frames.ts に書く座標の下ごしらえ）
    const box = {};
    for (let i = 0; i < N; i++) {
      const l = label[i];
      if (l >= 0 && keptSet.has(l)) {
        d[i*4+3] = 0; cleared++;
        const x = i % W, y = (i / W) | 0;
        const b = box[l] || (box[l] = {minX:W,maxX:0,minY:H,maxY:0});
        if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
        if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
      }
    }
    if (cleared === 0) return JSON.stringify({ cleared: 0 });
    g.putImageData(im, 0, 0);
    const holes = kept.map(l => {
      const b = box[l];
      return { x:+((b.minX/W)*100).toFixed(1), y:+((b.minY/H)*100).toFixed(1),
               w:+(((b.maxX-b.minX)/W)*100).toFixed(1), h:+(((b.maxY-b.minY)/H)*100).toFixed(1),
               size: sizes[l] };
    }).sort((a,b) => b.size - a.size);
    return JSON.stringify({ cleared, W, H, holes, png: c.toDataURL('image/png') });
  })()`;

  const res = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
  const val = res.result?.result?.value;
  if (!val) { console.log(`  ✗ ${name} … 処理できませんでした`); skipped.push(name); continue; }
  const out = JSON.parse(val);
  if (!out.cleared) {
    console.log(`  − ${name} … 中心が黒くないので抜けません`);
    skipped.push(name);
    continue;
  }
  const buf = Buffer.from(out.png.split(',')[1], 'base64');
  const dest = join(outDir, `${name}.png`);
  writeFileSync(dest, buf);
  const pct = ((out.cleared / (out.W * out.H)) * 100).toFixed(1);
  console.log(`  ✓ ${name} … ${out.holes.length}か所 / 抜いた面積${pct}% / ${out.W}x${out.H}`);
  done.push({ name, holes: out.holes });
}

ws.close();
chrome.kill();

// ---- まとめ --------------------------------------------------------
console.log(`\n抜けた: ${done.length}枚 / 抜けなかった: ${skipped.length}枚`);
if (skipped.length) console.log('抜けなかったもの:', skipped.join(', '));

if (done.length) {
  console.log('\n--- frames.ts に貼る座標の下ごしらえ ---');
  console.log('（穴の位置は実測値。名前と file のパスは手で直すこと）\n');
  for (const r of done) {
    const h = r.holes;
    const one = `{ x: ${h[0].x}, y: ${h[0].y}, w: ${h[0].w}, h: ${h[0].h} }`;
    if (h.length === 1) {
      console.log(`{ id: '${r.name}', name: '${r.name}', file: './frames/${r.name}.png', anchor: 'full', faceHole: ${one} },`);
    } else {
      const many = h.slice(0, 2).map(x => `{ x: ${x.x}, y: ${x.y}, w: ${x.w}, h: ${x.h} }`).join(', ');
      console.log(`{ id: '${r.name}', name: '${r.name}', file: './frames/${r.name}.png', anchor: 'full', faceHoles: [${many}] },`);
    }
  }
}
