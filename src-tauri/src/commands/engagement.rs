//! Engagement commands (ENG-01 to ENG-06).

use super::{no_engagement, set_title, AppState, Result};
use crate::engagements::{folder_size, Attestation, Engagement, EngagementDb, NewEngagement, Store};
use serde::Serialize;
use tauri::{AppHandle, State};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct ActiveEngagement {
    pub engagement: Engagement,
    pub attestation: Option<Attestation>,
    /// The engagement's folder on disk, and its size (Engagement settings, Storage).
    pub folder: String,
    #[ts(type = "number")]
    pub size_bytes: u64,
    /// Number of scope rules, for the sidebar count.
    pub rule_count: u32,
}

fn view(store: &Store, engagement: Engagement, edb: &EngagementDb) -> Result<ActiveEngagement> {
    let folder = store.folder(&engagement.id);
    Ok(ActiveEngagement {
        attestation: edb.attestation()?,
        size_bytes: folder_size(&folder),
        rule_count: edb.scope_list()?.len() as u32,
        folder: folder.display().to_string(),
        engagement,
    })
}

fn open(app: &AppHandle, state: &AppState, id: &str) -> Result<ActiveEngagement> {
    let store = state.store();
    let mut active = state.active();
    // Close the current database before opening the next one.
    *active = None;
    let (engagement, edb) = store.open_engagement(id)?;
    set_title(app, Some(&engagement.name));
    let v = view(&store, engagement, &edb)?;
    *active = Some(edb);
    Ok(v)
}

#[tauri::command]
pub fn engagement_list(state: State<'_, AppState>) -> Result<Vec<Engagement>> {
    state.store().list()
}

#[tauri::command]
pub fn engagement_active(state: State<'_, AppState>) -> Result<Option<ActiveEngagement>> {
    let store = state.store();
    let active = state.active();
    let Some(edb) = active.as_ref() else { return Ok(None) };
    Ok(Some(view(&store, store.get(&edb.id)?, edb)?))
}

#[tauri::command]
pub fn engagement_create(app: AppHandle, state: State<'_, AppState>, input: NewEngagement) -> Result<ActiveEngagement> {
    let created = state.store().create(input)?;
    open(&app, &state, &created.id)
}

#[tauri::command]
pub fn engagement_open(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<ActiveEngagement> {
    open(&app, &state, &id)
}

#[tauri::command]
pub fn engagement_update(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    name: String,
    client: Option<String>,
    notes: Option<String>,
) -> Result<Engagement> {
    let store = state.store();
    let e = store.update(&id, &name, client, notes)?;
    if state.active().as_ref().is_some_and(|a| a.id == id) {
        set_title(&app, Some(&e.name));
    }
    Ok(e)
}

/// ENG-06. Closes the engagement first if it is open, so its files can be removed.
#[tauri::command]
pub fn engagement_delete(app: AppHandle, state: State<'_, AppState>, id: String, typed_name: String) -> Result<()> {
    let store = state.store();
    let mut active = state.active();
    let was_active = active.as_ref().is_some_and(|a| a.id == id);
    if was_active {
        *active = None;
    }
    if let Err(e) = store.delete(&id, &typed_name) {
        if was_active {
            // Nothing was deleted: reopen it.
            if let Ok((_, edb)) = store.open_engagement(&id) {
                *active = Some(edb);
            }
        }
        return Err(e);
    }
    if was_active {
        set_title(&app, None);
    }
    Ok(())
}

/// The active engagement's id, for commands that need one.
pub fn require_active(state: &AppState) -> Result<String> {
    state.active().as_ref().map(|e| e.id.clone()).ok_or_else(no_engagement)
}
