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
// 写真アプリへ直接しまう自前の係（android/.../GalleryPlugin.java）。
// ⚠️ @capacitor-community/media はやめた。READ_MEDIA_IMAGES を要求し、
//    それを宣言すると Play が「19,037台が対象外」と警告するため（2026-08-18）
import { registerPlugin } from '@capacitor/core';
const Gallery = registerPlugin<{
  save(o: { data: string; name: string; isVideo: boolean }): Promise<{ uri: string }>;
}>('Gallery');

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
      const data = await toBase64(blob);

      // ⚠️ **自前の Gallery で、押したその場で写真アプリへしまう**（2026-08-18）。
      //    @capacitor-community/media は READ_MEDIA_IMAGES を要求する。
      //    それは「他人の写真も読む」ための権限で保存には要らないのに、
      //    宣言すると Play が「19,037台が対象外」と警告した。
      //    権限を外すとプラグインが動かず共有シートに落ちる、という板挟みに
      //    なっていた（伊波さん「やっぱり共有画面、しかもめっちゃ遅い」）。
      //
      //    Android 10 以降は MediaStore に自分で書けば**権限が要らない**。
      //    GalleryPlugin.java がそれをやる。
      //
      //    ⚠️ **一時ファイルを作らないこと。** 前は Filesystem に書いてから
      //       その場所を渡していたが、書く→読む→また書くで三度手間だった。
      //       base64 をそのまま渡せば一度で済む（「めっちゃ遅い」の一因）。
      //    ⚠️ **失敗したら共有シートへ落とすこと。** Android 9 以下など、
      //       ここで詰むと保存する手立てが無くなる
      try {
        await Gallery.save({ data, name, isVideo: name.endsWith('.mp4') });
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
          // ここで初めて一時ファイルを作る。共有シートは「ファイルの場所」を
          // 求めるため。**うまくいく道では作らない**（そのぶん速い）
          const written = await Filesystem.writeFile({
            path: name, data, directory: Directory.Cache,
          });
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
