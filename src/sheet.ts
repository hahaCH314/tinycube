// プリシート。**好きな写真を選んで、1枚のシールシートに組む係。**
//
// 2026-08-31、伊波さん「プリみたいに写真を選んでシートを作れる機能を追加」
// 「３枚から７枚ぐらい色んな組み合わせシート」「シールシート風（大小混ぜる）」。
//
// ■ 3枚連写のシート（App.tsx の buildPhotoSheet）とは別もの
//
//   buildPhotoSheet … いま撮った3枚を、同じ大きさで縦に積む。撮った直後の道
//   このファイル     … **あとから選んだ3〜7枚**を、大小を混ぜて組む。
//                      材料はプリクラ帳（1コマずつ入っている）と端末の写真
//
//   前者は「撮る」の締めくくり、後者は「貯めたものを1枚にする」。
//   混ぜると撮影の道が重くなるので、分けてある。
//
// ■ 割り付けは分数で持つ
//
// 紙の大きさを変えても崩れないように、コマの位置は 0〜1 の割合で書く。
// 画面に出す小さな見本（型えらび）も、同じ数字をそのまま CSS の % に使える。
// **だから型に名前を付けていない。**形を見せれば言葉は要らないし、
// 日本語と英語で名前を用意する手間も無くなる。

import { 丸四角 } from './recorder';

/** コマ1つ。紙全体（余白の内側）に対する割合 */
export type Cell = { x: number; y: number; w: number; h: number };

export type Layout = {
  id: string;
  /** 何枚使うか */
  n: number;
  cells: Cell[];
};

/**
 * 割り付け。**枚数ごとに2つずつ**用意してある（伊波さん「色んな組み合わせ」）。
 *
 * ⚠️ **cells の並びが、選んだ写真の並びと対応する。**
 *    1つめのコマにいちばん大きいものを置いてあるので、
 *    最初に選んだ写真がいちばん大きく出る。
 */
export const LAYOUTS: Layout[] = [
  // ---- 3枚 ----
  { id: '3a', n: 3, cells: [
    { x: 0,    y: 0,    w: 0.62, h: 1    },
    { x: 0.62, y: 0,    w: 0.38, h: 0.5  },
    { x: 0.62, y: 0.5,  w: 0.38, h: 0.5  },
  ] },
  { id: '3b', n: 3, cells: [
    { x: 0,    y: 0,    w: 1,    h: 0.6  },
    { x: 0,    y: 0.6,  w: 0.5,  h: 0.4  },
    { x: 0.5,  y: 0.6,  w: 0.5,  h: 0.4  },
  ] },

  // ---- 4枚 ----
  { id: '4a', n: 4, cells: [
    { x: 0,    y: 0,    w: 0.62, h: 0.62 },
    { x: 0.62, y: 0,    w: 0.38, h: 0.31 },
    { x: 0.62, y: 0.31, w: 0.38, h: 0.31 },
    { x: 0,    y: 0.62, w: 1,    h: 0.38 },
  ] },
  { id: '4b', n: 4, cells: [
    { x: 0,    y: 0,    w: 0.5,  h: 0.55 },
    { x: 0.5,  y: 0,    w: 0.5,  h: 0.3  },
    { x: 0.5,  y: 0.3,  w: 0.5,  h: 0.25 },
    { x: 0,    y: 0.55, w: 1,    h: 0.45 },
  ] },

  // ---- 5枚 ----
  { id: '5a', n: 5, cells: [
    { x: 0,    y: 0,     w: 0.6,  h: 0.55 },
    { x: 0.6,  y: 0,     w: 0.4,  h: 0.275 },
    { x: 0.6,  y: 0.275, w: 0.4,  h: 0.275 },
    { x: 0,    y: 0.55,  w: 0.5,  h: 0.45 },
    { x: 0.5,  y: 0.55,  w: 0.5,  h: 0.45 },
  ] },
  { id: '5b', n: 5, cells: [
    { x: 0,    y: 0.34, w: 1,    h: 0.36 },
    { x: 0,    y: 0,    w: 0.5,  h: 0.34 },
    { x: 0.5,  y: 0,    w: 0.5,  h: 0.34 },
    { x: 0,    y: 0.7,  w: 0.5,  h: 0.3  },
    { x: 0.5,  y: 0.7,  w: 0.5,  h: 0.3  },
  ] },

  // ---- 6枚 ----
  { id: '6a', n: 6, cells: [
    { x: 0,      y: 0,    w: 0.5,    h: 0.5  },
    { x: 0.5,    y: 0,    w: 0.5,    h: 0.25 },
    { x: 0.5,    y: 0.25, w: 0.5,    h: 0.25 },
    { x: 0,      y: 0.5,  w: 0.3333, h: 0.5  },
    { x: 0.3333, y: 0.5,  w: 0.3333, h: 0.5  },
    { x: 0.6666, y: 0.5,  w: 0.3334, h: 0.5  },
  ] },
  { id: '6b', n: 6, cells: [
    { x: 0,      y: 0.3,  w: 0.62,   h: 0.7  },
    { x: 0,      y: 0,    w: 0.3333, h: 0.3  },
    { x: 0.3333, y: 0,    w: 0.3333, h: 0.3  },
    { x: 0.6666, y: 0,    w: 0.3334, h: 0.3  },
    { x: 0.62,   y: 0.3,  w: 0.38,   h: 0.35 },
    { x: 0.62,   y: 0.65, w: 0.38,   h: 0.35 },
  ] },

  // ---- 7枚 ----
  { id: '7a', n: 7, cells: [
    { x: 0,    y: 0,    w: 0.58, h: 0.46 },
    { x: 0.58, y: 0,    w: 0.42, h: 0.23 },
    { x: 0.58, y: 0.23, w: 0.42, h: 0.23 },
    { x: 0,    y: 0.46, w: 0.5,  h: 0.27 },
    { x: 0.5,  y: 0.46, w: 0.5,  h: 0.27 },
    { x: 0,    y: 0.73, w: 0.5,  h: 0.27 },
    { x: 0.5,  y: 0.73, w: 0.5,  h: 0.27 },
  ] },
  { id: '7b', n: 7, cells: [
    { x: 0,      y: 0.28, w: 1,      h: 0.34 },
    { x: 0,      y: 0,    w: 0.5,    h: 0.28 },
    { x: 0.5,    y: 0,    w: 0.5,    h: 0.28 },
    { x: 0,      y: 0.62, w: 0.3333, h: 0.19 },
    { x: 0.3333, y: 0.62, w: 0.3333, h: 0.19 },
    { x: 0.6666, y: 0.62, w: 0.3334, h: 0.19 },
    { x: 0,      y: 0.81, w: 1,      h: 0.19 },
  ] },
];

/** その枚数で使える型（2つ返る）。無ければ空 */
export function layoutsFor(n: number): Layout[] {
  return LAYOUTS.filter(l => l.n === n);
}

/** 選べる枚数の下限と上限（伊波さん「３枚から７枚ぐらい」） */
export const MIN_PHOTOS = 3;
export const MAX_PHOTOS = 7;

/** 紙の大きさ。本物のシールシートに近い縦長（およそ 1 : 1.44）。
 *  ⚠️ ここを変えても割り付けは崩れない（コマは割合で持っているので） */
const PAPER_W = 1080;
const PAPER_H = 1560;
/** 紙のふち */
const PAD = 30;
/** 下だけ広く取る。**ここに名前を刷るため**（2026-08-31）。
 *  はじめは他と同じ 30 にしていたが、透かしが写真の上に乗ってしまい、
 *  コラージュに見えた。本物のシールシートは余白に文字が刷ってある */
const PAD_BOTTOM = 96;
/** コマとコマのすきま。**白が見えるからシールシートに見える** */
const GAP = 16;

/** 余白に刷る名前に使う、平成ギャルのまるもじ（index.html で読み込んでいる）。
 *
 *  ⚠️ **待つこと。** recorder.ts の鍵シールは毎フレーム描くので
 *     「そのうち届く」で済むが、**シートは1枚しか描かない。**
 *     待たずに描くと、届く前の1回が明朝の斜体のまま焼き付く
 *     （2026-08-31、実際にそうなった）。届かなくても描く（1秒で見切る） */
async function まるもじを待つ(text: string) {
  try {
    await Promise.race([
      document.fonts.load(`64px "Hachi Maru Pop"`, text),
      new Promise(r => setTimeout(r, 1000)),
    ]);
  } catch { /* 無くても描く（ふつうの字になるだけ） */ }
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('写真を読めませんでした'));
    img.src = src;
  });
}

/**
 * プリシートを1枚に組む。
 *
 * @param srcs      写真（data URL）。layout.n 枚ぶん使う。足りなければ足りたぶんだけ
 * @param layout    割り付け
 * @param watermark 透かしの文字。null なら焼かない（解除した人）
 *
 * ⚠️ **コマにはぴったり収める（はみ出しは切る）。** 縮めて収めると
 *    コマごとに白い帯が出て、シールシートに見えなくなる。
 *    3枚連写のシート（App.tsx の buildPhotoSheet）も同じ考え方。
 */
export async function buildSheet(
  srcs: string[], layout: Layout, watermark: string | null,
): Promise<HTMLCanvasElement | null> {
  const imgs = await Promise.all(
    srcs.slice(0, layout.n).map(s => load(s).catch(() => null)),
  );
  if (!imgs.some(Boolean)) return null;

  const paper = document.createElement('canvas');
  paper.width = PAPER_W;
  paper.height = PAPER_H;
  const g = paper.getContext('2d');
  if (!g) return null;

  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, PAPER_W, PAPER_H);

  const innerW = PAPER_W - PAD * 2;
  const innerH = PAPER_H - PAD - PAD_BOTTOM;

  layout.cells.forEach((c, i) => {
    const img = imgs[i];
    if (!img) return;
    // 割合 → 実際の場所。すきまは各コマを内側へ半分ずつ寄せて作る
    const x = PAD + c.x * innerW + GAP / 2;
    const y = PAD + c.y * innerH + GAP / 2;
    const w = c.w * innerW - GAP;
    const h = c.h * innerH - GAP;
    if (w <= 0 || h <= 0) return;

    g.save();
    // 角を丸くしてシールに見せる。小さいコマで丸めすぎないよう、短辺で頭打ち
    丸四角(g, x, y, w, h, Math.min(22, w * 0.12, h * 0.12));
    g.clip();
    // ぴったり収める（はみ出したぶんは切る）
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    g.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    g.restore();
  });

  // ⚠️ **透かしはシートにも入れる。** シートは「外へ出ていく1枚」そのもの
  //    なので、ここに名前が無いと、見た人がどこから来た絵か辿れない。
  //    ⚠️ **写真の上ではなく、下の余白に刷ること。**（2026-08-31）
  //       写真に重ねるとコラージュに見える。余白に刷ると紙に見える
  if (watermark) {
    await まるもじを待つ(watermark);
    const size = Math.round(PAPER_W * 0.036);
    g.save();
    g.font = `${size}px "Hachi Maru Pop", cursive`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ff4da6';
    g.fillText(watermark, PAPER_W / 2, PAPER_H - PAD_BOTTOM / 2);
    g.restore();
  }

  return paper;
}
