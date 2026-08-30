// 顔フレームは重いのか（2026-08-29、伊波さん「顔フレームのカメラが重いのかも」）
//
// 顔フレームは毎コマ clip() で楕円に切り抜いてから映像を描く。
// 普通のフレームにはその処理が無い。差が出るかを見る。
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome(),
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const 測る = async (ラベル, 選ぶ) => {
  const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, permissions:['camera','microphone'] });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1200);
  const tap = async (t, ms=900) => { const e=page.locator('button',{hasText:t}).filter({visible:true}).first();
    if(!(await e.count())) return false; await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true; };
  await tap('同意してはじめる');
  await tap('動画を撮る');
  await tap('自分を写す', 2500);
  await tap('フレームを選ぶ', 1200);
  const 名 = await 選ぶ(page);
  await tap('フレーム決定', 1200);
  await tap('この設定で撮る', 2500);
  // ⚠️ **コマの間隔を測っても意味がない。** 画面の更新（75fps＝13.3ms）に
  //    合わせて待たされるので、描画が速くても遅くても同じ数字になる。
  //    **canvas に実際に描く処理だけ**を、何度も回して測る
  const r = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    // いま画面に出ている絵をそのまま材料にして、同じ大きさの canvas へ
    // 描き写す。ここでは「顔フレームの clip があるかどうか」ではなく、
    // **1920x1080 を1回描くのに何ミリ秒かかるか**を見る
    const w = c.width, h = c.height;
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const g = t.getContext('2d');
    const 回 = 30;
    const t0 = performance.now();
    for (let i = 0; i < 回; i++) g.drawImage(c, 0, 0);
    const 描画 = (performance.now() - t0) / 回;
    // 楕円で切り抜いてから描く（顔フレームがやっていること）
    const t1 = performance.now();
    for (let i = 0; i < 回; i++) {
      g.save(); g.beginPath();
      g.ellipse(w*0.4, h*0.3, w*0.2, h*0.15, 0, 0, Math.PI*2);
      g.clip(); g.drawImage(c, 0, 0); g.restore();
    }
    const 切り抜き = (performance.now() - t1) / 回;
    return { 大きさ: w + 'x' + h,
             描画: +描画.toFixed(2), 切り抜き: +切り抜き.toFixed(2),
             差: +(切り抜き - 描画).toFixed(2) };
  });
  console.log(`  ${ラベル.padEnd(20)} ${r.大きさ}  そのまま ${String(r.描画).padStart(5)}ms  切り抜きあり ${String(r.切り抜き).padStart(5)}ms  差 +${r.差}ms  [${名}]`);
  await ctx.close();
};
console.log('\n=== 顔フレームは重いか ===');
await 測る('フレームなし', async p => {
  await p.locator('.frame-tile').first().click({force:true}).catch(()=>{}); return 'なし'; });
await 測る('普通のフレーム', async p => {
  const t = p.locator('.frame-tile').nth(3);
  await t.click({force:true}).catch(()=>{});
  return (await t.getAttribute('title')) || '?'; });
await 測る('顔フレーム', async p => {
  const n = await p.locator('.frame-tile').count();
  const t = p.locator('.frame-tile').nth(n - 20);
  await t.scrollIntoViewIfNeeded().catch(()=>{});
  await t.click({force:true}).catch(()=>{});
  return (await t.getAttribute('title')) || '?'; });
await b.close();
