// Google Play のアプリ内課金。
//
// ■ なぜ要るか
//
// BOOTH / Ko-fi での販売はやめて、ストアの課金に移す（2026-08-14、伊波さん
// 「BOOTH経由は捨てる」）。Google Play は、アプリの中で売るデジタルの品物に
// **Play の課金を通すことを求めている**。外の売り場へ誘導すると審査で弾かれる。
//
// ■ 何を売るか
//
// ¥300 の買い切りひとつ。フレーム53枚と透かし消しの両方が一度に解ける
// （2026-08-11、伊波さん「両方」）。分けると買い物が2回になって、そこでこぼれる。
//
// ■ Web版はどうなるか
//
// ⚠️ ウェブ版は 2026-08-31 にやめた（伊波さん「WEB版やめる」）。
// 買う道はストアの課金だけになり、キー入力は消してある。以前は
// 解除する（BOOTH で買った人が使えなくならないように）。
// この差は unlock.ts が吸収する。
//
// ■ 買い直しについて
//
// 機種を変えても買い直しにならないよう、起動のたびに Play へ
// 「この人は前に買っていますか」を聞く（restorePurchases）。
// Play は買い切りの持ち主を覚えているので、ここで戻せる。

/** Play Console に登録する商品の ID。Console 側と一字一句そろえること */
export const PRODUCT_ID = 'tinycube_unlock_all';

/** いま Capacitor の入れ物（アプリ）の中で動いているか。
    Web ブラウザで開いているときは false */
export function isNativeApp(): boolean {
  try {
    const cap = (window as any).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/** iPhone / iPad のアプリとして動いているか。売り場の選び分けに使う */
export function isApple(): boolean {
  try {
    return (window as any).Capacitor?.getPlatform?.() === 'ios';
  } catch {
    return false;
  }
}

type Store = any;

let store: Store | null = null;
let ready = false;
/** 買ってあることが分かったときに呼ぶ。unlock.ts が渡してくる */
let onOwned: (() => void) | null = null;

function getStore(): Store | null {
  if (store) return store;
  // cordova-plugin-purchase は window.CdvPurchase に生える
  const cdv = (window as any).CdvPurchase;
  if (!cdv?.store) return null;
  store = cdv.store;
  return store;
}

/**
 * 課金の用意をする。アプリの起動時に一度だけ呼ぶ。
 * Web で開いているときは何もしない（キー入力の道が残る）。
 *
 * @param owned 買ってあると分かったときに呼ばれる
 */
export async function initBilling(owned: () => void): Promise<void> {
  onOwned = owned;
  if (!isNativeApp()) return;

  const s = getStore();
  if (!s) return;                       // プラグインが入っていない環境では何もしない

  const cdv = (window as any).CdvPurchase;
  try {
    // 売り場は端末で決まる。iPhone なら App Store、Android なら Play。
    // **商品 ID は両方とも同じ**（tinycube_unlock_all）でよい
    // （2026-08-14、ヒマワリさんの調べ）
    const platform = isApple() ? cdv.Platform.APPLE_APPSTORE : cdv.Platform.GOOGLE_PLAY;

    s.register([{
      id: PRODUCT_ID,
      type: cdv.ProductType.NON_CONSUMABLE,   // 一度買えばずっと持つもの
      platform,
    }]);

    // 買った／前に買っていたことが分かったとき。
    //
    // ⚠️⚠️ **必ず `store.owned(商品ID)` で確かめること。**（2026-08-31）
    //
    //   前はこう書いていた：
    //       .verified((receipt) => { receipt.finish(); onOwned(); })
    //
    //   `verified` / `receiptUpdated` は **アプリのレシートが読めたときに飛ぶ**。
    //   レシートは買っていなくても存在するので、中身を見ずに onOwned() を呼ぶと
    //   **起動しただけで全員が「買った人」になる。**
    //
    //   実際にそうなっていた（伊波さん「かった事ない」のに解除済み、
    //   入れ直しても同じ）。結果として：
    //     ・有料の53枚が全員に無料で配られていた
    //     ・買う入口は `{!unlocked && ...}` で消えるので、**購入ボタンが誰にも
    //       出なかった**。2026-08-30 の App Store 却下（Guideline 2.1(b)
    //       「アプリ内課金が見つけられない」）は、これが原因の可能性が高い
    //
    // ⚠️ **`verified` だけに頼らないこと。** あれは受け取りの検証役
    //    （store.validator）を置いているときのイベント。うちは置いていないので、
    //    検証役なしでも飛ぶ `receiptUpdated` でも見る（プラグインの説明書どおり）。
    const 持っているか確かめる = () => {
      try { if (s.owned(PRODUCT_ID)) onOwned?.(); }
      catch { /* 確かめられないときは解除しない（安全側に倒す） */ }
    };
    s.when()
      .approved((tx: any) => tx.verify())
      .verified((receipt: any) => {
        try { receipt.finish(); } catch { /* 閉じられなくても持ち主かは下で見る */ }
        持っているか確かめる();
      })
      .receiptUpdated(() => 持っているか確かめる());

    await s.initialize([platform]);
    ready = true;

    // ⚠️ **iPhone では、ここで restorePurchases() を呼ばないこと。**
    //
    // 以前は機種変えに備えて起動のたびに呼んでいた。Android では
    // 利用者が常に Google にサインイン済みなので何も起きない。
    // **ところが iOS では、この1行が「Apple Account にサインイン」の
    // ダイアログを毎回強制的に出す**（2026-08-21、伊波さんが実機で発見。
    // 「これ毎回サインインなの？」）。アプリを開くたびに出るので、
    // 壊れているようにしか見えない。
    //
    // Apple の作法としても、**購入の復元は利用者がボタンを押したときだけ**
    // 実行するもの。勝手に走らせると審査でも指摘される。
    // 「買ったのに使えないとき」のボタンは既に画面にあるので、それで足りる。
    //
    // iOS は initialize() の時点でアプリのレシートを読むため、買ってある人は
    // 明示的に復元しなくても approved/verified が飛んでくる。
    if (!isApple()) {
      await s.restorePurchases();
    }
  } catch {
    // 課金が使えなくてもアプリは動く（無料のまま使える）
  }
}

/** 買う。成功したかは onOwned 経由で伝わる（ここでは待たない）。
    @returns 買い物の画面を出せたら true */
export async function buy(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const s = getStore();
  if (!s || !ready) return false;
  try {
    const product = s.get(PRODUCT_ID);
    const offer = product?.getOffer?.();
    if (!offer) return false;
    await offer.order();
    return true;
  } catch {
    return false;
  }
}

/** 「買ったのに解けていない」ときのために、手で取り戻せるようにする。
    Play は買い切りを覚えているので、ここから戻せる */
export async function restore(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const s = getStore();
  if (!s || !ready) return false;
  try {
    await s.restorePurchases();
    return true;
  } catch {
    return false;
  }
}
