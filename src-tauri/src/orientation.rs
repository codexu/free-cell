#[cfg(target_os = "ios")]
static LANDSCAPE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[cfg(target_os = "ios")]
pub fn apply_ios(platform: tauri::webview::PlatformWebview, landscape: bool) -> Result<(), String> {
    use objc2::{msg_send, sel, runtime::{AnyClass, AnyObject, Bool, ClassBuilder, Sel}};
    use objc2_ui_kit::UIView;
    use std::sync::atomic::Ordering;
    unsafe {
        let view = &*platform.inner().cast::<UIView>();
        let window = view.window().ok_or("No iOS window")?;
        let controller_ptr = platform.view_controller().cast::<AnyObject>();
        if controller_ptr.is_null() { return Err("No iOS view controller".into()); }
        let controller = &*controller_ptr;
        LANDSCAPE.store(landscape, Ordering::Relaxed);
        extern "C" fn mask(_: *mut AnyObject, _: Sel) -> usize {
            if LANDSCAPE.load(Ordering::Relaxed) { (1 << 3) | (1 << 4) } else { 1 << 1 }
        }
        extern "C" fn preferred(_: *mut AnyObject, _: Sel) -> isize {
            if LANDSCAPE.load(Ordering::Relaxed) { 3 } else { 1 }
        }
        extern "C" fn autorotate(_: *mut AnyObject, _: Sel) -> Bool { Bool::YES }
        extern "C" fn hide_system_ui(_: *mut AnyObject, _: Sel) -> Bool {
            Bool::new(LANDSCAPE.load(Ordering::Relaxed))
        }
        extern "C" fn status_style(_: *mut AnyObject, _: Sel) -> isize { 1 }
        static CLASS: std::sync::OnceLock<&'static AnyClass> = std::sync::OnceLock::new();
        let class = CLASS.get_or_init(|| {
            let mut builder = ClassBuilder::new(c"FreeCellOrientationController", controller.class()).expect("orientation controller subclass");
            builder.add_method(sel!(supportedInterfaceOrientations), mask as extern "C" fn(*mut AnyObject, Sel) -> usize);
            builder.add_method(sel!(preferredInterfaceOrientationForPresentation), preferred as extern "C" fn(*mut AnyObject, Sel) -> isize);
            builder.add_method(sel!(shouldAutorotate), autorotate as extern "C" fn(*mut AnyObject, Sel) -> Bool);
            builder.add_method(sel!(prefersStatusBarHidden), hide_system_ui as extern "C" fn(*mut AnyObject, Sel) -> Bool);
            builder.add_method(sel!(prefersHomeIndicatorAutoHidden), hide_system_ui as extern "C" fn(*mut AnyObject, Sel) -> Bool);
            builder.add_method(sel!(preferredStatusBarStyle), status_style as extern "C" fn(*mut AnyObject, Sel) -> isize);
            builder.register()
        });
        AnyObject::set_class(controller, class);
        let _: () = msg_send![controller, setNeedsStatusBarAppearanceUpdate];
        let _: () = msg_send![controller, setNeedsUpdateOfHomeIndicatorAutoHidden];
        // iOS 16+: update the allowed mask before requesting scene rotation.
        let modern: Bool = msg_send![controller, respondsToSelector: sel!(setNeedsUpdateOfSupportedInterfaceOrientations)];
        if modern.as_bool() {
            let _: () = msg_send![controller, setNeedsUpdateOfSupportedInterfaceOrientations];
            let scene: Option<objc2::rc::Retained<AnyObject>> = msg_send![&*window, windowScene];
            let scene = scene.ok_or("No iOS window scene")?;
            let geometry_class = AnyClass::get(c"UIWindowSceneGeometryPreferencesIOS").ok_or("No iOS geometry preferences")?;
            let preferences: objc2::rc::Allocated<AnyObject> = msg_send![geometry_class, alloc];
            let preferences: objc2::rc::Retained<AnyObject> = msg_send![preferences, initWithInterfaceOrientations: mask(std::ptr::null_mut(), sel!(supportedInterfaceOrientations))];
            let _: () = msg_send![&*scene, requestGeometryUpdateWithPreferences: &*preferences, errorHandler: std::ptr::null::<AnyObject>()];
        } else {
            // iOS 15 respects the new controller mask. CSS supplies the same
            // forced landscape presentation if the OS defers the rotation.
            let _: () = msg_send![controller.class(), attemptRotationToDeviceOrientation];
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn set_screen_orientation(window: tauri::WebviewWindow, landscape: bool) -> Result<(), String> {
    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        let (sender, receiver) = std::sync::mpsc::channel();
        window.with_webview(move |platform| {
            #[cfg(target_os = "ios")]
            let _ = sender.send(apply_ios(platform, landscape));
            #[cfg(target_os = "android")]
            platform.jni_handle().exec(move |env, activity, _| {
                // ActivityInfo: SENSOR_LANDSCAPE = 6, PORTRAIT = 1.
                let orientation: i32 = if landscape { 6 } else { 1 };
                let result = env.call_method(activity, "setGameOrientation", "(I)V", &[orientation.into()])
                    .map(|_| ()).map_err(|error| error.to_string());
                let _ = sender.send(result);
            });
        }).map_err(|error| error.to_string())?;
        return tauri::async_runtime::spawn_blocking(move || {
            receiver.recv_timeout(std::time::Duration::from_secs(5)).map_err(|error| error.to_string())?
        }).await.map_err(|error| error.to_string())?;
    }
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    { let _ = (window, landscape); Ok(()) }
}
