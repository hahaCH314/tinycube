// 顔ハメフレームの「穴」座標を自動測定するスクリプト。
// 既存の frames.mjs と同じ Chrome DevTools Protocol を使う。
//
// 使い方:
//   node tools/measure-holes.mjs public/frames/goya.webp public/frames/japan_face.webp ...
//   node tools/measure-holes.mjs public/frames/goya.webp public/frames/japan_face.webp public/frames/kabuki_face.webp public/frames/bath_face.webp public/frames/dog_face_w.webp public/frames/lemon_face.webp public/frames/otaku_face.webp public/frames/onnagata.webp public/frames/dog_face_p.webp public/frames/dog_face_p_2.webp

import { spawn } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const PORT = 9384;
const CHROME = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const inputs = process.argv.slice(2).map(a => resolve(a));
if (!inputs.length) {
  console.error('使い方: node tools/measure-holes.mjs <webpファイル...>');
  process.exit(1);
}
if (!existsSync(CHROME)) {
  console.error('Chrome が見つかりません:', CHROME);
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(tmpdir() + '/holes-');
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

// Chrome が起きるまで待つ
let list = null;
for (let i = 0; i < 40 && !list; i++) {
  await sleep(250);
  try { list = await (await fetch(`http://localhost:${PORT}/json/list`)).json(); } catch { /* まだ */ }
}
if (!list) { console.error('Chrome が起きませんでした'); chrome.kill(); process.exit(1); }
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
await send('Page.navigate', { url: 'about:blank' });
await sleep(400);

const results = {};

for (const file of inputs) {
  const name = basename(file, '.webp');
  console.log('測定中:', name);

  const b64 = readFileSync(file).toString('base64');
  const mime = 'image/webp';

  const code = `(async () => {
    const img = new Image();
    img.src = 'data:${mime};base64,' + ${JSON.stringify(b64)};
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, W, H);
    const d = im.data;
    const N = W * H;

    // 黒い画素（frames.mjs と同じ判定）
    const dark = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      if (d[o+3] > 8 && d[o] < 42 && d[o+1] < 42 && d[o+2] < 42) dark[i] = 1;
    }

    // 連結成分でまとめる（frames.mjs 同様）
    const label = new Int32Array(N).fill(-1);
    const stack = new Int32Array(N);
    const sizes = [];
    let next = 0;
    for (let s = 0; s < N; s++) {
      if (!dark[s] || label[s] >= 0) continue;
      let sp = 0, count = 0;
      stack[sp++] = s; label[s] = next;
      while (sp > 0) {
        const p = stack[--sp]; count++;
        const x = p % W, y = (p / W) | 0;
        if (x > 0     && dark[p-1] && label[p-1] < 0) { label[p-1] = next; stack[sp++] = p-1; }
        if (x < W-1   && dark[p+1] && label[p+1] < 0) { label[p+1] = next; stack[sp++] = p+1; }
        if (y > 0     && dark[p-W] && label[p-W] < 0) { label[p-W] = next; stack[sp++] = p-W; }
        if (y < H-1   && dark[p+W] && label[p+W] < 0) { label[p+W] = next; stack[sp++] = p+W; }
      }
      sizes.push(count); next++;
    }

    // 0.4% 以上の塊 → 穴の候補。一番大きい塊の外接矩形を取る
    const minSize = N * 0.004;
    let bigLabel = -1, bigSize = 0;
    for (let i = 0; i < sizes.length; i++) {
      if (sizes[i] >= minSize && sizes[i] > bigSize) { bigSize = sizes[i]; bigLabel = i; }
    }
    if (bigLabel < 0) return JSON.stringify({ name: '${name}', W, H, error: '穴が見つかりません' });

    // 外接矩形（ピクセル）
    let minX = W, maxX = 0, minY = H, maxY = 0;
    for (let i = 0; i < N; i++) {
      if (label[i] !== bigLabel) continue;
      const x = i % W, y = (i / W) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }

    // % に変換
    return JSON.stringify({
      name: '${name}', W, H,
      pct: {
        x: +((minX / W) * 100).toFixed(1),
        y: +((minY / H) * 100).toFixed(1),
        w: +((maxX - minX) / W * 100).toFixed(1),
        h: +((maxY - minY) / H * 100).toFixed(1),
      }
    });
  })()`;

  const res = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
  const val = res.result?.result?.value;
  if (!val) { console.log('  × 失敗'); continue; }
  const r = JSON.parse(val);
  if (r.error) {
    console.warn('  ⚠', r.error);
  } else {
    results[r.name] = r.pct;
    console.log(`  ✓ x:${r.pct.x} y:${r.pct.y} w:${r.pct.w} h:${r.pct.h}`);
  }
}

ws.close();
chrome.kill();

console.log('\n--- frames.ts に貼る faceHole 値 ---');
for (const [name, pct] of Object.entries(results)) {
  const line = `  faceHole: { x: ${pct.x}, y: ${pct.y}, w: ${pct.w}, h: ${pct.h} },`;
  console.log(line.padEnd(60) + `// ${name}`);
}

writeFileSync('tools/holes-result.json', JSON.stringify(results, null, 2));
console.log('\ntools/holes-result.json に保存しました');
