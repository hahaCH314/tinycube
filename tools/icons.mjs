// アイコンを焼く道具。
//
//   npm run icons
//
// public/favicon.svg から、ホーム画面とタブに出す PNG を作り直す。
// SVG を触ったら必ずこれを走らせること。走らせないと、タブのアイコンと
// ホーム画面のアイコンが別の絵になる（2026-08-11、実際にそうなった）。
//
// maskable は端末側が丸や角丸に切り抜くので、角の丸みを外して四角いまま出す。
//
// 焼くのは headless Chrome。SVG をそのまま描けるので、画像ライブラリが要らない。

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SVG = resolve('public/favicon.svg');
const PORT = 9388;
const CHROME = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// 出すもの。maskable だけ角の丸みを外す
const JOBS = [
  { out: 'public/icon-192.png', size: 192 },
  { out: 'public/icon-512.png', size: 512 },
  { out: 'public/apple-touch-icon.png', size: 180 },
  { out: 'public/icon-maskable.png', size: 512, maskable: true },
];

if (!existsSync(CHROME)) {
  console.error('Chrome が見つかりません。CHROME_PATH で場所を教えてください:', CHROME);
  process.exit(1);
}
if (!existsSync(SVG)) { console.error('無い:', SVG); process.exit(1); }

const source = readFileSync(SVG, 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'icons-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

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

for (const j of JOBS) {
  let svg = source;
  if (j.maskable) {
    svg = svg.replace(/rx="\d+"/, 'rx="0"').replace(/<rect x="8"[\s\S]*?\/>/, '');
  }
  const html = '<meta charset="utf-8"><style>html,body{margin:0;padding:0}'
    + `svg{display:block;width:${j.size}px;height:${j.size}px}</style>` + svg;
  const tmp = join(profile, 'icon.html');
  writeFileSync(tmp, html, 'utf8');

  await send('Emulation.setDeviceMetricsOverride', {
    width: j.size, height: j.size, deviceScaleFactor: 1, mobile: false,
  });
  await send('Page.navigate', {
    url: 'file:///' + tmp.split(String.fromCharCode(92)).join('/') + '?v=' + Date.now(),
  });
  await sleep(800);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(shot.result.data, 'base64');
  writeFileSync(resolve(j.out), buf);
  console.log(j.out.padEnd(30), j.size + 'px', Math.round(buf.length / 1024) + 'KB');
}

ws.close();
chrome.kill();
console.log('\nCMCUBE 側のアイコンは E:/cmcube/app/build/icon.png。あちらは別に焼くこと。');
