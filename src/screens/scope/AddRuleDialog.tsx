import { useState } from "react";
import { scopeApply, type AppError, type Effect, type PreviewRule } from "../../ipc";
import { Dialog } from "../../ui/Dialog";
import { Segmented } from "../../ui/Segmented";
import { usePreview } from "./preview";

type Props = { onClose: () => void; onApplied: (added: number) => void };

function describe(r: PreviewRule): string {
  const v = r.normalized;
  switch (r.kind) {
    case "domain":
      return `Detected kind: domain. Matches ${v} only, not its subdomains.`;
    case "wildcard": {
      const base = v.slice(2);
      return `Detected kind: wildcard. Matches any subdomain of ${base}, not ${base} itself.`;
    }
    case "pattern":
      return "Detected kind: pattern. Each * matches one or more characters inside a label; a leading *. or trailing .* matches whole labels. Match only: not used to start enumeration.";
    case "ip":
      return `Detected kind: IP. Matches hosts that resolve to ${v}.`;
    case "cidr":
      return `Detected kind: CIDR. Matches hosts that resolve into ${v}.`;
  }
}

// Add one rule (SCOPE-01) with an optional note.
export function AddRuleDialog({ onClose, onApplied }: Props) {
  const [pattern, setPattern] = useState("");
  const [effect, setEffect] = useState<Effect>("in");
  const [note, setNote] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const one = pattern.trim().split(/[\s,]+/)[0] ?? "";
  const preview = usePreview(effect === "in" ? one : "", effect === "out" ? one : "");

  const rule = preview?.rules[0];
  const invalid = preview?.invalid[0];
  const hints = preview?.hints ?? [];
  const canApply = !!rule && !rule.existing && (effect === "out" || authorized) && !busy;

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await scopeApply(effect === "in" ? one : "", effect === "out" ? one : "", note || null, effect === "in" && authorized);
      onApplied(r.added);
    } catch (e) {
      setError((e as AppError).message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Add rule"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canApply} onClick={apply}>Add rule</button>
        </>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor="a-p">Pattern</label>
        <input
          className="input"
          id="a-p"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="*.shop.acme.example"
          spellCheck={false}
          aria-invalid={invalid ? true : undefined}
          aria-describedby="a-p-h"
          style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
          onKeyDown={(e) => e.key === "Enter" && canApply && apply()}
        />
        {invalid ? (
          <span className="field-error" id="a-p-h">{invalid.reason}</span>
        ) : rule?.existing ? (
          <span className="field-hint" id="a-p-h">This rule is already saved.</span>
        ) : rule ? (
          <span className="field-hint" id="a-p-h">{describe(rule)}</span>
        ) : (
          <span className="field-hint" id="a-p-h">A domain, wildcard, pattern, URL, IP or CIDR range.</span>
        )}
        {hints
          .filter((h) => h.code !== "match_only")
          .map((h) => (
            <span key={h.code} className="meta" style={{ color: "var(--warning)" }}>{h.message}</span>
          ))}
      </div>
      <div className="field">
        <span className="field-label">Effect</span>
        <div>
          <Segmented label="Effect" value={effect} onChange={setEffect} options={[{ value: "in", label: "In scope" }, { value: "out", label: "Out of scope" }]} />
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="a-n">Note (optional)</label>
        <input className="input" id="a-n" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this rule exists" />
      </div>
      {effect === "in" && (
        <label className="choice">
          <input type="checkbox" className="check" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
          <span>I am authorized to test this scope.</span>
        </label>
      )}
      {error && <div className="callout callout-err" role="alert"><span>{error}</span></div>}
    </Dialog>
  );
}
