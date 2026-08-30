// 戻る → フレーム選び直しで固まるか（2026-08-30、伊波さん
// 「戻るでフレームの選び直しするとかたまるのかも」）
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome(),
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2,
  isMobile:true, hasTouch:true, permissions:['camera','microphone'] });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror', e=>errs.push(e.message.slice(0,90)));
const ok=(n,v)=>console.log(`  ${v?'OK  ':'NG  '} ${n}`);
await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);
const tap = async (t, ms=900) => { const e=page.locator('button',{hasText:t}).filter({visible:true}).first();
  if(!(await e.count())) return false; await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true; };
// 描画ループが生きているか（canvas が変化し続けるか）で「固まった」を判定する
// ⚠️ **canvas の中身で判定しない。** テスト用のカメラ映像は動きが少なく、
//    止まっていなくても変化が拾えないことがある。
//    **描画ループそのものが回っているか**を数える
const 生きてる = async () => {
  await page.evaluate(() => { window.__f = 0;
    const f = () => { window.__f++; requestAnimationFrame(f); };
    requestAnimationFrame(f); });
  const a = await page.evaluate(() => window.__f);
  await page.waitForTimeout(700);
  const b2 = await page.evaluate(() => window.__f);
  // 画面が応答していれば 700ms で 30 コマ以上進む
  return (b2 - a) > 20;
};
await tap('同意してはじめる');
await tap('写真を撮る');
await tap('自分を写す', 2500);
ok('カメラが動いている', await 生きてる());
await tap('フレームを選ぶ', 1200);
await page.locator('.frame-tile').nth(3).click({force:true}).catch(()=>{});
await tap('フレーム決定', 1500);
ok('1回目：枠を決めたあとも動いている', await 生きてる());
// ここから「戻る」で選び直す
for (let i = 1; i <= 3; i++) {
  const 戻れた = await tap('戻る', 1200);
  const あと = await page.locator('.frame-tile').count();
  await page.locator('.frame-tile').nth(3 + i).click({force:true}).catch(()=>{});
  await tap('フレーム決定', 1500);
  const 動く = await 生きてる();
  console.log(`  ${動く?'OK  ':'NG  '} ${i}回目：戻る→選び直し（戻るボタン:${戻れた?'あり':'なし'} 一覧:${あと}枚）`);
  if (!動く) break;
}
console.log('  エラー:', errs.length?errs:'なし');
await b.close();
