import Foundation
import Capacitor
import Photos

/**
 撮ったものを、押したその場で写真アプリへしまう係（iOS 版）。

 Android 版は `android/app/src/main/java/.../GalleryPlugin.java`。
 JS 側（`src/save.ts`）は `registerPlugin('Gallery')` で両方を同じ名前で呼ぶので、
 **受け取る引数と返す形を Android 版と一字一句そろえること**。

   引数  { data: base64（頭の "data:" は付けない）, name: String, isVideo: Bool }
   返り  { uri: String }

 ⚠️ **なぜ要るか**（2026-08-21）

 これが無いと、iOS では `Gallery.save()` が必ず失敗して共有シートに落ちる。
 Android で「やっぱり共有画面、しかもめっちゃ遅い」と言われたあの状態に、
 iOS だけ逆戻りすることになる。

 ⚠️ **アルバムを作らないこと。**

 Android 版は写真アプリに "tinyCUBE" というフォルダを作っている。iOS でも
 同じことはできるが、**アルバムの作成には読み取り権限（NSPhotoLibraryUsageDescription）が要る**。
 それは「他人の写真も全部読む」権限で、保存だけなら要らない。

 Android で権限を足して二度つまずいた教訓（GalleryPlugin.java の頭を見ること）を
 iOS でも守る。`.addOnly` は**追加しかできない代わりに、許可を求める文言が
 やさしく、拒否されにくい**。入る先はカメラロールの一番新しいところになる。
 */
@objc(GalleryPlugin)
public class GalleryPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "GalleryPlugin"
    public let jsName = "Gallery"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)
    ]

    @objc func save(_ call: CAPPluginCall) {
        guard let base64 = call.getString("data"),
              let name = call.getString("name") else {
            call.reject("data と name が要ります")
            return
        }
        let isVideo = call.getBool("isVideo", false)

        guard let bytes = Data(base64Encoded: base64) else {
            call.reject("base64 を読み取れませんでした")
            return
        }

        // ⚠️ **許可を先に聞くこと。** いきなり performChanges を呼ぶと、
        //    拒否されているときに理由の分からないエラーになる。
        //    `.addOnly` は「追加だけ」。読み取りは求めない
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard let self else { return }
            switch status {
            case .authorized, .limited:
                self.write(bytes: bytes, name: name, isVideo: isVideo, call: call)
            case .denied, .restricted:
                // ⚠️ 呼び出し側（save.ts）はこの文字列を見て共有シートへ落とす。
                //    "cancel|abort|dismiss" を含めないこと。含めると
                //    「本人がやめた」と誤解されて、保存する道が消える
                call.reject("写真への追加が許可されていません")
            case .notDetermined:
                call.reject("写真への追加が許可されていません")
            @unknown default:
                call.reject("写真への追加が許可されていません")
            }
        }
    }

    private func write(bytes: Data, name: String, isVideo: Bool, call: CAPPluginCall) {
        var placeholder: PHObjectPlaceholder?
        // 動画は一時ファイル経由にする。PHAssetCreationRequest は動画を
        // Data で渡すと端末によって黙って失敗することがあるため
        var tempURL: URL?

        if isVideo {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            do {
                try bytes.write(to: url, options: .atomic)
                tempURL = url
            } catch {
                call.reject("一時ファイルを作れませんでした: \(error.localizedDescription)")
                return
            }
        }

        PHPhotoLibrary.shared().performChanges({
            let req = PHAssetCreationRequest.forAsset()
            let options = PHAssetResourceCreationOptions()
            options.originalFilename = name
            if isVideo, let url = tempURL {
                // 移動にすると、写真アプリに入ったあと一時ファイルが自動で消える
                options.shouldMoveFile = true
                req.addResource(with: .video, fileURL: url, options: options)
            } else {
                req.addResource(with: .photo, data: bytes, options: options)
            }
            placeholder = req.placeholderForCreatedAsset
        }, completionHandler: { ok, error in
            // 移動できなかったときのために、残っていたら片付ける
            if let url = tempURL, FileManager.default.fileExists(atPath: url.path) {
                try? FileManager.default.removeItem(at: url)
            }
            if ok {
                call.resolve(["uri": placeholder?.localIdentifier ?? ""])
            } else {
                // ⚠️ **理由をそのまま返すこと。** 黙って失敗すると、
                //    画面には「遅い」としか見えない（Android 版と同じ考え）
                call.reject("写真アプリに入れられませんでした: \(error?.localizedDescription ?? "理由不明")")
            }
        })
    }
}
