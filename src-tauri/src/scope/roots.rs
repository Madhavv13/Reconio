//! Root domains (§12.5) and scope check 1 (SCOPE-08).

use super::{Effect, Kind, Matcher, Rule};
use serde::Serialize;
use ts_rs::TS;

/// Domains subfinder will enumerate: in-scope domain rules give themselves, in-scope wildcard
/// rules give their base. A root under another root is dropped. Patterns, IPs and CIDRs give none.
pub fn root_domains(rules: &[Rule]) -> Vec<String> {
    let mut roots: Vec<String> = rules
        .iter()
        .filter(|r| r.effect == Effect::In)
        .filter_map(|r| match r.kind {
            Kind::Domain => Some(r.normalized.clone()),
            Kind::Wildcard => Some(r.normalized.trim_start_matches("*.").to_string()),
            _ => None,
        })
        .collect();
    roots.sort();
    roots.dedup();
    let all: std::collections::HashSet<String> = roots.iter().cloned().collect();
    roots.retain(|r| {
        let mut rest = r.as_str();
        while let Some(p) = rest.find('.') {
            rest = &rest[p + 1..];
            if all.contains(rest) {
                return false;
            }
        }
        true
    });
    roots
}

/// Why a run cannot start, naming the problem rule or domain.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct RunBlock {
    pub message: String,
    pub domain: Option<String>,
    pub rule: Option<String>,
}

/// Scope check 1: returns the root domains, or why a run cannot start.
pub fn check_runnable(rules: &[Rule]) -> Result<Vec<String>, RunBlock> {
    let m = Matcher::new(rules);
    if !m.has_in_rule() {
        return Err(RunBlock { message: "Add at least one in-scope rule.".into(), domain: None, rule: None });
    }
    let roots = root_domains(rules);
    if roots.is_empty() {
        return Err(RunBlock {
            message: "No root domain to enumerate. Add an in-scope domain or wildcard rule; pattern, IP and CIDR rules only match hosts.".into(),
            domain: None,
            rule: None,
        });
    }
    for root in &roots {
        if let Some(r) = m.out_namespace_rule(root) {
            return Err(RunBlock {
                message: format!("{root} is to be enumerated, but out-of-scope rule {} excludes every host under it.", r.normalized),
                domain: Some(root.clone()),
                rule: Some(r.normalized.clone()),
            });
        }
    }
    Ok(roots)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules(ins: &[&str], outs: &[&str]) -> Vec<Rule> {
        ins.iter()
            .map(|s| Rule::from_input(s, Effect::In).unwrap())
            .chain(outs.iter().map(|s| Rule::from_input(s, Effect::Out).unwrap()))
            .collect()
    }

    #[test]
    fn roots_from_domains_and_wildcards() {
        let r = rules(&["acme.example", "*.dev.acme.example", "*.globex.example", "api-*.initech.example", "203.0.113.0/24"], &[]);
        assert_eq!(root_domains(&r), vec!["acme.example", "globex.example"]);
    }

    #[test]
    fn run_blocks() {
        assert!(check_runnable(&rules(&[], &["x.example"])).unwrap_err().message.starts_with("Add at least"));
        assert!(check_runnable(&rules(&["203.0.113.0/24"], &[])).unwrap_err().message.starts_with("No root domain"));
        let b = check_runnable(&rules(&["dev.acme.example"], &["*.acme.example"])).unwrap_err();
        assert_eq!((b.domain.as_deref(), b.rule.as_deref()), (Some("dev.acme.example"), Some("*.acme.example")));
        // Excluding the bare domain does not block enumerating its subdomains.
        assert_eq!(check_runnable(&rules(&["*.acme.example"], &["acme.example"])).unwrap(), vec!["acme.example"]);
    }
}
