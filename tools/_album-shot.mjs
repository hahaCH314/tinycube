// プリクラ帳の見た目を撮る（2026-08-24、伊波さん「表示が崩れてる」）
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome(),
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2,
  isMobile:true, hasTouch:true, permissions:['camera','microphone'] });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror', e=>errs.push(e.message.slice(0,90)));
await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
const tap = async (t, ms=1200) => { const e=page.locator('button',{hasText:t}).filter({visible:true}).first();
  if(!(await e.count())) return false; await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true; };
await tap('はじめる');
await tap('写真を撮る');
await tap('自分を写す', 2500);
await tap('フレームを選ぶ');
await tap('フレーム決定', 2000);
await tap('この設定で撮る', 2500);
await tap('3枚撮る', 14000);
await page.waitForTimeout(1500);
await tap('できあがりを見る', 3000);
await page.locator('button').filter({hasText:'これで保存する'}).first().click({force:true}).catch(()=>{});
await page.waitForTimeout(1200);
await page.locator('.where-btn').filter({hasText:'プリクラ帳だけ'}).first().click({force:true}).catch(()=>{});
await page.waitForTimeout(3000);
await tap('プリクラ帳', 2500);
await page.screenshot({ path: 'tools/_album.png' });
// 崩れの手がかりを測る
const info = await page.evaluate(() => {
  const scr = document.querySelector('.album-screen');
  if (!scr) return {err:'album-screen なし'};
  const imgs = [...scr.querySelectorAll('img')];
  return {
    枚数: imgs.length,
    重なり: (() => {
      const cs=[...scr.querySelectorAll('.album-cell')].map(c=>c.getBoundingClientRect());
      const out=[];
      for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++){
        const a=cs[i],b=cs[j];
        const w=Math.min(a.right,b.right)-Math.max(a.left,b.left);
        const h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
        if(w>1&&h>1) out.push(i+'と'+j+' 重なり'+Math.round(w)+'x'+Math.round(h));
      }
      return out;
    })(),
    セル高さ: [...scr.querySelectorAll('.album-cell')].map(c=>Math.round(c.getBoundingClientRect().height)),
    セル: [...scr.querySelectorAll('.album-cell')].slice(0,3).map(c => ({
      クラス: c.className,
      回転: getComputedStyle(c.querySelector('img')).transform.slice(0,40),
      枠比: (c.getBoundingClientRect().height / c.getBoundingClientRect().width).toFixed(2),
    })),
    画面: { w: innerWidth, h: innerHeight },
    絵: imgs.slice(0,6).map(i => {
      const r = i.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height),
        x: Math.round(r.x), y: Math.round(r.y),
        自然: i.naturalWidth+'x'+i.naturalHeight,
        はみ出し: r.right > innerWidth + 1 || r.left < -1 };
    }),
  };
});
console.log(JSON.stringify(info, null, 1));
console.log('エラー:', errs.length?errs:'なし');
await b.close();
