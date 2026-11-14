pub mod commands;
pub mod db;
pub mod engagements;
pub mod error;
pub mod keys;
pub mod scope;
pub mod settings;
pub mod supervisor;
pub mod tools;

use commands::{engagement, scope as scope_cmd, settings as settings_cmd, tools as tool_cmd, AppState};
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let root = db::default_data_dir(app.path().data_dir()?);
            let store = engagements::Store::open(&root)?;
            // ENG-08: reopen the last engagement.
            let mut active = None;
            if let Some(id) = store.last_engagement()? {
                if let Ok((e, edb)) = store.open_engagement(&id) {
                    commands::set_title(app.handle(), Some(&e.name));
                    active = Some(edb);
                }
            }
            app.manage(AppState { store: Mutex::new(store), active: Mutex::new(active) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tool_cmd::tools_status,
            tool_cmd::tool_version_stream,
            engagement::engagement_list,
            engagement::engagement_active,
            engagement::engagement_create,
            engagement::engagement_open,
            engagement::engagement_update,
            engagement::engagement_delete,
            scope_cmd::scope_list,
            scope_cmd::scope_parse_preview,
            scope_cmd::scope_apply,
            scope_cmd::scope_delete,
            scope_cmd::scope_test,
            scope_cmd::scope_import,
            settings_cmd::settings_get,
            settings_cmd::settings_set,
            settings_cmd::onboarding_done,
            settings_cmd::onboarding_complete,
            settings_cmd::keys_list,
            settings_cmd::keys_set,
            settings_cmd::keys_delete,
            settings_cmd::data_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running Reconio");
}
