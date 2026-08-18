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
  /** アプリ（Android）で買うボタン。**外の売り場の名前を出してはいけない**。
      Play の課金を通すので「BOOTH で買う」とは書けない（2026-08-14）*/
  unlock_buy_app: string;
  /** 買ったのに解けていない人の取り戻し（機種変えのあとなど）*/
  unlock_restore: string;
  /** 買い物の画面が出せなかったとき */
  unlock_buy_ng: string;
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

  // 同意画面（一番最初に出る、マナーのお願い）
  manner_title: string;
  manner_text: string;
  manner_agree: string;

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
  // 2026-08-16、ヒマワリが App.tsx から93箇所を辞書へ移したぶん。
  // ⚠️ **型・dictJa・dictEn は3つで1組。** 辞書だけ足すと
  //    TS2345 が76個出てビルドが止まる（実際に起きた）
  eff_toutoi: string;
  eff_huh: string;
  eff_omg: string;
  eff_party: string;
  eff_choberigu: string;
  label_shape: string;
  label_color: string;
  msg_drop_here: string;
  msg_release_del: string;
  font_marumoji: string;
  font_note: string;
  my_frame: string;
  err_play_rejected: string;
  label_none: string;
  msg_saved: string;
  msg_save_hint: string;
  msg_saving_prep: string;
  err_save_failed: string;
  msg_storing: string;
  err_store_failed: string;
  msg_wait: string;
  warn_land_frame1: string;
  warn_land_frame2: string;
  msg_push_record: string;
  btn_back: string;
  msg_shooting: string;
  btn_shoot_3: string;
  tab_cam_zoom: string;
  btn_cam_in: string;
  btn_cam_out: string;
  lang_ja: string;
  btn_detail: string;
  about_app: string;
  about_planning: string;
  about_tech: string;
  about_natto: string;
  title_what_to_shoot: string;
  title_which_cam: string;
  title_stamp_text: string;
  btn_quit_app: string;
  btn_return: string;
  btn_quit: string;
  btn_take_photo: string;
  btn_take_video: string;
  tab_album: string;
  kind_photo_note: string;
  kind_video_note: string;
  msg_album_empty: string;
  desc_shoot_self: string;
  desc_cam_in: string;
  desc_shoot_world: string;
  btn_loop_no: string;
  btn_loop_yes: string;
  title_choose_frame: string;
  btn_decide_frame: string;
  btn_add: string;
  confirm_del_frame: string;
  title_edit_stamp: string;
  title_position: string;
  title_rec_btn_pos: string;
  btn_shoot_with_setting: string;
  btn_reshoot: string;
  msg_drop_to_trash: string;
  msg_drag_to_trash: string;
  tab_doodle: string;
  tab_deco: string;
  btn_make_stamp: string;
  msg_deco_hint: string;
  msg_making: string;
  btn_see_result: string;
  msg_come_again: string;
  msg_photo_taken: string;
  btn_redo: string;
  btn_save_video: string;
  msg_done: string;
  btn_back_to_edit: string;
  btn_save_this: string;
  title_where_to_save: string;
  opt_save_both: string;
  desc_save_both: string;
  opt_save_device: string;
  desc_save_device: string;
  opt_save_album: string;
  desc_save_album: string;
  opt_save_none: string;
  msg_collect_photos: string;
  btn_cancel: string;
  msg_choose_del: string;
  btn_choose_del: string;
  btn_close: string;
  btn_save_to_device: string;
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
  unlock_title: '追加フレームを使う（¥300・買い切り）',
  unlock_lead: '一度きりの買い物で、あとから足したフレームが全部使えます。',
  unlock_p1: '🖼 新しいフレームが使える（サイバー・ゴシック・和風など）',
  unlock_p2: '✨ これから足すぶんも、追加のお金なしで使えます',
  unlock_buy: 'BOOTH で買う（¥300）',
  unlock_buy_app: 'ぜんぶ使えるようにする（¥300）',
  unlock_restore: '買ったのに使えないとき',
  unlock_buy_ng: 'いま買えませんでした。少し時間をおいて、もう一度ためしてください。',
  unlock_have: 'キーを持っている',
  unlock_place: 'TC-XXXX-XXXX-XXXX',
  unlock_go: '解除する',
  unlock_ok: '解除しました。ありがとうございます！',
  unlock_ng: 'このキーは使えませんでした。打ち間違いがないか見てください。',
  // 2026-08-15、全部無料にした。ここは「買った人へのお知らせ」だった場所。
  // いまは開発者からのあいさつを置いている。
  // **文章は伊波さんが書いたもの。言い換え・要約をしないこと**
  unlock_done: '🎁 ぜんぶ使えます',
  unlock_done_note: `開発者から、みんなのフレームで遊ぶ姿、楽しく遊んでくれていたら嬉しいです。
いつかSNSでtinyCUBEで撮った写真たちに出会えることを、楽しみにしております。
スポンサーも募集中だよW`,
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

  manner_title: 'はじめに',
  manner_text: `このアプリケーションは
みなさんの日常を切り取る
動画＆写真撮影アプリです
SNSへの投稿等及び、二次使用は
自由に行えます
みなさんの愛のあるご利用を
お願いすると共に
このアプリが誹謗中傷や
誰かを傷つける道具と
なりませんよう
お願い申し上げます`,
  manner_agree: '同意してはじめる',

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
  eff_toutoi: '尊い',
  eff_huh: 'は？',
  eff_omg: 'やば',
  eff_party: 'パーティータイム',
  eff_choberigu: 'チョベリグー',
  label_shape: '形',
  label_color: '色',
  msg_drop_here: 'ここへ運ぶと捨てる',
  msg_release_del: 'はなすと捨てる',
  font_marumoji: 'まるもじ',
  font_note: 'ノート',
  my_frame: 'マイフレーム',
  err_play_rejected: '再生を断られました: ',
  label_none: 'なし',
  msg_saved: '保存しました！',
  msg_save_hint: '「画像を保存」または「ビデオを保存」をえらんでね',
  msg_saving_prep: '保存の準備をしています…',
  err_save_failed: '保存できませんでした（',
  msg_storing: 'しまっています…',
  err_store_failed: 'プリクラ帳にしまえませんでした',
  msg_wait: 'ちょっとまってね',
  warn_land_frame1: '（横フレームが選択されています。',
  warn_land_frame2: 'スマホを横にしてください。）',
  msg_push_record: '録画ボタンを押してね',
  btn_back: '戻る',
  msg_shooting: '撮影中…',
  btn_shoot_3: '3枚撮る',
  tab_cam_zoom: '📷 カメラ・ズーム',
  btn_cam_in: '🤳 内カメ',
  btn_cam_out: '📷 外カメ',
  lang_ja: '日本語',
  btn_detail: 'くわしく',
  about_app: 'このアプリについて',
  about_planning: '企画・制作',
  about_tech: 'テクニカルサポート',
  about_natto: 'なっとうサイダー',
  title_what_to_shoot: 'なにを撮る？',
  title_which_cam: 'どのカメラで撮りますか？',
  title_stamp_text: 'スタンプの文字',
  btn_quit_app: 'アプリを終わる',
  btn_return: 'もどる',
  btn_quit: '終わる',
  btn_take_photo: '写真を撮る',
  btn_take_video: '動画を撮る',
  tab_album: 'プリクラ帳',
  kind_photo_note: '3枚つづけて撮ります\n撮ったあとに文字とスタンプで飾れます',
  kind_video_note: '先に飾りを決めてから撮ります\n撮りながらスタンプを出せます',
  msg_album_empty: 'まだ空っぽ',
  desc_shoot_self: '自分を写す',
  desc_cam_in: '画面side（インカメラ）',
  desc_shoot_world: 'まわりの景色を写す',
  btn_loop_no: 'ループしない',
  btn_loop_yes: 'ループする🔁',
  title_choose_frame: 'フレームを選ぶ',
  btn_decide_frame: 'フレーム決定',
  btn_add: '追加',
  confirm_del_frame: 'このフレームを削除しますか？',
  title_edit_stamp: 'テキストスタンプの変更',
  title_position: '場所',
  title_rec_btn_pos: '録画ボタンの位置',
  btn_shoot_with_setting: 'この設定で撮る',
  btn_reshoot: '撮り直す',
  msg_drop_to_trash: 'はなすと捨てる',
  msg_drag_to_trash: 'ここへ運ぶと捨てる',
  tab_doodle: '✏️ らくがき',
  tab_deco: '🎀 デコ',
  btn_make_stamp: 'この文字でスタンプを作る',
  msg_deco_hint: '写真の飾りは、指1本で移動／2本でひねって傾け・大きさ',
  msg_making: '作っています…',
  btn_see_result: 'できあがりを見る',
  msg_come_again: 'また来てね！',
  msg_photo_taken: '撮れました！',
  btn_redo: 'やりなおす',
  btn_save_video: 'この動画を保存する',
  msg_done: 'できあがり！',
  btn_back_to_edit: 'もどって直す',
  btn_save_this: 'これで保存する',
  title_where_to_save: 'どこにしまう？',
  opt_save_both: 'プリクラ帳と端末',
  desc_save_both: 'どちらにも残す',
  opt_save_device: '端末だけ',
  desc_save_device: 'スマホの写真に入る',
  opt_save_album: 'プリクラ帳だけ',
  desc_save_album: 'アプリの中に貯める',
  opt_save_none: '保存しない',
  msg_collect_photos: '写真を撮って集めてね！',
  btn_cancel: 'やめる',
  msg_choose_del: '消すものを選んでね',
  btn_choose_del: '選んで消す',
  btn_close: 'とじる',
  btn_save_to_device: '端末に保存',
};

const dictEn: I18nDict = {
  guide_btn: '? How to use',
  settings_btn: '⚙ Settings',
  
  upload_hint: 'Tap to load a video',
  
  btn_preview: '▶ Preview (No recording)',
  btn_preview_stop: '⏸ Stop',
  btn_record: 'Record',
  btn_stop: 'Stop',
  unlock_title: 'Unlock the extra frames (¥300, one-time)',
  unlock_lead: 'One purchase unlocks every frame added later.',
  unlock_p1: '🖼 New frames (cyber, gothic, Japanese and more)',
  unlock_p2: '✨ Frames added in future are included too',
  unlock_buy: 'Buy on Ko-fi (¥300)',
  unlock_buy_app: 'Unlock everything (¥300)',
  unlock_restore: 'Already bought it?',
  unlock_buy_ng: 'Could not start the purchase. Please try again in a moment.',
  unlock_have: 'I have a key',
  unlock_place: 'TC-XXXX-XXXX-XXXX',
  unlock_go: 'Unlock',
  unlock_ok: 'Unlocked. Thank you!',
  unlock_ng: 'That key did not work. Please check for typos.',
  // 2026-08-15、全部無料にした。日本語側と同じあいさつを置く。
  // 伊波さんの原文の気持ち（遊ぶ姿がうれしい／SNSで出会えるのが楽しみ／
  // スポンサー募集）をそのまま英語にしている
  unlock_done: '🎁 Everything unlocked',
  unlock_done_note: `From the developer: I hope you have fun playing with all the frames.
I am looking forward to the day I run into your tinyCUBE shots on social media.
Also, sponsors welcome :)`,
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

  // 原文は規約ではなく「お願い」。命令口調にせず、その姿勢のまま訳す
  manner_title: 'Before you begin',
  manner_text: `This app is for capturing
the everyday moments of your life
in video and photos.
You are free to post what you make
on social media, and to build on it.
We ask that you use it with kindness,
and that this app never becomes
a tool for insult, harassment,
or hurting anyone.
Thank you.`,
  manner_agree: 'I agree — let\'s begin',

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
  eff_toutoi: 'Precious',
  eff_huh: 'Huh?',
  eff_omg: 'OMG',
  eff_party: 'Party Time',
  eff_choberigu: 'Very Good',
  label_shape: 'Shape',
  label_color: 'Color',
  msg_drop_here: 'Drag here to delete',
  msg_release_del: 'Release to delete',
  font_marumoji: 'Marumoji',
  font_note: 'Note',
  my_frame: 'My Frame',
  err_play_rejected: 'Playback rejected: ',
  label_none: 'None',
  msg_saved: 'Saved!',
  msg_save_hint: "Choose 'Save Image' or 'Save Video'",
  msg_saving_prep: 'Preparing to save...',
  err_save_failed: 'Could not save (',
  msg_storing: 'Storing...',
  err_store_failed: 'Could not store in Album',
  msg_wait: 'Please wait',
  warn_land_frame1: '(Landscape frame selected.',
  warn_land_frame2: 'Please turn your phone sideways.)',
  msg_push_record: 'Press the record button',
  btn_back: 'Back',
  msg_shooting: 'Shooting...',
  btn_shoot_3: 'Shoot 3',
  tab_cam_zoom: '📷 Cam & Zoom',
  btn_cam_in: '🤳 Selfie',
  btn_cam_out: '📷 Back',
  lang_ja: '日本語',
  btn_detail: 'Details',
  about_app: 'About this app',
  about_planning: 'Planning & Dev',
  about_tech: 'Technical Support',
  about_natto: 'Natto Cider',
  title_what_to_shoot: 'What to shoot?',
  title_which_cam: 'Which camera?',
  title_stamp_text: 'Stamp text',
  btn_quit_app: 'Quit app',
  btn_return: 'Return',
  btn_quit: 'Quit',
  btn_take_photo: 'Take photo',
  btn_take_video: 'Take video',
  tab_album: 'Album',
  kind_photo_note: 'Three shots in a row.\nAdd text and stickers afterwards.',
  kind_video_note: 'Pick your decorations first.\nDrop stickers while you record.',
  msg_album_empty: 'Still empty',
  desc_shoot_self: 'Shoot yourself',
  desc_cam_in: 'Screen side (Selfie)',
  desc_shoot_world: 'Shoot surroundings',
  btn_loop_no: "Don't loop",
  btn_loop_yes: 'Loop 🔁',
  title_choose_frame: 'Choose a frame',
  btn_decide_frame: 'Select frame',
  btn_add: 'Add',
  confirm_del_frame: 'Delete this frame?',
  title_edit_stamp: 'Edit text stamp',
  title_position: 'Position',
  title_rec_btn_pos: 'Record button position',
  btn_shoot_with_setting: 'Shoot with this setting',
  btn_reshoot: 'Reshoot',
  msg_drop_to_trash: 'Release to trash',
  msg_drag_to_trash: 'Drag here to trash',
  tab_doodle: '✏️ Text',
  tab_deco: '🎀 Deco',
  btn_make_stamp: 'Create stamp with this text',
  msg_deco_hint: 'Decorations: 1 finger to move / 2 fingers to pinch, rotate & resize',
  msg_making: 'Creating...',
  btn_see_result: 'See result',
  msg_come_again: 'Come again!',
  msg_photo_taken: 'Photo taken!',
  btn_redo: 'Redo',
  btn_save_video: 'Save this video',
  msg_done: 'Done!',
  btn_back_to_edit: 'Back to edit',
  btn_save_this: 'Save this',
  title_where_to_save: 'Where to save?',
  opt_save_both: 'Album & Device',
  desc_save_both: 'Keep in both',
  opt_save_device: 'Device only',
  desc_save_device: 'Save to phone photos',
  opt_save_album: 'Album only',
  desc_save_album: 'Store in app',
  opt_save_none: "Don't save",
  msg_collect_photos: 'Take photos and collect them!',
  btn_cancel: 'Cancel',
  msg_choose_del: 'Choose what to delete',
  btn_choose_del: 'Select & Delete',
  btn_close: 'Close',
  btn_save_to_device: 'Save to device',
};

const dict = { ja: dictJa, en: dictEn };

export const t = (key: keyof I18nDict): string => {
  return dict[currentLang][key];
};
