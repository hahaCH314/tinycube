export type Lang = 'ja' | 'en';

let currentLang: Lang = (localStorage.getItem('tinycube.lang') as Lang) || 'ja';

// 初回起動時の自動判定 (システム言語が日本語以外なら英語)
if (!localStorage.getItem('tinycube.lang')) {
  if (navigator.language && !navigator.language.startsWith('ja')) {
    currentLang = 'en';
    localStorage.setItem('tinycube.lang', 'en');
  } else {
    currentLang = 'ja';
    localStorage.setItem('tinycube.lang', 'ja');
  }
}

export const setLang = (lang: Lang) => {
  currentLang = lang;
  localStorage.setItem('tinycube.lang', lang);
};

export const getLang = () => currentLang;

type I18nDict = {
  // Header
  btn_guide: string;
  btn_settings: string;
  
  // Preview
  preview_empty: string;
  
  // Control Deck
  effect_wip: string;
  btn_stop: string;
  btn_start: string;
  
  // Effects
  eff_flash: string;
  eff_glitch: string;
  eff_bam: string;
  eff_ding: string;
  eff_kusa: string;
  eff_god: string;
  
  // Alerts
  alert_no_video: string;
  alert_rec_fail: string;
  alert_mic_fail: string;
  
  // Guide (使い方)
  guide_title: string;
  guide_1_t: string; guide_1_b: string;
  guide_2_t: string; guide_2_b: string;
  guide_3_t: string; guide_3_b: string;
  guide_warn_title: string;
  guide_warn_1: string; guide_warn_1b: string;
  guide_warn_2: string; guide_warn_2b: string;
  guide_warn_3: string; guide_warn_3b: string;
  guide_warn_4: string;
  guide_note_1: string;
  guide_note_2: string;
  guide_ok: string;
  
  // Settings (設定)
  set_title: string;
  set_close: string;
  set_video: string;
  set_video_repick: string;
  set_video_pick: string;
  set_shape: string;
  set_shape_note: string;
  set_shape_l: string;
  set_shape_p: string;
  set_frame: string;
  set_frame_none: string;
  set_frame_crop: string;
  
  // UI
  ui_lang: string;
};

const dictJa: I18nDict = {
  btn_guide: '? 使い方',
  btn_settings: '⚙ 設定',
  preview_empty: 'タップしてゲーム動画を読み込む',
  effect_wip: 'エフェクトは準備中です',
  btn_stop: '■ 停止',
  btn_start: '● 録画スタート',
  
  eff_flash: '💥 フラッシュ', eff_glitch: '⚡ グリッチ',
  eff_bam: '🥁 どんっ！', eff_ding: '✨ きらっ',
  eff_kusa: '💬 草', eff_god: '💬 神',
  
  alert_no_video: '先に動画を読み込んでください！',
  alert_rec_fail: '録画に失敗しました: ',
  alert_mic_fail: '録画の開始に失敗しました。マイクの許可設定を確認してください。\nエラー: ',
  
  guide_title: 'tinyCUBE の使い方',
  guide_1_t: '動画を読み込む',
  guide_1_b: 'すでに撮ってある動画に、声とエフェクトを乗せる道具です。',
  guide_2_t: '録画スタートを押して喋る',
  guide_2_b: '動画が流れます。マイクの許可を聞かれたら「許可」を押してください。',
  guide_3_t: 'もう一度押すと止まります',
  guide_3_b: 'そのまま保存できます。iPhone は共有シートから「ビデオを保存」を選んでください。',
  guide_warn_title: '⚠ 撮る前に、必ず確認してください',
  guide_warn_1: '他人の個人情報を映さない。',
  guide_warn_1b: '読み込んだ動画に映ったチャット、名前、住所、通知はすべて残ります。一度公開した動画は取り消せません。',
  guide_warn_2: '他人の作品を無断で使わない。',
  guide_warn_2b: 'ゲーム映像、動画、音楽、画像には権利者がいます。投稿や収益化の可否は、各権利者の規約に従ってください。',
  guide_warn_3: '人を映す・録音するときは、相手の同意を得てください。',
  guide_warn_3b: 'マイクの内容は実際に記録されます。',
  guide_warn_4: '人を貶める目的、誤解させる目的で使わないでください。',
  guide_note_1: '枠の絵は本来 CMCUBE（PC版）のもので、16:9 で描かれています。縦（9:16）で使うと左右が欠けます。それでも使えるようにしてあるので、欠けるものには一覧で印を出しています。',
  guide_note_2: 'tinyCUBE がロイヤリティフリーを保証するのは、あなた自身が作った部分だけです。読み込んだ素材の権利処理は利用者の責任になります。',
  guide_ok: '確認しました。はじめる',
  
  set_title: '⚙ 設定',
  set_close: '閉じる',
  set_video: '動画',
  set_video_repick: '動画を選び直す',
  set_video_pick: '動画を読み込む',
  set_shape: '書き出しの形',
  set_shape_note: '読み込んだ動画は横長です。スマホを横向きにすると大きく見えます。',
  set_shape_l: '横（16:9）',
  set_shape_p: '縦（9:16）',
  set_frame: '枠',
  set_frame_none: 'なし',
  set_frame_crop: '端が欠けます',
  
  ui_lang: 'Language',
};

const dictEn: I18nDict = {
  btn_guide: '? Guide',
  btn_settings: '⚙ Settings',
  preview_empty: 'Tap to load a game video',
  effect_wip: 'Effects are coming soon',
  btn_stop: '■ Stop',
  btn_start: '● Start Recording',
  
  eff_flash: '💥 Flash', eff_glitch: '⚡ Glitch',
  eff_bam: '🥁 Bam!', eff_ding: '✨ Ding!',
  eff_kusa: '💬 LOL', eff_god: '💬 God',
  
  alert_no_video: 'Please load a video first!',
  alert_rec_fail: 'Failed to record: ',
  alert_mic_fail: 'Failed to start recording. Please check your microphone permissions.\nError: ',
  
  guide_title: 'How to use tinyCUBE',
  guide_1_t: 'Load a video',
  guide_1_b: 'Add your voice and effects to an existing gameplay video.',
  guide_2_t: 'Press Start and speak',
  guide_2_b: 'The video will play. If asked for microphone permission, please allow it.',
  guide_3_t: 'Press again to stop',
  guide_3_b: 'You can save it right away. On iPhone, use the Share sheet and select "Save Video".',
  guide_warn_title: '⚠ Please read before recording',
  guide_warn_1: 'Do not show others\' personal info.',
  guide_warn_1b: 'Chats, names, addresses, and notifications in the video will be recorded. Once published, you cannot take it back.',
  guide_warn_2: 'Do not use others\' work without permission.',
  guide_warn_2b: 'Game footage, videos, music, and images have copyright owners. Follow their rules for posting and monetization.',
  guide_warn_3: 'Get consent before recording others.',
  guide_warn_3b: 'Microphone audio is actively recorded.',
  guide_warn_4: 'Do not use this to demean or mislead people.',
  guide_note_1: 'Frames were originally made for CMCUBE (PC) in 16:9. Using them in vertical (9:16) will crop the sides. We still let you use them, but cropped frames have a warning mark.',
  guide_note_2: 'tinyCUBE only guarantees that the effects we provide are royalty-free. Clearing rights for the video you load is your responsibility.',
  guide_ok: 'Understood. Start',
  
  set_title: '⚙ Settings',
  set_close: 'Close',
  set_video: 'Video',
  set_video_repick: 'Pick another video',
  set_video_pick: 'Load a video',
  set_shape: 'Export Shape',
  set_shape_note: 'The loaded video is wide. It will look better if you turn your phone sideways.',
  set_shape_l: 'Landscape (16:9)',
  set_shape_p: 'Vertical (9:16)',
  set_frame: 'Frame',
  set_frame_none: 'None',
  set_frame_crop: 'Edges cropped',
  
  ui_lang: 'Language',
};

const dict = { ja: dictJa, en: dictEn };

export const t = (key: keyof I18nDict): string => {
  return dict[currentLang][key];
};
