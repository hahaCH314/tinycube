import { spawn } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { basename, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const PORT = 9384;
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const inputs = process.argv.slice(2).map(a => resolve(a));
if (!inputs.length) {
  console.log('使い方: node tools/measure-holes.mjs public/frames/*.webp');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'holes-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

let list = null;
for (let i = 0; i < 40 && !list; i++) {
  await sleep(250);
  try { list = await (await fetch(`http://localhost:${PORT}/json/list`)).json(); } catch { }
}
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

const allResults = [];

for (const file of inputs) {
  if (!existsSync(file)) continue;
  const name = basename(file, '.webp');
  const b64 = readFileSync(file).toString('base64');
  console.log(`測定中: ${name}`);

  const code = `(async () => {
    const img = new Image();
    img.src = 'data:image/webp;base64,' + ${JSON.stringify(b64)};
    await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, W, H);
    const d = im.data;
    const N = W * H;

    const dark = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      // 透明または黒を穴とみなす
      if (d[o+3] < 128 || (d[o] < 42 && d[o+1] < 42 && d[o+2] < 42)) dark[i] = 1;
    }

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

    const minSize = N * 0.002;
    const holes = [];
    for (let i = 0; i < sizes.length; i++) {
      if (sizes[i] >= minSize) {
        let minX = W, maxX = 0, minY = H, maxY = 0;
        for (let p = 0; p < N; p++) {
          if (label[p] === i) {
            const x = p % W, y = (p / W) | 0;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
        if (minX === 0 || maxX === W - 1 || minY === 0 || maxY === H - 1) continue;
        holes.push({
          x: +((minX / W) * 100).toFixed(1),
          y: +((minY / H) * 100).toFixed(1),
          w: +((maxX - minX) / W * 100).toFixed(1),
          h: +((maxY - minY) / H * 100).toFixed(1),
          size: sizes[i]
        });
      }
    }
    holes.sort((a, b) => b.size - a.size);
    return JSON.stringify({ name: '${name}', w: W, h: H, src: img.src, holes: holes.slice(0, 4) });
  })()`;

  const res = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
  const val = res.result?.result?.value;
  if (val) allResults.push(JSON.parse(val));
}

ws.close();
chrome.kill();

let html = `<meta charset="utf-8">
<style>
  body { background: #222; color: #fff; font-family: sans-serif; padding: 20px; }
  .frame { margin-bottom: 40px; display: flex; gap: 20px; }
  .img-container { position: relative; width: 400px; border: 1px solid #555; }
  .img-container img { width: 100%; display: block; }
  .hole { position: absolute; border: 2px solid #0f0; background: rgba(0,255,0,0.2); display: flex; align-items: center; justify-content: center; color: #0f0; font-weight: bold; text-shadow: 0 0 4px #000; font-size: 24px; }
  .code { flex: 1; }
  textarea { width: 100%; height: 100px; background: #111; color: #0f0; font-family: monospace; padding: 10px; border: none; font-size: 14px; margin-bottom: 10px; }
</style>
<h1>顔穴チェッカー</h1>
<p>検出された穴（最大4つ）が緑色で表示されます。正しい組み合わせのコードをコピーして frames.ts に貼ってください。</p>
`;

for (const r of allResults) {
  let holesHtml = '';
  let holesCode1 = '';
  let holesCode2 = '';
  
  if (r.holes.length > 0) {
    holesCode1 = `faceHole: { x: ${r.holes[0].x}, y: ${r.holes[0].y}, w: ${r.holes[0].w}, h: ${r.holes[0].h} }`;
  }
  if (r.holes.length > 1) {
    holesCode2 = `faceHoles: [{ x: ${r.holes[0].x}, y: ${r.holes[0].y}, w: ${r.holes[0].w}, h: ${r.holes[0].h} }, { x: ${r.holes[1].x}, y: ${r.holes[1].y}, w: ${r.holes[1].w}, h: ${r.holes[1].h} }]`;
  }

  r.holes.forEach((h, i) => {
    holesHtml += `<div class="hole" style="left:${h.x}%; top:${h.y}%; width:${h.w}%; height:${h.h}%">${i+1}</div>`;
  });

  html += `
  <div class="frame">
    <div class="img-container">
      <img src="${r.src}">
      ${holesHtml}
    </div>
    <div class="code">
      <h2>${r.name}</h2>
      <p>1つ穴の場合のコード（顔が1人の場合）：</p>
      <textarea readonly>{ id: '${r.name}', name: '${r.name}', file: './frames/${r.name}.webp', anchor: 'full', ${holesCode1} },</textarea>
      <p>2つ穴の場合のコード（顔が2人の場合）：</p>
      <textarea readonly>{ id: '${r.name}', name: '${r.name}', file: './frames/${r.name}.webp', anchor: 'wide', ${holesCode2} },</textarea>
    </div>
  </div>`;
}

writeFileSync('tools/holes-check.html', html);
console.log('✅ tools/holes-check.html を作成しました！ブラウザで開いて確認してください。');
