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
//
// ⚠️ **絵は縁いっぱいまで使うこと。周りに余白を残さない。**（2026-08-31）
//    支給された新ロゴは「白い紙に貼ったシール」の絵で、周囲に薄い余白が
//    焼き込まれていた。そのまま出したら、ホーム画面が**白い四角の中に
//    小さいロゴ**になった。ic_launcher_round は端末が丸く抜く前提なので、
//    角が不透明だと丸くならない。
//    → SVG の中で **viewBox を絵の実寸に切って**、余白を外に追い出す。
//    元絵を差し替えたときは、`tools/_logobox.mjs` で余白を測り直すこと。

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';

const SVG = resolve('public/favicon.svg');
const PORT = 9388;
const CHROME = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// 出すもの。maskable だけ角の丸みを外す
// Android の解像度別の大きさ。ic_launcher は四角、round は端末が丸く抜く
const ANDROID = [
  ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192],
];

const JOBS = [
  { out: 'public/icon-192.png', size: 192 },
  { out: 'public/icon-512.png', size: 512 },
  { out: 'public/apple-touch-icon.png', size: 180 },
  { out: 'public/icon-maskable.png', size: 512, maskable: true },

  // ---- Android（アプリの顔）----
  // ⚠️ ここを焼かないと、**Capacitor の初期アイコン（水色の稲妻）のまま**
  //    ストアにもホーム画面にも出る。tinyCUBE と何の関係もない絵になる
  //    （2026-08-14、伊波さん「アイコン揃ってる？」で判明）。
  ...ANDROID.flatMap(([dpi, px]) => [
    { out: `android/app/src/main/res/mipmap-${dpi}/ic_launcher.png`, size: px },
    { out: `android/app/src/main/res/mipmap-${dpi}/ic_launcher_round.png`, size: px },
    // adaptive icon の前景。端末が丸や角丸に切り抜くので、
    // **絵は中央 66% に収める**。目一杯だと角や縁が切り落とされる
    { out: `android/app/src/main/res/mipmap-${dpi}/ic_launcher_foreground.png`, size: Math.round(px * 2.25), inset: true },
  ]),

  // Play Console に出す「ストアのアイコン」。512x512 の PNG が要る
  { out: 'store/play-icon-512.png', size: 512, maskable: true },

  // iOS のアプリアイコン（Xcode の「単一サイズ」形式。1024px が1枚あればよい）
  { out: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', size: 1024 },
];

if (!existsSync(CHROME)) {
  console.error('Chrome が見つかりません。CHROME_PATH で場所を教えてください:', CHROME);
  process.exit(1);
}
if (!existsSync(SVG)) { console.error('無い:', SVG); process.exit(1); }

let source = readFileSync(SVG, 'utf8');

// ⚠️ favicon.svg は絵を **`href="/logo-src.png"` で外から指している**
//    （中に base64 で埋めると 2.3MB になり、JS 本体の 7.8 倍になる）。
//    ここは file:// で開くので、その絶対パスは解決できない。
//    **焼くときだけ**中身を data URI に差し替える
{
  const m = source.match(/href="\/([^"]+)"/);
  if (m) {
    const img = resolve('public', m[1]);
    if (!existsSync(img)) { console.error('絵が無い:', img); process.exit(1); }
    const ext = m[1].endsWith('.svg') ? 'svg+xml' : m[1].endsWith('.webp') ? 'webp' : 'png';
    const b64 = readFileSync(img).toString('base64');
    source = source.replace(m[0], `href="data:image/${ext};base64,${b64}"`);
  }
}

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
  if (j.maskable || j.inset) {
    svg = svg.replace(/rx="\d+"/, 'rx="0"').replace(/<rect x="8"[\s\S]*?\/>/, '');
  }
  // adaptive icon の前景は、絵を中央 66% に置いて周りを透かす。
  // 端末が丸や角丸に切り抜いても、絵が欠けないようにするため
  const inner = j.inset ? Math.round(j.size * 0.66) : j.size;
  const pad = j.inset ? Math.round((j.size - inner) / 2) : 0;
  const html = '<meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}'
    + (j.inset ? `body{width:${j.size}px;height:${j.size}px;position:relative}` : '')
    + `svg{display:block;width:${inner}px;height:${inner}px`
    + (j.inset ? `;position:absolute;left:${pad}px;top:${pad}px` : '')
    + `}</style>` + svg;
  const tmp = join(profile, 'icon.html');
  writeFileSync(tmp, html, 'utf8');

  await send('Emulation.setDeviceMetricsOverride', {
    width: j.size, height: j.size, deviceScaleFactor: 1, mobile: false,
  });
  await send('Page.navigate', {
    url: 'file:///' + tmp.split(String.fromCharCode(92)).join('/') + '?v=' + Date.now(),
  });
  await sleep(800);
  // 前景は周りが透けていないと、切り抜いたときに四角い縁が残る
  if (j.inset) {
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  } else {
    await send('Emulation.setDefaultBackgroundColorOverride');
  }
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(shot.result.data, 'base64');
  const outPath = resolve(j.out);
  mkdirSync(dirname(outPath), { recursive: true });   // store/ などが無くても作る
  writeFileSync(outPath, buf);
  console.log(j.out.padEnd(30), j.size + 'px', Math.round(buf.length / 1024) + 'KB');
}

ws.close();
chrome.kill();
console.log('\nCMCUBE 側のアイコンは E:/cmcube/app/build/icon.png。あちらは別に焼くこと。');
