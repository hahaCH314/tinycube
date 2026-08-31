// プリシートのアイコン。
//
// ■ なぜ絵文字をやめたか
//
// ✂️（はさみ）を使っていたが、**「切る」に見えて機能と合わない**
// （2026-08-31、伊波さん「ハサミは変えてほしいとヒマワリに伝えてあって、
//  何なんこれ？」）。プリシートは**写真を並べて1枚にまとめる**機能で、
// 何かを切り落とすものではない。
//
// 絵文字は端末ごとに絵が変わる問題もある（CamIcon.tsx の経緯と同じ）。
//
// ■ 何を描いているか
//
// **大きい1枚＋小さい2枚が並んだ紙**。sheet.ts の割り付けそのままの形で、
// 「写真を組み合わせて1枚にする」が絵で分かる。

type Props = {
  /** 線と面の色。カードの地に載るので、既定は白 */
  color?: string;
};

/** プリシート（写真を組み合わせて1枚のシールシートにする） */
export function SheetIcon({ color = '#ffffff' }: Props) {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {/* 紙。少し傾けて、めくれる紙らしく */}
      <g transform="rotate(-4 32 32)">
        <rect x="10" y="6" width="44" height="52" rx="3"
          fill={color} stroke="#111111" strokeWidth="3" />
        {/* 大きい1枚（左） */}
        <rect x="15" y="11" width="21" height="30" rx="1.5"
          fill="#111111" opacity="0.82" />
        {/* 小さい2枚（右に積む） */}
        <rect x="39" y="11" width="10" height="14" rx="1.5"
          fill="#111111" opacity="0.82" />
        <rect x="39" y="27" width="10" height="14" rx="1.5"
          fill="#111111" opacity="0.82" />
        {/* 下の帯（名前を刷るところ。sheet.ts の PAD_BOTTOM にあたる） */}
        <rect x="15" y="44" width="34" height="9" rx="1.5"
          fill="#111111" opacity="0.28" />
      </g>
    </svg>
  );
}
