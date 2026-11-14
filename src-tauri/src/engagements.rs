//! Engagements (PRD §7.2): the app.db index plus one folder and database per engagement.

use crate::db::{self, APP_MIGRATIONS, ENGAGEMENT_MIGRATIONS};
use crate::error::{AppError, AppResult, ErrorCode};
use crate::scope::{parse, Effect, Kind, Rule};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ts_rs::TS;

pub const NAME_MAX: usize = 100;

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct Engagement {
    pub id: String,
    pub name: String,
    pub client: Option<String>,
    pub notes: Option<String>,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number | null")]
    pub last_opened_at: Option<i64>,
}

/// Who attested that they are authorized to test this scope, and when (ENG-03).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct Attestation {
    pub by: String,
    /// When the engagement was first attested.
    #[ts(type = "number")]
    pub first_at: i64,
    /// When it was last confirmed (creation, or adding in-scope rules).
    #[ts(type = "number")]
    pub at: i64,
}

#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct NewEngagement {
    pub name: String,
    pub client: Option<String>,
    pub notes: Option<String>,
    pub in_text: String,
    pub out_text: String,
    /// The "I am authorized to test this scope" checkbox (ENG-04 / ONB-04).
    pub authorized: bool,
}

fn clean_opt(s: Option<String>) -> Option<String> {
    s.map(|x| x.trim().to_string()).filter(|x| !x.is_empty())
}

fn os_user() -> String {
    let u = whoami::username();
    if u.trim().is_empty() { "unknown user".into() } else { u }
}

fn check_name(name: &str) -> AppResult<String> {
    let n = name.trim();
    if n.is_empty() {
        return Err(AppError::new(ErrorCode::Invalid, "Enter a name."));
    }
    if n.chars().count() > NAME_MAX {
        return Err(AppError::new(ErrorCode::Invalid, format!("Use at most {NAME_MAX} characters.")));
    }
    Ok(n.to_string())
}

pub struct Store {
    root: PathBuf,
    app: Connection,
}

impl Store {
    pub fn open(root: &Path) -> AppResult<Store> {
        std::fs::create_dir_all(root.join("engagements"))?;
        let mut app = db::open(&root.join("app.db"))?;
        db::migrate(&mut app, APP_MIGRATIONS, Some(&root.join("backups")))?;
        Ok(Store { root: root.to_path_buf(), app })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    fn row(r: &rusqlite::Row) -> rusqlite::Result<Engagement> {
        Ok(Engagement {
            id: r.get(0)?,
            name: r.get(1)?,
            client: r.get(2)?,
            notes: r.get(3)?,
            created_at: r.get(4)?,
            last_opened_at: r.get(5)?,
        })
    }

    const COLS: &'static str = "id, name, client, notes, created_at, last_opened_at";

    /// Active engagements, most recently opened first.
    pub fn list(&self) -> AppResult<Vec<Engagement>> {
        let mut st = self.app.prepare(&format!(
            "SELECT {} FROM engagement WHERE archived_at IS NULL ORDER BY last_opened_at IS NULL, last_opened_at DESC, name COLLATE NOCASE",
            Self::COLS
        ))?;
        let rows = st.query_map([], Self::row)?.collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get(&self, id: &str) -> AppResult<Engagement> {
        self.app
            .query_row(&format!("SELECT {} FROM engagement WHERE id = ?1", Self::COLS), [id], Self::row)
            .optional()?
            .ok_or_else(|| AppError::new(ErrorCode::NotFound, "That engagement no longer exists."))
    }

    fn name_taken(&self, name: &str, except: Option<&str>) -> AppResult<bool> {
        let n: i64 = self.app.query_row(
            "SELECT COUNT(*) FROM engagement WHERE archived_at IS NULL AND name = ?1 COLLATE NOCASE AND id IS NOT ?2",
            params![name, except],
            |r| r.get(0),
        )?;
        Ok(n > 0)
    }

    pub fn folder(&self, id: &str) -> PathBuf {
        self.root.join("engagements").join(id)
    }

    /// ENG-01: creates the engagement, its folder and database, and saves its scope.
    pub fn create(&mut self, input: NewEngagement) -> AppResult<Engagement> {
        let name = check_name(&input.name)?;
        if !input.authorized {
            return Err(AppError::new(ErrorCode::AttestationRequired, "Confirm that you are authorized to test this scope."));
        }
        if self.name_taken(&name, None)? {
            return Err(AppError::new(ErrorCode::NameTaken, format!("An engagement called {name} already exists. Choose another name.")));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let folder = self.folder(&id);
        let result = (|| -> AppResult<()> {
            std::fs::create_dir_all(folder.join("logs"))?;
            let mut e = EngagementDb::open(&folder, &id)?;
            e.set_attestation(&os_user())?;
            let preview = parse::preview(&input.in_text, &input.out_text, &[]);
            let rules: Vec<Rule> = preview.rules.iter().map(|r| r.to_rule()).collect();
            e.scope_add(&rules)?;
            drop(e);
            self.app.execute(
                "INSERT INTO engagement (id, name, client, notes, path, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, name, clean_opt(input.client), clean_opt(input.notes), format!("engagements/{id}"), db::now()],
            )?;
            Ok(())
        })();
        if let Err(e) = result {
            let _ = std::fs::remove_dir_all(&folder);
            return Err(e);
        }
        self.get(&id)
    }

    pub fn update(&self, id: &str, name: &str, client: Option<String>, notes: Option<String>) -> AppResult<Engagement> {
        let name = check_name(name)?;
        self.get(id)?;
        if self.name_taken(&name, Some(id))? {
            return Err(AppError::new(ErrorCode::NameTaken, format!("An engagement called {name} already exists. Choose another name.")));
        }
        self.app.execute(
            "UPDATE engagement SET name = ?2, client = ?3, notes = ?4 WHERE id = ?1",
            params![id, name, clean_opt(client), clean_opt(notes)],
        )?;
        self.get(id)
    }

    /// Opens an engagement's database and records it as the last opened (ENG-08).
    pub fn open_engagement(&self, id: &str) -> AppResult<(Engagement, EngagementDb)> {
        self.get(id)?;
        let edb = EngagementDb::open(&self.folder(id), id)?;
        self.app.execute("UPDATE engagement SET last_opened_at = ?2 WHERE id = ?1", params![id, db::now()])?;
        self.app.execute("INSERT OR REPLACE INTO setting (key, value) VALUES ('last_engagement', ?1)", [id])?;
        Ok((self.get(id)?, edb))
    }

    pub fn setting(&self, key: &str) -> AppResult<Option<String>> {
        Ok(self.app.query_row("SELECT value FROM setting WHERE key = ?1", [key], |r| r.get(0)).optional()?)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        self.app.execute("INSERT OR REPLACE INTO setting (key, value) VALUES (?1, ?2)", [key, value])?;
        Ok(())
    }

    /// App settings, with defaults for anything not saved yet.
    pub fn settings(&self) -> AppResult<crate::settings::Settings> {
        Ok(self
            .setting("settings")?
            .and_then(|v| serde_json::from_str(&v).ok())
            .unwrap_or_default())
    }

    pub fn save_settings(&self, mut s: crate::settings::Settings) -> AppResult<crate::settings::Settings> {
        s.validate()?;
        self.set_setting("settings", &serde_json::to_string(&s).expect("settings serialize"))?;
        Ok(s)
    }

    pub fn last_engagement(&self) -> AppResult<Option<String>> {
        Ok(self.app.query_row("SELECT value FROM setting WHERE key = 'last_engagement'", [], |r| r.get(0)).optional()?)
    }

    /// ENG-06: deletes the engagement's folder, database and logs. The caller must close the
    /// engagement's database first, and pass the name exactly as the user typed it.
    pub fn delete(&self, id: &str, typed_name: &str) -> AppResult<()> {
        let e = self.get(id)?;
        if typed_name.trim() != e.name {
            return Err(AppError::new(ErrorCode::ConfirmMismatch, "The name you typed does not match. Nothing was deleted."));
        }
        let folder = self.folder(id);
        if folder.exists() {
            std::fs::remove_dir_all(&folder)?;
        }
        self.app.execute("DELETE FROM engagement WHERE id = ?1", [id])?;
        self.app.execute("DELETE FROM setting WHERE key = 'last_engagement' AND value = ?1", [id])?;
        Ok(())
    }
}

/// Total size of the files in a folder, recursively.
pub fn folder_size(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else { return 0 };
    entries
        .flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => folder_size(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

/// One engagement's database. Only one is open for writing at a time (§9.2).
pub struct EngagementDb {
    pub id: String,
    conn: Connection,
}

impl EngagementDb {
    pub fn open(folder: &Path, id: &str) -> AppResult<EngagementDb> {
        let mut conn = db::open(&folder.join("engagement.db"))?;
        db::migrate(&mut conn, ENGAGEMENT_MIGRATIONS, Some(&folder.join("backups")))?;
        conn.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('engagement_id', ?1)", [id])?;
        Ok(EngagementDb { id: id.to_string(), conn })
    }

    fn meta(&self, key: &str) -> AppResult<Option<String>> {
        Ok(self.conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0)).optional()?)
    }

    fn set_meta(&self, key: &str, value: &str) -> AppResult<()> {
        self.conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)", [key, value])?;
        Ok(())
    }

    pub fn attestation(&self) -> AppResult<Option<Attestation>> {
        let (Some(by), Some(at)) = (self.meta("authorized_by")?, self.meta("authorized_at")?) else { return Ok(None) };
        let at = at.parse().unwrap_or(0);
        let first_at = self.meta("first_authorized_at")?.and_then(|v| v.parse().ok()).unwrap_or(at);
        Ok(Some(Attestation { by, first_at, at }))
    }

    pub fn set_attestation(&self, by: &str) -> AppResult<Attestation> {
        let at = db::now();
        self.set_meta("authorized_by", by)?;
        self.set_meta("authorized_at", &at.to_string())?;
        self.conn.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('first_authorized_at', ?1)", [at.to_string()])?;
        Ok(self.attestation()?.unwrap_or(Attestation { by: by.to_string(), first_at: at, at }))
    }

    /// Re-confirms the attestation as the current OS user.
    pub fn reconfirm_attestation(&self) -> AppResult<Attestation> {
        self.set_attestation(&os_user())
    }

    pub fn scope_list(&self) -> AppResult<Vec<Rule>> {
        let mut st = self.conn.prepare("SELECT id, kind, effect, pattern, normalized, note FROM scope_rule ORDER BY effect, id")?;
        let rows = st
            .query_map([], |r| {
                let kind: String = r.get(1)?;
                let effect: String = r.get(2)?;
                Ok(Rule {
                    id: Some(r.get(0)?),
                    kind: Kind::parse(&kind).unwrap_or(Kind::Domain),
                    effect: Effect::parse(&effect).unwrap_or(Effect::Out),
                    pattern: r.get(3)?,
                    normalized: r.get(4)?,
                    note: r.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    /// Adds rules, skipping any the engagement already has. Returns how many were added.
    pub fn scope_add(&mut self, rules: &[Rule]) -> AppResult<usize> {
        let tx = self.conn.transaction()?;
        let mut added = 0;
        {
            let mut st = tx.prepare(
                "INSERT OR IGNORE INTO scope_rule (kind, effect, pattern, normalized, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )?;
            let at = db::now();
            for r in rules {
                added += st.execute(params![r.kind.as_str(), r.effect.as_str(), r.pattern, r.normalized, r.note, at])?;
            }
        }
        tx.commit()?;
        Ok(added)
    }

    pub fn scope_delete(&self, id: i64) -> AppResult<()> {
        let n = self.conn.execute("DELETE FROM scope_rule WHERE id = ?1", [id])?;
        if n == 0 {
            return Err(AppError::new(ErrorCode::NotFound, "That rule no longer exists."));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new(name: &str) -> NewEngagement {
        NewEngagement {
            name: name.into(),
            client: Some(" Acme Corp ".into()),
            notes: Some("  ".into()),
            in_text: "acme.example\n*.acme.example\n203.0.113.0/24".into(),
            out_text: "- *.legacy.acme.example".into(),
            authorized: true,
        }
    }

    #[test]
    fn create_open_update_delete() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Store::open(dir.path()).unwrap();
        let e = s.create(new("acme.example")).unwrap();
        assert_eq!((e.client.as_deref(), e.notes.as_deref()), (Some("Acme Corp"), None));
        let folder = dir.path().join("engagements").join(&e.id);
        assert!(folder.join("engagement.db").is_file());

        let (_, edb) = s.open_engagement(&e.id).unwrap();
        let rules = edb.scope_list().unwrap();
        assert_eq!(rules.len(), 4);
        assert_eq!(rules.iter().filter(|r| r.effect == Effect::Out).count(), 1);
        assert!(edb.attestation().unwrap().is_some());
        assert_eq!(s.last_engagement().unwrap().as_deref(), Some(e.id.as_str()));
        drop(edb);

        let u = s.update(&e.id, "Acme main", None, Some("notes".into())).unwrap();
        assert_eq!((u.name.as_str(), u.client, u.notes.as_deref()), ("Acme main", None, Some("notes")));

        assert_eq!(s.delete(&e.id, "acme main").unwrap_err().code, ErrorCode::ConfirmMismatch);
        assert!(folder.exists());
        s.delete(&e.id, "Acme main").unwrap();
        assert!(!folder.exists());
        assert!(s.list().unwrap().is_empty());
        assert_eq!(s.last_engagement().unwrap(), None);
    }

    #[test]
    fn names_are_unique_and_authorization_is_required() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Store::open(dir.path()).unwrap();
        s.create(new("acme.example")).unwrap();
        assert_eq!(s.create(new("ACME.example")).unwrap_err().code, ErrorCode::NameTaken);
        let mut n = new("globex.example");
        n.authorized = false;
        assert_eq!(s.create(n).unwrap_err().code, ErrorCode::AttestationRequired);
        assert_eq!(s.create(new("  ")).unwrap_err().code, ErrorCode::Invalid);
        assert_eq!(s.list().unwrap().len(), 1);
        // A failed create leaves no folder behind.
        assert_eq!(std::fs::read_dir(dir.path().join("engagements")).unwrap().count(), 1);
    }

    #[test]
    fn engagements_keep_separate_scope() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Store::open(dir.path()).unwrap();
        let a = s.create(new("a")).unwrap();
        let mut nb = new("b");
        nb.in_text = "globex.example".into();
        nb.out_text = String::new();
        let b = s.create(nb).unwrap();
        let (_, mut eb) = s.open_engagement(&b.id).unwrap();
        assert_eq!(eb.scope_list().unwrap().len(), 1);
        assert_eq!(eb.scope_add(&[Rule::from_input("globex.example", Effect::In).unwrap()]).unwrap(), 0);
        let (_, ea) = s.open_engagement(&a.id).unwrap();
        assert_eq!(ea.scope_list().unwrap().len(), 4);
        assert_eq!(s.list().unwrap()[0].id, a.id);
    }
}
