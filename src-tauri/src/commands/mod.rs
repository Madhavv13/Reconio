//! Typed IPC commands (PRD §9.4). The webview never passes raw arguments to a tool;
//! it names an action and the core builds the arguments itself (§9.2).

pub mod engagement;
pub mod scope;
pub mod settings;
pub mod tools;

use crate::engagements::{EngagementDb, Store};
use crate::error::{AppError, AppResult, ErrorCode};
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager};

/// App-wide state. Lock order is always `store`, then `active`.
pub struct AppState {
    pub store: Mutex<Store>,
    /// The open engagement's database: one writer per database (§9.2).
    pub active: Mutex<Option<EngagementDb>>,
}

impl AppState {
    pub fn store(&self) -> MutexGuard<'_, Store> {
        self.store.lock().unwrap_or_else(|p| p.into_inner())
    }
    pub fn active(&self) -> MutexGuard<'_, Option<EngagementDb>> {
        self.active.lock().unwrap_or_else(|p| p.into_inner())
    }
}

pub fn no_engagement() -> AppError {
    AppError::new(ErrorCode::NoEngagement, "Open or create an engagement first.")
}

/// ENG-02: the window title is `<engagement> — Reconio`.
pub fn set_title(app: &AppHandle, engagement: Option<&str>) {
    if let Some(w) = app.get_webview_window("main") {
        let title = match engagement {
            Some(n) => format!("{n} — Reconio"),
            None => "Reconio".to_string(),
        };
        let _ = w.set_title(&title);
    }
}

pub type Result<T> = AppResult<T>;
