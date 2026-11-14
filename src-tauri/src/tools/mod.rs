//! The bundled recon tools: where they live, what version and checksum they must have,
//! and the tool check that verifies them (ONB-02).
//!
//! Tools are never looked up on PATH. On this machine, for example, `httpx` on PATH is the
//! unrelated Python package of the same name.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use ts_rs::TS;

use crate::supervisor;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Tool {
    Subfinder,
    Dnsx,
    Httpx,
}

impl Tool {
    pub const ALL: [Tool; 3] = [Tool::Subfinder, Tool::Dnsx, Tool::Httpx];

    pub fn name(self) -> &'static str {
        match self {
            Tool::Subfinder => "subfinder",
            Tool::Dnsx => "dnsx",
            Tool::Httpx => "httpx",
        }
    }
}

/// One row of `binaries/manifest.json`, written by `scripts/fetch-tools.mjs` after it has
/// verified the release zip against `tools.lock.json`.
#[derive(Debug, Clone, Deserialize)]
pub struct Pinned {
    pub version: String,
    pub sha256: String,
}

const MANIFEST: &str = include_str!("../../binaries/manifest.json");
pub const TARGET: &str = env!("RECONIO_TARGET");

pub fn pinned(tool: Tool) -> Option<&'static Pinned> {
    static PARSED: OnceLock<HashMap<String, HashMap<String, Pinned>>> = OnceLock::new();
    PARSED
        .get_or_init(|| serde_json::from_str(MANIFEST).unwrap_or_default())
        .get(TARGET)?
        .get(tool.name())
}

/// Where the sidecar for `tool` is. Tauri copies `externalBin` entries next to the app
/// executable with the target triple removed, both in `tauri dev` and in installed builds.
pub fn resolve_path(tool: Tool) -> PathBuf {
    let file = format!("{}{}", tool.name(), std::env::consts::EXE_SUFFIX);
    if let Some(dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)) {
        let beside = dir.join(&file);
        if beside.is_file() {
            return beside;
        }
    }
    // Debug builds and `cargo test` fall back to the fetched sidecar in src-tauri/binaries.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!("{}-{}{}", tool.name(), TARGET, std::env::consts::EXE_SUFFIX))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum ToolState {
    Ok,
    Missing,
    Tampered,
    VersionMismatch,
    Unreadable,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct ToolStatus {
    pub tool: Tool,
    pub path: String,
    pub expected_version: Option<String>,
    pub detected_version: Option<String>,
    pub state: ToolState,
    /// Cause and fix, in UI words. None when the state is ok.
    pub problem: Option<String>,
}

pub fn sha256_file(path: &Path) -> std::io::Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    Ok(hex::encode(hasher.finalize()))
}

/// Removes ANSI escape sequences (colour codes) from tool output.
pub fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for n in chars.by_ref() {
                    if ('@'..='~').contains(&n) {
                        break;
                    }
                }
            }
            continue;
        }
        out.push(c);
    }
    out
}

/// Reads the version from `-version` output. All three tools print a line like
/// `[INF] Current Version: v2.17.0` (dnsx omits the `v`).
pub fn parse_version(output: &str) -> Option<String> {
    let clean = strip_ansi(output);
    let rest = clean.split("Current Version:").nth(1)?;
    let token = rest.split_whitespace().next()?;
    let v = token.trim_start_matches('v');
    (!v.is_empty() && v.chars().next()?.is_ascii_digit()).then(|| v.to_string())
}

pub async fn detect_version(path: &Path) -> Option<String> {
    let out = supervisor::output(path, &["-version".into()]).await.ok()?;
    parse_version(&out)
}

/// The tool check for one tool (ONB-02): present, checksum, version.
pub async fn check(tool: Tool) -> ToolStatus {
    let path = resolve_path(tool);
    let pin = pinned(tool);
    let mut status = ToolStatus {
        tool,
        path: path.display().to_string(),
        expected_version: pin.map(|p| p.version.clone()),
        detected_version: None,
        state: ToolState::Ok,
        problem: None,
    };
    let fail = |mut s: ToolStatus, state, problem: String| {
        s.state = state;
        s.problem = Some(problem);
        s
    };

    if !path.is_file() {
        return fail(status, ToolState::Missing, format!("{} is missing. Reinstall Reconio.", tool.name()));
    }
    let Some(pin) = pin else {
        return fail(status, ToolState::Missing, format!("No pinned {} for {TARGET}. Reinstall Reconio.", tool.name()));
    };
    let hash = {
        let p = path.clone();
        tokio::task::spawn_blocking(move || sha256_file(&p)).await
    };
    match hash {
        Ok(Ok(h)) if h == pin.sha256 => {}
        Ok(Ok(_)) => {
            return fail(status, ToolState::Tampered, format!("{} does not match the signed build. Reinstall Reconio.", tool.name()));
        }
        _ => return fail(status, ToolState::Unreadable, format!("{} cannot be read. Check file permissions or reinstall Reconio.", tool.name())),
    }
    status.detected_version = detect_version(&path).await;
    match &status.detected_version {
        None => fail(status, ToolState::Unreadable, format!("{} did not report a version. Reinstall Reconio.", tool.name())),
        Some(v) if *v != pin.version => {
            let msg = format!("{} is v{v}, expected v{}. Reinstall Reconio.", tool.name(), pin.version);
            fail(status, ToolState::VersionMismatch, msg)
        }
        Some(_) => status,
    }
}

pub async fn check_all() -> Vec<ToolStatus> {
    let handles: Vec<_> = Tool::ALL.iter().map(|&t| tokio::spawn(check(t))).collect();
    let mut out = Vec::with_capacity(handles.len());
    for h in handles {
        if let Ok(s) = h.await {
            out.push(s);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_versions_from_real_output() {
        assert_eq!(parse_version("\u{1b}[34mINF\u{1b}[0m] Current Version: v2.17.0\n").as_deref(), Some("2.17.0"));
        assert_eq!(parse_version("banner\n[INF] Current Version: 1.3.1").as_deref(), Some("1.3.1"));
        assert_eq!(parse_version("[INF] Current Version: v1.12.0").as_deref(), Some("1.12.0"));
        assert_eq!(parse_version("no version here"), None);
        assert_eq!(parse_version("Current Version: dev"), None);
    }

    #[test]
    fn strips_colour_codes() {
        assert_eq!(strip_ansi("[\u{1b}[34mINF\u{1b}[0m] ok"), "[INF] ok");
    }

    #[test]
    fn manifest_pins_every_tool_for_this_target() {
        for t in Tool::ALL {
            let p = pinned(t).unwrap_or_else(|| panic!("{} not pinned for {TARGET}", t.name()));
            assert_eq!(p.sha256.len(), 64);
        }
    }

    /// Runs the real sidecars. Requires `npm run fetch-tools` first.
    #[tokio::test]
    async fn bundled_tools_pass_the_tool_check() {
        for s in check_all().await {
            assert_eq!(s.state, ToolState::Ok, "{:?}", s);
            assert_eq!(s.detected_version, s.expected_version);
        }
    }

    #[tokio::test]
    async fn tampered_binary_fails_the_check() {
        let dir = std::env::temp_dir().join(format!("reconio-tamper-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let copy = dir.join("tool.bin");
        let mut bytes = std::fs::read(resolve_path(Tool::Dnsx)).unwrap();
        let last = bytes.len() - 1;
        bytes[last] ^= 0xff;
        std::fs::write(&copy, bytes).unwrap();
        let h = sha256_file(&copy).unwrap();
        assert_ne!(h, pinned(Tool::Dnsx).unwrap().sha256);
        std::fs::remove_dir_all(dir).ok();
    }
}
