//! Parsing pasted scope lists (SCOPE-02) and imported files (SCOPE-03) into a preview.

use super::hints::{self, Hint};
use super::normalize::normalize_rule;
use super::roots;
use super::{Effect, Kind, Rule};
use serde::Serialize;
use std::collections::HashSet;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct PreviewRule {
    pub kind: Kind,
    pub effect: Effect,
    pub pattern: String,
    pub normalized: String,
    /// Which box the line came from.
    pub source: Effect,
    pub line: u32,
    pub dropped_path: Option<String>,
    /// The engagement already has this rule; applying skips it.
    pub existing: bool,
}

impl PreviewRule {
    pub fn to_rule(&self) -> Rule {
        Rule { id: None, kind: self.kind, effect: self.effect, pattern: self.pattern.clone(), normalized: self.normalized.clone(), note: None }
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct InvalidLine {
    pub source: Effect,
    pub line: u32,
    pub text: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct Preview {
    pub rules: Vec<PreviewRule>,
    pub invalid: Vec<InvalidLine>,
    pub hints: Vec<Hint>,
    /// Root domains the whole scope (saved + previewed) would enumerate (§12.5).
    pub roots: Vec<String>,
}

const BULLETS: [&str; 6] = ["- ", "* ", "• ", "-\t", "*\t", "•\t"];

/// Removes comments and list bullets. Returns the remaining text and whether it started with `!`.
fn clean_line(line: &str) -> Option<(&str, bool)> {
    let mut l = line.trim();
    if l.starts_with('#') {
        return None;
    }
    if let Some(i) = l.find(" #").or_else(|| l.find("\t#")) {
        l = l[..i].trim_end();
    }
    while let Some(rest) = BULLETS.iter().find_map(|b| l.strip_prefix(b)) {
        l = rest.trim_start();
    }
    let bang = l.starts_with('!');
    if bang {
        l = l[1..].trim_start();
    }
    (!l.is_empty()).then_some((l, bang))
}

fn is_bullet_only(t: &str) -> bool {
    t.chars().all(|c| matches!(c, '-' | '•')) || t == "!"
}

/// Parses one box. A `!` line in the In scope box becomes an out-of-scope rule.
pub fn parse_list(text: &str, source: Effect) -> (Vec<PreviewRule>, Vec<InvalidLine>) {
    let mut rules = Vec::new();
    let mut invalid = Vec::new();
    for (n, raw) in text.lines().enumerate() {
        let Some((l, bang)) = clean_line(raw) else { continue };
        let effect = if bang { Effect::Out } else { source };
        for tok in l.split(|c: char| c == ',' || c.is_whitespace()).filter(|t| !t.is_empty() && !is_bullet_only(t)) {
            let line = n as u32 + 1;
            match normalize_rule(tok) {
                Ok(norm) => rules.push(PreviewRule {
                    kind: norm.kind,
                    effect,
                    pattern: tok.to_string(),
                    normalized: norm.value,
                    source,
                    line,
                    dropped_path: norm.dropped_path,
                    existing: false,
                }),
                Err(reason) => invalid.push(InvalidLine { source, line, text: tok.to_string(), reason }),
            }
        }
    }
    (rules, invalid)
}

/// Parses both boxes against the engagement's saved rules and computes hints and roots.
pub fn preview(in_text: &str, out_text: &str, existing: &[Rule]) -> Preview {
    let (mut rules, mut invalid) = parse_list(in_text, Effect::In);
    let (r2, i2) = parse_list(out_text, Effect::Out);
    rules.extend(r2);
    invalid.extend(i2);

    let saved: HashSet<(Kind, Effect, &str)> = existing.iter().map(|r| (r.kind, r.effect, r.normalized.as_str())).collect();
    let mut seen = HashSet::new();
    rules.retain(|r| seen.insert((r.kind, r.effect, r.normalized.clone())));
    for r in &mut rules {
        r.existing = saved.contains(&(r.kind, r.effect, r.normalized.as_str()));
    }

    let mut all: Vec<Rule> = existing.to_vec();
    all.extend(rules.iter().filter(|r| !r.existing).map(PreviewRule::to_rule));
    let hints = hints::compute(&rules, &all);
    Preview { roots: roots::root_domains(&all), rules, invalid, hints }
}

// ---------- file import (SCOPE-03) ----------

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct ImportResult {
    /// Text for the In scope box and the Out of scope box; the normal preview runs on it.
    pub in_text: String,
    pub out_text: String,
    /// Rows that are not hosts (for example mobile app IDs) and were left out.
    pub skipped: Vec<InvalidLine>,
}

/// Minimal RFC 4180 reader: quoted fields, doubled quotes, newlines inside quotes.
fn csv_records(text: &str) -> Vec<Vec<String>> {
    let mut records = Vec::new();
    let mut rec = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = text.trim_start_matches('\u{feff}').chars().peekable();
    while let Some(c) = chars.next() {
        if quoted {
            match c {
                '"' if chars.peek() == Some(&'"') => {
                    chars.next();
                    field.push('"');
                }
                '"' => quoted = false,
                _ => field.push(c),
            }
            continue;
        }
        match c {
            '"' => quoted = true,
            ',' => rec.push(std::mem::take(&mut field)),
            '\r' => {}
            '\n' => {
                rec.push(std::mem::take(&mut field));
                records.push(std::mem::take(&mut rec));
            }
            _ => field.push(c),
        }
    }
    if !field.is_empty() || !rec.is_empty() {
        rec.push(field);
        records.push(rec);
    }
    records.retain(|r| r.iter().any(|f| !f.trim().is_empty()));
    records
}

const VALUE_COLUMNS: [&str; 9] = ["identifier", "asset_identifier", "target", "pattern", "rule", "scope", "value", "host", "domain"];
const HOST_TYPES: [&str; 8] = ["url", "wildcard", "domain", "cidr", "ip_address", "ip", "ip_range", "website"];

fn parse_effect(v: &str) -> Option<Effect> {
    match v.trim().to_lowercase().as_str() {
        "in" | "in scope" | "in_scope" | "true" | "yes" => Some(Effect::In),
        "out" | "out of scope" | "out_of_scope" | "false" | "no" => Some(Effect::Out),
        _ => None,
    }
}

/// Reads a `.txt` or `.csv` file. A `.txt` file goes to `list`. A `.csv` file may say per row
/// which list it belongs to, with an `effect` column (`in`/`out`) or HackerOne's
/// `eligible_for_submission` (true/false); otherwise every row goes to `list`.
pub fn import_file(text: &str, file_name: &str, list: Effect) -> ImportResult {
    let mut out = ImportResult { in_text: String::new(), out_text: String::new(), skipped: Vec::new() };
    let push = |out: &mut ImportResult, e: Effect, v: &str| {
        let t = if e == Effect::In { &mut out.in_text } else { &mut out.out_text };
        t.push_str(v.trim());
        t.push('\n');
    };
    if !file_name.to_lowercase().ends_with(".csv") {
        push(&mut out, list, text);
        return out;
    }
    let records = csv_records(text);
    let Some(first) = records.first() else { return out };
    let head: Vec<String> = first.iter().map(|h| h.trim().to_lowercase()).collect();
    let col = |names: &[&str]| names.iter().find_map(|n| head.iter().position(|h| h == n));
    let value_col = col(&VALUE_COLUMNS);
    let has_header = value_col.is_some() || head.iter().any(|h| h == "effect");
    let value_col = value_col.unwrap_or(0);
    let effect_col = col(&["effect"]);
    let eligible_col = col(&["eligible_for_submission"]);
    let type_col = col(&["asset_type", "type"]);

    for (i, rec) in records.iter().enumerate().skip(has_header as usize) {
        let line = i as u32 + 1;
        let value = rec.get(value_col).map(|s| s.trim()).unwrap_or("");
        if value.is_empty() {
            continue;
        }
        if let Some(t) = type_col.and_then(|c| rec.get(c)) {
            let t = t.trim().to_lowercase();
            if !t.is_empty() && !HOST_TYPES.contains(&t.as_str()) {
                out.skipped.push(InvalidLine { source: list, line, text: value.to_string(), reason: format!("Asset type {t} is not a host") });
                continue;
            }
        }
        let effect = effect_col
            .or(eligible_col)
            .and_then(|c| rec.get(c))
            .and_then(|v| parse_effect(v))
            .unwrap_or(list);
        push(&mut out, effect, value);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bullets_comments_and_separators() {
        let (r, inv) = parse_list("- *.acme.example\n* api.acme.example, www.acme.example\n# comment\n• 203.0.113.0/24  # office\n", Effect::In);
        let got: Vec<_> = r.iter().map(|x| (x.normalized.as_str(), x.effect)).collect();
        assert_eq!(
            got,
            vec![
                ("*.acme.example", Effect::In),
                ("api.acme.example", Effect::In),
                ("www.acme.example", Effect::In),
                ("203.0.113.0/24", Effect::In)
            ]
        );
        assert!(inv.is_empty());
    }

    #[test]
    fn a_pasted_dash_bullet_never_flips_a_rule() {
        let (r, _) = parse_list("- *.acme.example", Effect::In);
        assert_eq!(r[0].effect, Effect::In);
    }

    #[test]
    fn bang_moves_a_rule_out() {
        let (r, _) = parse_list("acme.example\n!status.acme.example", Effect::In);
        assert_eq!(r[1].effect, Effect::Out);
        assert_eq!(r[1].source, Effect::In);
    }

    #[test]
    fn invalid_lines_keep_their_line_number() {
        let (_, inv) = parse_list("acme.example\n\n203.0.113.300", Effect::In);
        assert_eq!((inv[0].line, inv[0].text.as_str()), (3, "203.0.113.300"));
    }

    #[test]
    fn preview_dedupes_and_marks_saved_rules() {
        let saved = vec![Rule::from_input("acme.example", Effect::In).unwrap()];
        let p = preview("acme.example\nACME.example.\n*.acme.example", "", &saved);
        assert_eq!(p.rules.len(), 2);
        assert!(p.rules[0].existing);
        assert!(!p.rules[1].existing);
        assert_eq!(p.roots, vec!["acme.example"]);
    }

    #[test]
    fn csv_with_hackerone_columns() {
        let csv = "identifier,asset_type,instruction,eligible_for_submission\n\
                   *.acme.example,WILDCARD,\"main, all\",true\n\
                   status.acme.example,URL,,false\n\
                   com.acme.app,GOOGLE_PLAY_APP_ID,,true\n";
        let r = import_file(csv, "scope.CSV", Effect::In);
        assert_eq!(r.in_text, "*.acme.example\n");
        assert_eq!(r.out_text, "status.acme.example\n");
        assert_eq!(r.skipped.len(), 1);
        assert_eq!(r.skipped[0].line, 4);
    }

    #[test]
    fn csv_with_effect_column_and_txt() {
        let r = import_file("pattern,effect\nacme.example,in\n\"*.old.acme.example\",out\n", "x.csv", Effect::In);
        assert_eq!((r.in_text.as_str(), r.out_text.as_str()), ("acme.example\n", "*.old.acme.example\n"));
        let t = import_file("a.example\nb.example", "list.txt", Effect::Out);
        assert_eq!(t.out_text, "a.example\nb.example\n");
    }

    #[test]
    fn ten_thousand_lines_parse_quickly() {
        let text: String = (0..10_000).map(|i| format!("host{i}.acme.example\n")).collect();
        let start = std::time::Instant::now();
        let p = preview(&text, "*.acme.example", &[]);
        assert_eq!(p.rules.len(), 10_001);
        // SCOPE-03: under 1 s in release builds. Debug builds are slower, so allow more here.
        assert!(start.elapsed().as_secs_f64() < 5.0, "{:?}", start.elapsed());
    }
}
