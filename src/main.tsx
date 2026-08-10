import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

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
