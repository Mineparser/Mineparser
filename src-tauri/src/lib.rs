// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::sync::Mutex;
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, Position, Size, WebviewWindow};

#[derive(Default)]
struct TargetWindow(Mutex<Option<isize>>);

#[cfg(windows)]
fn foreground_window() -> Option<isize> {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    let hwnd = unsafe { GetForegroundWindow() };
    (!hwnd.0.is_null()).then_some(hwnd.0 as isize)
}

#[tauri::command]
fn prepare_show(window: WebviewWindow, state: tauri::State<'_, TargetWindow>) -> Result<(), String> {
    #[cfg(windows)]
    if let Ok(mut target) = state.0.lock() {
        *target = foreground_window();
    }
    window.set_fullscreen(true).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn prepare_show_from_marker(window: WebviewWindow) -> Result<(), String> {
    window.set_fullscreen(true).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn collapse_marker(window: WebviewWindow) -> Result<(), String> {
    window.set_fullscreen(false).map_err(|e| e.to_string())?;
    window.set_size(Size::Logical(LogicalSize::new(64.0, 32.0))).map_err(|e| e.to_string())?;
    window.set_position(Position::Logical(LogicalPosition::new(16.0, 16.0))).map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())
}

#[tauri::command]
fn paste_to_previous_window(window: WebviewWindow, state: tauri::State<'_, TargetWindow>) -> Result<(), String> {
    collapse_marker(window.clone())?;
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Input::KeyboardAndMouse::{SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY, VK_CONTROL, VK_V};
        use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
        let hwnd_value = state.0.lock().map_err(|_| "target window lock failed")?.clone();
        if let Some(value) = hwnd_value {
            let focused = unsafe { SetForegroundWindow(HWND(value as *mut _)).as_bool() };
            if !focused { return Err("呼び出し元ウィンドウへフォーカスを戻せませんでした".into()); }
            let inputs = [
                INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(VK_CONTROL.0), ..Default::default() } } },
                INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(VK_V.0), ..Default::default() } } },
                INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(VK_V.0), dwFlags: KEYEVENTF_KEYUP, ..Default::default() } } },
                INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(VK_CONTROL.0), dwFlags: KEYEVENTF_KEYUP, ..Default::default() } } },
            ];
            unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32); }
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TargetWindow::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
                let shortcut: Shortcut = "Ctrl+Shift+Space".parse().map_err(|e| format!("shortcut: {e}"))?;
                let handle = app.handle().clone();
                app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if matches!(event.state, ShortcutState::Pressed) {
                        if let Some(window) = handle.get_webview_window("main") {
                            let _ = prepare_show(window, handle.state::<TargetWindow>());
                            let _ = handle.emit("mineparser:expanded", ());
                        }
                    }
                })?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![prepare_show, prepare_show_from_marker, collapse_marker, paste_to_previous_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
