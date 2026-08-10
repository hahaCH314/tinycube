import { useState, useRef, useEffect } from 'react'
import './App.css'
import { startRecording, startStage, type RecordHandle, type OutShape } from './recorder'
import { FRAMES, fitsShape, loadFrame, type FrameAnchor } from './frames'
import { fireEffect, fireTelop, useCustomSounds, audioContext, setAmbient, type EffectId } from './effects'
import { SOUND_SLOTS, loadSaved, setCustom, clearCustom, customName, customBuffer } from './sounds'
import { t, getLang, setLang } from './i18n'
import { saveCustomFrame, getCustomFrames, deleteCustomFrame, type CustomFrameRecord } from './idb'

function App() {
  const [isRecording, setIsRecording] = useState(false);
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
    frame: { img: HTMLImageElement; anchor: FrameAnchor } | null;
    watermark: string | null;
  }>({ video: null, fill: false, shape: 'landscape', frame: null, watermark: 'tinyCUBE' });
  
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
  const TELOP_SLOTS = 12;
  const [telops, setTelops] = useState<string[]>(() => {
    const base = [
      '草', '神プレイ', 'うまい', 'やば',
      'ナイス', '待って', 'えぇ…', 'ざわ…ざわ…',
      '助けて', '最高', 'いま', 'は？',
    ];
    const filled = [...base, ...Array(TELOP_SLOTS - base.length).fill('')];
    try {
      const saved = localStorage.getItem('tinycube.telops');
      if (saved) {
        const arr = JSON.parse(saved) as string[];
        // 数が変わっても壊れないように、足りない分は空で埋める
        return Array.from({ length: TELOP_SLOTS }, (_, i) => arr[i] ?? '');
      }
    } catch { /* 壊れていたら既定に戻す */ }
    return filled;
  });
  const setTelop = (i: number, text: string) => {
    setTelops(prev => {
      const next = [...prev];
      next[i] = text;
      try { localStorage.setItem('tinycube.telops', JSON.stringify(next)); } catch { /* 保存できなくても動く */ }
      return next;
    });
  };

  const [frameId, setFrameId] = useState<string | null>(null);
  const [customFrames, setCustomFrames] = useState<CustomFrameRecord[]>([]);
  useEffect(() => {
    getCustomFrames().then(setCustomFrames).catch(console.error);
  }, []);
  const customFrameInputRef = useRef<HTMLInputElement>(null);
  
  const handleCustomFrameUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
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
  const [shape, setShape] = useState<OutShape>('landscape');   // 横で使うほうが持ちやすい（伊波さんの判断）
  const [srcIsWide, setSrcIsWide] = useState(false);
  // 映像の出どころ。動画ファイルか、その場のカメラか。
  // canvas に描いてから録る作りなので、出どころを差し替えるだけで
  // エフェクトも枠も透かしもそのまま乗る（2026-08-10）
  const [camOn, setCamOn] = useState(false);
  const [camFront, setCamFront] = useState(true);
  // 動画そのものの音を録るかどうか。BGM入りの動画にアフレコするときは
  // 消したい（2026-08-10、伊波さんの指示）
  const [useSrcAudio, setUseSrcAudio] = useState(true);
  // 形を自分で選んだかどうか。選んだあとに映像の向きで上書きすると、
  // 9:16 を選んだのに 16:9 に戻る（2026-08-10、伊波さんの指摘）。
  // 新しい映像を読み込んだときだけ、自動で合わせ直す
  const shapePicked = useRef(false);
  const pickShape = (v: OutShape) => { shapePicked.current = true; setShape(v); };
  const camStreamRef = useRef<MediaStream | null>(null);
  // 描画の係が毎フレーム読む。state を直接見ると古い値のままになる
  const camOnRef = useRef(false);
  // 効果音の差し替え。入れてある音があればそちらを鳴らす
  const soundInputRef = useRef<HTMLInputElement>(null);
  const [soundSlot, setSoundSlot] = useState<EffectId | null>(null);
  const [soundVer, setSoundVer] = useState(0);
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
  const [showSettings, setShowSettings] = useState(false);
  // tinyCUBE はスマホで使うもの。PC で開いた人には、そう伝えてから通す。
  // 塞がずに「このまま使う」を用意しているのは、確かめたい人を止めないため
  // （2026-08-10、伊波さん「基本PCで開かないから」「スマホだけ」）
  const [pcOk, setPcOk] = useState(false);
  const onPC = typeof window !== 'undefined'
    && window.matchMedia('(min-width: 900px) and (pointer: fine)').matches;
  // 「試してみる」。録画せずに動画だけ流す。一発撮りなので、本番前に中身と
  // 長さを確かめられないと押すのが怖い（2026-08-10、伊波さんの指示）
  const [isPreviewing, setIsPreviewing] = useState(false);
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

  const [showGuide, setShowGuide] = useState(() => {
    try { return localStorage.getItem('tinycube.guideSeen') !== '1'; } catch { return true; }
  });
  const closeGuide = () => {
    try { localStorage.setItem('tinycube.guideSeen', '1'); } catch { /* 保存できなくても動く */ }
    setShowGuide(false);
  };
  // 枠は全部出す。形が合わないものは端が切れるが、それでも使いたいという
  // 判断（2026-08-10、伊波さん）。切れることはタイルに印を出して伝える
  const builtinFrame = FRAMES.find(f => f.id === frameId) ?? null;
  const customFrame = customFrames.find(f => f.id === frameId) ?? null;
  const frame = builtinFrame || (customFrame ? { id: customFrame.id, name: 'マイフレーム', file: customFrame.dataUrl, anchor: 'wide' as FrameAnchor } : null);


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
    });
  }, []);

  // 選んだ枠の絵を読み込んでおく。録画の直前に読むと間に合わない
  useEffect(() => {
    liveRef.current.shape = shape;
    if (!frame) { liveRef.current.frame = null; return; }
    let alive = true;
    loadFrame(frame).then(img => {
      if (alive) liveRef.current.frame = { img, anchor: frame.anchor };
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

  // 入れてある効果音を読み直し、鳴らすときに使えるようにする
  useEffect(() => {
    useCustomSounds(customBuffer);
    const ctx = audioContext();
    if (ctx) loadSaved(ctx).then(() => setSoundVer(v => v + 1));
  }, []);

  const onSoundFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slot = soundSlot;
    e.target.value = '';
    if (!file || !slot) return;
    const ctx = audioContext();
    if (!ctx) return;
    try {
      await setCustom(ctx, slot, file);
      setSoundVer(v => v + 1);
    } catch {
      alert(t('sound_fail'));
    }
  };

  // <video> が画面に出てから、カメラの映像を繋ぐ
  useEffect(() => {
    camOnRef.current = camOn;
    const v = videoRef.current;
    if (!camOn || !v || !camStreamRef.current) return;
    v.srcObject = camStreamRef.current;
    v.muted = true;                          // 自分の声が返ってきて回るのを防ぐ
    v.play().catch(() => { /* 再生できなくても絵は canvas に出る */ });
  }, [camOn]);

  const save = async (blob: Blob, ext: string) => {
    const name = `tinycube_${Date.now()}.${ext}`;
    const file = new File([blob], name, { type: blob.type });

    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'tinyCUBE' });
        return;
      } catch (e: any) {
        // 本人が共有をやめただけなら、そこで終わり。
        // 失敗したときだけダウンロードへ回す
        if (e && e.name === 'AbortError') return;
      }
    }

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

  // 録画の開始・停止
  const toggleRecording = async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      recorderRef.current = null;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
      setIsRecording(false);
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
        watermark: 'tinyCUBE',
        onFinish: save,
        onError: (e) => alert(t('alert_rec_fail') + e.message),
      });
      await videoRef.current.play();
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
      {/* Header */}
      <header className="header">
        {/* 会社の名乗りは3サイトで揃える（CUBICENGINEstudio）。
            HP と同じく studio だけ色を変える。ロゴ画像は存在せず、
            会社HPも文字で組んでいるので、ここも文字で合わせている */}
        <div className="logo-container">
          <div className="logo-cube"></div>
          <div className="logo-names">
            <span className="logo-text">tinyCUBE</span>
            <span className="logo-studio">CUBICENGINE<span>studio</span></span>
          </div>
        </div>
        <div className="head-btns">
          <button className="settings-btn" onClick={() => setShowGuide(true)}>{t('guide_btn')}</button>
        </div>
      </header>

      {/* 9:16 Preview Stage */}
      <main className="preview-stage" onClick={triggerFileInput}>
        <input
          type="file"
          ref={fileInputRef}
          accept="video/*"
          onChange={handleVideoUpload}
          style={{ display: 'none' }}
        />

        {/* 書き出す形と同じ枠を用意して、その中だけを見せる。
            スマホの画面の形そのままに映していると、横（16:9）で書き出すときに
            「見えているもの」と「出てくるもの」が別物になる（2026-08-10、伊波さんの指摘）。
            中の並べ方も recorder.ts と同じにしてある（映像は contain、枠は cover） */}
        <div
          className="stage-box"
          /* カスタムプロパティは文字列で渡す。数値だと React が落として
             var() が既定値に落ちる */
          style={{ '--ar': shape === 'portrait' ? '0.5625' : '1.7778' } as React.CSSProperties}
        >
          <canvas ref={canvasRef} className="stage-canvas" />
          {/* 縦に持ったまま横向きの動画を作ろうとすると、映す場所が細くなる。
              持ち替えれば2倍以上広く使える（2026-08-10、伊波さんの指示） */}
          {shape === 'landscape' && portraitDevice && (
            <div className="turn-hint">{t('turn_hint')}</div>
          )}
          {(videoSrc || camOn) ? (
            <video
              ref={videoRef}
              src={videoSrc ?? undefined}
              className="video-player hidden-source"
              loop
              playsInline
              onEnded={() => setIsPreviewing(false)}
              onLoadedMetadata={e => {
                const v = e.currentTarget;
                const wide = v.videoWidth > v.videoHeight;
                setSrcIsWide(wide);
                // 自分で選んでいたら、それを尊重する
                if (!shapePicked.current) setShape(wide ? 'landscape' : 'portrait');
              }}
              muted /* 録画を始めるときに recorder が解除する。動画の音もマイクと混ぜて録るため */
            />
          ) : (
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

          {/* 枠のプレビュー。書き出しでは canvas に焼き込まれる。
              置き方は recorder.ts の drawFrame と揃えること。
              wide と full は画面いっぱい（はみ出した側を切る）、
              top と bottom は横幅いっぱいで上端／下端に寄せる。
              以前は wide に位置指定が無く、20種の枠が見えていなかった */}
          {frame && (
            <img
              src={frame.file}
              alt=""
              className="frame-overlay"
              style={
                frame.anchor === 'top' ? { top: 0, width: '100%', height: 'auto' }
                : frame.anchor === 'bottom' ? { bottom: 0, width: '100%', height: 'auto' }
                : { inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
              }
            />
          )}
        </div>
      </main>

      {/* 中央に配置された設定ボタン */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0' }}>
        <button 
          onClick={() => setShowSettings(true)}
          style={{ 
            background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)', 
            border: 'none', 
            borderRadius: '24px', 
            padding: '12px 24px', 
            color: 'white', 
            fontWeight: 'bold', 
            fontSize: '14px',
            boxShadow: '0 4px 12px rgba(236, 72, 153, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer'
          }}
        >
          <span style={{ fontSize: '18px' }}>✨</span>
          フレームやカメラの設定を開く
          <span style={{ fontSize: '18px' }}>⚙️</span>
        </button>
      </div>

        {/* クラス名の left / right は「どちらの塊か」を表すだけ。
            画面のどちら側に置くかは CSS で決めている。
            2026-08-10 に、右＝エフェクトと音、左＝文字 に入れ替えた */}
        <div className="effect-grid effect-left">
          {/* 一発エフェクト (Burst) */}
          <button className="effect-btn btn-burst" onClick={() => fire('flash')}>{t('eff_flash')}</button>
          <button className="effect-btn btn-burst" onClick={() => fire('glitch')}>{t('eff_glitch')}</button>
          {/* こちらは押している間ずっと出る。押すたびに入切する */}
          <button
            className={`effect-btn btn-burst ${ambientOn ? 'on' : ''}`}
            onClick={toggleAmbient}
          >{t('eff_emotional')}</button>
          
          {/* 効果音 (Sound) */}
          <button className="effect-btn btn-sound" onClick={() => fire('bam')}>{t('eff_bam')}</button>
          <button className="effect-btn btn-sound" onClick={() => fire('ding')}>{t('eff_ding')}</button>
          <button className="effect-btn btn-sound" onClick={() => fire('pon')}>{t('eff_pon')}</button>
          <button className="effect-btn btn-sound" onClick={() => fire('buzz')}>{t('eff_buzz')}</button>
          <button className="effect-btn btn-sound" onClick={() => fire('clap')}>{t('eff_clap')}</button>
          <button className="effect-btn btn-sound" onClick={() => fire('drum')}>{t('eff_drum')}</button>
          <button className="effect-btn btn-sound" onClick={() => fire('blip')}>{t('eff_blip')}</button>
          <button className="effect-btn btn-sound" onClick={() => fire('dread')}>{t('eff_dread')}</button>
          <button className="effect-btn btn-sound" onClick={() => fire('slash')}>{t('eff_slash')}</button>
          <button className="effect-btn btn-sound" onClick={() => fire('fanfare')}>{t('eff_fanfare')}</button>
          
        </div>

        <div className="effect-grid effect-right">
          {/* テロップ (Telop)。言葉は設定で書き換えられる */}
          {telops.map((text, i) => text.trim() ? (
            <button
              key={i}
              className="effect-btn btn-telop"
              onClick={() => fireTelop(text, telopDark, telopRandom)}
            >💬 {text}</button>
          ) : null)}
        </div>

      {/* 録画中に指で押すところ。事前準備はここに置かない（PC版と同じ約束）。
          録画ボタンは親指が届く下端に、大きく置く */}
      <footer className="control-deck">
        {/* 試してみる。録画中は押せない（押すと二重に再生されて頭から狂う） */}
        <button
          className="preview-btn"
          onClick={togglePreview}
          disabled={isRecording || !videoSrc}
        >
          {isPreviewing ? t('btn_preview_stop') : t('btn_preview')}
        </button>
        <button
          className={`record-btn big ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
        >
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'currentColor' }}></div>
          {isRecording ? t('btn_stop') : t('btn_record')}
        </button>
      </footer>

      {showGuide && (
        <div className="sheet-backdrop" onClick={closeGuide}>
          <div className="sheet guide" onClick={e => e.stopPropagation()}>
            <div className="sheet-head"><span>{t('guide_title')}</span></div>

            <ol className="guide-steps">
              <li><b>{t('guide_step1_title')}</b><br />{t('guide_step1_desc')}</li>
              <li><b>{t('guide_step2_title')}</b><br />{t('guide_step2_desc')}</li>
              <li><b>{t('guide_step3_title')}</b><br />{t('guide_step3_desc')}</li>
            </ol>

            <div className="guide-warn">
              <h3>{t('guide_warn_title')}</h3>
              <ul>
                <li>
                  <b>{t('guide_warn1_title')}</b>
                  <details><summary>くわしく</summary>{t('guide_warn1_desc')}</details>
                </li>
                <li>
                  <b>{t('guide_warn2_title')}</b>
                  <details><summary>くわしく</summary>{t('guide_warn2_desc')}</details>
                </li>
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
      {showSettings && (
        <div className="sheet-backdrop" onClick={() => setShowSettings(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-head">
              <span>{t('setting_title')}</span>
              <button onClick={() => setShowSettings(false)}>{t('setting_close')}</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Language / 言語</span>
              <select 
                style={{ background: '#0b1021', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: 4 }}
                value={getLang()} 
                onChange={(e) => {
                  setLang(e.target.value as 'ja' | 'en');
                  window.location.reload();
                }}
              >
                <option value="ja">日本語</option>
                <option value="en">English</option>
              </select>
            </div>

            <h3>{t('setting_video')}</h3>
            <button className="sheet-btn" onClick={() => fileInputRef.current?.click()}>
              {videoSrc ? t('setting_video_change') : t('setting_video_load')}
            </button>

            <h3>{t('setting_sounds')}</h3>
            <p className="sheet-note">{t('sounds_note')}</p>
            <div className="sound-list">
              {SOUND_SLOTS.map(id => {
                const name = customName(id);
                return (
                  <div key={id + soundVer} className="sound-row">
                    <button className="sound-try" onClick={() => fireEffect(id)}>▶</button>
                    <span className="sound-name">
                      {t(('eff_' + id) as never)}
                      {name && <em>{name}</em>}
                    </span>
                    <button
                      className="sound-set"
                      onClick={() => { setSoundSlot(id); soundInputRef.current?.click(); }}
                    >{name ? t('sound_change') : t('sound_load')}</button>
                    {name && (
                      <button
                        className="sound-set"
                        onClick={async () => { await clearCustom(id); setSoundVer(v => v + 1); }}
                      >↩</button>
                    )}
                  </div>
                );
              })}
            </div>
            <input
              type="file"
              accept="audio/*"
              ref={soundInputRef}
              style={{ display: 'none' }}
              onChange={onSoundFile}
            />

            <h3>{t('setting_camera')}</h3>
            <div className="shape-switch">
              <button className={camOn && camFront ? 'on' : ''} onClick={() => startCam(true)}>{t('cam_front')}</button>
              <button className={camOn && !camFront ? 'on' : ''} onClick={() => startCam(false)}>{t('cam_back')}</button>
              <button className={!camOn ? 'on' : ''} onClick={stopCam}>{t('cam_off')}</button>
            </div>

            <h3>{t('setting_srcaudio')}</h3>
            <div className="shape-switch">
              <button className={useSrcAudio ? 'on' : ''} onClick={() => setUseSrcAudio(true)}>{t('srcaudio_on')}</button>
              <button className={!useSrcAudio ? 'on' : ''} onClick={() => setUseSrcAudio(false)}>{t('srcaudio_off')}</button>
            </div>

            <h3>{t('setting_shape')}</h3>
            {srcIsWide && (
              <p className="sheet-note">{t('setting_shape_wide_note')}</p>
            )}
            <div className="shape-switch">
              <button className={shape === 'landscape' ? 'on' : ''} onClick={() => pickShape('landscape')}>{t('setting_shape_land')}</button>
              <button className={shape === 'portrait' ? 'on' : ''} onClick={() => pickShape('portrait')}>{t('setting_shape_port')}</button>
            </div>

            <h3>{t('setting_teloppos')}</h3>
            <div className="shape-switch">
              <button className={!telopRandom ? 'on' : ''} onClick={() => pickTelopPos(false)}>{t('telop_center')}</button>
              <button className={telopRandom ? 'on' : ''} onClick={() => pickTelopPos(true)}>{t('telop_random')}</button>
            </div>

            <h3>{t('setting_telopcolor')}</h3>
            <div className="shape-switch">
              <button className={!telopDark ? 'on' : ''} onClick={() => pickTelopColor(false)}>{t('telop_white')}</button>
              <button className={telopDark ? 'on' : ''} onClick={() => pickTelopColor(true)}>{t('telop_black')}</button>
            </div>

            <h3>{t('setting_telop')}</h3>
            <p className="sheet-note">{t('setting_telop_note')}</p>
            <div className="telop-inputs">
              {telops.map((text, i) => (
                <input
                  key={i}
                  className="telop-input"
                  value={text}
                  maxLength={20}
                  placeholder={`${i + 1}`}
                  onChange={e => setTelop(i, e.target.value)}
                />
              ))}
            </div>

            <h3>{t('setting_frame')}</h3>
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

            <div className="frame-picker">
              <button className={`frame-tile none ${frameId === null ? 'on' : ''}`} onClick={() => setFrameId(null)}>{t('frame_none')}</button>
              {FRAMES.filter(f => fitsShape(f, shape)).map(f => (
                <button
                  key={f.id}
                  className={`frame-tile ${frameId === f.id ? 'on' : ''}`}
                  onClick={() => setFrameId(f.id)}
                  title={f.name}
                >
                  <img src={f.file} alt={f.name} />
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default App
