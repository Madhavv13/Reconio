//! The scope matcher (PRD §12.2, §12.3). Out of scope always wins.

use super::{Effect, Kind, Rule};
use ipnet::IpNet;
use serde::Serialize;
use std::collections::HashMap;
use std::net::IpAddr;
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Verdict {
    In,
    Out,
    /// Check 2 only: no hostname rule matched, but in-scope IP or CIDR rules exist, so the
    /// host is resolved and decided at check 3 with its IPs (SCOPE-10).
    Pending,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Reason {
    /// The hostname matches an in-scope rule.
    InRule,
    /// A resolved IP matches an in-scope IP or CIDR rule.
    IpInRule,
    /// The hostname matches an out-of-scope rule.
    OutRule,
    /// A resolved IP matches an out-of-scope IP or CIDR rule.
    IpOutRule,
    /// Nothing in scope matches.
    NoInScopeMatch,
    /// Waiting for resolved IPs (SCOPE-10).
    AwaitingIps,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct Decision {
    pub verdict: Verdict,
    pub reason: Reason,
    /// The rule that decided it, if one did.
    pub rule: Option<Rule>,
}

#[derive(Debug, Clone)]
enum Seg {
    /// `*` as a whole first or last label: one or more labels.
    Multi,
    /// A label, where each `*` matches one or more characters inside the label.
    Label(String),
}

fn compile_pattern(p: &str) -> Vec<Seg> {
    let labels: Vec<&str> = p.split('.').collect();
    let last = labels.len() - 1;
    labels
        .iter()
        .enumerate()
        .map(|(i, l)| if *l == "*" && (i == 0 || i == last) { Seg::Multi } else { Seg::Label(l.to_string()) })
        .collect()
}

fn glob_label(p: &[u8], s: &[u8]) -> bool {
    match p.first() {
        None => s.is_empty(),
        Some(b'*') => (1..=s.len()).any(|k| glob_label(&p[1..], &s[k..])),
        Some(&c) => s.first() == Some(&c) && glob_label(&p[1..], &s[1..]),
    }
}

fn match_segs(segs: &[Seg], labels: &[&str]) -> bool {
    match segs.first() {
        None => labels.is_empty(),
        Some(Seg::Multi) => (1..=labels.len()).any(|k| match_segs(&segs[1..], &labels[k..])),
        Some(Seg::Label(g)) => {
            !labels.is_empty() && glob_label(g.as_bytes(), labels[0].as_bytes()) && match_segs(&segs[1..], &labels[1..])
        }
    }
}

/// Rules indexed for fast lookup, one set per effect.
#[derive(Default)]
struct Side {
    domains: HashMap<String, usize>,
    wildcard_bases: HashMap<String, usize>,
    patterns: Vec<(Vec<Seg>, usize)>,
    nets: Vec<(IpNet, usize)>,
}

impl Side {
    fn match_name(&self, host: &str) -> Option<usize> {
        if let Some(&i) = self.domains.get(host) {
            return Some(i);
        }
        let mut rest = host;
        while let Some(p) = rest.find('.') {
            rest = &rest[p + 1..];
            if let Some(&i) = self.wildcard_bases.get(rest) {
                return Some(i);
            }
        }
        if self.patterns.is_empty() {
            return None;
        }
        let labels: Vec<&str> = host.split('.').collect();
        self.patterns.iter().find(|(segs, _)| match_segs(segs, &labels)).map(|(_, i)| *i)
    }

    fn match_ip(&self, ip: &IpAddr) -> Option<usize> {
        self.nets.iter().find(|(n, _)| n.contains(ip)).map(|(_, i)| *i)
    }
}

pub struct Matcher {
    rules: Vec<Rule>,
    ins: Side,
    outs: Side,
}

impl Matcher {
    pub fn new(rules: &[Rule]) -> Matcher {
        let mut m = Matcher { rules: rules.to_vec(), ins: Side::default(), outs: Side::default() };
        for (i, r) in rules.iter().enumerate() {
            let side = if r.effect == Effect::In { &mut m.ins } else { &mut m.outs };
            match r.kind {
                Kind::Domain => {
                    side.domains.entry(r.normalized.clone()).or_insert(i);
                }
                Kind::Wildcard => {
                    let base = r.normalized.trim_start_matches("*.").to_string();
                    side.wildcard_bases.entry(base).or_insert(i);
                }
                Kind::Pattern => side.patterns.push((compile_pattern(&r.normalized), i)),
                Kind::Ip => {
                    if let Ok(ip) = r.normalized.parse::<IpAddr>() {
                        side.nets.push((IpNet::from(ip), i));
                    }
                }
                Kind::Cidr => {
                    if let Ok(n) = r.normalized.parse::<IpNet>() {
                        side.nets.push((n, i));
                    }
                }
            }
        }
        m
    }

    pub fn rules(&self) -> &[Rule] {
        &self.rules
    }

    pub fn has_in_rule(&self) -> bool {
        self.rules.iter().any(|r| r.effect == Effect::In)
    }

    pub fn has_in_ip_rule(&self) -> bool {
        !self.ins.nets.is_empty()
    }

    fn decision(&self, verdict: Verdict, reason: Reason, rule: Option<usize>) -> Decision {
        Decision { verdict, reason, rule: rule.map(|i| self.rules[i].clone()) }
    }

    /// Index of the rule with this effect whose hostname part matches `host`.
    pub fn match_name(&self, effect: Effect, host: &str) -> Option<&Rule> {
        let side = if effect == Effect::In { &self.ins } else { &self.outs };
        side.match_name(host).map(|i| &self.rules[i])
    }

    /// A wildcard rule with this effect whose base is a proper parent of `host`.
    pub fn wildcard_above(&self, effect: Effect, host: &str) -> Option<&Rule> {
        let side = if effect == Effect::In { &self.ins } else { &self.outs };
        let mut rest = host;
        while let Some(p) = rest.find('.') {
            rest = &rest[p + 1..];
            if let Some(&i) = side.wildcard_bases.get(rest) {
                return Some(&self.rules[i]);
            }
        }
        None
    }

    /// An out-of-scope wildcard or pattern rule that covers every host under `root`
    /// (scope check 1, SCOPE-08). An out-of-scope *domain* rule for the root itself does not
    /// block enumeration: it excludes only that one host.
    pub fn out_namespace_rule(&self, root: &str) -> Option<&Rule> {
        if let Some(&i) = self.outs.wildcard_bases.get(root) {
            return Some(&self.rules[i]);
        }
        let probe = self.outs.match_name(root)?;
        (self.rules[probe].kind != Kind::Domain).then(|| &self.rules[probe])
    }

    /// Check 2: a hostname before its IPs are known (§12.3).
    pub fn decide_host(&self, host: &str) -> Decision {
        if let Some(i) = self.outs.match_name(host) {
            return self.decision(Verdict::Out, Reason::OutRule, Some(i));
        }
        if let Some(i) = self.ins.match_name(host) {
            return self.decision(Verdict::In, Reason::InRule, Some(i));
        }
        if self.has_in_ip_rule() {
            return self.decision(Verdict::Pending, Reason::AwaitingIps, None);
        }
        self.decision(Verdict::Out, Reason::NoInScopeMatch, None)
    }

    /// The full decision with resolved IPs (check 3). `host` is None for a bare IP.
    pub fn decide(&self, host: Option<&str>, ips: &[IpAddr]) -> Decision {
        if let Some(i) = host.and_then(|h| self.outs.match_name(h)) {
            return self.decision(Verdict::Out, Reason::OutRule, Some(i));
        }
        if let Some(i) = ips.iter().find_map(|ip| self.outs.match_ip(ip)) {
            return self.decision(Verdict::Out, Reason::IpOutRule, Some(i));
        }
        if let Some(i) = host.and_then(|h| self.ins.match_name(h)) {
            return self.decision(Verdict::In, Reason::InRule, Some(i));
        }
        if let Some(i) = ips.iter().find_map(|ip| self.ins.match_ip(ip)) {
            return self.decision(Verdict::In, Reason::IpInRule, Some(i));
        }
        self.decision(Verdict::Out, Reason::NoInScopeMatch, None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(ins: &[&str], outs: &[&str]) -> Matcher {
        let mut rules = Vec::new();
        for s in ins {
            rules.push(Rule::from_input(s, Effect::In).unwrap());
        }
        for s in outs {
            rules.push(Rule::from_input(s, Effect::Out).unwrap());
        }
        Matcher::new(&rules)
    }

    #[test]
    fn wildcard_matches_any_depth_but_not_its_base() {
        let s = m(&["*.acme.example"], &[]);
        assert_eq!(s.decide_host("a.acme.example").verdict, Verdict::In);
        assert_eq!(s.decide_host("a.b.acme.example").verdict, Verdict::In);
        assert_eq!(s.decide_host("acme.example").verdict, Verdict::Out);
        assert_eq!(s.decide_host("xacme.example").verdict, Verdict::Out);
    }

    #[test]
    fn out_always_wins() {
        let s = m(&["*.acme.example"], &["*.legacy.acme.example"]);
        let d = s.decide_host("x.legacy.acme.example");
        assert_eq!((d.verdict, d.reason), (Verdict::Out, Reason::OutRule));
        assert_eq!(d.rule.unwrap().normalized, "*.legacy.acme.example");
        assert_eq!(s.decide_host("legacy.acme.example").verdict, Verdict::In);
    }

    #[test]
    fn pattern_forms() {
        let s = m(&["api-*.acme.example", "*.dev.*.acme.example", "www.acme.*", "*hpe.com"], &[]);
        assert_eq!(s.decide_host("api-eu.acme.example").verdict, Verdict::In);
        assert_eq!(s.decide_host("api-eu.x.acme.example").verdict, Verdict::Out);
        assert_eq!(s.decide_host("api-.acme.example").verdict, Verdict::Out);
        assert_eq!(s.decide_host("a.dev.eu.acme.example").verdict, Verdict::In);
        assert_eq!(s.decide_host("a.b.dev.eu.acme.example").verdict, Verdict::In);
        assert_eq!(s.decide_host("dev.eu.acme.example").verdict, Verdict::Out);
        assert_eq!(s.decide_host("www.acme.co.uk").verdict, Verdict::In);
        assert_eq!(s.decide_host("www.acme").verdict, Verdict::Out);
        assert_eq!(s.decide_host("xhpe.com").verdict, Verdict::In);
        assert_eq!(s.decide_host("mail.hpe.com").verdict, Verdict::Out);
    }

    #[test]
    fn pending_hosts_are_decided_by_ip_scope_10() {
        let s = m(&["acme.example", "203.0.113.0/24"], &[]);
        assert_eq!(s.decide_host("vpn.acme.example").verdict, Verdict::Pending);
        let vpn = s.decide(Some("vpn.acme.example"), &["203.0.113.5".parse().unwrap()]);
        assert_eq!((vpn.verdict, vpn.reason), (Verdict::In, Reason::IpInRule));
        let mail = s.decide(Some("mail.acme.example"), &["198.51.100.7".parse().unwrap()]);
        assert_eq!((mail.verdict, mail.reason), (Verdict::Out, Reason::NoInScopeMatch));
        let none = m(&["acme.example"], &[]);
        assert_eq!(none.decide_host("vpn.acme.example").verdict, Verdict::Out);
    }

    #[test]
    fn out_ip_drops_an_in_host() {
        let s = m(&["*.acme.example"], &["203.0.113.200/29"]);
        let d = s.decide(Some("a.acme.example"), &["203.0.113.201".parse().unwrap()]);
        assert_eq!((d.verdict, d.reason), (Verdict::Out, Reason::IpOutRule));
    }

    #[test]
    fn ipv6_cidr() {
        let s = m(&["2001:db8::/32"], &[]);
        assert_eq!(s.decide(None, &["2001:db8:1::5".parse().unwrap()]).verdict, Verdict::In);
        assert_eq!(s.decide(None, &["2001:db9::5".parse().unwrap()]).verdict, Verdict::Out);
    }
}
