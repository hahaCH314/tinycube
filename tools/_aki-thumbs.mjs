// 秋フレームの見本を作る（2026-08-27、伊波さん「よみこみも遅い」）。
//
// ⚠️ **見本を作り忘れていた。** 他の130枚は frames/thumb/ に 320px・20KB の
//    見本があるのに、秋の12枚だけ無く、一覧が**本体（160〜270KB）を
//    そのまま読んでいた**。10倍重い。
//
// 一覧は f.file の 'frames/' を 'frames/thumb/' に差し替えて読む（App.tsx）。
// 同じ名前で thumb/ に置けばよい。
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome() });
const page = await b.newPage();
const 元 = 'public/frames', 先 = 'public/frames/thumb';
const files = fs.readdirSync(元).filter(f => f.startsWith('aki_') && f.endsWith('.webp'));
for (const f of files) {
  const b64 = fs.readFileSync(path.join(元, f)).toString('base64');
  const out = await page.evaluate(async (d) => {
    const img = new Image(); img.src = 'data:image/webp;base64,' + d;
    await img.decode();
    // 長辺 320px にそろえる（他の見本と同じ）
    const s = 320 / Math.max(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext('2d');
    // ⚠️ **透明を保つこと。** 穴が抜けている絵なので、白で埋めてはいけない
    g.drawImage(img, 0, 0, c.width, c.height);
    return { url: c.toDataURL('image/webp', 0.8), w: c.width, h: c.height };
  }, b64);
  fs.writeFileSync(path.join(先, f), Buffer.from(out.url.split(',')[1], 'base64'));
  const kb = Math.round(fs.statSync(path.join(先, f)).size / 1024);
  const 元kb = Math.round(fs.statSync(path.join(元, f)).size / 1024);
  console.log(`  ${f.padEnd(22)} ${out.w}x${out.h}  ${String(kb).padStart(3)}KB  （本体 ${元kb}KB）`);
}
await b.close();
