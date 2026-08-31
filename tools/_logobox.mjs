// ロゴの絵が、画像の中のどこからどこまでかを測る道具。
//
//   node tools/_logobox.mjs [元絵のパス]
//
// ⚠️ **アイコンの絵は縁いっぱいまで使う。周りに余白を残さない。**
//    支給された絵が「白い紙に貼ったシール」のとき、周囲の余白ごと焼くと
//    ホーム画面が**白い四角の中の小さいロゴ**になる（2026-08-31、実際に
//    そうなった）。ic_launcher_round は端末が丸く抜く前提なので、
//    角が不透明だと丸くならない。
//
// ここで出た数字を public/favicon.svg の viewBox に入れて、余白を外へ出す。

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SRC = resolve(process.argv[2] || 'E:/cmcube/tinyCUBEＬＯＧＯ.png');
const CHROME = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9471;

if (!existsSync(SRC)) { console.error('無い:', SRC); process.exit(1); }
if (!existsSync(CHROME)) { console.error('Chrome が見つかりません:', CHROME); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'logobox-'));
const b64 = readFileSync(SRC).toString('base64');
const tmp = join(profile, 'm.html');
writeFileSync(tmp, `<meta charset="utf-8"><img id="i" src="data:image/png;base64,${b64}">`, 'utf8');

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'],
  { stdio: 'ignore' });

let list = null;
for (let i = 0; i < 40 && !list; i++) {
  await sleep(250);
  try { list = await (await fetch(`http://localhost:${PORT}/json/list`)).json(); } catch {}
}
if (!list) { console.error('Chrome が起きませんでした'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiting = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const send = (method, params = {}) => new Promise(res => {
  const k = ++id; waiting.set(k, res); ws.send(JSON.stringify({ id: k, method, params }));
});

await send('Page.enable');
await send('Page.navigate', { url: 'file:///' + tmp.split('\\').join('/') });
await sleep(1200);

// 左上の色を「地の色」とみなし、そこから離れた画素が出るところを絵の端とする
const expr = `(async () => {
  const img = document.getElementById('i');
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const bg = [d[0], d[1], d[2]], alpha0 = d[3] === 0;
  const far = i => alpha0
    ? d[i+3] > 8
    : Math.abs(d[i]-bg[0]) + Math.abs(d[i+1]-bg[1]) + Math.abs(d[i+2]-bg[2]) > 40;
  let top = H, left = W, right = 0, bottom = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (far((y*W+x)*4)) { if (y<top) top=y; if (y>bottom) bottom=y; if (x<left) left=x; if (x>right) right=x; }
  }
  return { W, H, bg, alpha0, top, left, right, bottom };
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
const v = r.result?.result?.value;
ws.close(); chrome.kill();

if (!v) { console.error('測れませんでした'); process.exit(1); }

const w = v.right - v.left + 1, h = v.bottom - v.top + 1;
// 正方形に切る（アイコンは正方形。長い辺に合わせて中心を保つ）
const side = Math.max(w, h);
const cx = v.left + w / 2, cy = v.top + h / 2;
const x = Math.round(cx - side / 2), y = Math.round(cy - side / 2);

console.log(`元絵      ${v.W}x${v.H}   地の色 rgb(${v.bg.join(',')})${v.alpha0 ? '（透明あり）' : ''}`);
console.log(`絵の範囲  左${v.left} 上${v.top} 右${v.right} 下${v.bottom}  （${w}x${h}）`);
console.log(`余白      左${v.left} 上${v.top} 右${v.W - 1 - v.right} 下${v.H - 1 - v.bottom}`);
console.log('');
console.log('public/favicon.svg の viewBox に入れる値:');
console.log(`  viewBox="${x} ${y} ${side} ${side}"`);
