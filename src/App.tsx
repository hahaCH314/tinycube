import { useState, useRef } from 'react'
import './App.css'
import { startRecording, type RecordHandle, type OutShape } from './recorder'
import { FRAMES, fitsShape, loadFrame } from './frames'
import { fireEffect, fireTelop, type EffectId } from './effects'
import { t, getLang, setLang } from './i18n'

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 録画関連のRef
  const recorderRef = useRef<RecordHandle | null>(null);
  
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
  // 読み込んだ動画が横長かどうか。16:9 を 9:16 へ詰めると画面の6割が黒帯になるので、
  // 元の形に合わせるほうを既定にして、そのことを画面で伝える（2026-08-10）
  const [shape, setShape] = useState<OutShape>('portrait');
  const [srcIsWide, setSrcIsWide] = useState(false);
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
  const [showGuide, setShowGuide] = useState(() => {
    try { return localStorage.getItem('tinycube.guideSeen') !== '1'; } catch { return true; }
  });
  const closeGuide = () => {
    try { localStorage.setItem('tinycube.guideSeen', '1'); } catch { /* 保存できなくても動く */ }
    setShowGuide(false);
  };
  // 枠は全部出す。形が合わないものは端が切れるが、それでも使いたいという
  // 判断（2026-08-10、伊波さん）。切れることはタイルに印を出して伝える
  const frame = FRAMES.find(f => f.id === frameId) ?? null;

  // 動画ファイルが選択されたとき
  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
    if (!v || !videoSrc) { alert(t('alert_load_first')); return; }
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

    if (!videoRef.current || !videoSrc) {
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
      // 枠は録画が始まる前に読み込みきる。間に合わないと、枠だけ
      // 抜けた動画が出てしまう
      const img = frame ? await loadFrame(frame) : null;
      recorderRef.current = await startRecording({
        video: videoRef.current,
        frame: img && frame ? { img, anchor: frame.anchor } : null,
        shape,
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
          <button className="settings-btn" onClick={() => setShowSettings(true)}>{t('settings_btn')}</button>
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
          {videoSrc ? (
            <video
              ref={videoRef}
              src={videoSrc}
              className="video-player"
              loop
              playsInline
              onEnded={() => setIsPreviewing(false)}
              onLoadedMetadata={e => {
                const v = e.currentTarget;
                const wide = v.videoWidth > v.videoHeight;
                setSrcIsWide(wide);
                setShape(wide ? 'landscape' : 'portrait');   // 元の形に合わせる
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

      {/* 録画中に指で押すところ。事前準備はここに置かない（PC版と同じ約束）。
          録画ボタンは親指が届く下端に、大きく置く */}
      <footer className="control-deck">
        <div className="effect-grid">
          {/* 一発エフェクト (Burst) */}
          <button className="effect-btn btn-burst" onClick={() => fire('flash')}>{t('eff_flash')}</button>
          <button className="effect-btn btn-burst" onClick={() => fire('glitch')}>{t('eff_glitch')}</button>
          
          {/* 効果音 (Sound) */}
          <button className="effect-btn btn-sound" onClick={() => fire('bam')}>{t('eff_bam')}</button>
          <button className="effect-btn btn-sound" onClick={() => fire('ding')}>{t('eff_ding')}</button>
          <button className="effect-btn btn-sound" onClick={() => fire('pon')}>{t('eff_pon')}</button>
          <button className="effect-btn btn-sound" onClick={() => fire('buzz')}>{t('eff_buzz')}</button>
          
          {/* テロップ (Telop)。言葉は設定で書き換えられる */}
          {telops.map((text, i) => text.trim() ? (
            <button
              key={i}
              className="effect-btn btn-telop"
              onClick={() => fireTelop(text)}
            >💬 {text}</button>
          ) : null)}
        </div>
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

            <h3>{t('setting_shape')}</h3>
            {srcIsWide && (
              <p className="sheet-note">{t('setting_shape_wide_note')}</p>
            )}
            <div className="shape-switch">
              <button className={shape === 'landscape' ? 'on' : ''} onClick={() => setShape('landscape')}>{t('setting_shape_land')}</button>
              <button className={shape === 'portrait' ? 'on' : ''} onClick={() => setShape('portrait')}>{t('setting_shape_port')}</button>
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
            <div className="frame-picker">
              <button className={`frame-tile none ${frameId === null ? 'on' : ''}`} onClick={() => setFrameId(null)}>{t('frame_none')}</button>
              {/* いまの形に合うものを先に並べる。43種あるので、
                  合わないものを探しながら送ることにならないように */}
              {[...FRAMES].sort((a, b) => Number(fitsShape(b, shape)) - Number(fitsShape(a, shape))).map(f => (
                <button
                  key={f.id}
                  className={`frame-tile ${frameId === f.id ? 'on' : ''}`}
                  onClick={() => setFrameId(f.id)}
                  title={f.name}
                >
                  <img src={f.file} alt={f.name} />
                  <span>{f.name}</span>
                  {!fitsShape(f, shape) && <em className="crop-mark">{t('frame_crop')}</em>}
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
