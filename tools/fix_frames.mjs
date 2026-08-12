import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9382;

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('使い方: node tools/fix_frames.mjs <画像ファイルのパス>');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(tmpdir(), 'fix-frames-tmp')}`,
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

for (const arg of args) {
  const inn = resolve(arg);
  if (!existsSync(inn)) {
    console.log('見つかりません:', inn);
    continue;
  }
  const b64 = readFileSync(inn).toString('base64');
  const code = `(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + ${JSON.stringify(b64)};
    await img.decode();
    const W = img.width, H = img.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, W, H);
    const im = g.getImageData(0, 0, W, H);
    const d = im.data;
    const N = W * H;

    const dark = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      if (d[o + 3] > 8 && d[o] < 42 && d[o + 1] < 42 && d[o + 2] < 42) dark[i] = 1;
    }

    const label = new Int32Array(N).fill(-1);
    const stack = new Int32Array(N);
    const sizes = [];
    const edgeTouches = [];
    let next = 0;
    for (let s = 0; s < N; s++) {
      if (!dark[s] || label[s] >= 0) continue;
      let sp = 0, count = 0;
      let touchesEdge = false;
      stack[sp++] = s; label[s] = next;
      while (sp > 0) {
        const p = stack[--sp]; count++;
        const x = p % W, y = (p / W) | 0;
        if (x === 0 || x === W - 1 || y === 0 || y === H - 1) touchesEdge = true;
        if (x > 0     && dark[p - 1] && label[p - 1] < 0) { label[p - 1] = next; stack[sp++] = p - 1; }
        if (x < W - 1 && dark[p + 1] && label[p + 1] < 0) { label[p + 1] = next; stack[sp++] = p + 1; }
        if (y > 0     && dark[p - W] && label[p - W] < 0) { label[p - W] = next; stack[sp++] = p - W; }
        if (y < H - 1 && dark[p + W] && label[p + W] < 0) { label[p + W] = next; stack[sp++] = p + W; }
      }
      sizes.push(count);
      edgeTouches.push(touchesEdge);
      next++;
    }

    const min = N * 0.004;
    for (let i = 0; i < N; i++) {
      const l = label[i];
      // 画面の0.4%以上あり、かつ「画面の端に触れていない」黒い塊だけを抜く！
      if (l >= 0 && sizes[l] >= min && !edgeTouches[l]) {
        d[i * 4 + 3] = 0;
      }
    }
    g.putImageData(im, 0, 0);

    return c.toDataURL('image/webp', 0.85);
  })()`;

  const res = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
  const webp = res.result?.result?.value;
  if (webp) {
    // 同じフォルダに .webp として保存
    const out = inn.replace(/\\.[^\\.]+$/, '.webp');
    const buf = Buffer.from(webp.split(',')[1], 'base64');
    writeFileSync(out, buf);
    console.log('✅ 修正完了:', out);
  }
}

ws.close();
chrome.kill();
