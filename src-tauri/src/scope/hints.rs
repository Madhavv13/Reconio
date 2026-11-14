//! Preview hints (SCOPE-12): rules that do not mean what users usually expect.
//! A hint never changes a rule by itself; an action adds or replaces exactly one rule.

use super::matcher::{Matcher, Verdict};
use super::parse::PreviewRule;
use super::{Effect, Kind, Rule};

use serde::Serialize;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum HintCode {
    /// (a) A URL path was dropped; the rule covers the whole host.
    PathIgnored,
    /// (b) An in-scope `*.x` does not cover `x` itself.
    BaseNotInScope,
    /// (c) An out-of-scope `*.x` leaves `x` itself in scope.
    BaseStillInScope,
    /// (d) A pattern rule matches hosts but never starts enumeration.
    MatchOnly,
    /// (e) Another rule already covers this one.
    Covered,
    /// `*hpe.com` probably meant `*.hpe.com` (Q16).
    DidYouMean,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct HintAction {
    pub label: String,
    /// The rule to add, as it would be typed.
    pub pattern: String,
    pub effect: Effect,
    /// If set, the entered rule to replace instead of adding a new one.
    pub replace: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct Hint {
    pub code: HintCode,
    /// The rule the hint is about, as entered.
    pub rule: String,
    pub effect: Effect,
    /// The host the hint is about, if any.
    pub host: Option<String>,
    pub message: String,
    pub action: Option<HintAction>,
}

pub fn compute(preview: &[PreviewRule], all: &[Rule]) -> Vec<Hint> {
    let m = Matcher::new(all);
    let mut hints = Vec::new();
    for r in preview.iter().filter(|r| !r.existing) {
        let hint = |code, host: Option<&str>, message: String, action| Hint {
            code,
            rule: r.pattern.clone(),
            effect: r.effect,
            host: host.map(str::to_string),
            message,
            action,
        };

        if let Some(path) = &r.dropped_path {
            hints.push(hint(
                HintCode::PathIgnored,
                Some(&r.normalized),
                match r.effect {
                    Effect::In => format!("Path {path} ignored. Reconio checks whole hosts, so this rule is wider than the program's."),
                    Effect::Out => format!("Path {path} ignored. Reconio checks whole hosts, so all of {} is excluded, not just this path.", r.normalized),
                },
                None,
            ));
        }

        match (r.kind, r.effect) {
            (Kind::Wildcard, Effect::In) => {
                let base = r.normalized.trim_start_matches("*.");
                if m.match_name(Effect::In, base).is_none() && m.match_name(Effect::Out, base).is_none() {
                    hints.push(hint(
                        HintCode::BaseNotInScope,
                        Some(base),
                        format!("{base} itself is not in scope. {} covers only its subdomains.", r.normalized),
                        Some(HintAction { label: "Add it".into(), pattern: base.into(), effect: Effect::In, replace: None }),
                    ));
                }
            }
            (Kind::Wildcard, Effect::Out) => {
                let base = r.normalized.trim_start_matches("*.");
                if m.decide_host(base).verdict == Verdict::In {
                    hints.push(hint(
                        HintCode::BaseStillInScope,
                        Some(base),
                        format!("{base} itself is still in scope. {} excludes only its subdomains.", r.normalized),
                        Some(HintAction { label: "Exclude it too".into(), pattern: base.into(), effect: Effect::Out, replace: None }),
                    ));
                }
            }
            (Kind::Pattern, _) => {
                let p = &r.normalized;
                if p.starts_with('*') && !p.starts_with("*.") && p.matches('*').count() == 1 {
                    let fixed = format!("*.{}", &p[1..]);
                    let example = &p[1..];
                    hints.push(hint(
                        HintCode::DidYouMean,
                        None,
                        format!("Did you mean {fixed}? {p} matches x{example} but not mail.{example}."),
                        Some(HintAction { label: format!("Use {fixed}"), pattern: fixed.clone(), effect: r.effect, replace: Some(r.pattern.clone()) }),
                    ));
                }
                if r.effect == Effect::In {
                    hints.push(hint(HintCode::MatchOnly, None, "Match only: not used to start enumeration.".into(), None));
                }
            }
            _ => {}
        }

        if matches!(r.kind, Kind::Domain | Kind::Wildcard) {
            // A domain is covered by a wildcard above it; `*.b` by a wildcard above `b`.
            let host = r.normalized.trim_start_matches("*.");
            if let Some(c) = m.wildcard_above(r.effect, host) {
                hints.push(hint(HintCode::Covered, None, format!("Already covered by {}.", c.normalized), None));
            }
        }
    }
    hints
}

#[cfg(test)]
mod tests {
    use crate::scope::parse::preview;
    use crate::scope::Effect;

    use super::HintCode;

    fn codes(in_text: &str, out_text: &str) -> Vec<(HintCode, Option<String>)> {
        preview(in_text, out_text, &[]).hints.into_iter().map(|h| (h.code, h.host)).collect()
    }

    #[test]
    fn path_hint() {
        assert!(codes("https://acme.example/portal", "").contains(&(HintCode::PathIgnored, Some("acme.example".into()))));
    }

    #[test]
    fn wildcard_base_hints() {
        assert!(codes("*.acme.example", "").contains(&(HintCode::BaseNotInScope, Some("acme.example".into()))));
        assert!(!codes("*.acme.example\nacme.example", "").iter().any(|c| c.0 == HintCode::BaseNotInScope));
        let c = codes("*.acme.example", "*.legacy.acme.example");
        assert!(c.contains(&(HintCode::BaseStillInScope, Some("legacy.acme.example".into()))));
        let c = codes("*.acme.example", "*.legacy.acme.example\nlegacy.acme.example");
        assert!(!c.iter().any(|x| x.0 == HintCode::BaseStillInScope));
    }

    #[test]
    fn pattern_hints_and_did_you_mean() {
        let p = preview("*hpe.com", "", &[]);
        let dym = p.hints.iter().find(|h| h.code == HintCode::DidYouMean).unwrap();
        let a = dym.action.as_ref().unwrap();
        assert_eq!((a.pattern.as_str(), a.replace.as_deref(), a.effect), ("*.hpe.com", Some("*hpe.com"), Effect::In));
        assert!(p.hints.iter().any(|h| h.code == HintCode::MatchOnly));
    }

    #[test]
    fn covered_rules() {
        let c = codes("*.acme.example\napi.acme.example\n*.dev.acme.example", "");
        assert_eq!(c.iter().filter(|x| x.0 == HintCode::Covered).count(), 2);
        assert!(!codes("*.acme.example\nacme.example", "").iter().any(|x| x.0 == HintCode::Covered));
    }
}
