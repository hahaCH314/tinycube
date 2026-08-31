// 写真と動画が小さくなっていないか（2026-08-30）
//
// ⚠️ 画面に見えている大きさで描くようにしたので、**撮る瞬間に全開へ
//    戻せていないと、小さい写真・小さい動画になる。** そこを見る。
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome(),
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2,
  isMobile:true, hasTouch:true, permissions:['camera','microphone'] });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror', e=>errs.push(e.message.slice(0,80)));
const ok=(n,v)=>console.log(`  ${v?'OK  ':'NG  '} ${n}`);
await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);
const tap = async (t, ms=900) => { const e=page.locator('button',{hasText:t}).filter({visible:true}).first();
  if(!(await e.count())) return false; await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true; };
const canvasの大きさ = () => page.evaluate(() => {
  const c = document.querySelector('canvas');
  return c ? `${c.width}x${c.height}` : 'なし';
});
await tap('はじめる');
await tap('写真を撮る');
await tap('自分を写す', 2500);
await tap('フレームを選ぶ', 1200);
await page.locator('.frame-tile').nth(3).click({force:true}).catch(()=>{});
await tap('フレーム決定', 1200);
await tap('この設定で撮る', 2500);
const ふだん = await canvasの大きさ();
console.log(`     ふだんの canvas: ${ふだん}`);
ok('ふだんは小さく描いている（軽い）', ふだん !== '1920x1080' && ふだん !== '1080x1920');
// 3枚撮る
await tap('3枚撮る', 14000);
await page.waitForTimeout(1500);
await tap('できあがりを見る', 3000);
const 写真 = await page.evaluate(() => {
  const i = document.querySelector('.preview-sheet img');
  return i ? { w: i.naturalWidth, h: i.naturalHeight } : null;
});
console.log(`     できあがり: ${写真 ? `${写真.w}x${写真.h}` : '出なかった'}`);
// 3枚つづり＝1コマ1080幅。用紙は 1128 幅になるはず
ok('写真が小さくなっていない（1128幅）', !!写真 && 写真.w >= 1128);
const 戻った = await canvasの大きさ();
console.log(`     撮り終わったあと: ${戻った}`);
console.log('  エラー:', errs.length?errs:'なし');
await b.close();
