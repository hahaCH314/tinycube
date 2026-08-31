import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 画面の向きの固定を外す。
//
// 最初に出した manifest が縦固定だった。その時点でホーム画面に追加すると、
// あとから manifest を直しても、入っているアプリには古い設定が残る
// （2026-08-10、伊波さんの「回るのに tinyCUBE だけ回らない」）。
// 実行時にも外しておけば、追加し直さなくても回るようになる。
try {
  const so = screen.orientation as ScreenOrientation & { unlock?: () => void };
  so?.unlock?.();
} catch {
  // 対応していない環境では何もしない（元から回る）
}

// 枠の絵を貯めておく係（sw.js）は 2026-08-31 に廃止した。
//
// ■ なぜやめたか
//
// Web版をやめたので（伊波さん「WEB版やめる」）、動く先はアプリだけになった。
// **アプリの中では、枠の絵はもう端末の中にある**（capacitor.config.ts の
// webDir: 'dist'）。落とし直す通信が無いので、貯める意味が無い。
// 意味が無いのに、6MB ぶんを二重に持ち、2026-08-11（顔ハメが黒いまま）と
// 2026-08-14（入れ替えた17枚が届かない）で2回転んだ仕組みが動き続けていた。
//
// ■ ⚠️ **登録をやめるだけでは足りない**
//
// すでに入っている Android のアプリには、**登録済みの係が生きている。**
// 係は sw.js を消しても自分の写しで動き続けるので、こちらから外しにいく。
// iOS は capacitor:// で動くため、もともと登録できていない。
//
// **この片付けは、何度か版を重ねたら消してよい**（全員の端末から外れたあと）。
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations?.()
    .then(rs => rs.forEach(r => r.unregister()))
    .catch(() => { /* 外せなくてもアプリは動く */ });
  caches?.keys?.()
    .then(ks => ks.forEach(k => caches.delete(k)))
    .catch(() => { /* 消せなくてもアプリは動く */ });
}
