// tinyCUBE で使える枠。絵は CMCUBE と同じもの（中央の黒を抜いて WebP にしたもの）。
//
// anchor は「その絵をどう置くか」。形が合わない組み合わせも選べるようにしてある
// （欠けてでも全部使いたい、という伊波さんの判断）。欠けることはタイルに印を出す。
//
//   wide   … 16:9 の枠。縦で使うと左右が欠ける
//   top    … 上だけの飾り。横幅いっぱいに置けば縦でも横でも成立する
//   bottom … 下だけの飾り。同上
//   full   … 9:16 で描き下ろした枠。横で使うと上下が欠ける
//
// 絵を足すときは npm run frames -- <フォルダ> を使う。黒を抜いて WebP にし、
// ここへ貼る行まで出してくれる。出来は tools/frames-check.png で目で見ること。

export type FrameAnchor = 'wide' | 'top' | 'bottom' | 'full' | 'split4';
export type OutShape = 'portrait' | 'landscape';

export type Frame = {
  id: string;
  name: string;
  file: string;
  anchor: FrameAnchor;
  /** 顔ハメ枠の穴の位置（キャンバス全体に対する%）。
   *  穴は透明ではなく黒く塗ってあるので、カメラは枠より後から重ね描く必要がある。
   *  x, y は左上の座標、w, h は幅・高さ（いずれも %） */
  faceHole?: { x: number; y: number; w: number; h: number };
  /** 有料の枠。いまは印だけで、どこも参照していない。
   *  50枚たまったところで鍵をかける予定（2026-08-11、伊波さん）。
   *  先に印を付けておけば、鍵の作りは後からどれにでも差し替えられる */
  paid?: boolean;
};

export const FRAMES: Frame[] = [

  // --- 812CMcube 追加分（2026-08-12） ---
  { id: 'frame_01',         name: 'E9',                 file: './frames/frame_01.webp',         anchor: 'full' },
  { id: 'frame_02',         name: 'N9',                 file: './frames/frame_02.webp',         anchor: 'full' },
  { id: 'ol9',              name: 'OL9',                file: './frames/ol9.webp',              anchor: 'full' },
  { id: 'p9',               name: 'P9',                 file: './frames/p9.webp',               anchor: 'full' },
  { id: 'frame_05',         name: 'PANK,16',            file: './frames/frame_05.webp',         anchor: 'wide' },
  { id: 'frame_06',         name: 'アイドルメンズ',         file: './frames/frame_06.webp',         anchor: 'wide' },
  { id: 'frame_07',         name: 'ギャル男16',            file: './frames/frame_07.webp',         anchor: 'wide' },
  { id: 'frame_08',         name: 'ヒーロー9',             file: './frames/frame_08.webp',         anchor: 'full' },
  { id: 'frame_09',         name: 'ファンシー9',           file: './frames/frame_09.webp',         anchor: 'full' },
  { id: 'frame_10',         name: 'うみ16',              file: './frames/frame_10.webp',         anchor: 'wide' },
  { id: 'white',            name: '白ギャル16',            file: './frames/white.webp',            anchor: 'wide' },
  { id: 'black',            name: '黒ギャル16',            file: './frames/black.webp',            anchor: 'wide' },
  { id: 'frame_13',         name: 's9',                 file: './frames/frame_13.webp',         anchor: 'full' },
  { id: 'frame_14',         name: 'sアイドル16',           file: './frames/frame_14.webp',         anchor: 'wide' },
  { id: 'frame_15',         name: 'v系16',               file: './frames/frame_15.webp',         anchor: 'wide' },

  // --- 顔ハメ（9:16 で描いてあるので、縦で書き出すときにぴったり合う） ---
  // CMCUBE ではカメラを穴にはめて使うもの。tinyCUBE では動画が穴から見える。
  // 穴は透明ではなく黒く塗ってある。フレームを先に描き、その上にカメラ映像を
  // 穴の位置でクリッピングして重ねることで、穴からカメラだけが見える。
  // faceHole の x,y,w,h は CMCUBE から実測した値（キャンバス全体に対する%）。
  { id: 'fh_02', name: '顔ハメ 1',  file: './frames/02.webp', anchor: 'full', faceHole: { x: 42.6, y: 16.4, w: 25.3, h: 14.1 } },
  { id: 'fh_03', name: '顔ハメ 2',  file: './frames/03.webp', anchor: 'full', faceHole: { x: 38.6, y: 15.4, w: 26.6, h: 15.0 } },
  { id: 'fh_05', name: '顔ハメ 3',  file: './frames/05.webp', anchor: 'full', faceHole: { x: 37.0, y: 18.7, w: 30.1, h: 16.8 } },
  { id: 'fh_06', name: '顔ハメ 4',  file: './frames/06.webp', anchor: 'full', faceHole: { x: 40.7, y: 22.7, w: 23.4, h: 14.5 } },
  { id: 'fh_07', name: '顔ハメ 5',  file: './frames/07.webp', anchor: 'full', faceHole: { x: 38.5, y: 20.9, w: 25.3, h: 14.3 } },
  { id: 'fh_10', name: '顔ハメ 6',  file: './frames/10.webp', anchor: 'full', faceHole: { x: 29.5, y: 21.5, w: 32.9, h: 18.1 } },
  { id: 'fh_11', name: '顔ハメ 7',  file: './frames/11.webp', anchor: 'full', faceHole: { x: 33.3, y: 31.0, w: 33.4, h: 18.4 } },
  { id: 'fh_12', name: '顔ハメ 8',  file: './frames/12.webp', anchor: 'full', faceHole: { x: 35.8, y: 25.9, w: 33.0, h: 19.1 } },
  { id: 'fh_13', name: '顔ハメ 9',  file: './frames/13.webp', anchor: 'full', faceHole: { x: 36.1, y: 28.2, w: 31.1, h: 18.8 } },
  { id: 'fh_14', name: '顔ハメ 10', file: './frames/14.webp', anchor: 'full', faceHole: { x: 38.6, y: 29.2, w: 27.1, h: 15.9 } },
  { id: 'fh_16', name: '顔ハメ 11', file: './frames/16.webp', anchor: 'full', faceHole: { x: 31.5, y: 19.0, w: 34.9, h: 21.7 } },
  { id: 'fh_17', name: '顔ハメ 12', file: './frames/17.webp', anchor: 'full', faceHole: { x: 39.3, y: 23.9, w: 22.3, h: 15.0 } },
  { id: 'fh_18', name: '顔ハメ 13', file: './frames/18.webp', anchor: 'full', faceHole: { x: 43.0, y: 22.7, w: 25.5, h: 14.7 } },

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
  // --- 推し色（2026-08-11 追加。有料の枠） ---
  // 同じ絵を 16:9 と 9:16 の両方で描き下ろしてある。
  // 一覧は形で絞られるので、名前は縦横で分けなくてよい
  { id: 'oshi_red_w',     name: '推し・赤',       file: './frames/oshi_red_w.webp',     anchor: 'wide', paid: true },
  { id: 'oshi_red_p',     name: '推し・赤',       file: './frames/oshi_red_p.webp',     anchor: 'full', paid: true },
  { id: 'oshi_blue_w',    name: '推し・青',       file: './frames/oshi_blue_w.webp',    anchor: 'wide', paid: true },
  { id: 'oshi_blue_p',    name: '推し・青',       file: './frames/oshi_blue_p.webp',    anchor: 'full', paid: true },
  { id: 'oshi_green_w',   name: '推し・緑',       file: './frames/oshi_green_w.webp',   anchor: 'wide', paid: true },
  { id: 'oshi_green_p',   name: '推し・緑',       file: './frames/oshi_green_p.webp',   anchor: 'full', paid: true },
  { id: 'oshi_yellow_w',  name: '推し・黄',       file: './frames/oshi_yellow_w.webp',  anchor: 'wide', paid: true },
  { id: 'oshi_yellow_p',  name: '推し・黄',       file: './frames/oshi_yellow_p.webp',  anchor: 'full', paid: true },
  { id: 'oshi_pink_w',    name: '推し・ピンク',   file: './frames/oshi_pink_w.webp',    anchor: 'wide', paid: true },
  { id: 'oshi_pink_p',    name: '推し・ピンク',   file: './frames/oshi_pink_p.webp',    anchor: 'full', paid: true },
  { id: 'oshi_orange_w',  name: '推し・オレンジ', file: './frames/oshi_orange_w.webp',  anchor: 'wide', paid: true },
  { id: 'oshi_orange_p',  name: '推し・オレンジ', file: './frames/oshi_orange_p.webp',  anchor: 'full', paid: true },
  { id: 'oshi_purple_w',  name: '推し・紫',       file: './frames/oshi_purple_w.webp',  anchor: 'wide', paid: true },
  { id: 'oshi_purple_p',  name: '推し・紫',       file: './frames/oshi_purple_p.webp',  anchor: 'full', paid: true },
  { id: 'oshi_white_w',   name: '推し・白',       file: './frames/oshi_white_w.webp',   anchor: 'wide', paid: true },
  { id: 'oshi_white_p',   name: '推し・白',       file: './frames/oshi_white_p.webp',   anchor: 'full', paid: true },
  { id: 'oshi_black_w',   name: '推し・黒',       file: './frames/oshi_black_w.webp',   anchor: 'wide', paid: true },
  { id: 'oshi_black_p',   name: '推し・黒',       file: './frames/oshi_black_p.webp',   anchor: 'full', paid: true },
  { id: 'oshi_manga_w',   name: '推し・漫画',     file: './frames/oshi_manga_w.webp',   anchor: 'wide', paid: true },
  { id: 'oshi_manga_p',   name: '推し・漫画',     file: './frames/oshi_manga_p.webp',   anchor: 'full', paid: true },
  { id: 'oshi_rainbow',   name: '推し・虹',       file: './frames/oshi_rainbow.webp',   anchor: 'full', paid: true },

  // --- きらきら（2026-08-11 追加。有料の枠） ---
  { id: 'otaku_01',       name: 'ゆめかわ',       file: './frames/otaku_01.webp',       anchor: 'wide', paid: true },
  { id: 'otaku_02',       name: 'よぞら',         file: './frames/otaku_02.webp',       anchor: 'wide', paid: true },
  { id: 'otaku_03',       name: 'きらきら',       file: './frames/otaku_03.webp',       anchor: 'wide', paid: true },
  { id: 'otaku_04',       name: 'ぬいぐるみ',     file: './frames/otaku_04.webp',       anchor: 'wide', paid: true },
  { id: 'otaku_05',       name: 'ペンライト',     file: './frames/otaku_05.webp',       anchor: 'wide', paid: true },
  { id: 'otaku_06',       name: 'グッズ',         file: './frames/otaku_06.webp',       anchor: 'wide', paid: true },

  // --- キューブ枠（2026-08-11 追加。有料の枠） ---
  { id: 'band_w',           name: 'バンド',              file: './frames/band_w.webp',           anchor: 'wide', paid: true },
  { id: 'band_p',           name: 'バンド',              file: './frames/band_p.webp',           anchor: 'full', paid: true },
  { id: 'city_w',           name: 'シティ',              file: './frames/city_w.webp',           anchor: 'wide', paid: true },
  { id: 'city_p',           name: 'シティ',              file: './frames/city_p.webp',           anchor: 'full', paid: true },
  { id: 'tv_w',             name: 'テレビ',              file: './frames/tv_w.webp',             anchor: 'wide', paid: true },
  { id: 'tv_p',             name: 'テレビ',              file: './frames/tv_p.webp',             anchor: 'full', paid: true },
  { id: 'hibiscus_w',       name: 'ハイビスカス',           file: './frames/hibiscus_w.webp',       anchor: 'wide', paid: true },
  { id: 'hibiscus_p',       name: 'ハイビスカス',           file: './frames/hibiscus_p.webp',       anchor: 'full', paid: true },
  { id: 'sea_w',            name: '海',                file: './frames/sea_w.webp',            anchor: 'wide', paid: true },
  { id: 'sea_p',            name: '海',                file: './frames/sea_p.webp',            anchor: 'full', paid: true },
  { id: 'cat',              name: '猫',                file: './frames/cat.webp',              anchor: 'wide', paid: true },
  { id: 'dog',              name: '犬',                file: './frames/dog.webp',              anchor: 'full', paid: true },
  { id: 'oshi_kira',        name: '推し・キラ',            file: './frames/oshi_kira.webp',        anchor: 'full', paid: true },
  { id: 'penlight',         name: 'ペンライト',            file: './frames/penlight.webp',         anchor: 'full', paid: true },
  { id: 'oshi_champagne',   name: '推し・シャンパン',         file: './frames/oshi_champagne.webp',   anchor: 'full', paid: true },
  { id: 'oshi_ribbon_red',  name: '推し・赤リボン',          file: './frames/oshi_ribbon_red.webp',  anchor: 'full', paid: true },



  // --- 顔ハメ（2026-08-11 追加。有料の枠）。穴から映像が見える ---
  { id: 'goya',             name: 'ゴーヤ（顔ハメ）',         file: './frames/goya.webp',             anchor: 'wide', paid: true },
  { id: 'japan_face',       name: '日本（顔ハメ）',          file: './frames/japan_face.webp',       anchor: 'wide', paid: true },
  { id: 'kabuki_face',      name: '歌舞伎（顔ハメ）',         file: './frames/kabuki_face.webp',      anchor: 'wide', paid: true },
  { id: 'bath_face',        name: 'お風呂（顔ハメ）',         file: './frames/bath_face.webp',        anchor: 'wide', paid: true },
  { id: 'dog_face_w',       name: '犬（顔ハメ）',           file: './frames/dog_face_w.webp',       anchor: 'wide', paid: true },
  { id: 'lemon_face',       name: 'レモン（顔ハメ）',         file: './frames/lemon_face.webp',       anchor: 'full', paid: true },
  { id: 'otaku_face',       name: 'ヲタ（顔ハメ）',          file: './frames/otaku_face.webp',       anchor: 'full', paid: true },
  { id: 'onnagata',         name: '女形（顔ハメ）',          file: './frames/onnagata.webp',         anchor: 'full', paid: true },
  { id: 'dog_face_p',       name: '犬 1（顔ハメ）',         file: './frames/dog_face_p.webp',       anchor: 'full', paid: true },
  { id: 'dog_face_p_2',     name: '犬 2（顔ハメ）',         file: './frames/dog_face_p_2.webp',     anchor: 'full', paid: true },
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
    // 絵を作り直したときに、端末に残った古い絵を掴ませないための番号。
    // ファイル名を変えずに中身だけ差し替えることがあるので、住所を変えて
    // 別物として取りに行かせる。作り直したらこの数を上げること
    // （2026-08-11、顔ハメが古いまま黒く出ていた）
    img.src = frame.file.startsWith('data:') ? frame.file : frame.file + '?v=3';
  });
}
