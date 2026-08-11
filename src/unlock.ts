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

import { KEY_PRINTS } from './keys';

const STORE = 'tinycube.unlock';

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
  unlocked = !!localStorage.getItem(STORE);
} catch { /* 端末が localStorage を断っていても、その回だけ解除できる */ }

export function isUnlocked(): boolean {
  return unlocked;
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
  try { localStorage.removeItem(STORE); } catch { /* 消せなくても次に開けば効く */ }
}
