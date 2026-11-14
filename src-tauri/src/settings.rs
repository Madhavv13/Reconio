//! App settings (PRD §7.7), stored as one JSON value in app.db. Every value is validated
//! against the limits in §11.5 and SET-03 before it is saved.

use crate::error::{AppError, AppResult, ErrorCode};
use serde::{Deserialize, Serialize};
use std::net::{IpAddr, SocketAddr};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ToolLimits {
    pub threads: u32,
    /// Requests per second. 0 means no limit (subfinder only).
    pub rate_limit: u32,
    /// Seconds.
    pub timeout: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ToolSettings {
    pub subfinder: ToolLimits,
    pub dnsx: ToolLimits,
    pub httpx: ToolLimits,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Density {
    Comfortable,
    Compact,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Performance {
    /// Runs at once across all engagements (RUN-08).
    pub runs_at_once: u32,
    pub chunks_per_stage: u32,
    pub density: Density,
    /// RUN-13.
    pub keep_running_in_background: bool,
    /// RUN-12.
    pub notify_when_run_ends: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Privacy {
    pub check_for_updates: bool,
    pub send_crash_reports: bool,
    pub send_usage_statistics: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Settings {
    pub tools: ToolSettings,
    pub resolvers: Vec<String>,
    pub performance: Performance,
    pub privacy: Privacy,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            tools: ToolSettings {
                subfinder: ToolLimits { threads: 10, rate_limit: 0, timeout: 30 },
                dnsx: ToolLimits { threads: 50, rate_limit: 300, timeout: 5 },
                httpx: ToolLimits { threads: 25, rate_limit: 100, timeout: 10 },
            },
            resolvers: ["1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4", "9.9.9.9", "149.112.112.112", "208.67.222.222", "208.67.220.220"]
                .iter()
                .map(|s| s.to_string())
                .collect(),
            performance: Performance {
                runs_at_once: 2,
                chunks_per_stage: 2,
                density: Density::Comfortable,
                keep_running_in_background: false,
                notify_when_run_ends: true,
            },
            // SET-08: every opt-in is off by default.
            privacy: Privacy { check_for_updates: true, send_crash_reports: false, send_usage_statistics: false },
        }
    }
}

fn range(name: &str, v: u32, min: u32, max: u32) -> AppResult<()> {
    if v < min || v > max {
        return Err(AppError::new(ErrorCode::Invalid, format!("{name} must be {min} to {max}.")));
    }
    Ok(())
}

/// A resolver is an IP address, optionally with a port (`1.1.1.1:53`, `[2606:4700::1111]:53`).
pub fn valid_resolver(s: &str) -> bool {
    s.parse::<IpAddr>().is_ok() || s.parse::<SocketAddr>().is_ok()
}

impl Settings {
    /// Checks every value. Resolvers are trimmed and de-duplicated in place.
    pub fn validate(&mut self) -> AppResult<()> {
        let t = &self.tools;
        range("subfinder threads", t.subfinder.threads, 1, 100)?;
        range("subfinder rate limit", t.subfinder.rate_limit, 0, 1_000)?;
        range("subfinder timeout", t.subfinder.timeout, 1, 300)?;
        range("dnsx threads", t.dnsx.threads, 1, 500)?;
        range("dnsx rate limit", t.dnsx.rate_limit, 1, 5_000)?;
        range("dnsx timeout", t.dnsx.timeout, 1, 60)?;
        range("httpx threads", t.httpx.threads, 1, 300)?;
        range("httpx rate limit", t.httpx.rate_limit, 1, 2_000)?;
        range("httpx timeout", t.httpx.timeout, 1, 60)?;
        range("Runs at once", self.performance.runs_at_once, 1, 8)?;
        range("Chunks at once per stage", self.performance.chunks_per_stage, 1, 8)?;

        let mut seen = std::collections::HashSet::new();
        let mut clean = Vec::new();
        for r in &self.resolvers {
            let r = r.trim();
            if r.is_empty() || r.starts_with('#') {
                continue;
            }
            if !valid_resolver(r) {
                return Err(AppError::new(ErrorCode::Invalid, format!("{r} is not a resolver address. Use an IP, optionally with a port.")));
            }
            if seen.insert(r.to_string()) {
                clean.push(r.to_string());
            }
        }
        if clean.is_empty() {
            return Err(AppError::new(ErrorCode::Invalid, "Add at least one resolver. A run cannot start with an empty list."));
        }
        self.resolvers = clean;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_valid() {
        let mut s = Settings::default();
        s.validate().unwrap();
        assert_eq!(s, Settings::default());
    }

    #[test]
    fn limits_and_resolvers_are_checked() {
        let mut s = Settings::default();
        s.tools.httpx.threads = 301;
        assert!(s.validate().unwrap_err().message.contains("httpx threads must be 1 to 300"));

        let mut s = Settings::default();
        s.resolvers = vec![" 1.1.1.1 ".into(), "1.1.1.1".into(), "# comment".into(), "[2606:4700::1111]:53".into()];
        s.validate().unwrap();
        assert_eq!(s.resolvers, vec!["1.1.1.1", "[2606:4700::1111]:53"]);

        s.resolvers = vec!["dns.google".into()];
        assert!(s.validate().is_err());
        s.resolvers = vec![];
        assert!(s.validate().unwrap_err().message.contains("at least one resolver"));
    }
}
