import Foundation
import Capacitor
import Photos

/**
 * 撮ったものを、押したその場で写真アプリへしまう係（iOS 版）。
 *
 * ⚠️ **このファイルは一度もコンパイルされていない**（2026-08-21、Windows のシオン）。
 *    型や API 名が違う可能性がある。Mac で通してから信じること。
 *
 * Android 版（GalleryPlugin.java）と同じ仕事をする。JS から見た形も同じ:
 *   Gallery.save({ data, name, isVideo }) -> { uri }
 *
 * ⚠️ **なぜ「追加専用」の権限しか求めないか**
 *
 * Android 版は、保存だけなのに READ_MEDIA_IMAGES（他人の写真も読む権限）を
 * 求めるプラグインを捨てて自前で書いた。iOS にも同じ分かれ道がある。
 *
 *   .readWrite  … 写真アプリの中身を全部読める。保存だけなら要らない。
 *                 審査で「なぜ読む必要が？」と聞かれる材料にもなる
 *   .addOnly    … 入れることしかできない。**こちらを使う**
 *
 * addOnly なら、出る確認は「写真の追加を許可しますか」だけで済む。
 * 子どもが使うものなので、聞くことは少ないほどいい。
 *
 * ⚠️ **Info.plist に NSPhotoLibraryAddUsageDescription が要る。**
 *    無いと許可を求めた瞬間にアプリごと落ちる（iOS はここが厳しい）。
 *    NSPhotoLibraryUsageDescription（読み取り側）は**書かないこと**。
 *    書くと審査で読み取りの理由を問われる。addOnly には要らない。
 *
 * ⚠️ **AppDelegate か MainViewController で registerPlugin すること。**
 *    Android 版は MainActivity.onCreate で super より前に呼んでいる
 *    （あとから呼ぶと JS から見えない）。iOS も登録を忘れると
 *    「プラグインがありません」で静かに失敗する。
 */
@objc(GalleryPlugin)
public class GalleryPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "GalleryPlugin"
    public let jsName = "Gallery"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)
    ]

    /** アプリ名のアルバムにまとめる。写真アプリで探しやすい（Android 版と同じ） */
    private static let album = "tinyCUBE"

    @objc func save(_ call: CAPPluginCall) {
        guard let data = call.getString("data"),
              let name = call.getString("name") else {
            call.reject("data と name が要ります")
            return
        }
        let isVideo = call.getBool("isVideo", false)

        guard let bytes = Data(base64Encoded: data) else {
            call.reject("base64 を読み取れませんでした")
            return
        }

        // ⚠️ **許可は毎回確かめること。** 一度断られたあとに設定から許可された、
        //    という順序があるので、覚えておいて使い回すと戻ってこられなくなる
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard let self = self else { return }

            switch status {
            case .authorized, .limited:
                self.write(bytes: bytes, name: name, isVideo: isVideo, call: call)
            case .denied, .restricted:
                // ⚠️ **「断られた」と分かる言葉で返すこと。**
                //    save.ts は /cancel|abort|dismiss/ を見て共有シートに落とすかを
                //    決める。ここが曖昧だと、断られたのに共有シートが出て
                //    二度手間になる（Android 版のコメントと同じ理由）
                call.reject("denied: 写真への追加が許可されていません")
            case .notDetermined:
                call.reject("notDetermined: 許可を確かめられませんでした")
            @unknown default:
                call.reject("unknown: 許可の状態が分かりませんでした")
            }
        }
    }

    /**
     * 実際に書き込む。
     *
     * ⚠️ **いったんファイルにしてから渡すこと。** 写真アプリへは
     *    「ファイルの場所」で渡すのが確実で、動画は特にそう。
     *    Data のまま入れられるのは画像だけ（動画は必ず場所が要る）。
     *    Android 版は base64 をそのまま MediaStore に流せたが、
     *    iOS はここだけ一手多い。
     */
    private func write(bytes: Data, name: String, isVideo: Bool, call: CAPPluginCall) {
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent(name)

        do {
            try bytes.write(to: tmp, options: .atomic)
        } catch {
            call.reject("一時ファイルを作れませんでした: \(error.localizedDescription)")
            return
        }

        var placeholder: PHObjectPlaceholder?

        PHPhotoLibrary.shared().performChanges({
            let req: PHAssetChangeRequest? = isVideo
                ? PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: tmp)
                : PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL: tmp)

            guard let req = req else { return }
            placeholder = req.placeholderForCreatedAsset

            // アルバムにも入れる。**入らなくても保存自体は成功とみなす**
            // （アルバム作成に失敗しても、写真アプリの一覧には出るため）
            if let collection = self.findOrPrepareAlbum(),
               let addReq = PHAssetCollectionChangeRequest(for: collection),
               let placeholder = placeholder {
                addReq.addAssets([placeholder] as NSArray)
            }
        }, completionHandler: { success, error in
            try? FileManager.default.removeItem(at: tmp)

            if success {
                let id = placeholder?.localIdentifier ?? ""
                // Android 版は MediaStore の URI を返す。iOS に URI は無いので
                // 写真アプリの中の ID を返す。save.ts は中身を見ていない
                call.resolve(["uri": id])
            } else {
                // ⚠️ **理由をそのまま返すこと**（Android 版と同じ）。
                //    黙って失敗すると、画面には「遅い」としか見えない
                call.reject(error?.localizedDescription ?? "写真アプリへ入れられませんでした")
            }
        })
    }

    /**
     * tinyCUBE のアルバムを探す。無ければ作る。
     *
     * ⚠️ **performChanges の中から呼ぶこと。** 作成もひとつの変更なので、
     *    外で作ると2回のやり取りになる。
     *    作った直後は取り出せない（変更が確定していない）ので、初回は
     *    アルバム無しで保存し、次回から入る。**初回だけアルバムに入らないのは
     *    承知のうえ。** 写真アプリの一覧には出るので、撮ったものは消えない。
     */
    private func findOrPrepareAlbum() -> PHAssetCollection? {
        let opts = PHFetchOptions()
        opts.predicate = NSPredicate(format: "title = %@", GalleryPlugin.album)

        let found = PHAssetCollection.fetchAssetCollections(
            with: .album, subtype: .albumRegular, options: opts)

        if let existing = found.firstObject { return existing }

        PHAssetCollectionChangeRequest.creationRequestForAssetCollection(
            withTitle: GalleryPlugin.album)
        return nil
    }
}
