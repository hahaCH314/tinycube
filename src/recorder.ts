// カメラの絵を canvas に描き直してから、写真として撮る。
//
// なぜ canvas を挟むのか。理由は2つあって、どちらも外せない。
//
// 1. 枠・雰囲気・色味・透かしを**焼き込む**ため。
//    画面に CSS で重ねても、出来上がった写真には映らない。
//    絵に関わるものは全部この canvas を通す。
// 2. 顔ハメの穴からカメラだけを見せるため。
//    枠を先に描き、その上にカメラ映像を穴の形で切り抜いて重ねる。
//
// ■ 2026-08-31、録画をやめた
//
// 伊波さん「思い切って動画やめようかな」。
// **startRecording・MediaRecorder・マイク・音の合流・一時停止・
// コーデック選びを全部消した。** 残っているのは画面に出す係（startStage）と、
// そこが使う描画の道具だけ。音はもうどこでも扱っていない。
//
// 焼いた絵をどう1枚にするかは App.tsx（3枚連写）と sheet.ts（プリシート）にある。

import type { FrameAnchor, OutShape, FaceHole } from './frames';
import { drawEffects, drawTone } from './effects';

/** 書き出しの形。読み込んだ動画が横長なら横で出す。
    16:9 の動画を無理に 9:16 へ詰めると、画面の6割が黒帯になる */
export type { OutShape } from './frames';
const SIZES: Record<OutShape, { w: number; h: number }> = {
  portrait: { w: 1080, h: 1920 },
  landscape: { w: 1920, h: 1080 },
};

/** 顔ハメの穴に映すカメラの寄り具合。1.0 で画面いっぱいと同じ大きさ。
 *
 *  **上げすぎないこと。** ここを大きくするほど、穴に顔を収めるために
 *  利用者が顔を画面へ近づける必要が出る。それで「他機能の操作は無理」
 *  という声が出た（2026-08-13、伊波さん）。
 *
 *  実機で確かめた履歴（同日、伊波さん）：
 *    元の作り … 穴の大きさまで縮小（＝0.14倍）。顔を画面に押し付ける羽目に
 *    1.35     … 「ズームし過ぎ」。まだ寄りすぎだった
 *    1.0      … まだ少し寄っている
 *    0.92     … いまここ（伊波さん「もう少しホント少しズーム弱く」）
 *
 *  変えるときは必ず実機で、普通に持った距離のまま穴に入るかを見ること。 */
const FACE_ZOOM = 0.92;

/** 顔ハメの穴をどれだけ丸へ寄せるか。0 で測った四角のまま（縦長）、1 で真円。
 *
 *  812CMcube の絵は測ると縦横比 1.3〜1.5:1 の縦長になる。元からある顔ハメ13枚は
 *  ほぼ真円（0.99:1）で、そちらのほうが顔ハメらしい。ただし真円まで丸めると
 *  細長い絵で穴が小さくなりすぎるので、途中で止める
 *  （2026-08-13、伊波さん「縦長よりすこし丸いほうがいい」「少し丸い」）。 */
const HOLE_ROUNDNESS = 0.6;

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
    /** true のあいだは描かない。フレーム選びのように、画面が別のもので
     *  覆われているとき。1920x1080 を毎秒60回描き続けると、非力な端末では
     *  スクロールと取り合ってカクつく（2026-08-16、伊波さん
     *  「かくかくする、フレーム選択が」）。**止めるのではなく休ませる**。
     *  止めると戻ってきたとき静止画のままになる */
    idle?: boolean;
    video: HTMLVideoElement | null;
    /** true なら画面いっぱいに広げる（カメラ）。false は切らずに収める（動画） */
    fill: boolean;
    /** 左右を反転して鏡にする。自撮りのとき。
     *  鏡になっていないと、右に動いたつもりが画面では左へ動くので、
     *  顔ハメの穴に顔を合わせられない（2026-08-11、伊波さん「合わせにくい」） */
    mirror?: boolean;
    /** カメラの寄り具合。1 で今まで通り。利用者がその場で動かせる。
     *  顔の大きい人は顔ハメの穴に収まらないという声があった
     *  （2026-08-14、伊波さん「顔がデカい人は入らない」）。
     *  1 未満で引く（顔が小さくなり穴に収まる）、1 超で寄る */
    zoom?: number;
    shape: OutShape;
    /** 全開の大きさで描くか（2026-08-30）。
     *
     *  ⚠️ **録画中と、撮る瞬間だけ true にすること。**
     *     ふだんは画面に見えている大きさで描けばよい。1920x1080 を
     *     411px の画面に出すために毎コマ引き伸ばすのが、カクつきの正体だった
     *     （実測 56.8ms → 38.7ms。CPU 6倍遅くしたときの1コマ）。
     *
     *  ⚠️ **写真と録画は canvas をそのまま使う。** 小さいまま撮ると
     *     小さい写真・小さい動画になる。captureStream は**呼んだ瞬間の
     *     大きさ**でトラックを決めるので、録り始める前に全開へ戻すこと */
    full?: boolean;
    frame: { img: HTMLImageElement; bgImg?: HTMLImageElement; anchor: FrameAnchor; slice?: { t: number; r: number; b: number; l: number }; faceHole?: FaceHole; faceHoles?: FaceHole[] } | null;
    watermark: string | null;
    /** 鍵のかかった枠を試着中か。true なら斜めの鍵シールを焼く。
     *  画面にも同じものが出る（見えているものと出てくるものを一致させるため） */
    trial?: boolean;
  };
};

/** 実機で「どこが重いのか」を測るためだけの覗き窓。
 *
 *  ⚠️ **`?fps=1` が付いていないときは、何も作らず何も測らない。**
 *     普通に使っている人には存在しないのと同じであること。
 *
 *  なぜ要るか。カクつきは伊波さんの端末でしか出ない（2026-08-27
 *  「前から重い」「外で撮影使用中に感じる」）。開発機の Chrome では
 *  75fps 出てしまい、再現できないまま推測で触ることになっていた。
 *  アプリを出し直さなくても、同じ絵を同じコードで描くので、
 *  手元のブラウザ（npm run dev）でも測れる。
 *  ⚠️ ウェブ版は 2026-08-31 にやめた。実機で見たいときはアプリを入れ直すこと。
 *
 *  ?fps=1 … 見るだけ。描画の邪魔をしないが、**描画 ms は当てにならない**
 *  ?fps=2 … 厳密に測る。1コマごとに GPU の描き終わりを待つ
 *
 *  ⚠️ **なぜ2つあるか。** canvas への描画命令は積むだけですぐ戻ってくる。
 *     絵を作るのは後から GPU なので、performance.now() で挟んでも
 *     **0.1ms しか出ない**（2026-08-30、6倍に絞っても差が出なかった）。
 *     1画素だけ読み返すと、そこで描き終わりを待つので本当の時間が出る。
 *     ただし待つぶん全体は遅くなるので、**比べるときだけ使うこと。**
 *
 *  読み方：
 *    fps  … 1秒に何コマ描けているか。60 に近ければ足りている
 *    描画 … 1コマにかかったミリ秒（?fps=2 のときだけ意味がある）
 *    顔ハメ … いま楕円のクリップを通っているかどうか
 */
function makeMeter() {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search).get('fps');
  if (q === null) return null;

  const el = document.createElement('div');
  el.id = 'fps-meter';
  el.style.cssText =
    'position:fixed;left:6px;top:6px;z-index:2147483647;pointer-events:none;' +
    'font:12px/1.45 ui-monospace,monospace;color:#0f0;background:rgba(0,0,0,.72);' +
    'padding:4px 7px;border-radius:5px;white-space:pre;text-align:left';
  document.body.appendChild(el);

  let frames = 0, spent = 0, worst = 0, since = performance.now();

  return {
    /** true なら、測る前に GPU の描き終わりを待つ */
    strict: q === '2',
    /** 1コマぶんの結果を足す。表示の書き換えは1秒に1回だけ
     *  （毎コマ textContent を触ると、測る側が重くなる） */
    tick(ms: number, note: string) {
      frames++; spent += ms; if (ms > worst) worst = ms;
      const now = performance.now();
      const span = now - since;
      if (span < 1000) return;
      const fps = Math.round((frames * 1000) / span);
      el.textContent =
        fps + 'fps  描画 ' + (spent / frames).toFixed(1) + 'ms' +
        '（最悪 ' + worst.toFixed(1) + '）\n' + note;
      frames = 0; spent = 0; worst = 0; since = now;
    },
    stop() { el.remove(); },
  };
}

export function startStage(opts: StageOptions): () => void {
  const { canvas, read } = opts;
  const g = canvas.getContext('2d');
  if (!g) { opts.onTrouble?.('canvas を用意できませんでした'); return () => {}; }
  const meter = makeMeter();

  // 端末の余力が尽きると canvas の中身が失われ、以後まっ黒のままになる。
  // 黙って黒くなると原因が何ひとつ分からないので、起きたことを伝える
  canvas.addEventListener('contextlost', () => opts.onTrouble?.('描画が中断されました（contextlost）'));
  canvas.addEventListener('contextrestored', () => opts.onTrouble?.(''));

  // 枠は毎コマ拡大し直さず、書き出しの大きさで一度だけ作って使い回す。
  // 1400px の絵を毎コマ 1080x1920 へ引き伸ばすのは、端末には重い（2026-08-11）
  let baked: { img: HTMLImageElement; w: number; h: number; canvas: HTMLCanvasElement; isFaceHole?: boolean } | null = null;
  const bakeFrame = (
    img: HTMLImageElement, anchor: FrameAnchor, W: number, H: number,
    slice?: { t: number; r: number; b: number; l: number },
    isFaceHole?: boolean
  ) => {
    if (baked && baked.img === img && baked.w === W && baked.h === H && baked.isFaceHole === isFaceHole) return baked.canvas;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const gg = c.getContext('2d');
    if (!gg) return null;
    drawFrame(gg, img, anchor, W, H, slice);


    baked = { img, w: W, h: H, canvas: c, isFaceHole };
    return c;
  };

  let told = false;
  let running = true;
  // ⚠️ **ループが死んだら戻れるようにしておくこと。**
  //    requestAnimationFrame は画面が隠れているあいだ呼ばれない。Android で
  //    ホームに戻って開き直したり、権限のダイアログが被さったりすると、
  //    次の1回が来ないまま止まることがある。そうなるとカメラは動いていて
  //    映像も来ているのに、canvas だけ固まって静止画に見える
  //    （2026-08-16、伊波さん「カメラが動いてない」「静止画面のまま」
  //     「カメラは起動してる」）。
  //    見張り役を置いて、止まっていたら回し直す
  let beat = 0;
  const watchdog = setInterval(() => {
    if (!running) return;
    const last = beat;
    // 200ms 経っても絵が1コマも進んでいなければ、ループが死んでいる
    setTimeout(() => { if (running && beat === last) requestAnimationFrame(draw); }, 200);
  }, 1000);
  const draw = () => {
    if (!running) return;
    beat++;
    const t0 = meter ? performance.now() : 0;
    try {
    const { video, shape, frame, watermark, trial, mirror, zoom, idle, full } = read();
    // 画面が別のもので覆われているあいだは描かない。**ループは回したまま**に
    // して、戻ってきたら次のコマからすぐ絵が出るようにする。
    // 抜け方は下の requestAnimationFrame(draw) を必ず通ること
    if (!idle) {
    const camZoom = zoom && zoom > 0 ? zoom : 1;
    // ⚠️ **見せているあいだは、画面の大きさで描く**（2026-08-30）。
    //    1920x1080 を毎コマ作って 411px に縮めて出していたのが重かった。
    //
    //    dpr は 2 で頭打ちにする。3 にすると 411x3=1233 になり、
    //    1080 を超えて**かえって重くなる**（Mac のシオンの指摘）。
    //    等倍まで落とせば 3.3倍 速いが、伊波さん「きたないのはやだね」なので
    //    **きれいさを優先して 2 にしている。**
    const 全開 = SIZES[shape];
    let OUT_W = 全開.w, OUT_H = 全開.h;
    if (!full) {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(box.width * dpr);
      // 形は変えない。**幅から高さを出す**（縦横比がずれると絵が歪む）
      if (w > 0 && w < 全開.w) {
        OUT_W = w;
        OUT_H = Math.round(w * 全開.h / 全開.w);
      }
    }
    if (canvas.width !== OUT_W) canvas.width = OUT_W;
    if (canvas.height !== OUT_H) canvas.height = OUT_H;

    if (frame?.bgImg) {
      const b = bakeFrame(frame.bgImg, frame.anchor, OUT_W, OUT_H, frame.slice);
      if (b) g.drawImage(b, 0, 0);
      else drawFrame(g, frame.bgImg, frame.anchor, OUT_W, OUT_H, frame.slice);
    } else {
      g.fillStyle = '#000';
      g.fillRect(0, 0, OUT_W, OUT_H);
    }

    const vw = video?.videoWidth ?? 0, vh = video?.videoHeight ?? 0;
    const isFaceHole = frame && ((frame.faceHoles && frame.faceHoles.length > 0) || !!frame.faceHole);
    if (video && vw && vh && !isFaceHole) {
      // カメラは画面いっぱいに広げる（はみ出した側を切る）。
      // 黒帯を出すと、自撮りなのに画面の半分が黒くなって使えない
      // （2026-08-10、伊波さんの指示）。
      // 読み込んだ動画は切らずに全部見せる（元の作品を勝手に切らない）
      const fill = read().fill;
      const isSplit4 = frame?.anchor === 'split4';

      if (isSplit4) {
        const halfW = OUT_W / 2;
        const halfH = OUT_H / 2;
        const scale = (fill ? Math.max(halfW / vw, halfH / vh) : Math.min(halfW / vw, halfH / vh)) * camZoom;
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
        const scale = (fill
          ? Math.max(OUT_W / vw, OUT_H / vh)
          : Math.min(OUT_W / vw, OUT_H / vh)) * camZoom;
        // ⚠️ **整数に丸めること。** 小数のまま描くと端が画素の途中に落ち、
        //    半透明の1px線が下や右に残る（2026-08-16、伊波さん「下になんか
        //    線みたいなのが入ってた」）。
        //    ceil で1px大きく取るので、丸めたぶんの隙間も埋まる
        const w = Math.ceil(vw * scale), h = Math.ceil(vh * scale);
        const dx = Math.round((OUT_W - w) / 2), dy = Math.round((OUT_H - h) / 2);
        // ⚠️ **明るさの補正はここでやらないこと**（2026-08-19、伊波さん
        //    「カメラ真っ暗だよ？」）。
        //
        //    経緯:
        //      v1.3.2  g.filter で brightness/contrast/saturate をかけた
        //              → 1920x1080 の全画素に毎コマかかって重い（カクついた）
        //      v1.4.1  代わりに screen / overlay で色を重ねた
        //              → **画面が真っ暗になった**。globalCompositeOperation は
        //                 このあとのフレーム描画にも効いてしまう
        //
        //    どちらも駄目だったので、**素のまま描く**。
        //    暗さが気になるなら、映像を触るのではなくカメラ側で明るく撮る。
        g.save();
        if (mirror) { g.translate(OUT_W, 0); g.scale(-1, 1); }
        g.drawImage(video, dx, dy, w, h);
        g.restore();
      }
    }

    if (frame) {
      const isFaceHole = (frame.faceHoles && frame.faceHoles.length > 0) || !!frame.faceHole;
      const b = bakeFrame(frame.img, frame.anchor, OUT_W, OUT_H, frame.slice, isFaceHole);
      if (b) g.drawImage(b, 0, 0);
      else drawFrame(g, frame.img, frame.anchor, OUT_W, OUT_H, frame.slice);
    }

    // 顔ハメは、枠を描いたあとに、穴の形へ切り抜いたカメラをもう一度重ねる。
    //
    // 一度これを外して「穴を透明に抜いてあるから素通しで見えるはず」に
    // したが、伊波さんの端末では透けずに黒いままだった。実機で動いていたのは
    // こちらなので戻した（2026-08-11、伊波さん「1度映ったのはなぜ？」）。
    // 絵の穴が透明でも黒でも、どちらでも成り立つ作りでもある
    const holes = frame?.faceHoles ?? (frame?.faceHole ? [frame.faceHole] : []);
    if (holes.length > 0 && video && vw && vh) {
      // 穴が複数あるものは「2人で並んで写る」枠。カメラは1つしか無いので、
      // 穴ごとに別々に描くと同じ顔が2つ並ぶ。そうではなく、
      // **すべての穴をまとめて1つの範囲**として扱い、そこへカメラを1回だけ
      // 描く。こうすると、並んで写った2人がそれぞれの穴に収まる
      // （2026-08-13、伊波さん「二人用は2つの穴に同じもの（2人の顔が映る）」）。
      const span = {
        x: Math.min(...holes.map(h => h.x)),
        y: Math.min(...holes.map(h => h.y)),
        r: Math.max(...holes.map(h => h.x + h.w)),
        b: Math.max(...holes.map(h => h.y + h.h)),
      };
      const cx = OUT_W * (span.x + span.r) / 2 / 100;
      const cy = OUT_H * (span.y + span.b) / 2 / 100;
      const rx = OUT_W * (span.r - span.x) / 2 / 100;
      const ry = OUT_H * (span.b - span.y) / 2 / 100;
      {
        // 切り抜きは穴の形のまま。まとめるのは「カメラの置き方」だけで、
        // 見える範囲は1つ1つの穴に限る（穴の外まで顔が出ると台無しになる）
        g.save();
        g.beginPath();
        for (const fh of holes) {
          const hx = OUT_W * (fh.x + fh.w / 2) / 100;
          const hy = OUT_H * (fh.y + fh.h / 2) / 100;
          // 測った四角のままだと、絵によっては縦長の楕円になる（実測で 1.3〜1.5:1）。
          // 元からある顔ハメ13枚はほぼ真円（0.99:1）で、そちらのほうが顔ハメらしい
          // （2026-08-13、伊波さん「縦長よりすこし丸いほうがいい」）。
          // 長いほうの軸を縮めて丸へ寄せる。伸ばすのではなく縮めるのは、
          // 絵に描いてある穴からカメラがはみ出さないようにするため。
          let hw = OUT_W * (fh.w / 2) / 100;
          let hh = OUT_H * (fh.h / 2) / 100;
          const long = Math.max(hw, hh), short = Math.min(hw, hh);
          const target = short + (long - short) * (1 - HOLE_ROUNDNESS);
          if (hh > hw) hh = target; else hw = target;
          g.ellipse(hx, hy, hw, hh, 0, 0, Math.PI * 2);
        }
        g.clip();
        // 穴の中心へ寄せる。大きさは画面いっぱいを基準にする。
        //
        // 以前はここで穴の大きさまで縮めていた（Math.max(rx*2/vw, ry*2/vh)）。
        // 穴は画面のごく一部（幅25%・高さ16%ほど）なので、そこへ映像全体を
        // 詰め込むと顔が数倍に膨らみ、穴に収めるために利用者が顔を画面へ
        // 物理的に近づけることになった。その体勢では手が届かず、他のボタンを
        // 押せない（2026-08-13、伊波さん「インカメの時かなり顔を近づけないと
        // いけないので他機能の操作は無理」）。
        //
        // 画面いっぱいを基準にすれば、普通に持った距離のままで穴に入る。
        // FACE_ZOOM はそこから「少しアップ」に寄せるための倍率
        // （2026-08-13、伊波さん「顔が少しアップで映るように」）。
        //
        // 穴が2つある枠では、2人が並んだ幅ぶんは必ず映っていないと
        // 片方の穴が空になる。寄せるのは「穴がぜんぶ収まる」ところまでにする。
        //
        // camZoom は利用者がその場で動かせるつまみ。顔の大きい人が穴に
        // 入らないという声があったので、引けるようにした（2026-08-14、伊波さん）。
        // need を下回らせない縛りはそのまま効くので、引きすぎて穴が空くことはない
        const base = Math.max(OUT_W / vw, OUT_H / vh);
        // 穴がぜんぶ収まるのに要る最低の大きさ。これを下回ると穴が空く
        const need = Math.max((rx * 2) / vw, (ry * 2) / vh);
        const s2 = Math.max(base * FACE_ZOOM * camZoom, need);
        const w2 = vw * s2, h2 = vh * s2;
        if (mirror) { g.translate(OUT_W, 0); g.scale(-1, 1); }
        const dx = mirror ? OUT_W - cx : cx;
        g.drawImage(video, dx - w2 / 2, cy - h2 / 2, w2, h2);
        g.restore();
      }
    }
    // ⚠️ **色味は映像の直後、他の効果より前**（2026-08-23）。
    //    逆にすると文字やミラーボールにまで色がかかって濁る
    drawTone(g, OUT_W, OUT_H);
    drawEffects(g, OUT_W, OUT_H);
    if (watermark) {
      drawWatermark(g, watermark, OUT_W, OUT_H, frame?.anchor === 'bottom' ? 'top' : 'bottom');
    }
    // おためしの印は透かしより後（いちばん上）。枠の飾りに隠れないように
    if (trial) drawTrial(g, OUT_W, OUT_H);
    }
    if (meter) {
      // 1画素だけ読み返して、GPU が描き終わるのを待つ。これをしないと
      // 描画の時間が測れない（積んだだけで戻ってきてしまう）
      if (meter.strict) { try { g.getImageData(0, 0, 1, 1); } catch { /* 断られたら諦める */ } }
      const hole = !!frame && ((frame.faceHoles?.length ?? 0) > 0 || !!frame.faceHole);
      meter.tick(performance.now() - t0, idle
        ? '休み中（描いていない）'
        : (hole ? '顔ハメ あり' : '顔ハメ なし') +
          '  canvas ' + canvas.width + 'x' + canvas.height +
          '  表示 ' + Math.round(canvas.clientWidth) + 'px');
    }
    } catch (e: any) {
      // 一度だけ伝える。毎コマ出すと読めない
      if (!told) { told = true; opts.onTrouble?.('描画でつまずきました: ' + (e?.name ?? '') + ' ' + (e?.message ?? '')); }
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  // 画面が戻ってきたら、その場で回し直す。見張り役の1秒を待たずに済む
  const onVisible = () => { if (running && !document.hidden) requestAnimationFrame(draw); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    running = false;
    meter?.stop();
    clearInterval(watchdog);
    document.removeEventListener('visibilitychange', onVisible);
  };
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
/** 角の丸い四角。roundRect は古い WebView に無いので自分で引く。
 *  プリシート（sheet.ts）からも使う */
export function 丸四角(
  g: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/** おためしの鍵シール。**鍵のかかった枠を試着したまま撮ると焼かれる。**
 *
 *  2026-08-31、伊波さん「試着＋撮れる。でも帯が入る」
 *  「鍵と文字が可愛く、斜めに」。
 *
 *  プリクラの落書きは斜めに入れるもの（App.tsx の photoAngle と同じ考え方）。
 *  文字は平成ギャルのまるもじ（Hachi Maru Pop）。index.html で読み込んでいる。
 *
 *  ⚠️ **canvas に直接描くこと。** CSS で画面に重ねると、見えてはいても
 *     写真にも動画にも入らない（透かしと同じ理由）。
 *  ⚠️ **顔を避けて、真ん中より少し下に置く。** 顔は上寄りに写るので、
 *     ど真ん中に置くと顔ハメの穴を塞いでしまう。 */
let まるもじを取りに行った = false;
function drawTrial(g: CanvasRenderingContext2D, OUT_W: number, OUT_H: number) {
  const text = '🔒 tinyCUBE';
  // 初回だけ、まるもじを取りに行く。届くまではふつうの字で出る（待たない）
  if (!まるもじを取りに行った) {
    まるもじを取りに行った = true;
    try { void document.fonts?.load('64px "Hachi Maru Pop"', text); } catch { /* 無くても出る */ }
  }
  const S = Math.min(OUT_W, OUT_H);
  const size = Math.round(S * 0.072);
  g.save();
  g.translate(OUT_W / 2, OUT_H * 0.62);
  g.rotate(-12 * Math.PI / 180);          // 斜め。プリクラの落書きと同じ角度感
  g.font = `${size}px "Hachi Maru Pop", cursive`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = g.measureText(text).width + size * 1.4;
  const h = size * 1.7;
  // 白いテープに、ピンクのふちどり。角を丸くしてシールに見せる
  g.shadowColor = 'rgba(0,0,0,0.3)';
  g.shadowBlur = size * 0.3;
  g.shadowOffsetY = size * 0.08;
  丸四角(g, -w / 2, -h / 2, w, h, h * 0.42);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = Math.max(2, size * 0.07);
  g.strokeStyle = '#ff4da6';
  g.stroke();
  g.fillStyle = '#ff4da6';
  g.fillText(text, 0, size * 0.04);
  g.restore();
}

/** 透かし。プリシート（sheet.ts）からも使う */
export function drawWatermark(
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
