import UIKit
import Capacitor

/**
 Capacitor の画面に、**このアプリ自前のプラグインを登録する**ための入れ物。

 ⚠️ **これが無いと GalleryPlugin.swift は動かない。**

 Capacitor 6 以降、iOS のプラグイン登録は `capacitor.config.json` の
 `packageClassList` に載っているものだけになった（`CapacitorBridge.registerPlugins()`）。
 **クラスを書いただけでは拾われない**（Objective-C ランタイムの走査は行われない）。

 そして `packageClassList` は `npx cap sync` が node_modules の中身から作り直すので、
 **手で足しても次の sync で消える**。アプリの中に置いた自前プラグインは、
 ここから明示的に登録するのが正しいやり方。

 `capacitorDidLoad()` はブリッジを作った直後、WebView を画面に載せる前に
 呼ばれる（`CAPBridgeViewController` の中）。登録はここで行う。

 ⚠️ **Main.storyboard の Custom Class もこれに向けること。**
    片方だけ直しても効かない（storyboard が `CAPBridgeViewController` を
    直接作ってしまい、この override が呼ばれない）。
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // 撮ったものを写真アプリへしまう係（GalleryPlugin.swift）。
        // JS 側は src/save.ts の registerPlugin('Gallery') で呼んでいる
        //
        // ⚠️ **registerPluginType ではなく registerPluginInstance を使うこと。**
        //    registerPluginType は中身が
        //      `if autoRegisterPlugins { return }`
        //    で始まっていて、**既定（自動登録が有効）のときは何もせずに戻る**。
        //    そうとは分からないまま静かに失敗し、保存だけが
        //    「"Gallery" plugin is not implemented on ios」で落ちる
        //    （2026-08-21 に実際にこれで一度つまずいた）。
        //
        //    registerPluginInstance にはその門番が無く、登録に加えて
        //    JSExport.exportJS まで走るので WebView 側にも見えるようになる。
        bridge?.registerPluginInstance(GalleryPlugin())
    }
}
