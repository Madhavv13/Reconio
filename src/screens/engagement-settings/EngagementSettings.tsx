import { useEffect, useState } from "react";
import { FolderOpen, Trash2 } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Screen } from "../../shell/Screen";
import { useEngagement } from "../../state/engagement";
import type { AppError } from "../../ipc";
import { Dialog } from "../../ui/Dialog";
import { fmtBytes, fmtTime } from "../../ui/format";

const ic = { className: "ic", strokeWidth: 1.5, "aria-hidden": true } as const;

// Engagement settings: details, authorization record (ENG-03), storage, delete (ENG-06).
export function EngagementSettings() {
  const { active, update, remove } = useEngagement();
  const e = active?.engagement;
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setName(e?.name ?? "");
    setClient(e?.client ?? "");
    setNotes(e?.notes ?? "");
    setSaved(false);
    setError(null);
  }, [e?.id, e?.name, e?.client, e?.notes]);

  if (!active || !e) return null;
  const dirty = name !== e.name || client !== (e.client ?? "") || notes !== (e.notes ?? "");

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await update(name, client || null, notes || null);
      setSaved(true);
    } catch (err) {
      setError(err as AppError);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setDeleteError(null);
    try {
      await remove(typed);
    } catch (err) {
      setDeleteError((err as AppError).message);
    }
  };

  const att = active.attestation;

  return (
    <Screen title="Engagement settings" meta={e.name}>
      <div className="page page-narrow">
        <section className="panel">
          <div className="panel-head"><span className="panel-title">Details</span></div>
          <div className="panel-body stack">
            <div className="cols" style={{ gap: "var(--space-4)" }}>
              <div className="field">
                <label className="field-label" htmlFor="s-name">Name</label>
                <input className="input" id="s-name" value={name} onChange={(x) => { setName(x.target.value); setSaved(false); }} aria-invalid={error ? true : undefined} aria-describedby="s-name-h" />
                {error && <span className="field-error" id="s-name-h">{error.message}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="s-client">Client</label>
                <input className="input" id="s-client" value={client} onChange={(x) => { setClient(x.target.value); setSaved(false); }} placeholder="Company or program" />
              </div>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="s-notes">Notes</label>
              <textarea className="textarea" id="s-notes" rows={3} value={notes} onChange={(x) => { setNotes(x.target.value); setSaved(false); }} placeholder="Program rules, rate limits, contacts" style={{ fontFamily: "var(--font-sans)", fontSize: 14 }} />
            </div>
            <div className="row">
              {saved && !dirty && <span className="meta muted" role="status">Saved.</span>}
              <span className="spacer" />
              <button type="button" className="btn btn-primary" disabled={!dirty || saving} onClick={save}>{saving ? "Saving" : "Save changes"}</button>
            </div>
          </div>
        </section>

        <div className="cols">
          <section className="panel">
            <div className="panel-head"><span className="panel-title">Authorization</span></div>
            <div className="panel-body">
              {att ? (
                <dl className="kv">
                  <dt>Attested by</dt><dd>{att.by} (OS user)</dd>
                  <dt>First attested</dt><dd>{fmtTime(att.first_at)}</dd>
                  <dt>Last confirmed</dt><dd>{fmtTime(att.at)}</dd>
                </dl>
              ) : (
                <p className="meta muted">No attestation recorded.</p>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head"><span className="panel-title">Storage</span></div>
            <div className="panel-body stack">
              <dl className="kv">
                <dt>Folder</dt><dd style={{ wordBreak: "break-all" }}>{active.folder}</dd>
                <dt>Size</dt><dd>{fmtBytes(active.size_bytes)}</dd>
                <dt>Created</dt><dd>{fmtTime(e.created_at)}</dd>
              </dl>
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => revealItemInDir(`${active.folder}/engagement.db`)}><FolderOpen {...ic} />Open folder</button>
              </div>
            </div>
          </section>
        </div>

        <section className="panel">
          <div className="panel-head"><span className="panel-title">Engagement actions</span></div>
          <div className="set-row">
            <div className="set-text">
              <span className="body-strong">Delete</span>
              <span className="meta muted">Removes the folder, database and logs of this engagement.</span>
            </div>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => { setTyped(""); setDeleteError(null); setDeleting(true); }}>
              <Trash2 {...ic} />Delete engagement
            </button>
          </div>
        </section>
      </div>

      {deleting && (
        <Dialog
          title={`Delete ${e.name}`}
          alert
          onClose={() => setDeleting(false)}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setDeleting(false)}>Cancel</button>
              <button type="button" className="btn btn-danger" disabled={typed.trim() !== e.name} onClick={confirmDelete}><Trash2 {...ic} />Delete engagement</button>
            </>
          }
        >
          <p className="dialog-text">
            This deletes the engagement's scope, results and logs ({fmtBytes(active.size_bytes)}). It cannot be undone. The operating system does not guarantee secure erase of deleted files.
          </p>
          <div className="field">
            <label className="field-label" htmlFor="dl-in">Type <span className="mono" style={{ color: "var(--text-1)" }}>{e.name}</span> to confirm</label>
            <input className="input" id="dl-in" value={typed} onChange={(x) => setTyped(x.target.value)} autoComplete="off" spellCheck={false} style={{ fontFamily: "var(--font-mono)", fontSize: 13 }} />
          </div>
          {deleteError && <span className="field-error" role="alert">{deleteError}</span>}
        </Dialog>
      )}
    </Screen>
  );
}
