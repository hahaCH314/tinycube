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
  guide_btn: string;
  settings_btn: string;

  // Main Stage
  upload_hint: string;

  // Control Deck
  btn_preview: string;
  btn_preview_stop: string;
  btn_record: string;
  btn_stop: string;

  // Effects (Burst)
  eff_flash: string;
  eff_glitch: string;

  // Effects (Sound)
  eff_bam: string;
  eff_ding: string;
  eff_pon: string;
  eff_buzz: string;
  turn_hint: string;
  promo_open: string;
  setting_camera: string;
  setting_srcaudio: string;
  srcaudio_on: string;
  srcaudio_off: string;
  cam_front: string;
  cam_back: string;
  cam_off: string;
  cam_fail: string;
  eff_clap: string;
  eff_drum: string;
  eff_blip: string;
  eff_dread: string;
  eff_slash: string;
  eff_fanfare: string;

  // Guide Sheet
  guide_title: string;
  guide_step1_title: string;
  guide_step1_desc: string;
  guide_step2_title: string;
  guide_step2_desc: string;
  guide_step3_title: string;
  guide_step3_desc: string;
  guide_warn_title: string;
  guide_warn1_title: string;
  guide_warn1_desc: string;
  guide_warn2_title: string;
  guide_warn2_desc: string;
  guide_warn3_title: string;
  guide_warn3_desc: string;
  guide_warn4_title: string;
  guide_note1: string;
  guide_note2: string;
  guide_promo_badge: string;
  guide_promo_lead: string;
  guide_promo_p1: string;
  guide_promo_p2: string;
  guide_promo_p3: string;
  guide_promo_p4: string;
  guide_promo_foot: string;
  guide_ok: string;

  // Settings Sheet
  setting_title: string;
  setting_close: string;
  setting_video: string;
  setting_video_change: string;
  setting_video_load: string;
  setting_shape: string;
  setting_shape_wide_note: string;
  setting_shape_land: string;
  setting_shape_port: string;
  setting_telop: string;
  setting_telop_note: string;
  setting_frame: string;
  frame_none: string;
  frame_crop: string;

  // Alerts
  alert_load_first: string;
  alert_rec_fail: string;
  alert_mic_fail: string;
};

const dictJa: I18nDict = {
  guide_btn: '? 使い方',
  settings_btn: '⚙ 設定',
  
  upload_hint: 'タップして動画を読み込み',
  
  btn_preview: '▶ 試してみる（録画無し）',
  btn_preview_stop: '⏸ とめる',
  btn_record: '● 録画スタート',
  btn_stop: '■ 停止',
  
  eff_flash: '💥 フラッシュ',
  eff_glitch: '⚡ グリッチ',
  eff_bam: '🥁 どんっ',
  eff_ding: '✨ きらっ',
  eff_pon: '🫧 ぽん',
  eff_buzz: '📢 ぶー',
  turn_hint: '📱↻ 16:9（横動画）は、横向きでの操作がおすすめです',
  promo_open: 'CMCUBE を見る →',
  setting_camera: 'カメラ',
  setting_srcaudio: '動画の音',
  srcaudio_on: '🔊 入れる',
  srcaudio_off: '🔇 消す',
  cam_front: '📷 自分',
  cam_back: '🌄 外',
  cam_off: '⏹ 使わない',
  cam_fail: 'カメラを開けませんでした。許可の設定を確かめてください。',
  eff_clap: '👏 拍手',
  eff_drum: '🥁 ドラム',
  eff_blip: '🔹 ぴこ',
  eff_dread: '🌑 ずーん',
  eff_slash: '⚔️ しゃきん',
  eff_fanfare: '🎉 ジャーン',

  guide_title: 'tinyCUBE の使い方',
  guide_step1_title: '動画を読み込む',
  guide_step1_desc: 'すでに撮ってある動画に、声とエフェクトを乗せる道具です。',
  guide_step2_title: '録画スタートを押して喋る',
  guide_step2_desc: '動画が流れます。マイクの許可を聞かれたら「許可」を押してください。',
  guide_step3_title: 'もう一度押すと止まります',
  guide_step3_desc: 'そのまま保存できます。iPhone は共有シートから「ビデオを保存」を選んでください。',
  guide_warn_title: '⚠ 撮る前に、必ず確認してください',
  guide_warn1_title: '他人の個人情報を映さない。',
  guide_warn1_desc: '読み込んだ動画に映ったチャット、名前、住所、通知はすべて残ります。一度公開した動画は取り消せません。',
  guide_warn2_title: '他人の作品を無断で使わない。',
  guide_warn2_desc: 'ゲーム映像、動画、音楽、画像には権利者がいます。投稿や収益化の可否は、各権利者の規約に従ってください。',
  guide_warn3_title: '人を映す・録音するときは、相手の同意を得てください。',
  guide_warn3_desc: 'マイクの内容は実際に記録されます。',
  guide_warn4_title: '人を貶める目的、誤解させる目的で使わないでください。',
  guide_note1: '枠の絵は本来 CMCUBE（PC版）のもので、16:9 で描かれています。縦（9:16）で使うと左右が欠けます。それでも使えるようにしてあるので、欠けるものには一覧で印を出しています。',
  guide_note2: 'tinyCUBE がロイヤリティフリーを保証するのは、あなた自身が作った部分だけです。読み込んだ素材の権利処理は利用者の責任になります。',
  guide_promo_badge: 'PC版',
  guide_promo_lead: '撮りながら、演出する。',
  guide_promo_p1: 'ゲーム画面をそのまま録画。読み込む手間がありません',
  guide_promo_p2: '遊びながらキーひとつでテロップ・効果音・エフェクト',
  guide_promo_p3: '止めた瞬間に完成。あとから編集しません',
  guide_promo_p4: '枠は30種。この tinyCUBE の枠は、そこから来ています',
  guide_promo_foot: 'Windows / 買い切り。CUBICENGINEstudio で検索すると見つかります。',
  guide_ok: '確認しました。はじめる',

  setting_title: '⚙ 設定',
  setting_close: '閉じる',
  setting_video: '動画',
  setting_video_change: '動画を選び直す',
  setting_video_load: '動画を読み込む',
  setting_shape: '書き出しの形',
  setting_shape_wide_note: '読み込んだ動画は横長です。スマホを横向きにすると大きく見えます。',
  setting_shape_land: '横（16:9）',
  setting_shape_port: '縦（9:16）',
  setting_telop: 'テロップの言葉',
  setting_telop_note: '下のボタンに出る言葉です。書き換えると、そのまま動画に出ます。空にすると、そのボタンは出なくなります。',
  setting_frame: '枠',
  frame_none: 'なし',
  frame_crop: '端が欠けます',

  alert_load_first: '先に動画を読み込んでください！',
  alert_rec_fail: '録画に失敗しました: ',
  alert_mic_fail: '録画の開始に失敗しました。マイクの許可設定を確認してください。\nエラー: ',
};

const dictEn: I18nDict = {
  guide_btn: '? How to use',
  settings_btn: '⚙ Settings',
  
  upload_hint: 'Tap to load a video',
  
  btn_preview: '▶ Preview (No recording)',
  btn_preview_stop: '⏸ Stop',
  btn_record: '● Start Recording',
  btn_stop: '■ Stop',
  
  eff_flash: '💥 Flash',
  eff_glitch: '⚡ Glitch',
  eff_bam: '🥁 Bam',
  eff_ding: '✨ Ding',
  eff_pon: '🫧 Pon',
  eff_buzz: '📢 Buzz',
  turn_hint: '📱↻ For 16:9, holding the phone sideways works best',
  promo_open: 'See CMCUBE →',
  setting_camera: 'Camera',
  setting_srcaudio: 'Video sound',
  srcaudio_on: '🔊 Keep',
  srcaudio_off: '🔇 Mute',
  cam_front: '📷 Front',
  cam_back: '🌄 Back',
  cam_off: '⏹ Off',
  cam_fail: 'Could not open the camera. Check the permission settings.',
  eff_clap: '👏 Clap',
  eff_drum: '🥁 Drum',
  eff_blip: '🔹 Blip',
  eff_dread: '🌑 Dread',
  eff_slash: '⚔️ Slash',
  eff_fanfare: '🎉 Fanfare',

  guide_title: 'How to use tinyCUBE',
  guide_step1_title: 'Load a video',
  guide_step1_desc: 'Add voice and effects to a video you have already recorded.',
  guide_step2_title: 'Press Start Recording and talk',
  guide_step2_desc: 'The video will play. Allow microphone access if prompted.',
  guide_step3_title: 'Press again to stop',
  guide_step3_desc: 'Save directly. On iPhone, choose "Save Video" from the share sheet.',
  guide_warn_title: '⚠ Please confirm before recording',
  guide_warn1_title: 'Do not show others\' personal information.',
  guide_warn1_desc: 'Chats, names, addresses, and notifications in the video will be recorded. You cannot undo this once published.',
  guide_warn2_title: 'Do not use others\' work without permission.',
  guide_warn2_desc: 'Game footage, video, music, and images have rights holders. Follow their terms for posting and monetization.',
  guide_warn3_title: 'Get consent when recording others.',
  guide_warn3_desc: 'Your microphone audio is permanently recorded.',
  guide_warn4_title: 'Do not use this to demean or mislead people.',
  guide_note1: 'The frame art is originally from CMCUBE (PC version) and drawn in 16:9. If you use it in vertical (9:16), the sides will be cropped. A warning mark is shown for frames that will be cropped.',
  guide_note2: 'tinyCUBE only guarantees that the parts you made yourself are royalty-free. Clearing rights for imported materials is your responsibility.',
  guide_promo_badge: 'PC Version',
  guide_promo_lead: 'Direct, live-feel recording.',
  guide_promo_p1: 'Records your game screen directly. No loading required.',
  guide_promo_p2: 'Trigger captions, sounds, and effects with a single key while playing.',
  guide_promo_p3: 'Done the moment you stop. No post-editing.',
  guide_promo_p4: '30 frames available. The frames in tinyCUBE come from here.',
  guide_promo_foot: 'Windows / Pay once. Search for CUBICENGINEstudio to find it.',
  guide_ok: 'I understand. Start',

  setting_title: '⚙ Settings',
  setting_close: 'Close',
  setting_video: 'Video',
  setting_video_change: 'Change Video',
  setting_video_load: 'Load Video',
  setting_shape: 'Output Shape',
  setting_shape_wide_note: 'The loaded video is landscape. Turn your phone sideways for a better view.',
  setting_shape_land: 'Landscape (16:9)',
  setting_shape_port: 'Portrait (9:16)',
  setting_telop: 'Caption Texts',
  setting_telop_note: 'Words that appear on the buttons below. Change them to display custom text. Emptying a field hides the button.',
  setting_frame: 'Frames',
  frame_none: 'None',
  frame_crop: 'Edges cropped',

  alert_load_first: 'Please load a video first!',
  alert_rec_fail: 'Recording failed: ',
  alert_mic_fail: 'Failed to start recording. Check your microphone permissions.\nError: ',
};

const dict = { ja: dictJa, en: dictEn };

export const t = (key: keyof I18nDict): string => {
  return dict[currentLang][key];
};
