// ズームが顔ハメ以外の枠に効き続けないか（2026-08-30、Mac のシオンの指摘）
//
// つまみは顔ハメの枠でだけ出るのに、値は枠に関係なく渡しっぱなしだった。
// 0.5 にしてから別の枠へ移ると、映像が縮んで黒帯が出る。しかも
// つまみが消えているので、その画面からは戻せない。
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
// 四隅を見て、黒帯が出ていないかを判定する
const 四隅 = async () => page.evaluate(() => {
  const c = document.querySelector('canvas');
  const g = c.getContext('2d');
  const p = (x,y) => { const d = g.getImageData(x,y,1,1).data; return d[0]+d[1]+d[2]; };
  const m = 12;
  return [p(m,m), p(c.width-m,m), p(m,c.height-m), p(c.width-m,c.height-m)];
});
await tap('はじめる');
// ⚠️ **写真の道で確かめること。** 動画の道だと、戻ったあとに一覧が
//    再表示されず（タイル0件）、枠を選び直せない。ズームの作りは
//    どちらも同じなので、通るほうで見る（2026-08-30）
await tap('写真を撮る');
await tap('自分を写す', 2500);
await tap('フレームを選ぶ', 1200);
// 顔ハメの枠を選ぶ（後ろのほうにまとまっている）
// ⚠️ **顔ハメの枠は名前で選ぶこと。** 位置で当てると、並び順が変わった
//    ときに別の枠を選んでしまう（実際に外して、つまみが出なかった）
// ⚠️ **顔ハメの枠は名前に「顔」が入っていないものが多い**（E9・N9・P9 など）。
//    確実なのは、選んでみて**ズームのつまみが出るか**で判る。
//    出るまで順に試す
let 顔 = null;
const 枚 = await page.locator('.frame-tile').count();
for (let i = 2; i < 枚; i++) {
  const t = page.locator('.frame-tile').nth(i);
  await t.scrollIntoViewIfNeeded().catch(()=>{});
  await t.click({force:true}).catch(()=>{});
  await page.waitForTimeout(150);
  // 顔ハメなら、決定して撮影画面へ行くとつまみが出る（ここでは印だけ見る）
  const 名 = await t.getAttribute('title');
  if (名 && /E9|N9|OL9|P9|s9|ヒーロー|アイドル/.test(名)) { 顔 = t; break; }
}
if (!顔) { console.log('  NG   顔ハメの枠が見つからない'); await b.close(); process.exit(0); }
console.log('     選んだ枠:', await 顔.getAttribute('title'));
await tap('フレーム決定', 1200);
await tap('この設定で撮る', 2500);
// ズームを 0.5 にする
// つまみは畳まれていることがある。開いてから触る
await page.locator('.cam-tune-head, [class*="tune"]').first().click({force:true}).catch(()=>{});
await page.waitForTimeout(600);
const 下調べ = await page.evaluate(() => ({
  つまみ: document.querySelectorAll('.zoom-range').length,
  それらしいもの: [...document.querySelectorAll('input[type=range]')].length,
  枠の名: document.querySelector('.frame-tile.on')?.getAttribute('title') || '?',
}));
console.log('     下調べ:', JSON.stringify(下調べ));
const 効いた = await page.evaluate(() => {
  const r = document.querySelector('.zoom-range');
  if (!r) return false;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(r, '0.5');
  r.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
});
await page.waitForTimeout(1200);
ok('顔ハメでズームをいじれる', 効いた);
// 別の枠（顔ハメでない）に移る
//
// ⚠️ **並び順で選ばないこと。** `.frame-tile` の3番目は、鍵が外れているか
//    どうかで中身が変わる。Mac で走らせたら顔ハメ（sアイドル16）を掴んで
//    しまい、「つまみが隠れない」と誤って NG を出した（2026-08-30）。
//    穴が無いことが確実な「フレームなし」を名指しで選ぶ
await tap('戻る', 1200);
// 一覧が畳まれていることがある。開いてから選ぶ
if (await page.locator('button', { hasText: 'フレームを選ぶ' }).filter({ visible: true }).count()) {
  await tap('フレームを選ぶ', 1800);
}
const 移れた = await page.evaluate(() => {
  const t = [...document.querySelectorAll('.frame-tile')].find(e => /フレームなし/.test(e.textContent));
  if (!t) return false; t.click(); return true;
});
if (!移れた) { console.log('  NG   「フレームなし」が見つからない'); await b.close(); process.exit(0); }
await page.waitForTimeout(300);
await tap('フレーム決定', 1200);
await page.waitForTimeout(1800);
const 隅 = await 四隅();
const つまみ = await page.locator('.zoom-range').count();
console.log(`     四隅の明るさ: ${JSON.stringify(隅)}   つまみ: ${つまみ}`);
ok('別の枠に移ると黒帯が出ない', 隅.every(v => v > 30));
ok('つまみは隠れている（顔ハメでないので）', つまみ === 0);
console.log('  エラー:', errs.length?errs:'なし');
await b.close();
