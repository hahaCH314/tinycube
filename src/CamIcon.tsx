// カメラ選びのアイコン。
//
// ■ なぜ絵文字をやめたか
//
// 🤳（自撮りする人）は端末ごとに絵がまったく違い、
// **何の絵か分からない**（Android では腕とスマホのような形になる）。
// 📷 も「普通のカメラ」で、「外側」という意味が伝わらない。
// 2つの絵が別の系統なので、並べても対に見えなかった
// （2026-08-15、伊波さん）。
//
// 昨日フレームの記号でも同じことが起きている
// （🎵 が端末まかせで暗い青緑になった → 記号に替えて色を指定した）。
//
// ■ 何を描いているか
//
// **何が写るか**を絵にする。伊波さんの「インカメ／アウトカメでは通じない。
// 何が写るかで書く」（2026-08-14、50代のユーザーからの声）と同じ考え方。
//
//   自分を写す → 顔
//   外カメ    → 風景（山と太陽）
//
// 色は選ばれているかどうかで変わる。SVG なので端末が違っても同じ絵になる。

type Props = { on?: boolean };

/** 自分を写す（画面がわのカメラ）。顔を描く */
export function FaceIcon({ on }: Props) {
  const c = on ? '#66e7ff' : 'rgba(255,255,255,0.75)';
  return (
    <svg width="40" height="40" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <circle cx="22" cy="17" r="8" stroke={c} strokeWidth="2.2" />
      <circle cx="19" cy="16" r="1.3" fill={c} />
      <circle cx="25" cy="16" r="1.3" fill={c} />
      <path d="M19 20.5c1 1.2 2 1.8 3 1.8s2-.6 3-1.8" stroke={c} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 39c1.5-6.5 7-10 14-10s12.5 3.5 14 10" stroke={c} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** 外カメ（うしろがわのカメラ）。風景を描く */
export function SceneIcon({ on }: Props) {
  const c = on ? '#66e7ff' : 'rgba(255,255,255,0.75)';
  // 太陽だけは選ばれていなくても色を残す。ここが目印になる
  const sun = on ? '#fbbf24' : 'rgba(251,191,36,0.75)';
  return (
    <svg width="40" height="40" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <rect x="5" y="9" width="34" height="26" rx="3" stroke={c} strokeWidth="2.2" />
      <circle cx="14" cy="17" r="3" fill={sun} />
      <path d="M6 31l9-10 6 7 5-5 12 12" stroke={c} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
