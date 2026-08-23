// Chrome の場所を探す係。
//
// ⚠️ **ここを直書きしないこと。** _audit.mjs / _check-video.mjs / _check.mjs は
//    'C:/Program Files/Google/Chrome/Application/chrome.exe' を直書きしていて、
//    **Mac では1つも動かなかった**（2026-08-23）。vite.config.ts にも同じ種類の
//    直書きがあって、そちらは 8/21 に外した。
//
// 探す順番：
//   1. 環境変数 CHROME_PATH（自分で指したいとき）
//   2. Windows のいつもの場所
//   3. Mac のいつもの場所（Chrome → Edge → Chromium の順）
//   4. playwright が抱えている chromium
//
// 見つからなければ、何を入れればよいか言って止まる。

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const CANDIDATES = [
  process.env.CHROME_PATH,
  // Windows
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  // Mac
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);

export async function findChrome() {
  for (const p of CANDIDATES) if (existsSync(p)) return p;

  // playwright が自分で持っているものを使う（npx playwright install chromium で入る）
  try {
    const { chromium } = await import('playwright-core');
    const p = chromium.executablePath();
    if (p && existsSync(p)) return p;
  } catch { /* playwright が無い、または内蔵ブラウザが未取得 */ }

  return null;
}

/** 見つからなければ、何をすればよいか言って止まる */
export async function requireChrome() {
  const p = await findChrome();
  if (p) return p;
  console.error(`
Chrome が見つかりません。次のどれかをしてください。

  ・Google Chrome を入れる
  ・playwright の chromium を落とす:  npx playwright install chromium
  ・場所を自分で指す:                 CHROME_PATH=/path/to/chrome node tools/_audit.mjs
`);
  process.exit(1);
}
