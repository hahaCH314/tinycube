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
  }>({ video: null, fill: false, shape: 'landscape', frame: null, watermark: 'tinyCUBE', mirror: false });
  
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
  const [screen, setScreen] = useState<'agree' | 'manner' | 'setup' | 'video'>('agree');
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
  const [setupStep, setSetupStep] = useState<'mode' | 'frame' | 'telop'>('mode');
  // 枠選び（frame）と素材選び（source）は setup に統合したので、戻り先は video だけ
  const [backTo, setBackTo] = useState<'video'>('video');
  // 2回目以降は「フレームだけ選び直す」ことが多いので、開いたら
  // フレーム選びから始める（毎回1段目を踏ませない）
  const openSetup = (from: 'video') => { setBackTo(from); setSetupStep('frame'); setScreen('setup'); };
  // 設定の段階を1つ戻す。1段目まで来たら撮影画面へ返す。
  // ヘッダーと小窓の中の両方から呼ぶので、処理はここに1つだけ置く
  const goBackStep = () => {
    if (setupStep === 'telop') setSetupStep('frame');
    else if (setupStep === 'frame') setSetupStep('mode');
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
          <button className="preview-btn-round" onClick={() => setScreen('setup')} disabled={isRecording} title="設定に戻る">
            <span className="ctrl-icon">↺</span>
            <span className="ctrl-label">設定</span>
          </button>
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
          {/* 録画スタート。撮っている間は出さない（停止と別のボタンにする）。
              前は赤い丸1つが押すたびに意味を変えていて、見ても始まるのか
              止まるのか分からなかった（2026-08-13、伊波さん「停止ボタン追加」） */}
          {!isRecording && (
            <button
              className="record-btn-round"
              onClick={toggleRecording}
              title={t('btn_record')}
            >
              <div className="record-inner"></div>
              <span className="ctrl-label">{t('btn_record')}</span>
            </button>
          )}
          {/* 撮っている間だけ「一時停止」と「停止」を出す */}
          {isRecording && (
            <>
              <button
                className={`pause-btn-round ${isPaused ? 'on' : ''}`}
                onClick={togglePause}
                disabled={!canPause}
                title={!canPause ? t('pause_na') : isPaused ? t('btn_resume') : t('btn_pause')}
              >
                <span className="ctrl-icon">{isPaused ? '▶' : '❚❚'}</span>
                <span className="ctrl-label">{isPaused ? t('btn_resume') : t('btn_pause')}</span>
              </button>
              <button
                className="record-btn-round recording"
                onClick={toggleRecording}
                title={t('btn_stop')}
              >
                <div className="record-inner"></div>
                <span className="ctrl-label">{t('btn_stop')}</span>
              </button>
            </>
          )}
        </footer>
        {isPaused && <div className="pause-badge">{t('paused_badge')}</div>}
        {/* シャッターの光。CSS なので写真にも動画にも入らない */}
        {flash && <div className="shutter-flash" />}

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
              <ul className="promo-points promo-fold">
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
              {setupStep === 'mode' ? 'なにを撮りますか？'
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
            {setupStep === 'mode' && (
            <div className="setup-section highlight-section" style={{ marginBottom: 12 }}>
              <h3 className="setup-section-title">なにを撮りますか？</h3>
              {/* カメラ2つが主役。動画ファイルは「持っている人だけ」が使うものなので、
                  同じ列に並べず、下に説明を添えて置く（2026-08-13、伊波さん） */}
              <div className="source-picker">
                <button className={`source-btn ${camOn && camFront ? 'on' : ''}`} onClick={() => startCam(true)}>
                  <span className="source-icon">🤳</span>
                  <span className="source-text">{t('cam_front')}</span>
                </button>
                <button className={`source-btn ${camOn && !camFront ? 'on' : ''}`} onClick={() => startCam(false)}>
                  <span className="source-icon">📷</span>
                  <span className="source-text">{t('cam_back')}</span>
                </button>
              </div>

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
              {videoSrc && (
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

              {/* 選んだフレームを上に映す。これが無いと、選んだものが
                  どんな絵なのか分からないまま撮りに行くことになる
                  （2026-08-13、伊波さん「選んだフレームを上に映したとこで、
                  この設定で撮る」）。カメラ映像は出さない（起動が重くなる） */}
              <div
                className="frame-preview"
                style={{
                  aspectRatio: shape === 'portrait' ? '9 / 16' : '16 / 9',
                  maxHeight: '38vh',
                  margin: '0 auto 16px',
                  borderRadius: 12,
                  overflow: 'hidden',
                  background: '#000',
                  position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {/* 「戻る」は小窓の中に入れていたが、**気づかれなかった**ので
                    ヘッダー（他の段と同じ場所）へ戻した。置き場所が段ごとに
                    変わると、そこにあると思って探せない
                    （2026-08-13、伊波さん「フレーム選択の戻るボタン
                    気づかなかったよ？元の場所へ」） */}
                {(() => {
                  // FRAMES だけを見ると、マイフレーム（自分で入れた絵）を選んだとき
                  // 見つからず、前に選んでいた絵が残って見える。
                  // 429 行で組み立てている frame は両方に対応している
                  // （2026-08-13、伊波さん「選んだフレームと違う絵が出る」）
                  const f = frame;
                  if (!f) {
                    // 何も選んでいないときは、この小窓そのものが案内になる。
                    // 見出しを別に置くより、選んだ絵が出る場所に書いてあるほうが
                    // 何をすればいいか分かる（2026-08-13、伊波さん）
                    return (
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.05em' }}>
                        フレームを選ぶ
                      </span>
                    );
                  }
                  return (
                    <>
                      {/* 一覧のタイルと同じ URL で読む。片方だけ ?v= を付けると
                          別物として扱われ、古い絵が出ることがある */}
                      {f.bgFile && (
                        <img src={f.bgFile + '?v=20260813_raw'} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                      <img
                        key={f.id}
                        src={f.file.startsWith('data:') ? f.file : f.file + '?v=20260813_raw'}
                        alt={f.name}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                    </>
                  );
                {/* 「この設定でOK」は小窓の**中**（下端）に重ねる。
                    外に置くと、その高さぶん小窓が押し上げられて隠れてしまう。
                    小窓は老眼の方がフレームを見て決めるためのものなので、
                    大きさを削ってはいけない（2026-08-13、伊波さん
                    「フレーム選んだらすぐ次の動線案内でモニター（小窓）隠れる」
                    「小窓がなぜ必要か？老眼の人向けにフレームを見て
                    決めてもらうため」） */}
                })()}
              </div>

              {/* 小窓の**下**に出す。中に重ねると、せっかく選んだ絵の上に
                  かぶって見えなくなる（2026-08-13、伊波さん
                  「小窓の中じゃなく、下に出る」） */}
              {frameId !== null && (
                <button
                  className="start-btn"
                  style={{ width: '100%', marginBottom: 12, minHeight: 44, fontSize: 14, padding: '0 16px' }}
                  onClick={() => setSetupStep('telop')}
                >この設定でOK</button>
              )}

              {/* 縦・横。この下の見本一覧が縦横で入れ替わるので、真上に置く。
                  小さくして、主役（小窓）の邪魔をしないようにする */}
              <div className="shape-switch shape-switch--mini">
                <button className={shape === 'portrait' ? 'on' : ''} onClick={() => pickShape('portrait')}>{t('setting_shape_port')}</button>
                <button className={shape === 'landscape' ? 'on' : ''} onClick={() => pickShape('landscape')}>{t('setting_shape_land')}</button>
              </div>
              {srcIsWide && (
                <p className="sheet-note" style={{ marginTop: 6 }}>{t('setting_shape_wide_note')}</p>
              )}

              {/* 「フレームを選ぶ」の見出しは小窓の中に入れたので、ここには置かない */}
              <div className="frame-picker" style={{ '--tile-ar': shape === 'portrait' ? '9 / 16' : '16 / 9' } as React.CSSProperties}>
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

              <button
                className="start-btn"
                style={{ marginTop: 16, width: '100%', background: 'rgba(255,255,255,0.12)' }}
                onClick={() => setSetupStep('mode')}
              >もどる</button>
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
              <button
                className="start-btn"
                style={{ marginTop: 8, width: '100%', background: 'rgba(255,255,255,0.12)' }}
                onClick={() => setSetupStep('frame')}
              >もどる</button>

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

    </div>
  )
}

export default App
