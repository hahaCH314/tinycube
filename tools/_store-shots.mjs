// ストアに出すスクリーンショットを撮る道具。
//
//   npx vite --port 5440 --strictPort &
//   node tools/_store-shots.mjs
//
// 出来上がりは store/screenshots/ に入る。
//
// ⚠️ **見た目を変えたら必ず撮り直すこと。** 中身と違う絵を出したまま
//    審査に出すと差し戻される（2026-08-31、動画をやめたのに動画の頃の
//    スクショが残っていた）。
//
// ■ 大きさ
//   Play      … 1080x1920（16:9 の縦。Play はこれで通る）
//   App Store … 1290x2796（6.9インチ）と 1242x2688（6.5インチ）が要る
//   ここでは Play 用と、App Store の 6.9 / 6.5 を撮る。
//
// ⚠️ **カメラは偽物**（--use-fake-device-for-media-stream）。緑の絵が写る。
//    顔を出さずに撮れるが、**ストアに出すぶんはカメラ画面を避ける**。
//    緑一色の絵は「壊れている」ように見えるので。

import { chromium } from 'playwright-core';
import { requireChrome } from './_chrome.mjs';
import { mkdirSync, existsSync } from 'node:fs';

const OUT = 'store/screenshots';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// [幅, 高さ, 名前]。Play と App Store で要る大きさが違う
const SIZES = [
  [1080, 1920, 'play'],
  [1290, 2796, 'ios-6.9'],
  [1242, 2688, 'ios-6.5'],
];

const browser = await chromium.launch({
  executablePath: await requireChrome(),
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

for (const [w, h, tag] of SIZES) {
  // deviceScaleFactor で割った大きさを viewport にする（実寸で出したいので）
  const scale = 3;
  const ctx = await browser.newContext({
    viewport: { width: Math.round(w / scale), height: Math.round(h / scale) },
    deviceScaleFactor: scale,
    isMobile: true, hasTouch: true,
    permissions: ['camera'],
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5440/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  const tap = async (t, ms = 1400) => {
    const e = page.locator('button', { hasText: t }).filter({ visible: true }).first();
    if (!(await e.count())) return false;
    await e.click({ force: true }).catch(() => {});
    await page.waitForTimeout(ms);
    return true;
  };
  const shot = async name => {
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
    console.log(`  ${tag}-${name}.png`);
  };

  console.log(`${tag}（${w}x${h}）`);

  // 1. はじめに
  await shot('1-hajimeni');

  // 2. なにを撮る？（3つのカードが並ぶ。プリクラ帳が主役）
  await tap('はじめる');
  await shot('2-nani');

  // 3. フレーム決定（ここが売り。絵がたくさん並ぶ）
  await tap('写真を撮る');
  await tap('自分を写す', 2600);
  await tap('フレームを選ぶ', 1800);
  await shot('3-frame');

  await ctx.close();
}

await browser.close();
console.log(`\n${OUT}/ に入れました`);
