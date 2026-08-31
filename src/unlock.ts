// 解除のしくみ。
//
// ¥300 の買い物ひとつで、追加のフレームと透かし消しの両方が解ける
// （2026-08-11、伊波さん「両方」）。分けると買い物が2回になって、そこで倍こぼれる。
//
// サーバーは立てていない。こちらのサーバーが落ちた日に、払った人が
// 使えなくなるのが売り物で一番痛いため（伊波さんと相談のうえ）。
//
// ■ 2026-08-31、解除キーの道を消した
//
// Web版をやめたので（伊波さん「WEB版やめる」）、**買う道はストアの課金だけ**に
// なった。BOOTH と Ko-fi はすでに閉じていて、キーを買った人もいない
// （伊波さん「買った人いないし」）。
// 消したもの：`tryUnlock` / `savedKey` / `relock` / 指紋の照合 / `keys.ts`。
// **戻すときは、まず売り場を用意してからにすること。**

import { initBilling, isNativeApp } from './billing';

/** ストアで買ったことが分かったときに入れておく印 */
const STORE_PLAY = 'tinycube.unlock.play';

let unlocked = false;
try {
  unlocked = !!localStorage.getItem(STORE_PLAY);
} catch { /* 端末が localStorage を断っていても、その回だけ解除できる */ }

/** 解除の状態が変わったときに画面へ知らせる係。App.tsx が登録する。
    Play の買い物は「押した直後」ではなく、あとから確かめが返ってくるので、
    その場で答えを返せない。分かった時点で呼ぶ */
const listeners = new Set<(v: boolean) => void>();

export function onUnlockChange(fn: (v: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Play で買ってあることが分かったときに呼ばれる */
function markOwned() {
  if (unlocked) return;
  unlocked = true;
  try { localStorage.setItem(STORE_PLAY, '1'); } catch { /* 残せなくてもその回は解除されている */ }
  listeners.forEach(fn => fn(true));
}

/** アプリの起動時に一度だけ呼ぶ。Play に「前に買っていますか」を聞きに行く。
    機種を変えても買い直しにならないようにするため */
export function startBilling(): void {
  if (!isNativeApp()) return;
  void initBilling(markOwned);
}

export function isUnlocked(): boolean {
  // ---- 経緯 --------------------------------------------------------------
  //
  // 2026-08-15、全部無料にして常に true を返していた（伊波さん「今の課金
  // ３００円外して全部入れる。コラボ企画や、スポンサーを狙う」）。
  //
  // 2026-08-17、**¥500 の追加フレーム**を売ることにしたので判定を戻した
  // （伊波さん「５００円のフレーム追加にする」）。
  //
  // ⚠️ **いま配っている118枚は無料のまま。** frames.ts から paid の印を
  //    53枚ぶん外してある。鍵がかかるのは**これから描き下ろす分だけ**。
  //    8/16 のリリースノートに「フレーム全部かいほうしました！」と書いて
  //    配信済みなので、あとから鍵をかけると取り上げになる。
  return unlocked;
}

