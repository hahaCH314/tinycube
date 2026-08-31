// プリクラ帳の並べ替え（2026-08-24、伊波さん「１枚ずつ選んで並べ替えたい」）
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome() });
const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror', e=>errs.push(e.message.slice(0,90)));
await page.addInitScript(() => {
  window.__seed = async () => {
    const mk = (c,label) => { const cv=document.createElement('canvas'); cv.width=400; cv.height=700;
      const g=cv.getContext('2d'); g.fillStyle=c; g.fillRect(0,0,400,700);
      g.fillStyle='#fff'; g.font='bold 200px sans-serif'; g.textAlign='center'; g.textBaseline='middle';
      g.fillText(label,200,350); return cv.toDataURL('image/jpeg',0.9); };
    const { add } = await import('/src/album.ts');
    for (const [c,l] of [['#c33','A'],['#3a3','B'],['#33c','C'],['#a3a','D']]) await add(mk(c,l),1);
  };
});
await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
const tap = async (t, ms=1000) => { const e=page.locator('button',{hasText:t}).filter({visible:true}).first();
  if(!(await e.count())) return false; await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true; };
const ok = (n,v) => console.log(`  ${v?'OK  ':'NG  '} ${n}`);
await tap('はじめる');
await page.evaluate(() => window.__seed());
await page.reload({ waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);
await tap('はじめる');
ok('プリクラ帳を開く', await tap('プリクラ帳', 2500));
// 並びを読む（見本の絵の中身で判別）
const read = async () => page.evaluate(async () => {
  const out=[];
  for (const c of document.querySelectorAll('.album-cell img')) {
    const i=new Image(); i.src=c.src; await i.decode().catch(()=>{});
    const cv=document.createElement('canvas'); cv.width=i.naturalWidth; cv.height=i.naturalHeight;
    cv.getContext('2d').drawImage(i,0,0);
    const d=cv.getContext('2d').getImageData(5,5,1,1).data;
    const [r,g,b]=d;
    out.push(r>150&&g<100&&b<100?'A':g>120&&r<100?'B':b>150&&r<100?'C':r>120&&b>120?'D':`${r},${g},${b}`);
  }
  return out;
});
const before = await read();
console.log('   はじめの並び:', JSON.stringify(before));
ok('「ならべかえ」がある', await tap('ならべかえ', 600));
const hint = await page.locator('.album-hint').count();
ok('案内が出る', hint > 0);
// 1枚目と3枚目を入れ替える
const cells = page.locator('.album-cell');
await cells.nth(0).click({force:true}); await page.waitForTimeout(400);
await cells.nth(2).click({force:true}); await page.waitForTimeout(1200);
const after = await read();
console.log('   入れかえ後:', JSON.stringify(after));
const want = [...before]; [want[0],want[2]]=[want[2],want[0]];
ok('1枚目と3枚目が入れ替わる', JSON.stringify(after)===JSON.stringify(want));
// 閉じて開き直しても残るか
await tap('戻る', 800);
await tap('プリクラ帳', 2000);
const again = await read();
console.log('   開き直し:', JSON.stringify(again));
ok('閉じても並びが残る', JSON.stringify(again)===JSON.stringify(after));
await page.screenshot({ path: 'tools/_sort.png' });
console.log('エラー:', errs.length?errs:'なし');
await b.close();
