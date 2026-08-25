// 季節の限定フレーム（2026-08-25、ヒマワリからの手紙）
// 期間中だけ専用ボタンが出るか、通常の一覧に混ざっていないかを見る
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome(),
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const ok = (n,v) => console.log(`  ${v?'OK  ':'NG  '} ${n}`);

for (const [ラベル, 日付] of [['期間中（10月1日）','2026-10-01T12:00:00'], ['期間外（8月25日）','2026-08-25T12:00:00']]) {
  const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, permissions:['camera','microphone'] });
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror', e=>errs.push(e.message.slice(0,80)));
  // 端末の日付を差し替える
  await page.addInitScript(`{
    const 本物 = Date;
    const ずらす = new 本物('${日付}').getTime() - 本物.now();
    Date = class extends 本物 {
      constructor(...a){ if(!a.length) super(本物.now()+ずらす); else super(...a); }
      static now(){ return 本物.now()+ずらす; }
    };
  }`);
  await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  const tap = async (t, ms=1000) => { const e=page.locator('button',{hasText:t}).filter({visible:true}).first();
    if(!(await e.count())) return false; await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true; };
  console.log(`\n=== ${ラベル} ===`);
  await tap('同意してはじめる');
  await tap('写真を撮る');
  await tap('自分を写す', 2500);
  await tap('フレームを選ぶ', 1500);
  const btn = await page.locator('.season-btn').count();
  const 通常 = await page.locator('.frame-tile').count();
  console.log(`   専用ボタン: ${btn} / 通常の一覧: ${通常}枚`);
  if (日付.includes('-10-')) {
    ok('専用ボタンが出る', btn === 1);
    ok('通常の一覧は 67枚のまま（季節が混ざっていない）', 通常 === 67);
    ok('押すと季節の一覧に変わる', await tap('のフレーム', 1200));
    const 季節 = await page.locator('.frame-tile').count();
    console.log(`   季節の一覧: ${季節}枚`);
    ok('季節のフレームが並ぶ（縦は8枚）', 季節 === 8);
    ok('戻れる', await tap('ふつうのフレームにもどる', 1000));
    ok('戻ると通常の一覧', await page.locator('.frame-tile').count() === 67);
    await page.screenshot({ path: 'tools/_season.png' });
  } else {
    ok('専用ボタンは出ない', btn === 0);
    ok('通常の一覧は 67枚のまま', 通常 === 67);
  }
  console.log('   エラー:', errs.length?errs:'なし');
  await ctx.close();
}
await b.close();
