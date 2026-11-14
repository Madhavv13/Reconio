//! Normalization (PRD §12.1): one entered value → kind + canonical form.

use super::Kind;
use ipnet::IpNet;
use std::net::IpAddr;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Normalized {
    pub kind: Kind,
    /// Canonical value: punycode hostname, `*.base` for wildcards, canonical IP or network.
    pub value: String,
    /// A URL path, query or fragment that was dropped (SCOPE-12 hint a).
    pub dropped_path: Option<String>,
}

/// A host or IP the user wants checked (scope test box, SCOPE-09).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Target {
    pub host: Option<String>,
    pub ip: Option<IpAddr>,
}

fn strip_brackets(s: &str) -> &str {
    s.strip_prefix('[').and_then(|x| x.strip_suffix(']')).unwrap_or(s)
}

fn strip_port(authority: &str) -> &str {
    if authority.starts_with('[') {
        if let Some(end) = authority.find(']') {
            return &authority[..=end];
        }
    }
    match authority.rsplit_once(':') {
        Some((h, p)) if !h.contains(':') && !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()) => h,
        _ => authority,
    }
}

/// Splits `scheme://user@host:port/path?q#f` (scheme optional) into the host and the dropped part.
fn split_host(t: &str) -> (&str, Option<String>) {
    let rest = match t.find("://") {
        Some(i) => &t[i + 3..],
        None => t,
    };
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let (authority, tail) = rest.split_at(end);
    let authority = authority.rsplit('@').next().unwrap_or(authority);
    let path = (!tail.is_empty() && tail != "/").then(|| tail.to_string());
    (strip_port(authority), path)
}

/// Converts a hostname to lowercase punycode (IDNA 2008, UTS-46) and checks its labels.
fn to_ascii_host(h: &str, require_dot: bool) -> Result<String, String> {
    let h = h.trim().trim_end_matches('.');
    if h.is_empty() {
        return Err("No host in this line".into());
    }
    let ascii = idna::domain_to_ascii(h).map_err(|_| "Not a valid domain name".to_string())?;
    validate_host(&ascii, require_dot)?;
    Ok(ascii)
}

fn validate_label(l: &str, allow_star: bool) -> Result<(), String> {
    if l.is_empty() {
        return Err("Empty label (two dots in a row)".into());
    }
    if l.len() > 63 {
        return Err("A label is longer than 63 characters".into());
    }
    let ok = l.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_' || (allow_star && b == b'*'));
    if !ok {
        return Err(format!("Character not allowed in a hostname: {l}"));
    }
    Ok(())
}

fn validate_host(h: &str, require_dot: bool) -> Result<(), String> {
    if h.len() > 253 {
        return Err("Hostname is longer than 253 characters".into());
    }
    let labels: Vec<&str> = h.split('.').collect();
    if require_dot && labels.len() < 2 {
        return Err("Not a full domain name (no dot)".into());
    }
    for l in &labels {
        validate_label(l, false)?;
    }
    if labels.iter().all(|l| l.bytes().all(|b| b.is_ascii_digit())) {
        return Err("Not a valid IP address".into());
    }
    Ok(())
}

/// Normalizes one rule value (already split from its line and with bullets removed).
pub fn normalize_rule(token: &str) -> Result<Normalized, String> {
    let t = token.trim();
    if t.is_empty() {
        return Err("Empty".into());
    }
    // CIDR: address/prefix.
    if let Some((a, b)) = t.split_once('/') {
        if let (Ok(ip), Ok(prefix)) = (strip_brackets(a).parse::<IpAddr>(), b.parse::<u8>()) {
            let net = IpNet::new(ip, prefix).map_err(|_| format!("Prefix /{prefix} is too long for this address"))?;
            return Ok(Normalized { kind: Kind::Cidr, value: net.trunc().to_string(), dropped_path: None });
        }
    }
    let (host, dropped_path) = split_host(t);
    if host.is_empty() {
        return Err("No host in this line".into());
    }
    if let Ok(ip) = strip_brackets(host).parse::<IpAddr>() {
        return Ok(Normalized { kind: Kind::Ip, value: ip.to_string(), dropped_path });
    }
    let host = host.trim_end_matches('.').to_lowercase();
    let stars = host.matches('*').count();
    if host.trim_start_matches("*.").is_empty() || host == "*" {
        return Err("Wildcard with no domain".into());
    }
    let (kind, value) = if stars == 0 {
        (Kind::Domain, to_ascii_host(&host, true)?)
    } else if stars == 1 && host.starts_with("*.") {
        (Kind::Wildcard, format!("*.{}", to_ascii_host(&host[2..], true)?))
    } else {
        (Kind::Pattern, normalize_pattern(&host)?)
    };
    Ok(Normalized { kind, value, dropped_path })
}

fn normalize_pattern(p: &str) -> Result<String, String> {
    let labels: Vec<&str> = p.split('.').collect();
    if labels.len() < 2 {
        return Err("A pattern needs at least one dot".into());
    }
    if labels.iter().all(|l| l.contains('*')) {
        return Err("A pattern needs at least one fixed label".into());
    }
    let mut out = Vec::with_capacity(labels.len());
    for l in labels {
        if l.contains('*') {
            if l.contains("**") {
                return Err("Two stars in a row".into());
            }
            validate_label(l, true)?;
            out.push(l.to_string());
        } else {
            let a = idna::domain_to_ascii(l).map_err(|_| "Not a valid domain name".to_string())?;
            validate_label(&a, false)?;
            out.push(a);
        }
    }
    Ok(out.join("."))
}

/// Normalizes a discovered hostname for matching. None if it is not a valid hostname.
pub fn normalize_host(h: &str) -> Option<String> {
    to_ascii_host(h, false).ok()
}

/// Parses what the user typed in the scope test box: a host, URL or IP.
pub fn parse_target(input: &str) -> Result<Target, String> {
    let t = input.trim();
    if t.is_empty() {
        return Err("Enter a host, URL or IP".into());
    }
    let (host, _) = split_host(t);
    if let Ok(ip) = strip_brackets(host).parse::<IpAddr>() {
        return Ok(Target { host: None, ip: Some(ip) });
    }
    if host.contains('*') {
        return Err("Enter one host, not a wildcard".into());
    }
    Ok(Target { host: Some(to_ascii_host(host, false)?), ip: None })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn n(s: &str) -> (Kind, String) {
        let r = normalize_rule(s).unwrap_or_else(|e| panic!("{s}: {e}"));
        (r.kind, r.value)
    }

    #[test]
    fn kinds_and_canonical_forms() {
        assert_eq!(n("Acme.Example."), (Kind::Domain, "acme.example".into()));
        assert_eq!(n("*.Acme.example"), (Kind::Wildcard, "*.acme.example".into()));
        assert_eq!(n("api-*.acme.example"), (Kind::Pattern, "api-*.acme.example".into()));
        assert_eq!(n("*.dev.*.acme.example"), (Kind::Pattern, "*.dev.*.acme.example".into()));
        assert_eq!(n("www.acme.*"), (Kind::Pattern, "www.acme.*".into()));
        assert_eq!(n("203.0.113.10"), (Kind::Ip, "203.0.113.10".into()));
        assert_eq!(n("203.0.113.77/24"), (Kind::Cidr, "203.0.113.0/24".into()));
        assert_eq!(n("2001:DB8::1"), (Kind::Ip, "2001:db8::1".into()));
        assert_eq!(n("2001:db8:0:0::/32"), (Kind::Cidr, "2001:db8::/32".into()));
        assert_eq!(n("[2001:db8::5]:8443"), (Kind::Ip, "2001:db8::5".into()));
        assert_eq!(n("bücher.example"), (Kind::Domain, "xn--bcher-kva.example".into()));
        assert_eq!(n("_dmarc.acme.example"), (Kind::Domain, "_dmarc.acme.example".into()));
    }

    #[test]
    fn urls_reduce_to_host_and_report_the_path() {
        let r = normalize_rule("https://user@Portal.acme.example:8443/portal?x=1").unwrap();
        assert_eq!((r.kind, r.value.as_str()), (Kind::Domain, "portal.acme.example"));
        assert_eq!(r.dropped_path.as_deref(), Some("/portal?x=1"));
        assert_eq!(normalize_rule("https://acme.example/").unwrap().dropped_path, None);
        assert_eq!(normalize_rule("acme.example/login").unwrap().dropped_path.as_deref(), Some("/login"));
        assert_eq!(n("http://*.acme.example"), (Kind::Wildcard, "*.acme.example".into()));
    }

    #[test]
    fn invalid_values_have_reasons() {
        for bad in ["203.0.113.300", "*.", "*", "acme", "a..b.example", "bad host.example", "10.0.0.0/40", "*.*"] {
            assert!(normalize_rule(bad).is_err(), "{bad} should be invalid");
        }
    }

    #[test]
    fn test_box_targets() {
        assert_eq!(parse_target("https://VPN.acme.example/x").unwrap().host.as_deref(), Some("vpn.acme.example"));
        assert_eq!(parse_target("203.0.113.5").unwrap().ip, Some("203.0.113.5".parse().unwrap()));
        assert!(parse_target("*.acme.example").is_err());
    }
}
