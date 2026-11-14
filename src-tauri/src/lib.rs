pub mod commands;
pub mod supervisor;
pub mod tools;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::tools_status,
            commands::tool_version_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running Reconio");
}
