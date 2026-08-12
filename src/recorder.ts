// 動画を canvas に描き直してから録る。
//
// なぜ canvas を挟むのか。理由は2つあって、どちらも外せない。
//
// 1. iPhone で動かないから。
//    元は video 要素から直接 captureStream() していたが、Safari は
//    HTMLMediaElement.captureStream を実装していない。iPhone では
//    その1行で必ず落ちる。canvas.captureStream は Safari も持っている。
// 2. 透かしを焼き込めないから。
//    画面に CSS で重ねても、出来上がった動画には映らない。録るのは
//    あくまで映像トラックなので、トラックに入る絵そのものへ描く必要がある。
//
// 音は「動画の音」と「マイク」を AudioContext で混ぜる。
// video 要素を muted のままにすると動画の音がどこにも残らない。

export type RecordHandle = {
  stop: () => void;
  /** 止めているあいだは、そこがファイルに入らない（黒い間も無音も残らない） */
  pause: () => void;
  resume: () => void;
  /** 一時停止できる環境か。古い Safari は持っていないことがある */
  canPause: boolean;
  mimeType: string;
};

export type RecordOptions = {
  video: HTMLVideoElement;
  /** 焼き込む枠。上か下だけの飾りで、横幅いっぱいに置く。null なら枠なし */
  frame: { img: HTMLImageElement; anchor: FrameAnchor; slice?: { t: number; r: number; b: number; l: number } } | null;
  /** 透かしの文字。null なら焼かない（有料版） */
  watermark: string | null;
  /** 書き出しの形。既定は縦 */
  shape?: OutShape;
  /** 画面に出している canvas。渡すとそれをそのまま録る */
  canvas?: HTMLCanvasElement;
  /** 動画そのものの音の扱い。
   *  'mix'    … 動画の音をそのまま録音に混ぜ、耳にも出す。イヤホン向け（高音質）
   *  'mic'    … 混ぜない。スピーカーから出た音をマイクが拾う。イヤホン無し向け
   *  'off'    … 動画の音を使わない。声とエフェクトだけ
   *
   *  スピーカーで 'mix' にすると、同じ音が「直接」と「マイク越し」で二重に入る
   *  （2026-08-11、伊波さんの「二重奏」）。イヤホンなら二重にならないので、
   *  どちらが良いかは環境次第。だから選んでもらう */
  srcAudio?: 'mix' | 'mic' | 'off';
  /** 書き出しが終わったときに呼ばれる */
  onFinish: (blob: Blob, ext: string) => void;
  onError: (e: Error) => void;
};

import type { FrameAnchor, OutShape } from './frames';
import { attachAudio, detachAudio, drawEffects, audioContext } from './effects';

/** 書き出しの形。読み込んだ動画が横長なら横で出す。
    16:9 の動画を無理に 9:16 へ詰めると、画面の6割が黒帯になる */
export type { OutShape } from './frames';
const SIZES: Record<OutShape, { w: number; h: number }> = {
  portrait: { w: 1080, h: 1920 },
  landscape: { w: 1920, h: 1080 },
};

/** 画面に出すもの。録画していなくてもずっと回す。
 *
 *  以前は録画中しか canvas が無く、エフェクトを押しても音だけ鳴って
 *  何も見えなかった（2026-08-10、伊波さんの指摘「ただのうるさいキーボード」）。
 *  見えているものが、そのまま録れるものになる。
 */
export type StageOptions = {
  canvas: HTMLCanvasElement;
  /** 描画で困ったときに呼ばれる。黙って黒くなるのが一番たちが悪い */
  onTrouble?: (msg: string) => void;
  /** 呼ばれるたびに、いまの状態を返す。
   *  video も毎回聞き直す。動画を読み込む前は要素そのものが無いので、
   *  最初に一度だけ受け取る形にすると、いつまでも動かない */
  read: () => {
    video: HTMLVideoElement | null;
    /** true なら画面いっぱいに広げる（カメラ）。false は切らずに収める（動画） */
    fill: boolean;
    /** 左右を反転して鏡にする。自撮りのとき。
     *  鏡になっていないと、右に動いたつもりが画面では左へ動くので、
     *  顔ハメの穴に顔を合わせられない（2026-08-11、伊波さん「合わせにくい」） */
    mirror?: boolean;
    shape: OutShape;
    frame: { img: HTMLImageElement; anchor: FrameAnchor; slice?: { t: number; r: number; b: number; l: number }; faceHole?: { x: number; y: number; w: number; h: number } } | null;
    watermark: string | null;
  };
};

export function startStage(opts: StageOptions): () => void {
  const { canvas, read } = opts;
  const g = canvas.getContext('2d');
  if (!g) { opts.onTrouble?.('canvas を用意できませんでした'); return () => {}; }

  // 端末の余力が尽きると canvas の中身が失われ、以後まっ黒のままになる。
  // 黙って黒くなると原因が何ひとつ分からないので、起きたことを伝える
  canvas.addEventListener('contextlost', () => opts.onTrouble?.('描画が中断されました（contextlost）'));
  canvas.addEventListener('contextrestored', () => opts.onTrouble?.(''));

  // 枠は毎コマ拡大し直さず、書き出しの大きさで一度だけ作って使い回す。
  // 1400px の絵を毎コマ 1080x1920 へ引き伸ばすのは、端末には重い（2026-08-11）
  let baked: { img: HTMLImageElement; w: number; h: number; canvas: HTMLCanvasElement } | null = null;
  const bakeFrame = (
    img: HTMLImageElement, anchor: FrameAnchor, W: number, H: number,
    slice?: { t: number; r: number; b: number; l: number }
  ) => {
    if (baked && baked.img === img && baked.w === W && baked.h === H) return baked.canvas;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const gg = c.getContext('2d');
    if (!gg) return null;
    drawFrame(gg, img, anchor, W, H, slice);
    baked = { img, w: W, h: H, canvas: c };
    return c;
  };

  let told = false;
  let running = true;
  const draw = () => {
    if (!running) return;
    try {
    const { video, shape, frame, watermark, mirror } = read();
    const { w: OUT_W, h: OUT_H } = SIZES[shape];
    if (canvas.width !== OUT_W) canvas.width = OUT_W;
    if (canvas.height !== OUT_H) canvas.height = OUT_H;

    g.fillStyle = '#000';
    g.fillRect(0, 0, OUT_W, OUT_H);

    const vw = video?.videoWidth ?? 0, vh = video?.videoHeight ?? 0;
    if (video && vw && vh) {
      // カメラは画面いっぱいに広げる（はみ出した側を切る）。
      // 黒帯を出すと、自撮りなのに画面の半分が黒くなって使えない
      // （2026-08-10、伊波さんの指示）。
      // 読み込んだ動画は切らずに全部見せる（元の作品を勝手に切らない）
      const fill = read().fill;
      const isSplit4 = frame?.anchor === 'split4';

      if (isSplit4) {
        const halfW = OUT_W / 2;
        const halfH = OUT_H / 2;
        const scale = fill ? Math.max(halfW / vw, halfH / vh) : Math.min(halfW / vw, halfH / vh);
        const w = vw * scale, h = vh * scale;
        g.save();
        if (mirror) { g.translate(OUT_W, 0); g.scale(-1, 1); }
        const dx = (halfW - w) / 2;
        const dy = (halfH - h) / 2;
        g.drawImage(video, dx, dy, w, h);
        g.drawImage(video, halfW + dx, dy, w, h);
        g.drawImage(video, dx, halfH + dy, w, h);
        g.drawImage(video, halfW + dx, halfH + dy, w, h);
        g.restore();
      } else {
        const scale = fill
          ? Math.max(OUT_W / vw, OUT_H / vh)
          : Math.min(OUT_W / vw, OUT_H / vh);
        const w = vw * scale, h = vh * scale;
        g.save();
        if (mirror) { g.translate(OUT_W, 0); g.scale(-1, 1); }
        g.drawImage(video, (OUT_W - w) / 2, (OUT_H - h) / 2, w, h);
        g.restore();
      }
    }

    if (frame) {
      const b = bakeFrame(frame.img, frame.anchor, OUT_W, OUT_H, frame.slice);
      if (b) g.drawImage(b, 0, 0);
      else drawFrame(g, frame.img, frame.anchor, OUT_W, OUT_H, frame.slice);
    }

    // 顔ハメは、枠を描いたあとに、穴の形へ切り抜いたカメラをもう一度重ねる。
    //
    // 一度これを外して「穴を透明に抜いてあるから素通しで見えるはず」に
    // したが、伊波さんの端末では透けずに黒いままだった。実機で動いていたのは
    // こちらなので戻した（2026-08-11、伊波さん「1度映ったのはなぜ？」）。
    // 絵の穴が透明でも黒でも、どちらでも成り立つ作りでもある
    if (frame?.faceHole && video && vw && vh) {
      const fh = frame.faceHole;
      const cx = OUT_W * (fh.x + fh.w / 2) / 100;
      const cy = OUT_H * (fh.y + fh.h / 2) / 100;
      const rx = OUT_W * (fh.w / 2) / 100;
      const ry = OUT_H * (fh.h / 2) / 100;
      g.save();
      g.beginPath();
      g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.clip();
      // 穴の大きさに合わせて、穴の中心へ寄せる。
      // 画面いっぱいまで広げたカメラを小さな穴で切り抜くと、顔の一部だけが
      // 極端に大きく覗いて何も分からない（2026-08-11、伊波さん
      // 「インカメラは近すぎて見えない」）
      const s2 = Math.max((rx * 2) / vw, (ry * 2) / vh);
      const w2 = vw * s2, h2 = vh * s2;
      // 切り抜きは元の向きで作り、そのあとで鏡にする
      if (mirror) { g.translate(OUT_W, 0); g.scale(-1, 1); }
      const dx = mirror ? OUT_W - cx : cx;
      g.drawImage(video, dx - w2 / 2, cy - h2 / 2, w2, h2);
      g.restore();
    }
    drawEffects(g, OUT_W, OUT_H);
    if (watermark) {
      drawWatermark(g, watermark, OUT_W, OUT_H, frame?.anchor === 'bottom' ? 'top' : 'bottom');
    }
    } catch (e: any) {
      // 一度だけ伝える。毎コマ出すと読めない
      if (!told) { told = true; opts.onTrouble?.('描画でつまずきました: ' + (e?.name ?? '') + ' ' + (e?.message ?? '')); }
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  return () => { running = false; };
}

export async function startRecording(opts: RecordOptions): Promise<RecordHandle> {
  const { video, watermark, frame } = opts;
  const { w: OUT_W, h: OUT_H } = SIZES[opts.shape ?? 'portrait'];

  // 画面に出しているものをそのまま録る。別の canvas を作らない
  const canvas = opts.canvas ?? document.createElement('canvas');
  const g = canvas.getContext('2d');
  if (!g) throw new Error('canvas を用意できませんでした');
  if (!opts.canvas) {
    canvas.width = OUT_W;
    canvas.height = OUT_H;
  }

  let running = true;
  const draw = () => {
    if (!running || opts.canvas) return;   // 画面側が回しているなら任せる
    g.fillStyle = '#000';
    g.fillRect(0, 0, OUT_W, OUT_H);

    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw && vh) {
      if (frame?.anchor === 'split4') {
        const halfW = OUT_W / 2;
        const halfH = OUT_H / 2;
        const scale = Math.min(halfW / vw, halfH / vh);
        const w = vw * scale, h = vh * scale;
        const dx = (halfW - w) / 2;
        const dy = (halfH - h) / 2;
        g.drawImage(video, dx, dy, w, h);
        g.drawImage(video, halfW + dx, dy, w, h);
        g.drawImage(video, dx, halfH + dy, w, h);
        g.drawImage(video, halfW + dx, halfH + dy, w, h);
      } else {
        // 縦画面に収める（切らずに全部見せる）
        const scale = Math.min(OUT_W / vw, OUT_H / vh);
        const w = vw * scale, h = vh * scale;
        g.drawImage(video, (OUT_W - w) / 2, (OUT_H - h) / 2, w, h);
      }
    }

    // 一発エフェクトは枠より前、透かしより後ろ。
    // 枠の下に潜ると、下向きの飾りに隠れて何も見えないことがある
    if (frame) drawFrame(g, frame.img, frame.anchor, OUT_W, OUT_H, frame.slice);
    drawEffects(g, OUT_W, OUT_H);
    // 下に飾りのある枠のときは、透かしを右上へ逃がす。
    // 右下のままだと絵の上に重なって、どちらも読みにくくなる
    if (watermark) drawWatermark(g, watermark, OUT_W, OUT_H, frame?.anchor === 'bottom' ? 'top' : 'bottom');
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);

  // 音を混ぜる。マイクが拒否されても、動画の音だけで録れるようにする。
  //
  // AudioContext と、動画に繋ぐ入口（MediaElementSource）は使い回す。
  // createMediaElementSource は 1つの video 要素につき1回しか呼べず、
  // 録画のたびに作ると2回目で必ず落ちる（2026-08-10 に実際そうなっていた）。
  const actx = audioContext() ?? getContext();
  // 眠っていたら起こす。ただし待たない。
  // resume() は「利用者が操作した」と見なされないと返ってこないことがあり、
  // await すると録画そのものが始まらなくなる（2026-08-10 に実際そうなった）。
  // 本物の指のタップなら即座に起きるし、起きなくても録画は進む
  if (actx.state === 'suspended') actx.resume().catch(() => { /* 起きなくても続ける */ });
  const dest = actx.createMediaStreamDestination();

  try {
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    const micGain = actx.createGain();
    micGain.gain.value = 1.0;
    actx.createMediaStreamSource(mic).connect(micGain).connect(dest);
    micStreams.push(mic);
  } catch {
    // マイクを断られただけ。動画の音だけで続ける
  }

  // 動画の音。video 要素は muted のままだと無音なので解除する。
  // createMediaElementSource を通すと既定の出力から外れるため、
  // 本人にも聞こえるように actx.destination へも繋ぎ直す
  video.muted = false;
  const src = getElementSource(actx, video);
  const mode = opts.srcAudio ?? 'mic';
  const videoGain = actx.createGain();
  videoGain.gain.value = mode === 'off' ? 0 : 0.8;
  src.connect(videoGain);
  // 耳へは 'off' 以外なら出す。そうしないと本人が動画を聞けない
  if (mode !== 'off') videoGain.connect(actx.destination);
  // 録音へ直接混ぜるのは 'mix' のときだけ。'mic' はマイク越しの一本にする
  if (mode === 'mix') videoGain.connect(dest);

  // 効果音はここへ流し込む。自前で AudioContext を作ると動画に入らない
  attachAudio(actx, dest);

  const stream = new MediaStream([
    ...canvas.captureStream(30).getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  // 使える形式を上から順に試す。iPhone は mp4 しか録れないので、
  // webm を決め打ちにしてはいけない
  const type = pickMimeType();
  const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);

  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onerror = () => opts.onError(new Error('録画中に問題が起きました'));
  recorder.onstop = () => {
    running = false;
    // 実際に録れた形式を録画器に聞き直す。指定した形式が通るとは限らない
    const actual = recorder.mimeType || type || 'video/webm';
    const ext = actual.includes('mp4') ? 'mp4' : 'webm';
    opts.onFinish(new Blob(chunks, { type: actual }), ext);
    detachAudio();
    stream.getTracks().forEach(t => t.stop());
    micStreams.forEach(s => s.getTracks().forEach(t => t.stop()));
    micStreams.length = 0;
    // この録画のために作った枝だけ外す。AudioContext は閉じない
    // （閉じると次の録画で作り直すことになり、動画への入口が二度と繋げない）
    videoGain.disconnect();
    src.disconnect(videoGain);
  };

  recorder.start();

  // 一時停止。MediaRecorder が止まっているあいだのフレームと音は
  // まったく記録されないので、その部分はファイルに存在しない。
  // 古い Safari は pause を持っていないことがあるので、無ければ使えないと伝える
  const canPause = typeof recorder.pause === 'function' && typeof recorder.resume === 'function';
  return {
    stop: () => recorder.stop(),
    pause: () => { if (canPause && recorder.state === 'recording') recorder.pause(); },
    resume: () => { if (canPause && recorder.state === 'paused') recorder.resume(); },
    canPause,
    mimeType: recorder.mimeType,
  };
}

const micStreams: MediaStream[] = [];

// AudioContext はアプリの間ずっと使い回す。録画のたびに作って閉じると、
// 動画への入口（MediaElementSource）を作り直せなくなる
let sharedCtx: AudioContext | null = null;
function getContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AudioContext();
  return sharedCtx;
}

// 1つの video 要素につき1つだけ作って覚えておく。
// 2回目に createMediaElementSource を呼ぶと必ず例外になる
const elementSources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
function getElementSource(ctx: AudioContext, el: HTMLMediaElement): MediaElementAudioSourceNode {
  const found = elementSources.get(el);
  if (found) return found;
  const made = ctx.createMediaElementSource(el);
  elementSources.set(el, made);
  return made;
}

function pickMimeType(): string | null {
  const candidates = [
    'video/mp4;codecs=avc1,mp4a.40.2',   // iPhone / Safari はこれしか録れない
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;                            // ブラウザの既定に任せる
}

/** 枠の描画（9スライス対応） */
function drawFrame(
  g: CanvasRenderingContext2D, img: HTMLImageElement,
  anchor: FrameAnchor, OUT_W: number, OUT_H: number,
  slice?: { t: number; r: number; b: number; l: number }
) {
  if (slice) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const { t, r, b, l } = slice;
    const cx = iw - l - r; // 中央の幅
    const cy = ih - t - b; // 中央の高さ
    
    // 描画先の領域を決定
    let dx = 0, dy = 0, dw = OUT_W, dh = OUT_H;
    if (anchor !== 'full' && anchor !== 'wide') {
      dh = img.naturalHeight * (OUT_W / img.naturalWidth);
      dy = anchor === 'top' ? 0 : OUT_H - dh;
    }
    const cw = dw - l - r; // 描画先の中央幅
    const ch = dh - t - b; // 描画先の中央高さ

    // 四隅（等倍）
    g.drawImage(img, 0, 0, l, t, dx, dy, l, t);
    g.drawImage(img, iw - r, 0, r, t, dx + dw - r, dy, r, t);
    g.drawImage(img, 0, ih - b, l, b, dx, dy + dh - b, l, b);
    g.drawImage(img, iw - r, ih - b, r, b, dx + dw - r, dy + dh - b, r, b);

    // 四辺（辺だけ伸縮）
    if (cx > 0) {
      g.drawImage(img, l, 0, cx, t, dx + l, dy, cw, t); // 上
      g.drawImage(img, l, ih - b, cx, b, dx + l, dy + dh - b, cw, b); // 下
    }
    if (cy > 0) {
      g.drawImage(img, 0, t, l, cy, dx, dy + t, l, ch); // 左
      g.drawImage(img, iw - r, t, r, cy, dx + dw - r, dy + t, r, ch); // 右
    }
    // 中央（幅・高さ伸縮）
    if (cx > 0 && cy > 0) {
      g.drawImage(img, l, t, cx, cy, dx + l, dy + t, cw, ch);
    }
    return;
  }

  // 以下はスライス指定がない従来の処理（引き伸ばし等）
  if (anchor === 'full' || anchor === 'wide') {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(OUT_W / iw, OUT_H / ih);
    const w = iw * scale, h = ih * scale;
    g.drawImage(img, (OUT_W - w) / 2, (OUT_H - h) / 2, w, h);
    return;
  }
  const w = OUT_W;
  const h = img.naturalHeight * (w / img.naturalWidth);
  g.drawImage(img, 0, anchor === 'top' ? 0 : OUT_H - h, w, h);
}

/** 無料版の印。右下に置く。動画そのものに焼き込まれる。
    有料版は watermark に null を渡すだけで消える */
function drawWatermark(
  g: CanvasRenderingContext2D, text: string,
  OUT_W: number, OUT_H: number, side: 'top' | 'bottom' = 'bottom',
) {
  const size = Math.round(Math.min(OUT_W, OUT_H) * 0.045);
  g.save();
  g.font = `bold ${size}px sans-serif`;
  g.textAlign = 'right';
  g.textBaseline = side === 'top' ? 'top' : 'bottom';
  const x = OUT_W - size, y = side === 'top' ? size : OUT_H - size;
  // 暗い映像でも明るい映像でも読めるように、影を敷いてから白で書く
  g.shadowColor = 'rgba(0,0,0,0.85)';
  g.shadowBlur = size * 0.35;
  g.fillStyle = 'rgba(255,255,255,0.82)';
  g.fillText(text, x, y);
  g.restore();
}
