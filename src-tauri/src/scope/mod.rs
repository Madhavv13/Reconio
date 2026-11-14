//! Scope rules: parsing, normalization and the matcher (PRD §7.3, §12).
//!
//! Pure code with no I/O. The pipeline (check 1 to 4), the scope test box (SCOPE-09), the
//! impact count (SCOPE-07) and export (EXP-04) all use this one matcher, so a scope decision
//! is made the same way everywhere. Covered by `tests/scope_regression.rs`: a failure there
//! blocks a release.

pub mod hints;
pub mod matcher;
pub mod normalize;
pub mod parse;
pub mod roots;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub use matcher::{Decision, Matcher, Reason, Verdict};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Kind {
    Domain,
    Wildcard,
    Pattern,
    Ip,
    Cidr,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Domain => "domain",
            Kind::Wildcard => "wildcard",
            Kind::Pattern => "pattern",
            Kind::Ip => "ip",
            Kind::Cidr => "cidr",
        }
    }
    pub fn parse(s: &str) -> Option<Kind> {
        Some(match s {
            "domain" => Kind::Domain,
            "wildcard" => Kind::Wildcard,
            "pattern" => Kind::Pattern,
            "ip" => Kind::Ip,
            "cidr" => Kind::Cidr,
            _ => return None,
        })
    }
    /// Domain, wildcard and pattern rules match hostnames; IP and CIDR rules match addresses.
    pub fn is_name(self) -> bool {
        matches!(self, Kind::Domain | Kind::Wildcard | Kind::Pattern)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Effect {
    In,
    Out,
}

impl Effect {
    pub fn as_str(self) -> &'static str {
        match self {
            Effect::In => "in",
            Effect::Out => "out",
        }
    }
    pub fn parse(s: &str) -> Option<Effect> {
        match s {
            "in" => Some(Effect::In),
            "out" => Some(Effect::Out),
            _ => None,
        }
    }
}

/// A scope rule. `pattern` is what the user entered (after removing bullets and comments);
/// `normalized` is the canonical form the matcher uses.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Rule {
    #[ts(type = "number | null")]
    pub id: Option<i64>,
    pub kind: Kind,
    pub effect: Effect,
    pub pattern: String,
    pub normalized: String,
    pub note: Option<String>,
}

impl Rule {
    /// Builds a rule from one entered value. Used by tests and the single "Add rule" dialog.
    pub fn from_input(input: &str, effect: Effect) -> Result<Rule, String> {
        let n = normalize::normalize_rule(input)?;
        Ok(Rule { id: None, kind: n.kind, effect, pattern: input.trim().to_string(), normalized: n.value, note: None })
    }
}
