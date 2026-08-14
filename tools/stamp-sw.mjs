// 枠の絵を貯めておく係（sw.js）の名札を、絵の中身から自動で決める係。
//
// npm run build のあとに走る（package.json の build を見ること）。
//
// ■ なぜ要るか
//
// sw.js は「貯金にあれば無条件でそれを出す」作りで、枠の絵はファイル名を
// 変えずに中身だけ差し替えることがある。名札（CACHE）が変わらない限り、
// 端末は古い絵を永久に出し続ける。名札を手で書いていた頃に2回転んだ:
//
//   2026-08-11  顔ハメが黒いまま
//   2026-08-14  入れ替えた17枚が伊波さんのスマホに届かない
//
// public/frames/ のファイル名と中身から印を作れば、絵を差し替えたときだけ
// 変わる。日付より正確で、人の記憶に頼らない。
//
// ■ なぜ vite のプラグインではないか
//
// public/ の素通しコピーは writeBundle も closeBundle も**あと**に走る。
// プラグインの中で dist/sw.js を書き換えると public/sw.js に上書きされて
// 消える。しかもログには「差し替えた」と出るので気づけない。
// ビルドが終わりきったあとに、別の工程として走らせるのが確実。

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist', 'sw.js');

function cacheKey() {
  const dir = path.join(root, 'public', 'frames');
  const h = crypto.createHash('sha1');
  let count = 0;
  try {
    // 並び順が変わると印も変わってしまうので、名前で必ず揃える
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (!fs.statSync(p).isFile()) continue;
      h.update(name);
      h.update(fs.readFileSync(p));
      count++;
    }
  } catch (e) {
    // 絵が読めないときに、たまたま同じ印を出して「古い絵が永久に残る」のが
    // 一番まずい。読めなかったときは毎回変わる印にして、必ず取り直させる
    console.warn('[sw] public/frames を読めませんでした。印を時刻で作ります:', e.message);
    return 'nohash-' + Date.now().toString(36);
  }
  if (count === 0) {
    console.warn('[sw] public/frames が空でした。印を時刻で作ります');
    return 'empty-' + Date.now().toString(36);
  }
  return h.digest('hex').slice(0, 12) + '-' + count;
}

const src = fs.readFileSync(out, 'utf8');

// 差し込み口が消えると、名札が固定されたまま静かに古い絵を配り続ける。
// 気づけないので、ここで止める
if (!src.includes('__CACHE_KEY__')) {
  console.error('[sw] dist/sw.js に __CACHE_KEY__ がありません。public/sw.js の CACHE の行を戻してください');
  process.exit(1);
}

// 全部まとめて差し替える。
// ⚠️ replace（1個だけ）で書いていた頃、sw.js のコメントの中に説明として
//    同じ差し込み口を書いてしまい、**コメントのほうが先に食われて本体が
//    残った**。ログは成功と出るのに名札は固定、という気づけない壊れ方をした
//    （2026-08-14）
const key = cacheKey();
fs.writeFileSync(out, src.replaceAll('__CACHE_KEY__', key));

// 書いたつもりで書けていない事故が実際に起きたので、必ず読み返す
if (fs.readFileSync(out, 'utf8').includes('__CACHE_KEY__')) {
  console.error('[sw] 書き換えたのに __CACHE_KEY__ が残っています');
  process.exit(1);
}

console.log(`[sw] キャッシュの名札: tinycube-${key}`);
