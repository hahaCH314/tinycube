// 穴が2つある絵の、それぞれの位置を測る。
// autumn-frames.mjs は穴を1つの塊としてしか測らないので、2人用の枠で
// 「2つをまとめた大きな四角」になってしまう（2026-08-26、焼肉で発覚）。
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const b = await chromium.launch({ executablePath: await requireChrome() });
const p = await b.newPage();
const data = 'data:image/webp;base64,' + readFileSync(file).toString('base64');
const r = await p.evaluate(async (src) => {
  const im = new Image(); im.src = src; await im.decode();
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const W = c.width, H = c.height;
  // 透明（抜いてある）画素を拾う
  const seen = new Uint8Array(W * H);
  const isHole = i => d[i * 4 + 3] < 40;
  const blobs = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (seen[i] || !isHole(i)) continue;
    // 塗りつぶしで1つの塊を拾う
    let minx = x, maxx = x, miny = y, maxy = y, n = 0;
    const st = [i];
    seen[i] = 1;
    while (st.length) {
      const k = st.pop(); const kx = k % W, ky = (k / W) | 0; n++;
      if (kx < minx) minx = kx; if (kx > maxx) maxx = kx;
      if (ky < miny) miny = ky; if (ky > maxy) maxy = ky;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = kx + dx, ny = ky + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (!seen[ni] && isHole(ni)) { seen[ni] = 1; st.push(ni); }
      }
    }
    if (n > W * H * 0.005) blobs.push({ minx, maxx, miny, maxy, n });
  }
  blobs.sort((a, b) => a.minx - b.minx);
  return { W, H, blobs: blobs.map(v => ({
    x: +(v.minx / W * 100).toFixed(1), y: +(v.miny / H * 100).toFixed(1),
    w: +((v.maxx - v.minx) / W * 100).toFixed(1), h: +((v.maxy - v.miny) / H * 100).toFixed(1),
    pct: +(v.n / (W * H) * 100).toFixed(1) })) };
}, data);
await b.close();
console.log(`  ${file}  (${r.W}x${r.H})`);
console.log(`  見つかった穴: ${r.blobs.length} 個`);
for (const h of r.blobs) console.log(`    { x: ${h.x}, y: ${h.y}, w: ${h.w}, h: ${h.h} }   面積 ${h.pct}%`);
if (r.blobs.length >= 2) {
  console.log('\n  faceHoles: [' + r.blobs.map(h => `{ x: ${h.x}, y: ${h.y}, w: ${h.w}, h: ${h.h} }`).join(', ') + ']');
}
