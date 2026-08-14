import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

// 枠の絵を貯めておく係（sw.js）の名札は、ビルドのあとに tools/stamp-sw.mjs が
// 埋める（package.json の build を見ること）。ここでは何もしない。
// public/ の素通しコピーは vite のどのフックよりあとに走るので、
// プラグインで dist/sw.js を書き換えても上書きされて消える。

try {
  const shibuyaCss = fs.readFileSync('e:/cmcube/916cube/docs/tinycube-skin-shibuya.css', 'utf8');
  const oldAppCss = fs.readFileSync('e:/cmcube/916cube/src/App.css', 'utf8');
  if (!oldAppCss.includes('渋谷デコラティブストリートカルチャー')) {
    const lines = oldAppCss.split('\n');
    const startIndex = lines.findIndex(line => line.includes('.setup-screen') || line.includes('.hand-setting'));
    if (startIndex !== -1) {
      const setupCss = lines.slice(startIndex).join('\n');
      const combined = shibuyaCss + '\n\n/* SETUP SCREEN STYLES PRESERVED */\n' + setupCss;
      fs.writeFileSync('e:/cmcube/916cube/src/App.css', combined);
      console.log('App.css updated successfully by vite.config.ts!');
    }
  }
} catch (e) {
  console.error(e);
}

// サンドイッチ枠の取り込みは、ここから毎回は走らせない。
// 走らせるたびに同じ17枚を別の id で足してしまい、一覧が二重になっていた
// （2026-08-13 に重複17行を削除）。足したいときは手で
//   node import_sandwiches.js
// を実行すること。
// try { require('./import_sandwiches.js'); } catch (e) { console.error(e); }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // 実機に届いているかを目で確かめるための印。画面の隅に出る（開発中だけ）
    __BUILD_STAMP__: JSON.stringify(
      new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    ),
  },
})
