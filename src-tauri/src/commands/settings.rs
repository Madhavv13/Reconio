//! Settings, API keys, onboarding and data-folder commands (SET-01 to SET-09, ONB-01).

use super::{AppState, Result};
use crate::engagements::folder_size;
use crate::keys::{self, KeyStatus};
use crate::settings::Settings;
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> Result<Settings> {
    state.store().settings()
}

#[tauri::command]
pub fn settings_set(state: State<'_, AppState>, settings: Settings) -> Result<Settings> {
    state.store().save_settings(settings)
}

/// ONB-01: onboarding shows until it is completed once.
#[tauri::command]
pub fn onboarding_done(state: State<'_, AppState>) -> Result<bool> {
    Ok(state.store().setting("onboarding_done")?.is_some())
}

#[tauri::command]
pub fn onboarding_complete(state: State<'_, AppState>) -> Result<()> {
    state.store().set_setting("onboarding_done", &crate::db::now().to_string())
}

#[tauri::command]
pub fn keys_list() -> Result<Vec<KeyStatus>> {
    keys::list()
}

#[tauri::command]
pub fn keys_set(source: String, value: String) -> Result<KeyStatus> {
    keys::set(&source, &value)
}

#[tauri::command]
pub fn keys_delete(source: String) -> Result<()> {
    keys::delete(&source)
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct EngagementStorage {
    pub id: String,
    pub name: String,
    #[ts(type = "number")]
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct DataInfo {
    pub folder: String,
    pub engagements: Vec<EngagementStorage>,
}

/// SET-07: the data folder and the storage each engagement uses.
#[tauri::command]
pub fn data_info(state: State<'_, AppState>) -> Result<DataInfo> {
    let store = state.store();
    let engagements = store
        .list()?
        .into_iter()
        .map(|e| EngagementStorage { size_bytes: folder_size(&store.folder(&e.id)), id: e.id, name: e.name })
        .collect();
    Ok(DataInfo { folder: store.root().display().to_string(), engagements })
}
