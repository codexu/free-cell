mod orientation;

#[cfg(target_os = "ios")]
fn fit_ios_webview(platform: tauri::webview::PlatformWebview) {
    unsafe {
        use objc2::{msg_send, sel, rc::Retained, runtime::{AnyClass, AnyObject, ClassBuilder, Sel}};
        use objc2_ui_kit::{
            UIEdgeInsets, UIScrollView, UIScrollViewContentInsetAdjustmentBehavior, UIView,
            UIViewAutoresizing,
        };

        // WKWebView inherits UIView; Tauri runs this closure on the UI thread.
        let view = &*platform.inner().cast::<UIView>();
        if view.window().is_some() {
            // Keep safe-area padding in CSS while preventing older WebKit from
            // subtracting those same insets from the layout viewport.
            static CLASS: std::sync::OnceLock<&'static AnyClass> = std::sync::OnceLock::new();
            extern "C" fn no_insets(_: *mut AnyObject, _: Sel) -> UIEdgeInsets {
                UIEdgeInsets { top: 0.0, left: 0.0, bottom: 0.0, right: 0.0 }
            }
            let object = &*platform.inner().cast::<AnyObject>();
            let class = CLASS.get_or_init(|| {
                let mut builder = ClassBuilder::new(c"FreeCellEdgeToEdgeWebView", object.class()).expect("webview subclass");
                builder.add_method(sel!(safeAreaInsets), no_insets as extern "C" fn(*mut AnyObject, Sel) -> UIEdgeInsets);
                builder.register()
            });
            AnyObject::set_class(object, class);
            view.safeAreaInsetsDidChange();

        }
        if let Some(parent) = view.superview() {
            // On older iOS the parent can itself be sized to the safe area.
            // Use the actual UIWindow extent; CSS owns safe-area padding.
            let bounds = view.window().map(|window| window.bounds()).unwrap_or_else(|| parent.bounds());
            parent.setFrame(bounds);
            parent.setClipsToBounds(false);
            view.setFrame(bounds);
            view.setAutoresizingMask(
                UIViewAutoresizing::FlexibleWidth | UIViewAutoresizing::FlexibleHeight,
            );
        }
        let scroll: Retained<UIScrollView> = msg_send![view, scrollView];
        static SCROLL_CLASS: std::sync::OnceLock<&'static AnyClass> = std::sync::OnceLock::new();
        extern "C" fn no_scroll_insets(_: *mut AnyObject, _: Sel) -> UIEdgeInsets {
            UIEdgeInsets { top: 0.0, left: 0.0, bottom: 0.0, right: 0.0 }
        }
        let scroll_object = &*(&*scroll as *const UIScrollView).cast::<AnyObject>();
        let scroll_class = SCROLL_CLASS.get_or_init(|| {
            let mut builder = ClassBuilder::new(c"FreeCellEdgeToEdgeScrollView", scroll_object.class()).expect("scrollview subclass");
            builder.add_method(sel!(safeAreaInsets), no_scroll_insets as extern "C" fn(*mut AnyObject, Sel) -> UIEdgeInsets);
            builder.register()
        });
        AnyObject::set_class(scroll_object, scroll_class);
        scroll.setContentInsetAdjustmentBehavior(UIScrollViewContentInsetAdjustmentBehavior::Never);
        scroll.setContentInset(UIEdgeInsets { top: 0.0, left: 0.0, bottom: 0.0, right: 0.0 });
        scroll.setAutomaticallyAdjustsScrollIndicatorInsets(false);
        scroll.setFrame(view.bounds());
        scroll.safeAreaInsetsDidChange();
        view.setNeedsLayout();
        view.layoutIfNeeded();
        publish_ios_safe_area(&platform);
    }
}

#[cfg(target_os = "ios")]
fn publish_ios_safe_area(platform: &tauri::webview::PlatformWebview) {
    use objc2::msg_send;
    use objc2_foundation::NSString;
    use objc2_ui_kit::UIView;
    unsafe {
        let view = &*platform.inner().cast::<UIView>();
        if let Some(window) = view.window() {
            // Read UIWindow, not the WebView whose safeAreaInsets are overridden.
            let safe = window.safeAreaInsets();
            let cutout = safe.top.max(safe.left).max(safe.right);
            let script = NSString::from_str(&format!(
                "(() => {{ const style = document.documentElement.style; style.setProperty('--native-safe-top','{}px'); style.setProperty('--native-safe-bottom','{}px'); style.setProperty('--native-safe-left','{}px'); style.setProperty('--native-safe-right','{}px'); const cutout = Math.max(parseFloat(style.getPropertyValue('--device-cutout-inset')) || 0, {}); style.setProperty('--device-cutout-inset', cutout + 'px'); }})();",
                safe.top, safe.bottom, safe.left, safe.right, cutout
            ));
            let _: () = msg_send![view, evaluateJavaScript: &*script, completionHandler: std::ptr::null::<objc2::runtime::AnyObject>()];
        }
    }
}

#[tauri::command]
fn refresh_safe_area(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    return window.with_webview(|platform| publish_ios_safe_area(&platform)).map_err(|error| error.to_string());
    #[cfg(target_os = "android")]
    return window.with_webview(|platform| {
        platform.jni_handle().exec(|env, activity, _| {
            if let Err(error) = env.call_method(activity, "refreshGameSafeArea", "()V", &[]) {
                eprintln!("Unable to refresh Android safe area: {error}");
            }
        });
    }).map_err(|error| error.to_string());
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    { let _ = window; Ok(()) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![orientation::set_screen_orientation, refresh_safe_area])
        .setup(|_app| {
            #[cfg(mobile)]
            _app.handle().plugin(tauri_plugin_haptics::init())?;
            Ok(())
        })
        .on_page_load(|_webview, _payload| {
            #[cfg(target_os = "ios")]
            {
                let _ = _webview.with_webview(fit_ios_webview);
            }
        })
        .on_window_event(|_window, _event| {
            #[cfg(target_os = "ios")]
            if matches!(_event, tauri::WindowEvent::Resized(_)) {
                use tauri::Manager;
                if let Some(webview) = _window.get_webview_window(_window.label()) {
                    let _ = webview.with_webview(fit_ios_webview);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running FreeCell");
}

