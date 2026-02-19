// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_mac_address() -> Option<String> {
    mac_address::get_mac_address()
        .ok()
        .flatten()
        .map(|m| m.to_string())
}

#[cfg(target_os = "windows")]
fn set_windows_app_user_model_id() {
    use std::{ffi::OsStr, iter::once, os::windows::ffi::OsStrExt};
    use windows_sys::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

    let app_id: Vec<u16> = OsStr::new("com.piksel.chat")
        .encode_wide()
        .chain(once(0))
        .collect();
    unsafe {
        let _ = SetCurrentProcessExplicitAppUserModelID(app_id.as_ptr());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_| {
            #[cfg(target_os = "windows")]
            set_windows_app_user_model_id();
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![greet, get_mac_address])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
