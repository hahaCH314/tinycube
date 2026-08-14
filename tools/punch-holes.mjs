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

    // **「ほぼ真っ黒」から試す（明るさ4未満）。**
    // 16未満まで拾うと、額縁の内側にある暗い装飾（垂れ下がった鎖・彫刻・
    // 血の飛沫）まで消える（2026-08-14、伊波さん「枠が出来てない」「絵がない」）。
    // ホラーの絵で四角の中の明るさを測ったところ、96.7%が0〜3、
    // 残り3.3%が装飾だった。ここを分ける線が4になる。
    //
    // ただし**絵によって「黒」の濃さが違う**。中央がやや明るい絵
    // （ギャラクシー・ヲタ芸）は4では拾えないので、段階的に緩める。
    // 厳しいほうから試して、中心が拾えた時点で止める
    const THRESHOLDS = [4, 10, 16, 24, 34];
    const cx0 = (W/2)|0, cy0 = (H/2)|0;
    let dark = null, usedTh = 0;
    for (const th of THRESHOLDS) {
      const m = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        const o = i * 4;
        if (d[o+3] > 8 && d[o] < th && d[o+1] < th && d[o+2] < th) m[i] = 1;
      }
      if (m[cy0*W + cx0]) { dark = m; usedTh = th; break; }
    }
    if (!dark) return JSON.stringify({ cleared: 0 });

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

    // **中心から測った四角の内側だけ**を抜く。
    //
    // 「中心から繋がっている黒」を辿る方式では駄目だった。中央の黒が
    // 細い暗い筋を伝って枠の隅々まで繋がっていて、絵ごと抜けてしまう
    // （2026-08-14、伊波さん「ホラーは絵も一緒に抜けてる」「漫画も」）。
    // 実測：ホラーは本来 x157..867 のはずが x0..899 まで漏れ、
    // 漫画は本来 x179..1490 が x0..1671（全幅）まで漏れていた。
    //
    // 中心の行と列を左右上下へたどって、黒が途切れる場所を四角の端とする。
    // その内側だけを消せば、枠の中の暗い装飾は残る。
    const cx = (W/2)|0, cy = (H/2)|0;
    if (!dark[cy*W + cx]) return JSON.stringify({ cleared: 0 });

    // まず中心の行・列で端を出す
    let L = cx; while (L > 0 && dark[cy*W + L - 1]) L--;
    let R = cx; while (R < W-1 && dark[cy*W + R + 1]) R++;
    let T = cy; while (T > 0 && dark[(T-1)*W + cx]) T--;
    let B = cy; while (B < H-1 && dark[(B+1)*W + cx]) B++;

    // 端の1本だけで決めると、たまたま黒が伸びている行に当たると広がりすぎる。
    // 内側の何本かで測り直して、**いちばん内側**を採る（安全側に倒す）
    const probe = (frac) => {
      const yy = Math.round(T + (B - T) * frac);
      let l = cx; while (l > 0 && dark[yy*W + l - 1]) l--;
      let r = cx; while (r < W-1 && dark[yy*W + r + 1]) r++;
      return [l, r];
    };
    const probeV = (frac) => {
      const xx = Math.round(L + (R - L) * frac);
      let t = cy; while (t > 0 && dark[(t-1)*W + xx]) t--;
      let b = cy; while (b < H-1 && dark[(b+1)*W + xx]) b++;
      return [t, b];
    };
    // 内側の何本かで測り直す。ただし**縮めすぎないこと**。
    // 中央が真っ黒ではなく黒い余白が広がっている絵（おふざけ）では、
    // 安全側に倒しすぎて抜ける範囲が17.9%まで小さくなった（2026-08-14）。
    // 中央値を採って、極端な1本に引きずられないようにする
    const med = arr => { const a=[...arr].sort((x,y)=>x-y); return a[(a.length/2)|0]; };
    const fr = [0.2, 0.35, 0.5, 0.65, 0.8];
    const Ls = [], Rs = [], Ts = [], Bs = [];
    for (const f of fr) { const [l, r] = probe(f); Ls.push(l); Rs.push(r); }
    for (const f of fr) { const [t, b] = probeV(f); Ts.push(t); Bs.push(b); }
    L = med(Ls); R = med(Rs); T = med(Ts); B = med(Bs);

    // 四角の内側で、黒いところだけを消す（枠が食い込んでいる部分は残す）
    let cleared = 0;
    for (let y = T; y <= B; y++) {
      for (let x = L; x <= R; x++) {
        const i = y*W + x;
        if (dark[i]) { d[i*4+3] = 0; cleared++; }
      }
    }
    if (cleared === 0) return JSON.stringify({ cleared: 0 });
    g.putImageData(im, 0, 0);
    const holes = [{
      x:+((L/W)*100).toFixed(1), y:+((T/H)*100).toFixed(1),
      w:+(((R-L)/W)*100).toFixed(1), h:+(((B-T)/H)*100).toFixed(1), size: cleared
    }];
    return JSON.stringify({ cleared, W, H, holes, th: usedTh, png: c.toDataURL('image/png') });
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
  console.log(`  ✓ ${name} … ${out.holes.length}か所 / 抜いた面積${pct}% / ${out.W}x${out.H} / しきい値${out.th}`);
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
