//! Typed IPC commands (PRD §9.4). The webview never passes raw arguments to a tool;
//! it names an action and the core builds the arguments itself (§9.2).

use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter};
use ts_rs::TS;

use crate::supervisor::{self, ToolLine};
use crate::tools::{self, Tool, ToolStatus};

pub const EVT_TOOL_LINES: &str = "tool:lines";
pub const EVT_TOOL_EXIT: &str = "tool:exit";

#[derive(Clone, Serialize, TS)]
#[ts(export)]
pub struct ToolLinesEvent {
    pub job: String,
    pub lines: Vec<ToolLine>,
}

#[derive(Clone, Serialize, TS)]
#[ts(export)]
pub struct ToolExitEvent {
    pub job: String,
    pub code: Option<i32>,
    pub error: Option<String>,
}

/// The tool check (ONB-02) for every bundled tool.
#[tauri::command]
pub async fn tools_status() -> Vec<ToolStatus> {
    tools::check_all().await
}

/// Runs `<tool> -version` through the supervisor and streams its output as events.
/// Returns the job id the events carry. Module 0 spike for the streaming path.
#[tauri::command]
pub fn tool_version_stream(app: AppHandle, tool: Tool) -> String {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    let job = format!("{}-{}", tool.name(), NEXT.fetch_add(1, Ordering::Relaxed));
    let id = job.clone();
    tauri::async_runtime::spawn(async move {
        let emit_app = app.clone();
        let emit_id = id.clone();
        let result = supervisor::stream(&tools::resolve_path(tool), &["-version".into()], move |lines| {
            let _ = emit_app.emit(EVT_TOOL_LINES, ToolLinesEvent { job: emit_id.clone(), lines });
        })
        .await;
        let (code, error) = match result {
            Ok(c) => (c, None),
            Err(e) => (None, Some(e.to_string())),
        };
        let _ = app.emit(EVT_TOOL_EXIT, ToolExitEvent { job: id, code, error });
    });
    job
}
