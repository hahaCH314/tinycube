import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome(),
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2,
  isMobile:true, hasTouch:true, permissions:['camera','microphone'] });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror', e=>errs.push(e.message.slice(0,60)));
await page.goto('http://localhost:5340/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
const tap = async (t, ms=1200) => { const e=page.locator('button',{hasText:t}).filter({visible:true}).first();
  if(!(await e.count())) return false; await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true; };
const ok=(n,v)=>console.log(`  ${v?'OK  ':'NG  '} ${n}`);
await tap('はじめる'); await tap('写真を撮る'); await tap('自分を写す',2500);
await tap('フレームを選ぶ'); await page.waitForTimeout(1500);
// 全部読み込ませる
await page.evaluate(async()=>{ const el=document.querySelector('.frame-picker')||document.scrollingElement;
  for(let i=0;i<60;i++){ el.scrollTop+=300; await new Promise(r=>setTimeout(r,30)); } el.scrollTop=0; });
await page.waitForTimeout(1500);
const g = await page.evaluate(() => {
  const ts=[...document.querySelectorAll('.frame-tile')];
  const rs=ts.map(t=>t.getBoundingClientRect());
  // 重なり
  let over=0;
  for(let i=0;i<rs.length;i++) for(let j=i+1;j<rs.length;j++){
    if(Math.min(rs[i].right,rs[j].right)-Math.max(rs[i].left,rs[j].left)>1 &&
       Math.min(rs[i].bottom,rs[j].bottom)-Math.max(rs[i].top,rs[j].top)>1) over++;
  }
  const flags=ts.map(t=>t.classList.contains('locked'));
  const firstLocked=flags.indexOf(true), lastFree=flags.lastIndexOf(false);
  const imgs=[...document.querySelectorAll('.frame-tile img')];
  return { タイル:ts.length, 重なり:over,
    鍵つき:flags.filter(Boolean).length,
    鍵は後ろか: firstLocked===-1 || firstLocked>lastFree,
    絵が出ていない: imgs.filter(i=>!i.naturalWidth).length,
    画面に見えている絵: imgs.filter(i=>{ const r=i.getBoundingClientRect();
      return r.bottom>0 && r.top<innerHeight; }).length,
    見えていて出ていない: imgs.filter(i=>{ const r=i.getBoundingClientRect();
      return r.bottom>0 && r.top<innerHeight && !i.naturalWidth; }).length,
    読み込み待ち: imgs.filter(i=>i.loading==='lazy' && !i.naturalWidth).length,
    横スクロール: document.documentElement.scrollWidth > innerWidth+1,
    はみ出し: rs.filter(r=>r.right>innerWidth+1).length };
});
ok(`フレーム${g.タイル}枚・重なり${g.重なり}`, g.重なり===0);
ok(`鍵つき${g.鍵つき}枚が後ろ`, g.鍵は後ろか);
ok(`見えている絵は全部出る（見えて未読${g.見えていて出ていない}）`, g.見えていて出ていない===0);
console.log(`     参考: 全${g.タイル}枚中 未読${g.絵が出ていない}（画面外の遅延読み込み${g.読み込み待ち}）`);
ok('横スクロールなし', !g.横スクロール && g.はみ出し===0);
// 鍵つきを押すと買う画面
const lk = page.locator('.frame-tile.locked').first();
await lk.click({force:true}).catch(()=>{});
await page.waitForTimeout(1500);
ok('鍵つき→買う画面', (await page.locator('text=/¥300/').count())>0);
// 無料のものは選べる
await tap('戻る', 800);
await page.waitForTimeout(800);
const free = page.locator('.frame-tile:not(.locked)').nth(3);
await free.click({force:true}).catch(()=>{});
await page.waitForTimeout(1000);
ok('無料は選べる', (await page.locator('.frame-tile.on').count())>0);
await tap('フレーム決定',2500); await tap('この設定で撮る',2500);
await tap('3枚撮る',14000); await page.waitForTimeout(1200);
ok('できあがりを見る', await tap('できあがりを見る',3000));
const pv = await page.evaluate(() => {
  const box=document.querySelector('.preview-sheet'), im=document.querySelector('.preview-sheet img');
  if(!box||!im) return null;
  const b=box.getBoundingClientRect(), i=im.getBoundingClientRect();
  return { 収まる: i.height<=b.height+2 && i.width<=b.width+2, 画面内: b.bottom<=innerHeight+1 };
});
ok('3連が枠に収まる', pv && pv.収まる && pv.画面内);
await page.locator('button:has-text("これで保存")').first().click({force:true}).catch(()=>{});
await page.waitForTimeout(1000);
ok('行き先を4つ聞く', (await page.locator('.where-btn').count())===4);
await page.locator('.where-btn').filter({hasText:'プリクラ帳だけ'}).first().click({force:true}).catch(()=>{});
await page.waitForTimeout(2500);
await tap('プリクラ帳',2500);
const al = await page.evaluate(() => {
  const cs=[...document.querySelectorAll('.album-cell')];
  const rs=cs.map(c=>c.getBoundingClientRect());
  let over=0;
  for(let i=0;i<rs.length;i++) for(let j=i+1;j<rs.length;j++){
    if(Math.min(rs[i].right,rs[j].right)-Math.max(rs[i].left,rs[j].left)>0.5 &&
       Math.min(rs[i].bottom,rs[j].bottom)-Math.max(rs[i].top,rs[j].top)>0.5) over++;
  }
  const g=document.querySelector('.album-grid');
  return { 枚数:cs.length, 重なり:over, 横スクロール: g.scrollWidth>g.clientWidth+1 };
});
ok(`プリクラ帳 ${al.枚数}枚・重なり${al.重なり}・横スクロール${al.横スクロール?'あり':'なし'}`,
   al.枚数===3 && al.重なり===0 && !al.横スクロール);
console.log('  エラー:', errs.length?errs.slice(0,2).join(' / '):'なし');
await b.close();
