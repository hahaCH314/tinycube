import { basename, extname } from 'path';

const files = [
  'E９.png',
  'N９.png',
  'OL9.png',
  'P9.png',
  'PANK,１６.png',
  'うみ１６.png',
  'アイドルメンズ.png',
  'ギャル男１６png.png',
  'ヒーロー９.png',
  'ファンシー９.png',
  '白ギャル１６.png',
  '黒ギャル１６.png',
  'ｓアイドル１６.png',
  'ｓ９.png',
  'ｖ系１６.png'
].sort();

const WORDS = [
  [/顔|かお|face/i, 'face'],
  [/赤|red/i, 'red'], [/青|あお|blue/i, 'blue'], [/緑|みどり|green/i, 'green'],
  [/黄|yellow/i, 'yellow'], [/ピンク|pink/i, 'pink'], [/オレンジ|orange/i, 'orange'],
  [/紫|purple/i, 'purple'], [/白|white/i, 'white'], [/黒|black/i, 'black'],
  [/虹|rainbow/i, 'rainbow'], [/漫画|manga/i, 'manga'],
  [/リボン|ribbon/i, 'ribbon'], [/シャンパン|champagne/i, 'champagne'],
  [/ペンラ|penlight/i, 'penlight'], [/キラ|kira/i, 'kira'],
  [/バンド|band/i, 'band'], [/シティ|city/i, 'city'], [/テレビ|tv/i, 'tv'],
  [/ハイビスカス|hibiscus/i, 'hibiscus'], [/海|sea/i, 'sea'],
  [/犬|dog/i, 'dog'], [/猫|cat/i, 'cat'],
  [/歌舞伎|kabuki/i, 'kabuki'], [/女形|onnagata/i, 'onnagata'],
  [/風呂|bath/i, 'bath'], [/レモン|lemon/i, 'lemon'], [/ゴーヤ|goya/i, 'goya'],
  [/ヲタ|オタ|otaku/i, 'otaku'], [/日本|japan/i, 'japan'],
  [/推し|おし|oshi/i, 'oshi'],
];

function slug(file, i) {
  const base = basename(file, extname(file));
  if (/^[\w-]+$/.test(base)) return base.toLowerCase();
  const hit = [];
  for (const [re, w] of WORDS) if (re.test(base) && !hit.includes(w)) hit.push(w);
  return (hit.length ? hit.reverse().join('_') : 'frame_' + String(i + 1).padStart(2, '0'));
}

const out = files.map((f, i) => `${f} -> ${slug(f, i)}`);
require('fs').writeFileSync('e:/cmcube/916cube/tools/check-slugs.txt', out.join('\n'), 'utf8');
