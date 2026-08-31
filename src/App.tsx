import { useState, useRef, useEffect } from 'react'
import '../docs/tinycube-skin-shibuya.css'
import './setup.css'
import './skin-harajuku.css'
import { startStage, type OutShape } from './recorder'
import { FRAMES, loadFrame, fitsShape, inDisplayOrder, seasonFrames, seasonNow, SEASONS, type Frame, type FrameAnchor, type FaceHole } from './frames'
import * as album from './album'
import { ALBUM_LIMIT, PAGE_SIZE, ALBUM_PAGES, type AlbumItem } from './album'
import { LAYOUTS, layoutsFor, buildSheet, MIN_PHOTOS, MAX_PHOTOS, type Layout } from './sheet'
import { setAmbient, setTone, type ToneId } from './effects'
import { t, getLang, setLang } from './i18n'
// savedKey / relock は 2026-08-15 に全部無料にしたとき使わなくなった。
// unlock.ts 側には残してある（気が変わったときに戻せるように）
import { isUnlocked, startBilling, onUnlockChange, relock } from './unlock'
import { buy as buyInApp, restore as restoreInApp } from './billing'
import { saveMedia, takeLastMediaError } from './save'
import { FaceIcon, SceneIcon } from './CamIcon'
import { SheetIcon } from './SheetIcon'
import { saveCustomFrame, getCustomFrames, deleteCustomFrame, type CustomFrameRecord } from './idb'

/*
 * 飾りの大きさの補正について（2026-08-23 に不要になった）
 *
 * 以前は DECO_SCALE_STAMP 1.68 / DECO_SCALE_TEXT 1.2 という係数を掛けて、
 * 画面と保存の食い違いを埋めていた。**その係数はもう無い。**
 *
 * 食い違いの正体は「行の高さ」でも「絵文字の余白」でもなく、
 * **cqw の基準が写真ではなく .shot-big（写真より広い箱）だったこと**。
 * 縦の写真では箱 340px に対し写真 173px まで縮むので、画面の飾りだけが
 * 1.97 倍に見えていた。必要な倍率は写真の形で 1.00〜1.97 と変わるため、
 * **固定の係数では原理的に合わない**。字ごとに合わないのも、直したはずが
 * 逆に振れるのも、これが理由だった。
 *
 * いまは飾りを .shot-stage（写真ぴったりの台）に載せてある。画面も保存も
 * 「写真の幅に対する％」で揃ったので、補正なしで一致する。
 * 詳しくは setup.css の .shot-stage を読むこと。
 */

// ---- 開いたときのお願い（2026-08-12、伊波さんの原文） -------------------
//
// この文章は伊波さんが書いたもの。要約・言い換え・整形をしないこと。
// 改行も原文のまま。CSS 側（.manner-text）に white-space: pre-line を
// 当ててあるので、<br> を入れずにこの文字列をそのまま流し込めば改行が出る。
// 変えるときは伊波さんに確認してから、docs/tinycube-update-scope.md も直す。
// 同意画面の文章は i18n（manner_text）へ移した。
// 英語で開いた人にも同じお願いが伝わらないと意味がない
// （2026-08-13、伊波さん「ここは大事なページだからちゃんと訳してね」）


// 左右の柱（音・テロップ）とその絵柄は、動画をやめたときに全部無くなった
// （2026-08-31、伊波さん「思い切って動画やめようかな」）。
// 音3つ・フラッシュ・ミラーボール・流れるテロップは、動画だけのものだった。
// 写真の文字とスタンプ（プリクラの落書き）は別の仕組みなので残っている

function App() {

  // フローティングUI用のタブ状態は、いまの作り（左右の柱にボタンを常に出す）では
  // 使わなくなったので消した。ビルドが止まっていた（2026-08-11）

  
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // 録画関連のRef
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
    /** 鍵のかかった枠を試着中か。true なら斜めの鍵シールが画面にも出る
     *  （2026-08-31、伊波さん「鍵付きの絵を見せる」） */
    trial: boolean;
    mirror: boolean;
    zoom: number;
  }>({ video: null, fill: false, shape: 'landscape', frame: null, watermark: 'tinyCUBE', trial: false, mirror: false, zoom: 1 });
  

  // テロップの言葉。利用者が設定で書き換えられる。
  // 決め打ちの「草」「神」だけだと、その人の言い回しが使えない（2026-08-10）。
  // 消えると次に使うとき打ち直しになるので、localStorage に残す

  const [frameId, setFrameId] = useState<string | null>(null);
  /**
   * 季節の限定フレームを開いているか（2026-08-25、ヒマワリからの手紙）。
   *
   * ⚠️ **通常の一覧には混ぜない。** 期間中だけ出る専用ボタンから、
   *    ここを true にして別の一覧に切り替える
   */
  const [seasonOpen, setSeasonOpen] = useState(false);
  // 鍵つき（¥300 のセット）の段を開いているか。⚠️ **畳んだ状態から始める**
  // （2026-08-31、伊波さん「追加フレームで畳んでもいいし」）。
  // 最初から開いていると、無料の一覧より先に有料が目に入る
  const [paidOpen, setPaidOpen] = useState(false);
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
  const [ambientOn] = useState<AmbientKind | null>(() => {
    try { return (localStorage.getItem('tinycube.ambient') as AmbientKind) || null; } catch { return null; }
  });
  // ⚠️ **選ぶ画面は 2026-08-31 に外した**（伊波さん「3つとも消す」）。
  //    かけっぱなしの仕組み（effects.ts の setAmbient）は生きていて、
  //    前に選んだものは下の useEffect で今も効く。
  //    選び直す口を戻すときは、git の履歴から pickAmbient ごと戻すこと
  // 前に選んだものは開き直しても効かせる。描く側は effects.ts が持っている。
  // ⚠️ **起動のときだけでよい。** ambientOn を見張ると、選び直すたびに
  //    ここも走って pickAmbient と二重に渡すことになる
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setAmbient(ambientOn); }, []);


  /**
   * 色味（2026-08-23、伊波さん「エフェクトも初めから選んで撮影中は出しておこう」
   * 「フラッシュだけ、ちょっと加工系にかえて」「総音色身を変えるがいいね」）。
   *
   * フラッシュは一瞬光るものなので、かけっぱなしにできない。
   * 代わりに色味を3つ置いた。撮る前に選んで、撮影中はずっとかかる
   */
  const [tone] = useState<ToneId | null>(() => {
    try { return (localStorage.getItem('tinycube.tone') as ToneId) || null; } catch { return null; }
  });
  // 色味も同じ（選ぶ画面は外した。仕組みは effects.ts の setTone が持つ）
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
  const [screen, setScreen] = useState<'agree' | 'manner' | 'setup' | 'video' | 'photo' | 'sheet'>('agree');
  // ⚠️ **`'video'` はもう「動画」ではない。**（2026-08-31、動画を廃止した）
  //    いまは「カメラを映している撮影画面」の意味で、`screen === 'video'` の
  //    分岐は1つも無い（他の画面を全部閉じた状態＝カメラが見えている）。
  //    名前を変えると触る場所が増えるので、意味だけここに書いて残してある。
  //    録画・マイク・MediaRecorder は recorder.ts ごと削除済み
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
  // 撮るボタンを置く側。⚠️ **選ぶ画面は 2026-08-31 に外した**（同上）。
  //    右で固定。左利き用に戻すときは opt-row ごと git から戻すこと
  const [hand] = useState<'right' | 'left'>('right');
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
  // 撮るものを決めて次へ。写真はフレームを選んだら撮影画面へ直行する
  // （テロップは撮ったあとに乗せるので、先に聞かない）
  // 撮るものは写真だけになった（2026-08-31、伊波さん「思い切って動画やめようかな」）。
  // 「なにを撮る？」の段は、プリクラ帳・プリシート・買い切りの入口を兼ねる
  // 玄関として残してある
  const pickKind = () => setSetupStep('mode');
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
    else if (camOn) setScreen('video');
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
  // 買い切りの解除。フレームと透かし消しの両方が一度に解ける
  // （2026-08-11、伊波さん「両方」）
  const [unlocked, setUnlocked] = useState(isUnlocked());
  const unlockRef = useRef<HTMLDivElement>(null);
  /**
   * 「ぜんぶ使えるようにする」を単独で開くための箱（2026-08-30）。
   *
   * ⚠️ **カメラが動かないと買えない、という作りだった。**
   *    購入の案内はフレーム一覧の中にしか無く、そこへ行くには
   *    「フレームを選ぶ」ボタンが要る。ところがそのボタンは
   *      {camOn && ...}
   *    で守られていて、**カメラが起動しないと出てこない**。
   *
   *    Apple の審査は iPad の実機で行われ、カメラが使えない状態だった。
   *    そのため審査員が購入にたどり着けず、Guideline 2.1(b) で差し戻された
   *    （2026-08-29「we cannot locate the In-App Purchases within the app」）。
   *
   *    買いたい人がカメラを起動しないと買えないのは、審査以前に不親切。
   *    最初の画面から直接開けるようにした。
   */
  const [buyOpen, setBuyOpen] = useState(false);
  // 買うところ。
  //
  // ⚠️ **アプリ（Android / iOS）では、外の売り場へ連れて行ってはいけない。**
  //    ストアは、アプリの中で売るデジタルの品物にストアの課金を通すことを
  //    求めていて、外の売り場へ誘導すると審査で弾かれる
  //    （2026-08-14、伊波さん「A. アプリ版だけボタンを隠す」）。
  //
  // ⚠️ **Web にはいま買う道が無い**（2026-08-24）。BOOTH を閉じ、Ko-fi は
  //    CUBICENGINE の寄付専用にしたため。Stripe が入るまで「準備中」を出す
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyNG, setBuyNG] = useState(false);

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

  // 透かしの扱い。**解除した人だけ消える**（2026-08-31、伊波さんの判断）。
  //
  // ■ 経緯（行ったり来たりしたので残す）
  //   もとは「無料版の印」で、解除すると消える作りだった
  //   2026-08-15  全部無料にしたとき isUnlocked() が常に true を返すようになり、
  //               **副作用で透かしまで消えた**
  //   2026-08-17  伊波さん「無料にしても透かしは入れる話だったはずだよ」
  //               → 解除に関係なく常に入れるようにした
  //   2026-08-31  ⚠️ **BOOTH と Ko-fi が「透かし消し付」で ¥300 を取っていた。**
  //               売っている約束と実装が食い違っていたので、約束のほうへ戻す。
  //               買っていない人には今までどおり入る。無料で配るからこそ、
  //               撮ったものが広まるときに名前が残っているほうが宣伝になる
  //
  // 画面に出している canvas をそのまま録るので、ここを変えれば動画も写真も変わる
  useEffect(() => {
    liveRef.current.watermark = unlocked ? null : 'tinyCUBE';
  }, [unlocked]);
  // tinyCUBE はスマホで使うもの。PC で開いた人には、そう伝えてから通す。
  // 塞がずに「このまま使う」を用意しているのは、確かめたい人を止めないため
  // （2026-08-10、伊波さん「基本PCで開かないから」「スマホだけ」）
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
    if (camOn) { setStartHint(true); setScreen('video'); }
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

  // ⚠️ **顔ハメでない枠では倍率を掛けないこと**（2026-08-30、
  //    Mac のシオンが発見）。
  //
  //    つまみは顔ハメの枠のときだけ出している（2026-08-14「顔はめ以外
  //    ズーム隠したら？」）。ところが値は枠に関係なく渡しっぱなしだった。
  //    顔ハメで一度いじってから別の枠へ移ると：
  //
  //      0.5 側 … 映像が縮んで**黒帯が出る**（「黒帯を出さない」は
  //               2026-08-10 の指示。recorder.ts にも警告がある）
  //      2.0 側 … 寄ったまま
  //
  //    どちらも**つまみが消えているので、その画面からは戻せない。**
  //    写真と録画にも乗る。閉じれば useState(1) に戻るので、
  //    **「たまにおかしい、開き直すと直る」**という出方をする。
  //
  //    ⚠️ **この効果を isFaceHoleFrame より前へ戻さないこと。**
  //       前に置くと、まだ枠が決まっていないので判断できない
  useEffect(() => {
    liveRef.current.zoom = isFaceHoleFrame ? camZoom : 1;
  }, [camZoom, isFaceHoleFrame]);

  /**
   * 全開の大きさで描くか（2026-08-30）。
   *
   * ⚠️ **ref で持つこと。** 描画ループは毎コマ read() を呼ぶので、
   *    state だと切り替えが1コマ遅れる。撮る直前に立てて、
   *    **その場で効いてほしい**
   */
  const fullRef = useRef(false);

  /**
   * 全開にして、実際にその大きさで1コマ描き終わるまで待つ。
   *
   * ⚠️ **待たずに撮ると、小さいままの絵が焼かれる。** 描画ループは
   *    次の rAF まで動かないので、立てた直後の canvas はまだ小さい。
   */
  const 全開にする = () => new Promise<void>(res => {
    fullRef.current = true;
    // 2コマぶん待つ（1コマ目で大きさが変わり、2コマ目で中身が入る）
    requestAnimationFrame(() => requestAnimationFrame(() => res()));
  });


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
      // ⚠️ **full は「録画中」と「撮る瞬間」だけ true**（2026-08-30）。
      //    ふだんは画面に見えている大きさで描く。1920x1080 を毎コマ作って
      //    411px に縮めて出していたのが、カクつきの正体だった。
      //    **写真も録画もこの canvas をそのまま使う**ので、
      //    撮るときは必ず全開に戻すこと（fullRef が担う）
      read: () => ({ ...liveRef.current, video: videoRef.current, fill: camOnRef.current,
        idle: pickerOpenRef.current, full: fullRef.current }),
      onTrouble: msg => setCamInfo(msg || null),
    });
  }, []);


  // 選んだ枠の絵を読み込んでおく。録画の直前に読むと間に合わない
  useEffect(() => {
    liveRef.current.shape = shape;
    // 鍵のかかった枠も**そのまま乗せる**（2026-08-31、伊波さん「鍵付きの絵を見せる」
    // 「試着＋撮れる。でも帯が入る」）。前はここで null にしていたので、
    // 買う前に一度も自分の顔に乗ったところを見られなかった。
    // 代わりに、おためしの鍵シールを canvas に焼く（recorder.ts の drawTrial）
    liveRef.current.trial = !!builtinFrame && locked(builtinFrame);
    if (!frame) { liveRef.current.frame = null; return; }
    let alive = true;
    loadFrame(frame).then(({ img, bgImg }) => {
      if (alive) liveRef.current.frame = { img, bgImg, anchor: frame.anchor, faceHole: frame.faceHole, faceHoles: frame.faceHoles };
    }).catch(() => { /* 読めなければ枠なしで続ける */ });
    return () => { alive = false; };
  }, [frame, shape, unlocked]);

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
        audio: false,                        // 写真だけなので音は要らない
      });
      camStreamRef.current = stream;
      shapePicked.current = false;           // 新しい映像なので、また自動で合わせる
      setCamFront(front);
      setCamOn(true);
      // ⚠️ **見え方を変えるのは、映像を描くときではなく「カメラ側」で。**
      //    （2026-08-31、伊波さん「camera 少しだけブラックも white も強くできる？」
      //     → 「強めにではなくね」→「ユーザーがほうれい線は消してくれと」）
      //
      //    描画のときに触るのは2回とも失敗している（recorder.ts の長い注意書き）。
      //      g.filter                → 毎コマ全画素にかかって重い
      //      globalCompositeOperation → 画面が真っ暗になった
      //    こちらは**カメラの設定を1回変えるだけ**なので、描画は素のまま。
      //
      //    ⚠️ **コントラストは上げない。** 上げると影が濃くなって、
      //       ほうれい線やクマがくっきり出る（求められているのは逆）。
      //       代わりに**明るさ**で影を浅くし、**彩度**で色を鮮やかにする。
      //       これがプリクラの定番の見え方（肌を飛ばして色は濃く）。
      //
      // ⚠️ **setCamOn(true) の「あと」に置くこと。**（2026-08-31、監査の指摘）
      //    try/catch は「返ってこない promise」を助けられない。前に置くと、
      //    applyConstraints が固まる端末で**撮影画面がいつまでも出ない**。
      //    後ろなら、効かなくても映像は先に出る
      // ⚠️ **知らない名前の制約は例外を投げる**（実測。黙って無視ではない）。
      //    しかも advanced 全体が巻き添えで落ちるので、1つずつ試す。
      //    step を外れた値も弾かれるため、刻みに合わせてから渡す
      try {
        const track = stream.getVideoTracks()[0];
        type Range = { min: number; max: number; step?: number };
        const caps = track?.getCapabilities?.() as
          (MediaTrackCapabilities & { brightness?: Range; saturation?: Range }) | undefined;
        // 真ん中から上へ、控えめに（伊波さん「強めにではなくね」）
        const pick = (r: Range | undefined, ratio: number) => {
          if (!r || typeof r.min !== 'number' || typeof r.max !== 'number') return null;
          const raw = r.min + (r.max - r.min) * ratio;
          if (!r.step) return raw;
          // step の刻みに乗せる。外れた値は「満たせない」として弾かれる
          const snapped = r.min + Math.round((raw - r.min) / r.step) * r.step;
          return Math.min(r.max, Math.max(r.min, snapped));
        };
        const wants: Record<string, number | null> = {
          brightness: pick(caps?.brightness, 0.58),   // 影を浅く
          saturation: pick(caps?.saturation, 0.60),   // 色を少し濃く
        };
        for (const [name, value] of Object.entries(wants)) {
          if (value === null || !track) continue;
          // 1つずつ。まとめて渡すと、片方が駄目なだけで両方効かなくなる
          try {
            await track.applyConstraints(
              { advanced: [{ [name]: value }] } as MediaTrackConstraints,
            );
          } catch { /* この端末では効かない。次を試す */ }
        }
      } catch { /* 触れなくてもそのまま。映像は流れている */ }
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

    // ⚠️ **カメラが死んだら気づくこと**（2026-08-30、Mac のシオンが発見）。
    //    OS がカメラを取り上げると（他のアプリが使う・電話・熱・画面が消える）、
    //    トラックだけが ended になる。**そのあとも <video> は最後のコマを
    //    持ったまま videoWidth を返し続ける**ので、描画ループは律儀に
    //    静止画を描き続け、**アプリは何も気づかない。**
    //
    //    2026-08-16 に入れた見張り役では拾えない。あれは「rAF が止まった」
    //    ときのもので、ここではループは元気なまま絵だけが止まる。
    //
    //    伊波さん「外で撮影使用中に感じる」（2026-08-27）。
    //    OS がカメラを取り上げる場面は屋外に集まる。
    const track = camStreamRef.current.getVideoTracks()[0];
    // ⚠️ **camVer を進めるだけでは繋ぎ直らない。** それは効果を
    //    走らせ直すだけで、**古いストリームを使い回す**（実測で ended のまま）。
    //    カメラそのものを開き直すこと
    let 直し中 = false;
    const 死んだ = () => {
      if (直し中) return;          // ended と mute が続けて来ることがある
      直し中 = true;
      setCamInfo(t('cam_lost'));
      // 少し置いてから開き直す。取り上げた相手がまだ握っていることがある
      setTimeout(() => { void startCam(camFront); }, 400);
    };
    const 戻った = () => setCamInfo(null);
    track?.addEventListener('ended', 死んだ);
    track?.addEventListener('mute', 死んだ);
    track?.addEventListener('unmute', 戻った);

    // 画面から戻ってきたときも確かめる。**取り上げられたことに
    // 気づかないまま戻ると、固まった絵のまま撮ることになる**
    const 戻ってきた = () => {
      if (document.visibilityState !== 'visible') return;
      const tr = camStreamRef.current?.getVideoTracks()[0];
      if (tr && tr.readyState !== 'live') 死んだ();
    };
    document.addEventListener('visibilitychange', 戻ってきた);

    return () => {
      clearTimeout(check);
      track?.removeEventListener('ended', 死んだ);
      track?.removeEventListener('mute', 死んだ);
      track?.removeEventListener('unmute', 戻った);
      document.removeEventListener('visibilitychange', 戻ってきた);
    };
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
    if (!camOn) { alert(t('alert_load_first')); return; }
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
    if (!camOn) { alert(t('alert_load_first')); return; }
    setIsBursting(true);
    setStartHint(false);
    const taken: string[] = [];
    try {
      // ⚠️ **撮るあいだは全開の大きさで描く**（2026-08-30）。
      //    ふだんは画面の大きさで描いているので、**そのまま撮ると
      //    小さい写真になる。** 数え始める前に戻しておく
      await 全開にする();
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
      // 撮り終わったら画面の大きさに戻す（軽くするため）
      fullRef.current = false;
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
          // ⚠️ **係数を掛けないこと。** 画面側の cqw も、この canvas も、
          //    どちらも「写真の幅に対する％」になったので、そのまま一致する
          //    （setup.css の .shot-stage を読むこと）。
          //    以前は .shot-big（写真より広い箱）が cqw の基準だったため
          //    ずれており、DECO_SCALE_TEXT 1.2 / _STAMP 1.68 で埋めていた。
          //    ただし必要な倍率は写真の形で 1.00〜1.97 と変わるので、
          //    固定値では原理的に合わなかった。基準をそろえて根本から外した。
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
   * ⚠️ **maxCellAR はもう使わない**（2026-08-30、伊波さん
   *    「シールシートのようにできあがるのがよいのであって、
   *      そこは妥協しちゃダメなとこデショ」）。
   *    インスタに収めるために縦を詰めていたが、**顔が切れ、シールシートの
   *    形でもなくなった。** 小さくなってもいいので形はそのまま。
   *    **この引数を復活させないこと。**
   *
   * @param maxCellAR （使わない）1コマの「高さ÷幅」の上限。
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
      // 縦はコマを埋める（切る）。横は全部見せる（左右に白が出る）
      const 横長2 = cell.width > cell.height;
      const scale = 横長2
        ? Math.min(CELL_W / cell.width, CELL_H / cell.height)
        : Math.max(CELL_W / cell.width, CELL_H / cell.height);
      const w = cell.width * scale, h = cell.height * scale;
      g.save();
      g.beginPath();
      g.rect(PAD, dy, CELL_W, CELL_H);
      g.clip();
      // ⚠️ **切るなら上を残すこと**（2026-08-30、伊波さんのインスタ投稿で
      //    3枚とも額から上が切れていた）。
      //    真ん中を残すと、顔ハメの顔は画面の上のほうにあるので
      //    真っ先に頭が切れる。**顔が入っていない写真は使えない。**
      //
      // ⚠️ **横で撮ったものは、切らずに収めること**（同日）。
      //    横（1920x1080）を横長のコマに入れると、上を残しても
      //    上下が大きく削られて顔が 32% しか残らなかった。
      //    横はもともとコマの形に近いので、**全部見せて左右に白を出す**
      //    ほうが顔が残る。縦のときだけ、はみ出すぶんの 15% を下げて
      //    上を厚く残す
      const 横長 = cell.width > cell.height;
      const はみ出し = h - CELL_H;
      const 上寄せ = (はみ出し > 0 && !横長) ? -はみ出し * 0.15 : (CELL_H - h) / 2;
      g.drawImage(cell, PAD + (CELL_W - w) / 2, dy + 上寄せ, w, h);
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
  const savePhotoTo = async (where: 'both' | 'device' | 'album') => {
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
    // ⚠️ **端末へはいつも 4:5 で保存する**（2026-08-30、伊波さん
    //    「インスタ用を通常にしようよ」）。
    //
    //    シールシートの形のままだと縦に長すぎて、インスタに上げると
    //    切られる。4:5 の白い紙のまん中に置けば、**形も大きさも
    //    変えずに**そのまま載せられる（左右に白い余白が出るだけ）。
    //
    // ⚠️ **形を崩して詰めないこと**（同日「シールシートのように
    //    できあがるのがよいのであって、そこは妥協しちゃダメなとこデショ」）。
    //    2026-08-23 は 4:5 に収めるために1コマの縦を詰めていたが、
    //    顔が切れ、シールシートの形でもなくなった。
    //
    //    プリクラ帳へは1コマずつ入るので、こちらは通らない
    const out = toInstaSheet(sheet);
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

    // ⚠️ **先に開くこと。** 測り終わるのを待ってから開く作りにしていたら、
    //    iOS で decode() が返ってこず**プリクラ帳が永久に開かなくなった**
    //    （2026-08-21、伊波さんの実機。「プリ帳開けない、１番最初にテストは
    //     開けてた」＝空のときだけ開けていた）。
    //    向きの直しは開いたあとで追いつけばよい。**開けないほうが致命的**。
    setAlbumList(list);
    setAlbumPicked(new Set());
    setAlbumEditing(false);
    setAlbumPage(0);
    setAlbumOpen(true);

    // ⚠️ **wide が無い古いものを、ここで測って埋める**（2026-08-19）。
    //    wide は 8/19 から持つようにしたので、それ以前にしまった写真には
    //    入っていない。無いまま出すと横のまま並ぶ（伊波さんの実機で41枚が
    //    そうなっていた）。開いたときに一度だけ測って、次からは持っている。
    //    いま保存するものは album.add() が測って持たせているので、ここに
    //    来るのは 8/19 より前のものだけ
    const need = list.filter(it => it.wide === undefined);
    if (!need.length) return;

    await Promise.all(need.map(async it => {
      try {
        // ⚠️ **onload ではなく decode() を使うこと**（2026-08-19）。
        //    onload は**すでに読めている絵では発火しないことがある**。
        //    それで古い41枚が横のまま並んでいた（伊波さん「できてない！！！」）。
        //    decode() は読み終わっていれば即座に返るので、取りこぼさない。
        //
        // ⚠️ **ただし返ってこないことがある。** iOS の WKWebView で
        //    data URL を decode() すると、稀に成功も失敗もしないまま止まる。
        //    待ち続けると後続が全部止まるので、3秒で見切りをつける
        const i = new Image();
        i.src = it.thumb;
        await Promise.race([
          i.decode(),
          new Promise((_, ng) => setTimeout(() => ng(new Error('decode が返らない')), 3000)),
        ]);
        it.wide = i.naturalWidth > i.naturalHeight;
      } catch {
        it.wide = false;   // 読めない絵は回さない
      }
    }));

    setAlbumList([...list]);   // 測った結果を画面に反映する
    void album.fillWide(need.map(it => ({ id: it.id, wide: !!it.wide })));
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
  // 飾りを載せる台（＝写真そのもの）の幅。飾りの大きさをここから決める。
  //
  // ⚠️ **cqw（コンテナクエリ）は使えない。** 台に container-type を付けると、
  //    その要素は中身から幅を決められなくなり（サイズ封じ込め）、**写真が
  //    まるごと消える**（2026-08-23、伊波さん「落書きできる写真が消えた」）。
  //    台は写真に合わせて縮む必要があるので両立しない。だから実寸を測って
  //    px で渡す。
  const [stageW, setStageW] = useState(0);
  useEffect(() => {
    const el = bigShotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.getBoundingClientRect().width));
    ro.observe(el);
    setStageW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [photoStep, activeShot, shots]);
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
  /**
   * いま何をしているか。false なら見るだけ。
   *   'del'  … 消すものを選ぶ
   *   'sort' … 並べ替える（2枚選ぶと入れ替わる）
   *   'pick' … プリシートの材料に選ぶ（2026-08-31）
   */
  const [albumEditing, setAlbumEditing] = useState<false | 'del' | 'sort' | 'pick'>(false);
  /** いま何枚入っているか。0枚なら入口を出さない */
  const [albumHas, setAlbumHas] = useState(0);
  /** いま開いているページ（0 始まり）。実物のシールブックと同じで、
   *  50枚のシートが ALBUM_PAGES 枚つづりになっている
   *  （2026-08-31、伊波さん「１００枚とかにならない？３ページとかにして」） */
  const [albumPage, setAlbumPage] = useState(0);
  /** いまのページに並ぶもの */
  const albumPageItems = albumList.slice(albumPage * PAGE_SIZE, (albumPage + 1) * PAGE_SIZE);

  // ---- プリシート（2026-08-31、伊波さん「プリみたいに写真を選んで
  //      シートを作れる機能を追加」「３枚から７枚ぐらい色んな組み合わせ」）
  //
  //  3枚連写のシート（buildPhotoSheet）とは別の道。あちらは「撮った直後」、
  //  こちらは「貯めたものから選んで組む」。割り付けは sheet.ts が持っている。
  //
  //  📝 **あとで落書きも乗せられるようにしたい**（同日、伊波さん
  //     「あとで落書きもできるようになればいいね」）。
  //     写真の落書き（decos / renderShot）と同じ仕組みを、
  //     出来上がったシートの上に重ねれば足せる。**いまは入れていない。**
  /** シートに使う写真（data URL）。選んだ順に並ぶ。1枚目がいちばん大きく出る */
  const [sheetPhotos, setSheetPhotos] = useState<string[]>([]);
  /** どの割り付けを使うか。枚数が変わったら、その枚数の1つめに合わせ直す */
  const [sheetLayoutId, setSheetLayoutId] = useState<string>('3a');
  /** 出来上がりの見本 */
  const [sheetPreview, setSheetPreview] = useState<string | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const sheetCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sheetFileRef = useRef<HTMLInputElement>(null);

  /** いま選べる型。枚数が足りないうちは空 */
  const sheetLayouts: Layout[] = layoutsFor(sheetPhotos.length);
  const sheetLayout: Layout | null =
    LAYOUTS.find(l => l.id === sheetLayoutId && l.n === sheetPhotos.length) ?? sheetLayouts[0] ?? null;

  /** 枚数が変わったら、その枚数の型へ合わせ直す */
  useEffect(() => {
    const list = layoutsFor(sheetPhotos.length);
    if (list.length && !list.some(l => l.id === sheetLayoutId)) setSheetLayoutId(list[0].id);
  }, [sheetPhotos.length, sheetLayoutId]);

  /** 写真か型が変わったら、見本を作り直す */
  useEffect(() => {
    let alive = true;
    if (!sheetLayout || sheetPhotos.length < MIN_PHOTOS) { setSheetPreview(null); return; }
    setSheetBusy(true);
    buildSheet(sheetPhotos, sheetLayout, unlocked ? null : 'tinyCUBE')
      .then(c => {
        if (!alive) return;
        sheetCanvasRef.current = c;
        setSheetPreview(c ? c.toDataURL('image/jpeg', 0.9) : null);
      })
      .catch(() => { if (alive) setSheetPreview(null); })
      .finally(() => { if (alive) setSheetBusy(false); });
    return () => { alive = false; };
  }, [sheetPhotos, sheetLayout, unlocked]);

  /** プリシートを作る画面へ */
  const openSheet = () => {
    setSheetPhotos([]);
    setSheetPreview(null);
    setScreen('sheet');
  };

  /** プリクラ帳を「材料を選ぶ」で開く */
  const openAlbumForSheet = async () => {
    const list = await album.list();
    setAlbumList(list);
    setAlbumPicked(new Set());
    setAlbumEditing('pick');
    setAlbumPage(0);
    setAlbumOpen(true);
  };

  /** 選んだものをシートの材料に入れる。**大きいほうの絵を使う**
   *  （見本は 200px しかないので、シートに置くと粗い） */
  const takePickedIntoSheet = async () => {
    const ids = [...albumPicked];
    const room = MAX_PHOTOS - sheetPhotos.length;
    const add: string[] = [];
    for (const id of ids.slice(0, room)) {
      const it = await album.get(id);
      const src = it?.full ?? it?.thumb;
      if (src) add.push(src);
    }
    setSheetPhotos(prev => [...prev, ...add].slice(0, MAX_PHOTOS));
    setAlbumPicked(new Set());
    setAlbumEditing(false);
    setAlbumOpen(false);
  };

  /** 端末の写真から入れる。**大きすぎる写真は縮める**
   *  （12MP を7枚そのまま持つと、端末によっては落ちる） */
  const takeFilesIntoSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';                     // 同じ写真をもう一度選べるように
    const room = MAX_PHOTOS - sheetPhotos.length;
    const add: string[] = [];
    for (const f of files.slice(0, room)) {
      try {
        const raw = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onerror = () => rej(new Error('読めませんでした'));
          r.onload = () => res(String(r.result));
          r.readAsDataURL(f);
        });
        add.push(await album.makeThumb(raw, 1200));
      } catch { /* 1枚読めなくても、残りは入れる */ }
    }
    setSheetPhotos(prev => [...prev, ...add].slice(0, MAX_PHOTOS));
  };

  /** 出来上がったシートを端末へ */
  const saveSheet = async () => {
    const c = sheetCanvasRef.current;
    if (!c) return;
    setSaveMessage(t('msg_storing'));
    const blob = await new Promise<Blob | null>(res => c.toBlob(b => res(b), 'image/jpeg', 0.92));
    if (!blob) { setSaveMessage(t('err_save_failed')); setTimeout(() => setSaveMessage(null), 4000); return; }
    const r = await saveMedia(blob, `tinyCUBE-sheet-${Date.now()}.jpg`);
    setSaveMessage(r.how === 'failed' ? t('err_save_failed') : t('msg_saved'));
    setTimeout(() => setSaveMessage(null), 3000);
  };
  const [previewBusy, setPreviewBusy] = useState(false);
  // 撮れた動画。止めた直後に黙って保存すると、何が起きたのか分からない
  // （2026-08-14、伊波さん「停止後の操作が不明」
  // 「録画停止後すぐ保存しますか？を出す？」）。
  // 写真と同じで、見てから保存するかを決められるようにする
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

    // ⚠️ **2本目の指は、どこに置いても受け付けること。**
    //
    //    startDrag は飾りそのものに付いた onPointerDown なので、**2本目も
    //    同じ飾りの上に乗らないと登録されなかった**。ところが文字は
    //    大きさ7で置いており、1本目の指でほぼ埋まる。**2本目を乗せる隙間が
    //    無いので、ピンチが成立しようがなかった**（2026-08-21、伊波さん
    //    「文字絵文字の大きさ変えられない」）。
    //
    //    8/23 に「最初から小さく置く」で回避したが、根っこはここ。掴んだ
    //    あとは台のどこに指を置いても2本目として数えるようにする。
    //    台には touch-action: none が効いている（setup.css）ので、
    //    ブラウザ側の拡大に取られる心配はない。
    const down = (e: PointerEvent) => {
      if (!ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };

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
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragId]);

  void shoot;



  return (
    <div className="app-container">
      {/* 映像領域（最背面で全画面） */}
      <main className="preview-stage">
        <div
          className="stage-box"
          style={{ '--ar': shape === 'portrait' ? '0.5625' : '1.7778' } as React.CSSProperties}
        >
          <canvas ref={canvasRef} className="stage-canvas" />
          {camOn && (
            <video
              ref={videoRef}
              className="video-player hidden-source"
              playsInline
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
        {!camOn && (
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
          <div className={`turn-hint ${camOn ? (camTuneOpen ? 'above-tune' : 'above-tune-folded') : ''}`}>{t('warn_land_frame1')}<br/>{t('warn_land_frame2')}</div>
        ) : startHint ? (
          /* 誘導は説明より強い。初めて撮影画面に来た人に、押す場所だけ示す
             （2026-08-12、伊波さん「説明見てわからないなら、誘導が１番でしょ？」） */
          <div className={`turn-hint start-hint ${camOn ? (camTuneOpen ? 'above-tune' : 'above-tune-folded') : ''}`}>{t('msg_push_record')}</div>
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
                face-frame
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
            <button
              className="photo-btn-round burst"
              onClick={burstShoot}
              disabled={!camOn || isBursting}
              title="3枚つづけて撮る"
            >
              <span className="ctrl-icon">📸</span>
              <span className="ctrl-label">{isBursting ? t('msg_shooting') : t('btn_shoot_3')}</span>
            </button>
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
        {camOn && isFaceHoleFrame && (
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
        {/* シャッターの光。CSS なので写真にも動画にも入らない */}
        {flash && <div className="shutter-flash" />}

        {/* 左右の柱（音・テロップ）は動画のときだけ。
            写真では飾りを撮ったあとに乗せるので、撮影中に押すものが無い。
            出したままだとズームの操作パネルに柱が重なって、ズームを押した
            つもりで音のボタンを押すことになる（2026-08-14、伊波さん
            「ズーム機能効いてない、ボタン被る」「写真の時は、テキスト
            エフェクトと音ボタンもいらないね」） */}
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
                /* フレームの段も見出しを出す（2026-08-31、原宿スキン）。
                   前は小窓の中に書いてあったので空にしていたが、小窓は
                   廃止済みで、黒いヘッダーだけが残って何の画面か分からなかった */
                : setupStep === 'frame' ? t('title_choose_frame')
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
                  className="kind-btn"
                  onClick={pickKind}
                >
                  <span className="kind-icon">📸</span>
                  <span className="kind-title">{t('btn_take_photo')}</span>
                  <span className="kind-note">{t('kind_photo_note')}</span>
                </button>
              </div>

              {/* プリクラ帳への入口（2026-08-15）。
                  「なにを撮る？」のすぐ下に置く。
                  ⚠️ **0枚でも出すこと。**（伊波さん「プリクラ帳自体は
                  なにを撮る？のページにいつでも開けるように置いておいて」）
                  最初は空でも、そこに置き場所があると分かるほうが大事。
                  隠すと「どこにあるの？」になる */}
              <button className="album-open-btn is-album" onClick={openAlbum}>
                <span className="album-open-emoji">📖</span>
                <span className="album-open-label">{t('tab_album')}</span>
                <span className="album-open-count">
                  {albumHas > 0 ? `${albumHas}/${ALBUM_LIMIT}` : t('msg_album_empty')}
                </span>
              </button>

              {/* プリシートを作る（2026-08-31、伊波さん「プリみたいに写真を
                  選んでシートを作れる機能を追加」）。
                  ⚠️ **プリクラ帳のすぐ下に置く。** 材料はプリクラ帳から取るので、
                     この2つは並んでいたほうが道が分かる */}
              <button className="album-open-btn is-sheet" onClick={openSheet}>
                <span className="album-open-emoji"><SheetIcon /></span>
                <span className="album-open-label">{t('btn_make_sheet')}</span>
                <span className="album-open-count">{t('sheet_note')}</span>
              </button>

              {/* 買い切りの入口。**買った人には出さない。**
                  ⚠️ ここが無いと、カメラが動かない端末では買う道が無い
                     （buyOpen の宣言のところを読むこと）。
                     プリクラ帳と同じ見た目で、下に控えめに置く */}
              {!unlocked && (
                <button className="album-open-btn is-buy" onClick={() => setBuyOpen(true)}>
                  <span className="album-open-emoji">🔓</span>
                  <span className="album-open-label">{t('unlock_buy_app')}</span>
                  <span className="album-open-count">{t('unlock_lead_short')}</span>
                </button>
              )}

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

              {/* 選べていないうちは先へ進ませない。押せないボタンを出すより、
                  選んだ瞬間に出すほうが「次に何をするか」が分かる */}
              {camOn && (
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
                onClick={() => setScreen('video')}
              >{t('btn_decide_frame')}</button>

              <div className="shape-switch shape-switch--mini">
                <button className={shape === 'portrait' ? 'on' : ''} onClick={() => pickShape('portrait')}>{t('setting_shape_port')}</button>
                <button className={shape === 'landscape' ? 'on' : ''} onClick={() => pickShape('landscape')}>{t('setting_shape_land')}</button>
              </div>
              {srcIsWide && (
                <p className="sheet-note" style={{ marginTop: 6 }}>{t('setting_shape_wide_note')}</p>
              )}

              {/* 季節の限定フレームへの入口（2026-08-25、ヒマワリからの手紙
                  「該当期間中のみ、UI上に専用ボタンが別枠で出現する」）。
                  ⚠️ **期間外は出さない。** seasonFrames が空なら押す先も無い */}
              {seasonFrames(shape).length > 0 && (
                <button
                  className={'season-btn' + (seasonOpen ? ' on' : '')}
                  onClick={() => setSeasonOpen(v => !v)}
                >
                  {seasonOpen
                    ? t('btn_season_back')
                    : t('btn_season_open').replace('{s}', SEASONS[seasonNow()!].name)}
                </button>
              )}

              {/* 「フレームを選ぶ」の見出しは小窓の中に入れたので、ここには置かない */}
              {/* タイルの形はクラスで切り替える。CSS 変数（--tile-ar）だと
                  skin 側の指定と競合して効かないことがあった
                  （2026-08-13、伊波さん「これなおしてくれないの？」） */}
              <div className={`frame-picker ${shape === 'portrait' ? 'ar-portrait' : 'ar-landscape'}`}>
                {/* 色や地は skin（skin-harajuku.css の .frame-tile.add）で持つ。
                    ここに style を直書きすると、スキンを替えたときに
                    ここだけ古い色のまま取り残される（2026-08-31） */}
                <button
                  className="frame-tile add"
                  onClick={() => customFrameInputRef.current?.click()}
                >
                  <div className="frame-tile-add-icon">🖼️</div>
                  <span className="frame-tile-add-label">{t('my_frame')}<br />{t('btn_add')}</span>
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
                {/* 季節の限定フレーム（2026-08-25、ヒマワリからの手紙）。
                    ⚠️ **通常の一覧には混ぜない。** 期間中だけ、ここに
                       専用のボタンが出る。押すと一覧が季節のものに変わる */}
                {/* ⚠️ **鍵つきは混ぜない。下の畳める段にまとめる**
                    （2026-08-31、伊波さん「追加フレームで畳んでもいいし」
                     →「それで行こう」）。混ぜて並べると、どこから有料なのか
                    分からなかった（同日「どこから有料か何なのかなにもわからん」） */}
                {(seasonOpen ? seasonFrames(shape)
                  : inDisplayOrder(FRAMES.filter(f => fitsShape(f, shape) && !locked(f)))).map(f => (
                  <button
                    key={f.id}
                    className={`frame-tile ${frameId === f.id ? 'on' : ''} ${locked(f) ? 'locked' : ''}`}
                    /* 鍵つきでも**選べる**（2026-08-31、伊波さん「鍵付きの絵を見せる」）。
                       前は解除画面へ直行していて、自分の顔に乗ったところを
                       一度も見られなかった。買う道は一覧の下の帯から行ける */
                    onClick={() => setFrameId(f.id)}
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

              {/* ⚠️ **鍵つき（¥300 のセット）は、ここに畳んで置く。**
                  （2026-08-31、伊波さん「追加フレームで畳んでもいいし」）

                  無料の一覧に混ぜていたときは、**どこから有料なのか分からな
                  かった**（同日「どこから有料か何なのかなにもわからん」）。
                  段を分けて、見出しに枚数と値段を書けば一目で分かる。

                  ⚠️ **解除した人には出さない**（鍵が無くなるので、上の一覧に
                     全部混ざる）。買っていない人にだけ、この段が出る。
                  ⚠️ 季節の一覧を見ているときも出さない（別の話なので） */}
              {!unlocked && !seasonOpen
                && FRAMES.some(f => locked(f) && !f.season) && (
                <>
                  <button
                    className={'paid-open' + (paidOpen ? ' on' : '')}
                    onClick={() => setPaidOpen(v => !v)}
                  >
                    <span className="paid-open-mark">{paidOpen ? '▼' : '▶'}</span>
                    {/* ⚠️ **ここは「パックの中身を見せる場所」。**（2026-08-31、
                        伊波さん「53枚1パックにできないの？」）
                        上の無料の一覧は「いま使える絵」だけを出すが、
                        この段は**買うと何が手に入るか**を見せるところなので、
                        縦むき26枚・横むき27枚を**まとめて53枚**並べる */}
                    <span className="paid-open-label">
                      {t('paid_section').replace(
                        '{n}',
                        String(FRAMES.filter(f => locked(f) && !f.season).length),
                      )}
                    </span>
                  </button>
                  {paidOpen && (
                    <>
                      <div className={`frame-picker ${shape === 'portrait' ? 'ar-portrait' : 'ar-landscape'}`}>
                        {inDisplayOrder(FRAMES.filter(f => locked(f) && !f.season)).map(f => (
                          <button
                            key={f.id}
                            className={`frame-tile locked ${frameId === f.id ? 'on' : ''}`
                              + (fitsShape(f, shape) ? '' : ' other-shape')}
                            /* 鍵つきでも選べる（試着できる）。撮ると斜めの
                               鍵シールが焼かれる。買う道はすぐ下の帯から。
                               ⚠️ **いまの向きに合わない絵を押したら、向きも
                                  一緒に変える。** 押しても何も起きないと
                                  「壊れている」に見える（2026-08-31） */
                            onClick={() => {
                              if (!fitsShape(f, shape)) {
                                pickShape(shape === 'portrait' ? 'landscape' : 'portrait');
                              }
                              setFrameId(f.id);
                            }}
                            title={t('locked_hint')}
                          >
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
                            <span className="lock-mark">{t('frame_locked')}</span>
                          </button>
                        ))}
                      </div>
                      <button className="paid-buy" onClick={showUnlock}>{t('unlock_buy_app')}</button>
                    </>
                  )}
                </>
              )}

              {/* おためし中の知らせ。タイルのタップを試着に譲ったので、
                  **ここが「買う」への入口**になる（2026-08-31） */}
              {builtinFrame && locked(builtinFrame) && (
                <div className="trial-bar">
                  <span>{t('trial_hint')}</span>
                  <button className="trial-buy" onClick={showUnlock}>{t('trial_buy')}</button>
                </div>
              )}

              {/* ⚠️ 「動き」「色み」「撮るボタンの位置」を外した。
                  2026-08-31、伊波さん「動きのエフェクトも、色味もいらないよ？」
                  「3つとも消す」。

                  フレームを選ぶ画面に3段も設定が並んでいて、主役のフレーム
                  一覧を下へ押していた。選ぶものが多いほど迷う。
                  仕組み（effects.ts の setAmbient / setTone）は残してある。
                  戻すときは git の履歴からここへ戻すこと */}


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
                    {/* ⚠️ **「解除をやめる」を必ず残すこと。**（2026-08-31、
                        伊波さん「課金ボタンないよ」）。買う入口は
                        `{!unlocked && ...}` で全部消えるので、これが無いと
                        **一度解除された端末では二度と購入画面を確かめられない。**
                        買った事実はストア側が覚えているので、次に起動すれば戻る */}
                    <button className="unlock-relock" onClick={() => { relock(); setUnlocked(false); }}>
                      {t('unlock_relock')}
                    </button>
                  </>
                ) : (
                  <>
                    <b className="unlock-title">{t('unlock_title')}</b>
                    <p className="sheet-note">{t('unlock_lead')}</p>
                    <ul className="unlock-points">
                      <li>{t('unlock_p1')}</li>
                      <li>{t('unlock_p2')}</li>
                    </ul>
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
            <div className="shot-big">
              {/* ⚠️ **飾りは .shot-stage の中に置くこと。**
                  .shot-big は画面いっぱいに広がるが、写真は max-height で縮む。
                  飾りを .shot-big 基準にすると、縦の写真で大きさも位置も
                  出来上がりとずれる（setup.css の .shot-stage を読むこと）。
                  bigShotRef もこの台を指す。指の位置を割合に直すとき、
                  基準が写真そのものでないとずれるため */}
              <div className="shot-stage" ref={bigShotRef}>
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
                    // 台（写真）の実寸から出す。cqw が使えない理由は
                    // stageW の宣言のところに書いてある
                    fontSize: `${(stageW * d.size / 100).toFixed(2)}px`,
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
            {/* ⚠️ **「インスタ用」は消した**（2026-08-30、伊波さん
                「インスタ用を通常にしようよ」）。
                端末へはいつも 4:5 で保存するので、分ける意味が無くなった。
                選ぶものが減るほど迷わない */}
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
      {/* ぜんぶ使えるようにする（単独の画面）。
          ⚠️ **フレーム一覧の中にある案内とは別。** あちらはカメラが動かないと
             たどり着けない。ここは最初の画面から直接開ける
             （buyOpen の宣言のところを読むこと）。
             中身は同じ StoreKit の買い物と、購入の復元 */}
      {buyOpen && (
        <div className="album-screen buy-screen">
          <div className="album-head">
            <button className="album-close" onClick={() => setBuyOpen(false)}>{t('btn_back')}</button>
            <span className="album-title">{t('unlock_title')}</span>
            <span className="album-count" />
          </div>
          <div className="buy-screen-body">
            <div className={`unlock-box ${unlocked ? 'done' : ''}`}>
              {unlocked ? (
                <p className="unlock-ok">{t('unlock_ok')}</p>
              ) : (
                <>
                  <p className="unlock-lead">{t('unlock_lead')}</p>
                  <ul className="unlock-points">
                    <li>{t('unlock_p1')}</li>
                    <li>{t('unlock_p2')}</li>
                  </ul>
                  {/* ⚠️ アプリの中だけ。Web 版はこの画面を使わない
                      （外の売り場へ誘導すると審査で弾かれる） */}
                  <button className="unlock-buy" onClick={buyNow} disabled={buyBusy}>
                    {buyBusy ? '…' : t('unlock_buy_app')}
                  </button>
                  <button className="unlock-restore" onClick={restoreNow} disabled={buyBusy}>
                    {t('unlock_restore')}
                  </button>
                  {buyNG && <p className="unlock-ng">{t('unlock_buy_ng')}</p>}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* プリシートを作る画面（2026-08-31）。
          「3〜7枚えらぶ → 型をえらぶ → 保存」の3手だけ。
          ⚠️ **型に名前を付けない。**形をそのまま小さく見せれば言葉は要らないし、
             日本語と英語で名前を用意する手間も無くなる（sheet.ts の頭を読むこと） */}
      {screen === 'sheet' && (
        <div className="setup-screen sheet-screen">
          <div className="setup-header">
            <h2 className="setup-title">{t('sheet_title')}</h2>
            <button className="setup-close-btn" onClick={() => setScreen('setup')}>{t('btn_back')}</button>
          </div>

          <div className="setup-content">
            <p className="sheet-lead">{t('sheet_lead')}</p>

            <div className="sheet-sources">
              <button
                className="sheet-src"
                onClick={openAlbumForSheet}
                disabled={sheetPhotos.length >= MAX_PHOTOS}
              >{t('sheet_from_album')}</button>
              <button
                className="sheet-src"
                onClick={() => sheetFileRef.current?.click()}
                disabled={sheetPhotos.length >= MAX_PHOTOS}
              >{t('sheet_from_device')}</button>
              <input
                type="file" accept="image/*" multiple
                ref={sheetFileRef} style={{ display: 'none' }}
                onChange={takeFilesIntoSheet}
              />
            </div>

            {/* 選んだもの。番号は「何番目に大きく出るか」でもある */}
            {sheetPhotos.length > 0 && (
              <>
                <div className="sheet-picked">
                  {sheetPhotos.map((src, i) => (
                    <button
                      key={i}
                      className="sheet-picked-cell"
                      title={t('sheet_tap_del')}
                      onClick={() => setSheetPhotos(prev => prev.filter((_, j) => j !== i))}
                    >
                      <img src={src} alt="" />
                      <span className="sheet-picked-no">{i + 1}</span>
                    </button>
                  ))}
                </div>
                <p className="sheet-hint">
                  {sheetPhotos.length < MIN_PHOTOS
                    ? t('sheet_need_more').replace('{n}', String(MIN_PHOTOS - sheetPhotos.length))
                    : sheetPhotos.length >= MAX_PHOTOS
                      ? t('sheet_room_full').replace('{n}', String(MAX_PHOTOS))
                      : t('sheet_tap_del')}
                </p>
              </>
            )}

            {sheetLayouts.length > 0 && (
              <div className="sheet-layouts">
                <h3 className="setup-section-title">{t('sheet_layout')}</h3>
                <div className="sheet-layout-row">
                  {sheetLayouts.map(l => (
                    <button
                      key={l.id}
                      className={`sheet-layout ${sheetLayout?.id === l.id ? 'on' : ''}`}
                      onClick={() => setSheetLayoutId(l.id)}
                    >
                      <span className="sheet-layout-paper">
                        {l.cells.map((c, i) => (
                          <span key={i} style={{
                            left: `${c.x * 100}%`, top: `${c.y * 100}%`,
                            width: `${c.w * 100}%`, height: `${c.h * 100}%`,
                          }} />
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {sheetBusy && <p className="sheet-hint">{t('msg_wait')}</p>}

            {sheetPreview && (
              <>
                <div className="sheet-preview"><img src={sheetPreview} alt="" /></div>
                <button className="sheet-save" onClick={saveSheet}>{t('sheet_save')}</button>
                <button className="sheet-clear" onClick={() => setSheetPhotos([])}>{t('sheet_clear')}</button>
              </>
            )}
          </div>
        </div>
      )}

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
                {albumEditing === 'del' ? (
                  <>
                    <button className="album-tool" onClick={() => { setAlbumEditing(false); setAlbumPicked(new Set()); }}>{t('btn_cancel')}</button>
                    <button
                      className="album-tool album-del"
                      disabled={!albumPicked.size}
                      onClick={deletePicked}
                    >{albumPicked.size ? `${albumPicked.size}枚を消す` : '消すものを選んでね'}</button>
                  </>
                ) : albumEditing === 'sort' ? (
                  <>
                    <button className="album-tool" onClick={() => { setAlbumEditing(false); setAlbumPicked(new Set()); }}>{t('btn_cancel')}</button>
                    {/* ⚠️ **何をすればいいかを出しておくこと。**
                        2枚選ぶと入れ替わる、という動きは見ただけでは分からない */}
                    <span className="album-hint">{t('msg_sort_hint')}</span>
                  </>
                ) : albumEditing === 'pick' ? (
                  /* プリシートの材料を選んでいるとき（2026-08-31）。
                     ⚠️ **あと何枚入るかを出すこと。** 7枚で頭打ちなので、
                        選べるつもりで選んで無視されると、何が起きたか分からない */
                  <>
                    <button className="album-tool" onClick={() => { setAlbumEditing(false); setAlbumPicked(new Set()); setAlbumOpen(false); }}>{t('btn_cancel')}</button>
                    <button
                      className="album-tool album-use"
                      disabled={!albumPicked.size}
                      onClick={takePickedIntoSheet}
                    >{albumPicked.size
                      ? t('btn_use_picked').replace('{n}', String(Math.min(albumPicked.size, MAX_PHOTOS - sheetPhotos.length)))
                      : t('msg_pick_for_sheet')}</button>
                  </>
                ) : (
                  <>
                    <button className="album-tool" onClick={() => setAlbumEditing('del')}>{t('btn_choose_del')}</button>
                    {/* 並べ替え（2026-08-24、伊波さん「１枚ずつ選んで並べ替えたい」）。
                        2枚タップすると、その2枚の場所が入れ替わる */}
                    <button className="album-tool" onClick={() => { setAlbumEditing('sort'); setAlbumPicked(new Set()); }}>{t('btn_sort')}</button>
                  </>
                )}
              </div>

              {/* ページ送り（2026-08-31）。**1ページ50枚のシートが3枚つづり。**
                  ⚠️ **どのページに何枚入っているかを数で出すこと。**
                     空のページを開いて「消えた」と思われるのがいちばんまずい */}
              {ALBUM_PAGES > 1 && (
                <div className="album-pages">
                  {Array.from({ length: ALBUM_PAGES }, (_, i) => {
                    const has = albumList.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE).length;
                    return (
                      <button
                        key={i}
                        className={`album-page-btn ${albumPage === i ? 'on' : ''}`}
                        onClick={() => setAlbumPage(i)}
                      >
                        <span className="album-page-no">{i + 1}</span>
                        <span className="album-page-has">{has}/{PAGE_SIZE}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="album-grid">
                {albumPageItems.map(it => (
                  <button
                    key={it.id}
                    // ⚠️ **向きは、しまうときに決めた it.wide を使う**（2026-08-19）。
                    //    一覧で絵を読んでから測る形は、**キャッシュだと
                    //    onLoad が来ない**ので2回目以降に効かなかった
                    //    （伊波さん「プリクラ帳はこわれたまま」「直ってない」）。
                    //    it.wide が無い古いものは、下の useEffect が測って埋める
                    className={`album-cell ${albumPicked.has(it.id) ? 'picked' : ''} ${it.wide ? 'is-wide' : ''}`}
                    onClick={async () => {
                      if (albumEditing === 'sort') {
                        // ⚠️ **2枚目を押した時点で入れ替える。**
                        //    「決定」を押させると一手増えるし、
                        //    何が起きるのか分からないまま待たせることになる
                        if (albumPicked.has(it.id)) { setAlbumPicked(new Set()); return; }
                        const first = [...albumPicked][0];
                        if (first === undefined) { setAlbumPicked(new Set([it.id])); return; }
                        setAlbumPicked(new Set());
                        await album.swap(albumList.map(x => x.id), first, it.id);
                        setAlbumList(await album.list());
                        return;
                      }
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
                {/* ⚠️ **50枚ぶんの枠をはじめから出す**（2026-08-25、伊波さん
                    「プリクラ帳は初めから５０枚入りのしーとにしたら？」）。
                    実物のシールブックと同じで、**あと何枚貼れるかが目で分かる**。
                    ⚠️ **1枚も無いときは出さない**（伊波さん「空の時は空で」）。
                    空っぽの棚が50個並んでも、集めたくならない */}
                {/* ⚠️ **空き枠は「そのページの残り」ぶんだけ出す。**
                    全体の残りを出すと、1ページ目に150枚ぶんの枠が並ぶ */}
                {Array.from({ length: Math.max(0, PAGE_SIZE - albumPageItems.length) }, (_, i) => (
                  <div key={'empty' + i} className="album-cell empty" aria-hidden="true" />
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
