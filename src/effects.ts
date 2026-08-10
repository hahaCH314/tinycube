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
type Mote = { x: number; y: number; r: number; vy: number; sway: number; life: number; age: number };
let ambient: 'emotional' | null = null;
let motes: Mote[] = [];
let lastTick = 0;

export function setAmbient(kind: 'emotional' | null) {
  ambient = kind;
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

  // 1秒あたりの数で出す。フレームの速さに左右されないようにする
  const perSecond = 14;
  if (Math.random() < (perSecond * dt) / 1000 && motes.length < 90) {
    const r = (Math.random() * 0.004 + 0.0015) * Math.min(W, H) * 2;
    motes.push({
      x: Math.random() * W,
      y: H + r,
      r,
      vy: -(0.012 + Math.random() * 0.02) * H / 1000,
      sway: Math.random() * Math.PI * 2,
      life: 5000 + Math.random() * 4000,
      age: 0,
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
    m.sway += dt * 0.001;
    const x = m.x + Math.sin(m.sway) * m.r * 3;

    // 出るときと消えるときに、そっと現れて そっと消える
    const t = m.age / m.life;
    const a = t < 0.15 ? t / 0.15 : t > 0.7 ? (1 - t) / 0.3 : 1;

    const grad = g.createRadialGradient(x, m.y, 0, x, m.y, m.r * 3);
    grad.addColorStop(0, `rgba(255, 240, 220, ${0.55 * a})`);
    grad.addColorStop(0.4, `rgba(255, 200, 190, ${0.22 * a})`);
    grad.addColorStop(1, 'rgba(255, 190, 180, 0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, m.y, m.r * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
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
  const outs: AudioNode[] = [ctx.destination];
  if (recDest) outs.push(recDest);
  const dest = { connect: (n: AudioNode) => { for (const o of outs) n.connect(o); } };

  // 音程を持たない音は、ざらざらした音のもとを削って作る
  if (id === 'clap' || id === 'drum') {
    const src = noiseSource(ctx, id === 'clap' ? 0.5 : 0.9);
    const filt = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filt.type = 'bandpass';
    filt.frequency.value = id === 'clap' ? 1400 : 180;
    filt.Q.value = id === 'clap' ? 0.8 : 1.2;
    src.connect(filt); filt.connect(gain);
    dest.connect(gain);
    if (id === 'clap') {
      // ぱらぱらと重なる手のひら。4回に分けて叩く
      gain.gain.setValueAtTime(0.0001, now);
      for (let i = 0; i < 4; i++) {
        const t = now + i * 0.055;
        gain.gain.exponentialRampToValueAtTime(0.35 - i * 0.05, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.02, t + 0.05);
      }
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    } else {
      // だんだん強くなって、最後に止まる
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.linearRampToValueAtTime(0.45, now + 0.75);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    }
    src.start(now); src.stop(now + 1.0);
    return;
  }

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  dest.connect(gain);

  if (id === 'bam' || id === 'flash') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
    osc.start(now); osc.stop(now + 0.24);
  } else if (id === 'ding') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now); osc.stop(now + 0.22);
  } else if (id === 'pon') {
    // 軽く跳ねる音。上へ滑らせると「ぽん」に聞こえる
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.09);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
    osc.start(now); osc.stop(now + 0.18);
  } else if (id === 'buzz') {
    // 外れの音。濁った矩形波を下へ滑らせる
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.3);
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.34);
    osc.start(now); osc.stop(now + 0.36);
  } else if (id === 'blip') {
    // 短くて硬い。テンポを刻むとき
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, now);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);
    osc.start(now); osc.stop(now + 0.08);
  } else if (id === 'dread') {
    // ずーん。低いところへ長く落とす
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 1.1);
    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
    osc.start(now); osc.stop(now + 1.25);
  } else if (id === 'slash') {
    // しゃきーん。高いところから一気に上げて切る
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(3600, now + 0.06);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
    osc.start(now); osc.stop(now + 0.3);
  } else if (id === 'fanfare') {
    // ジャーン。3つの音を重ねて和音にする
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523, now);      // ド
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
    osc.start(now); osc.stop(now + 0.95);
    for (const hz of [659, 784]) {               // ミ・ソ
      const o = ctx.createOscillator();
      const g2 = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(hz, now);
      g2.gain.setValueAtTime(0.16, now);
      g2.gain.exponentialRampToValueAtTime(0.01, now + 0.9);
      o.connect(g2); dest.connect(g2);
      o.start(now); o.stop(now + 0.95);
    }
  } else if (id === 'glitch') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(90, now);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc.start(now); osc.stop(now + 0.27);
  }
}
