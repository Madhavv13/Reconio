//! SQLite storage (PRD §10). Layout under the data folder:
//!
//! ```text
//! Reconio/
//!   app.db
//!   engagements/<uuid>/engagement.db, logs/, backups/
//! ```

use crate::error::{AppError, AppResult, ErrorCode};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const APP_MIGRATIONS: &[&str] = &[include_str!("sql/app_v1.sql")];
pub const ENGAGEMENT_MIGRATIONS: &[&str] = &[include_str!("sql/engagement_v1.sql")];

pub fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// The default data folder: `<OS data dir>/Reconio`. `RECONIO_DATA_DIR` overrides it (tests, portable use).
pub fn default_data_dir(os_data_dir: PathBuf) -> PathBuf {
    std::env::var_os("RECONIO_DATA_DIR").map(PathBuf::from).unwrap_or_else(|| os_data_dir.join("Reconio"))
}

/// Opens a database with Reconio's settings: WAL and synchronous=NORMAL (NFR-R1), foreign keys on.
pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(conn)
}

/// Brings a database up to the latest schema. Migrations are forward only and run in one
/// transaction. An existing database is copied to `backup_dir` first (UPD-04).
pub fn migrate(conn: &mut Connection, migrations: &[&str], backup_dir: Option<&Path>) -> AppResult<()> {
    let version: usize = conn.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))? as usize;
    if version > migrations.len() {
        return Err(AppError::new(
            ErrorCode::Db,
            format!("This database was written by a newer Reconio (schema v{version}). Update Reconio to open it."),
        ));
    }
    if version == migrations.len() {
        return Ok(());
    }
    if version > 0 {
        if let Some(dir) = backup_dir {
            std::fs::create_dir_all(dir)?;
            let file = dir.join(format!("before-v{}-{}.db", migrations.len(), now()));
            conn.execute("VACUUM INTO ?1", [file.to_string_lossy()])?;
        }
    }
    let tx = conn.transaction()?;
    for m in &migrations[version..] {
        tx.execute_batch(m)?;
    }
    tx.pragma_update(None, "user_version", migrations.len() as i64)?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_databases_reach_the_latest_version() {
        let dir = tempfile::tempdir().unwrap();
        for (name, migs) in [("app.db", APP_MIGRATIONS), ("engagement.db", ENGAGEMENT_MIGRATIONS)] {
            let mut c = open(&dir.path().join(name)).unwrap();
            migrate(&mut c, migs, Some(dir.path())).unwrap();
            let v: i64 = c.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
            assert_eq!(v as usize, migs.len());
            // Running again is a no-op.
            migrate(&mut c, migs, Some(dir.path())).unwrap();
        }
    }

    #[test]
    fn upgrades_take_a_backup_and_newer_schemas_are_refused() {
        let dir = tempfile::tempdir().unwrap();
        let mut c = open(&dir.path().join("x.db")).unwrap();
        migrate(&mut c, &["CREATE TABLE a (x)"], None).unwrap();
        migrate(&mut c, &["CREATE TABLE a (x)", "CREATE TABLE b (y)"], Some(&dir.path().join("backups"))).unwrap();
        assert_eq!(std::fs::read_dir(dir.path().join("backups")).unwrap().count(), 1);
        let e = migrate(&mut c, &["CREATE TABLE a (x)"], None).unwrap_err();
        assert!(e.message.contains("newer Reconio"));
    }
}
