//! Scope regression suite (PRD §17). RELEASE BLOCKER: any failure here blocks a release.
//! Cases live in tests/fixtures/scope_cases.json so new real-world cases are data, not code.

use proptest::prelude::*;
use reconio_lib::scope::normalize::{normalize_host, normalize_rule};
use reconio_lib::scope::parse::preview;
use reconio_lib::scope::{Effect, Matcher, Rule, Verdict};
use serde::Deserialize;
use std::net::IpAddr;

#[derive(Deserialize)]
struct DecisionCase {
    name: String,
    #[serde(rename = "in")]
    ins: Vec<String>,
    out: Vec<String>,
    host: Option<String>,
    #[serde(default)]
    ips: Vec<String>,
    check: u8,
    verdict: String,
    rule: Option<String>,
}

#[derive(Deserialize)]
struct ParseCase {
    name: String,
    in_text: String,
    out_text: String,
    rules: Vec<(String, String, String)>,
}

#[derive(Deserialize)]
struct Corpus {
    decisions: Vec<DecisionCase>,
    parsing: Vec<ParseCase>,
}

fn corpus() -> Corpus {
    serde_json::from_str(include_str!("fixtures/scope_cases.json")).expect("valid fixture")
}

fn build(ins: &[String], outs: &[String]) -> Matcher {
    let rules: Vec<Rule> = ins
        .iter()
        .map(|s| Rule::from_input(s, Effect::In).unwrap_or_else(|e| panic!("{s}: {e}")))
        .chain(outs.iter().map(|s| Rule::from_input(s, Effect::Out).unwrap_or_else(|e| panic!("{s}: {e}"))))
        .collect();
    Matcher::new(&rules)
}

#[test]
fn decision_corpus() {
    let mut failures = Vec::new();
    for c in corpus().decisions {
        let m = build(&c.ins, &c.out);
        let host = c.host.as_deref().map(|h| normalize_host(h).unwrap_or_else(|| panic!("{}: bad host", c.name)));
        let ips: Vec<IpAddr> = c.ips.iter().map(|i| i.parse().unwrap()).collect();
        let d = if c.check == 2 { m.decide_host(host.as_deref().unwrap()) } else { m.decide(host.as_deref(), &ips) };
        let verdict = match d.verdict {
            Verdict::In => "in",
            Verdict::Out => "out",
            Verdict::Pending => "pending",
        };
        let rule = d.rule.map(|r| r.normalized);
        if verdict != c.verdict || rule != c.rule {
            failures.push(format!("{}: got {verdict} by {rule:?}, expected {} by {:?}", c.name, c.verdict, c.rule));
        }
    }
    assert!(failures.is_empty(), "scope regressions:\n{}", failures.join("\n"));
}

#[test]
fn parsing_corpus() {
    for c in corpus().parsing {
        let p = preview(&c.in_text, &c.out_text, &[]);
        let got: Vec<(String, String, String)> = p
            .rules
            .iter()
            .map(|r| (r.kind.as_str().to_string(), r.effect.as_str().to_string(), r.normalized.clone()))
            .collect();
        assert_eq!(got, c.rules, "{}", c.name);
    }
}

fn label() -> impl Strategy<Value = String> {
    "[a-z][a-z0-9-]{0,8}[a-z0-9]".prop_map(|s| s)
}

fn hostname() -> impl Strategy<Value = Vec<String>> {
    prop::collection::vec(label(), 3..6)
}

proptest! {
    /// Out of scope always wins: the same rule as both in and out is always out.
    #[test]
    fn out_always_wins(labels in hostname(), cut in 1usize..4) {
        let host = labels.join(".");
        let cut = cut.min(labels.len() - 2);
        let base = labels[cut..].join(".");
        for pattern in [host.clone(), format!("*.{base}")] {
            let m = build(&[pattern.clone()], &[pattern.clone()]);
            prop_assert_eq!(m.decide_host(&host).verdict, Verdict::Out, "{}", pattern);
        }
    }

    /// A wildcard matches every host under its base and never the base itself.
    #[test]
    fn wildcard_never_matches_its_base(labels in hostname(), cut in 1usize..4) {
        let cut = cut.min(labels.len() - 2);
        let base = labels[cut..].join(".");
        let m = build(&[format!("*.{base}")], &[]);
        prop_assert_eq!(m.decide_host(&base).verdict, Verdict::Out);
        prop_assert_eq!(m.decide_host(&labels.join(".")).verdict, Verdict::In);
    }

    /// Normalizing twice gives the same result.
    #[test]
    fn normalize_is_idempotent(labels in hostname(), upper in any::<bool>(), dot in any::<bool>()) {
        let mut h = labels.join(".");
        if upper { h = h.to_uppercase(); }
        if dot { h.push('.'); }
        let once = normalize_rule(&h).unwrap().value;
        prop_assert_eq!(normalize_rule(&once).unwrap().value, once);
    }

    /// Case and a trailing dot never change a decision.
    #[test]
    fn decision_ignores_case_and_trailing_dot(labels in hostname()) {
        let host = labels.join(".");
        let m = build(&[format!("*.{}", labels[1..].join("."))], &[]); // labels has 3+ entries
        let plain = m.decide_host(&normalize_host(&host).unwrap()).verdict;
        let odd = m.decide_host(&normalize_host(&format!("{}.", host.to_uppercase())).unwrap()).verdict;
        prop_assert_eq!(plain, odd);
    }
}
