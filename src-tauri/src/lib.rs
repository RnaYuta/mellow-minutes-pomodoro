use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const TOGGLE_TIMER_SHORTCUT: &str = "CommandOrControl+Shift+M";
const TRAY_ID: &str = "mellow-minutes-tray";

#[cfg(target_os = "windows")]
const DIGIT_BITMAPS: [[u8; 5]; 10] = [
    [0b111, 0b101, 0b101, 0b101, 0b111],
    [0b010, 0b110, 0b010, 0b010, 0b111],
    [0b111, 0b001, 0b111, 0b100, 0b111],
    [0b111, 0b001, 0b111, 0b001, 0b111],
    [0b101, 0b101, 0b111, 0b001, 0b001],
    [0b111, 0b100, 0b111, 0b001, 0b111],
    [0b111, 0b100, 0b111, 0b101, 0b111],
    [0b111, 0b001, 0b001, 0b001, 0b001],
    [0b111, 0b101, 0b111, 0b101, 0b111],
    [0b111, 0b101, 0b111, 0b001, 0b111],
];

#[cfg(target_os = "windows")]
fn windows_minute_icon(minutes: u32) -> tauri::image::Image<'static> {
    const SIZE: usize = 32;
    let mut rgba = vec![0_u8; SIZE * SIZE * 4];

    for y in 2..30 {
        for x in 2..30 {
            let corner_dx = if x < 7 {
                7 - x
            } else if x > 24 {
                x - 24
            } else {
                0
            };
            let corner_dy = if y < 7 {
                7 - y
            } else if y > 24 {
                y - 24
            } else {
                0
            };
            if corner_dx * corner_dx + corner_dy * corner_dy > 25 {
                continue;
            }
            let border = x < 4 || x > 27 || y < 4 || y > 27;
            let color = if border {
                [245, 247, 250, 255]
            } else {
                [42, 48, 56, 255]
            };
            let offset = (y * SIZE + x) * 4;
            rgba[offset..offset + 4].copy_from_slice(&color);
        }
    }

    let text = minutes.clamp(0, 99).to_string();
    let scale = if text.len() == 1 { 4 } else { 3 };
    let glyph_width = 3 * scale;
    let spacing = scale;
    let total_width = text.len() * glyph_width + (text.len() - 1) * spacing;
    let start_x = (SIZE - total_width) / 2;
    let start_y = (SIZE - 5 * scale) / 2;

    for (digit_index, digit) in text.bytes().enumerate() {
        let bitmap = DIGIT_BITMAPS[(digit - b'0') as usize];
        for (row, bits) in bitmap.iter().enumerate() {
            for column in 0..3 {
                if bits & (1 << (2 - column)) == 0 {
                    continue;
                }
                for dy in 0..scale {
                    for dx in 0..scale {
                        let x =
                            start_x + digit_index * (glyph_width + spacing) + column * scale + dx;
                        let y = start_y + row * scale + dy;
                        let offset = (y * SIZE + x) * 4;
                        rgba[offset..offset + 4].copy_from_slice(&[255, 255, 255, 255]);
                    }
                }
            }
        }
    }

    tauri::image::Image::new_owned(rgba, SIZE as u32, SIZE as u32)
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn set_always_on_top(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    window
        .set_always_on_top(enabled)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn is_always_on_top(window: tauri::WebviewWindow) -> Result<bool, String> {
    window.is_always_on_top().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_simple_mode(window: tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    let (width, height) = if enabled {
        (320.0, 384.0)
    } else {
        (320.0, 540.0)
    };
    let (target_width, target_height) = if enabled {
        (320.0, 384.0)
    } else {
        (320.0, 540.0)
    };

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

/// Mirrors the countdown onto the macOS menu bar title or the Windows tray icon.
#[tauri::command]
fn set_tray_title(
    app: tauri::AppHandle,
    title: String,
    remaining_seconds: u32,
    is_idle: bool,
) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    let _ = (remaining_seconds, is_idle);

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        #[cfg(target_os = "macos")]
        tray.set_title(Some(title.clone()))
            .map_err(|error| error.to_string())?;

        #[cfg(target_os = "windows")]
        {
            let tooltip = if is_idle {
                "Mellow Pomodoro Timer".to_string()
            } else {
                format!("Mellow Pomodoro Timer · {title}")
            };
            tray.set_tooltip(Some(tooltip))
                .map_err(|error| error.to_string())?;

            let icon = if is_idle {
                tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
                    .map_err(|error| error.to_string())?
            } else {
                windows_minute_icon(remaining_seconds.div_ceil(60))
            };
            tray.set_icon(Some(icon))
                .map_err(|error| error.to_string())?;
        }
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
                        let native_window: &objc2_app_kit::NSWindow = &*webview.ns_window().cast();
                        native_window.setAspectRatio(objc2_foundation::NSSize::new(2.0, 3.0));
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
            let pin_item =
                CheckMenuItem::with_id(app, "pin", "항상 위에 표시", true, true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(
                app,
                "quit",
                "Mellow Pomodoro Timer 종료",
                true,
                None::<&str>,
            )?;
            let menu = Menu::with_items(app, &[&show_item, &pin_item, &separator, &quit_item])?;
            let pin_item_for_menu = pin_item.clone();
            let tray_icon =
                tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?;

            let tray_builder = TrayIconBuilder::with_id(TRAY_ID)
                .tooltip("Mellow Pomodoro Timer")
                .icon(tray_icon)
                .menu(&menu)
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
                });

            #[cfg(target_os = "macos")]
            let tray_builder = tray_builder
                .icon_as_template(true)
                .show_menu_on_left_click(true);

            #[cfg(target_os = "windows")]
            let tray_builder = tray_builder.show_menu_on_left_click(false);

            tray_builder.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Mellow Pomodoro Timer");
}
