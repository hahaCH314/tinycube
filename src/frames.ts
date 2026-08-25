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

export type FaceHole = { x: number; y: number; w: number; h: number };

/**
 * 季節の限定フレーム（2026-08-25、ヒマワリからの手紙）。
 *
 * ⚠️ **通常の一覧には混ぜない。** 期間中だけ、別枠の専用ボタンから開く
 *    （ヒマワリ「季節限定フレームは通常フレームのリスト（カテゴリ）には
 *      並べない」「該当期間中のみ、UI上に専用ボタンが別枠で出現する」）。
 *
 * ⚠️ **期間は端末の日付で見る。** サーバーを持たないので、
 *    日付をずらせば見えてしまう。それは承知のうえ。
 *    課金でも何でもないので、厳密に締める必要はない
 */
export type SeasonId = 'autumn';

/** 季節ごとの出る期間（月/日）。年はまたがない前提 */
export const SEASONS: Record<SeasonId, { name: string; from: [number, number]; to: [number, number] }> = {
  autumn: { name: '秋', from: [9, 1], to: [11, 30] },
};

/**
 * いま出ている季節を返す。無ければ null。
 * @param now 試すとき用。ふだんは渡さない
 */
export function seasonNow(now = new Date()): SeasonId | null {
  const m = now.getMonth() + 1, d = now.getDate();
  for (const [id, s] of Object.entries(SEASONS) as [SeasonId, typeof SEASONS[SeasonId]][]) {
    const a = s.from[0] * 100 + s.from[1];
    const b = s.to[0] * 100 + s.to[1];
    const t = m * 100 + d;
    if (t >= a && t <= b) return id;
  }
  return null;
}

export type Frame = {
  id: string;
  name: string;
  file: string;
  bgFile?: string;
  anchor: FrameAnchor;
  /** 9スライス用の設定（上下左右の不可侵エリアのピクセル数） */
  slice?: { t: number; r: number; b: number; l: number };
  /** 顔ハメ枠の穴の位置（キャンバス全体に対する%）。
   *  穴は透明ではなく黒く塗ってあるので、カメラは枠より後から重ね描く必要がある。
   *  x, y は左上の座標、w, h は幅・高さ（いずれも %） */
  faceHole?: FaceHole;
  faceHoles?: FaceHole[];
  /** 季節の限定フレーム。**通常の一覧には出さない**（専用ボタンから開く） */
  season?: SeasonId;
  /** ¥300 の買い切りで解ける枠。true だと鍵がかかり、買うまで選べない。
   *
   *  ■ 経緯（行ったり来たりしたので残す）
   *    2026-08-15  全部無料にした（isUnlocked が常に true）
   *    2026-08-17  新作だけ売る方針にして、53枚の paid を外した
   *    2026-08-18  「後から足したフレームは３００円課金に戻したい」
   *                「大丈夫、テスターは友達だから」→ **53枚を戻した**
   *
   *  ⚠️ **8/16 のリリースノートに「フレーム全部かいほうしました！」と
   *     書いて配信済み。** 鍵を戻すことはテスターに必ず伝えること。
   *
   *  ⚠️ **足すときは行末の `},` の直前に置くこと。** faceHoles の配列の
   *     中に入れてしまうと型エラーになる（2026-08-18 に踏んだ）。
   *
   *  鍵の判定は App.tsx の `locked()` → `!!f.paid && !unlocked`。
   *  解除は unlock.ts の isUnlocked()。 */
  paid?: boolean;
};

export const FRAMES: Frame[] = [
  // --- tinyCUBE 用に描き下ろした枠（2026-08-14 追加） ---
  //
  // 元は CMCUBE 用の絵。**真ん中を透明に抜いてある**（tools/punch-holes.mjs）。
  // 顔ハメではないので faceHole は持たない。中央にカメラの映像がそのまま映る。
  //
  // 上下2枚を重ねる作り（bgFile）ではなく、**最初から1枚に合成された絵**。
  // tinyCUBE は片方しか出さない場面があり、2枚に分けると絵が欠けたため
  // （2026-08-14、伊波さん「tinycubeでは片方の画像しか出てないから
  // 絵が見えなくなってる、だから重ねた画像にした」）。
  //
  // ファイル名を英数字にしてあるのは、日本語だと URL で %E3%81... に化けるため。
  // 画面に出る名前は日本語のまま（name の側）
  // 「ギャラクシー」（tc_galaxy）は 2026-08-14 に外した。
  // 元絵が 320x180 しかなく（他は 1400x788）、穴の縁が階段状にガタガタで、
  // 周りの黒い縁も太くて映像が小さくしか映らなかった。
  // 顔ハメではなく映像がそのまま映る枠なので、縁の粗さがはっきり見える。
  // 元絵がどこにも無く作り直せないため、伊波さんの判断で削除。
  // 絵は assets/_removed-galaxy-2026-08-14 と
  // assets/_png-before-webp-2026-08-14 に残してある
  { id: 'tc_otaku', name: 'ヲタ芸', file: './frames/tc_otaku.webp', anchor: 'wide' },
  { id: 'tc_fun', name: 'おふざけ', file: './frames/tc_fun.webp', anchor: 'wide' },
  { id: 'tc_fun2', name: 'おふざけ2', file: './frames/tc_fun2.webp', anchor: 'wide' },
  { id: 'tc_mushroom', name: 'きのこの森', file: './frames/tc_mushroom.webp', anchor: 'wide' },
  { id: 'tc_animal', name: 'アニマル', file: './frames/tc_animal.webp', anchor: 'wide' },
  { id: 'tc_cyber', name: 'サイバー', file: './frames/tc_cyber.webp', anchor: 'wide' },
  { id: 'tc_biotope', name: 'ビオトープ', file: './frames/tc_biotope.webp', anchor: 'wide' },
  { id: 'tc_horror', name: 'ホラー', file: './frames/tc_horror.webp', anchor: 'wide' },
  { id: 'tc_pop', name: 'ポップ', file: './frames/tc_pop.webp', anchor: 'wide' },
  { id: 'tc_deepsea', name: '深海', file: './frames/tc_deepsea.webp', anchor: 'wide' },
  { id: 'tc_manga', name: '漫画', file: './frames/tc_manga.webp', anchor: 'wide' },
  { id: 'tc_matsuri', name: '祭り', file: './frames/tc_matsuri.webp', anchor: 'wide' },
  { id: 'tc_denno', name: '電脳', file: './frames/tc_denno.webp', anchor: 'wide' },
  { id: 'tc_mc', name: '夜の街', file: './frames/tc_mc.webp', anchor: 'wide' },
  { id: 'tc_garden', name: 'グリーンガーデン', file: './frames/tc_garden.webp', anchor: 'wide' },
  { id: 'tc_heart', name: 'ハート', file: './frames/tc_heart.webp', anchor: 'wide' },





  // --- 812CMcube 追加分（2026-08-12） ---
  { id: 'frame_01',         name: 'E9',                 file: './frames/frame_01.webp',         anchor: 'full', faceHole: { x: 33.8, y: 11.7, w: 34.3, h: 24.7 } },
  { id: 'frame_02',         name: 'N9',                 file: './frames/frame_02.webp',         anchor: 'full', faceHole: { x: 28.5, y: 17.5, w: 43.0, h: 39.0 } },
  { id: 'ol9',              name: 'OL9',                file: './frames/ol9.webp',              anchor: 'full', faceHole: { x: 30.1, y: 23.8, w: 39.8, h: 31.0 } },
  // 二人用。自動測定は黒いスカートを一番大きい穴として拾うので、目で見て
  // 顔ふたつ（画面の上側にある同じくらいの大きさの2つ）を選んである
  { id: 'p9',               name: 'P9',                 file: './frames/p9.webp',               anchor: 'full', faceHoles: [{ x: 21.3, y: 13.1, w: 25.0, h: 19.9 }, { x: 53.0, y: 19.2, w: 25.3, h: 23.0 }] },
  { id: 'frame_05',         name: 'PANK,16',            file: './frames/frame_05.webp',         anchor: 'wide', faceHoles: [{ x: 29.4, y: 17.6, w: 18.0, h: 37.0 }, { x: 56.2, y: 25.4, w: 17.6, h: 28.6 }] },
  { id: 'frame_06',         name: 'うみ16',              file: './frames/frame_06.webp',         anchor: 'wide', faceHole: { x: 23.5, y: 12.2, w: 52.9, h: 70.3 } },
  { id: 'frame_07',         name: 'アイドルメンズ9',        file: './frames/frame_07.webp',         anchor: 'full', faceHole: { x: 28.3, y: 9.5, w: 43.8, h: 39.6 } },
  { id: 'frame_08',         name: 'ギャル男16',            file: './frames/frame_08.webp',         anchor: 'wide', faceHoles: [{ x: 27.5, y: 26.1, w: 17.1, h: 44.9 }, { x: 55.1, y: 26.1, w: 17.1, h: 44.9 }] },
  { id: 'frame_09',         name: 'ヒーロー9',             file: './frames/frame_09.webp',         anchor: 'full', faceHole: { x: 29.8, y: 14.1, w: 34.1, h: 28.5 } },
  { id: 'frame_10',         name: 'ファンシー9',           file: './frames/frame_10.webp',         anchor: 'full' },
  { id: 'white',            name: '白ギャル16',            file: './frames/white.webp',            anchor: 'wide', faceHoles: [{ x: 29.1, y: 20.7, w: 18.6, h: 39.6 }, { x: 55.5, y: 21.4, w: 17.9, h: 39.5 }] },
  { id: 'black',            name: '黒ギャル16',            file: './frames/black.webp',            anchor: 'wide', faceHoles: [{ x: 27.7, y: 23.1, w: 18.2, h: 40.2 }, { x: 53.9, y: 24.4, w: 18.3, h: 40.1 }] },
  { id: 'frame_13',         name: 'sアイドル16',           file: './frames/frame_13.webp',         anchor: 'wide', faceHole: { x: 26.4, y: 5.5, w: 47.4, h: 78.3 } },
  { id: 'frame_14',         name: 's9',                 file: './frames/frame_14.webp',         anchor: 'full', faceHole: { x: 33.1, y: 15.9, w: 30.7, h: 24.7 } },
  { id: 'frame_15',         name: 'v系16',               file: './frames/frame_15.webp',         anchor: 'wide', faceHoles: [{ x: 25.4, y: 17.4, w: 21.0, h: 45.6 }, { x: 55.8, y: 19.0, w: 21.2, h: 45.0 }] },

  // --- 顔ハメ（9:16 で描いてあるので、縦で書き出すときにぴったり合う） ---
  // CMCUBE ではカメラを穴にはめて使うもの。tinyCUBE では動画が穴から見える。
  // 穴は透明ではなく黒く塗ってある。フレームを先に描き、その上にカメラ映像を
  // 穴の位置でクリッピングして重ねることで、穴からカメラだけが見える。
  // faceHole の x,y,w,h は CMCUBE から実測した値（キャンバス全体に対する%）。
  { id: 'fh_02', name: '顔フレーム 1',  file: './frames/02.webp', anchor: 'full', faceHole: { x: 42.6, y: 16.4, w: 25.3, h: 14.1 } },
  { id: 'fh_03', name: '顔フレーム 2',  file: './frames/03.webp', anchor: 'full', faceHole: { x: 38.6, y: 15.4, w: 26.6, h: 15.0 } },
  { id: 'fh_05', name: '顔フレーム 3',  file: './frames/05.webp', anchor: 'full', faceHole: { x: 37.0, y: 18.7, w: 30.1, h: 16.8 } },
  { id: 'fh_06', name: '顔フレーム 4',  file: './frames/06.webp', anchor: 'full', faceHole: { x: 40.7, y: 22.7, w: 23.4, h: 14.5 } },
  { id: 'fh_07', name: '顔フレーム 5',  file: './frames/07.webp', anchor: 'full', faceHole: { x: 38.5, y: 20.9, w: 25.3, h: 14.3 } },
  { id: 'fh_10', name: '顔フレーム 6',  file: './frames/10.webp', anchor: 'full', faceHole: { x: 29.5, y: 21.5, w: 32.9, h: 18.1 } },
  { id: 'fh_11', name: '顔フレーム 7',  file: './frames/11.webp', anchor: 'full', faceHole: { x: 33.3, y: 31.0, w: 33.4, h: 18.4 } },
  { id: 'fh_12', name: '顔フレーム 8',  file: './frames/12.webp', anchor: 'full', faceHole: { x: 35.8, y: 25.9, w: 33.0, h: 19.1 } },
  { id: 'fh_13', name: '顔フレーム 9',  file: './frames/13.webp', anchor: 'full', faceHole: { x: 36.1, y: 28.2, w: 31.1, h: 18.8 } },
  { id: 'fh_14', name: '顔フレーム 10', file: './frames/14.webp', anchor: 'full', faceHole: { x: 38.6, y: 29.2, w: 27.1, h: 15.9 } },
  { id: 'fh_16', name: '顔フレーム 11', file: './frames/16.webp', anchor: 'full', faceHole: { x: 31.5, y: 19.0, w: 34.9, h: 21.7 } },
  { id: 'fh_17', name: '顔フレーム 12', file: './frames/17.webp', anchor: 'full', faceHole: { x: 39.3, y: 23.9, w: 22.3, h: 15.0 } },
  { id: 'fh_18', name: '顔フレーム 13', file: './frames/18.webp', anchor: 'full', faceHole: { x: 43.0, y: 22.7, w: 25.5, h: 14.7 } },

  // --- 16:9 の枠（横で書き出すときだけ出る） ---
  // 2026-08-13、伊波さんが元の絵を入れ直してくださった。
  // それまでは 320x180 まで潰れたものが入っていて、「光の粒を散らしただけ」に
  // 見えていた（本当はランタンと白薔薇の写真風）。1672x941 から作り直し
  { id: 'emotional',    name: 'エモーショナル',    file: './frames/emotional.webp',    anchor: 'wide' },
  { id: 'retro_pop',    name: 'レトロポップ',      file: './frames/retro_pop.webp',    anchor: 'wide' },
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
  { id: 'goya',             name: 'ゴーヤ（顔フレーム）',         file: './frames/goya.webp',             anchor: 'wide', faceHoles: [{ x: 23.0, y: 27.5, w: 21.4, h: 47.1 }, { x: 56.2, y: 28.0, w: 20.6, h: 46.6 }], paid: true },
  { id: 'japan_face',       name: '日本（顔フレーム）',          file: './frames/japan_face.webp',       anchor: 'wide', faceHoles: [{ x: 26.9, y: 26.9, w: 17.5, h: 34.4 }, { x: 53.8, y: 29.0, w: 17.9, h: 36.3 }], paid: true },
  { id: 'kabuki_face',      name: '歌舞伎（顔フレーム）',         file: './frames/kabuki_face.webp',      anchor: 'wide', faceHoles: [{ x: 20.9, y: 25.4, w: 18.4, h: 46.1 }, { x: 62.1, y: 28.7, w: 17.8, h: 45.3 }], paid: true },
  { id: 'bath_face',        name: 'お風呂（顔フレーム）',         file: './frames/bath_face.webp',        anchor: 'wide', faceHoles: [{ x: 31.8, y: 32.7, w: 12.7, h: 22.7 }, { x: 55.1, y: 30.6, w: 13.3, h: 23.4 }], paid: true },
  { id: 'dog_face_w',       name: '犬（顔フレーム）',           file: './frames/dog_face_w.webp',       anchor: 'wide', faceHoles: [{ x: 29.6, y: 24.1, w: 14.3, h: 29.6 }, { x: 54.1, y: 25.3, w: 14.2, h: 30.7 }], paid: true },
  { id: 'lemon_face',       name: 'レモン（顔フレーム）',         file: './frames/lemon_face.webp',       anchor: 'full', faceHole: { x: 33.9, y: 17.6, w: 32.2, h: 21.4 }, paid: true },
  { id: 'otaku_face',       name: 'ヲタ（顔フレーム）',          file: './frames/otaku_face.webp',       anchor: 'full', faceHoles: [{ x: 18.9, y: 27.3, w: 26.9, h: 20.1 }, { x: 53.9, y: 31.1, w: 25.6, h: 19.4 }], paid: true },
  { id: 'onnagata',         name: '女形（顔フレーム）',          file: './frames/onnagata.webp',         anchor: 'full', faceHole: { x: 28.8, y: 33.3, w: 45.6, h: 37.9 }, paid: true },
  { id: 'dog_face_p',       name: '犬 1（顔フレーム）',         file: './frames/dog_face_p.webp',       anchor: 'full', faceHole: { x: 25.6, y: 18.3, w: 48.1, h: 34.5 }, paid: true },
  { id: 'dog_face_p_2',     name: '犬 2（顔フレーム）',         file: './frames/dog_face_p_2.webp',     anchor: 'full', faceHole: { x: 33.2, y: 13.9, w: 34.8, h: 26.4 }, paid: true },

  // --- 2026-08-18 追加。**無料の枠**（伊波さん「これを無料枠に追加」）---
  //     元絵は E:\syunp_data\Downloads\５００円  //     目印の色がバラバラ（黄・マゼンタ・緑・青）なので、色を見分けて抜いた
  { id: 'yumekawa_pop',     name: 'ゆめかわポップ',        file: './frames/yumekawa_pop.webp',     anchor: 'full' },
  { id: 'gothic',           name: 'ゴシック',            file: './frames/gothic.webp',           anchor: 'full' },
  { id: 'cyber_angel',      name: 'サイバーエンジェル',      file: './frames/cyber_angel.webp',      anchor: 'full' },
  { id: 'cyber_punk',       name: 'サイバーパンク',        file: './frames/cyber_punk.webp',       anchor: 'full' },
  { id: 'retro',            name: 'レトロ',             file: './frames/retro.webp',            anchor: 'full' },
  { id: 'wafu',             name: '和風',              file: './frames/wafu.webp',             anchor: 'full' },
  { id: 'okami_face',       name: '女将（顔フレーム）',        file: './frames/okami_face.webp',       anchor: 'full', faceHole: { x: 33.9, y: 17.9, w: 26.9, h: 15.5 } },
  { id: 'heisei_loli_face', name: '平成ロリ（顔フレーム）',      file: './frames/heisei_loli_face.webp', anchor: 'full', faceHole: { x: 38.0, y: 17.0, w: 23.8, h: 13.1 } },
  { id: 'ryoushi_face',     name: '漁師（顔フレーム）',        file: './frames/ryoushi_face.webp',     anchor: 'full', faceHole: { x: 35.3, y: 17.4, w: 27.5, h: 15.1 } },
  { id: 'kuroneko_face',    name: '黒猫（顔フレーム）',        file: './frames/kuroneko_face.webp',    anchor: 'full', faceHole: { x: 23.7, y: 17.6, w: 49.0, h: 25.9 } },
  // 2人ぶんの穴。まとめて1つの範囲としてカメラを描くので、並んだ2人が収まる
  { id: 'dog_spa_face',     name: '犬スパ（顔フレーム）',       file: './frames/dog_spa_face.webp',     anchor: 'full', faceHoles: [{ x: 11.8, y: 24.7, w: 40.0, h: 27.9 }, { x: 56.1, y: 26.7, w: 38.5, h: 27.9 }] },
  { id: 'inaka_face',       name: '田舎暮らし（顔フレーム）',     file: './frames/inaka_face.webp',       anchor: 'full', faceHoles: [{ x: 18.9, y: 25.9, w: 36.5, h: 25.0 }, { x: 55.3, y: 41.5, w: 30.3, h: 21.1 }] },
  // ---- 秋の限定フレーム（2026-09-01〜11-30）2026-08-25 ----
  // ⚠️ **通常の一覧には出さない。** 期間中だけ専用ボタンから開く
  { id: 'aki_tsukimi_p', name: 'お月見', file: './frames/aki_tsukimi_p.webp', anchor: 'full', season: 'autumn' },
  { id: 'aki_tsukimi_w', name: 'お月見', file: './frames/aki_tsukimi_w.webp', anchor: 'wide', season: 'autumn' },
  { id: 'aki_ringo_p', name: 'りんご飴（顔フレーム）', file: './frames/aki_ringo_p.webp', anchor: 'full', faceHole: { x: 28.8, y: 37.1, w: 42.2, h: 27 }, season: 'autumn' },
  { id: 'aki_ika_p', name: 'イカ焼き（顔フレーム）', file: './frames/aki_ika_p.webp', anchor: 'full', faceHole: { x: 29.9, y: 30.1, w: 39.9, h: 33.5 }, season: 'autumn' },
  { id: 'aki_budou_w', name: 'ぶどう', file: './frames/aki_budou_w.webp', anchor: 'wide', season: 'autumn' },
  { id: 'aki_kuri_p', name: '栗（顔フレーム）', file: './frames/aki_kuri_p.webp', anchor: 'full', faceHole: { x: 27.9, y: 25.6, w: 44.6, h: 34.5 }, season: 'autumn' },
  { id: 'aki_yakiniku_w', name: '焼肉（顔フレーム）', file: './frames/aki_yakiniku_w.webp', anchor: 'wide', faceHoles: [{ x: 27, y: 12.1, w: 21.1, h: 48.7 }, { x: 57.2, y: 21, w: 20.5, h: 46.4 }], season: 'autumn' },
  { id: 'aki_matsuri_w', name: '秋祭り', file: './frames/aki_matsuri_w.webp', anchor: 'wide', season: 'autumn' },
  { id: 'aki_momiji_p', name: '紅葉', file: './frames/aki_momiji_p.webp', anchor: 'full', season: 'autumn' },
  { id: 'aki_momiji_w', name: '紅葉', file: './frames/aki_momiji_w.webp', anchor: 'wide', season: 'autumn' },
  { id: 'aki_matsuri_p', name: '祭り女子（顔フレーム）', file: './frames/aki_matsuri_p.webp', anchor: 'full', faceHole: { x: 34.9, y: 23.7, w: 27.4, h: 20.1 }, season: 'autumn' },
  { id: 'aki_shokuyoku_w', name: '食欲の秋（顔フレーム）', file: './frames/aki_shokuyoku_w.webp', anchor: 'wide', faceHole: { x: 42.3, y: 12, w: 19.6, h: 38.8 }, season: 'autumn' },
];

/** その枠が、いまの書き出しの形にぴったり合うか。
    合わないものも使えるようにする（伊波さんの判断。欠けてでも全部使いたい）。
    ただし黙って切るのは不親切なので、一覧に印を出すためにここで判定だけしておく */
export function fitsShape(frame: Frame, shape: OutShape): boolean {
  // ⚠️ **季節のものは通常の一覧に出さない**（2026-08-25、ヒマワリからの手紙
  //    「季節限定フレームは通常フレームのリストには並べない」）。
  //    専用ボタンから seasonFrames() で開く
  if (frame.season) return false;
  if (frame.anchor === 'top' || frame.anchor === 'bottom') return true;
  return shape === 'landscape' ? frame.anchor === 'wide' : frame.anchor === 'full';
}

/**
 * いま出ている季節のフレームを、形に合うものだけ返す。
 * 期間外なら空。**専用ボタンを出すかどうかも、この中身が空かで決める**
 */
export function seasonFrames(shape: OutShape, now = new Date()): Frame[] {
  const id = seasonNow(now);
  if (!id) return [];
  return FRAMES.filter(f =>
    f.season === id &&
    (f.anchor === 'top' || f.anchor === 'bottom' ||
     (shape === 'landscape' ? f.anchor === 'wide' : f.anchor === 'full')));
}

// ---- 一覧に出す順番（2026-08-15）---------------------------------------
//
// 127枚あるので、スクロールだけで目当てのものに着くのは難しい。
// ただし**分類のタブは付けない**。伊波さん「あえて、分類しないで、
// 見つけていく楽しさもあるよね」。並び順だけ変えて、探す体験は残す。
//
//   1. 目を引くもの  … 最初の画面で「面白そう」と思ってもらう
//   2. 平成          … テーマとしてまとまっている
//   3. 推し色        … 9色。散らばっていると自分の色を探せない
//   4. 残り          … FRAMES に書いた順のまま。ここで発見の楽しさが残る
//
// ⚠️ **FRAMES の並びは動かさないこと。** ここに id を書くだけで順番が変わる。
//    127行を並べ替えると、どれかを落としても気づけない。
//    ここに無い id は、書いた順のまま後ろに続く。

/** 先頭に出したいもの。この順に並ぶ */
const FRONT_ORDER: string[] = [
  // ⚠️ **新しく足したものは、いちばん上に置く**（2026-08-19、伊波さん
  //    「新しく追加した顔はめ、フレームはうえのほうへ表示」）。
  //    130枚あるので、後ろに入れると誰にも見つけてもらえない。
  //    2026-08-18 追加のぶん（無料枠12枚）
  //    ⚠️ **顔ハメではない枠を先に。** 顔ハメは人を選ぶ（誰かの顔が要る）
  //       ので、まず「そのまま撮れる枠」を並べる（2026-08-19、伊波さん
  //       「さっきのフレームは、顔はめじゃないから上の列に」）
  'yumekawa_pop', 'gothic', 'cyber_angel', 'cyber_punk', 'retro', 'wafu',
  'frame_10',
  // ここから顔ハメ
  'okami_face', 'heisei_loli_face', 'ryoushi_face', 'kuroneko_face',
  'dog_spa_face', 'inaka_face',

  // 目を引くもの。開いた瞬間に見えるところ
  'tc_fun', 'tc_fun2', 'tc_otaku', 'tc_animal', 'tc_mushroom',

  // 平成。ギャル・V系・アイドルのまとまり
  'white', 'black', 'frame_08', 'frame_15', 'frame_13', 'retro_pop',

  // 推し色。横(_w)と縦(_p)が対になっている。
  // 画面には形の合うほうだけが出るので、両方書いておく
  'oshi_red_w', 'oshi_red_p',
  'oshi_pink_w', 'oshi_pink_p',
  'oshi_orange_w', 'oshi_orange_p',
  'oshi_yellow_w', 'oshi_yellow_p',
  'oshi_green_w', 'oshi_green_p',
  'oshi_blue_w', 'oshi_blue_p',
  'oshi_purple_w', 'oshi_purple_p',
  'oshi_white_w', 'oshi_white_p',
  'oshi_black_w', 'oshi_black_p',
];

/** 一覧に出す順に並べ替える。FRONT_ORDER に無いものは元の順のまま後ろへ。
 *
 *  ⚠️ **鍵つき（paid）は、無料のものより後ろに置くこと**
 *     （2026-08-18、伊波さん「鍵付きフレームは後ろへ」）。
 *     先に鍵が並ぶと「使えないものばかり」に見えて、遊ぶ前に萎える。
 *     無料の118枚を先に見せて、その先に「もっとある」を置く。 */
export function inDisplayOrder(list: Frame[]): Frame[] {
  const rank = new Map(FRONT_ORDER.map((id, i) => [id, i]));
  const front: Frame[] = [];
  const rest: Frame[] = [];
  const face: Frame[] = [];
  const locked: Frame[] = [];
  // ⚠️ **顔フレームはひとまとめにする**（2026-08-25、伊波さん
  //    「横フレームの顔フレームの並びも直っていない」）。
  //    書いた順のままだと、顔フレームが3箇所に散らばって並び、
  //    探している人が一覧を何度も往復することになる（実測で7つの塊）。
  //    「顔ハメでない枠を先に」（2026-08-19）の方針はそのまま活かし、
  //    **普通 → 顔 → 鍵つき** の順に寄せる
  const 顔か = (f: Frame) => !!(f.faceHole || f.faceHoles);
  for (const f of list) {
    if (f.paid) locked.push(f);          // 鍵つきは何があっても最後
    else if (rank.has(f.id)) front.push(f);
    else if (顔か(f)) face.push(f);
    else rest.push(f);
  }
  front.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  // FRONT_ORDER で前に出したものの中にも顔フレームがある。そこも寄せる
  const front普通 = front.filter(f => !顔か(f));
  const front顔 = front.filter(顔か);
  return [...front普通, ...rest, ...front顔, ...face, ...locked];
}

/** 読み込みが終わるまで待つ。録画中に間に合わないと、枠だけ抜けた動画が出てしまう */
export async function loadFrame(frame: { file: string; bgFile?: string }): Promise<{ img: HTMLImageElement; bgImg?: HTMLImageElement }> {
  const loadSingle = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('枠の絵を読み込めませんでした: ' + src));
      img.src = src.startsWith('data:') ? src : src + '?v=20260813_raw';
    });
  };

  const img = await loadSingle(frame.file);
  const bgImg = frame.bgFile ? await loadSingle(frame.bgFile) : undefined;
  
  return { img, bgImg };
}
