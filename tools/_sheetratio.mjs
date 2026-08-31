// プリシートの型（sheet.ts の LAYOUTS）のコマの形を測る道具。
//
//   node tools/_sheetratio.mjs
//
// ⚠️ **うちの写真は縦長（9:16 ＝ 横÷縦 でおよそ 0.56）。**
//    横長のコマに入れると、buildSheet は「ぴったり収める（はみ出しは切る）」
//    ので、上下が大きく削られて顔が切れる
//    （2026-08-31、伊波さん「この形はありだけど、このサイズはうちの写真ではない」）。
//
// 目安は **0.5〜1.3**。外れたコマには ! が付く。
// 型を足したり直したりしたら、必ずこれを走らせること。
//
// ⚠️ **正規表現で cells を拾わないこと。** コメント行が混ざると数を読み違える
//    （2026-08-31、実際に「n=7 なのにコマが 6 個」と誤検知した）。
//    型だけを切り出した式を Function に渡して、**実際の値**として読む。

import { readFileSync } from 'node:fs';

const LO = 0.5, HI = 1.3;
// sheet.ts と同じ紙の寸法。あちらを変えたらこちらも合わせる
const PAPER_W = 1080, PAPER_H = 1560, PAD = 30, PAD_BOTTOM = 96, GAP = 16;
const innerW = PAPER_W - PAD * 2;
const innerH = PAPER_H - PAD - PAD_BOTTOM;

const src = readFileSync(new URL('../src/sheet.ts', import.meta.url), 'utf8');
const m = src.match(/export const LAYOUTS: Layout\[\] = (\[[\s\S]*?\n\]);/);
if (!m) { console.error('LAYOUTS が読めませんでした'); process.exit(1); }

// 型注釈は入っていない（cells は素のオブジェクト）ので、そのまま評価できる
let layouts;
try {
  layouts = Function(`"use strict"; return (${m[1]});`)();
} catch (e) {
  console.error('LAYOUTS を読めませんでした:', e.message);
  process.exit(1);
}

let bad = 0, total = 0;
console.log(`コマの形（横÷縦）。うちの写真は 0.56。良い範囲は ${LO}〜${HI}\n`);

for (const l of layouts) {
  const out = []; let ng = 0;
  for (const c of l.cells) {
    const w = c.w * innerW - GAP;
    const h = c.h * innerH - GAP;
    const r = w / h;
    const outOfRange = r < LO || r > HI;
    if (outOfRange) { ng++; bad++; }
    total++;
    out.push((outOfRange ? '!' : ' ') + r.toFixed(2));
  }
  const mismatch = l.cells.length !== l.n
    ? `  ⚠️ n=${l.n} なのにコマが ${l.cells.length} 個` : '';
  console.log(`${l.id.padEnd(4)} ${out.join(' ')}${ng ? `   ← ${ng}個ダメ` : ''}${mismatch}`);
}

console.log(`\n${total} コマ中 ${bad} コマが範囲の外`);
process.exit(bad ? 1 : 0);
