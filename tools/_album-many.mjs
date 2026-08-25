// プリクラ帳に多めに入れて、重なり・スクロールを見る（2026-08-25）
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome() });
const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror', e=>errs.push(e.message.slice(0,90)));
await page.addInitScript(() => {
  window.__seed = async () => {
    const mk = (w,h,c,label) => { const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      const g=cv.getContext('2d'); g.fillStyle=c; g.fillRect(0,0,w,h);
      g.fillStyle='#fff'; g.font=`bold ${Math.round(w/3)}px sans-serif`;
      g.textAlign='center'; g.textBaseline='middle'; g.fillText(label,w/2,h/2);
      return cv.toDataURL('image/jpeg',0.85); };
    const { add } = await import('/src/album.ts');
    const cols=['#c33','#3a3','#33c','#a3a','#3aa','#aa3'];
    for (let i=0;i<18;i++){
      const 横 = i%3===0;
      await add(mk(横?1920:1080, 横?1080:1920, cols[i%6], String(i+1)), 1);
    }
  };
});
await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
const tap = async (t, ms=1000) => { const e=page.locator('button',{hasText:t}).filter({visible:true}).first();
  if(!(await e.count())) return false; await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true; };
await tap('同意してはじめる');
await page.evaluate(() => window.__seed());
await page.reload({ waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
await tap('同意してはじめる');
await tap('プリクラ帳', 3000);
const info = await page.evaluate(() => {
  const scr=document.querySelector('.album-screen');
  const grid=document.querySelector('.album-grid');
  if(!scr||!grid) return {err:'なし'};
  const cells=[...grid.querySelectorAll('.album-cell')];
  const rs=cells.map(c=>c.getBoundingClientRect());
  const over=[];
  for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++){
    const w=Math.min(rs[i].right,rs[j].right)-Math.max(rs[i].left,rs[j].left);
    const h=Math.min(rs[i].bottom,rs[j].bottom)-Math.max(rs[i].top,rs[j].top);
    if(w>1&&h>1) over.push(`${i}と${j}`);
  }
  const cs=getComputedStyle(grid);
  const c0=cells[0], r0=rs[0], r3=rs[3];
  const s0=getComputedStyle(c0);
  return { 枚数:cells.length, 重なり:over.slice(0,8), 重なり数:over.length,
    グリッド:{ 高さ:Math.round(grid.getBoundingClientRect().height),
      中身の高さ:grid.scrollHeight, スクロールできる:grid.scrollHeight>grid.clientHeight+2,
      overflowY:cs.overflowY, display:cs.display, minHeight:cs.minHeight, flex:cs.flex },
    画面:{ h:innerHeight },
    セル: { 幅:Math.round(r0.width), 高さ:Math.round(r0.height),
      aspectRatio:s0.aspectRatio, boxSizing:s0.boxSizing, border:s0.borderTopWidth,
      上:Math.round(r0.top), 次の上:Math.round(r3.top), 差:Math.round(r3.top-r0.top),
      本来:Math.round(r0.height)+12 },
    行の高さ:cs.gridTemplateRows,
    ギャップ:cs.gap };
});
console.log(JSON.stringify(info,null,1));
// 実際にスクロールしてみる
const before = await page.evaluate(()=>document.querySelector('.album-grid').scrollTop);
await page.evaluate(()=>{ document.querySelector('.album-grid').scrollTop = 400; });
await page.waitForTimeout(300);
const after = await page.evaluate(()=>document.querySelector('.album-grid').scrollTop);
console.log('スクロール:', before, '→', after, after>before?'動く':'動かない');
await page.screenshot({ path: 'tools/_album-many.png' });
console.log('エラー:', errs.length?errs:'なし');
await b.close();
