// インスタ用で顔が切れないか（2026-08-30、伊波さんの投稿で額から上が切れていた）
//
// 顔ハメの穴は画面の上のほうにある。1コマの縦を詰めるとき真ん中を残すと、
// 頭が真っ先に切れる。上を残せているかを、印を置いて確かめる。
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome() });
const page = await (await b.newContext({ viewport:{width:411,height:875} })).newPage();
await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);
// 1コマぶんの絵を作って、いまの計算をそのまま通す
const r = await page.evaluate(() => {
  const CELL_W = 1080, GAP = 24, PAD = 24;
  // 縦1コマ（1080x1920）。上から 15% のところに「顔」の印を置く
  const cell = document.createElement('canvas');
  cell.width = 1080; cell.height = 1920;
  const cg = cell.getContext('2d');
  cg.fillStyle = '#333'; cg.fillRect(0,0,1080,1920);
  cg.fillStyle = '#0f0';                       // 顔の位置（上から15%あたり）
  cg.fillRect(340, 1920*0.10, 400, 1920*0.18);
  const ar = cell.height / cell.width;
  const 試す = (maxCellAR, 上寄せ率) => {
    const CELL_H = Math.round(CELL_W * Math.min(ar, maxCellAR));
    const out = document.createElement('canvas');
    out.width = PAD*2 + CELL_W; out.height = PAD*2 + CELL_H;
    const g = out.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0,0,out.width,out.height);
    const scale = Math.max(CELL_W/cell.width, CELL_H/cell.height);
    const w = cell.width*scale, h = cell.height*scale;
    const はみ出し = h - CELL_H;
    const dy = はみ出し > 0 ? -はみ出し*上寄せ率 : (CELL_H - h)/2;
    g.save(); g.beginPath(); g.rect(PAD, PAD, CELL_W, CELL_H); g.clip();
    g.drawImage(cell, PAD + (CELL_W-w)/2, PAD + dy, w, h);
    g.restore();
    // 緑（顔）がどれだけ残っているか
    const px = g.getImageData(0,0,out.width,out.height).data;
    let 緑 = 0;
    for (let i=0;i<px.length;i+=4) if (px[i+1]>150 && px[i]<100 && px[i+2]<100) 緑++;
    return 緑;
  };
  const 元 = (() => { // 切らないときの顔の量
    const c2 = document.createElement('canvas'); c2.width=1080; c2.height=1920;
    const g2 = c2.getContext('2d'); g2.drawImage(cell,0,0);
    const px = g2.getImageData(0,0,1080,1920).data;
    let n=0; for (let i=0;i<px.length;i+=4) if (px[i+1]>150 && px[i]<100 && px[i+2]<100) n++;
    return n;
  })();
  return {
    元,
    真ん中を残す: 試す(9/16, 0.5),
    上を残す:     試す(9/16, 0.15),
  };
});
const pct = (n) => (n / r.元 * 100).toFixed(0) + '%';
console.log('\n=== インスタ用で顔がどれだけ残るか ===');
console.log(`  切らないとき        ${pct(r.元)}`);
console.log(`  真ん中を残す（前）   ${pct(r.真ん中を残す)}`);
console.log(`  上を残す（いま）     ${pct(r.上を残す)}`);
console.log(r.上を残す > r.真ん中を残す ? '\n  → 上を残すほうが顔が多く残る' : '\n  → 変わらない／悪化');
await b.close();
