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

// 枠の絵を端末に貯めておく係を登録する。
// 43種で 6.1MB あり、開くたびに落とし直すと通信の細い場所で待たされる。
// 画面そのもの（HTML）は毎回ネットを見るので、直したものは次に開けば届く。
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 登録できなくてもアプリは動く（毎回落とし直すだけ）
    });
  });
}
