// 形の違う写真を混ぜて、プリクラ帳の並びが崩れないか見る
// （2026-08-24、伊波さん「上は重なって」「下は小さく表示されてる」）
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome() });
const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror', e=>errs.push(e.message.slice(0,90)));

// いろんな形の写真を直接しまう。3段シート・縦1コマ・横1コマを混ぜる
await page.addInitScript(() => {
  window.__seed = async () => {
    const mk = (w,h,c) => { const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      const g=cv.getContext('2d'); g.fillStyle=c; g.fillRect(0,0,w,h);
      g.fillStyle='#fff'; g.font=`bold ${Math.round(w/6)}px sans-serif`; g.fillText(`${w}x${h}`,10,h/2);
      return cv.toDataURL('image/jpeg',0.9); };
    const shots = [
      mk(1128,5856,'#c33'),  // 3段シート（昔のもの）
      mk(1080,1920,'#3a3'),  // 縦1コマ
      mk(1920,1080,'#33c'),  // 横1コマ
      mk(1080,1920,'#a3a'),
      mk(1920,1080,'#3aa'),
      mk(1128,5856,'#aa3'),
    ];
    const { add } = await import('/src/album.ts');
    for (const s of shots) await add(s, 1);
  };
});
await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
const tap = async (t, ms=1200) => { const e=page.locator('button',{hasText:t}).filter({visible:true}).first();
  if(!(await e.count())) return false; await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true; };
await tap('はじめる');
await page.evaluate(() => window.__seed());
await page.waitForTimeout(2000);
await page.reload({ waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
await tap('はじめる');
await tap('プリクラ帳', 3000);
await page.screenshot({ path: 'tools/_album-mix.png', fullPage: false });
const info = await page.evaluate(() => {
  const scr = document.querySelector('.album-screen'); if(!scr) return {err:'なし'};
  const cells=[...scr.querySelectorAll('.album-cell')];
  const rs=cells.map(c=>c.getBoundingClientRect());
  const over=[];
  for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){
    const w=Math.min(rs[i].right,rs[j].right)-Math.max(rs[i].left,rs[j].left);
    const h=Math.min(rs[i].bottom,rs[j].bottom)-Math.max(rs[i].top,rs[j].top);
    if(w>1&&h>1) over.push(`${i}と${j}が ${Math.round(w)}x${Math.round(h)} 重なる`);
  }
  return { 枚数: cells.length, 重なり: over,
    高さ: rs.map(r=>Math.round(r.height)),
    クラス: cells.map(c=>c.className.includes('is-wide')?'横':'縦') };
});
console.log(JSON.stringify(info,null,1));
console.log('エラー:', errs.length?errs:'なし');
await b.close();
