// カメラの描画がどれだけ重いかを測る。
//
// ⚠️ **CPU を絞らないと意味がない。** 開発機の Chrome では 75fps 出てしまい、
//    伊波さんの端末で起きているカクつきが再現できない（2026-08-29、
//    Windows のシオン「実機の重さが再現できません」）。
//    CDP の Emulation.setCPUThrottlingRate で機械を遅くして測る。
//
//    node tools/_fps.mjs        … 6倍遅く（既定。安めのスマホのつもり）
//    node tools/_fps.mjs 1      … 絞らない（素の開発機）
//
// ⚠️ **絶対値ではなく「顔ハメあり／なし」の差を見ること。**
//    絞り方は本物の端末とは違うので、fps そのものは当てにならない。
//
// ⚠️ **?fps=2（厳密モード）で開くこと。** 1画素読み返して GPU の描き終わりを
//    待たないと、描画の時間が 0.1ms しか出ない（積んだだけで戻ってくるため）。
//
// 鍵つきフレームを選ぶために、この測定のあいだだけ解除の印を入れている
// （localStorage。手元のブラウザの中だけの話で、配信物には何も入らない）。
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';

const RATE = Number(process.argv[2] ?? 6);
/** 顔ハメの枠。上から順に、一覧に居たものを使う */
const FACE = ['white.webp', 'black.webp', 'frame_13.webp', 'frame_06.webp'];
/** 顔ハメではない、ふつうの枠 */
const PLAIN = ['tc_fun.webp', 'tc_otaku.webp', 'retro_pop.webp'];

const b = await chromium.launch({ executablePath: await requireChrome(),
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2,
  isMobile:true, hasTouch:true, permissions:['camera','microphone'] });
const page = await ctx.newPage();
const errs=[];
page.on('pageerror', e => errs.push(e.message.slice(0,80)));
await page.addInitScript(() => localStorage.setItem('tinycube.unlock.play','1'));

const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });

const tap = async (t, ms=1200) => {
  const e = page.locator('button',{hasText:t}).filter({visible:true}).first();
  if(!(await e.count())) return false;
  await e.click({force:true}).catch(()=>{}); await page.waitForTimeout(ms); return true;
};

/** 一覧を開いて枠を1つ選び、撮影画面まで戻る。src が null なら「フレームなし」
 *
 *  ⚠️ **撮影画面には「フレームを選ぶ」が無い**（戻る／❓／🏠／📸3枚撮る だけ）。
 *     2枚目を測るときは、いったん「戻る」で設定画面へ帰ること */
const pick = async (src) => {
  for (let i = 0; i < 3; i++) {
    if (await page.locator('button',{hasText:'フレームを選ぶ'}).filter({visible:true}).count()) break;
    await tap('戻る', 1500);
  }
  await tap('フレームを選ぶ', 2500);
  const got = await page.evaluate((want) => {
    const tiles = [...document.querySelectorAll('.frame-tile')];
    const hit = want
      ? tiles.find(e => want.some(w => (e.querySelector('img')?.getAttribute('src')||'').split('/').pop().startsWith(w)))
      : tiles.find(e => /フレームなし/.test(e.textContent));
    if (!hit) return null;
    hit.click();
    return (hit.querySelector('img')?.getAttribute('src')||'フレームなし').split('/').pop();
  }, src);
  if (!got) return null;
  await page.waitForTimeout(900);
  await tap('フレーム決定', 2000);
  await tap('この設定で撮る', 3000);
  return got;
};

// 覗き窓は1秒ごとに書き換わる。落ち着くまで捨ててから3回読んで真ん中を取る
const measure = async (label) => {
  await page.waitForTimeout(2500);
  const seen = [];
  for (let i=0; i<3; i++) {
    await page.waitForTimeout(1150);
    const t = await page.evaluate(() => document.getElementById('fps-meter')?.textContent ?? '');
    const m = /^(\d+)fps\s+描画\s+([\d.]+)ms/.exec(t);
    if (m) seen.push({ fps:+m[1], ms:+m[2], note:(t.split('\n')[1]||'').trim() });
  }
  if (!seen.length) { console.log(`  NG   ${label}：覗き窓が読めない（?fps=2 が効いていない）`); return null; }
  const mid = seen.sort((a,c)=>a.ms-c.ms)[Math.floor(seen.length/2)];
  console.log(`  ${label}   ${String(mid.fps).padStart(3)}fps   1コマ ${mid.ms.toFixed(1)}ms   ${mid.note}`);
  return mid;
};

console.log(`\n=== カメラの重さ（CPU ${RATE}倍遅く）===\n`);
await page.goto('http://localhost:5440/?fps=2', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(2000);
await tap('はじめる');
await tap('写真を撮る');
await tap('自分を写す', 3000);

if (!await pick(null)) { console.log('  NG   「フレームなし」が見つからない'); await b.close(); process.exit(1); }
const bare = await measure('枠なし  ');

const gotP = await pick(PLAIN);
if (!gotP) { console.log('  NG   ふつうの枠が一覧に無い'); await b.close(); process.exit(1); }
const plain = await measure('ふつうの枠');

const gotF = await pick(FACE);
if (!gotF) { console.log('  NG   顔ハメの枠が一覧に無い'); await b.close(); process.exit(1); }
const face = await measure('顔ハメ  ');

if (bare && plain && face) {
  console.log(`\n  ふつうの枠=${gotP}  顔ハメ=${gotF}`);
  console.log(`  1コマ 16.6ms を超えると 60fps に届かない`);
  console.log(`\n  顔ハメは、ふつうの枠より ${(plain.ms/face.ms).toFixed(2)}倍 ${plain.ms > face.ms ? '軽い' : '重い'}`);
}
console.log(`\n■ エラー: ${errs.length ? errs.join(' / ') : 'なし'}`);
await b.close();
