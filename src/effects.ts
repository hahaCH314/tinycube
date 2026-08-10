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
  | 'telop';        // 文字を出す（中身は利用者が決める）

type Live = { id: EffectId; start: number; dur: number; text?: string };

const live: Live[] = [];

/** 効果の長さ（ミリ秒）。音だけのものは絵を持たないので 0 */
const DUR: Record<EffectId, number> = {
  flash: 260,
  glitch: 420,
  bam: 0,
  ding: 0,
  pon: 0,
  buzz: 0,
  telop: 1500,
};

// recorder が録画を始めるときに渡してくる。渡ってくるまで音は鳴らせない
let audio: { ctx: AudioContext; dest: AudioNode } | null = null;

/** 録画側から音の合流点を借りる。ここへ流したものが動画に入る */
export function attachAudio(ctx: AudioContext, dest: AudioNode) {
  audio = { ctx, dest };
}
export function detachAudio() {
  audio = null;
}

export function fireEffect(id: EffectId, text?: string) {
  const dur = DUR[id] ?? 300;
  if (dur > 0) {
    // 同じものを連打したときは、前のを消してから出す。
    // 重ねると明滅が濁って、押した回数が分からなくなる
    const i = live.findIndex(e => e.id === id);
    if (i >= 0) live.splice(i, 1);
    live.push({ id, start: performance.now(), dur, text });
  }
  playSoundFor(id);
}

/** 文字を出す。中身は利用者が設定で書き換えたもの */
export function fireTelop(text: string) {
  if (!text.trim()) return;                     // 空のまま押しても何も起きない
  fireEffect('telop', text);
}

/** 録画をやめたときに呼ぶ。出しっぱなしの効果を消す */
export function clearEffects() {
  live.length = 0;
}

/** recorder の描画ループから毎フレーム呼ばれる */
export function drawEffects(g: CanvasRenderingContext2D, W: number, H: number) {
  const now = performance.now();
  for (let i = live.length - 1; i >= 0; i--) {
    const e = live[i];
    const t = (now - e.start) / e.dur;          // 0 → 1
    if (t >= 1) { live.splice(i, 1); continue; }
    switch (e.id) {
      case 'flash':  drawFlash(g, W, H, t); break;
      case 'glitch': drawGlitch(g, W, H, t); break;
      case 'telop': drawTelop(g, W, H, t, e.text ?? ''); break;
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
function drawTelop(g: CanvasRenderingContext2D, W: number, H: number, t: number, text: string) {
  const base = Math.min(W, H) * 0.16;
  const size = Math.round(Math.min(base, (W * 0.86) / Math.max(1, text.length)));
  // 0→0.15 で飛び出し、0.75→1 で消える
  const pop = t < 0.15 ? t / 0.15 : 1;
  const fade = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
  const scale = 0.6 + pop * 0.4 + (pop === 1 ? 0 : 0);

  g.save();
  g.globalAlpha = fade;
  g.translate(W / 2, H / 2);
  g.scale(scale, scale);
  g.font = `900 ${size}px sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // 黒フチを厚めに。どんな映像の上でも読めるようにする
  g.lineWidth = size * 0.16;
  g.strokeStyle = '#000';
  g.lineJoin = 'round';
  g.strokeText(text, 0, 0);
  g.fillStyle = '#fff';
  g.fillText(text, 0, 0);
  g.restore();
}

/** 効果音。ファイルを持たずにその場で作る（読み込み待ちが無く、容量も増えない） */
function playSoundFor(id: EffectId) {
  if (!audio) return;
  const { ctx, dest } = audio;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(dest);
  // 本人の耳にも届くようにする。録画にしか入らないと、押した手応えが無い
  gain.connect(ctx.destination);

  if (id === 'bam' || id === 'flash') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
    osc.start(now); osc.stop(now + 0.24);
  } else if (id === 'ding' || id === 'telop') {
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
  } else if (id === 'glitch') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(90, now);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    osc.start(now); osc.stop(now + 0.27);
  }
}
