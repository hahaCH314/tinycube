import { useState, useRef, useEffect } from 'react'
import '../docs/tinycube-skin-shibuya.css'
import './setup.css'
import { startRecording, startStage, type RecordHandle, type OutShape } from './recorder'
import { FRAMES, loadFrame, type Frame, type FrameAnchor, type FaceHole } from './frames'
import { fireEffect, fireTelop, setAmbient, type EffectId } from './effects'
import { t, getLang } from './i18n'
import { isUnlocked, tryUnlock, savedKey, relock } from './unlock'
import { saveCustomFrame, getCustomFrames, deleteCustomFrame, type CustomFrameRecord } from './idb'

// ---- 開いたときのお願い（2026-08-12、伊波さんの原文） -------------------
//
// この文章は伊波さんが書いたもの。要約・言い換え・整形をしないこと。
// 改行も原文のまま。CSS 側（.manner-text）に white-space: pre-line を
// 当ててあるので、<br> を入れずにこの文字列をそのまま流し込めば改行が出る。
// 変えるときは伊波さんに確認してから、docs/tinycube-update-scope.md も直す。
const MANNER_TEXT = `このアプリケーションは
みなさんの日常を切り取る
動画＆写真撮影アプリです
SNSへの投稿等及び、二次使用は
自由に行えます
みなさんの愛のあるご利用を
お願いすると共に
このアプリが誹謗中傷や
誰かを傷つける道具と
なりませんよう
お願い申し上げます`;

// ---- シティポップの絵柄（2026-08-11、伊波さんの指示） -------------------
//
// 左の柱。上2つの「1」「2」は、自分の音を入れる枠
// （2026-08-11、伊波さん「音１，２がユーザーが追加できる機能」）。
// 番号は「あなたが決める場所」の印で、覚えやすさのための番号ではない。
// 3つめからは80年代の小物を、音の意味に合わせて並べる。
// 絵だけにはしない。何のボタンか分からなくなるので、小さな言葉を必ず下に置く
// 並び順を変えても絵柄がずれないよう、番号ではなくボタンの名前で引く
const RAIL_ICONS: Record<string, string> = {
  // 音は3つだけ（2026-08-13、伊波さんの指示）
  clap: '💗',                // 拍手     … 喝采
  drum: '📻',                // ドラム   … ラジカセ
  blip: '📼',                // 電子音   … 小さな機械の音
  // 🪩 はミラーボールへ渡した。
  // 📷 は下のバーの「写真」ボタンが使っているので、こちらでは使わない。
  // 同じ絵が2か所にあると、どちらが何のボタンか分からなくなる
  // （2026-08-13、伊波さん「写真はエフェクトと絵が被るし分かりづらい」）
  flash: '💥',               // フラッシュ … 白く弾ける
  mirrorball: '🪩',          // ミラーボール … 光の粒が回りながら流れる
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

// テロップの絵柄。吹き出しと、コミック風のギザギザを交互に出す

/** この画面を読み込んだ時刻。開発中だけロゴの隣に出す。
 *  スマホは古い中身を握り続けることがあり、直したのに「何も変わらない」に
 *  見える。ここが変われば新しい中身が届いている（2026-08-13、伊波さん） */
const LOADED_AT = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

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
  // テキストは5つ。全部が自分で変えられる
  // （2026-08-13、伊波さん「テキストは予め入っているが、ユーザーが変更できるよう
  // 誘導線に置く（ボタン数５に減らす）」）。
  //
  // 前は「自分の3つ＋決め打ち9つ＝12個」で、決め打ちのほうは変えられなかった。
  // 12個は対象（40〜50代と子ども）には多すぎるうえ、
  // 変えられるものと変えられないものが混ざっていて見分けがつかなかった
  const TELOP_MINE = 5;
  const [myTelops, setMyTelops] = useState<string[]>(() => {
    // 空にはしない。指示は「テキストは予め入っている」。
    // 最初から言葉が入っていれば、押せば何が起きるかがすぐ分かる
    // 2026-08-13、伊波さんが決めた5つ
    const base = ['尊い', 'は？', 'やば', 'パーティータイム', 'チョベリグー'];
    try {
      // キーを v2 にしてある。前の3つぶんの配列をそのまま読むと、
      // 4・5番目だけ既定に戻る（2026-08-13）
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
  const pickShape = (v: OutShape) => { shapePicked.current = true; setShape(v); };
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

  // 動画を撮るのか、写真を撮るのか。設定のいちばん最初に聞く
  // （2026-08-13、伊波さん「最初の設定で動画撮りますか？写真撮りますか？って聞く」）。
  //
  // 先に決めておくと、撮影画面に出すボタンを片方だけにできる。
  // 対象は40〜50代と子どもなので、使わないボタンは見せないほうがいい。
  // null のあいだは、まだ選んでいない＝設定の続きを出さない
  const [mode, setMode] = useState<'video' | 'photo' | null>(null);
  // 初めて撮影画面に来た人に、押す場所だけ示すための旗
  const [startHint, setStartHint] = useState(false);
  // 撮る前の数え。押した瞬間に始まると構える間がない
  // （2026-08-12、伊波さん「動画、camera共にカウント入れたら？３秒ぐらい」）。
  // 動画でもカメラでも同じように数える
  const [countdown, setCountdown] = useState<number | null>(null);
  // 設定を閉じたときに、どこへ戻すか。来た場所へ返さないと迷子になる
  // （2026-08-12、伊波さん「戻るボタンがほしいね」）
  // 枠選び（frame）と素材選び（source）は setup に統合したので、戻り先は video だけ
  const [backTo, setBackTo] = useState<'video'>('video');
  const openSetup = (from: 'video') => { setBackTo(from); setScreen('setup'); };
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

  // 効果音の読み込み（sounds.ts）は廃止した
  // （2026-08-13、伊波さん「音ぼファイル挿入廃止」）。
  // 鳴るのは effects.ts が作る3つの音だけなので、起動時の読み直しも要らない

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
  // 連写の何枚目か。押しているあいだ画面に出す（「1 / 3」）。
  // 出さないと、3枚撮り終わる前にもう一度押されてしまう
  const [burst, setBurst] = useState<number | null>(null);

  /** 1枚だけ撮って保存する。連写もこれを繰り返すだけ */
  const shootOnce = async () => {
    const c = canvasRef.current;
    if (!c) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 220);
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.92));
    if (blob) await save(blob, 'jpg');
  };

  // 写真は自動で3枚。ゆっくり撮る
  // （2026-08-13、伊波さん「写真は自動で３枚連写（ゆっくり）とか」）。
  //
  // プリクラと同じで、1回押したら3枚撮れて終わり。押す回数が減るぶん、
  // 「押せたかどうか」で迷う場面も減る。
  // 速い連写だと3枚とも同じ顔になるので、間を空けてポーズを変えられるようにする
  const BURST_COUNT = 3;
  const BURST_GAP = 1600;          // 枚と枚のあいだ（ミリ秒）
  const shoot = async () => {
    const c = canvasRef.current;
    if (!c) return;
    if (!videoSrc && !camOn) { alert(t('alert_load_first')); return; }
    if (burst !== null) return;     // 連写中の二度押しは受けない
    for (let n = 1; n <= BURST_COUNT; n++) {
      setBurst(n);
      await shootOnce();
      // 最後の1枚のあとは待たない
      if (n < BURST_COUNT) await new Promise(r => setTimeout(r, BURST_GAP));
    }
    setBurst(null);
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
            {/* 写真モードのときに「動画を読み込み」と出ると、何をすればいいか
                分からなくなる（2026-08-13）。写真はカメラで撮るものなので、
                設定へ戻ってカメラを入れてもらう */}
            <p>{mode === 'photo' ? '設定からカメラを選んでください' : t('upload_hint')}</p>
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
              <span style={{ fontSize: '10px', opacity: 0.9, marginLeft: '6px', fontFamily: 'monospace', color: '#0f0' }}>
                {LOADED_AT}
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
            <button className="tool-btn-small discord-btn" onClick={() => window.open('https://discord.gg/wVnyfnv7d', '_blank')} title="公式Discord">👾</button>
          </div>
        </header>

        {/* 下のバー。
            録画・停止・一時停止は、それぞれ別のボタンとして出す
            （2026-08-13、伊波さんの指示）。前は録画ボタン1つが押すたびに
            意味を変える作りで、赤い丸を見ても「いま押すと始まるのか止まるのか」が
            分からなかった。対象は40〜50代と子どもなので、
            **いま押せるボタンだけを出して、必ず言葉を添える**。
            録画していないとき：撮り直す／写真／録画スタート
            録画しているとき　：一時停止／停止 */}
        <footer className="bottom-controls">
          {!isRecording ? (
            <>
              <button className="preview-btn-round" onClick={() => setScreen('setup')} title="設定に戻る">
                <span className="ctrl-icon">↺</span>
                <span className="ctrl-label">やり直す</span>
              </button>
              {/* 設定で選んだほうだけ出す。使わないボタンは見せない
                  （2026-08-13、伊波さん「最初の設定で動画？写真？って聞く」）。
                  mode が null なのは、設定を通らずに来た場合の保険。両方出す */}
              {mode !== 'video' && (
                <button
                  className="photo-btn-round"
                  onClick={shoot}
                  disabled={(!videoSrc && !camOn) || burst !== null}
                >
                  <span className="ctrl-icon">📷</span>
                  <span className="ctrl-label">
                    {burst !== null ? `${burst} / ${BURST_COUNT}枚目` : '写真（3枚）'}
                  </span>
                </button>
              )}
              {mode !== 'photo' && (
                <button
                  className="record-btn-round"
                  onClick={toggleRecording}
                  disabled={!videoSrc && !camOn}
                >
                  <span className="ctrl-icon record-dot" />
                  <span className="ctrl-label">{t('btn_record')}</span>
                </button>
              )}
            </>
          ) : (
            <>
              {/* 一時停止。止めているあいだはファイルに入らない。
                  使えない端末では出さない（押せないボタンを見せても迷うだけ） */}
              {canPause && (
                <button
                  className={`pause-btn-round ${isPaused ? 'on' : ''}`}
                  onClick={togglePause}
                >
                  <span className="ctrl-icon">{isPaused ? '▶' : '❚❚'}</span>
                  <span className="ctrl-label">{isPaused ? t('btn_resume') : t('btn_pause')}</span>
                </button>
              )}
              <button className="stop-btn-round" onClick={toggleRecording}>
                <span className="ctrl-icon">■</span>
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
            {/* 音は3つだけ。拍手・ドラム・電子音
                （2026-08-13、伊波さん「音数を、１．拍手２．ドラム３電子音 にしぼり
                操作しやすくする」）。自分の音を入れる枠も同じ指示で廃止した */}
            {(['clap', 'drum', 'blip'] as const)
              .map(id => (
                <button key={id} className="effect-btn btn-sound" onClick={() => fire(id)}>
                  <RailFace id={id} label={t(('eff_' + id) as never)} />
                </button>
              ))}
            {/* エフェクト3個は柱の下（2026-08-11、伊波さんの指示） */}
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
            {/* 5つとも自分で決める場所。空でも枠として残す（押すと設定へ飛ぶ）。
                番号を振っておくと、設定のどの欄がどのボタンか見て分かる */}
            {telops.map((text, i) => {
              const empty = !text.trim();
              return (
                <button
                  key={i}
                  className={'effect-btn btn-telop' + (empty ? ' empty' : '')}
                  onClick={() => (empty ? openSetup('video') : fireTelop(text, telopDark, telopRandom))}
                >
                  <span className="number-icon">{i + 1}</span>
                  {/* 長い言葉だけ字を小さくして2行に収める。
                      短い言葉まで小さくすると読みにくい（2026-08-13） */}
                  {!empty && (
                    <span className="btn-label" data-len={text.length >= 5 ? 'long' : 'short'}>
                      {text}
                    </span>
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
            <h2 className="manner-title">はじめに</h2>
            <p className="manner-text">{MANNER_TEXT}</p>
            <button className="manner-agree-btn" onClick={afterAgree}>同意してはじめる</button>
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
          <div className="setup-header">
            <h2 className="setup-title">
              {mode === null ? 'なにを撮りますか？' : mode === 'photo' ? '写真の準備' : '動画の準備'}
            </h2>
            {backTo && mode !== null && <button className="setup-close-btn" onClick={() => setScreen(backTo)} title="もどる">←</button>}
          </div>

          <div className="setup-content">
            {/* いちばん最初に、動画か写真かを聞く
                （2026-08-13、伊波さん「最初の設定で動画撮りますか？写真撮りますか？」）。
                選ぶまで下の設定を出さない。1画面で決めることは1つだけ */}
            <div className="mode-picker">
              <button
                className={`mode-btn ${mode === 'video' ? 'on' : ''}`}
                onClick={() => setMode('video')}
              >
                <span className="mode-icon">🎬</span>
                <span className="mode-name">動画を撮る</span>
                <span className="mode-note">音や効果音も入ります</span>
              </button>
              <button
                className={`mode-btn ${mode === 'photo' ? 'on' : ''}`}
                onClick={() => setMode('photo')}
              >
                <span className="mode-icon">📷</span>
                <span className="mode-name">写真を撮る</span>
                <span className="mode-note">1回で3枚とれます</span>
              </button>
            </div>

            {mode === null && (
              <p className="mode-hint">まずどちらか選んでください</p>
            )}

            {mode !== null && (
            <>
            <div className="hand-setting">
              <label><input type="radio" name="hand" value="right" checked={hand === 'right'} onChange={() => setHand('right')} /> 右</label>
              <label><input type="radio" name="hand" value="left" checked={hand === 'left'} onChange={() => setHand('left')} /> 左</label>
            </div>

            {/* オンボーディング（アプリの紹介） */}
            <div className="setup-onboarding">
              <h2>💖 あなたのスマホが「平成のプリクラ」に！</h2>
              <div className="onboarding-features">
                <div className="onboarding-item">
                  <span className="onboarding-icon">📸</span>
                  <p><strong>カメラONですぐ遊べる！</strong><br/>インカメ・外カメを使ってリアルタイムに盛ろう！</p>
                </div>
                <div className="onboarding-item">
                  <span className="onboarding-icon">✨</span>
                  <p><strong>フレームで一気にエモく</strong><br/>平成レトロなフレームを気分で着せ替え！</p>
                </div>
                <div className="onboarding-item">
                  <span className="onboarding-icon">🎬</span>
                  <p><strong>しかも、動画にもできる！</strong><br/>写真だけじゃない！スタンプ感覚でデコりながらエモい動画を作ろう！</p>
                </div>
              </div>
            </div>

            {/* 何を撮るか決めるエリア（一番上） */}
            <div className="setup-section highlight-section" style={{ marginBottom: 12 }}>
              <div className="source-picker">
                <button className={`source-btn ${camOn && camFront ? 'on' : ''}`} onClick={() => startCam(true)}>
                  <span className="source-icon">🤳</span>
                  <span className="source-text">{t('cam_front')}</span>
                </button>
                <button className={`source-btn ${camOn && !camFront ? 'on' : ''}`} onClick={() => startCam(false)}>
                  <span className="source-icon">📸</span>
                  <span className="source-text">{t('cam_back')}</span>
                </button>
                {/* 動画の読み込みは、動画を撮るときだけ。
                    写真モードで出しても使い道がない（2026-08-13） */}
                {mode === 'video' && (
                  <button className={`source-btn ${videoSrc ? 'on' : ''}`} onClick={() => fileInputRef.current?.click()}>
                    <span className="source-icon">📁</span>
                    <span className="source-text">{videoSrc ? t('setting_video_change') : t('setting_video_load')}</span>
                  </button>
                )}
              </div>
              {mode === 'video' && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#e2e8f0', textAlign: 'center' }}>
                  （ゲームplayの動画などを予め録画してご用意いただきアップロードしてください）
                </div>
              )}
              {videoSrc && (
                <div className="shape-switch" style={{ marginTop: '12px' }}>
                  <button className={!loopVideo ? 'on' : ''} onClick={() => setLoopVideo(false)}>ループしない</button>
                  <button className={loopVideo ? 'on' : ''} onClick={() => setLoopVideo(true)}>ループする🔁</button>
                </div>
              )}
            </div>

            <div className="setup-section highlight-section">
              <h3 className="setup-section-title">✨ 2. フレームを選んでエモく！</h3>

              <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(168, 85, 247, 0.1)', borderLeft: '3px solid #a855f7', borderRadius: '4px' }}>
                <p style={{ margin: 0, fontSize: '11px', lineHeight: '1.4', color: '#e2e8f0' }}>
                  <strong>みんながクリエイター！✨</strong><br/>
                  ※AIと一緒に簡単に自作フレームが作れます<br/>
                  素敵なオリジナルフレームや、おもしろフレームなど、あなたが作った作品をSNSで見れるのを楽しみにしています♡
                </p>
              </div>


              <div className="frame-picker" style={{ '--tile-ar': shape === 'portrait' ? '9 / 16' : '16 / 9' } as React.CSSProperties}>
                <button 
                  className="frame-tile"
                  onClick={() => customFrameInputRef.current?.click()}
                  style={{ border: '1px dashed #a855f7', background: 'rgba(0,0,0,0.3)' }}
                >
                  <div style={{ fontSize: '24px', marginBottom: '4px' }}>🖼️</div>
                  <span style={{ color: '#a855f7' }}>マイフレーム追加</span>
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
                {FRAMES.map(f => (
                  <button
                    key={f.id}
                    className={`frame-tile ${frameId === f.id ? 'on' : ''} ${locked(f) ? 'locked' : ''}`}
                    onClick={() => (locked(f) ? showUnlock() : setFrameId(f.id))}
                    title={locked(f) ? t('locked_hint') : f.name}
                  >
                    <img src={f.file} alt={f.name} />
                    {locked(f) && <span className="lock-mark">{t('frame_locked')}</span>}
                    {/* タイルは絵だけ。名前は出さない（2026-08-12、伊波さん「絵だけの方が
                      見やすいよ」）。読み上げ用に img の alt には残してある */}
                  </button>
                ))}
              </div>
            </div>

            {/* 効果音の設定は無くなった。音は3つに固定で、入れ替えもしない
                （2026-08-13、伊波さん「音数を3つにしぼる」「音ぼファイル挿入廃止」）。
                試し聞きだけ残す。押せば柱のボタンと同じ音が鳴る */}
            <h3 className="setup-section-title">{t('setting_sounds')}</h3>
            <div className="sound-list">
              {(['clap', 'drum', 'blip'] as const).map((id, n) => (
                <div key={id} className="sound-row">
                  <span className="slot-no mine">{n + 1}</span>
                  <button className="sound-try" onClick={() => fireEffect(id)}>▶</button>
                  <span className="sound-name">{t(('eff_' + id) as never)}</span>
                </div>
              ))}
            </div>

            <h3 className="setup-section-title">{t('setting_srcaudio')}</h3>
            <p className="sheet-note">{t('srcaudio_note')}</p>
            <div className="shape-switch">
              <button className={useSrcAudio === 'mic' ? 'on' : ''} onClick={() => pickSrcAudio('mic')}>{t('srcaudio_mic')}</button>
              <button className={useSrcAudio === 'mix' ? 'on' : ''} onClick={() => pickSrcAudio('mix')}>{t('srcaudio_mix')}</button>
              <button className={useSrcAudio === 'off' ? 'on' : ''} onClick={() => pickSrcAudio('off')}>{t('srcaudio_off')}</button>
            </div>

            <h3 className="setup-section-title">{t('setting_shape')}</h3>
            {srcIsWide && (
              <p className="sheet-note">{t('setting_shape_wide_note')}</p>
            )}
            <div className="shape-switch">
              <button className={shape === 'landscape' ? 'on' : ''} onClick={() => pickShape('landscape')}>{t('setting_shape_land')}</button>
              <button className={shape === 'portrait' ? 'on' : ''} onClick={() => pickShape('portrait')}>{t('setting_shape_port')}</button>
            </div>

            <h3 className="setup-section-title">{t('setting_teloppos')}</h3>
            <div className="shape-switch">
              <button className={!telopRandom ? 'on' : ''} onClick={() => pickTelopPos(false)}>{t('telop_center')}</button>
              <button className={telopRandom ? 'on' : ''} onClick={() => pickTelopPos(true)}>{t('telop_random')}</button>
            </div>

            <h3 className="setup-section-title">{t('setting_telopcolor')}</h3>
            <div className="shape-switch">
              <button className={!telopDark ? 'on' : ''} onClick={() => pickTelopColor(false)}>{t('telop_white')}</button>
              <button className={telopDark ? 'on' : ''} onClick={() => pickTelopColor(true)}>{t('telop_black')}</button>
            </div>

            <h3 className="setup-section-title">{t('setting_telop')}</h3>
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

            <h3 className="setup-section-title">{t('setting_frame')}</h3>

            {/* 買い切りの解除。枠の一覧のすぐ上に置く。
                何が解けるのかを、鍵のかかった枠を見る直前に読めるように */}
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
                  <a
                    className="unlock-buy"
                    href={buyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >{t('unlock_buy')}</a>
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
            <div style={{ marginBottom: '12px', padding: '10px', background: 'rgba(168, 85, 247, 0.1)', borderLeft: '3px solid #a855f7', borderRadius: '4px' }}>
              <p style={{ margin: 0, fontSize: '11px', lineHeight: '1.4', color: '#e2e8f0' }}>
                <strong>みんながクリエイター！✨</strong><br/>
                ※AIと一緒に簡単に自作フレームが作れます<br/>
                素敵なオリジナルフレームや、おもしろフレームなど、あなたが作った作品をSNSで見れるのを楽しみにしています♡
              </p>
            </div>
            <div className="frame-picker" style={{ marginBottom: '12px' }}>
              <button 
                className="frame-tile"
                onClick={() => customFrameInputRef.current?.click()}
                style={{ border: '1px dashed #a855f7', background: 'rgba(0,0,0,0.3)' }}
              >
                <div style={{ fontSize: '24px', marginBottom: '4px' }}>🖼️</div>
                <span style={{ color: '#a855f7' }}>マイフレーム追加</span>
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
                  <span>マイフレーム</span>
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
            </div>

            <div className="frame-picker" style={{ '--tile-ar': shape === 'portrait' ? '9 / 16' : '16 / 9' } as React.CSSProperties}>
              <button className={`frame-tile none ${frameId === null ? 'on' : ''}`} onClick={() => setFrameId(null)}>{t('frame_none')}</button>
              {FRAMES.map(f => (
                <button
                  key={f.id}
                  className={`frame-tile ${frameId === f.id ? 'on' : ''} ${locked(f) ? 'locked' : ''}`}
                  onClick={() => (locked(f) ? showUnlock() : setFrameId(f.id))}
                  title={locked(f) ? t('locked_hint') : f.name}
                >
                  {f.bgFile ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <img src={f.bgFile + '?v=20260813_raw'} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
                      <img src={f.file + '?v=20260813_raw'} alt={f.name} style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%' }} />
                    </div>
                  ) : (
                    <img src={f.file ? f.file + '?v=20260813_raw' : undefined} alt={f.name} />
                  )}
                  {locked(f) && <span className="lock-mark">{t('frame_locked')}</span>}
                  {/* タイルは絵だけ。名前は出さない（2026-08-12、伊波さん「絵だけの方が
                      見やすいよ」）。読み上げ用に img の alt には残してある */}
                </button>
              ))}
            </div>

            <div style={{ textAlign: 'center', padding: '24px 0', fontSize: '10px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
              <a href="https://cubicenginestudio.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                ©２０２６CUBICENGINEstudio
              </a>
            </div>
            </>
            )}
          </div>
          {/* 何を撮るか選ぶまでは、先へ進むボタンを出さない */}
          {mode !== null && (
            <div className="setup-footer">
              <button className="start-btn" onClick={() => setScreen('video')}>
                {mode === 'photo' ? 'この設定で写真を撮る！' : 'この設定で動画を撮る！'}
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

export default App
