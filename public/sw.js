// 枠の絵をスマホの中に貯めておく係。
//
// 枠は43種で 6.1MB ある。開くたびに落とし直すと、通信の細い場所では
// 待たされるし、通信量も食う。一度落としたものは端末に残す。
//
// ただし「古いアプリを永久に出し続ける」のが一番まずい。直したものが
// 届かなくなるので、種類ごとに扱いを分けている。
//
//   画面そのもの（HTML）… 毎回ネットを見る。新しければそれを出す
//   JS・CSS          … 毎回ネットを見る。**貯めない**（下の KEEP を見ること）
//   枠の絵・アイコン    … 端末にあればそれを出す
//
// 名前に日付を入れてあるので、ここを書き換えれば古い貯金は捨てられる。

// ここを書き換えると、端末に貯めてあるものを全部捨てて取り直す。
// 枠の絵はファイル名を変えずに中身だけ差し替えることがあるので、
// 絵を作り直したら必ずここも変えること。変えないと、古い絵を持っている
// 端末には新しい絵が永久に届かない（2026-08-11、顔ハメが黒いままだった）
const CACHE = 'tinycube-2026-08-13c';

// 端末に貯めてよいもの。**絵だけ**にする。
//
// ⚠️ 以前はここに /assets/ が入っていて、JS と CSS まで貯めていた。
//    貯金にあるものを無条件で返す作りなので、**古い index-*.js が残ると
//    HTML だけ新しくなっても中身は古いまま**になる。
//    2026-08-13、本番で「説明が一番古いものに置き換わる」「フレームが出ない」
//    「壊れたアプリ」として表に出た。JS と CSS は毎回ネットを見ること
//    （ファイル名に英数字が付くので、二重に持つ無駄も出ない）。
const KEEP = /\/frames\/|\/icon-|\/apple-touch-icon\.png$|\/favicon\.svg$/;

self.addEventListener('install', () => {
  // 前の係とすぐ交代する。待たせると、直したものが次に開くまで届かない
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 古い名前の貯金を捨てる
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // よそのサーバーには手を出さない

  // 画面そのもの。新しいものを優先し、繋がらないときだけ貯金から出す
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('/', fresh.clone());
        return fresh;
      } catch {
        return (await caches.match('/')) ?? Response.error();
      }
    })());
    return;
  }

  if (!KEEP.test(url.pathname)) return;

  // 絵や JS。あればそれを出す。無ければ取ってきて、ついでに貯めておく
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    return res;
  })());
});
