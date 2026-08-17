// 撮ったものを端末に保存する係。
//
// ■ なぜ独立させたか
//
// Web とアプリ（Capacitor）で、保存のやり方がまったく違う。
// App.tsx の中に混ぜると、どちらかを直したときにもう一方を壊す。
//
// ■ アプリ（Android / iOS）で何が起きていたか
//
// **保存できていなかった**（2026-08-15、伊波さんが内部テストの実機で発見）。
//
//   a.download        … WebView には落とす仕組みが無く、**何も起きない**
//   navigator.share   … Capacitor の WebView には無いことが多い
//
// どちらも通らないのに、100ms 後に「保存しました！」と出していた。
// 撮ったものが消えたことに気づけない。
//
// ■ いまのやり方
//
//   アプリ … いったんファイルに書き出して、共有シートへ渡す。
//            そこから「画像を保存」「ビデオを保存」でアルバムへ入る
//   Web   … これまでどおり（Web Share → ダウンロード）

import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
// 写真アプリへ直接しまう。共有シートを開かずに済むぶん速い（2026-08-16）
import { Media } from '@capacitor-community/media';

/** いま Capacitor の入れ物（アプリ）の中で動いているか */
function inApp(): boolean {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/** 直接保存が失敗した理由。共有シートに落ちたとき、なぜ落ちたかを
 *  画面に出すために持つ（2026-08-17）。**黙って落ちると原因が追えない** */
let lastMediaError: string | null = null;
export function takeLastMediaError(): string | null {
  const v = lastMediaError; lastMediaError = null; return v;
}

/** Blob を base64 の文字列にする。Filesystem がこの形しか受け取らないため */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('読み取れませんでした'));
    r.onload = () => {
      const s = String(r.result);
      // "data:image/jpeg;base64,xxxx" の xxxx だけが要る
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.readAsDataURL(blob);
  });
}

export type SaveResult =
  | { how: 'shared' }      // 共有シートへ渡した（保存したかは本人しか知らない）
  | { how: 'downloaded' }  // ブラウザに落とした
  | { how: 'cancelled' }   // 本人がやめた
  | { how: 'failed'; why: string };

/**
 * 撮ったものを保存する。
 *
 * @param blob 保存したいもの
 * @param name ファイル名（tinycube_1234.jpg など）
 */
export async function saveMedia(blob: Blob, name: string): Promise<SaveResult> {
  const type = blob.type || (name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg');

  // ---- アプリのとき ----
  if (inApp()) {
    try {
      // いったん端末の中に書き出す。共有シートは「ファイルの場所」を求めるので、
      // Blob のままでは渡せない
      // ⚠️ **重い処理の前に、画面を一度描かせること。**
      //    base64 への変換は数MBだと1〜3秒かかる。呼ばれてすぐ始めると、
      //    直前に出した「準備しています…」が画面に出ないまま固まる
      //    （2026-08-16、伊波さん「保存の画面がでる…遅い」）。
      //    1コマ譲るだけで、待たされている理由が見えるようになる
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      // ⚠️ **Cache ではなく Data に書くこと**（2026-08-17）。
      //    Cache は端末が勝手に消せる置き場。Media が読みに行ったときには
      //    もう無い、ということが起こりうる。直接保存が失敗して共有シートへ
      //    落ちる原因のひとつ（伊波さん「かなり時間が空いて、共有画面へ」）。
      //    Data なら消されない。使い終わったら自分で消す（下の deleteFile）
      const data = await toBase64(blob);
      const written = await Filesystem.writeFile({
        path: name,
        data,
        directory: Directory.Data,
      });

      // ⚠️ **まず「写真アプリへ直接」を試す**（2026-08-16、伊波さん
      //    「保存のタイミングが遅い（自分のファイルに保存時）」）。
      //    以前は Share.share() で共有シートを開き、そこから「画像を保存」を
      //    選んでもらう形だった。シートが開くまで数秒かかるうえ、選ぶ手数も
      //    要る。Media なら押した時点で写真アプリに入る。
      //    ⚠️ **失敗したら共有シートへ落とすこと。** 端末や権限で使えない
      //       ことがあり、そこで詰むと保存する手立てが無くなる
      try {
        if (name.endsWith('.mp4')) {
          await Media.saveVideo({ path: written.uri });
        } else {
          await Media.savePhoto({ path: written.uri });
        }
        // 写真アプリに入ったので、一時ファイルは要らない。
        // 残すと端末の容量を食い続ける（撮るたびに増える）
        void Filesystem.deleteFile({ path: name, directory: Directory.Data })
          .catch(() => { /* 消せなくても保存は済んでいる */ });
        return { how: 'downloaded' };   // 端末に入ったことが確実に分かる
      } catch (mediaErr: any) {
        const m = String(mediaErr?.message ?? mediaErr);
        // ⚠️ **なぜ落ちたかを残すこと**（2026-08-17、伊波さん「かなり時間が
        //    空いて、共有画面へ」）。直接保存が失敗すると黙って共有シートに
        //    落ちるので、**原因が見えないまま「遅い」だけが残る**。
        //    呼び出し側（App.tsx）が画面に出せるように理由を返す
        lastMediaError = m.slice(0, 80);
        // 本人が権限を断ったなら、共有シートに落としても同じ結果になる。
        // それでも道を残す（他のアプリへ送るのは権限が要らない）
        if (!/cancel|abort|dismiss/i.test(m)) {
          await Share.share({
            title: name,
            url: written.uri,
            dialogTitle: '保存先をえらんでね',
          });
          return { how: 'shared' };
        }
        return { how: 'cancelled' };
      }
    } catch (e: any) {
      // 本人が閉じただけなら失敗ではない。
      // 文言は端末によって違うので、いくつか見る
      const msg = String(e?.message ?? e);
      if (/cancel|abort|dismiss/i.test(msg)) return { how: 'cancelled' };
      return { how: 'failed', why: msg };
    }
  }

  // ---- Web のとき ----
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return { how: 'shared' };
    } catch (e: any) {
      if (e?.name === 'AbortError') return { how: 'cancelled' };
      // 共有できなかったときは、下のダウンロードで拾う
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 100);
    return { how: 'downloaded' };
  } catch (e: any) {
    return { how: 'failed', why: String(e?.message ?? e) };
  }
}
