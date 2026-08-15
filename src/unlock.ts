// 解除のしくみ。
//
// ¥300 の買い物ひとつで、追加のフレームと透かし消しの両方が解ける
// （2026-08-11、伊波さん「両方」）。分けると買い物が2回になって、そこで倍こぼれる。
//
// サーバーは立てていない。こちらのサーバーが落ちた日に、払った人が
// 使えなくなるのが売り物で一番痛いため（伊波さんと相談のうえ）。
// アプリはキーの「指紋」だけを持ち、その場で照合する。通信しない。
//
// 抜け道はある。キーを人に渡されたら止められないし、フレームの画像そのものは
// URL を直接叩けば誰でも落とせる。承知のうえでこの作りにしている。
// 止めるにはサーバーが要り、その代わりに「壊れたら誰も使えない」を抱えることになる。

// 2026-08-14 追記：Google Play のアプリ内課金を足した。
// アプリ（Android）では Play の課金で解ける。Web ではこれまでどおりキー入力。
// Play は「アプリの中で売るデジタルの品物は Play の課金を通すこと」を求めていて、
// 外の売り場（BOOTH / Ko-fi）へ誘導すると審査で弾かれるため。
// **キー入力は消さない。** BOOTH で既に買った人が使えなくなるのを避ける。
import { initBilling, isNativeApp } from './billing';
import { KEY_PRINTS } from './keys';

const STORE = 'tinycube.unlock';
/** Play で買ったことが分かったときに入れておく印。キーとは別に持つ */
const STORE_PLAY = 'tinycube.unlock.play';

/** 打ち方のゆれを吸収する。小文字、空白、ハイフン無しでも通す。
    tools/keys.mjs と同じ規則にしておくこと（ずれると照合できない） */
function normalize(key: string): string {
  return key.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function fingerprint(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalize(key));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

let unlocked = false;
try {
  // キーで解除したか、Play で買ったか。どちらでも解ける
  unlocked = !!localStorage.getItem(STORE) || !!localStorage.getItem(STORE_PLAY);
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
  // ---- 2026-08-15、全部無料にした --------------------------------------
  //
  // 伊波さん「今の課金３００円外して全部入れる。コラボ企画や、
  // スポンサーを狙う」。¥300 で数百人に売るより、**使っている人が
  // 何千人いるという事実**のほうが、コラボやスポンサーの話を持って
  // いくときの材料になる、という判断。買った人は0人だったので、
  // 誰にも不利益は出ない（同日、伊波さん「え？０だったよ」）。
  //
  // ⚠️ **課金の仕組みは消していない。** ここが true を返すだけ。
  //    気が変わったときに、この1行を戻せば元に戻る（Play の商品も
  //    残してある）。仕組みごと消すと、復活に再審査が要る。
  return true;
}

/** 買った人が持っているキー。前に入れたものが残っていれば、それを返す */
export function savedKey(): string | null {
  try { return localStorage.getItem(STORE); } catch { return null; }
}

/** キーを試す。合っていれば解除して true */
export async function tryUnlock(key: string): Promise<boolean> {
  if (!key.trim()) return false;
  let print: string;
  try {
    print = await fingerprint(key);
  } catch {
    return false;      // crypto.subtle は http では使えない。本番は https なので通る
  }
  if (!KEY_PRINTS.includes(print)) return false;
  unlocked = true;
  // 打ち込んだ形のまま残す。次に開いたときに本人が見て分かるように
  try { localStorage.setItem(STORE, key.trim()); } catch { /* 残せなくても、その回は解除されている */ }
  return true;
}

/** 解除を外す。端末を人に渡すときなど */
export function relock() {
  unlocked = false;
  try {
    localStorage.removeItem(STORE);
    // Play で買った印も消す。ただし**買った事実は Play 側が覚えている**ので、
    // 買い直しにはならない。次に起動すれば restorePurchases で戻る
    localStorage.removeItem(STORE_PLAY);
  } catch { /* 消せなくても次に開けば効く */ }
  listeners.forEach(fn => fn(false));
}
