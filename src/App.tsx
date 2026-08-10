import { useState, useRef } from 'react'
import './App.css'
import { startRecording, type RecordHandle, type OutShape } from './recorder'
import { FRAMES, fitsShape, loadFrame } from './frames'
import { t, getLang, setLang, type Lang } from './i18n'
import { fireEffect, fireTelop, type EffectId } from './effects'

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
    if (!v || !videoSrc) { alert('先に動画を読み込んでください！'); return; }
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
      alert(t('alert_no_video'));
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
          <button className="settings-btn" onClick={() => setShowGuide(true)}>{t('btn_guide')}</button>
          <button className="settings-btn" onClick={() => setShowSettings(true)}>{t('btn_settings')}</button>
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
            <p>{t('preview_empty')}</p>
          </div>
        )}
        
        {/* 枠のプレビュー。書き出しでは canvas に焼き込まれる。
            ここは「どう見えるか」を確かめるためだけのもの */}
        {frame && (
          <img
            src={frame.file}
            alt=""
            style={{
              position: 'absolute', left: 0, width: '100%',
              top: frame.anchor === 'top' ? 0 : undefined,
              bottom: frame.anchor === 'bottom' ? 0 : undefined,
              height: frame.anchor === 'full' ? '100%' : undefined,
              pointerEvents: 'none',
            }}
          />
        )}
      </main>

      {/* 録画中に指で押すところ。事前準備はここに置かない（PC版と同じ約束）。
          録画ボタンは親指が届く下端に、大きく置く */}
      <footer className="control-deck">
        <div className="effect-grid">
          {/* 一発エフェクト (Burst) */}
          <button className="effect-btn btn-burst" onClick={() => fire('flash')}>💥 フラッシュ</button>
          <button className="effect-btn btn-burst" onClick={() => fire('glitch')}>⚡ グリッチ</button>
          
          {/* 効果音 (Sound) */}
          <button className="effect-btn btn-sound" onClick={() => fire('bam')}>🥁 どんっ</button>
          <button className="effect-btn btn-sound" onClick={() => fire('ding')}>✨ きらっ</button>
          <button className="effect-btn btn-sound" onClick={() => fire('pon')}>🫧 ぽん</button>
          <button className="effect-btn btn-sound" onClick={() => fire('buzz')}>📢 ぶー</button>
          
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
          {isPreviewing ? '⏸ とめる' : '▶ 試してみる（録画無し）'}
        </button>
        <button
          className={`record-btn big ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
        >
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'currentColor' }}></div>
          {isRecording ? '■ 停止' : '● 録画スタート'}
        </button>
      </footer>

      {showGuide && (
        <div className="sheet-backdrop" onClick={closeGuide}>
          <div className="sheet guide" onClick={e => e.stopPropagation()}>
            <div className="sheet-head"><span>tinyCUBE の使い方</span></div>

            <ol className="guide-steps">
              <li><b>動画を読み込む</b><br />すでに撮ってある動画に、声とエフェクトを乗せる道具です。</li>
              <li><b>録画スタートを押して喋る</b><br />動画が流れます。マイクの許可を聞かれたら「許可」を押してください。</li>
              <li><b>もう一度押すと止まります</b><br />そのまま保存できます。iPhone は共有シートから「ビデオを保存」を選んでください。</li>
            </ol>

            <div className="guide-warn">
              <h3>⚠ 撮る前に、必ず確認してください</h3>
              <ul>
                <li><b>他人の個人情報を映さない。</b>読み込んだ動画に映ったチャット、名前、住所、通知はすべて残ります。一度公開した動画は取り消せません。</li>
                <li><b>他人の作品を無断で使わない。</b>ゲーム映像、動画、音楽、画像には権利者がいます。投稿や収益化の可否は、各権利者の規約に従ってください。</li>
                <li><b>人を映す・録音するときは、相手の同意を得てください。</b>マイクの内容は実際に記録されます。</li>
                <li><b>人を貶める目的、誤解させる目的で使わないでください。</b></li>
              </ul>
              <p className="guide-note">
                枠の絵は本来 CMCUBE（PC版）のもので、16:9 で描かれています。
                縦（9:16）で使うと<b>左右が欠けます</b>。それでも使えるようにしてあるので、
                欠けるものには一覧で印を出しています。
              </p>
              <p className="guide-note">
                tinyCUBE がロイヤリティフリーを保証するのは、あなた自身が作った部分だけです。
                読み込んだ素材の権利処理は利用者の責任になります。
              </p>
            </div>

            {/* CMCUBE の紹介。tinyCUBE は「撮ったものに乗せる」道具なので、
                「撮りながら演出したい人」の行き先を出しておく。
                製品どうしを直リンクしない約束があるので、リンクは張らず名前だけ。
                探すときの手がかりとして、会社の名乗りを添えている */}
            <div className="promo">
              <div className="promo-head">
                <span className="promo-badge">PC版</span>
                <b>CMCUBE</b>
              </div>
              <p className="promo-lead">撮りながら、演出する。</p>
              <ul className="promo-points">
                <li>ゲーム画面を<b>そのまま録画</b>。読み込む手間がありません</li>
                <li>遊びながら<b>キーひとつ</b>でテロップ・効果音・エフェクト</li>
                <li>止めた瞬間に<b>完成</b>。あとから編集しません</li>
                <li>枠は<b>30種</b>。この tinyCUBE の枠は、そこから来ています</li>
              </ul>
              <p className="promo-foot">
                Windows / 買い切り。<b>CUBICENGINEstudio</b> で検索すると見つかります。
              </p>
            </div>

            <button className="sheet-btn" onClick={closeGuide}>確認しました。はじめる</button>
          </div>
        </div>
      )}

      {/* 設定。事前準備はすべてここに入れる */}
      {showSettings && (
        <div className="sheet-backdrop" onClick={() => setShowSettings(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-head">
              <span>⚙ 設定</span>
              <button onClick={() => setShowSettings(false)}>閉じる</button>
            </div>

            <h3>動画</h3>
            <button className="sheet-btn" onClick={() => fileInputRef.current?.click()}>
              {videoSrc ? '動画を選び直す' : '動画を読み込む'}
            </button>

            <h3>書き出しの形</h3>
            {srcIsWide && (
              <p className="sheet-note">
                読み込んだ動画は<b>横長</b>です。スマホを横向きにすると大きく見えます。
              </p>
            )}
            <div className="shape-switch">
              <button className={shape === 'landscape' ? 'on' : ''} onClick={() => setShape('landscape')}>横（16:9）</button>
              <button className={shape === 'portrait' ? 'on' : ''} onClick={() => setShape('portrait')}>縦（9:16）</button>
            </div>

            <h3>テロップの言葉</h3>
            <p className="sheet-note">
              下のボタンに出る言葉です。書き換えると、そのまま動画に出ます。
              <b>空にすると、そのボタンは出なくなります。</b>
            </p>
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

            <h3>枠</h3>
            <div className="frame-picker">
              <button className={`frame-tile none ${frameId === null ? 'on' : ''}`} onClick={() => setFrameId(null)}>なし</button>
              {FRAMES.map(f => (
                <button
                  key={f.id}
                  className={`frame-tile ${frameId === f.id ? 'on' : ''}`}
                  onClick={() => setFrameId(f.id)}
                  title={f.name}
                >
                  <img src={f.file} alt={f.name} />
                  <span>{f.name}</span>
                  {!fitsShape(f, shape) && <em className="crop-mark">端が欠けます</em>}
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
