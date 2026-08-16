import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const page = await (await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2,
  isMobile:true, hasTouch:true, permissions:['camera','microphone'] })).newPage();
const errs=[]; page.on('pageerror', e=>errs.push(e.message.slice(0,80)));
page.on('requestfailed', r => { if(/frames/.test(r.url())) errs.push('読めない: '+r.url().split('/').pop()); });
await page.goto('http://localhost:4610/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
const tap = async (t, ms=1200) => { const e=page.locator('button',{hasText:t}).filter({visible:true}).first();
  if(!(await e.count())) return false; await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true; };
await tap('同意してはじめる'); await tap('動画を撮る'); await tap('自分を写す',2200);
await tap('フレームを選ぶ'); await page.waitForTimeout(2000);
// 全部スクロールして読み込ませる
await page.evaluate(async () => { const el=document.querySelector('.frame-picker')||document.body;
  for(let i=0;i<40;i++){ el.scrollTop += 400; await new Promise(r=>setTimeout(r,50)); } });
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const imgs=[...document.querySelectorAll('.frame-tile img')];
  const ng=imgs.filter(i=>!i.naturalWidth);
  return { タイル数: document.querySelectorAll('.frame-tile').length,
    絵の数: imgs.length, 出ていない: ng.length,
    出ていない例: ng.slice(0,5).map(i=>i.src.split('/').pop()),
    最初の1枚: imgs[0] ? { src: imgs[0].src.split('/').pop(),
      幅: imgs[0].naturalWidth, 表示幅: Math.round(imgs[0].getBoundingClientRect().width) } : null };
});
console.log(JSON.stringify(r, null, 1));
console.log('エラー:', errs.length ? errs.slice(0,4).join(' / ') : 'なし');
await page.screenshot({ path:'C:/Users/syunp/AppData/Local/Temp/tiles.png' });
await b.close();
