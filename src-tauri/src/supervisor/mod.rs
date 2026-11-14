//! Process supervisor (PRD §9.3). The only place in Reconio that starts a tool process.
//!
//! Every invocation:
//! - always gets `-duc` (no update check) and `-nc` (no colour), §11.2;
//! - never gets a self-update or proxy flag (RUN-14);
//! - starts with the proxy environment variables removed, because httpx >= 1.10 follows them;
//! - is tied to Reconio's lifetime: a Windows Job Object with KILL_ON_JOB_CLOSE, or a process
//!   group (plus PR_SET_PDEATHSIG on Linux), so no tool outlives Reconio (NFR-R2).

use serde::Serialize;
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use ts_rs::TS;

#[cfg(windows)]
mod job;

pub const PROXY_ENV: [&str; 8] = [
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
    "http_proxy", "https_proxy", "all_proxy", "no_proxy",
];
pub const ALWAYS_ARGS: [&str; 2] = ["-duc", "-nc"];
pub const FORBIDDEN_ARGS: [&str; 5] = ["-up", "-update", "-proxy", "-http-proxy", "-socks-proxy"];

/// Batching for UI events: at most one message every 50 ms or 500 lines (NFR-P4).
pub const BATCH_INTERVAL: Duration = Duration::from_millis(50);
pub const BATCH_MAX: usize = 500;

#[derive(Debug, thiserror::Error)]
pub enum SupervisorError {
    #[error("flag {0} is not allowed")]
    ForbiddenFlag(String),
    #[error("could not start the tool: {0}")]
    Spawn(#[from] std::io::Error),
    #[error("the tool did not finish within {0:?}")]
    Timeout(Duration),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Stream {
    Stdout,
    Stderr,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct ToolLine {
    pub stream: Stream,
    pub text: String,
}

/// The final argument list: caller arguments, minus nothing, plus `ALWAYS_ARGS`.
/// Fails if a forbidden flag is present (in `-flag` or `-flag=value` form, one or two dashes).
pub fn final_args(args: &[String]) -> Result<Vec<String>, SupervisorError> {
    for a in args {
        let flag = a.split('=').next().unwrap_or(a);
        let single = format!("-{}", flag.trim_start_matches('-'));
        if FORBIDDEN_ARGS.contains(&single.as_str()) {
            return Err(SupervisorError::ForbiddenFlag(a.clone()));
        }
    }
    let mut out = args.to_vec();
    for always in ALWAYS_ARGS {
        if !out.iter().any(|a| a == always) {
            out.push(always.to_string());
        }
    }
    Ok(out)
}

pub fn build_command(path: &Path, args: &[String]) -> Result<Command, SupervisorError> {
    let mut cmd = Command::new(path);
    cmd.args(final_args(args)?)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    for var in PROXY_ENV {
        cmd.env_remove(var);
    }
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(unix)]
    {
        cmd.process_group(0);
    }
    #[cfg(target_os = "linux")]
    unsafe {
        cmd.pre_exec(|| {
            if libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL) != 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    Ok(cmd)
}

/// Starts a tool and ties it to Reconio's lifetime.
pub fn spawn(mut cmd: Command) -> Result<Child, SupervisorError> {
    let child = cmd.spawn()?;
    #[cfg(windows)]
    job::assign(&child)?;
    Ok(child)
}

/// Runs a short command and returns stdout and stderr together (used for `-version`).
pub async fn output(path: &Path, args: &[String]) -> Result<String, SupervisorError> {
    const LIMIT: Duration = Duration::from_secs(15);
    let child = spawn(build_command(path, args)?)?;
    let out = tokio::time::timeout(LIMIT, child.wait_with_output())
        .await
        .map_err(|_| SupervisorError::Timeout(LIMIT))??;
    let mut s = String::from_utf8_lossy(&out.stdout).into_owned();
    s.push_str(&String::from_utf8_lossy(&out.stderr));
    Ok(s)
}

async fn pump(reader: impl AsyncRead + Unpin, stream: Stream, tx: mpsc::Sender<ToolLine>) {
    let mut lines = BufReader::new(reader).lines();
    while let Ok(Some(raw)) = lines.next_line().await {
        // Some tools ignore -nc on some paths (subfinder -version), so clean every line.
        let text = crate::tools::strip_ansi(raw.trim_end_matches('\r'));
        if tx.send(ToolLine { stream, text }).await.is_err() {
            break;
        }
    }
}

/// Collects lines and hands them to `emit` in batches.
pub async fn batch_lines(
    mut rx: mpsc::Receiver<ToolLine>,
    interval: Duration,
    max: usize,
    mut emit: impl FnMut(Vec<ToolLine>),
) {
    let mut buf = Vec::new();
    // First tick after one interval, not immediately, so a flush never fires at time zero.
    let mut tick = tokio::time::interval_at(tokio::time::Instant::now() + interval, interval);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            // Drain waiting lines before checking the timer.
            biased;
            line = rx.recv() => match line {
                Some(l) => {
                    buf.push(l);
                    if buf.len() >= max {
                        emit(std::mem::take(&mut buf));
                    }
                }
                None => {
                    if !buf.is_empty() {
                        emit(buf);
                    }
                    return;
                }
            },
            _ = tick.tick() => {
                if !buf.is_empty() {
                    emit(std::mem::take(&mut buf));
                }
            }
        }
    }
}

/// Runs a tool, streaming stdout and stderr lines to `emit` in batches. Returns the exit code.
pub async fn stream(
    path: &Path,
    args: &[String],
    emit: impl FnMut(Vec<ToolLine>) + Send + 'static,
) -> Result<Option<i32>, SupervisorError> {
    let mut child = spawn(build_command(path, args)?)?;
    let (tx, rx) = mpsc::channel(4096);
    let out = child.stdout.take().map(|r| tokio::spawn(pump(r, Stream::Stdout, tx.clone())));
    let err = child.stderr.take().map(|r| tokio::spawn(pump(r, Stream::Stderr, tx.clone())));
    drop(tx);
    let batcher = tokio::spawn(batch_lines(rx, BATCH_INTERVAL, BATCH_MAX, emit));
    let status = child.wait().await?;
    for h in [out, err].into_iter().flatten() {
        let _ = h.await;
    }
    let _ = batcher.await;
    Ok(status.code())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::{resolve_path, Tool};

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn always_adds_duc_and_nc_once() {
        assert_eq!(final_args(&s(&["-silent"])).unwrap(), s(&["-silent", "-duc", "-nc"]));
        assert_eq!(final_args(&s(&["-duc", "-silent"])).unwrap(), s(&["-duc", "-silent", "-nc"]));
    }

    #[test]
    fn rejects_update_and_proxy_flags() {
        for bad in ["-up", "--update", "-proxy=http://x", "-http-proxy", "--socks-proxy=x"] {
            assert!(matches!(final_args(&s(&[bad])), Err(SupervisorError::ForbiddenFlag(_))), "{bad}");
        }
        assert!(final_args(&s(&["-upload-x"])).is_ok());
    }

    #[test]
    fn removes_proxy_environment() {
        let cmd = build_command(Path::new("tool"), &[]).unwrap();
        let removed: Vec<_> = cmd
            .as_std()
            .get_envs()
            .filter(|(_, v)| v.is_none())
            .map(|(k, _)| k.to_string_lossy().into_owned())
            .collect();
        // Windows environment keys are case-insensitive, so HTTP_PROXY also covers http_proxy.
        let same = |a: &str, b: &str| if cfg!(windows) { a.eq_ignore_ascii_case(b) } else { a == b };
        for var in PROXY_ENV {
            assert!(removed.iter().any(|k| same(k, var)), "{var} not removed");
        }
    }

    #[tokio::test(start_paused = true)]
    async fn batches_by_size_and_time() {
        let (tx, rx) = mpsc::channel(2000);
        for i in 0..1200 {
            tx.send(ToolLine { stream: Stream::Stdout, text: i.to_string() }).await.unwrap();
        }
        drop(tx);
        let mut sizes = Vec::new();
        batch_lines(rx, BATCH_INTERVAL, BATCH_MAX, |b| sizes.push(b.len())).await;
        assert_eq!(sizes, vec![500, 500, 200]);
    }

    #[tokio::test]
    async fn streams_a_real_tool() {
        let lines = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let sink = lines.clone();
        let code = stream(&resolve_path(Tool::Subfinder), &s(&["-version"]), move |b| sink.lock().unwrap().extend(b))
            .await
            .unwrap();
        assert_eq!(code, Some(0));
        let all = lines.lock().unwrap();
        assert!(all.iter().any(|l| l.text.contains("Current Version")), "{all:?}");
        assert!(all.iter().all(|l| !l.text.contains('\u{1b}')), "lines must be free of colour codes");
    }
}
