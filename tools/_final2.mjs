import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2,
  isMobile:true, hasTouch:true, permissions:['camera','microphone'] });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror', e=>errs.push(e.message.slice(0,60)));
await page.goto('http://localhost:5020/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
const tap = async (t, ms=1200) => { const e=page.locator('button',{hasText:t}).filter({visible:true}).first();
  if(!(await e.count())) return false; await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true; };
const ok=(n,v)=>console.log(`  ${v?'OK  ':'NG  '} ${n}`);
await tap('同意してはじめる');
// ピンクの影
const pink = await page.evaluate(() => [...document.querySelectorAll('*')]
  .filter(e=>e.offsetParent && getComputedStyle(e).textShadow.includes('255, 79, 163')).length);
ok(`文字のピンクの影が無い（${pink}）`, pink===0);
await tap('写真を撮る'); await tap('自分を写す',3000);
// カメラの画質
const cam = await page.evaluate(() => {
  const v=document.querySelector('video');
  return v ? { w:v.videoWidth, h:v.videoHeight } : null; });
ok(`カメラが開く・画質 ${cam?cam.w+'x'+cam.h:'なし'}`, !!cam && cam.w>=1280);
await tap('フレームを選ぶ'); await tap('フレーム決定',2500); await tap('この設定で撮る',3000);
await page.waitForTimeout(2000);
// 下端の線／映像が動く
const cv = await page.evaluate(async () => {
  const c=document.querySelector('canvas'); const g=c.getContext('2d');
  const bot=g.getImageData(0,c.height-1,c.width,1).data;
  const up=g.getImageData(0,c.height-3,c.width,1).data;
  let d=0; for(let i=0;i<bot.length;i+=4)
    d+=Math.abs(bot[i]-up[i])+Math.abs(bot[i+1]-up[i+1])+Math.abs(bot[i+2]-up[i+2]);
  const s=new Set(); const snap=()=>g.getImageData(c.width/2|0,c.height/2|0,6,6).data.join(',');
  for(let i=0;i<10;i++){ s.add(snap()); await new Promise(r=>setTimeout(r,110)); }
  return { 線:Math.round(d/(bot.length/4)), 動き:s.size };
});
ok(`下端に線が無い（差 ${cv.線}）`, cv.線 < 12);
ok(`映像が動く（違う絵 ${cv.動き}/10）`, cv.動き>1);
await tap('3枚撮る',14000); await page.waitForTimeout(1500);
await tap('できあがりを見る',3000);
// 3連が全部入る
const pv = await page.evaluate(() => {
  const box=document.querySelector('.preview-sheet'), im=document.querySelector('.preview-sheet img');
  const bb=box.getBoundingClientRect(), ir=im.getBoundingClientRect();
  const sc=Math.min(ir.width/im.naturalWidth, ir.height/im.naturalHeight);
  return { 収まる: im.naturalHeight*sc <= ir.height+1, 画面内: bb.bottom<=innerHeight+1 };
});
ok('3連が全部入る・画面内', pv.収まる && pv.画面内);
await page.locator('button:has-text("これで保存")').first().click({force:true}).catch(()=>{});
await page.waitForTimeout(1000);
await page.locator('.where-btn').filter({hasText:'プリクラ帳だけ'}).first().click({force:true}).catch(()=>{});
await page.waitForTimeout(2500);
// 保存後に「なにを撮る？」へ戻る
const back = await page.evaluate(() => ({
  見出し:(document.querySelector('.setup-section-title')||{}).textContent,
  最初の段:(document.querySelector('.setup-close-btn')||{}).textContent }));
ok(`保存後に最初の画面へ（${back.見出し}／${back.最初の段}）`,
   back.見出し==='なにを撮る？' && back.最初の段==='終わる');
await tap('プリクラ帳',2000);
const al = await page.evaluate(() => {
  const cs=[...document.querySelectorAll('.album-cell')];
  const hs=[...new Set(cs.map(c=>Math.round(c.getBoundingClientRect().height)))];
  return { 枚数:cs.length, 高さ:hs };
});
ok(`プリクラ帳の高さが揃う（${al.枚数}枚 / ${al.高さ.join(',')}）`, al.高さ.length===1);
console.log('  エラー:', errs.length?errs.slice(0,2).join(' / '):'なし');
await b.close();
