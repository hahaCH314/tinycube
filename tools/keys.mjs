// 解除キーを作る道具。
//
//   npm run keys -- 300
//
// サーバーを立てない作りにしている。理由は「壊れたときに、払った人が
// 使えなくなる」のが売り物で一番痛いから（2026-08-11、伊波さんと相談）。
//
// 仕組み。
//   1. ここでキーを人数ぶん作る
//   2. アプリにはキーそのものではなく「指紋」（SHA-256 の頭16桁）だけを埋める
//   3. 利用者がキーを打つと、その場で指紋を出して一覧と照合する
//
// 指紋から元のキーは戻せないので、アプリの中を覗かれても鍵は割れない。
// 通信もしないので、こちらのサーバーが落ちても解除は効いたまま。
//
// 出るもの
//   src/keys.ts          … アプリに埋める指紋の一覧（git に入れる）
//   tools/keys-<日付>.csv … 売る側が配る本物のキー（git に入れない）
//
// CSV は BOOTH のバリアブル商品にそのまま上げれば、1人1キーで渡せる。
// この CSV を失くすと、もう同じキーは作れない。必ず手元に残すこと。

import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { randomInt, createHash } from 'node:crypto';
import { resolve } from 'node:path';

const COUNT = Number(process.argv[2] || 300);

// 打ち間違えない字だけ使う。0とO、1とIとlは入れない
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUPS = 3, LEN = 4;      // TC-XXXX-XXXX-XXXX

/** キーの指紋。頭16桁だけ持つ。総当たりには 2^64 回要るので、これで足りる */
export function fingerprint(key) {
  return createHash('sha256').update(normalize(key)).digest('hex').slice(0, 16);
}
/** 打ち方のゆれを吸収する。小文字、空白、ハイフン無しでも通す */
function normalize(key) {
  return String(key).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function makeKey() {
  const parts = [];
  for (let g = 0; g < GROUPS; g++) {
    let s = '';
    for (let i = 0; i < LEN; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    parts.push(s);
  }
  return 'TC-' + parts.join('-');
}

// すでに配ったぶんは残す。作り直すたびに前のキーが死ぬと、
// 買った人がある日いきなり使えなくなる
const OUT_TS = resolve('src/keys.ts');
const before = existsSync(OUT_TS)
  ? [...readFileSync(OUT_TS, 'utf8').matchAll(/'([0-9a-f]{16})'/g)].map(m => m[1])
  : [];

const keys = [];
const prints = new Set(before);
while (keys.length < COUNT) {
  const k = makeKey();
  const p = fingerprint(k);
  if (prints.has(p)) continue;         // まず起きないが、念のため
  prints.add(p);
  keys.push(k);
}

const all = [...prints];
const ts = `// 解除キーの指紋。npm run keys が書き換える。手で触らないこと。
//
// キーそのものは入っていない。ここにあるのは SHA-256 の頭16桁だけで、
// ここから元のキーは戻せない。だからこのファイルは公開して問題ない。
//
// 増やすときは npm run keys -- <枚数>。前のぶんは消えないので、
// すでに配ったキーが死ぬことはない。

export const KEY_PRINTS: readonly string[] = [
${all.map(p => `  '${p}',`).join('\n')}
];
`;
writeFileSync(OUT_TS, ts, 'utf8');

const day = new Date().toISOString().slice(0, 10);
const csv = resolve(`tools/keys-${day}.csv`);
const head = existsSync(csv) ? readFileSync(csv, 'utf8').trimEnd() + '\n' : 'key\n';
writeFileSync(csv, head + keys.join('\n') + '\n', 'utf8');

console.log(`キーを ${keys.length} 個つくりました（合計 ${all.length} 個）`);
console.log('  アプリに埋める指紋 :', OUT_TS);
console.log('  配る本物のキー     :', csv, '← git に入らない。必ず手元に残すこと');
console.log('\n見本:', keys.slice(0, 3).join('  '));
