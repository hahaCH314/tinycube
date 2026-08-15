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

/** いま Capacitor の入れ物（アプリ）の中で動いているか */
function inApp(): boolean {
  try {
    return !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
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
      const data = await toBase64(blob);
      const written = await Filesystem.writeFile({
        path: name,
        data,
        directory: Directory.Cache,   // 一時置き場。共有し終われば消えてよい
      });

      await Share.share({
        title: name,
        url: written.uri,
        dialogTitle: '保存先をえらんでね',
      });
      return { how: 'shared' };
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
