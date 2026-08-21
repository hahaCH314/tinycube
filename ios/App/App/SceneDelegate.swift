import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // ⚠️ **ここは MainViewController でなければならない。**
        //    素の CAPBridgeViewController に戻すと、自前の GalleryPlugin が
        //    登録されず、保存が「Gallery plugin is not implemented on ios」で
        //    失敗して共有シートに落ちる（2026-08-21 に実際にそうなった）。
        //
        //    Main.storyboard の Custom Class も MainViewController に向けてあるが、
        //    **画面を実際に作っているのはこの行**で、storyboard は使われていない。
        //    storyboard だけ直しても効かないので注意。
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
