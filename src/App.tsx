import { useState, useRef, useEffect } from 'react'
import '../docs/tinycube-skin-shibuya.css'
import './setup.css'
import { startRecording, startStage, type RecordHandle, type OutShape } from './recorder'
import { FRAMES, loadFrame, fitsShape, inDisplayOrder, type Frame, type FrameAnchor, type FaceHole } from './frames'
import * as album from './album'
import { ALBUM_LIMIT, type AlbumItem } from './album'
import { fireEffect, fireTelop, setAmbient, setTone, type EffectId, type ToneId } from './effects'
import { t, getLang, setLang } from './i18n'
// savedKey / relock は 2026-08-15 に全部無料にしたとき使わなくなった。
// unlock.ts 側には残してある（気が変わったときに戻せるように）
import { isUnlocked, tryUnlock, startBilling, onUnlockChange } from './unlock'
import { isNativeApp, buy as buyInApp, restore as restoreInApp } from './billing'
import { saveMedia, takeLastMediaError } from './save'
import { FaceIcon, SceneIcon } from './CamIcon'
import { saveCustomFrame, getCustomFrames, deleteCustomFrame, type CustomFrameRecord } from './idb'

/**
 * 飾りを焼くときの補正（2026-08-16）。
 *
 * 画面では fontSize:`${d.size}cqw` で出しており、そこに行の高さや
 * 絵文字まわりの余白が乗る。canvas の fillText は字面そのものの大きさで
 * 描くので、**同じ数字でも canvas のほうが小さく出る**。
 *
 * 💖 を1つ置いて「高さ ÷ 幅」で比べた実測：
 *
 *     画面 16.80%  ／  補正なしの保存 10.00%
 *
 * 16.80 ÷ 10.00 = 1.68。この差を埋めて、画面で見たとおりに焼く。
 * 画面側の指定（cqw）を変えるとスタンプの操作感まで変わるので、
 * **保存側を画面に合わせている**。
 *
 * ⚠️ **文字とスタンプで係数を分けた**（2026-08-23、伊波さん
 *    「実際に出来上がりともズレ」→「（保存のほうが）大きい」）。
 *
 *    1.68 は **💖 を1つ置いて測った値**で、絵文字は字の上下の余白が
 *    大きい。同じ係数を文字に当てると**掛けすぎて、保存だけ大きくなる**。
 *    絵文字ほど余白が無いぶん、文字は小さい係数でよい。
 *
 * ⚠️ **文字用の 1.2 はまだ実測していない。** 実機で「あ」を1つ置いて
 *    保存し、画面と見比べて詰めること（測り方は上と同じ、高さ÷幅）。
 */
const DECO_SCALE_STAMP = 1.68
const DECO_SCALE_TEXT = 1.2

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
  // ⚠️ 🪩 だったが 💥 に変えた（2026-08-23）。ミラーボールを撮る前に
  //    選ぶ形へ移したので、フラッシュが 🪩 だと取り違える。
  //    ラベル側（eff_flash）はもともと 💥 なので、そちらに合わせた
  flash: '💥',               // フラッシュ … ぱっと弾ける
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
    const base = [t('eff_toutoi'), t('eff_huh'), t('eff_omg'), t('eff_party'), t('eff_choberigu')];
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
  // フレーム選びを開いているか。描く係が毎コマ聞きにくるので ref で持つ
  // （state だと、描く係を作り直さないと新しい値が見えない）
  const pickerOpenRef = useRef(false);
  // できあがりのシート。プレビューで作ったものを保存でも使い回す。
  // ⚠️ **撮り直し・飾りの変更があったら捨てること。** 古い絵を保存して
  //    しまう（捨て忘れが一番こわい）
  const sheetRef = useRef<HTMLCanvasElement | null>(null);
  // 効果音の差し替え（soundInputRef / soundSlot / soundVer）は 08cf11c で廃止
  // 文字の色。白は暗い映像に、黒は明るい映像に強い
  const [telopDark, setTelopDark] = useState(() => {
    try { return localStorage.getItem('tinycube.telopDark') === '1'; } catch { return false; }
  });
  // 出る場所。いつも真ん中か、ばらけさせるか
  /**
   * ずっと出しておく飾り（2026-08-23、伊波さん「エフェクトも初めから選んで
   * 撮影中は出しておこう」「ミラーボールは先に」）。
   *
   * もとは「エモーショナル」だけを撮影中に押して入り切りしていた。
   * ミラーボールも**撮る前に選んでかけっぱなし**にできるようにした。
   * 自撮りは押しに行った指がレンズに被るので、触らずに済ませたい
   */
  type AmbientKind = 'emotional' | 'mirrorball';
  const [ambientOn, setAmbientOn] = useState<AmbientKind | null>(() => {
    try { return (localStorage.getItem('tinycube.ambient') as AmbientKind) || null; } catch { return null; }
  });
  const pickAmbient = (kind: AmbientKind | null) => {
    setAmbientOn(kind);
    setAmbient(kind);
    try {
      if (kind) localStorage.setItem('tinycube.ambient', kind);
      else localStorage.removeItem('tinycube.ambient');
    } catch { /* 保存できなくても動く */ }
  };
  // 前に選んだものは開き直しても効かせる。描く側は effects.ts が持っている。
  // ⚠️ **起動のときだけでよい。** ambientOn を見張ると、選び直すたびに
  //    ここも走って pickAmbient と二重に渡すことになる
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setAmbient(ambientOn); }, []);

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
  };

  /**
   * 文字の出し方（2026-08-23、伊波さん「文字の出現も自動で出す方がやりやすい」）。
   *
   * ■ なぜ要るか
   *
   * 動画の自撮りは、片手で持って自分を映しながら画面を触ることになる。
   * **押しに行った指がレンズに被る**（伊波さん「自撮りにすると指でカメラが
   * 隠れる」）。撮る前に決めておけば、撮影中は何も触らなくて済む。
   *
   *   'tap'    … 今までどおり、右の柱を押して出す
   *   'random' … 用意した5つから、でたらめに選んで出す
   *   'order'  … 用意した5つを、上から順に出す
   *
   * ⚠️ **出る間隔もでたらめにすること**（伊波さん「秒数もランダムで、
   *    連打もあっていいね」）。等間隔だと機械が出しているように見える。
   *    重なってもよい。適当に押していたときの気持ちよさがそれだった
   */
  type TelopMode = 'tap' | 'random' | 'order';
  const [telopMode, setTelopMode] = useState<TelopMode>(() => {
    try { return (localStorage.getItem('tinycube.telopMode') as TelopMode) || 'tap'; } catch { return 'tap'; }
  });
  const pickTelopMode = (mode: TelopMode) => {
    setTelopMode(mode);
    try { localStorage.setItem('tinycube.telopMode', mode); } catch { /* 保存できなくても動く */ }
  };
  /** 'order' のときに次に出すもの。録画のたびに先頭へ戻す */
  const telopTurn = useRef(0);

  /**
   * 色味（2026-08-23、伊波さん「エフェクトも初めから選んで撮影中は出しておこう」
   * 「フラッシュだけ、ちょっと加工系にかえて」「総音色身を変えるがいいね」）。
   *
   * フラッシュは一瞬光るものなので、かけっぱなしにできない。
   * 代わりに色味を3つ置いた。撮る前に選んで、撮影中はずっとかかる
   */
  const [tone, setToneState] = useState<ToneId | null>(() => {
    try { return (localStorage.getItem('tinycube.tone') as ToneId) || null; } catch { return null; }
  });
  const pickTone = (kind: ToneId | null) => {
    setToneState(kind);
    setTone(kind);
    try {
      if (kind) localStorage.setItem('tinycube.tone', kind);
      else localStorage.removeItem('tinycube.tone');
    } catch { /* 保存できなくても動く */ }
  };
  // 前に選んだ色味は、開き直しても効かせる。
  // **描く側は effects.ts が持っているので、起動時に一度渡し直す**
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTone(tone); }, []);
    // 入れ替えたら画面を描き直すための番号
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
  // ズームの操作欄を畳めるようにする。横持ちだと画面の高さが足りず、
  // この欄が映像を覆ってしまう（2026-08-14、伊波さん）。
  // **横持ちのときは畳んだ状態で始める**（同日「カメラズームのボタンが
  // やっぱり邪魔」）。縦持ちは余裕があるので開いたまま出す
  const [camTuneOpen, setCamTuneOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !(window.innerWidth > window.innerHeight && window.innerHeight <= 500);
  });
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
  //
  // 指で線を描く機能（kind 'pen'）は 2026-08-14 に入れて、同日に外した
  // （伊波さん「指で書く機能いらないよ？」）。プリクラの落書きは
  // **文字スタンプと絵スタンプで足りている**、という判断。戻さないこと。
  type Deco = { id: number; shot: number; kind: 'text' | 'stamp'; value: string; x: number; y: number; size: number; color: string; angle: number; font?: string };
  const [decos, setDecos] = useState<Deco[]>([]);
  const decoSeq = useRef(0);
  // 指で操っているあいだ、いまの値を読むための控え。
  // state を直接見ると、指を置いた時点の古い値を掴んだままになる
  const decosRef = useRef<Deco[]>([]);
  useEffect(() => { decosRef.current = decos; }, [decos]);

  // 文字の自動出しから読むもの。**ref で持つこと。**
  // 直接 state を見ると、値が変わるたびにタイマーが張り直されて
  // 間隔がそこで途切れる（出たり出なかったりする）
  const telopsRef = useRef<string[]>([]);
  useEffect(() => { telopsRef.current = telops; }, [telops]);
  const telopDarkRef = useRef(false);
  useEffect(() => { telopDarkRef.current = telopDark; }, [telopDark]);
  const telopRandomRef = useRef(false);
  useEffect(() => { telopRandomRef.current = telopRandom; }, [telopRandom]);
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
    { id: 'maru', name: t('font_marumoji'), css: '"Hachi Maru Pop", cursive' },
    { id: 'note', name: t('font_note'),   css: '"Klee One", serif' },
  ] as const;
  const [photoFontId, setPhotoFontId] = useState<string>('maru');
  const PHOTO_FONT = PHOTO_FONTS.find(f => f.id === photoFontId)?.css ?? PHOTO_FONTS[0].css;
  // 文字の傾き。プリクラの落書きは斜めに入れるものなので、角度が要る
  // （2026-08-14、伊波さん「文字入れの角度が効かない」）。
  // つまみは同日に外した。写真の上で2本指をひねれば回せるので、そちらへ寄せた
  // （同日「文字の傾きはそれこそ指でできない？」）。
  // ここは「新しく作るスタンプの初期の傾き」としてだけ残っている
  const [photoAngle] = useState(0);
  const TEXT_COLORS = ['#ff4da6', '#ffffff', '#000000', '#ffe14d', '#4dd2ff', '#7cff4d', '#ff6b4d', '#c14dff'];
  // 絵文字のスタンプ。value がそのまま写真に焼かれる。
  // 音符だけは絵文字（🎵）をやめて、記号（♪）に色を付けて出す。
  // 絵文字の音符は端末まかせで暗い青緑に転ぶことがあり、
  // 「明るい黄色のオタマジャクシ」にならない（2026-08-14、伊波さん
  // 「音符のスタンプは明るい黄色のオタマジャクシのほうがイイ」）。
  // 記号なら色を自分で決められる
  type StampDef = { v: string; color?: string };
  //
  // 星は ⭐🌟✨ と3つ並べていた。⭐ と 🌟 は同じ「星」で選ぶ意味が無いので
  // 水色ひとつにまとめる。**きら（✨）は別物なので残す**
  // （2026-08-14、伊波さん「星はパステルカラーの水色で1個でいいよ
  // シンプルな法）」「水色濃いめ」「きらは残して」）。
  // 淡すぎると明るい写真の上で消えるので、パステルより一段濃いところに置く
  const STAMPS: StampDef[] = [
    { v: '💖' }, { v: '★', color: '#4fc3f7' }, { v: '✨' },
    { v: '🎀' }, { v: '🌈' }, { v: '🍓' }, { v: '🧸' },
    { v: '👑' }, { v: '🦄' },
    // 桜（🌸）はロゼットへ（2026-08-14、伊波さん「桜はガーベラとかが
    // イイかな」→ 候補から「ロゼっと」を選択）。絵文字にガーベラそのものは
    // 無く、🏵️ が花弁の並んだ勲章型でいちばん近い。桜だと季節が付いて回る
    { v: '🏵️' }, { v: '💎' },
    { v: '🍭' }, { v: '☁️' }, { v: '🐱' },
    { v: '♪', color: '#ffd83d' },
  ];
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
    // いちばん最初の画面（なにを撮る？）では、押しても何も起きなかった。
    // ここは「戻る」ではなく「終わる」場所（2026-08-14、伊波さん
    // 「動画と、写真選ぶの画面の戻るはアプリ閉じるがいいかも？」）
    else if (setupStep === 'kind') closeApp();
    else if (camOn || videoSrc) setScreen(backTo);
  };
  // アプリを閉じる。
  // **ブラウザは自分で開いたタブしか閉じられない。**利用者が URL を打って
  // 開いたタブでは window.close() が黙って無視される。だから閉じられたか
  // どうかを確かめて、駄目なら「タブを閉じてください」と伝える。
  // Capacitor で包んだアプリ（ストア版）では、こちらから終了できる
  const closeApp = () => {
    // カメラを止めてから終わる。点きっぱなしで閉じると、ランプが消えない
    stopCam();
    const cap = (window as unknown as { Capacitor?: { Plugins?: { App?: { exitApp?: () => void } } } }).Capacitor;
    if (cap?.Plugins?.App?.exitApp) { cap.Plugins.App.exitApp(); return; }
    window.close();
    // 閉じられたなら、この先は動かない。動いたということは閉じられなかった
    setTimeout(() => setCantClose(true), 250);
  };
  const [cantClose, setCantClose] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  // しまっている最中か。**画面全体で待ちを見せる**ために持つ。
  // 小さな帯だけだと、共有シートが開くまでの数秒が「固まった」に見える
  // （2026-08-16、伊波さん「保存のタイムラグ」）
  const [saveBusy, setSaveBusy] = useState(false);
  const [loopVideo, setLoopVideo] = useState(true);
  // 買い切りの解除。フレームと透かし消しの両方が一度に解ける
  // （2026-08-11、伊波さん「両方」）
  const [unlocked, setUnlocked] = useState(isUnlocked());
  const [keyInput, setKeyInput] = useState('');
  const [keyNG, setKeyNG] = useState(false);
  const unlockRef = useRef<HTMLDivElement>(null);
  // 買うところ。BOOTH は日本、Ko-fi は英語圏。CMCUBE と同じ分け方（2026-08-11）
  //
  // ⚠️ **アプリ（Android）では、この外の売り場へ連れて行ってはいけない。**
  //    Google Play は、アプリの中で売るデジタルの品物に Play の課金を通すことを
  //    求めていて、外の売り場へ誘導すると審査で弾かれる。
  //    アプリでは Play の課金ボタン、Web ではこれまでどおり BOOTH / Ko-fi
  //    （2026-08-14、伊波さん「A. アプリ版だけボタンを隠す」）
  const inApp = isNativeApp();
  const buyUrl = getLang() === 'ja'
    ? 'https://cubicengine.booth.pm/items/8705410'
    : 'https://ko-fi.com/s/e4fc12b6e7';
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyNG, setBuyNG] = useState(false);
  const submitKey = async () => {
    const ok = await tryUnlock(keyInput);
    setKeyNG(!ok);
    if (ok) { setUnlocked(true); setKeyInput(''); }
  };

  // アプリの中で買う。Play の画面が出て、買えたかどうかは
  // あとから onUnlockChange 経由で返ってくる（その場では分からない）
  const buyNow = async () => {
    setBuyNG(false);
    setBuyBusy(true);
    const opened = await buyInApp();
    setBuyBusy(false);
    if (!opened) setBuyNG(true);
  };

  // 「買ったのに解けていない」ときの取り戻し。機種変えのあとなど。
  // Play は買い切りの持ち主を覚えているので、ここから戻せる
  const restoreNow = async () => {
    setBuyNG(false);
    setBuyBusy(true);
    const ok = await restoreInApp();
    setBuyBusy(false);
    if (!ok) setBuyNG(true);
  };

  // Play への問い合わせは起動時に一度だけ。
  // 解除の知らせは、押した直後ではなくあとから返ってくるので受け口を置く
  useEffect(() => {
    startBilling();
    return onUnlockChange(v => setUnlocked(v));
  }, []);
  
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

  // ⚠️ **透かしは常に入れる**（2026-08-17、伊波さん「無料にしても透かしは
  //    入れる話だったはずだよ」）。
  //    もとは「無料版の印」で、解除すると消える作りだった。8/15 に全部無料へ
  //    切り替えたとき isUnlocked() が常に true を返すようになり、**副作用で
  //    透かしまで消えていた。** 無料で配るからこそ、撮ったものが広まるときに
  //    名前が残っているほうが宣伝になる。
  //    画面に出している canvas をそのまま録るので、ここを変えれば動画も写真も変わる
  useEffect(() => {
    liveRef.current.watermark = 'tinyCUBE';
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
  // 顔ハメの枠かどうか。ズームを出すかどうかの判断に使う。
  // 穴の無い枠では、ズームは映像を覆うだけで使い道が無い（2026-08-14）
  const isFaceHoleFrame = !!frame && ((frame.faceHoles && frame.faceHoles.length > 0) || !!frame.faceHole);


  // 画面に出す係を1つだけ回す。録画していなくても同じ絵が出るので、
  // エフェクトを押せばその場で見える
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    return startStage({
      canvas: c,
      // video は毎回聞き直す。読み込む前は要素そのものが無い
      // カメラのときだけ画面いっぱいに広げる
      // フレーム選びを開いているあいだは休ませる。誰も見ていない 1920x1080 を
      // 毎秒60回描き続けると、非力な端末ではスクロールとCPUを取り合う
      // （2026-08-16、伊波さん「かくかくする、フレーム選択が」）
      read: () => ({ ...liveRef.current, video: videoRef.current, fill: camOnRef.current,
        idle: pickerOpenRef.current }),
      onTrouble: msg => setCamInfo(msg || null),
    });
  }, []);

  /**
   * 文字を自動で飛ばす（2026-08-23）。
   *
   * ⚠️ **setInterval を使わないこと。** 間隔がでたらめなので、
   *    次の1回を出したあとに次の待ち時間を決める形にする。
   * ⚠️ **一時停止のあいだは出さない。** 録画が止まっているのに
   *    文字だけ出続けると、あとで見たときに何も無いところで字が動く。
   * ⚠️ **止めるときは必ず片付ける。** 残ると、次に撮り始めたときに
   *    前の回のぶんが混じって出る
   */
  useEffect(() => {
    if (telopMode === 'tap') return;          // 手で押す道はこれまでどおり
    if (!isRecording || isPaused) return;

    // 撮り始めは先頭から。前の回の続きから出ると順番が合わない
    if (!isPaused) telopTurn.current = 0;

    let timer: number | undefined;
    let alive = true;

    const tick = () => {
      if (!alive) return;
      const list = telopsRef.current.filter(s => s.trim());
      if (list.length) {
        const text = telopMode === 'random'
          ? list[Math.floor(Math.random() * list.length)]
          : list[telopTurn.current++ % list.length];
        // 大きさ・場所・散り方は fireTelop の中でランダムに決まる。
        // 位置の「ランダムに出す」設定はそのまま活かす
        fireTelop(text, telopDarkRef.current, telopRandomRef.current);
      }
      // 次の1回までの間隔もでたらめ（0.8〜3.2秒）。
      // 短いほうに寄せてあるのは、適当に押していたときの手の速さに近いから。
      // 重なって出てもよい（伊波さん「連打もあっていいね」）
      timer = window.setTimeout(tick, 800 + Math.random() * 2400);
    };

    // 撮り始めてすぐ1つ出す。無音のまま数秒待つと、動いていないように見える
    timer = window.setTimeout(tick, 600);

    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [telopMode, isRecording, isPaused]);

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

  // （保存の渡し方は下の save() に書いてある。
  //   このコメントは save() から離れた場所に取り残されていたもの。
  //   中身が実装と食い違っていたので、説明は save() の側へ移した）
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
      // ⚠️ **画質と滑らかさを頼むこと。** 何も指定しないとブラウザが
      //    控えめな解像度（640x480 など）を選び、フレームの絵に対して
      //    映像だけ粗く見える（2026-08-16、伊波さん「カメラがカクカクして、
      //    画像の悪すぎて」「多分周りのフレームに負ける」）。
      //    ideal で頼むだけにして、無理な端末では下げてもらう
      //    （exact だと満たせない端末で例外になり、カメラが開かない）
      // ⚠️ **min を付けないこと。** `frameRate: { min: 24 }` を入れたら
      //    カメラが1つも開かなくなった（video 要素すら作られない）。
      //    min / exact は「満たせなければ失敗」なので、端末やカメラを
      //    選ぶ。**ideal だけにして、無理なら下げてもらう**
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: front ? 'user' : 'environment',
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
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
        // ⚠️ **実際に開いた解像度を画面に出す**（2026-08-17、伊波さん
        //    「カメラの画像が荒過ぎ」）。1920x1080 を ideal で頼んでいるが、
        //    端末が断れば黙って下がる。**何が選ばれたかを見ないと、荒さの
        //    原因が「頼み方」なのか「端末の限界」なのか分からない。**
        //    数秒だけ出して消す（ずっと出しっぱなしにはしない）
        setCamInfo(`カメラ ${st.width}x${st.height} ${Math.round(st.frameRate ?? 0)}fps`);
        setTimeout(() => setCamInfo(null), 6000);
      }
    } catch (e: any) {
      alert(t('cam_fail') + ' ' + (e?.message ?? ''));
    }
  };

  // 効果音の読み込み（sounds.ts）は 08cf11c で廃止。
  // いまの3つは effects.ts が自分で鳴らすので、ここで用意するものは無い

  // フレーム選びの画面にいるあいだは、描く係を休ませる
  useEffect(() => { pickerOpenRef.current = screen === 'setup'; }, [screen]);

  // 写真か飾りが変わったら、取ってあるシートを捨てる。
  // **一箇所で見張る。** 撮り直し・飾りの追加・移動…と呼び出し側で消して
  // 回ると、必ずどこかで消し忘れて古い絵を保存することになる
  useEffect(() => { sheetRef.current = null; }, [shots, decos]);

  // <video> が画面に出てから、カメラの映像を繋ぐ
  useEffect(() => {
    camOnRef.current = camOn;
    // 自撮りのときだけ鏡にする。外カメラは見たままでよい
    liveRef.current.mirror = camOn && camFront;
    const v = videoRef.current;
    if (!camOn || !v || !camStreamRef.current) return;
    v.srcObject = camStreamRef.current;
    v.muted = true;                          // 自分の声が返ってきて回るのを防ぐ
    v.play().catch(e => setCamInfo(t('err_play_rejected') + (e?.name ?? '')));
    // しばらくして絵が来ていなければ、その中身を画面に出す。
    // ⚠️ **ここで消さないこと。** カメラを繋いだ直後に走るので、
    //    開いた解像度の表示（openCamera で入れたもの）を消してしまう。
    //    困りごとが起きたときは下の check が上書きする（2026-08-18）
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
      setSaveMessage(t('msg_saved'));
      setTimeout(() => setSaveMessage(null), 3000);
    };

    // 共有シートを出したときの知らせ。
    // ⚠️ **「保存しました！」と言い切ってはいけない。**
    //    共有シートは開いた時点で Promise が返るので、本人が
    //    「ビデオを保存」を押したのか「キャンセル」したのかを
    //    こちら側から知る手立てが無い（2026-08-14、ヒマワリさんの調べ）。
    //    保存していないのに「保存しました」と出すと、撮ったものが
    //    消えたことに気づけない。次にどうすればよいかだけを伝える
    const showShared = () => {
      setSaveMessage(t('msg_save_hint'));
      setTimeout(() => setSaveMessage(null), 4000);
    };

    // 保存のやり方は src/save.ts に分けてある。
    // Web とアプリ（Capacitor）でまったく違ううえ、**アプリでは
    // a.download も navigator.share も通らず、黙って何も起きなかった**
    //（2026-08-15、伊波さんが内部テストの実機で発見）。

    // ⚠️ **押した瞬間に何か出すこと。**
    //    動画は数MBある。それを base64 にしてファイルへ書き出すので、
    //    共有シートが開くまで1〜3秒かかる。その間なにも出さないと
    //    「押しても反応しない」ように見える
    //   （2026-08-15、伊波さん「保存ボタンの反応が少し悪かった」）。
    setSaveMessage(t('msg_saving_prep'));
    setSaveBusy(true);

    let r: Awaited<ReturnType<typeof saveMedia>>;
    try {
      r = await saveMedia(blob, name);
    } finally {
      // ⚠️ **必ず消すこと。** 例外で抜けたときに出したままだと、
      //    画面が覆われて何も押せなくなる
      setSaveBusy(false);
    }

    if (r.how === 'shared') {
      // ⚠️ **なぜ共有シートに落ちたかを出す**（2026-08-17、伊波さん
      //    「かなり時間が空いて、共有画面へ」）。直接保存が失敗すると
      //    黙って落ちるので、原因が見えないまま「遅い」だけが残っていた
      const why = takeLastMediaError();
      if (why) {
        setSaveMessage('写真アプリに直接しまえませんでした（' + why + '）');
        setTimeout(() => setSaveMessage(null), 8000);
      } else {
        showShared();        // 保存したかは本人しか知らないので言い切らない
      }
    } else if (r.how === 'downloaded') {
      showSaved();
    } else if (r.how === 'failed') {
      // **黙って消えるのが一番まずい。** 何が起きたかを出す
      setSaveMessage(t('err_save_failed') + r.why.slice(0, 40) + '）');
      setTimeout(() => setSaveMessage(null), 5000);
    } else {
      // cancelled。本人がやめただけなので何も言わないが、
      // **上で出した「準備中」は消すこと**。放っておくと出たまま残る
      setSaveMessage(null);
    }
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
  // 動画の撮影画面から「写真」ボタンを外したので、いま呼び出し口は無い
  // （2026-08-14、伊波さん「動画撮影ページの写真のボタン削除」）。
  // 写真は「なにを撮る？」→ 写真 → 3枚連写の道に一本化した。
  // 1枚だけ撮る需要が出たときのために処理は残してある
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
          const px = c.width * d.x / 100;
          const py = c.height * d.y / 100;
          // 文字の大きさは幅を基準にする。縦横で見え方が変わらないように。
          //
          // ⚠️ **画面と同じ見え方になるよう DECO_SCALE を掛けること。**
          //    画面側は fontSize:`${d.size}cqw`（.shot-big の幅が基準）で、
          //    そこに行の高さや絵文字の余白が乗るため、同じ数字でも
          //    実際に見えている大きさは canvas の fillText より大きくなる。
          //    掛けずに焼くと、できあがりだけ小さくなる
          //    （2026-08-16、伊波さん「スタンプの文字が出来上がりが
          //     小さくなる」）。
          //
          //    実測（💖 を置いて、高さ÷幅で比べた）
          //      画面 16.80% ／ 保存 10.00% → 1.68倍ぶん足りていなかった
          //    ⚠️ **文字とスタンプで係数が違う**（2026-08-23）。1.68 は
          //       絵文字で測った値で、文字に当てると掛けすぎになる
          const size = c.width * d.size / 100
            * (d.kind === 'text' ? DECO_SCALE_TEXT : DECO_SCALE_STAMP);
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
            // 絵文字は自前の色を持っているので触らない。
            // 記号のスタンプ（音符）は色を当てないと黒で焼かれる
            if (!/\p{Extended_Pictographic}/u.test(d.value)) {
              g.lineWidth = Math.max(2, size * 0.10);
              g.strokeStyle = 'rgba(0,0,0,0.5)';
              g.lineJoin = 'round';
              g.strokeText(d.value, 0, 0);
              g.fillStyle = d.color;
            }
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
  // 用紙を作るところと、保存するところを分けてある。
  // 保存の前に「できあがり」を見せたい（2026-08-14、伊波さん
  // 「保存する前にできあがり！！！見れるように」）ので、
  // 同じ用紙をプレビューにも使う
  /**
   * @param maxCellAR 1コマの「高さ÷幅」の上限。**インスタ用のときだけ渡す**。
   *   縦長で撮ると1コマが 1080x1920（比 1.78）になり、3枚積むと用紙が
   *   比 5.19 になる。インスタの上限 4:5 に丸ごと収めると 24% まで縮み、
   *   白の海に小さく浮かんでしまう。
   *   1コマの縦を詰めれば、横長で撮ったとき（比 1.70 → 72%）と同じ
   *   見え方になる。伊波さんが LINE カメラでやっていたのがこれ
   *   （2026-08-23「要は縦がキュッとなってるだけかな」）。
   *   ⚠️ **通常の保存では渡さないこと。** 詰めた用紙は「可愛くない」と
   *      言われている（2026-08-17）。インスタ用だけの措置
   */
  const buildPhotoSheet = async (maxCellAR?: number): Promise<HTMLCanvasElement | null> => {
    const rendered = await Promise.all([0, 1, 2].map(i => renderShot(i)));
    const cells = rendered.filter((c): c is HTMLCanvasElement => !!c);
    if (cells.length === 0) return null;
    // 1コマの形。3枚とも同じ大きさで縦に積む
    // （2026-08-14、伊波さん「３枚の縦長写真（同じ大きさで１６：９）
    // 縦の時横の時も同じ表示」）。
    //
    // 「縦の時横の時も同じ表示」を、**撮った写真の形をそのまま使う**と読んだ。
    // 縦で撮ったものを 16:9 の横長コマへ押し込むと、顔の上下が切れて
    // 顔ハメが台無しになる。コマの形を写真に合わせれば、縦で撮っても
    // 横で撮っても「同じ大きさの3枚が縦に並ぶ」見え方は変わらない
    const first = cells[0];
    const ar = first.height / first.width;   // 1コマの縦横比
    // ⚠️ **写真の形をそのまま3枚積む。ここを変えないこと。**
    //    2026-08-17、縦が画面に収まらないので用紙の比に上限をかけて
    //    コマの高さを詰めてみたが、**可愛くなくなった**（伊波さん
    //    「最初のかわいいぷり風に戻す」「今のは可愛くない」）。
    //    プリクラは1コマが縦に大きいから可愛いので、詰めると別物になる。
    //
    //    縦は用紙が 1128x5856（比5.19）になり画面に入りきらないが、
    //    そこは **.preview-sheet を縦スクロールさせて見せる**（setup.css）。
    //    形を崩すより、スクロールしてもらうほうがいい。
    const CELL_W = 1080;
    // maxCellAR が来たときだけ縦を詰める（インスタ用）。
    // 詰めても中身は「コマにぴったり収める」ので、まん中が残って上下が切れる
    const CELL_H = Math.round(CELL_W * (maxCellAR ? Math.min(ar, maxCellAR) : ar));
    const GAP = 24;
    const PAD = 24;
    const sheet = document.createElement('canvas');
    sheet.width  = PAD * 2 + CELL_W;
    sheet.height = PAD * 2 + CELL_H * cells.length + GAP * (cells.length - 1);
    const g = sheet.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, sheet.width, sheet.height);
    cells.forEach((cell, i) => {
      const dy = PAD + i * (CELL_H + GAP);
      // コマにぴったり収める。縮めて白帯を出すと、3枚とも帯だらけになる
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
    return sheet;
  };

  /**
   * インスタに載る形にする（2026-08-23、伊波さん「インスタの投稿に乗せたかった
   * けど、写真が大きすぎてはみ出た」「昨日は、他アプリで、フレーム（背景）
   * 足して乗せた」）。
   *
   * ■ なぜ要るか
   *
   * 3連写真は縦で撮ると 1128x5856（比 5.19）になる。インスタに載る縦は
   * **4:5（比 1.25）まで**で、それを超えると勝手に切られる。
   * 伊波さんは他のアプリで背景を足して回避していた。**その一手間をここで済ませる。**
   *
   * ■ どうやるか
   *
   * ⚠️ **コマを詰めないこと。** 2026-08-17 に用紙の比へ上限をかけて
   *    コマの高さを詰めたことがあるが、**可愛くなくなった**（伊波さん
   *    「最初のかわいいぷり風に戻す」「今のは可愛くない」）。
   *    プリクラは1コマが縦に大きいから可愛い。
   *
   * だから**出来上がりには一切手を入れず**、4:5 の白い紙の**まん中に置く**だけ。
   * 写真は小さくなるが、形は崩れない。伊波さんが他アプリでやっていたことと同じ。
   *
   * @param sheet いつもの用紙（縦長のまま）
   */
  const toInstaSheet = (sheet: HTMLCanvasElement): HTMLCanvasElement => {
    // インスタの縦の上限。これより縦長にすると切られる
    const RATIO = 5 / 4;
    const out = document.createElement('canvas');
    // 幅は元のまま。高さだけ 4:5 まで伸ばす。
    // 元がすでに 4:5 より横長なら、幅を伸ばして 4:5 に合わせる
    if (sheet.height / sheet.width > RATIO) {
      out.width = sheet.width;
      out.height = Math.round(sheet.width * RATIO);
    } else {
      out.height = sheet.height;
      out.width = Math.round(sheet.height / RATIO);
    }
    const g = out.getContext('2d');
    if (!g) return sheet;
    // 用紙と同じ白。継ぎ目が見えないように
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, out.width, out.height);
    // まん中に、はみ出さない大きさで置く
    const s = Math.min(out.width / sheet.width, out.height / sheet.height);
    const w = sheet.width * s, h = sheet.height * s;
    g.drawImage(sheet, (out.width - w) / 2, (out.height - h) / 2, w, h);
    return out;
  };

  // できあがりを見せる。ここで初めて「3枚が1枚になった姿」が分かる
  const openPreview = async () => {
    setPreviewBusy(true);
    try {
      const sheet = await buildPhotoSheet();
      if (sheet) {
        // ⚠️ **作ったシートは取っておくこと。** 捨てると保存のときに
        //    もう一度3枚を焼き直すことになり、押してから6秒以上
        //    無反応に見える（2026-08-16、伊波さん「保存の画面がでる…遅い」）。
        //    プレビューで見えているものと保存するものは同じなので、作り直す
        //    理由がない
        sheetRef.current = sheet;
        setPreviewUrl(sheet.toDataURL('image/jpeg', 0.92));
      }
    } finally {
      setPreviewBusy(false);
    }
  };

  // プレビューで見たものを、そのまま保存する
  /**
   * 選んだ行き先へしまう（2026-08-15）。
   *
   * プリクラ帳へは data URL、端末へは Blob と、要るものが違うので
   * シートは一度だけ作って使い回す。
   */
  const savePhotoTo = async (where: 'both' | 'device' | 'album' | 'insta') => {
    // プレビューで作ったものをそのまま使う。無ければ作る（撮り直しなどで
    // 取っておいたものが古くなっている場合に備えて）
    const sheet = sheetRef.current ?? await buildPhotoSheet();
    if (!sheet) return;
    // 押した瞬間に何か出す。この先は端末へ書き出す処理で数秒かかる
    setSaveMessage(t('msg_storing'));

    // プリクラ帳へ
    if (where === 'both' || where === 'album') {
      // ⚠️ **プリクラ帳は1コマずつ、端末は3連シート**（2026-08-16、伊波さん
      //    「それか、3連1枚ずつ保存」）。帳では1枚ずつ大きく見返せて、
      //    失敗したコマだけ消せる。端末はSNSに上げるのでシートのまま。
      //    3コマぶん枠を使うので、いっぱいのときは**入った分だけ残す**
      //    （途中で断ってもすでに入れたものは消さない）
      const cells = await Promise.all([0, 1, 2].map(i => renderShot(i)));
      let r: Awaited<ReturnType<typeof album.add>> = { ok: true, count: albumHas };
      for (const c of cells) {
        if (!c) continue;
        r = await album.add(c.toDataURL('image/jpeg', 0.92), 1);
        if (!r.ok) break;
      }
      if (!r.ok && r.why === 'full') {
        // ⚠️ **勝手に消して場所を空けない。** 本人に選んで消してもらう
        setSaveMessage(`プリクラ帳がいっぱいです（${ALBUM_LIMIT}枚）。いらないものを消してね`);
        setTimeout(() => setSaveMessage(null), 5000);
        // 端末にも入れる約束だったなら、そちらは続ける
        if (where === 'album') return;
      } else if (!r.ok) {
        setSaveMessage(t('err_store_failed'));
        setTimeout(() => setSaveMessage(null), 4000);
        if (where === 'album') return;
      }
      // 入口に出す枚数を数え直す。しまえていてもいなくても、ここで揃える
      await refreshAlbumCount();
      if (r.ok && where === 'album') {
        setSaveMessage(`プリクラ帳に3枚しまいました（${r.count}/${ALBUM_LIMIT}）`);
        setTimeout(() => setSaveMessage(null), 3000);
        backToStart();
        return;
      }
    }

    // 端末へ。**インスタ用のときだけ作り直す**（2026-08-23）。
    // 1コマの縦を 16:9 まで詰めてから 4:5 の白い紙に置く。
    // いつもの保存は sheet をそのまま使うので、今までどおり
    const out = where === 'insta'
      ? toInstaSheet(await buildPhotoSheet(9 / 16) ?? sheet)
      : sheet;
    const blob = await new Promise<Blob | null>(res => out.toBlob(res, 'image/jpeg', 0.92));
    // ⚠️ **保存の終わりを待たずに戻すこと**（2026-08-18、伊波さん
    //    「すぐcamera選択（スタート）には戻らない（戻るけど遅い）」）。
    //    端末への書き出しは数秒かかる。待ってから戻すと、そのあいだ
    //    できあがりの画面で固まって見える。
    //    **先に戻して、保存は裏で続ける。** 終わったら真ん中に知らせが出る
    //    （.save-toast）ので、済んだことは分かる
    backToStart();
    if (blob) void save(blob, 'jpg');
  };

  /**
   * しまい終わったら「なにを撮る？」へ戻す（2026-08-16、伊波さん
   * 「保存終わったら、写真と動画選択画面へ」）。
   *
   * 撮ったものは片付ける。**残したまま戻すと、次に撮ろうとしたとき
   * 前の写真が出てくる。**
   */
  const backToStart = () => {
    setShots([]);
    setDecos([]);
    setPreviewUrl(null);
    setAskWhere(false);
    sheetRef.current = null;
    setSetupStep('kind');
    setScreen('setup');
  };

  /** プリクラ帳を開く。一覧は見本だけなので軽い */
  const openAlbum = async () => {
    const list = await album.list();
    // ⚠️ **wide が無い古いものを、ここで測って埋める**（2026-08-19）。
    //    wide は 8/19 から持つようにしたので、それ以前にしまった写真には
    //    入っていない。無いまま出すと横のまま並ぶ（伊波さんの実機で41枚が
    //    そうなっていた）。開いたときに一度だけ測って、次からは持っている
    const need = list.filter(it => it.wide === undefined);
    if (need.length) {
      // ⚠️ **onload ではなく decode() を使うこと**（2026-08-19）。
      //    onload は**すでに読めている絵では発火しないことがある**。
      //    それで古い41枚が横のまま並んでいた（伊波さん「できてない！！！」）。
      //    decode() は読み終わっていれば即座に返るので、取りこぼさない
      await Promise.all(need.map(async it => {
        try {
          const i = new Image();
          i.src = it.thumb;
          await i.decode();
          it.wide = i.naturalWidth > i.naturalHeight;
        } catch {
          it.wide = false;   // 読めない絵は回さない
        }
      }));
      void album.fillWide(need.map(it => ({ id: it.id, wide: !!it.wide })));
    }
    setAlbumList(list);
    setAlbumPicked(new Set());
    setAlbumEditing(false);
    setAlbumOpen(true);
  };

  /** 選んだものを消す */
  const deletePicked = async () => {
    if (!albumPicked.size) return;
    await album.remove(...albumPicked);
    const rest = await album.list();
    setAlbumList(rest);
    setAlbumHas(rest.length);
    setAlbumPicked(new Set());
    setAlbumEditing(false);
  };

  // 何枚入っているかを数える。**しまった直後と消した直後に呼ぶこと**。
  // 呼び忘れると入口の数字が古いまま残る
  const refreshAlbumCount = async () => {
    try { setAlbumHas(await album.countItems()); } catch { /* 数えられなくても動く */ }
  };
  useEffect(() => { void refreshAlbumCount(); }, []);

  // 撮り直し。撮影画面へ戻して、編集中のものを捨てる
  const retakePhotos = () => {
    setShots([]);
    setDecos([]);
    setPhotoText('');
    setScreen('video');
    setStartHint(true);
  };

  // デコるを1つ足す。まずは真ん中に置いて、指で動かしてもらう
  const addDeco = (kind: 'text' | 'stamp', value: string, color?: string) => {
    if (!value.trim()) return;
    decoSeq.current += 1;
    setDecos(prev => [...prev, {
      id: decoSeq.current,
      shot: activeShot,
      kind,
      value,
      x: 50,
      y: kind === 'text' ? 78 : 50,
      // ⚠️ **小さめに置くこと**（2026-08-23、伊波さん「今がデカすぎる」）。
      //    指2本のピンチで大きさを変えられるはずが、うまく掴めないことが
      //    ある（1本目が setPointerCapture でポインタを独占するため）。
      //    **変えられないなら、最初から小さいほうがいい。**
      //    大きくしたいときは指で広げれば足りる（9→7 / 14→11）
      size: kind === 'text' ? 7 : 11,
      // 色付きの記号スタンプ（音符など）は自分の色を持つ
      color: color ?? photoTextColor,
      // 文字はいま選んでいる傾きと書体で出す。スタンプはまっすぐ
      angle: kind === 'text' ? photoAngle : 0,
      font: kind === 'text' ? PHOTO_FONT : undefined,
    }]);
  };

  // 指でつまんで動かす。プリクラの落書きと同じで、置いてから位置を直せないと使えない。
  // 押している間だけ window で追いかける（指が絵の外へ出ても離さない）
  const [dragId, setDragId] = useState<number | null>(null);
  const bigShotRef = useRef<HTMLDivElement>(null);
  // ゴミ箱。飾りを指で運んできて、この上で離すと捨てる
  // （2026-08-14、伊波さん「飾りもテキストもゴミ箱みたいなとこで捨てる」
  // 「飾りを消すじゃなく、指で操作」）。
  // over は「いま口が開いている」＝離せば捨てる、の合図
  const trashRef = useRef<HTMLDivElement>(null);
  const [overTrash, setOverTrash] = useState(false);
  // できあがりの見本。保存の前に、3枚が1枚になった姿を見せる
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ---- プリクラ帳（2026-08-15）------------------------------------------
  // 伊波さん「プリクラ帳機能はできない？」「写真だけ」「50枚」
  // 「勝手に消すんじゃなく」「自分で選んで消せるように」。
  // 撮ったプリクラをファイルに貼って見せ合った、あの感覚をアプリの中に。
  /** 保存先を選ぶ画面を出しているか */
  const [askWhere, setAskWhere] = useState(false);
  /** プリクラ帳の一覧（見本だけ。本体は開いたときに読む） */
  const [albumList, setAlbumList] = useState<AlbumItem[]>([]);
  /** プリクラ帳を開いているか */
  const [albumOpen, setAlbumOpen] = useState(false);
  /** 大きく見ている1枚 */
  const [albumView, setAlbumView] = useState<AlbumItem | null>(null);
  /** 消すために選んだもの */
  const [albumPicked, setAlbumPicked] = useState<Set<number>>(new Set());
  /** 消すモードかどうか */
  const [albumEditing, setAlbumEditing] = useState(false);
  /** いま何枚入っているか。0枚なら入口を出さない */
  const [albumHas, setAlbumHas] = useState(0);
  const [previewBusy, setPreviewBusy] = useState(false);
  // 撮れた動画。止めた直後に黙って保存すると、何が起きたのか分からない
  // （2026-08-14、伊波さん「停止後の操作が不明」
  // 「録画停止後すぐ保存しますか？を出す？」）。
  // 写真と同じで、見てから保存するかを決められるようにする
  const [madeVideo, setMadeVideo] = useState<{ blob: Blob; ext: string; url: string } | null>(null);
  const overTrashRef = useRef(false);
  // 指がゴミ箱の上に来ているか。離した瞬間に state を読むと
  // 反映前の古い値を見ることがあるので、ref にも同じものを持つ
  const hitTrash = (x: number, y: number) => {
    const r = trashRef.current?.getBoundingClientRect();
    if (!r) return false;
    // 指の位置ぴったりだと入れづらいので、少しだけ広げて判定する
    const pad = 14;
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  };

  // 指の当たっている場所を覚えておく。2本になったらひねりと開き具合を見る
  const ptrsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // 2本指を置いた瞬間の状態。ここからの差でどれだけ回したか・広げたかを出す
  const gestureRef = useRef<{ angle: number; dist: number; startAngle: number; startSize: number } | null>(null);

  const startDrag = (id: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    ptrsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragId(id);
  };
  useEffect(() => {
    if (dragId === null) return;
    const ptrs = ptrsRef.current;

    const move = (e: PointerEvent) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const box = bigShotRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      const pts = [...ptrs.values()];

      // 指2本 … ひねって傾ける／広げて大きさを変える
      // （2026-08-14、伊波さん「文字の傾きはそれこそ指でできない？」）。
      // つまみを1本消せるので、画面も1行ぶん短くなる
      if (pts.length >= 2) {
        const [a, b] = pts;
        const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        if (!gestureRef.current) {
          const cur = decosRef.current.find(d => d.id === dragId);
          gestureRef.current = { angle, dist, startAngle: cur?.angle ?? 0, startSize: cur?.size ?? 9 };
          return;
        }
        const g = gestureRef.current;
        const turned = angle - g.angle;
        const scale = g.dist > 0 ? dist / g.dist : 1;
        setDecos(prev => prev.map(d => d.id === dragId
          ? {
              ...d,
              angle: Math.max(-180, Math.min(180, Math.round(g.startAngle + turned))),
              size: Math.max(3, Math.min(60, +(g.startSize * scale).toFixed(1))),
            }
          : d));
        return;
      }

      // 指1本 … いままで通り、つまんで動かす
      gestureRef.current = null;
      // ゴミ箱の上に来たら口を開けて知らせる。捨てるのは離した時
      const on = hitTrash(e.clientX, e.clientY);
      if (on !== overTrashRef.current) { overTrashRef.current = on; setOverTrash(on); }
      const x = ((e.clientX - box.left) / box.width) * 100;
      const y = ((e.clientY - box.top) / box.height) * 100;
      setDecos(prev => prev.map(d => d.id === dragId
        ? { ...d, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
        : d));
    };
    const up = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      // 2本目を離したら、次に置き直したときに測り直す
      gestureRef.current = null;
      if (ptrs.size === 0) {
        // ゴミ箱の上で離したら捨てる
        if (overTrashRef.current) {
          setDecos(prev => prev.filter(d => d.id !== dragId));
        }
        overTrashRef.current = false;
        setOverTrash(false);
        setDragId(null);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragId]);

  void shoot;

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
        watermark: 'tinyCUBE',   // 常に入れる（上の useEffect と同じ理由）
        // ここで保存はしない。撮れたものを見せてから決めてもらう
        onFinish: (blob, ext) => {
          setMadeVideo({ blob, ext, url: URL.createObjectURL(blob) });
        },
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
        {/* しまっているあいだ。共有シートが開くまで数秒かかることがあるので、
            **動くもの**を出して「止まっていない」と伝える。
            文字だけだと固まったように見える（2026-08-16、伊波さん
            「保存のタイムラグ」） */}
        {saveBusy && (
          <div className="save-busy">
            <div className="save-busy-inner">
              <div className="save-busy-dots"><span /><span /><span /></div>
              <div className="save-busy-text">{t('msg_storing')}</div>
              <div className="save-busy-note">{t('msg_wait')}</div>
            </div>
          </div>
        )}
        {camInfo && <div className="cam-info">{camInfo}</div>}
        {countdown !== null && <div className="countdown">{countdown}</div>}
        {/* 何枚目を撮っているか。3枚撮ったことが数で分かるようにする */}
        {burstNo !== null && <div className="burst-no">{burstNo} / 3</div>}
        {/* ズーム欄（.cam-tune）は別の親（.ui-layer）にあるので、
            CSS の :has() では位置を合わせられない。**出ているかどうかを
            クラスで渡すこと。** ここを CSS だけで解こうとして一度失敗した
            （2026-08-14）。ズーム欄と重なると、どちらも読めなくなる */}
        {shape === 'landscape' && portraitDevice ? (
          <div className={`turn-hint ${camOn && !isRecording ? (camTuneOpen ? 'above-tune' : 'above-tune-folded') : ''}`}>{t('warn_land_frame1')}<br/>{t('warn_land_frame2')}</div>
        ) : startHint && !isRecording ? (
          /* 誘導は説明より強い。初めて撮影画面に来た人に、押す場所だけ示す
             （2026-08-12、伊波さん「説明見てわからないなら、誘導が１番でしょ？」） */
          <div className={`turn-hint start-hint ${camOn && !isRecording ? (camTuneOpen ? 'above-tune' : 'above-tune-folded') : ''}`}>{t('msg_push_record')}</div>
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
            <button className="tool-btn-small" onClick={() => setScreen('setup')} title="設定に戻る" style={{ width: 'auto', padding: '0 12px', fontSize: '13px', fontWeight: 'bold' }}>{t('btn_back')}</button>
            <button className="tool-btn-small" onClick={() => setScreen('manner')} title="使い方">❓</button>
            {/* Discord から会社HPへ差し替えた（2026-08-15、伊波さん
                「ディスコードよりインスタのほうがいい？」
                →「会社のSNS並んでるページにする？」）。
                Discord は誰もいない状態で、空のサーバーに招くと逆効果。
                HP のフッターに Instagram / TikTok / X / YouTube が
                並んでいるので、そこへ送れば見た人が好きなところへ行ける。
                **製品から製品へは直リンクせず、会社HPをハブにする**方針にも合う。
                絵文字は 👾（ゲーム機）だと会社のページだと伝わらないので 🏠 に */}
            <button className="tool-btn-small" onClick={() => window.open('https://cubicenginestudio.vercel.app/', '_blank', 'noopener,noreferrer')} title="CUBICENGINEstudio（SNSはこちら）">🏠</button>
          </div>
        </header>

        {/* 録画ボタン */}
        <footer className="bottom-controls">
          {/* 左端の「設定」も外した。ヘッダー右上の「戻る」が同じ場所へ行く
              （2026-08-14、伊波さん「その隣は設定だから戻るボタンと重複」） */}
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
              <span className="ctrl-label">{isBursting ? t('msg_shooting') : t('btn_shoot_3')}</span>
            </button>
          ) : (
          <>
          {/* 動画のときの「写真」ボタンは外した。写真を撮りたい人は
              最初の「なにを撮る？」で写真を選ぶ道があるので重複していた
              （2026-08-14、伊波さん「動画撮影ページの写真のボタン削除」） */}
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
        {/* 畳めるようにしてある（2026-08-14、伊波さん「横にしたら画面が
            ズーム画面でおおわれてる、畳めるようにして」）。
            横持ちだと画面の高さが390pxしかなく、この欄の145pxが真ん中を
            占領して映像が見えなくなる。畳むと見出しの一行だけになる */}
        {/* **顔ハメの枠を選んだときだけ出す。**
            ズームは「顔を穴に合わせる」ための道具なので、穴の無い枠では
            使い道が無く、映像を覆うだけになる（2026-08-14、伊波さん
            「カメラズームのボタンが邪魔。顔はめ以外ズーム隠したら？」）。
            前後の切り替えも一緒に隠れるが、設定画面から変えられる */}
        {camOn && !isRecording && isFaceHoleFrame && (
          <div className={`cam-tune ${camTuneOpen ? '' : 'folded'}`}>
            <button
              className="cam-tune-toggle"
              onClick={() => setCamTuneOpen(o => !o)}
            >
              <span>{t('tab_cam_zoom')}</span>
              <span className="cam-tune-caret">{camTuneOpen ? '▼' : '▲'}</span>
            </button>
            <div className="cam-tune-row">
              <button
                className={`cam-face-btn ${camFront ? 'on' : ''}`}
                onClick={() => startCam(true)}
              >{t('btn_cam_in')}</button>
              <button
                className={`cam-face-btn ${!camFront ? 'on' : ''}`}
                onClick={() => startCam(false)}
              >{t('btn_cam_out')}</button>
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
            {/* 説明の行は外した。＋−とスライダーがあれば何をするかは分かる
                （2026-08-14、伊波さん「ズームは説明つけなくていいんじゃない？」
                「だいたいわかるよ」）。いまの倍率だけ小さく出す */}
            <div className="cam-tune-label">{Math.round(camZoom * 100)}%</div>
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
            {/* エフェクトが上、音が下（2026-08-14、伊波さん
                「音ボタンとエフェクトボタン上下入れ替え」）。
                前は音が上・エフェクトが下だった */}
            {/* ⚠️ **残すのはフラッシュだけ**（2026-08-23、伊波さん
                「フラッシュだけ、ミラーボールは先に」）。
                ミラーボールとエモいは撮る前に選んでかけっぱなしにする形へ
                移した。押しに行った指がレンズに被るため、撮影中に触るものは
                減らす（「自撮りにすると指でカメラが隠れる」）。
                フラッシュだけは**押した瞬間に光る**のが持ち味なので残す */}
            <button className="effect-btn btn-burst" onClick={() => fire('flash')}>
              <RailFace id="flash" label={t('eff_flash')} />
            </button>
            {/* 音は3つ（08cf11c「かんたん化」。10個＋自作枠2個から減らした） */}
            {(['clap', 'drum', 'blip'] as const)
              .map(id => (
                <button key={id} className="effect-btn btn-sound" onClick={() => fire(id)}>
                  <RailFace id={id} label={t(('eff_' + id) as never)} />
                </button>
              ))}
          </div>
        </div>

        {/* 右側のテロップパネル。
            ⚠️ **自動で出すときは柱ごと消す**（2026-08-23、伊波さん
            「文字も先に出し方決めて、ボタン消そう」）。押す必要が無いのに
            残しておくと、自撮りで**押しに行った指がレンズに被る**
            （「自撮りにすると指でカメラが隠れる」）。
            出しっぱなしより、無いほうがいい */}
        {telopMode === 'tap' && (
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
        )}
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
              >{t('lang_ja')}</button>
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
                  <details><summary>{t('btn_detail')}</summary>{t('guide_warn3_desc')}</details>
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

            {/* クレジット。このアプリを作るのを支えた人の名前を残す場所。
                （2026-08-14、伊波さんの依頼）

                **「なっとうサイダー」の表記を消さないこと。**
                このアプリは、彼が「Claude を使ってアプリを作りたい」と
                伊波さんを説得し、**お小遣いを全額あてて開発費を出した**ことで
                成り立っている。名前を出すことは本人の同意を得ている。

                肩書きは「テクニカルサポート」。本人が自分の実績として
                示せるようにするためのもので、飾りではない。
                文言を変えるときは伊波さんに確認すること */}
            <div className="credits">
              <div className="credits-head">{t('about_app')}</div>
              <dl className="credits-list">
                <div className="credits-row">
                  <dt>{t('about_planning')}</dt>
                  <dd>CUBICENGINEstudio</dd>
                </div>
                <div className="credits-row">
                  <dt>{t('about_tech')}</dt>
                  <dd>{t('about_natto')}</dd>
                </div>
              </dl>
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
              {setupStep === 'kind' ? t('title_what_to_shoot')
                : setupStep === 'mode' ? t('title_which_cam')
                : setupStep === 'telop' ? t('title_edit_stamp')
                : ''}
            </h2>
            {/* 段階を1つ戻す。前は「撮影画面へ飛ぶ」だけだったので、
                設定の途中で押しても戻れなかった（2026-08-13、伊波さん
                「戻るが戻れない」）。1段目のときだけ撮影画面へ返す */}
            {/* どの段でも同じ場所に出す。段ごとに置き場所が変わると、
                そこにあると思って探せない（2026-08-13、伊波さん
                「フレーム選択の戻るボタン気づかなかったよ？元の場所へ」） */}
            {/* いちばん最初の画面では戻る先が無いので「終わる」と出す
                （2026-08-14、伊波さん「戻るはアプリ閉じるがいいかも？」） */}
            <button
              className="setup-close-btn"
              title={setupStep === 'kind' ? 'アプリを終わる' : 'もどる'}
              onClick={goBackStep}
            >{setupStep === 'kind' ? t('btn_quit') : t('btn_back')}</button>
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
              <h3 className="setup-section-title">{t('title_what_to_shoot')}</h3>
              <div className="kind-picker">
                <button
                  className={`kind-btn ${captureKind === 'photo' ? 'on' : ''}`}
                  onClick={() => pickKind('photo')}
                >
                  <span className="kind-icon">📸</span>
                  <span className="kind-title">{t('btn_take_photo')}</span>
                  <span className="kind-note">{t('kind_photo_note')}</span>
                </button>
                <button
                  className={`kind-btn ${captureKind === 'video' ? 'on' : ''}`}
                  onClick={() => pickKind('video')}
                >
                  <span className="kind-icon">🎬</span>
                  <span className="kind-title">{t('btn_take_video')}</span>
                  <span className="kind-note">{t('kind_video_note')}</span>
                </button>
              </div>

              {/* プリクラ帳への入口（2026-08-15）。
                  「なにを撮る？」のすぐ下に置く。
                  ⚠️ **0枚でも出すこと。**（伊波さん「プリクラ帳自体は
                  なにを撮る？のページにいつでも開けるように置いておいて」）
                  最初は空でも、そこに置き場所があると分かるほうが大事。
                  隠すと「どこにあるの？」になる */}
              <button className="album-open-btn" onClick={openAlbum}>
                <span className="album-open-emoji">📖</span>
                <span className="album-open-label">{t('tab_album')}</span>
                <span className="album-open-count">
                  {albumHas > 0 ? `${albumHas}/${ALBUM_LIMIT}` : t('msg_album_empty')}
                </span>
              </button>

              <div style={{ textAlign: 'center', padding: '24px 0 0', fontSize: '10px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
                <a href="https://cubicenginestudio.vercel.app/" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                  ©２０２６CUBICENGINEstudio
                </a>
              </div>
            </div>
            )}

            {setupStep === 'mode' && (
            <div className="setup-section highlight-section" style={{ marginBottom: 12 }}>
              <h3 className="setup-section-title">{t('title_which_cam')}</h3>
              {/* カメラ2つが主役。動画ファイルは「持っている人だけ」が使うものなので、
                  同じ列に並べず、下に説明を添えて置く（2026-08-13、伊波さん） */}
              {/* 「インカメ／アウトカメ」では通じない。何が写るかで書く
                  （2026-08-14、伊波さん「cameraの選択がわからない（ユーザー50代から）」） */}
              <div className="source-picker">
                {/* ⚠️ 絵文字に戻さないこと。🤳 は端末ごとに絵が違い、
                    何の絵か分からなかった（2026-08-15、伊波さん）。
                    SVG なら端末が変わっても同じ絵になる。中身は CamIcon.tsx */}
                <button className={`source-btn ${camOn && camFront ? 'on' : ''}`} onClick={() => startCam(true)}>
                  <span className="source-icon"><FaceIcon on={camOn && camFront} /></span>
                  <span className="source-text">{t('desc_shoot_self')}</span>
                  <span className="source-sub">{t('desc_cam_in')}</span>
                </button>
                <button className={`source-btn ${camOn && !camFront ? 'on' : ''}`} onClick={() => startCam(false)}>
                  <span className="source-icon"><SceneIcon on={camOn && !camFront} /></span>
                  {/* 「前を写す」だと自分の前なのか画面の前なのか紛れる。
                      呼び名のほうを主にする（2026-08-14、伊波さん
                      「外カメの前の表記は外カメで」） */}
                  <span className="source-text">外カメ</span>
                  <span className="source-sub">{t('desc_shoot_world')}</span>
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
                  <button className={!loopVideo ? 'on' : ''} onClick={() => setLoopVideo(false)}>{t('btn_loop_no')}</button>
                  <button className={loopVideo ? 'on' : ''} onClick={() => setLoopVideo(true)}>{t('btn_loop_yes')}</button>
                </div>
              )}
              {/* 選べていないうちは先へ進ませない。押せないボタンを出すより、
                  選んだ瞬間に出すほうが「次に何をするか」が分かる */}
              {(camOn || videoSrc) && (
                <button
                  className="start-btn"
                  style={{ marginTop: 16 }}
                  onClick={() => setSetupStep('frame')}
                >{t('title_choose_frame')}</button>
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
              >{t('btn_decide_frame')}</button>

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
                  <span style={{ color: '#a855f7', lineHeight: 1.3 }}>{t('my_frame')}<br />{t('btn_add')}</span>
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
                        if (confirm(t('confirm_del_frame'))) {
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
                {/* 並び順は frames.ts の FRONT_ORDER で決めている。
                    目を引くもの → 平成 → 推し色 → 残りは書いた順。
                    **分類のタブは付けない**（2026-08-15、伊波さん
                    「あえて、分類しないで、見つけていく楽しさもあるよね」） */}
                {inDisplayOrder(FRAMES.filter(f => fitsShape(f, shape))).map(f => (
                  <button
                    key={f.id}
                    className={`frame-tile ${frameId === f.id ? 'on' : ''} ${locked(f) ? 'locked' : ''}`}
                    onClick={() => (locked(f) ? showUnlock() : setFrameId(f.id))}
                    title={locked(f) ? t('locked_hint') : f.name}
                  >
                    {/* 一覧は**見本の絵**を使う。元の絵は 1400px、タイルは 145px ほどで、
                        1/10 近くまで潰すと細かい飾りがギザギザに割れる
                        （2026-08-16、伊波さん「絵が汚いまま」）。
                        見本は 320px に縮めてあるので、そのまま出せばきれいに見える。
                        ⚠️ **撮影側は元の絵のまま。** ここは見本なので、透明が
                        抜けている必要はない（伊波さん「こっちは、抜かれてる絵じゃ
                        なくてもいい」「撮影の時にちゃんとできてればいい」）。
                        見本が無いものは元の絵に落ちる */}
                    <img
                      src={f.file.replace('./frames/', './frames/thumb/') + '?v=20260816_thumb'}
                      alt={f.name}
                      loading="lazy"
                      onError={e => {
                        const el = e.currentTarget;
                        if (!el.dataset.fellBack) {
                          el.dataset.fellBack = '1';
                          el.src = f.file + '?v=20260813_raw';
                        }
                      }}
                    />
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
                    {/* 2026-08-15、全部無料にした（[[unlock.ts]] の isUnlocked）。
                        ここは元「買った人へのお知らせ」。いまは開発者からの
                        あいさつを出す。キーの表示と「解除をやめる」ボタンは、
                        買う仕組みが動いていない以上どちらも意味がないので外した */}
                    <b className="unlock-done">{t('unlock_done')}</b>
                    <p className="sheet-note">{t('unlock_done_note')}</p>
                  </>
                ) : (
                  <>
                    <b className="unlock-title">{t('unlock_title')}</b>
                    <p className="sheet-note">{t('unlock_lead')}</p>
                    <ul className="unlock-points">
                      <li>{t('unlock_p1')}</li>
                      <li>{t('unlock_p2')}</li>
                    </ul>
                    {/* アプリでは Play の課金、Web では外の売り場（上のコメントを見ること）*/}
                    {inApp ? (
                      <>
                        <button className="unlock-buy" onClick={buyNow} disabled={buyBusy}>
                          {buyBusy ? '…' : t('unlock_buy_app')}
                        </button>
                        {/* 買ったのに解けていない人の逃げ道。機種変えのあとなど。
                            これが無いと「払ったのに使えない」で終わってしまう */}
                        <button className="unlock-restore" onClick={restoreNow} disabled={buyBusy}>
                          {t('unlock_restore')}
                        </button>
                        {buyNG && <p className="unlock-ng">{t('unlock_buy_ng')}</p>}
                      </>
                    ) : (
                      <a className="unlock-buy" href={buyUrl} target="_blank" rel="noopener noreferrer">{t('unlock_buy')}</a>
                    )}
                    {/* キー入力は Web だけ。アプリに残すと「外で買う道」に見えて
                        審査で引っかかる（買った人は Play が覚えているので要らない）*/}
                    {!inApp && (
                      <>
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
              {/* 見出しを1つずつ立てると50px×3、説明文で42px。それだけで
                  画面からはみ出す。写真側と同じく、小さな札を操作の左に
                  添える形にしてスクロールを無くす（2026-08-14、伊波さん
                  「動画のテキストスタンプのページもスクロールなしで」）。
                  説明は入力欄の透かしへ移した */}
              <h3 className="setup-section-title">{t('title_edit_stamp')}</h3>
              <div className="telop-inputs">
                {myTelops.map((text, i) => (
                  <div className="telop-row" key={i}>
                    <span className="slot-no telop">{i + 1}</span>
                    <input
                      className="telop-input"
                      value={text}
                      maxLength={20}
                      placeholder="好きな言葉を入れてね"
                      onChange={e => setTelop(i, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              {/* 動きの飾り（2026-08-23、伊波さん「ミラーボールは先に」）。
                  撮っているあいだずっと出る。撮影中に押さなくて済む */}
              <div className="opt-row">
                <span className="opt-label wide">{t('title_ambient')}</span>
                <div className="shape-switch">
                  <button className={!ambientOn ? 'on' : ''} onClick={() => pickAmbient(null)}>{t('tone_none')}</button>
                  <button className={ambientOn === 'emotional' ? 'on' : ''} onClick={() => pickAmbient('emotional')}>{t('eff_emotional')}</button>
                  <button className={ambientOn === 'mirrorball' ? 'on' : ''} onClick={() => pickAmbient('mirrorball')}>{t('eff_mirrorball')}</button>
                </div>
              </div>

              {/* 色味（2026-08-23、伊波さん「エフェクトも初めから選んで
                  撮影中は出しておこう」）。撮っているあいだずっとかかる。
                  フラッシュは一瞬のものでかけっぱなしにできないので、
                  代わりに色味を置いた */}
              <div className="opt-row">
                <span className="opt-label wide">{t('title_tone')}</span>
                <div className="shape-switch">
                  <button className={!tone ? 'on' : ''} onClick={() => pickTone(null)}>{t('tone_none')}</button>
                  <button className={tone === 'warm' ? 'on' : ''} onClick={() => pickTone('warm')}>{t('tone_warm')}</button>
                  <button className={tone === 'cool' ? 'on' : ''} onClick={() => pickTone('cool')}>{t('tone_cool')}</button>
                  <button className={tone === 'vivid' ? 'on' : ''} onClick={() => pickTone('vivid')}>{t('tone_vivid')}</button>
                </div>
              </div>

              {/* 出し方（2026-08-23、伊波さん「文字の出現も自動で出す方が
                  やりやすい」）。自撮りは押しに行った指がレンズに被るので、
                  撮る前に決めておけば撮影中は何も触らずに済む */}
              <div className="opt-row">
                <span className="opt-label wide">{t('title_telop_mode')}</span>
                <div className="shape-switch">
                  <button className={telopMode === 'tap' ? 'on' : ''} onClick={() => pickTelopMode('tap')}>{t('telop_tap')}</button>
                  <button className={telopMode === 'random' ? 'on' : ''} onClick={() => pickTelopMode('random')}>{t('telop_auto_random')}</button>
                  <button className={telopMode === 'order' ? 'on' : ''} onClick={() => pickTelopMode('order')}>{t('telop_auto_order')}</button>
                </div>
              </div>

              <div className="opt-row">
                <span className="opt-label">{t('title_position')}</span>
                <div className="shape-switch">
                  <button className={!telopRandom ? 'on' : ''} onClick={() => pickTelopPos(false)}>{t('telop_center')}</button>
                  <button className={telopRandom ? 'on' : ''} onClick={() => pickTelopPos(true)}>{t('telop_random')}</button>
                </div>
              </div>

              <div className="opt-row">
                <span className="opt-label">{t('label_color')}</span>
                <div className="shape-switch">
                  <button className={!telopDark ? 'on' : ''} onClick={() => pickTelopColor(false)}>{t('telop_white')}</button>
                  <button className={telopDark ? 'on' : ''} onClick={() => pickTelopColor(true)}>{t('telop_black')}</button>
                </div>
              </div>

              {/* 利き手。録画ボタンを持つ手に合わせる */}
              {/* 何のボタンの位置か分からないので「録画ボタン」と言い切る
                  （2026-08-14、伊波さん「ボタンの位置の文言は
                  録画ボタンの位置に変更」）。札は2行で置く */}
              <div className="opt-row">
                <span className="opt-label wide">{t('title_rec_btn_pos')}</span>
                <div className="shape-switch">
                  <button className={hand === 'right' ? 'on' : ''} onClick={() => setHand('right')}>右</button>
                  <button className={hand === 'left' ? 'on' : ''} onClick={() => setHand('left')}>左</button>
                </div>
              </div>

              {/* 動画の音の扱い。動画を読み込んだ人にだけ関わる */}
              {videoSrc && (
                <div className="opt-row">
                  <span className="opt-label">音</span>
                  <div className="shape-switch">
                    <button className={useSrcAudio === 'mic' ? 'on' : ''} onClick={() => pickSrcAudio('mic')}>{t('srcaudio_mic')}</button>
                    <button className={useSrcAudio === 'mix' ? 'on' : ''} onClick={() => pickSrcAudio('mix')}>{t('srcaudio_mix')}</button>
                    <button className={useSrcAudio === 'off' ? 'on' : ''} onClick={() => pickSrcAudio('off')}>{t('srcaudio_off')}</button>
                  </div>
                </div>
              )}

              {/* 「撮る」はいちばん最後。前は真ん中にあって、その下にも
                  設定が続いていた（押したあとに気づく並びだった） */}
              <button
                className="start-btn"
                style={{ marginTop: 14, width: '100%' }}
                onClick={() => setScreen('video')}
              >{t('btn_shoot_with_setting')}</button>
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
              onClick={retakePhotos}
            >{t('btn_reshoot')}</button>
          </div>

          <div className="setup-content">
            {/* 大きい1枚。ここに乗せたものが写真に焼かれる */}
            <div className="shot-big" ref={bigShotRef}>
              <img src={shots[activeShot]} alt={`${activeShot + 1}枚目`} />
              {decos.filter(d => d.shot === activeShot).map(d => (
                <div
                  key={d.id}
                  className={`deco deco-${d.kind} ${dragId === d.id ? 'dragging' : ''}`}
                  style={{
                    left: `${d.x}%`,
                    top: `${d.y}%`,
                    // 中央へ寄せてから回す。回してから寄せると位置がずれる
                    transform: `translate(-50%, -50%) rotate(${d.angle}deg)`,
                    fontSize: `${d.size}cqw`,
                    // 文字と、色付きの記号スタンプ（音符）は色を持つ。
                    // 絵文字のスタンプは色を当てても効かないので触らない
                    color: d.kind === 'text' || !/\p{Extended_Pictographic}/u.test(d.value)
                      ? d.color : undefined,
                    fontFamily: d.kind === 'text' ? (d.font ?? PHOTO_FONT) : undefined,
                    // 白い文字は白い服に沈むので、必ず縁を付ける
                    WebkitTextStroke: d.kind === 'text'
                      ? `0.08em ${d.color === '#ffffff' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.9)'}`
                      : undefined,
                    paintOrder: 'stroke fill',
                  } as React.CSSProperties}
                  onPointerDown={startDrag(d.id)}
                >
                  {/* ✕ は外した。ゴミ箱まで運んで捨てる方式にしたので、
                      飾りの上に小さなボタンを置く必要がなくなった
                      （2026-08-14、伊波さん「指で操作」）。
                      小さい飾りだと ✕ が本体に被って押しづらくもあった */}
                  {d.value}
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

              {/* ゴミ箱。飾りを指で運んできて、この上で離すと捨てる。
                  **写真の外に置くこと。** 写真の中に置いたら、飾りを置きたい
                  場所と重なって意図せず捨ててしまった（2026-08-14、伊波さん
                  「スタンプのごみ箱が大きい写真に被ってすぐ捨てられてしまう」）。
                  待機の列の場所へ、その手前に浮かせる。写真の外なので飾りとは
                  重ならず、待機写真より前面なので隠れもしない。
                  掴んでいるあいだだけ出す */}
              <div
                ref={trashRef}
                className={`deco-trash ${dragId !== null ? 'show' : ''} ${overTrash ? 'over' : ''}`}
                aria-hidden={dragId === null}
              >
                <span className="trash-icon">🗑</span>
                <span className="trash-label">{overTrash ? t('msg_release_del') : t('msg_drop_here')}</span>
              </div>
            </div>

            {/* らくがきスタンプ（文字）とデコスタンプ（絵）は1つの画面で
                切り替える（2026-08-14、伊波さん「らくがきスタンプと
                デコスタンプ同じ画面で切り替えできるようにしたら？」）。
                前は「文字 → つぎへ → デコる」の2画面で、片方を直すたびに
                行き来していた。保存はタブの外に置いて、どちらからでも押せる */}
            <div className="setup-section highlight-section">
              <div className="deco-tabs">
                <button
                  className={`deco-tab ${photoStep === 'text' ? 'on' : ''}`}
                  onClick={() => setPhotoStep('text')}
                >{t('tab_doodle')}</button>
                <button
                  className={`deco-tab ${photoStep === 'deco' ? 'on' : ''}`}
                  onClick={() => setPhotoStep('deco')}
                >{t('tab_deco')}</button>
              </div>

              {photoStep === 'text' ? (
              <>
                <div className="telop-row">
                  <input
                    className="telop-input"
                    value={photoText}
                    maxLength={20}
                    placeholder="好きな言葉でスタンプ作れるよ"
                    onChange={e => setPhotoText(e.target.value)}
                  />
                </div>

                <div className="opt-row">
                  <span className="opt-label">{t('label_shape')}</span>
                  <div className="font-picker">
                    {PHOTO_FONTS.map(f => (
                      <button
                        key={f.id}
                        className={`font-btn ${photoFontId === f.id ? 'on' : ''}`}
                        style={{ fontFamily: f.css }}
                        onClick={() => {
                          setPhotoFontId(f.id);
                          setDecos(prev => prev.map(d =>
                            d.shot === activeShot && d.kind === 'text' ? { ...d, font: f.css } : d));
                        }}
                      >{f.name}</button>
                    ))}
                  </div>
                </div>

                <div className="opt-row">
                  <span className="opt-label">{t('label_color')}</span>
                  <div className="color-picker">
                    {TEXT_COLORS.map(c => (
                      <button
                        key={c}
                        className={`color-dot ${photoTextColor === c ? 'on' : ''}`}
                        style={{ background: c }}
                        onClick={() => {
                          setPhotoTextColor(c);
                          setDecos(prev => prev.map(d =>
                            d.shot === activeShot && d.kind === 'text' ? { ...d, color: c } : d));
                        }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>

                <button
                  className="start-btn"
                  style={{ width: '100%' }}
                  onClick={() => { addDeco('text', photoText); setPhotoText(''); }}
                  disabled={!photoText.trim()}
                >{t('btn_make_stamp')}</button>
              </>
              ) : (
              <>
                <div className="stamp-picker">
                  {STAMPS.map(st => (
                    <button
                      key={st.v}
                      className={`stamp-btn ${st.color ? 'glyph' : ''}`}
                      style={st.color ? { color: st.color } : undefined}
                      onClick={() => addDeco('stamp', st.v, st.color)}
                    >{st.v}</button>
                  ))}
                </div>

                {/* 「小さく／大きく」のボタンは外した。写真の上で2本指を
                    広げれば大きさが変わるので重複していた（2026-08-14、
                    伊波さん「デコスタンプも大きさ指でできない？」
                    「大きさボタン消して」）。1行ぶん画面も短くなる */}
              </>
              )}

              {/* 指の使い方はどちらのタブでも同じなので、タブの外に一度だけ */}
              <p className="sheet-note gesture-hint">{t('msg_deco_hint')}</p>

              {/* 保存と片付けはタブの外。どちらを開いていても押せる */}
              {/* 「飾りを消す」も「撮り直す」も外した。
                  飾りは1つずつゴミ箱へ運んで捨てる。撮り直すは右上に同じものが
                  あって重複していた（2026-08-14、伊波さん「飾りを消すじゃなく、
                  指で操作」「撮り直すも重複上だけあればいい」） */}

              {/* 保存の前に、できあがりを見せる（2026-08-14、伊波さん
                  「保存する前にできあがり！！！見れるように」）。
                  3枚が1枚に並んだ姿は、ここまで一度も見えていない */}
              <button
                className="start-btn save-btn"
                style={{ width: '100%' }}
                onClick={openPreview}
                disabled={previewBusy}
              >{previewBusy ? t('msg_making') : t('btn_see_result')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ブラウザが閉じさせてくれなかったとき。
          自分で開いたタブ以外は window.close() が黙って無視されるので、
          何も起きないように見える。そのときだけ出す */}
      {cantClose && (
        <div className="preview-screen" onClick={() => setCantClose(false)}>
          <div className="preview-inner" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            {/* 「おつかれさま」だと、そこで終わりの挨拶になる。また遊びに
                来てほしいので「また来てね」にした（2026-08-16、伊波さん
                「最後のページはお疲れ様、じゃなく、また来てね」） */}
            <div className="preview-head">{t('msg_come_again')}</div>
            <p className="sheet-note" style={{ textAlign: 'center', lineHeight: 1.8 }}>
              カメラは止めました。<br />
              このページはブラウザのタブを閉じて終わってください。
            </p>
            <div className="preview-btns">
              <button className="sub-btn" onClick={() => setCantClose(false)}>{t('btn_return')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 録画のあと。止めた直後に黙って保存すると、何が起きたのか
          分からない（2026-08-14、伊波さん「停止後の操作が不明」
          「今の動画を保存しますか？やりなおしますか？の選択かな」）。
          撮れたものをその場で見て、保存かやりなおしかを選ぶ */}
      {madeVideo && (
        <div className="preview-screen">
          <div className="preview-inner" onClick={e => e.stopPropagation()}>
            <div className="preview-head">{t('msg_photo_taken')}</div>
            <div className="preview-sheet">
              {/* 音も出す。撮れた声が入っているか、ここで確かめられる */}
              <video src={madeVideo.url} controls playsInline autoPlay loop />
            </div>
            <div className="preview-btns">
              <button
                className="sub-btn"
                onClick={() => {
                  URL.revokeObjectURL(madeVideo.url);
                  setMadeVideo(null);
                  setStartHint(true);
                }}
              >{t('btn_redo')}</button>
              <button
                className="start-btn save-btn preview-save"
                onClick={async () => {
                  await save(madeVideo.blob, madeVideo.ext);
                  URL.revokeObjectURL(madeVideo.url);
                  setMadeVideo(null);
                }}
              >{t('btn_save_video')}</button>
            </div>
          </div>
        </div>
      )}

      {/* できあがりの見本。ここで初めて「3枚が1枚になった姿」が見える。
          気に入らなければ閉じて直せる（2026-08-14、伊波さん
          「保存する前にできあがり！！！見れるように」） */}
      {previewUrl && (
        <div className="preview-screen" onClick={() => setPreviewUrl(null)}>
          <div className="preview-inner" onClick={e => e.stopPropagation()}>
            <div className="preview-head">{t('msg_done')}</div>
            <div className="preview-sheet">
              <img src={previewUrl} alt="できあがり" />
            </div>
            <div className="preview-btns">
              <button
                className="sub-btn"
                onClick={() => setPreviewUrl(null)}
              >{t('btn_back_to_edit')}</button>
              <button
                className="start-btn save-btn preview-save"
                onClick={() => setAskWhere(true)}
              >{t('btn_save_this')}</button>
            </div>
          </div>
        </div>
      )}

      {/* どこへしまうか選ぶ（2026-08-15、伊波さん
          「保存の時にプリクラ帳と端末保存、自分の端末保存のみ、保存しない
            みたいな」）。
          「保存しない」は取り消しなので、preview に戻さず閉じるだけ */}
      {askWhere && (
        <div className="where-screen" onClick={() => setAskWhere(false)}>
          <div className="where-inner" onClick={e => e.stopPropagation()}>
            <div className="where-head">{t('title_where_to_save')}</div>
            <button
              className="where-btn where-both"
              onClick={async () => { setAskWhere(false); setPreviewUrl(null); await savePhotoTo('both'); }}
            >
              <span className="where-emoji">📖📱</span>
              <span className="where-label">{t('opt_save_both')}</span>
              <span className="where-note">{t('desc_save_both')}</span>
            </button>
            <button
              className="where-btn"
              onClick={async () => { setAskWhere(false); setPreviewUrl(null); await savePhotoTo('device'); }}
            >
              <span className="where-emoji">📱</span>
              <span className="where-label">{t('opt_save_device')}</span>
              <span className="where-note">{t('desc_save_device')}</span>
            </button>
            <button
              className="where-btn"
              onClick={async () => { setAskWhere(false); setPreviewUrl(null); await savePhotoTo('album'); }}
            >
              <span className="where-emoji">📖</span>
              <span className="where-label">{t('opt_save_album')}</span>
              <span className="where-note">{t('desc_save_album')}</span>
            </button>
            {/* インスタ用（2026-08-23、伊波さん「インスタの投稿に乗せたかった
                けど、写真が大きすぎてはみ出た」）。3連は縦に長すぎて
                そのままでは切られるので、4:5 の白い紙のまん中に置く */}
            <button
              className="where-btn"
              onClick={async () => { setAskWhere(false); setPreviewUrl(null); await savePhotoTo('insta'); }}
            >
              <span className="where-emoji">🖼️</span>
              <span className="where-label">{t('opt_save_insta')}</span>
              <span className="where-note">{t('desc_save_insta')}</span>
            </button>
            <button
              className="where-btn where-cancel"
              onClick={() => setAskWhere(false)}
            >
              <span className="where-label">{t('opt_save_none')}</span>
            </button>
          </div>
        </div>
      )}

      {/* プリクラ帳。撮ったものを貯めて、後から見返す。
          **消すのは本人が選んだものだけ**（2026-08-15、伊波さん
          「勝手に消すんじゃなく」「自分で選んで消せるように」） */}
      {albumOpen && (
        <div className="album-screen">
          <div className="album-head">
            <button className="album-close" onClick={() => setAlbumOpen(false)}>{t('btn_back')}</button>
            <span className="album-title">{t('tab_album')}</span>
            <span className="album-count">{albumList.length}/{ALBUM_LIMIT}</span>
          </div>

          {/* 空のときの言葉。**事務的にしないこと**（2026-08-15、伊波さん
              「何も置かれて（写真）いないときは、写真を撮って集めてね！
              みたいな感じで」）。「まだ何も入っていません」だと
              できていない感じがする。集めたくなる言い方にする */}
          {albumList.length === 0 ? (
            <div className="album-empty">
              <span className="album-empty-emoji">📖</span>
              <span className="album-empty-main">{t('msg_collect_photos')}</span>
              <span className="album-empty-sub">
                お気に入りの1枚を、ここに貼っていこう<br />
                {ALBUM_LIMIT}枚まで入るよ
              </span>
            </div>
          ) : (
            <>
              <div className="album-tools">
                {albumEditing ? (
                  <>
                    <button className="album-tool" onClick={() => { setAlbumEditing(false); setAlbumPicked(new Set()); }}>{t('btn_cancel')}</button>
                    <button
                      className="album-tool album-del"
                      disabled={!albumPicked.size}
                      onClick={deletePicked}
                    >{albumPicked.size ? `${albumPicked.size}枚を消す` : '消すものを選んでね'}</button>
                  </>
                ) : (
                  <button className="album-tool" onClick={() => setAlbumEditing(true)}>{t('btn_choose_del')}</button>
                )}
              </div>

              <div className="album-grid">
                {albumList.map(it => (
                  <button
                    key={it.id}
                    // ⚠️ **向きは、しまうときに決めた it.wide を使う**（2026-08-19）。
                    //    一覧で絵を読んでから測る形は、**キャッシュだと
                    //    onLoad が来ない**ので2回目以降に効かなかった
                    //    （伊波さん「プリクラ帳はこわれたまま」「直ってない」）。
                    //    it.wide が無い古いものは、下の useEffect が測って埋める
                    className={`album-cell ${albumPicked.has(it.id) ? 'picked' : ''} ${it.wide ? 'is-wide' : ''}`}
                    onClick={async () => {
                      if (albumEditing) {
                        // 選ぶ・選び直す
                        const next = new Set(albumPicked);
                        if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
                        setAlbumPicked(next);
                      } else {
                        // 大きく見る。ここで初めて本体を読む（一覧は見本だけなので軽い）
                        setAlbumView(await album.get(it.id));
                      }
                    }}
                  >
                    <img src={it.thumb} alt="" />
                    {albumEditing && (
                      <span className="album-check">{albumPicked.has(it.id) ? '✓' : ''}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* プリクラ帳の1枚を大きく見る */}
      {albumView && (
        <div className="album-view" onClick={() => setAlbumView(null)}>
          <div className="album-view-inner" onClick={e => e.stopPropagation()}>
            <img src={albumView.full} alt="" />
            <div className="album-view-btns">
              <button className="sub-btn" onClick={() => setAlbumView(null)}>{t('btn_close')}</button>
              <button
                className="start-btn save-btn"
                onClick={async () => {
                  // 端末へ出す。プリクラ帳からは消さない
                  const res = await fetch(albumView.full!);
                  await save(await res.blob(), 'jpg');
                }}
              >{t('btn_save_to_device')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ⚠️ **保存の知らせは、いちばん外側に置くこと**（2026-08-18、
          伊波さん「保存したのかどうかわかんない」）。
          撮影画面の中に置いていたので、**保存して戻ったら消えていた**。
          保存は裏で続くので、戻ったあとに出せないと意味がない。
          真ん中に大きく出す。指は下へ通す（CSS で pointer-events: none） */}
      {saveMessage && <div className="save-toast">{saveMessage}</div>}

    </div>
  )
}

export default App
