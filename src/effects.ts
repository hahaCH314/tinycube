// 一発エフェクトの実体。
//
// ここが canvas に直接描く。CSS で画面に重ねると、見えてはいても
// 出来上がった動画には入らない（録るのは canvas に描いた絵なので）。
// 透かしのときと同じ理由で、絵に関わるものは全部ここを通す。
//
// ボタン側（App.tsx）は fireEffect('flash') を呼ぶだけでよい。
// 録画していないときに押しても、プレビューには出る（練習できるように）。
//
// 音は recorder が持っている AudioContext を借りる。録画に混ぜるためで、
// 自前で AudioContext を作ると、鳴っても動画に入らない。

// 音は3つだけ。拍手・ドラム・電子音
// （2026-08-13、伊波さん「音数を、１．拍手２．ドラム３電子音 にしぼり操作しやすくする」）。
// 前は効果音10個＋自分で入れる枠2個の12個あって、対象（40〜50代と子ども）には多すぎた。
//
// 音ファイルの読み込みも同じ指示で廃止。sounds.ts ごと消してある
// （「音ぼファイル挿入廃止」）。
export type EffectId =
  | 'flash'         // 白く弾ける
  | 'mirrorball'    // 光の粒が回りながら流れる（音は鳴らさない）
  | 'clap'          // 効果音（拍手）
  | 'drum'          // 効果音（ドラム）
  | 'blip'          // 効果音（電子音）
  | 'telop';        // 文字を出す（中身は利用者が決める）

type Live = {
  id: EffectId; start: number; dur: number; text?: string; dark?: boolean;
  /** 出る場所。画面の幅・高さに対する割合（0.5, 0.5 が真ん中） */
  x?: number; y?: number;
};

const live: Live[] = [];

/** 効果の長さ（ミリ秒）。音だけのものは絵を持たないので 0 */
const DUR: Record<EffectId, number> = {
  flash: 260,
  // ミラーボールはひと回りする長さが要る。420ms だと光が流れきる前に消えて、
  // 何が起きたのか分からない（2026-08-13、A案「光の粒が回りながら流れる」）
  mirrorball: 2200,
  clap: 0,
  drum: 0,
  blip: 0,
  telop: 1500,
};

// 音の出し先。
//
// 以前は録画中しか鳴らなかった（recorder が渡してくるまで null だったため）。
// ボタンを押しても無反応で、押した手応えが無い（2026-08-10、伊波さんの指摘）。
// いまは自前の AudioContext を持ち、録画が始まったらそこへ枝を1本足す。
let ctx: AudioContext | null = null;
let recDest: AudioNode | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx || ctx.state === 'closed') ctx = new AudioContext();
    // 眠っていたら起こす。待たない（利用者が触っていれば起きる）
    if (ctx.state === 'suspended') ctx.resume().catch(() => { /* 起きなくても続ける */ });
    return ctx;
  } catch {
    return null;   // 音が出せない環境でも、絵は出る
  }
}

/** 録画側の合流点を借りる。ここへも流したものが動画に入る */
export function attachAudio(_ctx: AudioContext, dest: AudioNode) {
  recDest = dest;
}
export function detachAudio() {
  recDest = null;
}

/** 録画が使う AudioContext。効果音と同じものを使う（別々だと動画に入らない） */
export function audioContext(): AudioContext | null {
  return getCtx();
}

// 音ファイルの読み込みは廃止した（2026-08-13、伊波さん「音ぼファイル挿入廃止」）。
// sounds.ts も消してある。鳴るのは、ここで作る3つの音だけ

export function fireEffect(id: EffectId, text?: string, dark?: boolean, x?: number, y?: number) {
  const dur = DUR[id] ?? 300;
  if (dur > 0) {
    // 同じものを連打したときは、前のを消してから出す。
    // 重ねると明滅が濁って、押した回数が分からなくなる
    const i = live.findIndex(e => e.id === id);
    if (i >= 0) live.splice(i, 1);
    live.push({ id, start: performance.now(), dur, text, dark, x, y });
  }
  playSoundFor(id);
}

/** 文字を出す。中身は利用者が設定で書き換えたもの。
    dark を渡すと黒文字・白フチになる（明るい映像の上で読みやすい） */
export function fireTelop(text: string, dark = false, random = false) {
  if (!text.trim()) return;                     // 空のまま押しても何も起きない
  // ばらけさせるときも、端に寄せすぎると切れる。真ん中寄りの範囲に収める
  const x = random ? 0.3 + Math.random() * 0.4 : 0.5;
  const y = random ? 0.25 + Math.random() * 0.5 : 0.5;
  fireEffect('telop', text, dark, x, y);
}

// ずっと出しておく演出。押した瞬間だけの一発ものとは別枠。
// CMCUBE の「エモーショナル」（光の粒がふわっと漂う）を canvas で作り直したもの。
// 中央に被せない縛りは CMCUBE の枠の話なので、ここでは画面全体に散らす
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

/** 録画をやめたときに呼ぶ。出しっぱなしの効果を消す */
export function clearEffects() {
  live.length = 0;
}

/** recorder の描画ループから毎フレーム呼ばれる */
export function drawEffects(g: CanvasRenderingContext2D, W: number, H: number) {
  drawAmbient(g, W, H);
  const now = performance.now();
  for (let i = live.length - 1; i >= 0; i--) {
    const e = live[i];
    const t = (now - e.start) / e.dur;          // 0 → 1
    if (t >= 1) { live.splice(i, 1); continue; }
    switch (e.id) {
      case 'flash':  drawFlash(g, W, H, t); break;
      case 'mirrorball': drawMirrorball(g, W, H, t); break;
      case 'telop': drawTelop(g, W, H, t, e.text ?? '', e.dark ?? false, e.x ?? 0.5, e.y ?? 0.5); break;
      default: break;
    }
  }
}

/** 白く弾けて、すっと引く */
function drawFlash(g: CanvasRenderingContext2D, W: number, H: number, t: number) {
  // 出るのは速く、消えるのはゆっくり。同じ速さだと安っぽく見える
  const a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
  g.save();
  g.globalAlpha = Math.max(0, a) * 0.85;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  g.restore();
}

// ミラーボールの光の粒。
//
// 90年代ディスコ（2026-08-13、伊波さんの指示）。ヒマワリさんとの決定で A案
// 「光の粒が回りながら流れる」を採った。中央に球は描かない。
// 顔ハメ枠のあるアプリなので、真ん中に物を置くと顔と重なるため。
//
// 粒の位置は毎フレーム計算で出す。乱数で散らすと、フレームごとに別の場所へ
// 飛んで「回っている」ように見えない（フラッシュやグリッチのような一瞬の
// 演出なら乱数でよいが、2.2秒かけて回すものは位置が続かないと成立しない）。
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
function drawTelop(
  g: CanvasRenderingContext2D, W: number, H: number, t: number,
  text: string, dark: boolean, rx: number, ry: number,
) {
  const base = Math.min(W, H) * 0.16;
  const size = Math.round(Math.min(base, (W * 0.86) / Math.max(1, text.length)));
  // 0→0.15 で飛び出し、0.75→1 で消える
  const pop = t < 0.15 ? t / 0.15 : 1;
  const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
  const scale = 0.6 + pop * 0.4 + (pop === 1 ? 0 : 0);

  g.save();
  g.globalAlpha = fade;
  g.translate(W * rx, H * ry);
  g.scale(scale, scale);
  g.font = `900 ${size}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // フチを厚めに。どんな映像の上でも読めるようにする。
  // 白文字は暗い映像に、黒文字は明るい映像に強い。中と外を入れ替えるだけ
  g.lineWidth = size * 0.16;
  g.strokeStyle = dark ? '#fff' : '#000';
  g.lineJoin = 'round';
  g.strokeText(text, 0, 0);
  g.fillStyle = dark ? '#111' : '#fff';
  g.fillText(text, 0, 0);
  g.restore();
}

/** ざらざらした音のもと。拍手やドラムのように、音程の無い音に使う */
function noiseSource(ctx: AudioContext, seconds: number): AudioBufferSourceNode {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

// ---- 80年代の音づくり（2026-08-11、伊波さんの指示） ----------------------
//
// 波形をそのまま鳴らすと、どうしてもピコピコした電子音になる。
// 当時の機材に近づける要素は3つあって、どれも安く作れる。
//
//   1. 少しずらした同じ音を2つ重ねる（アナログの発振器は揃わなかった）
//   2. 上の周波数を落とす（テープとアナログ回路の丸み）
//   3. 短いディレイを薄く掛ける（当時のレコードはほぼ全部これが乗っている）
//
// 3 は音ごとに作らず、鳴らすたびに1本の出口へまとめて通す。

/** その一発ぶんの出口。耳と録画の両方へ同じものを流す
 *  （別々の AudioContext にすると、鳴っても動画に入らない） */
function bus80s(ctx: AudioContext): GainNode {
  const input = ctx.createGain();

  // アナログの丸み。上のほうを少し削る
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 7600;

  // 薄いディレイ。返りは高音から先に減らす（テープのエコーと同じ癖）
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.16;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 3000;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.24;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;

  input.connect(tone);
  tone.connect(delay);
  delay.connect(damp);
  damp.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);

  const outs: AudioNode[] = [ctx.destination];
  if (recDest) outs.push(recDest);
  for (const o of outs) { tone.connect(o); wet.connect(o); }
  return input;
}

type Env = {
  /** 立ち上がり。0 に近いほど硬い音になる */
  attack?: number;
  /** そのまま伸ばす時間 */
  hold?: number;
  /** 消えるまでの時間 */
  release: number;
  level: number;
};

/** 音程のある一声。detune を渡すと、同じ音を少しずらして重ねられる */
function voice(
  ctx: AudioContext, out: AudioNode, type: OscillatorType,
  hz: number, now: number, env: Env,
  opts: { detune?: number; to?: number; glide?: number; delay?: number } = {},
) {
  const t0 = now + (opts.delay ?? 0);
  const a = env.attack ?? 0.004;
  const hold = env.hold ?? 0;
  const end = t0 + a + hold + env.release;

  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.detune.value = opts.detune ?? 0;
  o.frequency.setValueAtTime(hz, t0);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + (opts.glide ?? env.release));

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(env.level, t0 + a);
  g.gain.setValueAtTime(env.level, t0 + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, end);

  o.connect(g);
  g.connect(out);
  o.start(t0);
  o.stop(end + 0.05);
}

/** 音程を持たない音。削り方で叩き物にも金物にもなる */
function hit(
  ctx: AudioContext, out: AudioNode, now: number, seconds: number,
  filter: BiquadFilterType, freq: number, q: number, env: Env,
  opts: { to?: number; delay?: number } = {},
) {
  const t0 = now + (opts.delay ?? 0);
  const a = env.attack ?? 0.002;
  const end = t0 + a + (env.hold ?? 0) + env.release;

  const src = noiseSource(ctx, seconds);
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t0);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, end);
  f.Q.value = q;

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(env.level, t0 + a);
  g.gain.setValueAtTime(env.level, t0 + a + (env.hold ?? 0));
  g.gain.exponentialRampToValueAtTime(0.0001, end);

  src.connect(f); f.connect(g); g.connect(out);
  src.start(t0); src.stop(end + 0.05);
}

/** 効果音。ファイルを持たずにその場で作る（読み込み待ちが無く、容量も増えない） */
function playSoundFor(id: EffectId) {
  // 文字を出すボタンは鳴らさない。押すたびに動画へ音が乗ってしまい、
  // 効果音を自分で選ぶ意味が薄れる（2026-08-10、伊波さんの指示）。
  // ミラーボールも鳴らさない。光の演出は音のボタンと役割を分ける
  // （2026-08-13、伊波さん・ヒマワリさんの決定）
  if (id === 'telop' || id === 'mirrorball') return;
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  // 耳にも届かせ、録画中なら動画にも入れる
  const out = bus80s(ctx);

  switch (id) {
    case 'clap':
      // 拍手。当時のドラムマシンと同じで、細かく3回叩いてから余韻を残す
      for (let i = 0; i < 3; i++) {
        hit(ctx, out, now, 0.06, 'bandpass', 1050, 1.1,
          { release: 0.035, level: 0.34 - i * 0.06 }, { delay: i * 0.012 });
      }
      hit(ctx, out, now, 0.40, 'bandpass', 1150, 0.9,
        { attack: 0.006, release: 0.26, level: 0.22 }, { delay: 0.036 });
      break;

    case 'drum':
      // ドラムロール。だんだん強く、最後に一発
      for (let i = 0; i < 14; i++) {
        hit(ctx, out, now, 0.05, 'bandpass', 220, 1.4,
          { release: 0.045, level: 0.10 + i * 0.016 }, { delay: i * 0.055 });
      }
      voice(ctx, out, 'sine', 190, now, { release: 0.34, level: 0.5 },
        { to: 55, glide: 0.24, delay: 0.80 });
      break;

    case 'blip':
      // ぴこ。8ビットの残り香。2音を素早く上げる
      voice(ctx, out, 'square', 1046, now, { attack: 0.001, release: 0.05, level: 0.16 });
      voice(ctx, out, 'square', 1568, now, { attack: 0.001, release: 0.07, level: 0.14 },
        { delay: 0.055 });
      break;

    case 'flash':
      // 光と一緒に鳴る音。下から一気に持ち上げて弾けさせる
      hit(ctx, out, now, 0.24, 'highpass', 600, 0.8,
        { attack: 0.10, release: 0.10, level: 0.20 }, { to: 8000 });
      voice(ctx, out, 'triangle', 1568, now, { release: 0.45, level: 0.18 }, { delay: 0.10 });
      break;

    // ミラーボールは鳴らさない。光の演出のボタンと、音のボタン（拍手・ドラム・
    // 電子音）で役割をはっきり分ける（2026-08-13、伊波さん・ヒマワリさんの決定）。
    // 早期に return しているので、ここに case は無い

    default:
      break;
  }
}
