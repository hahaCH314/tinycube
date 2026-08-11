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

export type EffectId =
  | 'flash'         // 白く弾ける
  | 'glitch'        // 画面がずれて色が割れる
  | 'bam'           // 効果音（低くて重い）
  | 'ding'          // 効果音（高くて短い）
  | 'pon'           // 効果音（軽く跳ねる）
  | 'buzz'          // 効果音（外れ・ブー）
  | 'clap'          // 効果音（拍手）
  | 'drum'          // 効果音（ドラムロール）
  | 'blip'          // 効果音（ぴこ）
  | 'dread'         // 効果音（ずーん）
  | 'slash'         // 効果音（しゃきーん）
  | 'fanfare'       // 効果音（ジャーン）
  // 自分の音を入れる枠。こちらの音は用意しない。
  // 入れるまで押しても鳴らない（2026-08-11、伊波さん「音１，２がユーザーが追加できる機能」）
  | 'my1'
  | 'my2'
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
  glitch: 420,
  bam: 0,
  ding: 0,
  pon: 0,
  buzz: 0,
  clap: 0,
  drum: 0,
  blip: 0,
  dread: 0,
  slash: 0,
  fanfare: 0,
  my1: 0,
  my2: 0,
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

// 利用者が入れた音があれば、そちらを鳴らす。
// 差し替えの管理は sounds.ts が持つ（読み込み・保存・消去）
let getCustom: ((id: EffectId) => AudioBuffer | null) | null = null;
export function useCustomSounds(fn: (id: EffectId) => AudioBuffer | null) {
  getCustom = fn;
}

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
let ambient: 'emotional' | null = null;
let motes: Mote[] = [];
let lastTick = 0;
let startedAt = 0;

export function setAmbient(kind: 'emotional' | null) {
  ambient = kind;
  startedAt = performance.now();
  if (!kind) motes = [];
}
export function getAmbient() {
  return ambient;
}

function drawAmbient(g: CanvasRenderingContext2D, W: number, H: number) {
  const now = performance.now();
  const dt = lastTick ? Math.min(now - lastTick, 100) : 16;
  lastTick = now;
  if (!ambient) return;

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
    // 色は水色〜紫。赤色を避けて「録画マーク」に見間違われないようにする
    const h = m.hue;
    const grad = g.createRadialGradient(x, m.y, 0, x, m.y, m.r);
    if (m.big) {
      // 手前の玉。ふわっと大きく、中心はより白く光るように
      grad.addColorStop(0,    `hsla(${h}, 85%, 95%, ${0.40 * a})`);
      grad.addColorStop(0.30, `hsla(${h}, 80%, 85%, ${0.25 * a})`);
      grad.addColorStop(0.65, `hsla(${h}, 75%, 75%, ${0.10 * a})`);
      grad.addColorStop(1,    `hsla(${h}, 70%, 70%, 0)`);
    } else {
      // 奥の玉。縁をわずかに強くすると、シャボン玉らしく見える
      grad.addColorStop(0,    `hsla(${h}, 85%, 95%, ${0.30 * a})`);
      grad.addColorStop(0.55, `hsla(${h}, 80%, 85%, ${0.15 * a})`);
      grad.addColorStop(0.86, `hsla(${h}, 85%, 90%, ${0.30 * a})`);
      grad.addColorStop(1,    `hsla(${h}, 80%, 80%, 0)`);
    }
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, m.y, m.r, 0, Math.PI * 2);
    g.fill();
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

  // 全体にうっすら暖かい膜をかける。粒だけだと点の集まりに見える
  const veil = g.createRadialGradient(W * 0.5, H * 0.42, unit * 0.1, W * 0.5, H * 0.5, unit * 0.85);
  veil.addColorStop(0, 'hsla(220, 90%, 85%, 0.08)');
  veil.addColorStop(1, 'hsla(280, 85%, 78%, 0)');
  g.fillStyle = veil;
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
      case 'glitch': drawGlitch(g, W, H, t); break;
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

/** 横に切って、ずらして、色を割る */
function drawGlitch(g: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const strength = 1 - t;                        // だんだん収まる
  const bands = 6;
  g.save();
  for (let i = 0; i < bands; i++) {
    const h = H / bands;
    const y = i * h;
    const dx = (Math.random() - 0.5) * W * 0.12 * strength;
    // すでに描いてある絵を、その帯だけ横へずらして描き足す
    g.drawImage(g.canvas, 0, y, W, h, dx, y, W, h);
  }
  // 色割れ。赤と青緑を薄く重ねる
  g.globalCompositeOperation = 'screen';
  g.globalAlpha = 0.18 * strength;
  g.fillStyle = '#ff0040';
  g.fillRect(-W * 0.01, 0, W, H);
  g.fillStyle = '#00e5ff';
  g.fillRect(W * 0.01, 0, W, H);
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

/** アナログシンセらしく、同じ音を少しずらして2つ重ねる */
function fat(
  ctx: AudioContext, out: AudioNode, type: OscillatorType,
  hz: number, now: number, env: Env,
  opts: { to?: number; glide?: number; delay?: number; spread?: number } = {},
) {
  const { spread = 9, ...rest } = opts;
  const half = { ...env, level: env.level * 0.6 };
  voice(ctx, out, type, hz, now, half, { ...rest, detune: -spread });
  voice(ctx, out, type, hz, now, half, { ...rest, detune: spread });
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
  // 効果音を自分で選ぶ意味が薄れる（2026-08-10、伊波さんの指示）
  if (id === 'telop') return;
  const ctx = getCtx();
  if (!ctx) return;

  // 入れてある音があれば、それをそのまま鳴らす。
  // こちらで作った音は、既製の音源には敵わない（伊波さんの「音色がチープ」）
  const mine = getCustom?.(id);
  if (mine) {
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = mine;
    gain.gain.value = 0.9;
    src.connect(gain);
    gain.connect(ctx.destination);
    if (recDest) gain.connect(recDest);
    src.start();
    return;
  }

  const now = ctx.currentTime;
  // 耳にも届かせ、録画中なら動画にも入れる
  const out = bus80s(ctx);

  switch (id) {
    case 'bam':
      // どんっ。80年代のドラムマシンのタム。高いところから一気に落とす
      voice(ctx, out, 'sine', 210, now, { release: 0.30, level: 0.55 }, { to: 52, glide: 0.22 });
      hit(ctx, out, now, 0.12, 'lowpass', 2200, 0.7, { release: 0.06, level: 0.30 }, { to: 400 });
      break;

    case 'ding':
      // きらっ。FMシンセのベル。5度上と2オクターブ上を薄く足すと金属に聞こえる
      voice(ctx, out, 'triangle', 1046, now, { release: 0.70, level: 0.26 });
      voice(ctx, out, 'triangle', 1568, now, { release: 0.50, level: 0.13 }, { detune: 7 });
      voice(ctx, out, 'sine', 3136, now, { release: 0.22, level: 0.09 });
      break;

    case 'pon':
      // ぽん。木琴のような短い音。硬い出だしに丸い胴を足す
      voice(ctx, out, 'sine', 784, now, { attack: 0.002, release: 0.22, level: 0.34 });
      voice(ctx, out, 'triangle', 1568, now, { attack: 0.001, release: 0.06, level: 0.14 });
      break;

    case 'buzz':
      // ぶー。アナログのブラス。太い2声を下へ滑らせる
      fat(ctx, out, 'sawtooth', 165, now, { attack: 0.01, hold: 0.12, release: 0.30, level: 0.34 },
        { to: 98, glide: 0.40 });
      break;

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

    case 'dread':
      // ずーん。低いところへ長く落とす。太い2声を重ねて濁らせる
      voice(ctx, out, 'sine', 120, now, { release: 1.30, level: 0.45 }, { to: 30, glide: 1.20 });
      fat(ctx, out, 'sawtooth', 60, now, { attack: 0.05, release: 1.20, level: 0.20 },
        { to: 22, glide: 1.10, spread: 14 });
      break;

    case 'slash':
      // しゃきん。金属をこすった音。削る位置を一気に上へ動かす
      hit(ctx, out, now, 0.30, 'highpass', 1800, 0.9,
        { attack: 0.002, release: 0.24, level: 0.26 }, { to: 9000 });
      voice(ctx, out, 'sawtooth', 1600, now, { attack: 0.001, release: 0.16, level: 0.10 },
        { to: 4200, glide: 0.10 });
      break;

    case 'fanfare':
      // ジャーン。シティポップのシンセブラス。9thを足した和音を一発で置く
      // ド・ミ・ソ・シ・レ
      [523, 659, 784, 988, 1175].forEach((hz, i) => {
        fat(ctx, out, 'sawtooth', hz, now,
          { attack: 0.02, hold: 0.14, release: 0.85, level: 0.20 - i * 0.02 });
      });
      break;

    case 'flash':
      // 光と一緒に鳴る音。下から一気に持ち上げて弾けさせる
      hit(ctx, out, now, 0.24, 'highpass', 600, 0.8,
        { attack: 0.10, release: 0.10, level: 0.20 }, { to: 8000 });
      voice(ctx, out, 'triangle', 1568, now, { release: 0.45, level: 0.18 }, { delay: 0.10 });
      break;

    case 'glitch':
      // テープが止まるときの音。音程ごと引きずり下ろす
      fat(ctx, out, 'square', 260, now, { attack: 0.004, release: 0.34, level: 0.16 },
        { to: 42, glide: 0.30, spread: 22 });
      hit(ctx, out, now, 0.30, 'bandpass', 2400, 2.2,
        { release: 0.26, level: 0.14 }, { to: 300 });
      break;

    default:
      break;
  }
}
