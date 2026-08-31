// 撮っているあいだ、ずっと画面に乗っている飾り。
//
// ここが canvas に直接描く。CSS で画面に重ねると、見えてはいても
// 出来上がった写真には入らない（撮るのは canvas に描いた絵なので）。
// 透かしのときと同じ理由で、絵に関わるものは全部ここを通す。
//
// ■ 2026-08-31、動画をやめたときに半分になった
//
// 伊波さん「思い切って動画やめようかな」。
// **一発もの（フラッシュ・流れるテロップ）と、音3つ（拍手・ドラム・電子音）は
// 全部消した。** どれも録画中に押すためのもので、写真では押す場面が無かった
// （画面にも `captureKind !== 'photo'` で出していなかった）。
// 音を扱わなくなったので、AudioContext もここには無い。
//
// 残したのは、撮る前に選んでおく2つだけ：
//   雰囲気（ambient） … エモい／ミラーボール。撮っているあいだずっと出る
//   色味（tone）      … あたたかい／つめたい／あざやか
// どちらも写真にそのまま乗る。

type Mote = {
  x: number; y: number; r: number; vy: number; sway: number; life: number; age: number;
  /** 光の色。淡いピンクからオレンジのあいだで1つずつ変える */
  hue: number;
  /** 手前の大きな玉か、奥の小さな玉か。小さいほうは輪郭を少し出す */
  big: boolean;
};
/**
 * かけっぱなしにする飾り。
 *
 * ⚠️ **'mirrorball' を足した**（2026-08-23、伊波さん「ミラーボールは先に」）。
 *    もとは押すと 2.2 秒だけ回る一発ものだったが、自撮りでは押しに行った指が
 *    レンズに被る（「自撮りにすると指でカメラが隠れる」）。撮る前に選んで
 *    ずっと回してしまえば、撮影中に触らなくて済む。
 *    **一発のほう（fireEffect('mirrorball')）も残してある。** どちらからでも出せる
 */
type AmbientId = 'emotional' | 'mirrorball';
let ambient: AmbientId | null = null;
let motes: Mote[] = [];
let lastTick = 0;
let startedAt = 0;

export function setAmbient(kind: AmbientId | null) {
  ambient = kind;
  startedAt = performance.now();
  if (!kind) motes = [];
}
export function getAmbient() {
  return ambient;
}

/**
 * 色味の加工（2026-08-23、伊波さん「エフェクトも初めから選んで撮影中は
 * 出しておこう」「総音色身を変えるがいいね」）。
 *
 * ■ なぜ要るか
 *
 * 動画の自撮りは、片手で持って自分を映しながら画面を触ることになる。
 * **撮っている最中にボタンを押すと、指がレンズに被る**（伊波さん
 * 「自撮りにすると指でカメラが隠れる」）。だから撮る前に選んでおいて、
 * 撮影中はかけっぱなしにする。フラッシュのような一瞬のものは、
 * かけっぱなしにできないので色味に置き換えた。
 *
 * ■ どうやっているか
 *
 * 映像の上に色を1枚重ねるだけ。**画素を1つずつ触らない**。
 * getImageData で走査すると 1080p で1コマ 30ms 近くかかり、
 * 描画ループが持たない（カクつきは「重い」ではなく「壊れた」に見える）。
 * 重ねるだけなら GPU が持っていくので、ほぼただ。
 */
export type ToneId = 'warm' | 'cool' | 'vivid';

/** 色味ごとの重ねかた。合成の仕方と色と濃さ */
const TONE: Record<ToneId, { mode: GlobalCompositeOperation; color: string; alpha: number }> = {
  // 夕方のような橙。肌があたたかく見える
  warm:  { mode: 'overlay',    color: '#ff9a3c', alpha: 0.30 },
  // 朝のような青。涼しく、すこし硬く見える
  cool:  { mode: 'overlay',    color: '#3ca8ff', alpha: 0.30 },
  // 色が濃くなる。彩度を上げる代わりに、彩度の高いところを持ち上げる
  vivid: { mode: 'saturation', color: 'hsl(0, 90%, 50%)', alpha: 0.55 },
};

let tone: ToneId | null = null;

export function setTone(kind: ToneId | null) {
  tone = kind;
}
export function getTone() {
  return tone;
}

/**
 * 色味を1枚重ねる。**映像を描いた直後・他の効果より前**に呼ぶこと。
 * 順番を逆にすると、文字やミラーボールにまで色がかかる。
 */
export function drawTone(g: CanvasRenderingContext2D, W: number, H: number) {
  if (!tone) return;
  const t = TONE[tone];
  g.save();
  g.globalCompositeOperation = t.mode;
  g.globalAlpha = t.alpha;
  g.fillStyle = t.color;
  g.fillRect(0, 0, W, H);
  g.restore();
}

function drawAmbient(g: CanvasRenderingContext2D, W: number, H: number) {
  const now = performance.now();
  const dt = lastTick ? Math.min(now - lastTick, 100) : 16;
  lastTick = now;
  if (!ambient) return;

  // ずっと回るミラーボール（2026-08-23）。
  // 一発のほうは t が 0→1 で進んで消えるが、こちらは終わらせない。
  // 2.2 秒でひと回りするのは同じなので、余りを取って t を作り続ける。
  // ⚠️ **出入りの薄れを効かせないこと。** 一発のほうは終わりに向けて
  //    消えていくが、かけっぱなしで薄くなると点滅して見える
  if (ambient === 'mirrorball') {
    const t = ((now - startedAt) % 2200) / 2200;
    drawMirrorball(g, W, H, t, true);
    return;
  }

  const unit = Math.min(W, H);

  // つけた瞬間から見えていてほしいので、足りない分は一気に足す。
  // 下から昇らせる作りだと、上がりきる前に消えて何も見えなかった
  // （2026-08-10、伊波さんの「出ない」「光のぼかしみたいなのがイイ」）。
  // 画面のどこにでも湧かせて、大きくぼかす
  // レンズの前にシャボン玉が浮いているイメージ（2026-08-10、伊波さんの指示）。
  // 大きいものと小さいものを混ぜる。同じ大きさばかりだと奥行きが出ない
  const want = 11;
  while (motes.length < want) {
    const big = Math.random() < 0.45;
    const r = big
      ? unit * (0.30 + Math.random() * 0.34)     // 手前に大きく
      : unit * (0.07 + Math.random() * 0.13);    // 奥に小さく
    motes.push({
      // 大きいので、中心が画面の外にあってもよい（一部だけ差し込む光になる）
      x: (Math.random() * 1.6 - 0.3) * W,
      y: (Math.random() * 1.6 - 0.3) * H,
      r,
      vy: -(0.004 + Math.random() * 0.008) * H / 1000,
      sway: Math.random() * Math.PI * 2,
      life: 4000 + Math.random() * 5000,
      // 180〜320度。水色・青・紫・淡いピンク（シャボン玉らしいクリアな色）
      hue: 180 + Math.random() * 140,
      big,
      // 最初の一群だけ、途中から始まったことにして一斉に消えないようにする
      age: motes.length < want && now - startedAt < 200 ? Math.random() * 3000 : 0,
    });
  }

  g.save();
  // 光を足す形で重ねる。暗い映像でも沈まない
  g.globalCompositeOperation = 'lighter';
  for (let i = motes.length - 1; i >= 0; i--) {
    const m = motes[i];
    m.age += dt;
    if (m.age > m.life) { motes.splice(i, 1); continue; }
    m.y += m.vy * dt;
    m.sway += dt * 0.0006;
    const x = m.x + Math.sin(m.sway) * m.r * 0.6;

    // そっと現れて、そっと消える
    const t = m.age / m.life;
    const a = t < 0.25 ? t / 0.25 : t > 0.6 ? (1 - t) / 0.4 : 1;

    // 中心をふわっと明るく、外へ長く伸ばす。輪郭が出ないよう途中を厚めに取る。
    // 色は水色〜紫。赤色を避けて「録画マーク」に見間違われないようにする。
    //
    // ⚠️ **ここで createRadialGradient を呼んではいけない。**
    //    エモーショナルは点けっぱなしなので、毎フレーム11個ぶん作ると
    //    ずっと重いままになる。焼いた絵を貼るだけにする（2026-08-15）
    g.globalAlpha = a;
    g.drawImage(moteSprite(m.hue, m.big), x - m.r, m.y - m.r, m.r * 2, m.r * 2);
    g.globalAlpha = 1;
  }

  // フィルムの粒子。少しざらつかせると、のっぺりした映像が写真っぽくなる
  // （2026-08-10、伊波さんの「画像が少し荒くなるとか」）。
  // 毎フレーム作ると重いので、小さな模様を1枚作って敷き詰め、位置だけずらす
  const grain = grainPattern(g);
  if (grain) {
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.22;
    g.save();
    g.translate(-Math.random() * 64, -Math.random() * 64);
    g.fillStyle = grain;
    g.fillRect(0, 0, W + 64, H + 64);
    g.restore();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';
  }

  // 全体にうっすら暖かい膜をかける。粒だけだと点の集まりに見える。
  // これも毎フレーム作らず使い回す（2026-08-15）
  g.fillStyle = ambientVeilFor(g, W, H, unit);
  g.fillRect(0, 0, W, H);
  g.restore();
}

// ざらつきの模様。1枚だけ作って使い回す
let grainTile: CanvasPattern | null = null;
function grainPattern(g: CanvasRenderingContext2D): CanvasPattern | null {
  if (grainTile) return grainTile;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const gg = c.getContext('2d');
  if (!gg) return null;
  const im = gg.createImageData(size, size);
  for (let i = 0; i < im.data.length; i += 4) {
    const v = 110 + Math.random() * 90;      // 中間の明るさを中心に散らす
    im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    im.data[i + 3] = 255;
  }
  gg.putImageData(im, 0, 0);
  grainTile = g.createPattern(c, 'repeat');
  return grainTile;
}

/** recorder の描画ループから毎フレーム呼ばれる。
 *  いまは雰囲気（ambient）だけ。一発ものは 2026-08-31 に無くなった */
export function drawEffects(g: CanvasRenderingContext2D, W: number, H: number) {
  drawAmbient(g, W, H);
}

// ミラーボールは「光の粒が回りながら流れる」形。中央に球は描かない。
// 顔ハメ枠のあるアプリなので、真ん中に物を置くと顔と重なるため。
//
// 粒の位置は毎フレーム計算で出す。乱数で散らすと、フレームごとに別の場所へ
// 飛んで「回っている」ように見えない（2.2秒かけて回すものは、位置が続かないと成立しない）。
const BALL_SPOTS = 28;

/** 粒ひとつぶんの、いまの居場所と明るさ。
 *
 *  ⚠️ 粒ごとに「別の輪」を回らせること。全部を1つの角度から出すと、
 *  どんなに散らし方を工夫しても**1本の曲線の上に並ぶ**。
 *  実際に2回そうなった（2026-08-13、描いて確かめた）。
 *  本物のミラーボールは、高さの違う輪がいくつもあって、
 *  輪ごとに大きさも速さも違う。それを真似る。 */
function spotAt(i: number, spin: number, W: number, H: number) {
  // この粒が乗っている輪。7本の輪に配る（1本あたり4粒）
  const ring = i % 7;
  // 輪の高さ。上から下へ等間隔に置く
  const y = H * (0.10 + (ring / 6) * 0.80);
  // 輪の大きさ。真ん中の輪ほど大きく、上下の端は小さい（球の形）
  const spread = 0.30 + Math.sin((ring / 6) * Math.PI) * 0.40;
  // 輪ごとに回る速さと出だしの位置を変える。揃うと縞に見える
  const speed = 1 + ring * 0.13;
  const a = (i * 2.39996) + spin * speed + ring * 1.7;
  const x = W * (0.5 + Math.sin(a) * spread);
  // 手前に来たときだけ明るい。奥へ回ったら消える
  const face = Math.cos(a);
  return { x, y, face };
}

/** 光の粒が回りながら流れる。映像はそのまま見えて、光を足すだけ */
// エモーショナルの玉を焼いておく置き場。
//
// ⚠️ **点けっぱなしのエフェクトなので、ここが一番効く。**
//    毎フレーム11個ぶんグラデーションを作ると、ずっと重いままになる
//    （2026-08-15、伊波さん「エフェクトかなぁ」）。
//    色は 180〜320 の連続値なので、10 きざみに丸めて数を抑える（15種類 × 大小）。
const moteCache = new Map<string, HTMLCanvasElement>();

function moteSprite(hue: number, big: boolean): HTMLCanvasElement {
  const h = Math.round(hue / 10) * 10;          // 10きざみに丸める
  const key = h + (big ? 'B' : 's');
  const hit = moteCache.get(key);
  if (hit) return hit;

  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const cg = c.getContext('2d')!;
  const r = S / 2;
  const grad = cg.createRadialGradient(r, r, 0, r, r, r);
  if (big) {
    // 手前の玉。ふわっと大きく、中心はより白く光るように
    grad.addColorStop(0,    `hsla(${h}, 85%, 95%, 0.40)`);
    grad.addColorStop(0.30, `hsla(${h}, 80%, 85%, 0.25)`);
    grad.addColorStop(0.65, `hsla(${h}, 75%, 75%, 0.10)`);
    grad.addColorStop(1,    `hsla(${h}, 70%, 70%, 0)`);
  } else {
    // 奥の玉。縁をわずかに強くすると、シャボン玉らしく見える
    grad.addColorStop(0,    `hsla(${h}, 85%, 95%, 0.30)`);
    grad.addColorStop(0.55, `hsla(${h}, 80%, 85%, 0.15)`);
    grad.addColorStop(0.86, `hsla(${h}, 85%, 90%, 0.30)`);
    grad.addColorStop(1,    `hsla(${h}, 80%, 80%, 0)`);
  }
  cg.fillStyle = grad;
  cg.fillRect(0, 0, S, S);

  moteCache.set(key, c);
  return c;
}

// 全体に乗せる色（エモーショナル）。画面の大きさが変わったときだけ作り直す
let ambientVeilCache: { w: number; h: number; grad: CanvasGradient } | null = null;

function ambientVeilFor(g: CanvasRenderingContext2D, W: number, H: number, unit: number): CanvasGradient {
  if (ambientVeilCache && ambientVeilCache.w === W && ambientVeilCache.h === H) return ambientVeilCache.grad;
  const grad = g.createRadialGradient(W * 0.5, H * 0.42, unit * 0.1, W * 0.5, H * 0.5, unit * 0.85);
  grad.addColorStop(0, 'hsla(220, 90%, 85%, 0.08)');
  grad.addColorStop(1, 'hsla(280, 85%, 78%, 0)');
  ambientVeilCache = { w: W, h: H, grad };
  return grad;
}

// 粒の絵をあらかじめ焼いておく置き場。
//
// ⚠️ **毎フレーム createRadialGradient を呼んではいけない。**
//    粒28個ぶんを毎回作ると、1秒あたり1680回グラデーションを作ることになり、
//    スマホの実機で撮影中の映像がカクついた
//    （2026-08-15、伊波さん「動画が遅い？固まる？」「エフェクトかなぁ」）。
//    色は3種類しか使わないので、小さな絵にして焼いておき、貼るだけにする。
const ballCache = new Map<string, HTMLCanvasElement>();

/** 指定の色の光の粒を、使い回せる絵にして返す */
function ballSprite(hue: number): HTMLCanvasElement {
  const key = String(hue);
  const hit = ballCache.get(key);
  if (hit) return hit;

  // 貼るときに拡大縮小するので、元は固定の大きさでよい
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const cg = c.getContext('2d')!;
  const r = S / 2;
  const grad = cg.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, `hsla(${hue}, 100%, 92%, 1)`);
  grad.addColorStop(0.45, `hsla(${hue}, 95%, 78%, 0.42)`);
  grad.addColorStop(1, `hsla(${hue}, 90%, 70%, 0)`);
  cg.fillStyle = grad;
  cg.fillRect(0, 0, S, S);

  ballCache.set(key, c);
  return c;
}

// 全体に乗せる色。画面の大きさが変わったときだけ作り直す
let veilCache: { w: number; h: number; grad: CanvasGradient } | null = null;

function veilFor(g: CanvasRenderingContext2D, W: number, H: number): CanvasGradient {
  if (veilCache && veilCache.w === W && veilCache.h === H) return veilCache.grad;
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, 'hsla(320, 90%, 70%, 1)');
  grad.addColorStop(0.5, 'hsla(275, 90%, 70%, 1)');
  grad.addColorStop(1, 'hsla(190, 90%, 70%, 1)');
  veilCache = { w: W, h: H, grad };
  return grad;
}

/**
 * @param loop かけっぱなしのときは true。出入りで薄れさせない
 *             （2026-08-23。薄れると点滅して見える）
 */
function drawMirrorball(g: CanvasRenderingContext2D, W: number, H: number, t: number, loop = false) {
  const unit = Math.min(W, H);
  // 出るのは速く、消えるのはゆっくり。ふっと現れてすっと引く
  const fade = loop ? 1 : t < 0.12 ? t / 0.12 : t > 0.72 ? (1 - t) / 0.28 : 1;
  const spin = t * Math.PI * 2.4;               // 2.2秒で1回転ちょっと

  g.save();
  // 光を足す形で重ねる。暗い映像でも沈まない（エモーショナルと同じ理由）
  g.globalCompositeOperation = 'lighter';

  for (let i = 0; i < BALL_SPOTS; i++) {
    const { x, y, face } = spotAt(i, spin, W, H);
    if (face <= 0.02) continue;                 // 奥へ回った粒は描かない

    // 手前ほど大きく明るい。奥のものは小さく淡い
    const r = unit * (0.035 + face * 0.055);
    const a = fade * face * 0.85;

    // ディスコの照明の色。ピンク・水色・紫を粒ごとに配る
    const hue = (i * 47) % 360 < 120 ? 320 : (i % 3 === 0 ? 190 : 275);

    // 焼いてある粒を貼るだけ。濃さは globalAlpha で付ける
    g.globalAlpha = a;
    g.drawImage(ballSprite(hue), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;

    // 中心の芯。四角く置くと、鏡の破片が光っているように見える
    const core = r * 0.18;
    g.fillStyle = `hsla(${hue}, 100%, 97%, ${a * 0.9})`;
    g.fillRect(x - core, y - core, core * 2, core * 2);
  }

  // 全体にうっすら色を乗せる。粒だけだと点の集まりに見える。
  // これも毎フレーム作らず、画面の大きさが変わったときだけ作り直す
  g.globalAlpha = fade * 0.10;
  g.fillStyle = veilFor(g, W, H);
  g.fillRect(0, 0, W, H);
  g.restore();
}

/** 文字。ぽんと出て、少し待って、消える。
    長い言葉を入れられても画面からはみ出さないよう、文字数で大きさを落とす */