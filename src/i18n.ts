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
  btn_preview_stop: string;
  btn_stop: string;
  unlock_title: string;
  unlock_lead: string;
  unlock_p1: string;
  unlock_p2: string;
  unlock_buy: string;
  /** Web にいま買う道が無いときに出す（2026-08-24）。BOOTH を閉じ、
      Ko-fi は寄付専用にしたため。Stripe が入るまでの間 */
  unlock_web_soon: string;
  /** アプリ（Android）で買うボタン。**外の売り場の名前を出してはいけない**。
      Play の課金を通すので「BOOTH で買う」とは書けない（2026-08-14）*/
  unlock_buy_app: string;
  unlock_lead_short: string;
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
  trial_hint: string;
  trial_buy: string;
  btn_make_sheet: string;
  sheet_note: string;
  sheet_title: string;
  sheet_lead: string;
  sheet_from_album: string;
  sheet_from_device: string;
  sheet_need_more: string;
  sheet_room_full: string;
  sheet_layout: string;
  sheet_tap_del: string;
  sheet_save: string;
  sheet_clear: string;
  btn_use_picked: string;
  msg_pick_for_sheet: string;
  btn_photo: string;
  guide_photo: string;

  // Effects (Burst)
  eff_flash: string;
  eff_mirrorball: string;

  // Effects (Sound)
  turn_hint: string;
  promo_open: string;
  setting_teloppos: string;
  telop_center: string;
  telop_random: string;
  title_telop_mode: string;
  telop_tap: string;
  telop_auto_random: string;
  telop_auto_order: string;
  title_ambient: string;
  title_tone: string;
  tone_none: string;
  tone_warm: string;
  tone_cool: string;
  tone_vivid: string;
  setting_telopcolor: string;
  telop_white: string;
  telop_black: string;
  setting_sounds: string;
  setting_camera: string;
  cam_front: string;
  cam_back: string;
  cam_off: string;
  cam_fail: string;
  /** カメラを OS に取り上げられたとき（2026-08-30）。
      黙って絵が固まるのが一番たちが悪い */
  cam_lost: string;
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
  setting_shape: string;
  setting_shape_wide_note: string;
  setting_shape_land: string;
  setting_shape_port: string;
  setting_frame: string;
  frame_none: string;
  frame_crop: string;

  // Alerts
  alert_load_first: string;
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
  tab_album: string;
  kind_photo_note: string;
  msg_album_empty: string;
  desc_shoot_self: string;
  desc_cam_in: string;
  desc_shoot_world: string;
  btn_loop_no: string;
  btn_loop_yes: string;
  title_choose_frame: string;
  /** 季節の限定フレーム（2026-08-25）。{s} は季節の名前 */
  btn_season_open: string;
  btn_season_back: string;
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
  opt_save_insta: string;
  desc_save_insta: string;
  opt_save_none: string;
  msg_collect_photos: string;
  btn_cancel: string;
  msg_choose_del: string;
  btn_choose_del: string;
  /** 並べ替え（2026-08-24）。2枚選ぶと入れ替わる */
  btn_sort: string;
  msg_sort_hint: string;
  btn_close: string;
  btn_save_to_device: string;
};

const dictJa: I18nDict = {
  guide_btn: '? 使い方',
  settings_btn: '⚙ 設定',
  
  upload_hint: 'カメラをオンにしてね',
  
  btn_preview_stop: '⏸ とめる',
  // 絵はボタン側（.ctrl-icon）で出すので、言葉だけ持つ。
  // ここに ● や ■ を付けると、ボタンの上で二重に出る（2026-08-13）
  btn_stop: '停止',
  unlock_title: '追加フレームを使う（¥300・買い切り）',
  unlock_lead: '一度きりの買い物で、あとから足したフレームが全部使えます。',
  unlock_p1: '🖼 新しいフレームが使える（サイバー・ゴシック・和風など）',
  unlock_p2: '✨ これから足すぶんも、追加のお金なしで使えます',
  unlock_buy: 'BOOTH で買う（¥300）',
  unlock_web_soon: 'いまはアプリ版でだけ買えます。ブラウザからのお支払いは準備中です。',
  unlock_buy_app: 'ぜんぶ使えるようにする（¥300）',
  unlock_lead_short: 'フレーム53枚＋透かし消し',
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
  //
  // ⚠️ 2026-08-31、**「スポンサーも募集中だよW」の1行だけ外した**
  //    （伊波さんの判断）。ここは ¥300 を買ってくれた人にだけ出る画面で、
  //    買った直後にさらにお金の話をすることになる。
  //    寄付を募っているのは **CUBICENGINE のほう**で、tinyCUBE は買い切り。
  //    製品どうしで収益の立て方を混ぜない（[[cubicengine-is-donation-based]]）。
  //    前の2行は伊波さんの文章なので、そのまま残す
  unlock_done: '🎁 ぜんぶ使えます',
  unlock_done_note: `開発者から、みんなのフレームで遊ぶ姿、楽しく遊んでくれていたら嬉しいです。
いつかSNSでtinyCUBEで撮った写真たちに出会えることを、楽しみにしております。`,
  unlock_relock: 'この端末の解除をやめる',
  frame_locked: '🔒',
  locked_hint: 'このフレームは「ぜんぶ使う」に入っています。',
  trial_hint: '🔒 おためし中。この枠のまま撮れますが、斜めに鍵のシールが入ります。',
  trial_buy: 'シールを外す（¥300）',
  btn_make_sheet: 'プリシートを作る',
  sheet_note: 'ためた写真を1枚に',
  sheet_title: 'プリシートを作る',
  sheet_lead: '3〜7枚えらぶと、1枚のシールシートになるよ。さいしょに選んだ1枚がいちばん大きく出ます。',
  sheet_from_album: '📖 プリクラ帳から',
  sheet_from_device: '📱 端末の写真から',
  sheet_need_more: 'あと{n}枚えらんでね',
  sheet_room_full: 'ここまで（{n}枚）',
  sheet_layout: 'ならべ方',
  sheet_tap_del: 'タップで外せるよ',
  sheet_save: 'このシートを保存する',
  sheet_clear: 'えらび直す',
  btn_use_picked: '{n}枚を使う',
  msg_pick_for_sheet: 'シートに使うものを選んでね',
  btn_photo: '写真を撮る',
  guide_photo: '📷 を押すと、そのときの画面がそのまま1枚の写真になります。枠もエフェクトも乗ったまま保存されます。',
  
  eff_flash: '💥 フラッシュ',
  eff_mirrorball: '🪩 ミラーボール',
  turn_hint: '📱↻ 16:9 の場合は横向きでご利用ください',
  promo_open: 'CMCUBE を見る →',
  setting_teloppos: '文字の出る場所',
  telop_center: '◎ まん中',
  telop_random: '🎲 ばらける',
  title_telop_mode: '出し方',
  telop_tap: '👆 じぶんで',
  telop_auto_random: '🎲 おまかせ',
  telop_auto_order: '🔢 じゅんばん',
  title_ambient: '動き',
  title_tone: '色み',
  tone_none: 'なし',
  tone_warm: '🌇 あたたかい',
  tone_cool: '🧊 つめたい',
  tone_vivid: '🌈 こい',
  setting_telopcolor: '文字の色',
  telop_white: '⬜ 白文字',
  telop_black: '⬛ 黒文字',
  setting_sounds: '効果音（3つ）',
  setting_camera: 'カメラ',
  cam_front: '内カメ',
  cam_back: '外カメ',
  cam_off: '⏹ 使わない',
  cam_fail: 'カメラを開けませんでした。許可の設定を確かめてください。',
  cam_lost: 'カメラがいったん止まりました。つなぎ直しています…',
  eff_emotional: '🌸 エモい',
  eff_clap: '👏 拍手',
  eff_drum: '🥁 ドラム',
  eff_blip: '🔹 電子音',

  manner_title: 'はじめに',
  manner_text: `このアプリケーションは
みなさんの日常を切り取る
写真撮影アプリです
SNSへの投稿等及び、二次使用は
自由に行えます
みなさんの愛のあるご利用を
お願いすると共に
このアプリが誹謗中傷や
誰かを傷つける道具と
なりませんよう
お願い申し上げます`,
  /* 2026-08-31、伊波さん「ボタン文言 はじめる だけに」。
     同意そのものは上の文章で伝わっているので、ボタンは短く */
  manner_agree: 'はじめる',

  guide_title: 'tinyCUBE の使い方',
  guide_step1_title: '枠をえらぶ',
  guide_step1_desc: '顔ハメや推し色の枠から1つ。縦か横かも、ここで決めます。',
  guide_step2_title: '📸 を押して3枚つづけて撮る',
  guide_step2_desc: 'カメラの許可を聞かれたら「許可」を押してください。1・2・3と数えてから撮ります。',
  guide_step3_title: '文字とスタンプで飾って保存',
  guide_step3_desc: '3枚が1枚のシートになります。プリクラ帳にためた写真は、あとから「プリシートを作る」で好きな組み合わせに組み直せます。',
  guide_warn_title: '⚠ 撮る前に、必ず確認してください',
  guide_warn1_title: '他人の個人情報を映さない。',
  guide_warn1_desc: '写真に映り込んだ名前、住所、画面の通知はすべて残ります。一度公開したものは取り消せません。',
  guide_warn2_title: '他人の作品を無断で使わない。',
  guide_warn2_desc: '写真、イラスト、グッズには権利者がいます。投稿や収益化の可否は、各権利者の規約に従ってください。',
  guide_warn3_title: '人を撮るときは、相手の同意を得てください。',
  guide_warn3_desc: '撮った写真は、そのまま人に見せられる形で残ります。',
  guide_warn4_title: '人を貶める目的、誤解させる目的で使わないでください。',
  guide_note1: '枠の絵は本来 CMCUBE（PC版）のもので、16:9 で描かれています。縦（9:16）で使うと左右が欠けます。それでも使えるようにしてあるので、欠けるものには一覧で印を出しています。',
  guide_note2: 'tinyCUBE がロイヤリティフリーを保証するのは、あなた自身が作った部分だけです。持ち込んだ写真の権利処理は利用者の責任になります。',
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
  setting_shape: '書き出しの形',
  setting_shape_wide_note: 'カメラが横長です。スマホを横向きにすると大きく見えます。',
  setting_shape_land: '横',
  setting_shape_port: '縦',
  setting_frame: '枠',
  frame_none: 'フレームなし',
  frame_crop: '端が欠けます',

  alert_load_first: '先にカメラをオンにしてください！',
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
  msg_save_hint: '「画像を保存」をえらんでね',
  msg_saving_prep: '保存の準備をしています…',
  err_save_failed: '保存できませんでした（',
  msg_storing: 'しまっています…',
  err_store_failed: 'プリクラ帳にしまえませんでした',
  msg_wait: 'ちょっとまってね',
  warn_land_frame1: '（横フレームが選択されています。',
  warn_land_frame2: 'スマホを横にしてください。）',
  msg_push_record: '📸 を押してね',
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
  tab_album: 'プリクラ帳',
  kind_photo_note: '3枚つづけて撮ります\n撮ったあとに文字とスタンプで飾れます',
  msg_album_empty: 'まだ空っぽ',
  desc_shoot_self: '自分を写す',
  desc_cam_in: '画面side（インカメラ）',
  desc_shoot_world: 'まわりの景色を写す',
  btn_loop_no: 'ループしない',
  btn_loop_yes: 'ループする🔁',
  title_choose_frame: 'フレームを選ぶ',
  btn_season_open: '🍁 {s}のフレーム（いまだけ）',
  btn_season_back: '← ふつうのフレームにもどる',
  btn_decide_frame: 'フレーム決定',
  btn_add: '追加',
  confirm_del_frame: 'このフレームを削除しますか？',
  title_edit_stamp: 'テキストスタンプの変更',
  title_position: '場所',
  title_rec_btn_pos: '撮るボタンの位置',
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
  opt_save_insta: 'インスタ用',
  desc_save_insta: '白いフチをつけて、切られない形にする',
  opt_save_none: '保存しない',
  msg_collect_photos: '写真を撮って集めてね！',
  btn_cancel: 'やめる',
  msg_choose_del: '消すものを選んでね',
  btn_choose_del: '選んで消す',
  btn_sort: 'ならべかえ',
  msg_sort_hint: '入れかえたい2まいを、じゅんばんにタップしてね',
  btn_close: 'とじる',
  btn_save_to_device: '端末に保存',
};

const dictEn: I18nDict = {
  guide_btn: '? How to use',
  settings_btn: '⚙ Settings',
  
  upload_hint: 'Turn the camera on', 
  
  btn_preview_stop: '⏸ Stop',
  btn_stop: 'Stop',
  unlock_title: 'Unlock the extra frames (¥300, one-time)',
  unlock_lead: 'One purchase unlocks every frame added later.',
  unlock_p1: '🖼 New frames (cyber, gothic, Japanese and more)',
  unlock_p2: '✨ Frames added in future are included too',
  unlock_buy: 'Buy on Ko-fi (¥300)',
  unlock_web_soon: 'Purchases are available in the app for now. Payment from the browser is coming soon.',
  unlock_buy_app: 'Unlock everything (¥300)',
  unlock_lead_short: '53 more frames, no watermark',
  unlock_restore: 'Already bought it?',
  unlock_buy_ng: 'Could not start the purchase. Please try again in a moment.',
  unlock_have: 'I have a key',
  unlock_place: 'TC-XXXX-XXXX-XXXX',
  unlock_go: 'Unlock',
  unlock_ok: 'Unlocked. Thank you!',
  unlock_ng: 'That key did not work. Please check for typos.',
  // 2026-08-15、全部無料にした。日本語側と同じあいさつを置く。
  // 伊波さんの原文の気持ち（遊ぶ姿がうれしい／SNSで出会えるのが楽しみ）を
  // そのまま英語にしている。
  // ⚠️ 2026-08-31、日本語側と揃えて **'Also, sponsors welcome :)' を外した**
  unlock_done: '🎁 Everything unlocked',
  unlock_done_note: `From the developer: I hope you have fun playing with all the frames.
I am looking forward to the day I run into your tinyCUBE shots on social media.`,
  unlock_relock: 'Remove the unlock from this device',
  frame_locked: '🔒',
  locked_hint: 'This frame is part of "Unlock everything".',
  trial_hint: '🔒 Trying it on. You can still shoot, but a little lock sticker goes in.',
  trial_buy: 'Remove the sticker (¥300)',
  btn_make_sheet: 'Make a photo sheet',
  sheet_note: 'Turn saved shots into one sheet',
  sheet_title: 'Make a photo sheet',
  sheet_lead: 'Pick 3 to 7 photos and they become one sticker sheet. The first one you pick comes out biggest.',
  sheet_from_album: '📖 From the album',
  sheet_from_device: '📱 From your photos',
  sheet_need_more: 'Pick {n} more',
  sheet_room_full: 'That is the limit ({n})',
  sheet_layout: 'Layout',
  sheet_tap_del: 'Tap one to take it out',
  sheet_save: 'Save this sheet',
  sheet_clear: 'Start over',
  btn_use_picked: 'Use {n}',
  msg_pick_for_sheet: 'Choose the ones for your sheet',
  btn_photo: 'Take a photo',
  guide_photo: 'Press 📷 to save the screen as a still image. Frames and effects are baked in, just as you see them.',
  
  eff_flash: '💥 Flash',
  eff_mirrorball: '🪩 Mirror ball',
  turn_hint: '📱↻ For 16:9, please turn your phone sideways',
  promo_open: 'See CMCUBE →',
  setting_teloppos: 'Caption position',
  telop_center: '◎ Centre',
  telop_random: '🎲 Scattered',
  title_telop_mode: 'How',
  telop_tap: '👆 By tap',
  telop_auto_random: '🎲 Shuffle',
  telop_auto_order: '🔢 In order',
  title_ambient: 'Motion',
  title_tone: 'Tone',
  tone_none: 'None',
  tone_warm: '🌇 Warm',
  tone_cool: '🧊 Cool',
  tone_vivid: '🌈 Vivid',
  setting_telopcolor: 'Caption colour',
  telop_white: '⬜ White',
  telop_black: '⬛ Black',
  setting_sounds: 'Sounds (3)',
  setting_camera: 'Camera',
  cam_front: 'Selfie',
  cam_back: 'Back',
  cam_off: '⏹ Off',
  cam_fail: 'Could not open the camera. Check the permission settings.',
  cam_lost: 'The camera stopped. Reconnecting…',
  eff_emotional: '🌸 Dreamy',
  eff_clap: '👏 Clap',
  eff_drum: '🥁 Drum',
  eff_blip: '🔹 Electronic',

  // 原文は規約ではなく「お願い」。命令口調にせず、その姿勢のまま訳す
  manner_title: 'Before you begin',
  manner_text: `This app is for capturing
the everyday moments of your life
in photos.
You are free to post what you make
on social media, and to build on it.
We ask that you use it with kindness,
and that this app never becomes
a tool for insult, harassment,
or hurting anyone.
Thank you.`,
  manner_agree: 'Start',

  guide_title: 'How to use tinyCUBE',
  guide_step1_title: 'Pick a frame',
  guide_step1_desc: 'One from the face cut-outs or the fan colours. Choose portrait or landscape here too.',
  guide_step2_title: 'Press 📸 for three shots in a row',
  guide_step2_desc: 'Allow camera access if prompted. It counts 1, 2, 3 before each shot.',
  guide_step3_title: 'Decorate with text and stickers, then save',
  guide_step3_desc: 'The three shots become one sheet. Photos saved in your album can be rearranged later with "Make a photo sheet".',
  guide_warn_title: '⚠ Please confirm before you shoot',
  guide_warn1_title: 'Do not show others\' personal information.',
  guide_warn1_desc: 'Names, addresses, and on-screen notifications caught in a photo stay in it. You cannot undo this once published.',
  guide_warn2_title: 'Do not use others\' work without permission.',
  guide_warn2_desc: 'Photos, artwork, and merchandise have rights holders. Follow their terms for posting and monetization.',
  guide_warn3_title: 'Get consent before photographing others.',
  guide_warn3_desc: 'What you shoot stays in a form you can show to anyone.',
  guide_warn4_title: 'Do not use this to demean or mislead people.',
  guide_note1: 'The frame art is originally from CMCUBE (PC version) and drawn in 16:9. If you use it in vertical (9:16), the sides will be cropped. A warning mark is shown for frames that will be cropped.',
  guide_note2: 'tinyCUBE only guarantees that the parts you made yourself are royalty-free. Clearing rights for photos you bring in is your responsibility.',
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
  setting_shape: 'Output Shape',
  setting_shape_wide_note: 'The camera is landscape. Turn your phone sideways for a better view.',
  setting_shape_land: 'Landscape',
  setting_shape_port: 'Portrait',
  setting_frame: 'Frames',
  frame_none: 'No frame',
  frame_crop: 'Edges cropped',

  alert_load_first: 'Please turn the camera on first!',
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
  msg_save_hint: "Choose 'Save Image'",
  msg_saving_prep: 'Preparing to save...',
  err_save_failed: 'Could not save (',
  msg_storing: 'Storing...',
  err_store_failed: 'Could not store in Album',
  msg_wait: 'Please wait',
  warn_land_frame1: '(Landscape frame selected.',
  warn_land_frame2: 'Please turn your phone sideways.)',
  msg_push_record: 'Press 📸',
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
  tab_album: 'Album',
  kind_photo_note: 'Three shots in a row.\nAdd text and stickers afterwards.',
  msg_album_empty: 'Still empty',
  desc_shoot_self: 'Shoot yourself',
  desc_cam_in: 'Screen side (Selfie)',
  desc_shoot_world: 'Shoot surroundings',
  btn_loop_no: "Don't loop",
  btn_loop_yes: 'Loop 🔁',
  title_choose_frame: 'Choose a frame',
  btn_season_open: '🍁 {s} frames (limited time)',
  btn_season_back: '← Back to normal frames',
  btn_decide_frame: 'Select frame',
  btn_add: 'Add',
  confirm_del_frame: 'Delete this frame?',
  title_edit_stamp: 'Edit text stamp',
  title_position: 'Position',
  title_rec_btn_pos: 'Shutter button position',
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
  opt_save_insta: 'For Instagram',
  desc_save_insta: 'Adds a white border so it will not be cropped',
  opt_save_none: "Don't save",
  msg_collect_photos: 'Take photos and collect them!',
  btn_cancel: 'Cancel',
  msg_choose_del: 'Choose what to delete',
  btn_choose_del: 'Select & Delete',
  btn_sort: 'Reorder',
  msg_sort_hint: 'Tap two photos to swap their places',
  btn_close: 'Close',
  btn_save_to_device: 'Save to device',
};

const dict = { ja: dictJa, en: dictEn };

export const t = (key: keyof I18nDict): string => {
  return dict[currentLang][key];
};
