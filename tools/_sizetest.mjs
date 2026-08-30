// canvas を小さくすると本当に軽くなるか（2026-08-30）
//
// ⚠️ **作り込む前に測る。** Mac のシオンから
//    「高精細な端末では dpr のせいで素直にやると軽くならない」
//    という罠を教わった（411×3 = 1233 で 1080 を超える）。
//
// 実際に描いて比べる。大きさ以外は同じ条件。
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome(),
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const ctx = await b.newContext({ viewport:{width:411,height:875},
  isMobile:true, hasTouch:true, permissions:['camera','microphone'] });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);
const r = await page.evaluate(async () => {
  // カメラの映像を1つ用意する
  const st = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
  const v = document.createElement('video');
  v.srcObject = st; v.muted = true; v.playsInline = true;
  await v.play();
  await new Promise(r2 => setTimeout(r2, 600));

  const 測る = (W, H) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    // 空回し
    for (let i = 0; i < 5; i++) g.drawImage(v, 0, 0, W, H);
    g.getImageData(0, 0, 1, 1);
    const 回 = 20;
    const t0 = performance.now();
    for (let i = 0; i < 回; i++) {
      g.drawImage(v, 0, 0, W, H);
      // ⚠️ **1画素読み返して GPU の描き終わりを待つ。**
      //    待たないと命令を積んだ時間しか測れない（Mac のシオンの指摘）
      g.getImageData(0, 0, 1, 1);
    }
    return +((performance.now() - t0) / 回).toFixed(2);
  };
  const dpr = window.devicePixelRatio || 1;
  const 表示W = 411;
  const 結果 = {
    dpr,
    '1920x1080（いま）': 測る(1920, 1080),
    '822x1462（dpr 2 で頭打ち）': 測る(822, 1462),
    '411x731（等倍）': 測る(411, 731),
  };
  st.getTracks().forEach(t => t.stop());
  return 結果;
});
console.log('\n=== canvas の大きさと、1コマにかかる時間（CPU 6倍遅く）===');
console.log(`  この端末の dpr = ${r.dpr}`);
for (const [k, v] of Object.entries(r)) {
  if (k === 'dpr') continue;
  console.log(`  ${k.padEnd(28)} ${String(v).padStart(6)}ms`);
}
const 元 = r['1920x1080（いま）'], 後 = r['822x1462（dpr 2 で頭打ち）'];
console.log(`\n  → dpr 2 に絞ると ${(元/後).toFixed(2)}倍 速い（${元}ms → ${後}ms）`);
await b.close();
