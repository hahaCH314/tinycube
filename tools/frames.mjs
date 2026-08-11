// フレームの絵を取り込む道具。
//
//   npm run frames -- <フォルダ|ファイル> ...
//
// やること
//   1. 黒塗りを抜いて透明にする
//   2. WebP にして public/frames/ へ置く
//   3. frames.ts に貼る行を出す
//
// なぜ黒を抜くのか。
// 絵は「まん中が黒く塗られた額縁」として描かれている。そのまま重ねると
// 映像が真っ黒に隠れる。塊ごとに見て、画面の 0.4% 以上あるものだけを抜く。
// 一律に抜くと、飾りの中の黒い線や影にまで穴が開く。
//
// 変換は headless Chrome にやらせている。canvas の toDataURL('image/webp') が
// そのまま使えるので、画像ライブラリを足さずに済む。
//
// 出た WebP は必ず目で見ること。抜きすぎ・抜き足りないは数字だけでは分からない。

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, readdirSync, statSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, extname, resolve } from 'node:path';

const OUT_DIR = resolve('public/frames');
const CHECK = resolve('tools/frames-check.png');   // 出来を目で見るための一覧
// どの枠をどの絵から出したかの覚え書き。同じ絵の作り直しと、
// 別の絵による上書きを見分けるために要る
const MADE_FILE = resolve('tools/frames-made.json');
const MADE = existsSync(MADE_FILE) ? JSON.parse(readFileSync(MADE_FILE, 'utf8')) : {};
const MAX_EDGE = 1400;          // 書き出しは 1920x1080。これ以上大きくしても違いが出ない
const QUALITY = 0.80;           // 43枚で6MB。1枚150KB前後に収めないと、スマホで開くのが重い
const PORT = 9382;
const CHROME = process.env.CHROME_PATH
  || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// --prefix=xxx を付けると、出す名前の頭に付く。
// 01.png のような連番だけのフォルダは、これを付けないと既にある枠と名前がぶつかる
const argv = process.argv.slice(2);
const PREFIX = (argv.find(a => a.startsWith('--prefix=')) || '').slice(9);
// 抜く塊の最小の大きさ（画面に対する％）。既定 0.4。
// 顔ハメのように、絵の中にも暗いところがある絵は上げる。
// 下げすぎると飾りの影まで抜けて、そこから映像が透ける（2026-08-11）
const MIN_PCT = Number((argv.find(a => a.startsWith('--min=')) || '--min=0.4').slice(6));
const args = argv.filter(a => !a.startsWith('--'));
if (!args.length) {
  console.error('使い方: npm run frames -- [--prefix=名前] <フォルダ|ファイル> ...');
  process.exit(1);
}
if (!existsSync(CHROME)) {
  console.error('Chrome が見つかりません。CHROME_PATH で場所を教えてください:', CHROME);
  process.exit(1);
}

// 渡されたものを画像の一覧にする
const inputs = [];
for (const a of args) {
  const p = resolve(a);
  if (!existsSync(p)) { console.error('無い:', p); continue; }
  if (statSync(p).isDirectory()) {
    for (const f of readdirSync(p).sort()) {
      if (/\.(png|webp|jpe?g)$/i.test(f)) inputs.push(join(p, f));
    }
  } else {
    inputs.push(p);
  }
}
if (!inputs.length) { console.error('画像がありません'); process.exit(1); }

// 出す名前。日本語のファイル名はそのままだと URL で扱いにくいので英数字に落とす。
// 当てはまらないものは連番。あとから frames.ts で直せばよい
const WORDS = [
  // 「顔」は先に置く。あとに置くと 犬顔 が face_dog になる（並びを逆にしてから繋ぐため）
  [/顔|かお|face/i, 'face'],
  [/赤|red/i, 'red'], [/青|あお|blue/i, 'blue'], [/緑|みどり|green/i, 'green'],
  [/黄|yellow/i, 'yellow'], [/ピンク|pink/i, 'pink'], [/オレンジ|orange/i, 'orange'],
  [/紫|purple/i, 'purple'], [/白|white/i, 'white'], [/黒|black/i, 'black'],
  [/虹|rainbow/i, 'rainbow'], [/漫画|manga/i, 'manga'],
  [/リボン|ribbon/i, 'ribbon'], [/シャンパン|champagne/i, 'champagne'],
  [/ペンラ|penlight/i, 'penlight'], [/キラ|kira/i, 'kira'],
  [/バンド|band/i, 'band'], [/シティ|city/i, 'city'], [/テレビ|tv/i, 'tv'],
  [/ハイビスカス|hibiscus/i, 'hibiscus'], [/海|sea/i, 'sea'],
  [/犬|dog/i, 'dog'], [/猫|cat/i, 'cat'],
  [/歌舞伎|kabuki/i, 'kabuki'], [/女形|onnagata/i, 'onnagata'],
  [/風呂|bath/i, 'bath'], [/レモン|lemon/i, 'lemon'], [/ゴーヤ|goya/i, 'goya'],
  [/ヲタ|オタ|otaku/i, 'otaku'], [/日本|japan/i, 'japan'],
  [/推し|おし|oshi/i, 'oshi'],
];
function slug(file, i) {
  const base = basename(file, extname(file));
  const head = PREFIX ? PREFIX + '_' : '';
  if (/^[\w-]+$/.test(base)) return head + base.toLowerCase();
  const hit = [];
  for (const [re, w] of WORDS) if (re.test(base) && !hit.includes(w)) hit.push(w);
  return head + (hit.length ? hit.reverse().join('_') : 'frame_' + String(i + 1).padStart(2, '0'));
}

// 同じ名前になるものは、縦横で分ける。
// 16:9 と 9:16 で同じ色の絵が来ると、名前がぶつかって片方が上書きされる
// （2026-08-11、実際にそうなった）。先に全部の名前を出してから重複を見る
const names = inputs.map((f, i) => slug(f, i));
const dup = new Set(names.filter((n, i) => names.indexOf(n) !== i));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'frames-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
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
await send('Page.navigate', { url: 'about:blank' });
await sleep(400);

const done = [];
for (let i = 0; i < inputs.length; i++) {
  const inn = inputs[i];
  let name = names[i];
  const out = () => join(OUT_DIR, name + '.webp');
  const mime = /\.png$/i.test(inn) ? 'image/png' : /\.webp$/i.test(inn) ? 'image/webp' : 'image/jpeg';
  const b64 = readFileSync(inn).toString('base64');

  const code = `(async () => {
    const img = new Image();
    img.src = 'data:${mime};base64,' + ${JSON.stringify(b64)};
    await img.decode();
    const scale = Math.min(1, ${MAX_EDGE} / Math.max(img.width, img.height));
    const W = Math.round(img.width * scale), H = Math.round(img.height * scale);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, W, H);
    const im = g.getImageData(0, 0, W, H);
    const d = im.data;
    const N = W * H;

    // 黒い画素。にじみを拾えるよう、少し明るいところまで含める
    const dark = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      if (d[o + 3] > 8 && d[o] < 42 && d[o + 1] < 42 && d[o + 2] < 42) dark[i] = 1;
    }

    // 繋がっている黒を塊にまとめる
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
        if (x > 0     && dark[p - 1] && label[p - 1] < 0) { label[p - 1] = next; stack[sp++] = p - 1; }
        if (x < W - 1 && dark[p + 1] && label[p + 1] < 0) { label[p + 1] = next; stack[sp++] = p + 1; }
        if (y > 0     && dark[p - W] && label[p - W] < 0) { label[p - W] = next; stack[sp++] = p - W; }
        if (y < H - 1 && dark[p + W] && label[p + W] < 0) { label[p + W] = next; stack[sp++] = p + W; }
      }
      sizes.push(count); next++;
    }

    // 画面の 0.4% 以上ある塊だけ抜く
    const min = N * ${MIN_PCT / 100};
    const kill = sizes.map(s => s >= min);
    let cleared = 0;
    for (let i = 0; i < N; i++) {
      const l = label[i];
      if (l >= 0 && kill[l]) { d[i * 4 + 3] = 0; cleared++; }
    }
    g.putImageData(im, 0, 0);

    // 抜いたあとに残っている黒。額縁の内側が塞がったままなら大きい値になる
    const after = g.getImageData(0, 0, W, H).data;
    let left = 0;
    for (let i = 0; i < N; i++) {
      const o = i * 4;
      if (after[o + 3] > 200 && after[o] < 42 && after[o + 1] < 42 && after[o + 2] < 42) left++;
    }

    return JSON.stringify({
      w: W, h: H,
      killed: kill.filter(Boolean).length,
      clearedPct: +(cleared / N * 100).toFixed(1),
      blackLeftPct: +(left / N * 100).toFixed(2),
      webp: c.toDataURL('image/webp', ${QUALITY}),
    });
  })()`;

  const res = await send('Runtime.evaluate', { expression: code, returnByValue: true, awaitPromise: true });
  const v = res.result?.result?.value;
  if (!v) { console.log('× 失敗', basename(inn)); continue; }
  const r = JSON.parse(v);
  // 縦横で分ける。_w が横（16:9）、_p が縦（9:16）
  if (dup.has(name)) name += r.w >= r.h ? '_w' : '_p';

  // すでにある枠を黙って潰さない。
  // 01.png〜06.png を取り込んだとき、同じ名前だった顔ハメの絵を上書きした。
  // 同じ回の中でも、犬顔が2枚とも dog_face_p になって片方が消えた（2026-08-11）。
  //
  // ただし同じ絵を取り込み直したときは、そのまま上書きしてよい。
  // どの絵から出したものかを覚え書き（frames-made.json）に残して見分ける
  if (existsSync(out()) && MADE[name] !== inn) {
    const taken = name;
    let n = 2;
    while (existsSync(out()) && MADE[name] !== inn) name = taken + '_' + n++;
    console.log(`   ※ ${taken}.webp は別の絵で埋まっています。${name}.webp として出しました`);
  }
  MADE[name] = inn;

  const buf = Buffer.from(r.webp.split(',')[1], 'base64');
  writeFileSync(out(), buf);
  const kb = Math.round(buf.length / 1024);
  const anchor = r.w >= r.h ? 'wide' : 'full';
  done.push({ name, anchor, ...r, kb, src: basename(inn) });
  const warn = r.blackLeftPct > 3 ? '  ← 黒が残っている。目で見ること' : '';
  console.log(
    `${String(i + 1).padStart(2)} ${name.padEnd(16)} ${r.w}x${r.h} ${String(kb).padStart(4)}KB` +
    ` 抜いた${String(r.clearedPct).padStart(5)}%  黒残り${String(r.blackLeftPct).padStart(5)}%${warn}`,
  );
}

// 確認用の一覧を1枚出す。
// 抜けたところをマゼンタで敷いてあるので、黒が残っていれば一目で分かる。
// 数字（黒残り％）だけでは、絵として黒いのか穴が塞がっているのか区別できない
if (done.length) {
  const cells = done.map(d => {
    const b64 = readFileSync(join(OUT_DIR, d.name + '.webp')).toString('base64');
    return `<figure><img src="data:image/webp;base64,${b64}">`
      + `<figcaption>${d.name}<br>黒残り${d.blackLeftPct}%</figcaption></figure>`;
  }).join('');
  const sheet = `<meta charset="utf-8"><style>
    body{margin:0;background:#111;font:11px sans-serif;color:#fff;
      display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:6px}
    figure{margin:0;background:#f0f;display:flex;flex-direction:column}
    img{width:100%;height:150px;object-fit:contain;display:block}
    figcaption{background:#000;padding:2px 4px;text-align:center;line-height:1.3}
  </style>${cells}`;
  const rows = Math.ceil(done.length / 5);
  const tmp = join(profile, 'sheet.html');
  writeFileSync(tmp, sheet, 'utf8');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1100, height: rows * 185 + 20, deviceScaleFactor: 1, mobile: false,
  });
  await send('Page.navigate', { url: 'file:///' + tmp.split(String.fromCharCode(92)).join('/') });
  await sleep(1800);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(CHECK, Buffer.from(shot.result.data, 'base64'));
}

ws.close();
chrome.kill();

console.log('\n--- frames.ts に貼る行 ---');
for (const d of done) {
  console.log(
    `  { id: '${d.name}',`.padEnd(30) +
    `name: '${d.name}',`.padEnd(26) +
    `file: './frames/${d.name}.webp',`.padEnd(38) +
    `anchor: '${d.anchor}' },`,
  );
}
console.log(`\n${done.length}枚。合計 ${done.reduce((a, b) => a + b.kb, 0)}KB`);
console.log('name は日本語に直すこと。');
console.log('出来は tools/frames-check.png で見る（抜けたところがマゼンタ）。');
