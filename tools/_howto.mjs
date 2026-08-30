// 落とした exe の開き方が出るか（2026-08-27）。CMCUBE の HP を 5460 で
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome() });
const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror', e=>errs.push(e.message.slice(0,80)));
const ok=(n,v)=>console.log(`  ${v?'OK  ':'NG  '} ${n}`);
// ダウンロードは始めさせない（実際に208MB落とさないため）
// ⚠️ **route で止めると、リンクを押した扱いにならないことがある。**
//    ダウンロードそのものを受け取って捨てる（208MB は落とさない）
page.on('download', d => d.cancel().catch(()=>{}));
await page.goto('http://localhost:5460/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1200);
ok('押す前は出ていない', await page.locator('.dl-howto').count() === 0);
await page.locator('.buy-btn').click({force:true}).catch(()=>{});
await page.waitForTimeout(800);
ok('押したら出る', await page.locator('.dl-howto').count() === 1);
const steps = await page.locator('.dl-howto-steps li').allTextContents();
console.log('   手順:', steps.length + 'つ');
steps.forEach((s,i)=>console.log(`     ${i+1}. ${s}`));
ok('手順が3つある', steps.length === 3);
ok('「詳細情報」が書いてある', steps.some(s=>s.includes('詳細情報')));
ok('「実行」が書いてある', steps.some(s=>s.includes('実行')));
const note = await page.locator('.dl-howto-note').textContent().catch(()=>null);
ok('危険ではないと説明している', !!note && note.includes('問題があるという意味ではありません'));
// はみ出していないか
const 収まる = await page.evaluate(() => {
  const e=document.querySelector('.dl-howto'); if(!e) return false;
  const r=e.getBoundingClientRect();
  return r.left >= -1 && r.right <= innerWidth + 1;
});
ok('画面からはみ出さない', 収まる);
await page.screenshot({ path: 'tools/_howto.png' });
console.log('   エラー:', errs.length?errs:'なし');
await b.close();
