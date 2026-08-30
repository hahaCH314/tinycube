// 実物で確かめる（2026-08-30）。形を崩さずに 4:5 へ収まるか
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome() });
const page = await (await b.newContext({ viewport:{width:411,height:875} })).newPage();
await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);
// アプリの toInstaSheet と同じ計算を、実際の用紙の形で通す
const r = await page.evaluate(() => {
  const RATIO = 5/4;
  const 試す = (w, h) => {
    let ow, oh;
    if (h/w > RATIO) { ow = w; oh = Math.round(w*RATIO); }
    else { oh = h; ow = Math.round(h/RATIO); }
    const s = Math.min(ow/w, oh/h);
    return { 用紙:`${w}x${h}`, 比:+(h/w).toFixed(2),
             仕上がり:`${ow}x${oh}`, 仕上がり比:+(oh/ow).toFixed(3),
             写真:(s*100).toFixed(0)+'%' };
  };
  return {
    '縦で撮る（1コマ 1080x1920）': 試す(1128, 5856),
    '横で撮る（1コマ 1920x1080）': 試す(1128, 1920),
  };
});
console.log('\n=== 形を崩さずに 4:5 へ ===');
for (const [k,v] of Object.entries(r)) {
  console.log(`  ${k}`);
  console.log(`    用紙 ${v.用紙}（比 ${v.比}） → ${v.仕上がり}（比 ${v.仕上がり比}）  写真は ${v.写真}`);
  console.log(`    ${v.仕上がり比 <= 1.251 ? 'OK  4:5 に収まる' : 'NG'}／形は元のまま`);
}
await b.close();
