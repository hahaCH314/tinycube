package com.cubicenginestudio.tinycube;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Base64;

/**
 * 撮ったものを、押したその場で写真アプリへしまう係。
 *
 * ⚠️ **なぜ自分で書いたか**（2026-08-18）
 *
 * はじめは @capacitor-community/media を使っていたが、あれは
 * READ_MEDIA_IMAGES / READ_MEDIA_VIDEO を要求する。**他人の写真も読む**
 * ための権限で、保存だけなら要らない。そして権限を宣言すると Play が
 * 「19,037台のデバイスがサポートされなくなりました」と警告した。
 *
 *   権限を付ける → 対応する端末が減る
 *   権限を外す   → プラグインが動かず、共有シートに落ちる
 *
 * という板挟みになった（伊波さん「やっぱり共有画面、しかもめっちゃ遅い」）。
 *
 * Android 10 (API 29) 以降は **自分のアプリから写真を入れるだけなら権限が
 * 要らない**。MediaStore を直接呼べば済む。だから自分で書いた。
 *
 * ⚠️ **権限は1つも宣言しないこと。** ここが崩れると上の板挟みに戻る。
 */
@CapacitorPlugin(name = "Gallery")
public class GalleryPlugin extends Plugin {

    /** アプリ名のフォルダにまとめる。写真アプリで探しやすい */
    private static final String ALBUM = "tinyCUBE";

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");      // base64（頭の data: は付けない）
        String name = call.getString("name");
        boolean isVideo = Boolean.TRUE.equals(call.getBoolean("isVideo", false));

        if (data == null || name == null) {
            call.reject("data と name が要ります");
            return;
        }

        try {
            byte[] bytes = Base64.getDecoder().decode(data);
            Uri uri = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? saveViaMediaStore(bytes, name, isVideo)
                : saveViaFile(bytes, name, isVideo);

            JSObject ret = new JSObject();
            ret.put("uri", uri == null ? "" : uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            // ⚠️ **理由をそのまま返すこと。** 黙って失敗すると、
            //    画面には「遅い」としか見えない
            call.reject(e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    /** Android 10 以降。**権限が要らない道** */
    private Uri saveViaMediaStore(byte[] bytes, String name, boolean isVideo) throws Exception {
        ContentResolver cr = getContext().getContentResolver();
        Uri collection = isVideo
            ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);

        ContentValues v = new ContentValues();
        v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        v.put(MediaStore.MediaColumns.MIME_TYPE, isVideo ? "video/mp4" : "image/jpeg");
        v.put(MediaStore.MediaColumns.RELATIVE_PATH,
              (isVideo ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES)
              + File.separator + ALBUM);
        // 書き終わるまで他のアプリから見えないようにする。
        // 途中の壊れたファイルが写真アプリに出るのを防ぐ
        v.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = cr.insert(collection, v);
        if (uri == null) throw new Exception("MediaStore が場所を作れませんでした");

        try (OutputStream out = cr.openOutputStream(uri)) {
            if (out == null) throw new Exception("書き込み先を開けませんでした");
            out.write(bytes);
        }

        v.clear();
        v.put(MediaStore.MediaColumns.IS_PENDING, 0);
        cr.update(uri, v, null, null);
        return uri;
    }

    /** Android 9 以下。ここは権限が要るので、失敗したら呼び出し側が
     *  共有シートへ落とす（save.ts の catch） */
    private Uri saveViaFile(byte[] bytes, String name, boolean isVideo) throws Exception {
        File dir = new File(
            Environment.getExternalStoragePublicDirectory(
                isVideo ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES),
            ALBUM);
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("フォルダを作れませんでした");

        File f = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(bytes);
        }
        // 写真アプリに知らせる。しないと一覧に出てこない
        getContext().sendBroadcast(
            new android.content.Intent(android.content.Intent.ACTION_MEDIA_SCANNER_SCAN_FILE,
                                       Uri.fromFile(f)));
        return Uri.fromFile(f);
    }
}
