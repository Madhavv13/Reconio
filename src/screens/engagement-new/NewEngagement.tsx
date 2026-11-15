import { useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useEngagement } from "../../state/engagement";
import { type AppError } from "../../ipc";
import { ScopePreview, applyHintAction, usePreview } from "../scope/preview";

type Props = {
  /** Called after the engagement is created and opened. */
  onCreated: () => void;
  /** App variant: Cancel goes back. Absent when there is no engagement to go back to. */
  onCancel?: () => void;
  /** Onboarding variant (step 4): a Back button and the "First engagement" card. */
  onBack?: () => void;
  /** Extra buttons in the footer, before the primary button. */
  footerExtra?: ReactNode;
};

const ic = { className: "ic", strokeWidth: 1.5, "aria-hidden": true } as const;

// New engagement (ENG-01, SCOPE-02, SCOPE-12, ENG-04): name, client, the two scope lists
// as the program page publishes them, a live preview, and the authorization checkbox.
// Used by the app (mockup engagement-new.html) and by onboarding step 4
// (mockup onboarding-4-engagement.html).
export function NewEngagement({ onCreated, onCancel, onBack, footerExtra }: Props) {
  const onboarding = !!onBack;
  const { create } = useEngagement();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [texts, setTexts] = useState({ in: "", out: "" });
  const [authorized, setAuthorized] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const preview = usePreview(texts.in, texts.out, true);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await create({ name, client: client || null, notes: null, in_text: texts.in, out_text: texts.out, authorized });
      onCreated();
    } catch (e) {
      setError(e as AppError);
    } finally {
      setBusy(false);
    }
  };

  const nameError = error && (error.code === "name_taken" || error.code === "invalid") ? error.message : null;
  const ready = authorized && name.trim().length > 0 && !busy;

  const card = (
    <section className={onboarding ? "panel onb-card" : "panel"} style={onboarding ? { width: 820 } : undefined}>
      <div className="panel-head">
        <h2 className="panel-title">{onboarding ? "First engagement" : "New engagement"}</h2>
        {!onboarding && <span className="meta muted">Creates its own database. Results are never shared between engagements.</span>}
      </div>
      <div className="panel-body stack" style={{ gap: "var(--space-5)" }}>
        <div className="cols" style={{ gap: "var(--space-4)" }}>
          <div className="field">
            <label className="field-label" htmlFor="e-name">Name</label>
            <input
              className="input"
              id="e-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="acme.example"
              aria-invalid={nameError ? true : undefined}
              aria-describedby="e-name-h"
              autoFocus
            />
            {nameError ? (
              <span className="field-error" id="e-name-h">{nameError}</span>
            ) : (
              <span className="field-hint" id="e-name-h">Shown in the switcher and the window title.</span>
            )}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="e-client">Client (optional)</label>
            <input className="input" id="e-client" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Company or program" />
          </div>
        </div>

        <div className="stack" style={{ gap: "var(--space-2)" }}>
          <div className="cols" style={{ gap: "var(--space-4)" }}>
            <div className="field">
              <label className="field-label" htmlFor="e-in">In scope</label>
              <textarea className="textarea" id="e-in" rows={6} spellCheck={false} aria-describedby="e-scope-h" value={texts.in} onChange={(e) => setTexts({ ...texts, in: e.target.value })} placeholder={"acme.example\n*.acme.example"} />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="e-out">Out of scope</label>
              <textarea className="textarea" id="e-out" rows={6} spellCheck={false} aria-describedby="e-scope-h" value={texts.out} onChange={(e) => setTexts({ ...texts, out: e.target.value })} placeholder={"- *.legacy.acme.example"} />
            </div>
          </div>
          <span className="field-hint" id="e-scope-h">
            Paste each list from the program page, one rule per line. Domains, wildcards, URLs, IPs and CIDR ranges are detected automatically.{" "}
            {onboarding ? "You can also import a file later in Scope." : "List bullets are ignored."}
          </span>
        </div>

        {preview && (preview.rules.length > 0 || preview.invalid.length > 0) && (
          <ScopePreview
            preview={preview}
            onAction={(a, r) => setTexts(applyHintAction(texts, a, r.source))}
            footnote="Nothing is saved until you create the engagement."
          />
        )}

        <label className="choice" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" className="check" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            <span className="body-strong">I am authorized to test this scope.</span>
            <br />
            <span className="meta muted">Reconio records your OS user name and the time with the engagement.</span>
          </span>
        </label>

        {error && !nameError && (
          <div className="callout callout-err" role="alert">
            <span>{error.message}</span>
          </div>
        )}
      </div>
      <div className="onb-foot">
        {onBack && <button type="button" className="btn btn-plain" onClick={onBack}><ArrowLeft {...ic} />Back</button>}
        {onCancel && <button type="button" className="btn btn-plain" onClick={onCancel}>Cancel</button>}
        <span className="spacer" />
        {footerExtra}
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={submit}>
          {busy ? "Creating" : "Create engagement"}
        </button>
      </div>
    </section>
  );

  return onboarding ? card : <div className="page page-narrow">{card}</div>;
}
