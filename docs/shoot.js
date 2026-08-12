// tinyCUBE 見た目チェック用。デプロイ済みビルドに CSS を差し替えて測る／撮る。
//
//   env -u ELECTRON_RUN_AS_NODE "<electron.exe>" docs/shoot.js 390 844
//   env -u ELECTRON_RUN_AS_NODE "<electron.exe>" docs/shoot.js 844 390 docs/別のCSS
//
// ELECTRON_RUN_AS_NODE が環境に残っていると素の node として動くので必ず外すこと。

const { app, BrowserWindow } = require('electron');
const fs = require('fs');

app.disableHardwareAcceleration();
setTimeout(() => { console.error('ERR timeout'); process.exit(1); }, 90000);

const W = +process.argv[2] || 390;
const H = +process.argv[3] || 844;
const CSS_PATH = process.argv[4] || 'docs/tinycube-skin-shibuya.css';
const URL = process.env.TINYCUBE_URL || 'https://tinycube.vercel.app/';

const AUDIT = `(function () {
  var W = innerWidth, H = innerHeight, out = [];
  var r = function (e) { return e.getBoundingClientRect(); };
  var q = function (s) { return document.querySelector(s); };
  var push = function (ok, m) { out.push((ok ? 'PASS  ' : 'FAIL  ') + m); };
  out.push('viewport ' + W + 'x' + H);

  var btns = [].slice.call(document.querySelectorAll('.effect-btn'));
  var hs = btns.map(function (b) { return +r(b).height.toFixed(2); });
  out.push('effect-btn n=' + btns.length + '  min=' + Math.min.apply(null, hs) + '  max=' + Math.max.apply(null, hs));
  push(Math.min.apply(null, hs) >= 20, 'ボタンの高さ 20px 以上');

  var scL = q('.side-panel.left .panel-scroll'), scR = q('.side-panel.right .panel-scroll');
  push(scL.scrollHeight <= scL.clientHeight + 1, '左レールが収まる (' + scL.scrollHeight + '/' + scL.clientHeight + ')');
  push(scR.scrollHeight <= scR.clientHeight + 1, '右レールが収まる (' + scR.scrollHeight + '/' + scR.clientHeight + ')');

  var bad = [];
  document.querySelectorAll('.app-container *').forEach(function (e) {
    var b = r(e);
    if (!b.width && !b.height) return;
    if (getComputedStyle(e).visibility === 'hidden') return;
    if (b.left < -0.5 || b.right > W + 0.5 || b.top < -0.5 || b.bottom > H + 0.5)
      bad.push((e.className || e.tagName));
  });
  push(!bad.length, '画面外にはみ出していない' + (bad.length ? ' :: ' + bad.slice(0, 5).join(' | ') : ''));
  push(document.documentElement.scrollWidth <= W + 0.5, '横スクロールなし');

  // ★ 見た目だけでは分からない。実際に押せるかを必ず測る
  ['.record-btn-round', '.photo-btn-round', '.pause-btn-round', '.preview-btn-round',
   '.tool-btn-small', '.side-panel.left .effect-btn', '.side-panel.right .effect-btn'
  ].forEach(function (s) {
    var e = q(s);
    if (!e) { out.push('  押せるか ' + s + ' 見つからない'); return; }
    var b = r(e), t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    out.push('  押せるか ' + (e.contains(t) ? 'ok  ' : '覆われている(.' + (t && t.className) + ')  ') + s);
  });

  var sb = r(q('.stage-box'));
  out.push('stage-box ' + sb.width.toFixed(0) + 'x' + sb.height.toFixed(0));
  return out.join('\\n');
})()`;

app.whenReady().then(async () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  const win = new BrowserWindow({ width: W, height: H, useContentSize: true, show: false });
  await win.loadURL(URL);
  await new Promise(r => setTimeout(r, 3500));
  await win.webContents.executeJavaScript(
    'document.querySelectorAll("style,link[rel=\'stylesheet\']").forEach(function(n){n.remove()});' +
    'var s=document.createElement("style"); s.textContent=' + JSON.stringify(css) + ';' +
    'document.head.appendChild(s);' +
    'var b=document.querySelector(".sheet-btn"); if(b)b.click(); true;');
  await new Promise(r => setTimeout(r, 900));
  console.log(await win.webContents.executeJavaScript(AUDIT));
  const out = 'shot-' + W + 'x' + H + '.png';
  fs.writeFileSync(out, (await win.webContents.capturePage()).toPNG());
  console.log('-> ' + out);
  process.exit(0);
}).catch(e => { console.error('ERR ' + e.message); process.exit(1); });
