use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const TOGGLE_TIMER_SHORTCUT: &str = "CommandOrControl+Shift+M";

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn set_always_on_top(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    window.set_always_on_top(enabled).map_err(|error| error.to_string())
}

#[tauri::command]
fn is_always_on_top(window: tauri::WebviewWindow) -> Result<bool, String> {
    window.is_always_on_top().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_simple_mode(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    let (width, height) = if enabled { (320.0, 384.0) } else { (320.0, 540.0) };
    let (target_width, target_height) = if enabled { (320.0, 384.0) } else { (320.0, 540.0) };

    window
        .set_resizable(false)
        .map_err(|error| error.to_string())?;

    window
        .set_min_size(Some(tauri::LogicalSize::new(width, height)))
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    window
        .with_webview(move |webview| unsafe {
            let native_window: &objc2_app_kit::NSWindow = &*webview.ns_window().cast();
            let ratio = if enabled {
                objc2_foundation::NSSize::new(5.0, 6.0)
            } else {
                objc2_foundation::NSSize::new(16.0, 27.0)
            };
            native_window.setAspectRatio(ratio);
        })
        .map_err(|error| error.to_string())?;

    window
        .set_size(tauri::LogicalSize::new(target_width, target_height))
        .map_err(|error| error.to_string())
}

/// Mirrors the running countdown onto the menu bar tray icon so it's readable without
/// opening the window.
#[tauri::command]
fn set_tray_title(app: tauri::AppHandle, title: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("mellow-minutes-tray") {
        tray.set_title(Some(title)).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            set_always_on_top,
            is_always_on_top,
            set_simple_mode,
            set_tray_title
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);

                if let Some(window) = app.get_webview_window("main") {
                    window.with_webview(|webview| unsafe {
                        let native_window: &objc2_app_kit::NSWindow =
                            &*webview.ns_window().cast();
                        native_window.setAspectRatio(
                            objc2_foundation::NSSize::new(2.0, 3.0),
                        );
                    })?;
                }
            }

            // Global hotkey to start/pause the timer without switching to the app.
            app.global_shortcut()
                .on_shortcut(TOGGLE_TIMER_SHORTCUT, |app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("toggle-timer", ());
                    }
                })?;

            let show_item = MenuItem::with_id(app, "show", "타이머 열기", true, None::<&str>)?;
            let pin_item = CheckMenuItem::with_id(
                app,
                "pin",
                "항상 위에 표시",
                true,
                true,
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Mellow Minutes 종료", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &pin_item, &separator, &quit_item])?;
            let pin_item_for_menu = pin_item.clone();
            let tray_icon = tauri::image::Image::from_bytes(include_bytes!(
                "../icons/tray-icon.png"
            ))?;

            TrayIconBuilder::with_id("mellow-minutes-tray")
                .tooltip("Mellow Minutes")
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "pin" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let next_value = !window.is_always_on_top().unwrap_or(true);
                            let _ = window.set_always_on_top(next_value);
                            let _ = pin_item_for_menu.set_checked(next_value);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Mellow Minutes");
}
