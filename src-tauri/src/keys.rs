//! API keys for subfinder's passive sources (SET-01). Keys live only in the OS keychain
//! (Windows Credential Manager, macOS Keychain, Linux Secret Service). They are never written
//! to a database, log, export or crash report, and the UI only ever receives a masked form.

use crate::error::{AppError, AppResult, ErrorCode};
use serde::Serialize;
use ts_rs::TS;

const SERVICE: &str = "Reconio";

/// A passive source that takes a key. `id` is subfinder's provider-config name.
pub struct Source {
    pub id: &'static str,
    pub label: &'static str,
    /// What to paste, for the input placeholder.
    pub placeholder: &'static str,
}

pub const SOURCES: &[Source] = &[
    Source { id: "github", label: "GitHub", placeholder: "Paste API key" },
    Source { id: "chaos", label: "Chaos", placeholder: "Paste API key" },
    Source { id: "securitytrails", label: "SecurityTrails", placeholder: "Paste API key" },
    Source { id: "virustotal", label: "VirusTotal", placeholder: "Paste API key" },
    Source { id: "censys", label: "Censys", placeholder: "Paste API ID and secret as id:secret" },
    Source { id: "shodan", label: "Shodan", placeholder: "Paste API key" },
];

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct KeyStatus {
    pub source: String,
    pub label: String,
    pub placeholder: String,
    /// Masked key, for example `ghp_••••••••3f2a`. None when no key is saved.
    pub masked: Option<String>,
}

/// Shows enough of a key to recognise it and never enough to use it.
pub fn mask(key: &str) -> String {
    let chars: Vec<char> = key.chars().collect();
    let n = chars.len();
    if n < 12 {
        let tail: String = chars[n.saturating_sub(2)..].iter().collect();
        return format!("{}{tail}", "•".repeat(8));
    }
    let head: String = chars[..4].iter().collect();
    let tail: String = chars[n - 4..].iter().collect();
    format!("{head}{}{tail}", "•".repeat(12))
}

fn source(id: &str) -> AppResult<&'static Source> {
    SOURCES.iter().find(|s| s.id == id).ok_or_else(|| AppError::new(ErrorCode::Invalid, format!("Unknown source {id}.")))
}

fn entry(id: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, &format!("apikey:{id}")).map_err(keychain_error)
}

fn keychain_error(e: keyring::Error) -> AppError {
    AppError::new(
        ErrorCode::Io,
        format!("The OS keychain is not available ({e}). Reconio never stores keys in plain text, so the key was not saved."),
    )
}

/// The key itself, for building subfinder's provider config at run time (Module 2).
pub fn get(id: &str) -> AppResult<Option<String>> {
    match entry(id)?.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(keychain_error(e)),
    }
}

pub fn list() -> AppResult<Vec<KeyStatus>> {
    SOURCES
        .iter()
        .map(|s| {
            Ok(KeyStatus {
                source: s.id.into(),
                label: s.label.into(),
                placeholder: s.placeholder.into(),
                masked: get(s.id)?.map(|k| mask(&k)),
            })
        })
        .collect()
}

pub fn set(id: &str, value: &str) -> AppResult<KeyStatus> {
    let s = source(id)?;
    let v = value.trim();
    if v.is_empty() {
        return Err(AppError::new(ErrorCode::Invalid, "Paste a key first."));
    }
    if v.chars().any(char::is_whitespace) {
        return Err(AppError::new(ErrorCode::Invalid, "The key contains a space or line break. Check that you copied only the key."));
    }
    if id == "censys" && !v.contains(':') {
        return Err(AppError::new(ErrorCode::Invalid, "Censys needs the API ID and the secret, written as id:secret."));
    }
    entry(id)?.set_password(v).map_err(keychain_error)?;
    Ok(KeyStatus { source: s.id.into(), label: s.label.into(), placeholder: s.placeholder.into(), masked: Some(mask(v)) })
}

pub fn delete(id: &str) -> AppResult<()> {
    source(id)?;
    match entry(id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(keychain_error(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_never_reveal_the_middle() {
        assert_eq!(mask("ghp_abcdefghijklmnop3f2a"), "ghp_••••••••••••3f2a");
        assert_eq!(mask("short"), "••••••••rt");
        assert!(!mask("ghp_abcdefghijklmnop3f2a").contains("abcdef"));
    }
}
