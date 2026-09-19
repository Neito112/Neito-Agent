use tauri::{
    menu::MenuBuilder,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

#[tauri::command]
fn open_dashboard(app: tauri::AppHandle) {
    if let Some(dash) = app.get_webview_window("dashboard") {
        let _ = dash.show();
        let _ = dash.unminimize();
        let _ = dash.set_focus();
    } else {
        let _ = WebviewWindowBuilder::new(&app, "dashboard", WebviewUrl::App("dashboard.html".into()))
            .title("Neito Agent - Tactical Dashboard")
            .inner_size(1000.0, 720.0)
            .resizable(true)
            .decorations(false)
            .center()
            .build();
    }
}

#[tauri::command]
fn minimize_window(window: tauri::WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
fn maximize_window(window: tauri::WebviewWindow) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn close_window(window: tauri::WebviewWindow) {
    let _ = window.hide();
}

#[tauri::command]
fn start_drag(window: tauri::WebviewWindow) {
    let _ = window.start_dragging();
}

#[tauri::command]
fn move_window_by(window: tauri::WebviewWindow, delta_x: f64, delta_y: f64) {
    if let Ok(pos) = window.outer_position() {
        let scale = window.scale_factor().unwrap_or(1.0);
        let new_x = pos.x + (delta_x * scale).round() as i32;
        let new_y = pos.y + (delta_y * scale).round() as i32;
        let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(new_x, new_y)));
    }
}

#[tauri::command]
fn reset_pet_position(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = win.primary_monitor() {
            let size = monitor.size();
            let scale = monitor.scale_factor();
            let screen_w = size.width as f64 / scale;
            let screen_h = size.height as f64 / scale;
            let x = (screen_w - 340.0 - 20.0).max(0.0);
            let y = (screen_h - 460.0 - 48.0).max(0.0);
            let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    }
}

#[tauri::command]
fn trigger_ghost_pointer(app: tauri::AppHandle, target_x: f64, target_y: f64) {
    std::thread::spawn(move || {
        let (start_x, start_y) = if let Some(main_win) = app.get_webview_window("main") {
            if let Ok(pos) = main_win.outer_position() {
                (pos.x as f64 + 100.0, pos.y as f64 + 100.0)
            } else {
                (target_x, target_y)
            }
        } else {
            (target_x, target_y)
        };

        let ghost_win = if let Some(win) = app.get_webview_window("ghost") {
            win
        } else {
            match WebviewWindowBuilder::new(&app, "ghost", WebviewUrl::App("ghost.html".into()))
                .title("Ghost Pointer")
                .inner_size(80.0, 80.0)
                .resizable(false)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .build()
            {
                Ok(w) => {
                    let _ = w.set_ignore_cursor_events(true);
                    w
                }
                Err(_) => return,
            }
        };

        let _ = ghost_win.set_ignore_cursor_events(true);
        let _ = ghost_win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(start_x, start_y)));
        let _ = ghost_win.show();

        let steps = 30;
        for i in 1..=steps {
            let t = i as f64 / steps as f64;
            let ease = 1.0 - (1.0 - t).powi(3);
            let cur_x = start_x + (target_x - 40.0 - start_x) * ease;
            let cur_y = start_y + (target_y - 40.0 - start_y) * ease;
            let _ = ghost_win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(cur_x, cur_y)));
            std::thread::sleep(std::time::Duration::from_millis(20));
        }

        std::thread::sleep(std::time::Duration::from_millis(2500));

        for i in 1..=steps {
            let t = i as f64 / steps as f64;
            let ease = 1.0 - (1.0 - t).powi(3);
            let cur_x = (target_x - 40.0) + (start_x - (target_x - 40.0)) * ease;
            let cur_y = (target_y - 40.0) + (start_y - (target_y - 40.0)) * ease;
            let _ = ghost_win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(cur_x, cur_y)));
            std::thread::sleep(std::time::Duration::from_millis(20));
        }

        let _ = ghost_win.hide();
    });
}

#[tauri::command]
fn glide_pet_to(app: tauri::AppHandle, target_x: f64, target_y: f64, duration_ms: Option<u64>, return_after_ms: Option<u64>) {
    std::thread::spawn(move || {
        if let Some(main_win) = app.get_webview_window("main") {
            let (start_x, start_y) = if let Ok(pos) = main_win.outer_position() {
                let scale = main_win.scale_factor().unwrap_or(1.0);
                (pos.x as f64 / scale, pos.y as f64 / scale)
            } else {
                return;
            };

            let dur = duration_ms.unwrap_or(600);
            let steps = (dur / 16).max(10) as usize;
            
            // Bay den vi tri chu y (offset -120px de khong che khuat diem can xem)
            let dest_x = (target_x - 120.0).max(0.0);
            let dest_y = (target_y - 120.0).max(0.0);

            for i in 1..=steps {
                let t = i as f64 / steps as f64;
                let ease = 1.0 - (1.0 - t).powi(3);
                let cur_x = start_x + (dest_x - start_x) * ease;
                let cur_y = start_y + (dest_y - start_y) * ease;
                let _ = main_win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(cur_x, cur_y)));
                std::thread::sleep(std::time::Duration::from_millis(16));
            }

            // Dung tai vi tri chu y de huong dan
            let hold_ms = return_after_ms.unwrap_or(3500);
            if hold_ms > 0 {
                std::thread::sleep(std::time::Duration::from_millis(hold_ms));

                // Luot tro ve vi tri ban dau
                for i in 1..=steps {
                    let t = i as f64 / steps as f64;
                    let ease = 1.0 - (1.0 - t).powi(3);
                    let cur_x = dest_x + (start_x - dest_x) * ease;
                    let cur_y = dest_y + (start_y - dest_y) * ease;
                    let _ = main_win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(cur_x, cur_y)));
                    std::thread::sleep(std::time::Duration::from_millis(16));
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Ok(Some(monitor)) = app.primary_monitor() {
                let size = monitor.size();
                let scale = monitor.scale_factor();
                let screen_w = size.width as f64 / scale;
                let screen_h = size.height as f64 / scale;
                let win_w = 340.0;
                let win_h = 460.0;
                let x = (screen_w - win_w - 20.0).max(0.0);
                let y = (screen_h - win_h - 48.0).max(0.0);
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)));
                    let _ = win.show();
                    let _ = win.unminimize();
                }
            }

            let menu = MenuBuilder::new(app)
                .text("dash", "📊 Mở Dashboard")
                .text("toggle", "👁️ Hiện / Ẩn Pet")
                .text("reset_pos", "🔄 Đặt lại vị trí Pet")
                .separator()
                .text("quit", "🚪 Thoát Neito Agent")
                .build()?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Neito Agent (Click mở Dashboard, Chuột phải menu)")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "dash" => open_dashboard(app.clone()),
                        "toggle" => {
                            if let Some(win) = app.get_webview_window("main") {
                                if let Ok(vis) = win.is_visible() {
                                    if vis { let _ = win.hide(); } else { let _ = win.show(); }
                                }
                            }
                        }
                        "reset_pos" => reset_pet_position(app.clone()),
                        "quit" => app.exit(0),
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        open_dashboard(app.clone());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            if let Err(e) = tray_builder.build(app) {
                eprintln!("[Neito Agent] Canh bao tao tray icon: {}", e);
            }

            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_dashboard,
            minimize_window,
            maximize_window,
            close_window,
            start_drag,
            trigger_ghost_pointer,
            move_window_by,
            reset_pet_position,
            glide_pet_to
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
