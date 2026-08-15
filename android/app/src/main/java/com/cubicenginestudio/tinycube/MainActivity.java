package com.cubicenginestudio.tinycube;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

/**
 * ⚠️ **ここを空のままにすると、実機でカメラが使えない。**
 *
 * Capacitor の初期状態は `public class MainActivity extends BridgeActivity {}` の
 * 一行だけで、カメラの許可まわりが何も入っていない。
 * Web ブラウザでは動くのに、アプリにしたとたん「カメラが許可できない」になる
 * （2026-08-15、伊波さんが内部テストの実機で発見）。
 *
 * 要るのは2つ。片方だけでは動かない。
 *
 *   1. **アプリがユーザーに許可を求める**（Android 6 以降の実行時の権限）
 *      → onCreate で requestPermissions を呼ぶ
 *   2. **WebView が「このページにカメラを使わせてよい」と答える**
 *      → onPermissionRequest で grant する。
 *        これが無いと、ユーザーが許可したあとでも getUserMedia が
 *        NotAllowedError で断られる（WebView の既定は「拒否」）
 *
 * AndroidManifest.xml 側の宣言（CAMERA / RECORD_AUDIO）も必要。
 */
public class MainActivity extends BridgeActivity {

    private static final int REQ_MEDIA = 4771;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        askForCameraAndMic();
    }

    /**
     * WebView の差し替えは onStart で行う。
     * onCreate の時点では Capacitor がまだ WebView を用意しておらず、
     * getWebView() が null で返ることがある（そうなると黙って何も起きない）。
     */
    @Override
    public void onStart() {
        super.onStart();
        letTheWebViewUseCamera();
    }

    /** 端末に「カメラとマイクを使ってよいか」を尋ねる。
        すでに許可済みなら何も出ない */
    private void askForCameraAndMic() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;   // 6 未満は入れた時点で許可済み

        boolean needCamera = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED;
        boolean needMic = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED;

        if (needCamera || needMic) {
            ActivityCompat.requestPermissions(
                this,
                new String[]{ Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO },
                REQ_MEDIA
            );
        }
    }

    /**
     * WebView の中の getUserMedia に答える係。
     *
     * ⚠️ **request.grant(request.getResources()) を呼ばないと、
     *      アプリ側で許可済みでも映像が来ない。** WebView は既定で断る。
     */
    private void letTheWebViewUseCamera() {
        if (getBridge() == null || getBridge().getWebView() == null) return;

        getBridge().getWebView().setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    // 自分のアプリの中の画面しか読み込まないので、求められたものをそのまま渡す
                    request.grant(request.getResources());
                });
            }
        });
    }
}
