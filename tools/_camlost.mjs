// カメラを取り上げられたときに気づくか（2026-08-30、Mac のシオンの指摘）
//
// OS がカメラを取り上げると、トラックだけが ended になる。
// <video> は最後のコマを持ったまま videoWidth を返すので、
// 描画ループは静止画を描き続け、アプリは何も気づかない。
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
await tap('同意してはじめる');
await tap('動画を撮る');
await tap('自分を写す', 2500);
await tap('フレームを選ぶ', 1200);
await page.locator('.frame-tile').nth(3).click({force:true}).catch(()=>{});
await tap('フレーム決定', 1200);
await tap('この設定で撮る', 2500);
const 状態 = async () => page.evaluate(() => {
  const v = document.querySelector('video');
  const s = v && v.srcObject;
  const t = s && s.getVideoTracks ? s.getVideoTracks()[0] : null;
  const info = document.querySelector('.cam-info');
  return { トラック: t ? t.readyState : 'なし',
           知らせ: info ? info.textContent.trim().slice(0,30) : '（無し）' };
});
const a = await 状態();
ok('ふつうに写っている（トラック live）', a.トラック === 'live');
console.log(`     知らせ: ${a.知らせ}`);
// カメラを取り上げる
await page.evaluate(() => {
  const v = document.querySelector('video');
  const t = v.srcObject.getVideoTracks()[0];
  t.stop();                       // OS に取り上げられた状態を作る
  t.dispatchEvent(new Event('ended'));
});
await page.waitForTimeout(2500);
const c = await 状態();
console.log(`     取り上げたあと … トラック:${c.トラック}  知らせ:${c.知らせ}`);
ok('気づいて知らせが出る', c.知らせ !== '（無し）');
ok('繋ぎ直そうとする（live に戻る）', c.トラック === 'live');
console.log('  エラー:', errs.length?errs:'なし');
await b.close();
