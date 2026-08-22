// プリクラ帳。撮った写真をアプリの中に貯めておく場所。
//
// 伊波さん「プリクラ帳機能はできない？」「写真だけ」「50枚」（2026-08-15）。
// 撮ったプリクラをファイルに貼って友達と見せ合った、あの感覚をデジタルで。
//
// ■ なぜ IndexedDB なのか
//
// localStorage は **5MB しか入らない**。写真は3枚シートで 5.3MB あるので
// 1枚で溢れる。IndexedDB なら端末の空き容量まで入る。
//
// ■ 2つの大きさで持つ
//
//   見本(thumb)  32KB   一覧に出す用。50枚でも 1.6MB で済むので一覧が軽い
//   本体(full)   5.3MB  タップして大きく見るときだけ読む
//
// 一覧を開くたびに 5MB を50枚読んだら、待たされるうえに端末が熱くなる。
//
// ■ いっぱいになったら
//
// ⚠️ **勝手に消さない。**（2026-08-15、伊波さん「勝手に消すんじゃなく」
// 「プリクラ帳がいっぱいですの案内入れてね」）
//
// 50枚たまっていたら、**保存せずに断る**。add() が 'full' を返すので、
// 呼ぶ側で「いっぱいです」と知らせ、本人にいらないものを選んで消して
// もらう。古いものを自動で押し出す作りにはしないこと。
// 撮ったものを本人の知らないところで消すのが、いちばんまずい。

const DB_NAME = 'tinycube.album';
const DB_VER = 1;
const STORE = 'shots';

/** 何枚まで持つか。超えた分は古いものから消える */
export const ALBUM_LIMIT = 50;

export type AlbumItem = {
  /** 撮った時刻。そのまま並び順と id を兼ねる */
  id: number;
  /** 一覧に出す小さい絵（data URL） */
  thumb: string;
  /** 大きく見るときの絵（data URL）。取り出すときだけ読む */
  full?: string;
  /** 何枚組か。3枚シートなら 3 */
  count: number;
  /** 横長の写真か（2026-08-19）。
   *  ⚠️ **しまうときに決めて持っておくこと。** 一覧で絵を読んでから
   *     naturalWidth で判定していたが、**キャッシュだと onLoad が来ない**ので
   *     2回目以降に印が付かず、横のまま並んでいた
   *     （伊波さん「プリクラ帳はこわれたまま」「直ってない」）。
   *     ここに持てば、読み込みのタイミングに左右されない */
  wide?: boolean;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('プリクラ帳を開けませんでした'));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('書き込めませんでした'));
    tx.onabort = () => reject(tx.error ?? new Error('中断されました'));
  });
}

/**
 * 画像を小さくする。一覧に出す見本を作るため。
 * 幅 200px まで縮め、質を落とす（32KB ほどになる）
 */
export async function makeThumb(dataUrl: string, maxW = 200): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('絵を読めませんでした'));
    i.src = dataUrl;
  });
  const scale = Math.min(1, maxW / img.width);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * scale));
  c.height = Math.max(1, Math.round(img.height * scale));
  const g = c.getContext('2d');
  if (!g) return dataUrl;
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.6);
}

export type AddResult =
  | { ok: true; count: number }        // しまえた。count は今の枚数
  | { ok: false; why: 'full' }         // いっぱいなので断った
  | { ok: false; why: 'error'; message: string };

/**
 * 1枚しまう。
 *
 * ⚠️ **50枚たまっていたら、しまわずに 'full' を返す。**
 *    古いものを勝手に消して場所を空けたりはしない。
 */
export async function add(full: string, count: number): Promise<AddResult> {
  try {
    const now = await countItems();
    if (now >= ALBUM_LIMIT) return { ok: false, why: 'full' };

    const thumb = await makeThumb(full);
    // しまうときに向きを決める。あとで測り直さない。
    // ⚠️ **onload ではなく decode() を使うこと**（2026-08-19）。
    //    onload は**すでに読めている絵では発火しないことがある**。
    //    そこで詰まると、この await が返らずに保存そのものが止まる
    let wide = false;
    try {
      const i = new Image();
      i.src = thumb;
      await i.decode();
      wide = i.naturalWidth > i.naturalHeight;
    } catch { /* 読めなければ回さない */ }
    const db = await open();
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      // id は撮った時刻。同じミリ秒に2枚入ると上書きになるので、
      // すでにあれば1ミリ秒ずらす
      let id = Date.now();
      const exists = await new Promise<boolean>(res => {
        const q = st.get(id);
        q.onsuccess = () => res(!!q.result);
        q.onerror = () => res(false);
      });
      if (exists) id += 1;
      st.put({ id, thumb, full, count, wide } as AlbumItem);
      await done(tx);
      return { ok: true, count: now + 1 };
    } finally {
      db.close();
    }
  } catch (e: any) {
    return { ok: false, why: 'error', message: String(e?.message ?? e) };
  }
}

/**
 * 一覧を出す。**新しいものが先頭**。
 * 見本だけを返す（本体は重いので読まない）
 */
export async function list(): Promise<AlbumItem[]> {
  const db = await open();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const st = tx.objectStore(STORE);
    const all = await new Promise<AlbumItem[]>(res => {
      const q = st.getAll();
      q.onsuccess = () => res((q.result as AlbumItem[]) ?? []);
      q.onerror = () => res([]);
    });
    return all
      .sort((a, b) => b.id - a.id)
      // ⚠️ **wide を落とさないこと。**
      //    以前は { id, thumb, count } しか返しておらず、せっかく add() が
      //    測って持たせた wide が毎回捨てられていた。すると App.tsx の
      //    openAlbum が「全部まだ測っていない」と判断して、写真の枚数だけ
      //    decode() をかける。iOS でそれが1枚でも返ってこないと Promise.all が
      //    終わらず、**プリクラ帳が永久に開かなくなる**
      //    （2026-08-21、伊波さんの実機で発覚。「プリ帳開けない、
      //      １番最初にテストは開けてた」＝空のときだけ開けていた）。
      .map(({ id, thumb, count, wide }) => ({ id, thumb, count, wide }));
  } finally {
    db.close();
  }
}

/** 1枚を、大きい絵つきで取り出す */
export async function get(id: number): Promise<AlbumItem | null> {
  const db = await open();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const st = tx.objectStore(STORE);
    return await new Promise<AlbumItem | null>(res => {
      const q = st.get(id);
      q.onsuccess = () => res((q.result as AlbumItem) ?? null);
      q.onerror = () => res(null);
    });
  } finally {
    db.close();
  }
}

/**
 * 選んだものを捨てる。1枚でも何枚でも。
 *
 * 伊波さん「自分で選んで消せるように」（2026-08-15）。
 * いっぱいのときに古い順で押し出すのではなく、**本人が選んで消す**
 */
export async function remove(...ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await open();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    for (const id of ids) st.delete(id);
    await done(tx);
  } finally {
    db.close();
  }
}

/** 何枚入っているか */
export async function countItems(): Promise<number> {
  const db = await open();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const st = tx.objectStore(STORE);
    return await new Promise<number>(res => {
      const q = st.count();
      q.onsuccess = () => res(q.result ?? 0);
      q.onerror = () => res(0);
    });
  } finally {
    db.close();
  }
}

/** 古い写真に「横長かどうか」を書き足す（2026-08-19）。
 *  wide を持たせる前にしまったものを、一覧を開いたときに埋めるため。
 *  ⚠️ 失敗しても画面は動く（その回だけ測り直しになるだけ）*/
export async function fillWide(rows: { id: number; wide: boolean }[]): Promise<void> {
  if (!rows.length) return;
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      for (const r of rows) {
        const get = st.get(r.id);
        get.onsuccess = () => {
          const v = get.result as AlbumItem | undefined;
          if (v) { v.wide = r.wide; st.put(v); }
        };
      }
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* 埋められなくても、次に開いたときにまた測るだけ */ }
}
