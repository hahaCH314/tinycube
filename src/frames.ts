// tinyCUBE で使える枠。絵は CMCUBE と同じもの（中央の黒を抜いて WebP にしたもの）。
//
// anchor は「その絵をどう置くか」。形が合わない組み合わせも選べるようにしてある
// （欠けてでも全部使いたい、という伊波さんの判断）。欠けることはタイルに印を出す。
//
//   wide   … 16:9 の枠。縦で使うと左右が欠ける
//   top    … 上だけの飾り。横幅いっぱいに置けば縦でも横でも成立する
//   bottom … 下だけの飾り。同上
//   full   … 9:16 で描き下ろした枠。横で使うと上下が欠ける。まだ1枚も無い
//
// 縦の枠が揃ったら full を足す。1080x1920 で中央を黒く塗った PNG をもらえれば、
// 抜いて WebP にしてここへ並べる。

export type FrameAnchor = 'wide' | 'top' | 'bottom' | 'full';
export type OutShape = 'portrait' | 'landscape';

export type Frame = {
  id: string;
  name: string;
  file: string;
  anchor: FrameAnchor;
};

export const FRAMES: Frame[] = [
  // --- 16:9 の枠（横で書き出すときだけ出る） ---
  { id: 'green_garden', name: 'グリーンガーデン', file: './frames/green_garden.webp', anchor: 'wide' },
  { id: 'biotope',      name: 'ビオトープ',       file: './frames/biotope.webp',      anchor: 'wide' },
  { id: 'deep_sea',     name: '深海',            file: './frames/deep_sea.webp',     anchor: 'wide' },
  { id: 'mushroom',     name: 'きのこ',           file: './frames/mushroom.webp',     anchor: 'wide' },
  { id: 'horror',       name: 'ホラー',           file: './frames/horror.webp',       anchor: 'wide' },
  { id: 'festival',     name: '祭り',            file: './frames/festival.webp',     anchor: 'wide' },
  { id: 'heart',        name: 'ハート',           file: './frames/heart.webp',        anchor: 'wide' },
  { id: 'emotional',    name: 'エモーショナル',    file: './frames/emotional.webp',    anchor: 'wide' },
  { id: 'cyber',        name: '電脳',            file: './frames/cyber.webp',        anchor: 'wide' },
  { id: 'cyberpunk',    name: 'サイバーパンク',    file: './frames/cyberpunk.webp',    anchor: 'wide' },
  { id: 'otaku',        name: 'オタク',           file: './frames/otaku.webp',        anchor: 'wide' },
  { id: 'voxel',        name: 'ボクセル',         file: './frames/voxel.webp',        anchor: 'wide' },
  { id: 'manga',        name: '漫画',            file: './frames/manga.webp',        anchor: 'wide' },
  { id: 'animal_pop',   name: '動物POP',         file: './frames/animal_pop.webp',   anchor: 'wide' },
  { id: 'retro_pop',    name: 'レトロポップ',      file: './frames/retro_pop.webp',    anchor: 'wide' },
  { id: 'chappy_chaos', name: 'おふざけ1',        file: './frames/chappy_chaos.webp', anchor: 'wide' },
  { id: 'chaos_meme',   name: 'おふざけ2',        file: './frames/chaos_meme.webp',   anchor: 'wide' },
  { id: 'oiwai',        name: 'お祝い',           file: './frames/oiwai.webp',        anchor: 'wide' },
  { id: 'oiwai_cool',   name: 'お祝い（クール）',  file: './frames/oiwai_cool.webp',   anchor: 'wide' },
  { id: 'oiwai_momo',   name: 'お祝い（もも）',    file: './frames/oiwai_momo.webp',   anchor: 'wide' },

  // --- 片側だけの飾り（縦でも横でも使える） ---
  { id: 'cat_peek',     name: 'のぞき猫',         file: './frames/cat_peek.webp',     anchor: 'top' },
  { id: 'peek_man',     name: 'のぞきおじさん',    file: './frames/peek_man.webp',     anchor: 'top' },
  { id: 'shark',        name: 'シャーク',         file: './frames/shark.webp',        anchor: 'top' },
  { id: 'party',        name: 'ぱーりー',         file: './frames/party.webp',        anchor: 'top' },
  { id: 'party2',       name: 'ぱーりー２',        file: './frames/party2.webp',       anchor: 'bottom' },
  { id: 'heaven',       name: '天国',            file: './frames/heaven.webp',       anchor: 'bottom' },
  { id: 'mushroom_btm', name: 'きのこ（下）',      file: './frames/mushroom_btm.webp', anchor: 'bottom' },
  { id: 'fishing_1',    name: '釣り 1',          file: './frames/fishing_1.webp',    anchor: 'bottom' },
  { id: 'fishing_2',    name: '釣り 2',          file: './frames/fishing_2.webp',    anchor: 'bottom' },
  { id: 'fishing_3',    name: '釣り 3',          file: './frames/fishing_3.webp',    anchor: 'bottom' },
];

/** その枠が、いまの書き出しの形にぴったり合うか。
    合わないものも使えるようにする（伊波さんの判断。欠けてでも全部使いたい）。
    ただし黙って切るのは不親切なので、一覧に印を出すためにここで判定だけしておく */
export function fitsShape(frame: Frame, shape: OutShape): boolean {
  if (frame.anchor === 'top' || frame.anchor === 'bottom') return true;
  return shape === 'landscape' ? frame.anchor === 'wide' : frame.anchor === 'full';
}

/** 読み込みが終わるまで待つ。録画中に間に合わないと、枠だけ抜けた動画が出てしまう */
export function loadFrame(frame: Frame): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('枠の絵を読み込めませんでした: ' + frame.file));
    img.src = frame.file;
  });
}
