export type Lang = 'ja' | 'en';

// 自分で選んだ言語だけを保存する。
//
// ⚠️ 以前は「システム言語からの自動判定」の結果まで保存していた。
//    一度でも英語と判定されると保存されて固定され、しかも画面に
//    切り替える場所が無いので、日本語に戻せなくなっていた
//    （2026-08-13、伊波さん「これ、私見てるの英語版かなぁ？」）。
//    自動判定は毎回その場で行い、保存はしない。
const saved = localStorage.getItem('tinycube.lang') as Lang | null;
let currentLang: Lang = saved
  ?? (navigator.language && !navigator.language.startsWith('ja') ? 'en' : 'ja');

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
  unlock_title: string;
  unlock_lead: string;
  unlock_p1: string;
  unlock_p2: string;
  unlock_buy: string;
  unlock_have: string;
  unlock_place: string;
  unlock_go: string;
  unlock_ok: string;
  unlock_ng: string;
  unlock_done: string;
  unlock_done_note: string;
  unlock_relock: string;
  frame_locked: string;
  locked_hint: string;
  btn_photo: string;
  guide_photo: string;
  btn_pause: string;
  btn_resume: string;
  paused_badge: string;
  pause_na: string;

  // Effects (Burst)
  eff_flash: string;
  eff_mirrorball: string;

  // Effects (Sound)
  turn_hint: string;
  promo_open: string;
  setting_teloppos: string;
  telop_center: string;
  telop_random: string;
  setting_telopcolor: string;
  telop_white: string;
  telop_black: string;
  setting_sounds: string;
  setting_camera: string;
  setting_srcaudio: string;
  srcaudio_mic: string;
  srcaudio_mix: string;
  srcaudio_note: string;
  srcaudio_off: string;
  cam_front: string;
  cam_back: string;
  cam_off: string;
  cam_fail: string;
  eff_emotional: string;
  eff_clap: string;
  eff_drum: string;
  eff_blip: string;

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
  // 絵はボタン側（.ctrl-icon）で出すので、言葉だけ持つ。
  // ここに ● や ■ を付けると、ボタンの上で二重に出る（2026-08-13）
  btn_record: '録画スタート',
  btn_stop: '停止',
  unlock_title: 'ぜんぶ使う（¥300・買い切り）',
  unlock_lead: '一度きりの買い物で、次の2つが両方とも解けます。',
  unlock_p1: '🖼 フレームが53枚ふえる（推し色・顔ハメなど）',
  unlock_p2: '💧 動画と写真の右下に入る「tinyCUBE」の文字が消える',
  unlock_buy: 'BOOTH で買う（¥300）',
  unlock_have: 'キーを持っている',
  unlock_place: 'TC-XXXX-XXXX-XXXX',
  unlock_go: '解除する',
  unlock_ok: '解除しました。ありがとうございます！',
  unlock_ng: 'このキーは使えませんでした。打ち間違いがないか見てください。',
  unlock_done: '✓ 解除ずみ',
  unlock_done_note: 'キーは大切に取っておいてください。機種を変えたときや、ブラウザの記録を消したときに、もう一度必要になります。',
  unlock_relock: 'この端末の解除をやめる',
  frame_locked: '🔒',
  locked_hint: 'このフレームは「ぜんぶ使う」に入っています。',
  btn_photo: '写真を撮る',
  guide_photo: '📷 を押すと、そのときの画面がそのまま1枚の写真になります。枠もエフェクトも乗ったまま保存されます。',
  btn_pause: '一時停止',
  btn_resume: '録画を続ける',
  paused_badge: '⏸ 一時停止中（ここは動画に入りません）',
  pause_na: 'この端末では一時停止が使えません',
  
  eff_flash: '💥 フラッシュ',
  eff_mirrorball: '🪩 ミラーボール',
  turn_hint: '📱↻ 16:9 の場合は横向きでご利用ください',
  promo_open: 'CMCUBE を見る →',
  setting_teloppos: '文字の出る場所',
  telop_center: '◎ まん中',
  telop_random: '🎲 ばらける',
  setting_telopcolor: '文字の色',
  telop_white: '⬜ 白文字',
  telop_black: '⬛ 黒文字',
  setting_sounds: '効果音（3つ）',
  setting_camera: 'カメラ',
  setting_srcaudio: '動画の音',
  srcaudio_mic: '📱 スピーカー',
  srcaudio_mix: '🎧 イヤホン',
  srcaudio_note: 'イヤホンを使うなら「イヤホン」。そのままスピーカーで撮るなら「スピーカー」を選んでください。逆にすると、動画の音が二重に入るか、まったく入らなくなります。',
  srcaudio_off: '🔇 消す',
  cam_front: '内カメ',
  cam_back: '外カメ',
  cam_off: '⏹ 使わない',
  cam_fail: 'カメラを開けませんでした。許可の設定を確かめてください。',
  eff_emotional: '🌸 エモい',
  eff_clap: '👏 拍手',
  eff_drum: '🥁 ドラム',
  eff_blip: '🔹 電子音',

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
  setting_shape_land: '横',
  setting_shape_port: '縦',
  setting_telop: 'テロップの言葉',
  setting_telop_note: '5つとも、あなたの言葉です。書き換えると、そのまま動画に出ます。',
  setting_frame: '枠',
  frame_none: 'フレームなし',
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
  btn_record: 'Record',
  btn_stop: 'Stop',
  unlock_title: 'Unlock everything (¥300, one-time)',
  unlock_lead: 'One purchase unlocks both of these.',
  unlock_p1: '🖼 53 more frames (fan colours, face cut-outs and more)',
  unlock_p2: '💧 The "tinyCUBE" mark on your videos and photos disappears',
  unlock_buy: 'Buy on Ko-fi (¥300)',
  unlock_have: 'I have a key',
  unlock_place: 'TC-XXXX-XXXX-XXXX',
  unlock_go: 'Unlock',
  unlock_ok: 'Unlocked. Thank you!',
  unlock_ng: 'That key did not work. Please check for typos.',
  unlock_done: '✓ Unlocked',
  unlock_done_note: 'Keep your key somewhere safe. You will need it again if you change phones or clear your browser data.',
  unlock_relock: 'Remove the unlock from this device',
  frame_locked: '🔒',
  locked_hint: 'This frame is part of "Unlock everything".',
  btn_photo: 'Take a photo',
  guide_photo: 'Press 📷 to save the screen as a still image. Frames and effects are baked in, just as you see them.',
  btn_pause: 'Pause',
  btn_resume: 'Resume',
  paused_badge: '⏸ Paused — nothing here reaches the file',
  pause_na: 'Pause is not available on this device',
  
  eff_flash: '💥 Flash',
  eff_mirrorball: '🪩 Mirror ball',
  turn_hint: '📱↻ For 16:9, please turn your phone sideways',
  promo_open: 'See CMCUBE →',
  setting_teloppos: 'Caption position',
  telop_center: '◎ Centre',
  telop_random: '🎲 Scattered',
  setting_telopcolor: 'Caption colour',
  telop_white: '⬜ White',
  telop_black: '⬛ Black',
  setting_sounds: 'Sounds (3)',
  setting_camera: 'Camera',
  setting_srcaudio: 'Video sound',
  srcaudio_mic: '📱 Speaker',
  srcaudio_mix: '🎧 Earphones',
  srcaudio_note: 'Pick Earphones if you are wearing them, Speaker if you are not. The wrong one makes the video sound double up, or vanish entirely.',
  srcaudio_off: '🔇 Mute',
  cam_front: 'Selfie',
  cam_back: 'Back',
  cam_off: '⏹ Off',
  cam_fail: 'Could not open the camera. Check the permission settings.',
  eff_emotional: '🌸 Dreamy',
  eff_clap: '👏 Clap',
  eff_drum: '🥁 Drum',
  eff_blip: '🔹 Electronic',

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
  setting_shape_land: 'Landscape',
  setting_shape_port: 'Portrait',
  setting_telop: 'Caption Texts',
  setting_telop_note: 'All five are yours. Change them to display custom text.',
  setting_frame: 'Frames',
  frame_none: 'No frame',
  frame_crop: 'Edges cropped',

  alert_load_first: 'Please load a video first!',
  alert_rec_fail: 'Recording failed: ',
  alert_mic_fail: 'Failed to start recording. Check your microphone permissions.\nError: ',
};

const dict = { ja: dictJa, en: dictEn };

export const t = (key: keyof I18nDict): string => {
  return dict[currentLang][key];
};
