import { spawn } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { basename, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const PORT = 9385;
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const targetNames = ['goya', 'japan_face', 'kabuki_face', 'bath_face', 'dog_face_w', 'lemon_face', 'otaku_face', 'onnagata', 'dog_face_p', 'dog_face_p_2'];
const inputs = targetNames.map(name => resolve(`public/frames/${name}.webp`));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'auto-holes-'));
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
  if (!existsSync(file)) {
    console.log('スキップ: 見つかりません', file);
    continue;
  }
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
    return JSON.stringify({ name: '${name}', holes: holes.slice(0, 4) });
  })()`;

  const res = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
  const val = res.result?.result?.value;
  if (val) allResults.push(JSON.parse(val));
}

ws.close();
chrome.kill();

const framesPath = resolve('src/frames.ts');
let tsContent = readFileSync(framesPath, 'utf8');

for (const r of allResults) {
  if (r.holes.length === 0) continue;
  const hole = r.holes[0];
  const holeStr = `faceHole: { x: ${hole.x}, y: ${hole.y}, w: ${hole.w}, h: ${hole.h} }`;
  
  const regex = new RegExp(`(\\{\\s*id:\\s*'${r.name}',[^{}]*?)(\\s*\\})`, 'g');
  tsContent = tsContent.replace(regex, (match, p1, p2) => {
    if (match.includes('faceHole')) {
      return match.replace(/faceHole:\s*\\{[^}]+\\}/, holeStr);
    } else {
      const trailingComma = p1.trim().endsWith(',') ? '' : ',';
      return p1 + trailingComma + ' ' + holeStr + p2;
    }
  });
}

writeFileSync(framesPath, tsContent, 'utf8');
console.log('✨ 新しい顔ハメ10種の数値を自動で frames.ts に書き込みました！');
