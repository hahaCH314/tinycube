import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 枠の絵を貯めておく係（sw.js）の名札は、ビルドのあとに tools/stamp-sw.mjs が
// 埋める（package.json の build を見ること）。ここでは何もしない。
// public/ の素通しコピーは vite のどのフックよりあとに走るので、
// プラグインで dist/sw.js を書き換えても上書きされて消える。

// ⚠️ **ここでソースを書き換えないこと。**
// 以前は渋谷スキンの CSS を src/App.css へ流し込む一度きりの作業が
// 置きっぱなしになっていた（2026-08-21 に削除）。困りごとが2つあった。
//
//   1. `e:/cmcube/...` という Windows の絶対パスが直書きで、Mac では
//      ビルドのたびにエラーを吐いていた
//   2. try/catch で黙るとはいえ、条件が揃えば **src/App.css を
//      毎ビルド書き潰す**。設定ファイルがソースを書き換えるのは危ない
//
// 渋谷スキンは既に src/App.css に取り込み済み（「渋谷デコラティブ
// ストリートカルチャー」の行がある）。元の CSS は docs/tinycube-skin-shibuya.css
// に残してあるので、やり直したくなったら手で流し込むこと。

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
