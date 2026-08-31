"use client";

import { useState } from "react";
import { Pencil, RotateCcw, Sparkles } from "lucide-react";

const colors = ["#f72f91", "#ffffff", "#101014", "#ffd62f", "#43bfe8", "#65ef3e", "#ff654c", "#a73be8"];

export default function Home() {
  const [mode, setMode] = useState<"draw" | "deco">("draw");
  const [shape, setShape] = useState<"round" | "note">("round");
  const [color, setColor] = useState(colors[0]);
  const [message, setMessage] = useState("");

  const flash = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 1800);
  };

  return (
    <main className="site-shell">
      <section className="app-canvas" aria-label="tinyCUBE decoration editor">
        <div className="paper-grain" aria-hidden="true" />
        <button className="retake tape-label" type="button" onClick={() => flash("撮り直し画面に戻ります")}>
          <RotateCcw aria-hidden="true" /> 撮り直す
        </button>

        <div className="doodle doodle-one" aria-hidden="true">⌁</div>
        <div className="doodle doodle-two" aria-hidden="true">✦</div>
        <div className="doodle doodle-three" aria-hidden="true">☆</div>

        <section className="polaroid" aria-label="写真プレビュー（写真なし）">
          <span className="tape tape-cyan" aria-hidden="true" />
          <span className="tape tape-pink" aria-hidden="true" />
          <div className="blank-photo" role="img" aria-label="顔写真を使わない装飾プレビュー">
            <div className="preview-checker" aria-hidden="true" />
            <div className="preview-sun" aria-hidden="true" />
            <div className="preview-cube" aria-hidden="true"><i /><i /><i /></div>
            <Sparkles className="preview-spark" aria-hidden="true" />
            <span className="brand">tinyCUBE</span>
          </div>
        </section>

        <section className="control-card">
          <div className="gem" aria-hidden="true">♥</div>
          <div className="tabs" role="tablist" aria-label="編集モード">
            <button className={mode === "draw" ? "tab tab-pink active" : "tab tab-pink"} type="button" role="tab" aria-selected={mode === "draw"} onClick={() => setMode("draw")}>
              <Pencil aria-hidden="true" />らくがき
            </button>
            <button className={mode === "deco" ? "tab tab-cyan active" : "tab tab-cyan"} type="button" role="tab" aria-selected={mode === "deco"} onClick={() => setMode("deco")}>
              <span className="ribbon-icon" aria-hidden="true">🎀</span>デコ
            </button>
          </div>

          <div className="speech">好きな言葉でスタンプ作れるよ</div>

          <div className="option-row">
            <span className="row-label">形</span>
            <button className={shape === "round" ? "choice active" : "choice"} type="button" onClick={() => setShape("round")}>まるもじ</button>
            <button className={shape === "note" ? "choice active" : "choice"} type="button" onClick={() => setShape("note")}>ノート</button>
          </div>

          <div className="option-row color-row">
            <span className="row-label">色</span>
            <div className="swatches" aria-label="文字色">
              {colors.map((item) => (
                <button key={item} className={color === item ? "swatch active" : "swatch"} style={{ "--swatch": item } as React.CSSProperties} type="button" aria-label={`色 ${item}`} aria-pressed={color === item} onClick={() => setColor(item)} />
              ))}
            </div>
          </div>

          <button className="stamp-button" type="button" style={{ "--stamp-color": color } as React.CSSProperties} onClick={() => flash(`${shape === "round" ? "まるもじ" : "ノート"}スタンプを作りました`)}>
            <span>この文字でスタンプを作る</span>
          </button>

          <p className="gesture-note">写真の飾りは、指1本で移動／2本でひねって傾け・大きさ</p>

          <button className="finish-button" type="button" onClick={() => flash("できあがりを表示します")}>できあがりを見る</button>
          <div className="gem gem-bottom" aria-hidden="true">♥</div>
        </section>

        <div className={message ? "toast show" : "toast"} role="status" aria-live="polite">{message}</div>
      </section>
    </main>
  );
}
