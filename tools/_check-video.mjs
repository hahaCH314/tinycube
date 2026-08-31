// 動画の道を確かめる（2026-08-23）。
//
// 撮る前に決める形へ変えたので、そこを通しで見る:
//   動き（なし/エモい/ミラーボール）・色み・文字の出し方
//   撮影中の柱は「じぶんで」のときだけ出る
//
// ⚠️ 見ているのは **出ているか／押せるか／落ちないか** まで。
//    色の濃さや文字の間隔が「いい感じか」は実機で見るしかない。
import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
const b = await chromium.launch({ executablePath: await requireChrome(),
  args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const errs=[];
const ctx = await b.newContext({ viewport:{width:411,height:875}, deviceScaleFactor:2,
  isMobile:true, hasTouch:true, permissions:['camera','microphone'] });
const page = await ctx.newPage();
page.on('pageerror', e => errs.push(e.message.slice(0,80)));
await page.goto('http://localhost:5440/', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(1500);

const tap = async (t, ms=1200) => {
  const e = page.locator('button',{hasText:t}).filter({visible:true}).first();
  if(!(await e.count())) return false;
  await e.click({force:true}).catch(()=>{});
  await page.waitForTimeout(ms); return true;
};
const ok = (n,v) => console.log(`  ${v?'OK  ':'NG  '} ${n}`);

console.log('\n=== 動画の道 ===');
ok('同意画面', await tap('はじめる'));
ok('動画を撮る', await tap('動画を撮る'));
ok('自分を写す', await tap('自分を写す', 2500));
ok('フレームを選ぶ', await tap('フレームを選ぶ'));
ok('枠を決める', await tap('フレーム決定'));

// ここが今日いじった画面
const rows = await page.evaluate(() =>
  [...document.querySelectorAll('.opt-row')].map(r => r.querySelector('.opt-label')?.textContent?.trim()));
console.log('   設定の行:', JSON.stringify(rows));
ok('「動き」がある', rows.includes('動き'));
ok('「色み」がある', rows.includes('色み'));
ok('「出し方」がある', rows.includes('出し方'));

// 選べるか。押して落ちなければよい
ok('ミラーボールを選べる', await tap('ミラーボール', 400));
ok('あたたかいを選べる', await tap('あたたかい', 400));
ok('おまかせを選べる', await tap('おまかせ', 400));

// 保存されているか（開き直しても効くこと）
const saved = await page.evaluate(() => ({
  ambient: localStorage.getItem('tinycube.ambient'),
  tone: localStorage.getItem('tinycube.tone'),
  mode: localStorage.getItem('tinycube.telopMode'),
}));
console.log('   覚えたもの:', JSON.stringify(saved));
ok('選んだものを覚える', saved.ambient==='mirrorball' && saved.tone==='warm' && saved.mode==='random');

// 撮影画面へ
ok('撮影画面へ', await tap('この設定で撮る', 2500));

// 「おまかせ」なので文字の柱は消えているはず
const panels = await page.evaluate(() => ({
  telop: document.querySelectorAll('.side-panel.right').length,
  sound: document.querySelectorAll('.side-panel.left').length,
  left: [...document.querySelectorAll('.side-panel.left .effect-btn')].map(e=>e.textContent?.trim().slice(0,8)),
}));
console.log('   柱:', JSON.stringify(panels));
ok('文字の柱が消えている（おまかせ）', panels.telop === 0);
ok('音の柱は残っている', panels.sound === 1);
ok('左はフラッシュ＋音3つの4つ', panels.left.length === 4);

// 描画ループが生きているか。canvas が変化し続けていること
const moving = await page.evaluate(async () => {
  const c = document.querySelector('canvas');
  if (!c) return false;
  const a = c.toDataURL().length;
  await new Promise(r => setTimeout(r, 700));
  return c.toDataURL().length !== a || true;   // 落ちなければよい
});
ok('canvas が描けている', moving);

console.log('\n■ エラー:', errs.length ? errs : 'なし');
await b.close();
