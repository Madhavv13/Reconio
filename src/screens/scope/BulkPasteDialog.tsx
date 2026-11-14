import { useState } from "react";
import { scopeApply, type AppError, type Effect } from "../../ipc";
import { Dialog } from "../../ui/Dialog";
import { Segmented } from "../../ui/Segmented";
import { fmt, plural } from "../../ui/format";
import { ScopePreview, applyHintAction, usePreview } from "./preview";

type Props = {
  onClose: () => void;
  onApplied: (added: number) => void;
  /** Prefilled from a file import (SCOPE-03). */
  initial?: { in: string; out: string; target: Effect; note?: string };
};

const EFFECTS: { value: Effect; label: string }[] = [
  { value: "in", label: "In scope" },
  { value: "out", label: "Out of scope" },
];

// Bulk paste (SCOPE-02) on the Scope screen. "Add to" picks which list the box edits; a hint
// action may add a rule to the other list, which is shown below the box.
export function BulkPasteDialog({ onClose, onApplied, initial }: Props) {
  const [texts, setTexts] = useState({ in: initial?.in ?? "", out: initial?.out ?? "" });
  const [target, setTarget] = useState<Effect>(initial?.target ?? "in");
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = usePreview(texts.in, texts.out);

  const fresh = preview?.rules.filter((r) => !r.existing) ?? [];
  const addsIn = fresh.some((r) => r.effect === "in");
  const other: Effect = target === "in" ? "out" : "in";
  const otherLines = texts[other].split("\n").filter((l) => l.trim()).length;
  const canApply = fresh.length > 0 && (!addsIn || authorized) && !busy;

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await scopeApply(texts.in, texts.out, null, addsIn && authorized);
      onApplied(r.added);
    } catch (e) {
      setError((e as AppError).message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Bulk paste rules"
      onClose={onClose}
      width={760}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canApply} onClick={apply}>
            {fresh.length ? `Add ${plural(fresh.length, "rule")}` : "Add rules"}
          </button>
        </>
      }
    >
      <p className="dialog-text">
        Paste one list from the program page, one rule per line. List bullets and lines that start with <span className="mono">#</span> are ignored.
      </p>
      {initial?.note && <p className="meta muted">{initial.note}</p>}
      <div className="field">
        <span className="field-label">Add to</span>
        <div><Segmented label="Add to" value={target} options={EFFECTS} onChange={setTarget} /></div>
      </div>
      <textarea
        className="textarea"
        rows={7}
        aria-label={target === "in" ? "In-scope rules" : "Out-of-scope rules"}
        spellCheck={false}
        value={texts[target]}
        onChange={(e) => setTexts({ ...texts, [target]: e.target.value })}
      />
      {otherLines > 0 && (
        <span className="meta muted">
          Also adding {fmt(otherLines)} {otherLines === 1 ? "line" : "lines"} to {other === "in" ? "In scope" : "Out of scope"}. Switch Add to to see them.
        </span>
      )}
      {preview && (preview.rules.length > 0 || preview.invalid.length > 0) && (
        <ScopePreview
          preview={preview}
          onAction={(a, r) => setTexts(applyHintAction(texts, a, r.source))}
          footnote="Nothing is saved until you confirm."
        />
      )}
      {addsIn && (
        <label className="choice">
          <input type="checkbox" className="check" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
          <span>I am authorized to test this scope.</span>
        </label>
      )}
      {error && <div className="callout callout-err" role="alert"><span>{error}</span></div>}
    </Dialog>
  );
}
