import { useState, useRef, useEffect } from 'react'
import '../docs/tinycube-skin-shibuya.css'
import './setup.css'
import { startRecording, startStage, type RecordHandle, type OutShape } from './recorder'
import { FRAMES, loadFrame, fitsShape, type Frame, type FrameAnchor, type FaceHole } from './frames'
import { fireEffect, fireTelop, setAmbient, type EffectId } from './effects'
import { t, getLang, setLang } from './i18n'
import { isUnlocked, tryUnlock, savedKey, relock } from './unlock'
import { saveCustomFrame, getCustomFrames, deleteCustomFrame, type CustomFrameRecord } from './idb'

// ---- 開いたときのお願い（2026-08-12、伊波さんの原文） -------------------
//
// この文章は伊波さんが書いたもの。要約・言い換え・整形をしないこと。
// 改行も原文のまま。CSS 側（.manner-text）に white-space: pre-line を
// 当ててあるので、<br> を入れずにこの文字列をそのまま流し込めば改行が出る。
// 変えるときは伊波さんに確認してから、docs/tinycube-update-scope.md も直す。
// 同意画面の文章は i18n（manner_text）へ移した。
// 英語で開いた人にも同じお願いが伝わらないと意味がない
// （2026-08-13、伊波さん「ここは大事なページだからちゃんと訳してね」）

// ---- シティポップの絵柄（2026-08-11、伊波さんの指示） -------------------
//
// 左の柱。上2つの「1」「2」は、自分の音を入れる枠
// （2026-08-11、伊波さん「音１，２がユーザーが追加できる機能」）。
// 番号は「あなたが決める場所」の印で、覚えやすさのための番号ではない。
// 3つめからは80年代の小物を、音の意味に合わせて並べる。
// 絵だけにはしない。何のボタンか分からなくなるので、小さな言葉を必ず下に置く
// 並び順を変えても絵柄がずれないよう、番号ではなくボタンの名前で引く
const RAIL_ICONS: Record<string, string> = {
  my1: '1', my2: '2',        // 自分の音を入れる枠
  bam: '🥁',                 // どんっ   … 叩く音そのもの（車＝ぶつかる音は却下）
  ding: '🌟',                // きらっ   … ネオンスターが光る
  pon: '🍹',                 // ぽん     … 栓が抜ける
  buzz: '☎️',                // ぶー     … 話し中の音
  clap: '💗',                // 拍手     … 喝采
  drum: '📻',                // ドラム   … ラジカセ
  blip: '📼',                // ぴこ     … 小さな機械の音
  dread: '🌇',               // ずーん   … 日が沈む
  slash: '✨',               // しゃきん … 刃が閃く
  fanfare: '💿',             // ジャーン … レコードの一発
  flash: '🪩',               // フラッシュ … ミラーボールが弾ける
  glitch: '📺',              // グリッチ … ブラウン管の乱れ
  emotional: '🌴',           // エモい   … 南国の夕暮れの空気
};

// i18n の言葉には絵文字が付いている。絵柄はこちらで差し替えるので、言葉だけ取り出す
const bare = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim();

/** 左の柱のボタンの中身。絵柄（または番号）と、その下の小さな言葉 */
function RailFace({ id, label }: { id: string; label: string }) {
  const icon = RAIL_ICONS[id] ?? '🎵';
  const isNum = /^[0-9]$/.test(icon);
  return (
    <>
      <span className={isNum ? 'number-icon' : 'btn-icon'}>{icon}</span>
      <span className="btn-label">{bare(label)}</span>
    </>
  );
}

// テロップの絵柄（BUBBLE / ZIGZAG）は 08cf11c で不要になった。
// 5つとも「自分で決める場所」になり、全部が番号表示になったため

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  // 一時停止。止めているあいだは動画も進めない。
  // 録画側を止めるだけだと、再開したときに動画だけ先へ進んでいて話が飛ぶ
  const [isPaused, setIsPaused] = useState(false);
  const [canPause, setCanPause] = useState(true);

  // フローティングUI用のタブ状態は、いまの作り（左右の柱にボタンを常に出す）では
  // 使わなくなったので消した。ビルドが止まっていた（2026-08-11）

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 録画関連のRef
  const recorderRef = useRef<RecordHandle | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 描画の係が毎フレーム読むもの。React の state を直接読むと、
  // 係が作られた時点の古い値を見続けることになる
  const liveRef = useRef<{
    video: HTMLVideoElement | null;
    fill: boolean;
    shape: OutShape;
    // bgImg は「2枚重ね（サンドイッチ）」の下の絵。一番下に bgImg、
    // 真ん中にカメラ、一番上に img を重ねる。recorder.ts 側は対応済み
    frame: { img: HTMLImageElement; bgImg?: HTMLImageElement; anchor: FrameAnchor; slice?: { t: number; r: number; b: number; l: number }; faceHole?: FaceHole; faceHoles?: FaceHole[] } | null;
    watermark: string | null;
    mirror: boolean;
    zoom: number;
  }>({ video: null, fill: false, shape: 'landscape', frame: null, watermark: 'tinyCUBE', mirror: false, zoom: 1 });
  
  // ボタンから呼ばれる口。中身は effects.ts が持っている。
  // 録画していないときに押しても鳴る（本番前に手応えを確かめられるように）。
  // ただし絵は canvas に描くものなので、録画していないあいだは画面に出ない
  const fire = (effectName: EffectId) => fireEffect(effectName);

  // テロップの言葉。利用者が設定で書き換えられる。
  // 決め打ちの「草」「神」だけだと、その人の言い回しが使えない（2026-08-10）。
  // 消えると次に使うとき打ち直しになるので、localStorage に残す
  // 言葉は12個。一発エフェクト2つと効果音4つを足して、ちょうど18個になる。
  // デッキは6列なので 6×3 で隙間なく埋まる（2026-08-10、伊波さんの指示）。
  // 空にしたものはデッキに出ないので、使う人が減らすこともできる
  // 番号の付いた3つだけが、利用者の言葉。残りは決め打ちで動かさない
  // （2026-08-11、伊波さん「入れ替えれる言葉は上の数字の3か所」）。
  // 番号は「あなたが決める場所」の印なので、全部が変えられると意味が消える
  // 12個（自分の3＋決め打ち9）から **5つ・全部が変更可能** に減らした
  // （08cf11c「かんたん化」。対象は40〜50代と子どもなので、選ぶものを減らす）
  const TELOP_MINE = 5;
  const [myTelops, setMyTelops] = useState<string[]>(() => {
    const base = ['尊い', 'は？', 'やば', 'パーティータイム', 'チョベリグー'];
    try {
      // ⚠️ 保存キーは v2。旧キー（tinycube.telops）のままだと3つぶんの配列が
      //    読まれて、4・5番目だけ既定に戻る
      const saved = localStorage.getItem('tinycube.telops.v2');
      if (saved) {
        const arr = JSON.parse(saved) as string[];
        return Array.from({ length: TELOP_MINE }, (_, i) => arr[i] ?? base[i]);
      }
    } catch { /* 壊れていたら既定に戻す */ }
    return base;
  });
  const telops = myTelops;
  const setTelop = (i: number, text: string) => {
    setMyTelops(prev => {
      const next = [...prev];
      next[i] = text;
      try { localStorage.setItem('tinycube.telops.v2', JSON.stringify(next)); } catch { /* 保存できなくても動く */ }
      return next;
    });
  };

  const [frameId, setFrameId] = useState<string | null>(null);
  const [customFrames, setCustomFrames] = useState<CustomFrameRecord[]>([]);
  useEffect(() => {
    getCustomFrames().then(setCustomFrames).catch(console.error);
  }, []);
  const customFrameInputRef = useRef<HTMLInputElement>(null);
  
  const makeFaceHoleTransparent = async (dataUrl: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0);
        const im = ctx.getImageData(0, 0, img.width, img.height);
        const d = im.data;
        const W = img.width, H = img.height, N = W * H;

        const dark = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
          const o = i * 4;
          if (d[o + 3] > 8 && d[o] < 16 && d[o + 1] < 16 && d[o + 2] < 16) dark[i] = 1;
        }

        const label = new Int32Array(N).fill(-1);
        const stack = new Int32Array(N);
        const sizes: number[] = [];
        const edgeTouches: boolean[] = [];
        let next = 0;

        for (let s = 0; s < N; s++) {
          if (!dark[s] || label[s] >= 0) continue;
          let sp = 0, count = 0;
          let touchesEdge = false;
          stack[sp++] = s; label[s] = next;
          while (sp > 0) {
            const p = stack[--sp]; count++;
            const x = p % W, y = (p / W) | 0;
            if (x < W * 0.05 || x > W * 0.95 || y < H * 0.05 || y > H * 0.95) touchesEdge = true;
            if (x > 0     && dark[p - 1] && label[p - 1] < 0) { label[p - 1] = next; stack[sp++] = p - 1; }
            if (x < W - 1 && dark[p + 1] && label[p + 1] < 0) { label[p + 1] = next; stack[sp++] = p + 1; }
            if (y > 0     && dark[p - W] && label[p - W] < 0) { label[p - W] = next; stack[sp++] = p - W; }
            if (y < H - 1 && dark[p + W] && label[p + W] < 0) { label[p + W] = next; stack[sp++] = p + W; }
          }
          sizes.push(count);
          edgeTouches.push(touchesEdge);
          next++;
        }

        const min = N * 0.004;
        let cleared = 0;
        for (let i = 0; i < N; i++) {
          const l = label[i];
          if (l >= 0 && sizes[l] >= min && !edgeTouches[l]) {
            d[i * 4 + 3] = 0;
            cleared++;
          }
        }

        if (cleared > 0) {
          ctx.putImageData(im, 0, 0);
          resolve(c.toDataURL('image/png'));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const handleCustomFrameUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const rawDataUrl = ev.target?.result as string;
      const dataUrl = await makeFaceHoleTransparent(rawDataUrl);
      const id = `custom_${Date.now()}`;
      try {
        await saveCustomFrame(id, dataUrl);
        const next = await getCustomFrames();
        setCustomFrames(next);
        setFrameId(id);
      } catch (err) {
        console.error('Failed to save custom frame:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  // 読み込んだ動画が横長かどうか。16:9 を 9:16 へ詰めると画面の6割が黒帯になるので、
  // 元の形に合わせるほうを既定にして、そのことを画面で伝える（2026-08-10）
  // スマホは縦に持っているので、開いた時点から縦にしておく
  // （2026-08-11、伊波さん「スマホは縦に設定から開いてあったほうが親切」）。
  // 動画を読み込んだら、その向きに合わせ直す
  const [shape, setShape] = useState<OutShape>('portrait');
  const [srcIsWide, setSrcIsWide] = useState(false);
  // 映像の出どころ。動画ファイルか、その場のカメラか。
  // canvas に描いてから録る作りなので、出どころを差し替えるだけで
  // エフェクトも枠も透かしもそのまま乗る（2026-08-10）
  const [camOn, setCamOn] = useState(false);
  const [camFront, setCamFront] = useState(true);
  // 動画そのものの音を録るかどうか。BGM入りの動画にアフレコするときは
  // 消したい（2026-08-10、伊波さんの指示）
  const [useSrcAudio, setUseSrcAudio] = useState<'mix' | 'mic' | 'off'>(() => {
    try { return (localStorage.getItem('tinycube.srcAudio') as 'mix' | 'mic' | 'off') || 'mic'; } catch { return 'mic'; }
  });
  const pickSrcAudio = (v: 'mix' | 'mic' | 'off') => {
    setUseSrcAudio(v);
    try { localStorage.setItem('tinycube.srcAudio', v); } catch { /* 保存できなくても動く */ }
  };
  // 形を自分で選んだかどうか。選んだあとに映像の向きで上書きすると、
  // 9:16 を選んだのに 16:9 に戻る（2026-08-10、伊波さんの指摘）。
  // 新しい映像を読み込んだときだけ、自動で合わせ直す
  const shapePicked = useRef(false);
  const pickShape = (v: OutShape) => {
    shapePicked.current = true;
    setShape(v);
    // 形を変えたら、その形に合わない枠は選んだままにしない。
    // 残すと、一覧に出ていないものが選択されている状態になる
    setFrameId(prev => {
      const f = FRAMES.find(x => x.id === prev);
      return f && !fitsShape(f, v) ? null : prev;
    });
  };
  const camStreamRef = useRef<MediaStream | null>(null);
  // カメラを取り直すたびに増やす。前後を切り替えたときは camOn が true のままなので、
  // これが無いと <video> が古い（止めた）映像を指したままになり、真っ黒になる
  // （2026-08-11、伊波さん「インカメラは真っ黒、外は映る」）
  const [camVer, setCamVer] = useState(0);
  // カメラが黒いままのとき、何が起きているかを画面に出す。
  // 黙って黒いだけだと、こちらからは何一つ分からない（2026-08-11）
  const [camInfo, setCamInfo] = useState<string | null>(null);
  // 描画の係が毎フレーム読む。state を直接見ると古い値のままになる
  const camOnRef = useRef(false);
  // 効果音の差し替え（soundInputRef / soundSlot / soundVer）は 08cf11c で廃止
  // 文字の色。白は暗い映像に、黒は明るい映像に強い
  const [telopDark, setTelopDark] = useState(() => {
    try { return localStorage.getItem('tinycube.telopDark') === '1'; } catch { return false; }
  });
  // 出る場所。いつも真ん中か、ばらけさせるか
  // ずっと出しておく演出。いまは「エモーショナル」だけ
  const [ambientOn, setAmbientOn] = useState(false);
  const toggleAmbient = () => {
    const next = !ambientOn;
    setAmbientOn(next);
    setAmbient(next ? 'emotional' : null);
  };

  const [telopRandom, setTelopRandom] = useState(() => {
    try { return localStorage.getItem('tinycube.telopRandom') === '1'; } catch { return false; }
  });
  const pickTelopPos = (random: boolean) => {
    setTelopRandom(random);
    try { localStorage.setItem('tinycube.telopRandom', random ? '1' : '0'); } catch { /* 保存できなくても動く */ }
  };

  const pickTelopColor = (dark: boolean) => {
    setTelopDark(dark);
    try { localStorage.setItem('tinycube.telopDark', dark ? '1' : '0'); } catch { /* 保存できなくても動く */ }
  };    // 入れ替えたら画面を描き直すための番号
  // PC版と同じ分け方。事前準備（動画・書き出しの形・枠）は設定の中、
  // 下のパネルは録画中に指で押すものだけにする
  // 'agree' はアプリを開くたびに必ず最初に出る（伊波さん「アプリ開いた時」）。
  // 一度きりにしたい場合は、下の初期値を localStorage で分岐させれば済む
  // 起動の順番は「平成大プリクラ」に合わせてある。プリクラ機と同じで、
  // 撮る前にまず枠を決める（docs/tinycube-update-scope.md 0章）。
  // 1画面で決めることは1つだけ。それ以外の設定は ⚙️（setup）に置いたまま
  // 'photo' は写真を撮ったあとの編集画面（テキスト → デコる → 保存）。
  // 動画は「先に飾って撮る」、写真は「撮ってから飾る」で順番が逆になる
  // （2026-08-14、伊波さん「テキスト変更のとこのページみたいに動画とは逆に、
  // 撮ってから出す」）
  const [screen, setScreen] = useState<'agree' | 'manner' | 'setup' | 'video' | 'photo'>('agree');
  // 撮るもの。'photo' は3枚連写、'video' は今まで通りの録画。
  // フレームを選ぶ前に、まずこれを聞く（2026-08-14、伊波さん
  // 「まず（なにを撮る？）ページ追加【フレーム選択ページの前】」）
  const [captureKind, setCaptureKind] = useState<'photo' | 'video' | null>(null);
  // カメラの寄り。顔ハメの穴に顔が入らない人がいる（2026-08-14、伊波さん
  // 「顔がデカい人は入らないと指摘、ズーム機能調整（インカメ）」）。
  // 1 が今まで通り。下げると引く（顔が小さくなって穴に収まる）
  const [camZoom, setCamZoom] = useState(1);
  useEffect(() => { liveRef.current.zoom = camZoom; }, [camZoom]);

  // ---- 写真（3枚連写 → テキスト → デコる → 保存） --------------------
  // 撮った3枚。data URL で持つ。編集中に何度も canvas へ描き直すので、
  // Blob より扱いやすい
  const [shots, setShots] = useState<string[]>([]);
  // いま大きく出して編集している1枚（shots の添字）。
  // タップで入れ替える（2026-08-14、伊波さん「タップでデコる。
  // 大きい画像の所へ自由に入れ替え」）
  const [activeShot, setActiveShot] = useState(0);
  // 写真の編集は2段。テキストを決めてから、スタンプを乗せる
  const [photoStep, setPhotoStep] = useState<'text' | 'deco'>('text');
  const [isBursting, setIsBursting] = useState(false);
  // いま何枚目を撮っているか。画面に大きく出す。
  // 出さないと、3回光っても2回にしか見えない（2026-08-14、伊波さん）
  const [burstNo, setBurstNo] = useState<number | null>(null);
  // 写真に乗せる落書き。プリクラの落書き機能を静止画のスタンプとして出す。
  // 音は鳴らさない（2026-08-14、伊波さん「エフェクト音無し」）
  // angle は度。font は文字だけが持つ（スタンプは絵文字なので効かない）。
  // kind 'pen' は指で描いた線。points に通った場所を割合（0〜100）で持つ
  // （2026-08-14、伊波さん「らくがきスタンプ作ってデコろう」）
  type Pt = { x: number; y: number };
  type Deco = { id: number; shot: number; kind: 'text' | 'stamp' | 'pen'; value: string; x: number; y: number; size: number; color: string; angle: number; font?: string; points?: Pt[] };
  const [decos, setDecos] = useState<Deco[]>([]);
  const decoSeq = useRef(0);
  // らくがきの道具。ペンを持っているあいだは、写真を触ると線になる
  // （飾りをつまんで動かす動きとぶつかるので、はっきり切り替える）
  const [penOn, setPenOn] = useState(false);
  const [penColor, setPenColor] = useState('#ff4da6');
  const [penWidth, setPenWidth] = useState(1.4);   // 写真の幅に対する割合(%)
  // いま引いている最中の線。離すまで decos には入れない
  const [drawing, setDrawing] = useState<Pt[] | null>(null);
  const drawingRef = useRef<Pt[] | null>(null);
  // 写真のテキスト。動画側の「出現の仕方」は静止画では意味がないので持たず、
  // 代わりに色を選べるようにした（2026-08-14、伊波さん「出現の仕方の代りに
  // 色変更増やす。手描きフォントにするほうが当時のプリクラ再現率上がる」）
  const [photoText, setPhotoText] = useState('');
  const [photoTextColor, setPhotoTextColor] = useState('#ff4da6');
  // 当時のプリクラは手描き風の文字。ここはゴシックに戻さないこと。
  // 平成のギャル文字は「まるっこくて太い」のが肝
  // （2026-08-14、伊波さん「フォントは平成ギャルのフォント」）。
  // Yusei Magic はサインペン風で線が細く、ギャルにはならないので主役から外した
  // 2種類だけにする。並べすぎると選ぶのが仕事になる
  // （2026-08-14、伊波さん「フォント2種類にできない？」）。
  // 残したのは平成ギャルの2本柱。細い線のサインペン系は外した
  const PHOTO_FONTS = [
    { id: 'maru', name: 'まるもじ', css: '"Hachi Maru Pop", cursive' },
    { id: 'pop',  name: 'ぷっくり', css: '"Mochiy Pop One", sans-serif' },
  ] as const;
  const [photoFontId, setPhotoFontId] = useState<string>('maru');
  const PHOTO_FONT = PHOTO_FONTS.find(f => f.id === photoFontId)?.css ?? PHOTO_FONTS[0].css;
  // 文字の傾き。プリクラの落書きは斜めに入れるものなので、角度が要る
  // （2026-08-14、伊波さん「文字入れの角度が効かない」）
  const [photoAngle, setPhotoAngle] = useState(0);
  const TEXT_COLORS = ['#ff4da6', '#ffffff', '#000000', '#ffe14d', '#4dd2ff', '#7cff4d', '#ff6b4d', '#c14dff'];
  const STAMPS = ['💖', '⭐', '🌟', '✨', '🎀', '🌈', '🍓', '🧸', '👑', '🦄', '🌸', '💎', '🍭', '☁️', '🐰', '🎵'];
  // 「同意してはじめる」を押したら、まっすぐフレーム選びへ。
  // 以前はここで使い方のガイド（長い文章）を挟んでいたが、
  // 実際に友達に使ってもらったら「何のアプリか、どう使うか分からない」だった。
  // 説明を読んで分からないなら、説明を厚くするより手を引くほうが早い
  // （2026-08-12、伊波さん「説明見てわからないなら、誘導が１番でしょ？」）。
  // ガイド自体は消していない。ヘッダーの ❓ からいつでも読める
  const afterAgree = () => {
    try { localStorage.setItem('tinycube.guideSeen', '1'); } catch { /* 保存できなくても動く */ }
    setScreen('setup');
  };
  const [hand, setHand] = useState<'right' | 'left'>('right');
  // 初めて撮影画面に来た人に、押す場所だけ示すための旗
  const [startHint, setStartHint] = useState(false);
  // 撮る前の数え。押した瞬間に始まると構える間がない
  // （2026-08-12、伊波さん「動画、camera共にカウント入れたら？３秒ぐらい」）。
  // 動画でもカメラでも同じように数える
  const [countdown, setCountdown] = useState<number | null>(null);
  // 設定を閉じたときに、どこへ戻すか。来た場所へ返さないと迷子になる
  // （2026-08-12、伊波さん「戻るボタンがほしいね」）
  // 設定は1画面に1つずつ出す。9つ全部を積むと、対象の40〜50代と子どもが
  // どこを見ればいいか分からない（2026-08-13、伊波さん）。
  //   1 mode  … なにを撮りますか？（カメラ／動画）。選ぶまで先へ進ませない
  //   2 frame … フレーム選び。ここが主役なので大きく出す
  //   3 more  … その他の設定。押した人だけが見る（普段は開かなくていい）
  //   4 telop … スタンプ（テロップ）の言葉と出し方。フレームの次に聞く
  //   0 kind  … なにを撮る？（写真／動画）。フレームより前に聞く
  const [setupStep, setSetupStep] = useState<'kind' | 'mode' | 'frame' | 'telop'>('kind');
  // 枠選び（frame）と素材選び（source）は setup に統合したので、戻り先は video だけ
  const [backTo, setBackTo] = useState<'video'>('video');
  // 2回目以降は「フレームだけ選び直す」ことが多いので、開いたら
  // フレーム選びから始める（毎回1段目を踏ませない）
  const openSetup = (from: 'video') => { setBackTo(from); setSetupStep('frame'); setScreen('setup'); };
  // 撮るものを決めて次へ。写真はフレームを選んだら撮影画面へ直行する
  // （テロップは撮ったあとに乗せるので、先に聞かない）
  const pickKind = (k: 'photo' | 'video') => {
    setCaptureKind(k);
    setSetupStep('mode');
  };
  // 設定の段階を1つ戻す。1段目まで来たら撮影画面へ返す。
  // ヘッダーと小窓の中の両方から呼ぶので、処理はここに1つだけ置く
  const goBackStep = () => {
    if (setupStep === 'telop') setSetupStep('frame');
    // 写真はテロップの段を通らないので、フレームから mode へ戻る道は同じ
    else if (setupStep === 'frame') setSetupStep('mode');
    else if (setupStep === 'mode') setSetupStep('kind');
    else if (camOn || videoSrc) setScreen(backTo);
  };
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [loopVideo, setLoopVideo] = useState(true);
  // 買い切りの解除。フレームと透かし消しの両方が一度に解ける
  // （2026-08-11、伊波さん「両方」）
  const [unlocked, setUnlocked] = useState(isUnlocked());
  const [keyInput, setKeyInput] = useState('');
  const [keyNG, setKeyNG] = useState(false);
  const unlockRef = useRef<HTMLDivElement>(null);
  // 買うところ。BOOTH は日本、Ko-fi は英語圏。CMCUBE と同じ分け方（2026-08-11）
  const buyUrl = getLang() === 'ja'
    ? 'https://cubicengine.booth.pm/items/8705410'
    : 'https://ko-fi.com/s/e4fc12b6e7';
  const submitKey = async () => {
    const ok = await tryUnlock(keyInput);
    setKeyNG(!ok);
    if (ok) { setUnlocked(true); setKeyInput(''); }
  };
  
  // 値は読まない（開く操作だけ）。読む側が出てきたら第1要素を戻すこと
  const [, setAdvancedOpen] = useState(false);
  // 鍵のかかったフレームを押したとき、買うところまで連れていく。
  // 押しても何も起きないと、壊れているように見える
  const showUnlock = () => {
    setAdvancedOpen(true);
    setTimeout(() => {
      unlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  // 透かしは無料版の印。解除したら消える。
  // 画面に出している canvas をそのまま録るので、ここを変えれば動画も写真も変わる
  useEffect(() => {
    liveRef.current.watermark = unlocked ? null : 'tinyCUBE';
  }, [unlocked]);
  // tinyCUBE はスマホで使うもの。PC で開いた人には、そう伝えてから通す。
  // 塞がずに「このまま使う」を用意しているのは、確かめたい人を止めないため
  // （2026-08-10、伊波さん「基本PCで開かないから」「スマホだけ」）
  const [pcOk, setPcOk] = useState(false);
  const onPC = typeof window !== 'undefined'
    && window.matchMedia('(min-width: 900px) and (pointer: fine)').matches;
  // 「試してみる」（録画せずに動画だけ流す）の状態は、いちばん上でまとめて
  // 宣言している。一発撮りなので、本番前に中身と長さを確かめられないと押すのが怖い
  // 撮る前の注意。人の動画を読み込んで声を乗せる道具なので、
  // 権利と同意の話は最初に一度は目に入れてもらう（CMCUBE と同じ扱い）。
  // 一度読んだら出さない
  // 縦に持ったまま 16:9 を選ぶと、映す場所が細くなる。持ち替えを勧める
  const [portraitDevice, setPortraitDevice] = useState(
    typeof window !== 'undefined' && window.innerHeight > window.innerWidth
  );
  useEffect(() => {
    const on = () => setPortraitDevice(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);

  const closeGuide = () => {
    try { localStorage.setItem('tinycube.guideSeen', '1'); } catch { /* 保存できなくても動く */ }
    // 枠選びは setup に統合済み。'frame' という画面はもう無い
    setScreen('setup');
  };
  // ②で素材が決まっても、すぐに撮影画面へは送らない。
  // source 画面に留まり、「決定」ボタンで進む
  // （2026-08-12、伊波さん「cameraを選んだら即決定になるので、決定ボタンを作る」）
  // いまは呼び出し口が無い。素材選び（source）画面を setup に統合したときに
  // 押す場所が消えたもので、機能そのものが要らなくなったのかは未確認。
  // 消すと戻すのが手間なので残してある（2026-08-13、シオン）
  const confirmSource = () => {
    if (videoSrc || camOn) { setStartHint(true); setScreen('video'); }
  };
  void confirmSource;
  // 枠は全部出す。形が合わないものは端が切れるが、それでも使いたいという
  // 判断（2026-08-10、伊波さん）。切れることはタイルに印を出して伝える
  // 鍵のかかった枠は、解除するまで選べない。一覧には出す（何が入るか分かるように）
  const locked = (f: { paid?: boolean }) => !!f.paid && !unlocked;
  const builtinFrame = FRAMES.find(f => f.id === frameId) ?? null;
  const customFrame = customFrames.find(f => f.id === frameId) ?? null;
  const frame: Frame | null = builtinFrame || (customFrame ? { id: customFrame.id, name: 'マイフレーム', file: customFrame.dataUrl, anchor: 'wide' } : null);


  // 画面に出す係を1つだけ回す。録画していなくても同じ絵が出るので、
  // エフェクトを押せばその場で見える
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    return startStage({
      canvas: c,
      // video は毎回聞き直す。読み込む前は要素そのものが無い
      // カメラのときだけ画面いっぱいに広げる
      read: () => ({ ...liveRef.current, video: videoRef.current, fill: camOnRef.current }),
      onTrouble: msg => setCamInfo(msg || null),
    });
  }, []);

  // 選んだ枠の絵を読み込んでおく。録画の直前に読むと間に合わない
  useEffect(() => {
    liveRef.current.shape = shape;
    if (!frame || (builtinFrame && locked(builtinFrame))) { liveRef.current.frame = null; return; }
    let alive = true;
    loadFrame(frame).then(({ img, bgImg }) => {
      if (alive) liveRef.current.frame = { img, bgImg, anchor: frame.anchor, faceHole: frame.faceHole, faceHoles: frame.faceHoles };
    }).catch(() => { /* 読めなければ枠なしで続ける */ });
    return () => { alive = false; };
  }, [frame, shape]);

  // 動画ファイルが選択されたとき
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      stopCam();
      shapePicked.current = false;           // 新しい動画なので、また自動で合わせる
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setSrcIsWide(false);
    }
  };

  // プレビューエリアをタップしてファイル選択を開く
  const triggerFileInput = () => {
    if (!videoSrc) {
      fileInputRef.current?.click();
    }
  };

  // 保存の渡し方。
  // iPhone の Safari は a.download をほぼ無視するので、これだけに頼ると
  // 「録れたのに保存できない」で終わる。手元に iOS の実機が無く確かめられないため、
  // iOS が確実に持っている共有シート（Web Share）を先に試す形にした。
  // 共有シートから「ビデオを保存」でカメラロールへ入る。
  // 対応していない環境（PCのブラウザなど）は、今まで通りダウンロードする。
  const stopCam = () => {
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    camStreamRef.current = null;
    const v = videoRef.current;
    if (v) { v.srcObject = null; }
    setCamOn(false);
  };

  const startCam = async (front: boolean) => {
    try {
      // 先に古いものを止める。止めずに取り直すと、機種によっては断られる
      camStreamRef.current?.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: front ? 'user' : 'environment' },
        audio: false,                        // 声は録画のときにマイクから混ぜる
      });
      camStreamRef.current = stream;
      shapePicked.current = false;           // 新しい映像なので、また自動で合わせる
      setVideoSrc(null);                     // 動画ファイルとは同時に使わない
      setCamFront(front);
      setCamOn(true);
      setCamVer(v => v + 1);      // 繋ぎ直させる
      // ここで videoRef を触ってはいけない。カメラを入れるまで <video> は
      // 画面に無く、srcObject を入れる先がまだ存在しない（2026-08-10）。
      // 実際に繋ぐのは下の useEffect
      const st = stream.getVideoTracks()[0]?.getSettings();
      if (st?.width && st?.height) {
        const wide = st.width > st.height;
        setSrcIsWide(wide);
        if (!shapePicked.current) setShape(wide ? 'landscape' : 'portrait');
      }
    } catch (e: any) {
      alert(t('cam_fail') + ' ' + (e?.message ?? ''));
    }
  };

  // 効果音の読み込み（sounds.ts）は 08cf11c で廃止。
  // いまの3つは effects.ts が自分で鳴らすので、ここで用意するものは無い

  // <video> が画面に出てから、カメラの映像を繋ぐ
  useEffect(() => {
    camOnRef.current = camOn;
    // 自撮りのときだけ鏡にする。外カメラは見たままでよい
    liveRef.current.mirror = camOn && camFront;
    const v = videoRef.current;
    if (!camOn || !v || !camStreamRef.current) return;
    v.srcObject = camStreamRef.current;
    v.muted = true;                          // 自分の声が返ってきて回るのを防ぐ
    v.play().catch(e => setCamInfo('再生を断られました: ' + (e?.name ?? '')));
    // しばらくして絵が来ていなければ、その中身を画面に出す
    setCamInfo(null);
    const check = setTimeout(() => {
      const t = camStreamRef.current?.getVideoTracks()[0];
      if (!v.videoWidth || v.paused) {
        setCamInfo(
          `映像が届きません／サイズ ${v.videoWidth}x${v.videoHeight}`
          + ` 状態 ${v.readyState} 停止 ${v.paused}`
          + ` トラック ${t?.readyState ?? 'なし'} 有効 ${t?.enabled ?? '-'}`,
        );
      }
    }, 2500);
    return () => clearTimeout(check);
  }, [camOn, camVer, camFront]);

  const save = async (blob: Blob, ext: string) => {
    const name = `tinycube_${Date.now()}.${ext}`;
    
    const showSaved = () => {
      setSaveMessage('保存しました！');
      setTimeout(() => setSaveMessage(null), 3000);
    };

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSaved();
    }, 100);
  };

  // 下見の開始・停止。録らないので、音は動画そのものの出力で鳴る
  const togglePreview = async () => {
    const v = videoRef.current;
    if (!v || (!videoSrc && !camOn)) { alert(t('alert_load_first')); return; }
    if (isPreviewing) {
      v.pause();
      v.currentTime = 0;
      setIsPreviewing(false);
      return;
    }
    // 音ありの再生は「指で触った」あとでないとブラウザに止められることがある。
    // 断られたら音を消してでも絵は出す（止まったままだと壊れて見える）
    v.muted = false;
    try {
      await v.play();
    } catch {
      v.muted = true;
      try { await v.play(); } catch { return; }
    }
    setIsPreviewing(true);
  };
  // confirmSource と同じく、画面の作り替えで押す場所が無くなったもの。
  // 機能が不要になったのかは未確認なので消さずに残す（2026-08-13、シオン）
  void togglePreview;

  // 写真。canvas には映像・枠・エフェクト・透かしが全部乗っているので、
  // そのまま1枚に書き出すだけでよい（2026-08-11、伊波さん「昔のプリクラ」）。
  // 光らせるのは画面の上だけ。canvas に描くと写真そのものが白くなる
  const [flash, setFlash] = useState(false);
  const shoot = async () => {
    const c = canvasRef.current;
    if (!c) return;
    if (!videoSrc && !camOn) { alert(t('alert_load_first')); return; }
    setFlash(true);
    setTimeout(() => setFlash(false), 220);
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.92));
    if (blob) await save(blob, 'jpg');
  };

  // 3枚連写。プリクラと同じで、数えてから続けて3回撮る。
  // 撮り終えたら編集画面（テキスト → デコる）へ送る
  // （2026-08-14、伊波さん「写真を撮る（３枚連写）」）
  const burstShoot = async () => {
    const c = canvasRef.current;
    if (!c || isBursting) return;
    if (!videoSrc && !camOn) { alert(t('alert_load_first')); return; }
    setIsBursting(true);
    setStartHint(false);
    const taken: string[] = [];
    try {
      // 1枚目の前だけ3つ数える。構える間を作る
      for (let n = 3; n > 0; n--) {
        setCountdown(n);
        await new Promise(r => setTimeout(r, 1000));
      }
      setCountdown(null);
      // 3枚。**毎回「1・2・3」と数字を出してから撮る。**
      // 数えずに続けて光らせると、3回光っても2回にしか見えない
      // （2026-08-14、伊波さん「連写が2回、写真は3枚」）。
      // 何枚目を撮っているかが見えていれば、数を取り違えようがない
      for (let i = 0; i < 3; i++) {
        setBurstNo(i + 1);
        // 構える間。1枚目も含めて毎回置く（間が無いと連続の1枚に見える）
        await new Promise(r => setTimeout(r, 700));
        setFlash(true);
        // 光っているあいだに撮ると、画面の白がそのまま写る。
        // 光は CSS なので canvas には乗らないが、撮る側は光より先に済ませる
        taken.push(c.toDataURL('image/jpeg', 0.92));
        await new Promise(r => setTimeout(r, 260));
        setFlash(false);
        // 撮れたことが分かるように、次へ行く前に必ず間を空ける
        await new Promise(r => setTimeout(r, 420));
      }
      setBurstNo(null);
    } finally {
      setCountdown(null);
      setBurstNo(null);
      setIsBursting(false);
    }
    setShots(taken);
    setActiveShot(0);
    setDecos([]);
    setPhotoText('');
    setPhotoStep('text');
    setScreen('photo');
  };

  // 編集した1枚を canvas に焼く。テキストもスタンプも位置は割合（0〜100）で
  // 持っているので、書き出す大きさが変わっても同じ場所に乗る
  const renderShot = (i: number): Promise<HTMLCanvasElement | null> => {
    return new Promise(resolve => {
      const src = shots[i];
      if (!src) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        if (!g) return resolve(null);
        g.drawImage(img, 0, 0);
        for (const d of decos.filter(x => x.shot === i)) {
          // らくがきの線。点は割合で持っているので、書き出す大きさに直す。
          // 画面の SVG は viewBox を引き伸ばして描いているので、
          // 縦横それぞれの比率で place し直す
          if (d.kind === 'pen' && d.points && d.points.length > 1) {
            g.save();
            g.strokeStyle = d.color;
            g.lineWidth = Math.max(1, c.width * d.size / 100);
            g.lineCap = 'round';
            g.lineJoin = 'round';
            g.beginPath();
            d.points.forEach((pt, n) => {
              const X = c.width * pt.x / 100;
              const Y = c.height * pt.y / 100;
              if (n === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
            });
            g.stroke();
            g.restore();
            continue;
          }
          const px = c.width * d.x / 100;
          const py = c.height * d.y / 100;
          // 文字の大きさは幅を基準にする。縦横で見え方が変わらないように
          const size = c.width * d.size / 100;
          g.save();
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          // 画面と同じ順番で、寄せてから回す。ここを合わせないと
          // 画面で見た位置と保存した位置がずれる
          g.translate(px, py);
          if (d.angle) g.rotate(d.angle * Math.PI / 180);
          if (d.kind === 'text') {
            g.font = `700 ${size}px ${d.font ?? PHOTO_FONT}`;
            // 白い服にも黒い髪にも乗るよう、必ず縁を付ける
            g.lineWidth = Math.max(2, size * 0.14);
            g.strokeStyle = d.color === '#ffffff' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.9)';
            g.lineJoin = 'round';
            // translate 済みなので原点に描く
            g.strokeText(d.value, 0, 0);
            g.fillStyle = d.color;
            g.fillText(d.value, 0, 0);
          } else {
            g.font = `${size}px sans-serif`;
            g.fillText(d.value, 0, 0);
          }
          g.restore();
        }
        resolve(c);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  };

  // 3枚を縦に並べて1枚にする。縦でも横でも同じ見え方にする
  // （2026-08-14、伊波さん「３枚の縦長写真（同じ大きさで１６：９）
  // 縦の時横の時も同じ表示」）。
  // 1コマを 16:9 の横長で揃え、それを3段積むので、出来上がりは縦長になる
  const savePhotoSheet = async () => {
    const rendered = await Promise.all([0, 1, 2].map(i => renderShot(i)));
    const cells = rendered.filter((c): c is HTMLCanvasElement => !!c);
    if (cells.length === 0) return;
    // 1コマの形。3枚とも同じ大きさで縦に積む
    // （2026-08-14、伊波さん「３枚の縦長写真（同じ大きさで１６：９）
    // 縦の時横の時も同じ表示」）。
    //
    // 「縦の時横の時も同じ表示」を、**撮った写真の形をそのまま使う**と読んだ。
    // 縦で撮ったものを 16:9 の横長コマへ押し込むと、顔の上下が切れて
    // 顔ハメが台無しになる。コマの形を写真に合わせれば、縦で撮っても
    // 横で撮っても「同じ大きさの3枚が縦に並ぶ」見え方は変わらない
    const CELL_W = 1080;
    const first = cells[0];
    const CELL_H = Math.round(CELL_W * first.height / first.width);
    const GAP = 24;
    const PAD = 24;
    const sheet = document.createElement('canvas');
    sheet.width = CELL_W + PAD * 2;
    sheet.height = PAD * 2 + CELL_H * cells.length + GAP * (cells.length - 1);
    const g = sheet.getContext('2d');
    if (!g) return;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, sheet.width, sheet.height);
    cells.forEach((cell, i) => {
      const dy = PAD + i * (CELL_H + GAP);
      // 元の写真は縦長（1080x1920）なので、16:9 の枠には中央を切り出して収める。
      // 縮めて黒帯を出すと、3枚とも帯だらけになる
      const scale = Math.max(CELL_W / cell.width, CELL_H / cell.height);
      const w = cell.width * scale, h = cell.height * scale;
      g.save();
      g.beginPath();
      g.rect(PAD, dy, CELL_W, CELL_H);
      g.clip();
      g.drawImage(cell, PAD + (CELL_W - w) / 2, dy + (CELL_H - h) / 2, w, h);
      g.restore();
    });
    // 透かしはここでは足さない。1コマ1コマに canvas の時点で焼かれているので、
    // 用紙にもう一枚置くと同じ文字が二重に出る（実測で下端に重なっていた）
    const blob = await new Promise<Blob | null>(res => sheet.toBlob(res, 'image/jpeg', 0.92));
    if (blob) await save(blob, 'jpg');
  };

  // 撮り直し。撮影画面へ戻して、編集中のものを捨てる
  const retakePhotos = () => {
    setShots([]);
    setDecos([]);
    setPhotoText('');
    setScreen('video');
    setStartHint(true);
  };

  // デコるを1つ足す。まずは真ん中に置いて、指で動かしてもらう
  const addDeco = (kind: 'text' | 'stamp', value: string) => {
    if (!value.trim()) return;
    decoSeq.current += 1;
    setDecos(prev => [...prev, {
      id: decoSeq.current,
      shot: activeShot,
      kind,
      value,
      x: 50,
      y: kind === 'text' ? 78 : 50,
      size: kind === 'text' ? 9 : 14,
      color: photoTextColor,
      // 文字はいま選んでいる傾きと書体で出す。スタンプはまっすぐ
      angle: kind === 'text' ? photoAngle : 0,
      font: kind === 'text' ? PHOTO_FONT : undefined,
    }]);
  };

  // 指でつまんで動かす。プリクラの落書きと同じで、置いてから位置を直せないと使えない。
  // 押している間だけ window で追いかける（指が絵の外へ出ても離さない）
  const [dragId, setDragId] = useState<number | null>(null);
  const bigShotRef = useRef<HTMLDivElement>(null);

  // ---- らくがき（指でなぞった線） ----------------------------------
  // 写真の中の場所を割合（0〜100）で取る。書き出す大きさが変わっても
  // 同じところに線が乗る
  const ptFromEvent = (e: { clientX: number; clientY: number }): Pt | null => {
    const box = bigShotRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return null;
    return {
      x: ((e.clientX - box.left) / box.width) * 100,
      y: ((e.clientY - box.top) / box.height) * 100,
    };
  };
  const penDown = (e: React.PointerEvent) => {
    if (!penOn) return;
    e.preventDefault();
    const p = ptFromEvent(e);
    if (!p) return;
    drawingRef.current = [p];
    setDrawing([p]);
  };
  const penMove = (e: React.PointerEvent) => {
    if (!penOn || !drawingRef.current) return;
    e.preventDefault();
    const p = ptFromEvent(e);
    if (!p) return;
    // 近すぎる点は捨てる。全部拾うと点が数千個になり、保存が重くなる
    const last = drawingRef.current[drawingRef.current.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.6) return;
    drawingRef.current = [...drawingRef.current, p];
    setDrawing(drawingRef.current);
  };
  const penUp = () => {
    const pts = drawingRef.current;
    drawingRef.current = null;
    setDrawing(null);
    // 点1つだけ（ちょんと触っただけ）は線にしない
    if (!pts || pts.length < 2) return;
    decoSeq.current += 1;
    setDecos(prev => [...prev, {
      id: decoSeq.current,
      shot: activeShot,
      kind: 'pen',
      value: '',
      x: 0, y: 0, size: penWidth, angle: 0,
      color: penColor,
      points: pts,
    }]);
  };
  // 線を1本ずつ取り消す。全部消すより、直前のやり直しのほうがよく要る
  const undoPen = () => {
    setDecos(prev => {
      const last = [...prev].reverse().find(d => d.shot === activeShot && d.kind === 'pen');
      return last ? prev.filter(d => d.id !== last.id) : prev;
    });
  };
  // 点の並びを SVG の道順にする。角を丸めず素直に繋ぐ
  const toPath = (pts: Pt[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const startDrag = (id: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragId(id);
  };
  useEffect(() => {
    if (dragId === null) return;
    const move = (e: PointerEvent) => {
      const box = bigShotRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      const x = ((e.clientX - box.left) / box.width) * 100;
      const y = ((e.clientY - box.top) / box.height) * 100;
      setDecos(prev => prev.map(d => d.id === dragId
        ? { ...d, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
        : d));
    };
    const up = () => setDragId(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragId]);

  // 一時停止。録画も動画も両方止める。
  // 止めているあいだの絵と音は、まったくファイルに入らない
  const togglePause = () => {
    const rec = recorderRef.current;
    const v = videoRef.current;
    if (!rec || !isRecording || !rec.canPause) return;
    if (isPaused) {
      rec.resume();
      v?.play().catch(() => { /* 動かなくても録画は続く */ });
      setIsPaused(false);
    } else {
      rec.pause();
      v?.pause();
      setIsPaused(true);
    }
  };

  // 録画の開始・停止
  const toggleRecording = async () => {
    // 数えているあいだの二度押しは受けない。二重に始まってしまう
    if (countdown !== null) return;
    if (isRecording) {
      recorderRef.current?.stop();
      recorderRef.current = null;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
      setIsRecording(false);
      setIsPaused(false);
      return;
    }

    if (!videoRef.current || (!videoSrc && !camOn)) {
      alert(t('alert_load_first'));
      return;
    }

    if (isPreviewing) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setIsPreviewing(false);
    }

    // 3つ数えてから始める。ここで構えてもらう
    setStartHint(false);
    for (let n = 3; n > 0; n--) {
      setCountdown(n);
      await new Promise(r => setTimeout(r, 1000));
    }
    setCountdown(null);

    try {
      // 透かしは無料版の印。動画そのものに焼き込まれる。
      // 有料版にしたときは null を渡すだけで消える
      // 画面に出しているものをそのまま録る。別の絵を作らないので、
      // 見えているものと出てくるものが必ず一致する
      recorderRef.current = await startRecording({
        video: videoRef.current,
        canvas: canvasRef.current ?? undefined,
        frame: liveRef.current.frame,
        shape,
        srcAudio: useSrcAudio,
        watermark: unlocked ? null : 'tinyCUBE',
        onFinish: (blob, ext) => save(blob, ext),
        onError: (e) => alert(t('alert_rec_fail') + e.message),
      });
      // 録画開始と同じタイミングで動画も最初から再生する
      if (videoSrc && videoRef.current) {
        videoRef.current.currentTime = 0;
      }
      await videoRef.current.play();
      setCanPause(recorderRef.current.canPause);
      setIsPaused(false);
      setIsRecording(true);
    } catch (err: any) {
      console.error(err);
      alert(t('alert_mic_fail') + err.message);
    }
  };

  if (onPC && !pcOk) {
    return (
      <div className="pc-notice">
        <div className="pc-cube"></div>
        <h1>tinyCUBE</h1>
        <p className="pc-lead">
          スマホで使うアプリです。<br />
          <span>Made for phones.</span>
        </p>
        <p className="pc-url">tinycube.vercel.app</p>
        <p className="pc-sub">
          スマホのブラウザでこの住所を開いてください。<br />
          <span>Open this address on your phone.</span>
        </p>
        <button className="pc-continue" onClick={() => setPcOk(true)}>
          このまま使う / Continue anyway
        </button>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* 映像領域（最背面で全画面） */}
      <main className="preview-stage" onClick={triggerFileInput}>
        <input
          type="file"
          ref={fileInputRef}
          accept="video/*"
          onChange={handleVideoUpload}
          style={{ display: 'none' }}
        />

        <div
          className="stage-box"
          style={{ '--ar': shape === 'portrait' ? '0.5625' : '1.7778' } as React.CSSProperties}
        >
          <canvas ref={canvasRef} className="stage-canvas" />
          {(videoSrc || camOn) && (
            <video
              ref={videoRef}
              src={videoSrc ?? undefined}
              className="video-player hidden-source"
              loop={loopVideo}
              playsInline
              onEnded={() => setIsPreviewing(false)}
              onLoadedMetadata={e => {
                const v = e.currentTarget;
                const wide = v.videoWidth > v.videoHeight;
                setSrcIsWide(wide);
                if (!shapePicked.current) setShape(wide ? 'landscape' : 'portrait');
              }}
              muted
            />
          )}

          {/* 枠は canvas に焼いてある（recorder.ts の drawFrame）。
              ここで DOM にもう一枚重ねると、同じ絵を二重に持つうえ、
              端末によっては映像の上に乗って中が見えなくなる。
              昔の名残だったので外した（2026-08-11） */}
        </div>

        {/* 案内は canvas の外に出す。canvas は動画の形ぴったりまで縮むので、
            中に入れると 16:9 の細い帯の中で文字と注意書きが重なる（2026-08-11） */}
        {!videoSrc && !camOn && (
          <div className="video-placeholder">
            <div className="upload-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </div>
            <p>{t('upload_hint')}</p>
          </div>
        )}
        {camInfo && <div className="cam-info">{camInfo}</div>}
        {saveMessage && <div className="cam-info" style={{ background: 'rgba(255, 50, 150, 0.9)', fontWeight: 'bold' }}>{saveMessage}</div>}
        {countdown !== null && <div className="countdown">{countdown}</div>}
        {/* 何枚目を撮っているか。3枚撮ったことが数で分かるようにする */}
        {burstNo !== null && <div className="burst-no">{burstNo} / 3</div>}
        {shape === 'landscape' && portraitDevice ? (
          <div className="turn-hint">（横フレームが選択されています。<br/>スマホを横にしてください。）</div>
        ) : startHint && !isRecording ? (
          /* 誘導は説明より強い。初めて撮影画面に来た人に、押す場所だけ示す
             （2026-08-12、伊波さん「説明見てわからないなら、誘導が１番でしょ？」） */
          <div className="turn-hint start-hint">録画ボタンを押してね</div>
        ) : null}
      </main>

      {/* 手前に重なるフローティングUI */}
      <div className={`ui-layer hand-${hand}`}>
        {/* 上下の帯。光が横切るが、中央の映像には届かない（切り取ってある） */}
        <div className="city-frame top" />
        <div className="city-frame bottom" />

        <header className="header">
          <div className="logo-container">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#fff' }}>
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
              <line x1="12" y1="22.08" x2="12" y2="12"></line>
              <text x="12" y="16" fontSize="10" fontWeight="bold" fill="currentColor" stroke="none" textAnchor="middle" transform="translate(0, 1)">t</text>
            </svg>
            <span className="logo-text" style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>tinyCUBE</span>
            {/* 実機で「直したものが届いているか」を目で確かめるための印。
                スマホは古い中身を握り続けることがあり、そのせいで
                「何も変わっていない」に見える。ここの時刻が変われば届いている
                （2026-08-13、伊波さん「前もスマホはリアルタイムが難しかった」） */}
            {import.meta.env.DEV && (
              <span style={{ fontSize: '9px', opacity: 0.7, marginLeft: '6px', fontFamily: 'monospace' }}>
                顔ハメ改
              </span>
            )}
          </div>
          <div className="header-tools">
            {/* 絵文字だけだと何のボタンか分からない。リボンが設定、ピースが使い方
                という組み合わせは、作った側にも伝わらなかった（2026-08-11）。
                意味の通る絵に戻す */}
            {/* 設定ボタン（⚙️）は消して、設定（source）に戻るボタンに変更
                （2026-08-12、伊波さん「撮影画面の設定ボタンは消して設定に戻るボタンを付ける」） */}
            <button className="tool-btn-small" onClick={() => setScreen('setup')} title="設定に戻る" style={{ width: 'auto', padding: '0 12px', fontSize: '13px', fontWeight: 'bold' }}>戻る</button>
            <button className="tool-btn-small" onClick={() => setScreen('manner')} title="使い方">❓</button>
            <button className="tool-btn-small discord-btn" onClick={() => window.open('https://discord.gg/wVnyfnv7d', '_blank', 'noopener,noreferrer')} title="公式Discord">👾</button>
          </div>
        </header>

        {/* 録画ボタン */}
        <footer className="bottom-controls">
          <button className="preview-btn-round" onClick={() => setScreen('setup')} disabled={isRecording || isBursting} title="設定に戻る">
            <span className="ctrl-icon">↺</span>
            <span className="ctrl-label">設定</span>
          </button>
          {/* 写真の道では、押すものを「3枚撮る」1つだけにする。
              録画のボタンが並んでいると、写真を撮りに来た人がどれを押すか迷う
              （2026-08-14、伊波さん「写真はフレーム選択の後→camera画面で撮影」） */}
          {captureKind === 'photo' ? (
            <button
              className="photo-btn-round burst"
              onClick={burstShoot}
              disabled={(!videoSrc && !camOn) || isBursting}
              title="3枚つづけて撮る"
            >
              <span className="ctrl-icon">📸</span>
              <span className="ctrl-label">{isBursting ? '撮影中…' : '3枚撮る'}</span>
            </button>
          ) : (
          <>
          {/* 写真。押した瞬間の画面が、そのまま1枚になる。
              絵の下に必ず言葉を置く（2026-08-13、伊波さん
              「ボタンなどの文字はわかりやすく」） */}
          <button
            className="photo-btn-round"
            onClick={shoot}
            disabled={!videoSrc && !camOn}
            title={t('btn_photo')}
          >
            <span className="ctrl-icon">📷</span>
            <span className="ctrl-label">写真</span>
          </button>
          {/* 録画スタート・一時停止・停止は**いつも4つとも出す**。
              そのときに押せないものは薄くして押せなくするだけにする。
              消してしまうと「さっきあったボタンが無い」と探すことになる
              （2026-08-13、伊波さん「停止、一時停止は初めからボタンとして
              あったほうがイイ」）。
              前は赤い丸1つが押すたびに意味を変えていて、見ても始まるのか
              止まるのか分からなかった（同日「停止ボタン追加」） */}
          <button
            className="record-btn-round"
            onClick={toggleRecording}
            disabled={isRecording}
            title={t('btn_record')}
          >
            <div className="record-inner"></div>
            <span className="ctrl-label">{t('btn_record')}</span>
          </button>
          <button
            className={`pause-btn-round ${isPaused ? 'on' : ''}`}
            onClick={togglePause}
            disabled={!isRecording || !canPause}
            title={!canPause ? t('pause_na') : isPaused ? t('btn_resume') : t('btn_pause')}
          >
            <span className="ctrl-icon">{isPaused ? '▶' : '❚❚'}</span>
            <span className="ctrl-label">{isPaused ? t('btn_resume') : t('btn_pause')}</span>
          </button>
          <button
            className={`record-btn-round stop-btn ${isRecording ? 'recording' : ''}`}
            onClick={toggleRecording}
            disabled={!isRecording}
            title={t('btn_stop')}
          >
            <div className="record-inner"></div>
            <span className="ctrl-label">{t('btn_stop')}</span>
          </button>
          </>
          )}
        </footer>
        {/* カメラの寄りと前後の切り替え。撮影画面から動かせないと、
            穴に顔が入らないことに撮ってから気づく（2026-08-14、伊波さん
            「顔がデカい人は入らないと指摘、ズーム機能調整（インカメ）」）。
            前後の切り替えもここに置く。設定まで戻らずに直せる */}
        {camOn && !isRecording && (
          <div className="cam-tune">
            <div className="cam-tune-row">
              <button
                className={`cam-face-btn ${camFront ? 'on' : ''}`}
                onClick={() => startCam(true)}
              >🤳 内カメ</button>
              <button
                className={`cam-face-btn ${!camFront ? 'on' : ''}`}
                onClick={() => startCam(false)}
              >📷 外カメ</button>
            </div>
            <div className="cam-tune-row zoom">
              <button className="zoom-btn" onClick={() => setCamZoom(z => Math.max(0.5, +(z - 0.1).toFixed(2)))}>−</button>
              <input
                className="zoom-range"
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={camZoom}
                onChange={e => setCamZoom(Number(e.target.value))}
              />
              <button className="zoom-btn" onClick={() => setCamZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))}>＋</button>
            </div>
            <div className="cam-tune-label">
              顔が入らないときは「−」で引いてね（{Math.round(camZoom * 100)}%）
            </div>
          </div>
        )}
        {isPaused && <div className="pause-badge">{t('paused_badge')}</div>}
        {/* シャッターの光。CSS なので写真にも動画にも入らない */}
        {flash && <div className="shutter-flash" />}

        {/* 左右の柱（音・テロップ）は動画のときだけ。
            写真では飾りを撮ったあとに乗せるので、撮影中に押すものが無い。
            出したままだとズームの操作パネルに柱が重なって、ズームを押した
            つもりで音のボタンを押すことになる（2026-08-14、伊波さん
            「ズーム機能効いてない、ボタン被る」「写真の時は、テキスト
            エフェクトと音ボタンもいらないね」） */}
        {captureKind !== 'photo' && (
        <>
        {/* 左側のエフェクトパネル */}
        <div className="side-panel left" data-role="sound">
          <div className="panel-scroll">
            {/* 自作音の枠（my1 / my2）は 08cf11c で廃止。
                音ファイルの読み込みごと無くなったので、空の枠だけ残しても押せない */}
            {/* 音は3つ（08cf11c「かんたん化」。10個＋自作枠2個から減らした） */}
            {(['clap', 'drum', 'blip'] as const)
              .map(id => (
                <button key={id} className="effect-btn btn-sound" onClick={() => fire(id)}>
                  <RailFace id={id} label={t(('eff_' + id) as never)} />
                </button>
              ))}
            {/* エフェクト3個は柱の下（2026-08-11、伊波さんの指示）。
                グリッチはミラーボールに差し替えた（同コミット） */}
            <button className="effect-btn btn-burst" onClick={() => fire('flash')}>
              <RailFace id="flash" label={t('eff_flash')} />
            </button>
            <button className="effect-btn btn-burst" onClick={() => fire('mirrorball')}>
              <RailFace id="mirrorball" label={t('eff_mirrorball')} />
            </button>
            <button className={`effect-btn btn-burst ${ambientOn ? 'on' : ''}`} onClick={toggleAmbient}>
              <RailFace id="emotional" label={t('eff_emotional')} />
            </button>
          </div>
        </div>

        {/* 右側のテロップパネル */}
        <div className="side-panel right" data-role="telop">
          <div className="panel-scroll">
            {/* 5つとも「自分で決める場所」。全部に番号を出す（08cf11c） */}
            {telops.map((text, i) => {
              const empty = !text.trim();
              return (
                <button
                  key={i}
                  className={'effect-btn btn-telop' + (empty ? ' empty' : '')}
                  onClick={() => (empty ? openSetup('video') : fireTelop(text, telopDark, telopRandom))}
                >
                  <span className="number-icon">{i + 1}</span>
                  {/* 長い言葉は字を小さくして2行にする。ボタンが減って縦に
                      余裕ができたのでできるようになった（08cf11c） */}
                  {!empty && (
                    <span className="btn-label" data-len={text.length >= 5 ? 'long' : undefined}>{text}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        </>
        )}
      </div>

      {/* 開いたときのお願い。平成大プリクラの入口＝ここから枠を選びにいく */}
      {screen === 'agree' && (
        <div className="manner-screen">
          <div className="manner-content">
            {/* 言語は一番最初に選べるようにする。英語で開いた人が、
                読めないまま奥へ進まずに済む（2026-08-13、伊波さん
                「言語切り替えは、トップページへ」） */}
            <div className="lang-switch">
              <button
                className={getLang() === 'ja' ? 'on' : ''}
                onClick={() => { setLang('ja'); location.reload(); }}
              >日本語</button>
              <button
                className={getLang() === 'en' ? 'on' : ''}
                onClick={() => { setLang('en'); location.reload(); }}
              >English</button>
            </div>
            <h2 className="manner-title">{t('manner_title')}</h2>
            <p className="manner-text">{t('manner_text')}</p>
            <button className="manner-agree-btn" onClick={afterAgree}>{t('manner_agree')}</button>
          </div>
        </div>
      )}

      {screen === 'manner' && (
        <div className="sheet-backdrop" onClick={closeGuide}>
          <div className="sheet guide" onClick={e => e.stopPropagation()}>
            <div className="sheet-head"><span>{t('guide_title')}</span></div>

            <ol className="guide-steps">
              <li><b>{t('guide_step1_title')}</b>{'\n'}{t('guide_step1_desc')}</li>
              <li><b>{t('guide_step2_title')}</b>{'\n'}{t('guide_step2_desc')}</li>
              <li><b>{t('guide_step3_title')}</b>{'\n'}{t('guide_step3_desc')}</li>
            </ol>
            <p className="guide-note">{t('guide_photo')}</p>

            <div className="guide-warn">
              <h3>{t('guide_warn_title')}</h3>
              <ul>
                <li>
                  <b>{t('guide_warn3_title')}</b>
                  <details><summary>くわしく</summary>{t('guide_warn3_desc')}</details>
                </li>
                <li><b>{t('guide_warn4_title')}</b></li>
              </ul>
              <p className="guide-note">{t('guide_note1')}</p>
              <p className="guide-note">{t('guide_note2')}</p>
            </div>

            <div className="promo">
              <div className="promo-head">
                <span className="promo-badge">{t('guide_promo_badge')}</span>
                <b>CMCUBE</b>
              </div>
              <p className="promo-lead">{t('guide_promo_lead')}</p>
              {/* promo-fold（max-height 7.6em で折り畳む）を外した。
                  4項目しか無いのに3行で切られ、最後の「枠は30種…」が
                  途中で消えていた（2026-08-13、伊波さん「CMCUBE説明欠けてる」） */}
              <ul className="promo-points">
                <li>{t('guide_promo_p1')}</li>
                <li>{t('guide_promo_p2')}</li>
                <li>{t('guide_promo_p3')}</li>
                <li>{t('guide_promo_p4')}</li>
              </ul>
              <a
                className="promo-link"
                href="https://cmcubevercelapp.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
              >{t('promo_open')}</a>
              <p className="promo-foot">{t('guide_promo_foot')}</p>
            </div>

            <button className="sheet-btn" onClick={closeGuide}>{t('guide_ok')}</button>
          </div>
        </div>
      )}



      {/* 設定。事前準備はすべてここに入れる */}
      {screen === 'setup' && (
        <div className="setup-screen">
          <div className={`setup-header${setupStep === 'frame' ? ' compact' : ''}`}>
            <h2 className="setup-title">
              {/* フレームの段は、小窓の中に「フレームを選ぶ」と出るので
                  上には何も書かない。空けた場所には小窓を上げる
                  （2026-08-13、伊波さん「上の無駄なスペースにモニター置けばいい」） */}
              {setupStep === 'kind' ? 'なにを撮る？'
                : setupStep === 'mode' ? 'どのカメラで撮りますか？'
                : setupStep === 'telop' ? 'スタンプの文字'
                : ''}
            </h2>
            {/* 段階を1つ戻す。前は「撮影画面へ飛ぶ」だけだったので、
                設定の途中で押しても戻れなかった（2026-08-13、伊波さん
                「戻るが戻れない」）。1段目のときだけ撮影画面へ返す */}
            {/* どの段でも同じ場所に出す。段ごとに置き場所が変わると、
                そこにあると思って探せない（2026-08-13、伊波さん
                「フレーム選択の戻るボタン気づかなかったよ？元の場所へ」） */}
            <button className="setup-close-btn" title="もどる" onClick={goBackStep}>戻る</button>
          </div>
          
          <div className="setup-content">
            {/* ① なにを撮りますか？ 選ぶまで他の設定は出さない。
                利き手とアプリの紹介文は、ここでは出さない（毎回読むものではない）。
                利き手は「その他の設定」へ移した（2026-08-13、伊波さん） */}
            {/* ⓪ なにを撮る？ 写真と動画で、このあとの道が分かれる。
                写真は「撮ってから飾る」、動画は「飾ってから撮る」
                （2026-08-14、伊波さん「まず（なにを撮る？）ページ追加」） */}
            {setupStep === 'kind' && (
            <div className="setup-section highlight-section" style={{ marginBottom: 12 }}>
              <h3 className="setup-section-title">なにを撮る？</h3>
              <div className="kind-picker">
                <button
                  className={`kind-btn ${captureKind === 'photo' ? 'on' : ''}`}
                  onClick={() => pickKind('photo')}
                >
                  <span className="kind-icon">📸</span>
                  <span className="kind-title">写真を撮る</span>
                  <span className="kind-note">3枚つづけて撮ります{'\n'}撮ったあとに文字とスタンプで飾れます</span>
                </button>
                <button
                  className={`kind-btn ${captureKind === 'video' ? 'on' : ''}`}
                  onClick={() => pickKind('video')}
                >
                  <span className="kind-icon">🎬</span>
                  <span className="kind-title">動画を撮る</span>
                  <span className="kind-note">先に飾りを決めてから撮ります{'\n'}撮りながらスタンプを出せます</span>
                </button>
              </div>
              <div style={{ textAlign: 'center', padding: '24px 0 0', fontSize: '10px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
                <a href="https://cubicenginestudio.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                  ©２０２６CUBICENGINEstudio
                </a>
              </div>
            </div>
            )}

            {setupStep === 'mode' && (
            <div className="setup-section highlight-section" style={{ marginBottom: 12 }}>
              <h3 className="setup-section-title">どのカメラで撮りますか？</h3>
              {/* カメラ2つが主役。動画ファイルは「持っている人だけ」が使うものなので、
                  同じ列に並べず、下に説明を添えて置く（2026-08-13、伊波さん） */}
              {/* 「インカメ／アウトカメ」では通じない。何が写るかで書く
                  （2026-08-14、伊波さん「cameraの選択がわからない（ユーザー50代から）」） */}
              <div className="source-picker">
                <button className={`source-btn ${camOn && camFront ? 'on' : ''}`} onClick={() => startCam(true)}>
                  <span className="source-icon">🤳</span>
                  <span className="source-text">自分を写す</span>
                  <span className="source-sub">画面side（インカメラ）</span>
                </button>
                <button className={`source-btn ${camOn && !camFront ? 'on' : ''}`} onClick={() => startCam(false)}>
                  <span className="source-icon">📷</span>
                  {/* 「前を写す」だと自分の前なのか画面の前なのか紛れる。
                      呼び名のほうを主にする（2026-08-14、伊波さん
                      「外カメの前の表記は外カメで」） */}
                  <span className="source-text">外カメ</span>
                  <span className="source-sub">まわりの景色を写す</span>
                </button>
              </div>

              {/* 動画ファイルは動画を撮る人だけのもの。写真の道では出さない */}
              {captureKind === 'video' && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <button
                  className={`source-btn ${videoSrc ? 'on' : ''}`}
                  style={{ width: '100%' }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="source-icon">📁</span>
                  <span className="source-text">{videoSrc ? t('setting_video_change') : t('setting_video_load')}</span>
                </button>
                <p style={{ margin: '8px 0 0', fontSize: '12px', lineHeight: 1.5, color: '#e2e8f0', textAlign: 'center' }}>
                  ゲームplayの動画などを予め録画してご用意いただき<br />アップロードしてください
                </p>
              </div>
              )}
              {captureKind === 'video' && videoSrc && (
                <div className="shape-switch" style={{ marginTop: '12px' }}>
                  <button className={!loopVideo ? 'on' : ''} onClick={() => setLoopVideo(false)}>ループしない</button>
                  <button className={loopVideo ? 'on' : ''} onClick={() => setLoopVideo(true)}>ループする🔁</button>
                </div>
              )}
              {/* 選べていないうちは先へ進ませない。押せないボタンを出すより、
                  選んだ瞬間に出すほうが「次に何をするか」が分かる */}
              {(camOn || videoSrc) && (
                <button
                  className="start-btn"
                  style={{ marginTop: 16 }}
                  onClick={() => setSetupStep('frame')}
                >フレームを選ぶ</button>
              )}
              <div style={{ textAlign: 'center', padding: '24px 0 0', fontSize: '10px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
                <a href="https://cubicenginestudio.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                  ©２０２６CUBICENGINEstudio
                </a>
              </div>
            </div>
            )}

            {/* ② フレーム選び。ここが主役 */}
            {setupStep === 'frame' && (
            <div className="setup-section highlight-section">
              {/* 先に縦・横を決める。フレームは形で見え方が変わるので、
                  形が決まってから選ぶほうが分かりやすい（2026-08-13、伊波さん） */}
              {/* 横向きの案内は一番上に出す。形を選んだ後だと、
                  スクロールで流れて読まれない（2026-08-13、伊波さん
                  「横フレーム案内上部へ」） */}
              {(srcIsWide || shape === 'landscape') && (
                <p className="sheet-note" style={{ marginTop: 0, marginBottom: 12 }}>
                  {t('turn_hint')}
                </p>
              )}
              {/* 縦・横の選択は見本一覧のすぐ上へ移した（2026-08-13、伊波さん
                  「縦横の選択を見本のすぐ上に移動もう少し小さく」）。
                  一覧の中身が縦横で切り替わるので、その真上にあるほうが繋がる */}

              {/* 小窓（選んだフレームを大きく映す窓）は廃止した。
                  一覧のタイルで絵が見えるようになったので、二重に見せる
                  必要がなくなった（2026-08-13、伊波さん「もう小窓要らない」） */}

              {/* 「この設定でOK」は一覧の**あと**へ移した。小窓と一覧の間に
                  置くと、選ぶ前から場所を取って一覧を下へ押し、
                  フレームが見えなくなる（2026-08-13、伊波さん
                  「この設定でOKが邪魔してる件も」） */}

              {/* 縦・横。この下の見本一覧が縦横で入れ替わるので、真上に置く。
                  小さくして、主役（小窓）の邪魔をしないようにする */}
              {/* 決定は一覧の**上**。下に置くと129件をスクロールし切らないと
                  見えず、「決定ボタンがない」になる（2026-08-14、伊波さん
                  「フレーム選択ページの決定ボタンをスクロール下からトップへ移動」）。
                  いつも出す。「フレームなし」を選んだ人も進めないと困る */}
              <button
                className="start-btn frame-decide"
                onClick={() => (captureKind === 'photo' ? setScreen('video') : setSetupStep('telop'))}
              >フレーム決定</button>

              <div className="shape-switch shape-switch--mini">
                <button className={shape === 'portrait' ? 'on' : ''} onClick={() => pickShape('portrait')}>{t('setting_shape_port')}</button>
                <button className={shape === 'landscape' ? 'on' : ''} onClick={() => pickShape('landscape')}>{t('setting_shape_land')}</button>
              </div>
              {srcIsWide && (
                <p className="sheet-note" style={{ marginTop: 6 }}>{t('setting_shape_wide_note')}</p>
              )}

              {/* 「フレームを選ぶ」の見出しは小窓の中に入れたので、ここには置かない */}
              {/* タイルの形はクラスで切り替える。CSS 変数（--tile-ar）だと
                  skin 側の指定と競合して効かないことがあった
                  （2026-08-13、伊波さん「これなおしてくれないの？」） */}
              <div className={`frame-picker ${shape === 'portrait' ? 'ar-portrait' : 'ar-landscape'}`}>
                <button 
                  className="frame-tile"
                  onClick={() => customFrameInputRef.current?.click()}
                  style={{ border: '1px dashed #a855f7', background: 'rgba(0,0,0,0.3)' }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '4px' }}>🖼️</div>
                  <span style={{ color: '#a855f7', lineHeight: 1.3 }}>マイフレーム<br />追加</span>
                </button>
                <input type="file" accept="image/png,image/webp" ref={customFrameInputRef} style={{ display: 'none' }} onChange={handleCustomFrameUpload} />
                
                {customFrames.map(cf => (
                  <button
                    key={cf.id}
                    className={`frame-tile ${frameId === cf.id ? 'on' : ''}`}
                    onClick={() => setFrameId(cf.id)}
                    style={{ position: 'relative' }}
                  >
                    <img src={cf.dataUrl} alt="マイフレーム" />
                    <div 
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm('このフレームを削除しますか？')) {
                          await deleteCustomFrame(cf.id);
                          setCustomFrames(prev => prev.filter(p => p.id !== cf.id));
                          if (frameId === cf.id) setFrameId(null);
                        }
                      }}
                      style={{ position: 'absolute', top: 2, right: 2, background: 'red', color: 'white', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >✕</div>
                  </button>
                ))}
                
                <button className={`frame-tile none ${frameId === null ? 'on' : ''}`} onClick={() => setFrameId(null)}>{t('frame_none')}</button>
                {/* いま選んでいる形（縦／横）に合うものだけを出す。
                    全部出すと129件が並び、しかも形の合わないものは端が
                    切れて壊れて見える（2026-08-13、伊波さん「フレームが
                    アホほど入ってるし、壊れてる」） */}
                {FRAMES.filter(f => fitsShape(f, shape)).map(f => (
                  <button
                    key={f.id}
                    className={`frame-tile ${frameId === f.id ? 'on' : ''} ${locked(f) ? 'locked' : ''}`}
                    onClick={() => (locked(f) ? showUnlock() : setFrameId(f.id))}
                    title={locked(f) ? t('locked_hint') : f.name}
                  >
                    <img src={f.file + '?v=20260813_raw'} alt={f.name} />
                    {locked(f) && <span className="lock-mark">{t('frame_locked')}</span>}
                    {/* タイルは絵だけ。名前は出さない（2026-08-12、伊波さん「絵だけの方が
                      見やすいよ」）。読み上げ用に img の alt には残してある */}
                  </button>
                ))}
              </div>

              {/* 決定ボタンは一覧の**上**へ移した（2026-08-14）。
                  ここに二重で置かない */}

              {/* 買い切りの解除。鍵のかかった枠を見る直前に、何が解けるのかを
                  読めるようにする（「こまかい設定」を廃したのでここへ移した） */}
              <div className={`unlock-box ${unlocked ? 'done' : ''}`} ref={unlockRef}>
                {unlocked ? (
                  <>
                    <b className="unlock-done">{t('unlock_done')}</b>
                    <p className="sheet-note">{t('unlock_done_note')}</p>
                    {savedKey() && <p className="unlock-key">{savedKey()}</p>}
                    <button
                      className="unlock-relock"
                      onClick={() => { relock(); setUnlocked(false); }}
                    >{t('unlock_relock')}</button>
                  </>
                ) : (
                  <>
                    <b className="unlock-title">{t('unlock_title')}</b>
                    <p className="sheet-note">{t('unlock_lead')}</p>
                    <ul className="unlock-points">
                      <li>{t('unlock_p1')}</li>
                      <li>{t('unlock_p2')}</li>
                    </ul>
                    <a className="unlock-buy" href={buyUrl} target="_blank" rel="noopener noreferrer">{t('unlock_buy')}</a>
                    <div className="unlock-row">
                      <input
                        className="unlock-input"
                        value={keyInput}
                        placeholder={t('unlock_place')}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        onChange={e => { setKeyInput(e.target.value); setKeyNG(false); }}
                      />
                      <button className="unlock-go" onClick={submitKey}>{t('unlock_go')}</button>
                    </div>
                    {keyNG && <p className="unlock-ng">{t('unlock_ng')}</p>}
                  </>
                )}
              </div>

              {/* 下の大きな「もどる」は削除。ヘッダー右上に「戻る」があり
                  二重だった（2026-08-13、伊波さん「1番下に謎の大きな戻る
                  ボタンあったよ」） */}
            </div>
            )}

            {/* ④ スタンプ（テロップ）。フレームの次に聞く。
                言葉と「どう出るか」は同じ場所で決めたい（2026-08-13、伊波さん
                「次（スタンプテキスト変更しますか？」「テキストの出現の仕方忘れずに」） */}
            {setupStep === 'telop' && (
            <div className="setup-section highlight-section">
              <h3 className="setup-section-title">スタンプの文字を変えますか？</h3>
              <p className="sheet-note">{t('setting_telop_note')}</p>
              <div className="telop-inputs">
                {myTelops.map((text, i) => (
                  <div className="telop-row" key={i}>
                    <span className="slot-no telop">{i + 1}</span>
                    <input
                      className="telop-input"
                      value={text}
                      maxLength={20}
                      onChange={e => setTelop(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              <h3 className="setup-section-title" style={{ marginTop: 20 }}>{t('setting_teloppos')}</h3>
              <div className="shape-switch">
                <button className={!telopRandom ? 'on' : ''} onClick={() => pickTelopPos(false)}>{t('telop_center')}</button>
                <button className={telopRandom ? 'on' : ''} onClick={() => pickTelopPos(true)}>{t('telop_random')}</button>
              </div>

              <h3 className="setup-section-title" style={{ marginTop: 20 }}>{t('setting_telopcolor')}</h3>
              <div className="shape-switch">
                <button className={!telopDark ? 'on' : ''} onClick={() => pickTelopColor(false)}>{t('telop_white')}</button>
                <button className={telopDark ? 'on' : ''} onClick={() => pickTelopColor(true)}>{t('telop_black')}</button>
              </div>

              <button
                className="start-btn"
                style={{ marginTop: 20, width: '100%' }}
                onClick={() => setScreen('video')}
              >この設定で撮る</button>
              {/* 「こまかい設定」への脇道は無くした。中身は他の段と重複して
                  いたか、この流れの中に置ける（2026-08-13、伊波さん
                  「細かい設定にまとめるものなんてないよ？」「全部誘導線に乗せる」） */}
              {/* 同上。戻るはヘッダーに一本化 */}

              {/* 言語の切り替えは一番最初の画面（agree）へ移した。
                  英語で開いた人が、読める場所で切り替えられるように
                  （2026-08-13、伊波さん「言語切り替えは、トップページへ」） */}

              {/* 利き手。録画ボタンを持つ手に合わせる */}
              <h3 className="setup-section-title" style={{ marginTop: 20 }}>ボタンの位置</h3>
              <div className="hand-setting">
                <label><input type="radio" name="hand" value="right" checked={hand === 'right'} onChange={() => setHand('right')} /> 右</label>
                <label><input type="radio" name="hand" value="left" checked={hand === 'left'} onChange={() => setHand('left')} /> 左</label>
              </div>

              {/* 動画の音の扱い。動画を読み込んだ人にだけ関わる */}
              {videoSrc && (
                <>
                  <h3 className="setup-section-title" style={{ marginTop: 20 }}>{t('setting_srcaudio')}</h3>
                  <p className="sheet-note">{t('srcaudio_note')}</p>
                  <div className="shape-switch">
                    <button className={useSrcAudio === 'mic' ? 'on' : ''} onClick={() => pickSrcAudio('mic')}>{t('srcaudio_mic')}</button>
                    <button className={useSrcAudio === 'mix' ? 'on' : ''} onClick={() => pickSrcAudio('mix')}>{t('srcaudio_mix')}</button>
                    <button className={useSrcAudio === 'off' ? 'on' : ''} onClick={() => pickSrcAudio('off')}>{t('srcaudio_off')}</button>
                  </div>
                </>
              )}
            </div>
            )}

            {/* ③ その他の設定。普段は開かなくていいものを全部ここへ */}
          </div>
          {/* 画面の下に居座る「この設定で撮る！」は外した。
              3段階に分ける前の名残で、どの段階にいても撮影画面へ飛ぶため、
              フレームを選んでいる途中でも押せて意味が分からなかった
              （2026-08-13、伊波さん「この設定で撮るはどうゆうこと？」）。
              いまは各段階の中に「撮る」を置いてある */}
        </div>
      )}

      {/* 写真の編集。撮ってから飾る（2026-08-14、伊波さん
          「写真→テキスト変更→デコる→保存」）。
          テキストの段は動画側と別に持つ。静止画に「出現の仕方」は無いので、
          そのぶんを色に置き換えてある */}
      {screen === 'photo' && shots.length > 0 && (
        <div className="setup-screen photo-screen">
          <div className="setup-header compact">
            {/* 題は出さない。下の見出し（「好きな言葉を入れてね」など）で
                何をする画面かは分かるので、二重になっていた。
                写真を大きく見せる場所を空けるほうが役に立つ
                （2026-08-14、伊波さんのスクショ「削除」） */}
            <h2 className="setup-title" />
            <button
              className="setup-close-btn"
              title="もどる"
              onClick={() => (photoStep === 'deco' ? setPhotoStep('text') : retakePhotos())}
            >{photoStep === 'deco' ? '戻る' : '撮り直す'}</button>
          </div>

          <div className="setup-content">
            {/* 大きい1枚。ここに乗せたものが写真に焼かれる */}
            <div
              className={`shot-big ${penOn ? 'pen-on' : ''}`}
              ref={bigShotRef}
              onPointerDown={penDown}
              onPointerMove={penMove}
              onPointerUp={penUp}
              onPointerCancel={penUp}
              onPointerLeave={penUp}
            >
              <img src={shots[activeShot]} alt={`${activeShot + 1}枚目`} />
              {/* らくがきの線。写真の上に重ねる。
                  vector-effect を使わず、太さも割合で持つ（拡大しても崩れない） */}
              <svg
                className="pen-layer"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                {/* 太さは viewBox（0〜100）の中の値。写真の幅に対する割合に
                    なるので、画面の大きさが変わっても見た目の太さが変わらない */}
                {decos.filter(d => d.shot === activeShot && d.kind === 'pen' && d.points).map(d => (
                  <path
                    key={d.id}
                    d={toPath(d.points!)}
                    fill="none"
                    stroke={d.color}
                    strokeWidth={d.size}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {/* いま引いている最中の線 */}
                {drawing && drawing.length > 1 && (
                  <path
                    d={toPath(drawing)}
                    fill="none"
                    stroke={penColor}
                    strokeWidth={penWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
              {decos.filter(d => d.shot === activeShot && d.kind !== 'pen').map(d => (
                <div
                  key={d.id}
                  className={`deco deco-${d.kind} ${dragId === d.id ? 'dragging' : ''}`}
                  style={{
                    left: `${d.x}%`,
                    top: `${d.y}%`,
                    // 中央へ寄せてから回す。回してから寄せると位置がずれる
                    transform: `translate(-50%, -50%) rotate(${d.angle}deg)`,
                    fontSize: `${d.size}cqw`,
                    color: d.kind === 'text' ? d.color : undefined,
                    fontFamily: d.kind === 'text' ? (d.font ?? PHOTO_FONT) : undefined,
                    // 白い文字は白い服に沈むので、必ず縁を付ける
                    WebkitTextStroke: d.kind === 'text'
                      ? `0.08em ${d.color === '#ffffff' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.9)'}`
                      : undefined,
                    paintOrder: 'stroke fill',
                  } as React.CSSProperties}
                  onPointerDown={startDrag(d.id)}
                >
                  {d.value}
                  {/* 消す口。置いてから要らなくなったものを外せないと詰む */}
                  <button
                    className="deco-x"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => setDecos(prev => prev.filter(x => x.id !== d.id))}
                  >✕</button>
                </div>
              ))}
            </div>

            {/* 待機の2枚。**いま出している1枚はここに出さない。**
                大きく出ているものを小さくもう一度並べると、同じ絵が2つ出て
                どちらを触ればいいのか分からなくなる（2026-08-14、伊波さん
                「実際は３まいだから待機させてる写真は小さきく、
                出してる1枚待機2枚」）。
                タップで大きいほうと入れ替える */}
            <div
              className="shot-strip"
              style={{ '--shot-ar': shape === 'portrait' ? '9 / 16' : '16 / 9' } as React.CSSProperties}
            >
              {shots.map((s, i) => (i === activeShot ? null : (
                <button
                  key={i}
                  className="shot-thumb"
                  onClick={() => setActiveShot(i)}
                >
                  <img src={s} alt={`${i + 1}枚目`} />
                  <span className="shot-no">{i + 1}</span>
                  {decos.some(d => d.shot === i) && <span className="shot-dot">●</span>}
                </button>
              )))}
            </div>

            {photoStep === 'text' && (
              <div className="setup-section highlight-section">
                {/* 入れた文字は、絵のスタンプと同じで指で動かせる。
                    「言葉を入れる」だと入力欄にしか見えず、それが伝わらない。
                    スタンプが作れる場所だと先に言う（2026-08-14、伊波さん
                    「テキスト入力（好きな文字でスタンプ作れるよ」） */}
                {/* 説明は別の行に置かず、入力欄の透かしに入れる。
                    見出しと説明で2行使うと、そのぶん写真が下へ押される
                    （2026-08-14、伊波さん「説明じゃなくテクスト入力欄の
                    透かしに説明」） */}
                <h3 className="setup-section-title">らくがきスタンプ</h3>
                <div className="telop-row">
                  <input
                    className="telop-input"
                    value={photoText}
                    maxLength={20}
                    placeholder="好きな言葉でスタンプ作れるよ"
                    onChange={e => setPhotoText(e.target.value)}
                  />
                </div>

                {/* 書体。見本をその書体で出す。名前だけ並べても違いが分からない */}
                <h3 className="setup-section-title" style={{ marginTop: 16 }}>文字の形</h3>
                <div className="font-picker">
                  {PHOTO_FONTS.map(f => (
                    <button
                      key={f.id}
                      className={`font-btn ${photoFontId === f.id ? 'on' : ''}`}
                      style={{ fontFamily: f.css }}
                      onClick={() => {
                        setPhotoFontId(f.id);
                        // 置いてある文字も一緒に変える。置き直しをさせない
                        setDecos(prev => prev.map(d =>
                          d.shot === activeShot && d.kind === 'text' ? { ...d, font: f.css } : d));
                      }}
                    >{f.name}</button>
                  ))}
                </div>

                {/* 傾き。プリクラの落書きは斜めに入れるもの */}
                <h3 className="setup-section-title" style={{ marginTop: 16 }}>文字の傾き</h3>
                <div className="angle-row">
                  <button
                    className="zoom-btn"
                    onClick={() => setPhotoAngle(a => {
                      const n = Math.max(-45, a - 5);
                      setDecos(prev => prev.map(d =>
                        d.shot === activeShot && d.kind === 'text' ? { ...d, angle: n } : d));
                      return n;
                    })}
                  >↺</button>
                  <input
                    className="zoom-range"
                    type="range"
                    min={-45}
                    max={45}
                    step={1}
                    value={photoAngle}
                    onChange={e => {
                      const n = Number(e.target.value);
                      setPhotoAngle(n);
                      setDecos(prev => prev.map(d =>
                        d.shot === activeShot && d.kind === 'text' ? { ...d, angle: n } : d));
                    }}
                  />
                  <button
                    className="zoom-btn"
                    onClick={() => setPhotoAngle(a => {
                      const n = Math.min(45, a + 5);
                      setDecos(prev => prev.map(d =>
                        d.shot === activeShot && d.kind === 'text' ? { ...d, angle: n } : d));
                      return n;
                    })}
                  >↻</button>
                </div>
                <p className="sheet-note" style={{ textAlign: 'center' }}>{photoAngle}度</p>

                <h3 className="setup-section-title" style={{ marginTop: 16 }}>文字の色</h3>
                <div className="color-picker">
                  {TEXT_COLORS.map(c => (
                    <button
                      key={c}
                      className={`color-dot ${photoTextColor === c ? 'on' : ''}`}
                      style={{ background: c }}
                      onClick={() => {
                        setPhotoTextColor(c);
                        // すでに置いた文字の色も一緒に変える。
                        // 置き直しをさせない
                        setDecos(prev => prev.map(d =>
                          d.shot === activeShot && d.kind === 'text' ? { ...d, color: c } : d));
                      }}
                      title={c}
                    />
                  ))}
                </div>

                <button
                  className="start-btn"
                  style={{ marginTop: 16, width: '100%' }}
                  onClick={() => { addDeco('text', photoText); setPhotoText(''); }}
                  disabled={!photoText.trim()}
                >この文字でスタンプを作る</button>

                <button
                  className="start-btn"
                  style={{ marginTop: 10, width: '100%' }}
                  onClick={() => setPhotoStep('deco')}
                >つぎ（デコる）へ</button>
              </div>
            )}

            {photoStep === 'deco' && (
              <div className="setup-section highlight-section">
                {/* スタンプと手描きを1つの画面で切り替える
                    （2026-08-14、伊波さん「らくがきスタンプとスタンプ
                    同じ画面で切り替えできるように」）。
                    別画面に分けると、貼ってから描くたびに行き来することになる。
                    ここを「らくがき」と呼ばないのは、文字の画面の見出しが
                    「らくがきスタンプ」になったため。同じ言葉で別のものを
                    指すと、どちらの話か分からなくなる */}
                <div className="deco-tabs">
                  <button
                    className={`deco-tab ${!penOn ? 'on' : ''}`}
                    onClick={() => setPenOn(false)}
                  >🎀 スタンプ</button>
                  <button
                    className={`deco-tab ${penOn ? 'on' : ''}`}
                    onClick={() => setPenOn(true)}
                  >✏️ 手描き</button>
                </div>

                {!penOn ? (
                <>
                <p className="sheet-note">押すと写真の真ん中に出ます。指でつまんで動かせます</p>
                <div className="stamp-picker">
                  {STAMPS.map(s => (
                    <button key={s} className="stamp-btn" onClick={() => addDeco('stamp', s)}>{s}</button>
                  ))}
                </div>

                <h3 className="setup-section-title" style={{ marginTop: 16 }}>大きさ</h3>
                <div className="shape-switch">
                  <button onClick={() => setDecos(prev => prev.map(d =>
                    d.shot === activeShot && d.kind !== 'pen' ? { ...d, size: Math.max(4, +(d.size - 2).toFixed(1)) } : d))}>小さく</button>
                  <button onClick={() => setDecos(prev => prev.map(d =>
                    d.shot === activeShot && d.kind !== 'pen' ? { ...d, size: Math.min(40, +(d.size + 2).toFixed(1)) } : d))}>大きく</button>
                </div>
                </>
                ) : (
                <>
                <p className="sheet-note">写真を指でなぞると線が引けます</p>

                <h3 className="setup-section-title" style={{ marginTop: 12 }}>ペンの色</h3>
                <div className="color-picker">
                  {TEXT_COLORS.map(c => (
                    <button
                      key={c}
                      className={`color-dot ${penColor === c ? 'on' : ''}`}
                      style={{ background: c }}
                      onClick={() => setPenColor(c)}
                      title={c}
                    />
                  ))}
                </div>

                <h3 className="setup-section-title" style={{ marginTop: 16 }}>ペンの太さ</h3>
                <div className="angle-row">
                  <button className="zoom-btn" onClick={() => setPenWidth(w => Math.max(0.4, +(w - 0.4).toFixed(1)))}>細</button>
                  <input
                    className="zoom-range"
                    type="range"
                    min={0.4}
                    max={5}
                    step={0.2}
                    value={penWidth}
                    onChange={e => setPenWidth(Number(e.target.value))}
                  />
                  <button className="zoom-btn" onClick={() => setPenWidth(w => Math.min(5, +(w + 0.4).toFixed(1)))}>太</button>
                </div>
                {/* いまの太さと色を、その場で見せる */}
                <div className="pen-preview">
                  <svg viewBox="0 0 100 16" preserveAspectRatio="none">
                    <path d="M4,8 Q26,1 50,8 T96,8" fill="none" stroke={penColor}
                      strokeWidth={penWidth} strokeLinecap="round" />
                  </svg>
                </div>

                <button
                  className="start-btn"
                  style={{ marginTop: 14, width: '100%' }}
                  onClick={undoPen}
                  disabled={!decos.some(d => d.shot === activeShot && d.kind === 'pen')}
                >1本もどす</button>
                </>
                )}

                <button
                  className="start-btn"
                  style={{ marginTop: 16, width: '100%' }}
                  onClick={() => setDecos(prev => prev.filter(d => d.shot !== activeShot))}
                  disabled={!decos.some(d => d.shot === activeShot)}
                >この写真の飾りを全部消す</button>

                <button
                  className="start-btn save-btn"
                  style={{ marginTop: 10, width: '100%' }}
                  onClick={savePhotoSheet}
                >3枚を保存する</button>

                <button
                  className="start-btn"
                  style={{ marginTop: 10, width: '100%' }}
                  onClick={retakePhotos}
                >撮り直す</button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

export default App
