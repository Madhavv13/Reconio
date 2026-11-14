//! The error every command returns. `code` is stable for the UI to branch on;
//! `message` is written for the user: the cause and, where there is one, the fix.

use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ErrorCode {
    Db,
    Io,
    NotFound,
    NoEngagement,
    NameTaken,
    Invalid,
    /// ENG-03: adding in-scope rules needs the authorization confirmed again.
    AttestationRequired,
    ConfirmMismatch,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> AppError {
        AppError { code, message: message.into() }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for AppError {}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::new(ErrorCode::Db, format!("Database error: {e}"))
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::new(ErrorCode::Io, format!("File error: {e}"))
    }
}
