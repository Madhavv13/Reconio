//! Scope commands (SCOPE-01 to SCOPE-03, SCOPE-08, SCOPE-09, SCOPE-12).

use super::{no_engagement, AppState, Result};
use crate::engagements::Attestation;
use crate::error::{AppError, ErrorCode};
use crate::scope::normalize::parse_target;
use crate::scope::parse::{self, ImportResult, Preview};
use crate::scope::roots::{self, RunBlock};
use crate::scope::{Decision, Effect, Matcher, Rule};
use serde::Serialize;
use tauri::State;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct ScopeView {
    pub rules: Vec<Rule>,
    /// Root domains a run would enumerate (§12.5).
    pub roots: Vec<String>,
    /// Why a run cannot start with this scope, if it cannot (SCOPE-08).
    pub block: Option<RunBlock>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct ApplyResult {
    pub added: u32,
    /// Set when the authorization was confirmed again (ENG-03).
    pub attestation: Option<Attestation>,
}

fn saved_rules(state: &AppState) -> Result<Vec<Rule>> {
    state.active().as_ref().ok_or_else(no_engagement)?.scope_list()
}

#[tauri::command]
pub fn scope_list(state: State<'_, AppState>) -> Result<ScopeView> {
    let rules = saved_rules(&state)?;
    let (roots, block) = match roots::check_runnable(&rules) {
        Ok(r) => (r, None),
        Err(b) => (roots::root_domains(&rules), Some(b)),
    };
    Ok(ScopeView { rules, roots, block })
}

/// Preview for the Scope screen (against the open engagement's rules) or, with `fresh`,
/// for the New engagement screen (against no rules).
#[tauri::command]
pub fn scope_parse_preview(state: State<'_, AppState>, in_text: String, out_text: String, fresh: bool) -> Result<Preview> {
    let existing = match state.active().as_ref() {
        Some(e) if !fresh => e.scope_list()?,
        _ => Vec::new(),
    };
    Ok(parse::preview(&in_text, &out_text, &existing))
}

/// Saves every valid rule from the two boxes; invalid lines are skipped. Adding an in-scope
/// rule needs `reconfirm` (the user confirmed authorization again, ENG-03).
#[tauri::command]
pub fn scope_apply(
    state: State<'_, AppState>,
    in_text: String,
    out_text: String,
    note: Option<String>,
    reconfirm: bool,
) -> Result<ApplyResult> {
    let mut active = state.active();
    let edb = active.as_mut().ok_or_else(no_engagement)?;
    let p = parse::preview(&in_text, &out_text, &edb.scope_list()?);
    let note = note.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    let new: Vec<Rule> = p
        .rules
        .iter()
        .filter(|r| !r.existing)
        .map(|r| Rule { note: note.clone(), ..r.to_rule() })
        .collect();
    let adds_in = new.iter().any(|r| r.effect == Effect::In);
    if adds_in && !reconfirm {
        return Err(AppError::new(
            ErrorCode::AttestationRequired,
            "Adding in-scope rules widens what Reconio may test. Confirm that you are authorized to test them.",
        ));
    }
    let attestation = if adds_in { Some(edb.reconfirm_attestation()?) } else { None };
    let added = edb.scope_add(&new)? as u32;
    Ok(ApplyResult { added, attestation })
}

#[tauri::command]
pub fn scope_delete(state: State<'_, AppState>, id: i64) -> Result<()> {
    state.active().as_ref().ok_or_else(no_engagement)?.scope_delete(id)
}

/// The scope test box (SCOPE-09): the same matcher the pipeline uses. A hostname gets the
/// check-2 decision, so a host that only IP rules could bring in shows as pending.
#[tauri::command]
pub fn scope_test(state: State<'_, AppState>, input: String) -> Result<Decision> {
    let target = parse_target(&input).map_err(|m| AppError::new(ErrorCode::Invalid, m))?;
    let m = Matcher::new(&saved_rules(&state)?);
    Ok(match (target.host, target.ip) {
        (Some(h), _) => m.decide_host(&h),
        (None, Some(ip)) => m.decide(None, &[ip]),
        (None, None) => return Err(AppError::new(ErrorCode::Invalid, "Enter a host, URL or IP")),
    })
}

/// SCOPE-03: turns a chosen file into the two boxes' text; the normal preview runs on it.
#[tauri::command]
pub fn scope_import(text: String, file_name: String, list: Effect) -> ImportResult {
    parse::import_file(&text, &file_name, list)
}
