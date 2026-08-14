// 穴を抜き終わった PNG を、透明を保ったまま webp に落とす係。
//
//   node tools/png-to-webp.mjs public/frames
//
// ■ なぜ要るか
//
// 2026-08-14 に入れ替えた17枚が PNG のまま入っていて、それだけで 23MB
// あった（1枚あたり平均1.4MB）。webp 232枚は合計49MB＝1枚0.2MB なので、
// PNG 1枚が webp 7枚分。伊波さん「フレームの絵の読みこみが遅い」の原因。
// frames.mjs は 1枚150KB前後という基準で作られている。
//
// ■ frames.mjs と何が違うか
//
// frames.mjs は「元絵から穴を抜いて、frames.ts の一覧まで書き換える」道具。
// こちらは**すでに抜いてある絵を軽くするだけ**で、一覧には触らない。
// 穴を抜き直すと、8/14 に苦労して合わせた抜き方がやり直しになる。
//
// ■ 変換のしかた
//
// frames.mjs と同じく headless Chrome の canvas にやらせる。
// この PC には sharp も cwebp も無く、Chrome だけが webp を書ける。

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, unlinkSync } from 'node:fs';
import { join, basename, dirname, resolve } from 'node:path';

const MAX_EDGE = 1400;   // frames.mjs と揃える。これ以上大きくしても見た目は変わらない
const QUALITY = 0.80;    // frames.mjs と揃える
const PORT = 9384;       // frames.mjs(9382) と別にして、同時に走らせても衝突しないように
const CHROME = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');         // 変換せず、どれだけ減るかだけ見る
const KEEP = argv.includes('--keep-png');   // 元の PNG を消さずに残す
const args = argv.filter(a => !a.startsWith('--'));

if (!args.length) {
  console.error('使い方: node tools/png-to-webp.mjs [--dry] [--keep-png] <フォルダ|ファイル> ...');
  process.exit(1);
}
if (!existsSync(CHROME)) {
  console.error('Chrome が見つかりません。CHROME_PATH で場所を教えてください:', CHROME);
  process.exit(1);
}

// 渡されたものから PNG だけ集める
const inputs = [];
for (const a of args) {
  const p = resolve(a);
  if (!existsSync(p)) { console.error('無い:', p); continue; }
  if (statSync(p).isDirectory()) {
    for (const f of readdirSync(p).sort()) {
      if (/\.png$/i.test(f)) inputs.push(join(p, f));
    }
  } else if (/\.png$/i.test(p)) {
    inputs.push(p);
  }
}
if (!inputs.length) { console.error('PNG がありません'); process.exit(1); }

const kb = (n) => (n / 1024).toFixed(0) + 'KB';
console.log(`PNG ${inputs.length}枚を webp にします\n`);

if (DRY) {
  let total = 0;
  for (const f of inputs) {
    const s = statSync(f).size;
    total += s;
    console.log(`  ${kb(s).padStart(7)}  ${basename(f)}`);
  }
  console.log(`\n合計 ${kb(total)}。--dry なので変換していません`);
  process.exit(0);
}

// ---- headless Chrome を起こす（frames.mjs と同じやり方）----
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'png2webp-profile'),
], { stdio: 'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 起きるまで待つ。
// ⚠️ /json/version が返すのは**ブラウザ全体**への口で、そこには Runtime が無い
//    （'Runtime.evaluate' wasn't found になる）。canvas を動かすには
//    /json/list が返す**ページ**の口に繋ぐこと
let wsUrl = null;
for (let i = 0; i < 50; i++) {
  await sleep(200);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const tabs = await r.json();
    const page = tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
  } catch { /* まだ起きていない */ }
}
if (!wsUrl) { chrome.kill(); console.error('Chrome が起きませんでした'); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));

let id = 0;
const waiting = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
});
const send = (method, params) => new Promise(res => {
  const k = ++id; waiting.set(k, res);
  ws.send(JSON.stringify({ id: k, method, params }));
});

await send('Page.enable');
await send('Page.navigate', { url: 'about:blank' });
await sleep(400);

let before = 0, after = 0, ok = 0;
const failed = [];

for (const inn of inputs) {
  const name = basename(inn).replace(/\.png$/i, '');
  // 元の絵と同じ場所に出す。
  // args[0] を出し先にすると、フォルダではなくファイルを渡されたときに
  // 「ファイル名/○○.webp」という存在しない道になる
  const outPath = join(dirname(inn), name + '.webp');
  const srcSize = statSync(inn).size;
  const b64 = readFileSync(inn).toString('base64');

  const code = `(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + ${JSON.stringify(b64)};
    await img.decode();
    const scale = Math.min(1, ${MAX_EDGE} / Math.max(img.width, img.height));
    const W = Math.round(img.width * scale), H = Math.round(img.height * scale);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    // 透明を保つため、背景を塗らずにそのまま描く
    g.drawImage(img, 0, 0, W, H);
    // 中央が本当に透明のままかを数えて返す（穴が塞がっていないかの確かめ）
    const im = g.getImageData(0, 0, W, H).data;
    let clear = 0;
    for (let i = 3; i < im.length; i += 4) if (im[i] === 0) clear++;
    return JSON.stringify({
      w: W, h: H,
      clearPct: +(clear / (W * H) * 100).toFixed(1),
      webp: c.toDataURL('image/webp', ${QUALITY}),
    });
  })()`;

  const r = await send('Runtime.evaluate', {
    expression: code, awaitPromise: true, returnByValue: true,
  });

  const val = r?.result?.result?.value;
  if (!val) {
    failed.push(name);
    // 何が起きたか分からないまま「できませんでした」だけ出すと直せない
    const why = r?.result?.exceptionDetails?.exception?.description
      || r?.error?.message
      || JSON.stringify(r?.result ?? r).slice(0, 300);
    console.log(`  ✗ ${name} — 変換できませんでした\n      ${why}`);
    continue;
  }
  const info = JSON.parse(val);
  const buf = Buffer.from(info.webp.split(',')[1], 'base64');
  writeFileSync(outPath, buf);

  before += srcSize;
  after += buf.length;
  ok++;
  const pct = Math.round((1 - buf.length / srcSize) * 100);
  console.log(
    `  ${name.padEnd(16)} ${kb(srcSize).padStart(7)} → ${kb(buf.length).padStart(6)}` +
    `  (${String(pct).padStart(2)}%減)  透明 ${info.clearPct}%  ${info.w}x${info.h}`
  );
}

ws.close();
chrome.kill();

console.log(`\n${ok}枚 変換しました: ${kb(before)} → ${kb(after)} (${Math.round((1 - after / before) * 100)}%減)`);
if (failed.length) console.log(`変換できなかったもの: ${failed.join(', ')}`);

// 元の PNG を消す。--keep-png なら残す。
// 参照は frames.ts が持っているので、消す前に必ず frames.ts の書き換えを済ませること
if (!KEEP && !failed.length) {
  console.log('\n元の PNG は残してあります。frames.ts の書き換えを確かめてから消してください:');
  console.log('  node tools/png-to-webp.mjs <フォルダ> --delete-png');
}
if (argv.includes('--delete-png')) {
  for (const f of inputs) unlinkSync(f);
  console.log(`元の PNG ${inputs.length}枚を消しました`);
}
