import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ClipboardPaste, Plus, Search, Shield, Trash2, Upload } from "lucide-react";
import { Screen } from "../../shell/Screen";
import { useEngagement } from "../../state/engagement";
import {
  scopeDelete, scopeImport, scopeList, scopeTest,
  type AppError, type Decision, type Effect, type Rule, type ScopeView,
} from "../../ipc";
import { KIND_LABEL, fmt, fmtTime, plural } from "../../ui/format";
import { Segmented } from "../../ui/Segmented";
import { announce, keepFocus } from "../../ui/a11y";
import { AddRuleDialog } from "./AddRuleDialog";
import { BulkPasteDialog } from "./BulkPasteDialog";

const ic = { className: "ic", strokeWidth: 1.5, "aria-hidden": true } as const;

function RuleRow({ rule, last, onDelete }: { rule: Rule; last: boolean; onDelete: () => void }) {
  return (
    <div className={`scope-row${rule.effect === "out" ? " out" : ""}`} style={last ? { borderBottom: 0 } : undefined}>
      <span className="data" style={{ minWidth: 220 }} title={rule.pattern !== rule.normalized ? `Entered as ${rule.pattern}` : undefined}>
        {rule.normalized}
      </span>
      <span className="tag">{KIND_LABEL[rule.kind]}</span>
      {rule.effect === "out" && <span className="tag tag-out">Out of scope</span>}
      <span className="meta muted grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.note ?? ""}</span>
      <button type="button" className="btn btn-sm btn-plain btn-icon" aria-label={`Remove ${rule.normalized}`} title="Remove rule" onClick={onDelete}>
        <Trash2 {...ic} />
      </button>
    </div>
  );
}

function TestResult({ input, d }: { input: string; d: Decision }) {
  const by = d.rule ? <span className="mono" style={{ color: "var(--text-1)" }}>{d.rule.normalized}</span> : null;
  let tag, text;
  if (d.verdict === "pending") {
    tag = <span className="tag">Pending</span>;
    text = <>No hostname rule matches. In-scope IP or CIDR rules exist, so a run resolves it and decides with its IPs.</>;
  } else if (d.verdict === "in") {
    tag = <span className="tag tag-scope"><Check {...ic} />In scope</span>;
    text = <>Decided by {by}{d.reason === "ip_in_rule" ? ", an in-scope IP rule" : ""}.</>;
  } else if (d.rule) {
    tag = <span className="tag tag-out">Out of scope</span>;
    text = <>Decided by {by}, an out-of-scope rule.</>;
  } else {
    tag = <span className="tag tag-out">Out of scope</span>;
    text = <>No in-scope rule matches <span className="mono">{input.trim()}</span>.</>;
  }
  return (
    <div className="well row wrap" style={{ fontFamily: "var(--font-sans)" }}>
      {tag}
      <span className="meta muted">{text}</span>
    </div>
  );
}

type Import = { in: string; out: string; target: Effect; note?: string };

// Scope (SCOPE-01 to SCOPE-03, SCOPE-06, SCOPE-08, SCOPE-09).
export function ScopeScreen() {
  const { active, refresh } = useEngagement();
  const [view, setView] = useState<ScopeView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "paste" | "add">(null);
  const [imported, setImported] = useState<Import | undefined>();
  const [importList, setImportList] = useState<Effect>("in");
  const [test, setTest] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setView(await scopeList());
      setError(null);
    } catch (e) {
      setError((e as AppError).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, active?.engagement.id]);

  useEffect(() => {
    if (!test.trim()) {
      setDecision(null);
      setTestError(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      scopeTest(test)
        .then((d) => live && (setDecision(d), setTestError(null)))
        .catch((e) => live && (setDecision(null), setTestError((e as AppError).message)));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [test, view]);

  const applied = async (added: number) => {
    setDialog(null);
    setImported(undefined);
    const msg = added ? `${plural(added, "rule")} added.` : "No new rules. Every rule was already saved.";
    setNotice(msg);
    announce(msg);
    await Promise.all([load(), refresh()]);
  };

  const remove = async (r: Rule) => {
    if (r.id == null) return;
    try {
      await scopeDelete(r.id);
      setNotice(`${r.normalized} removed.`);
      announce(`${r.normalized} removed.`);
      await Promise.all([load(), refresh()]);
      // The row and its delete button are gone; keep focus on the screen (2.4.3).
      keepFocus();
    } catch (e) {
      setError((e as AppError).message);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const r = await scopeImport(text, f.name, importList);
    const note = r.skipped.length
      ? `${plural(r.skipped.length, "row")} from ${f.name} skipped: ${r.skipped.slice(0, 3).map((s) => `${s.text} (${s.reason})`).join(", ")}${r.skipped.length > 3 ? ", …" : ""}.`
      : `From ${f.name}.`;
    setImported({ in: r.in_text, out: r.out_text, target: r.in_text.trim() ? "in" : "out", note });
    setDialog("paste");
    if (file.current) file.current.value = "";
  };

  const ins = view?.rules.filter((r) => r.effect === "in") ?? [];
  const outs = view?.rules.filter((r) => r.effect === "out") ?? [];
  const att = active?.attestation;

  return (
    <Screen
      title="Scope"
      meta="Applied at every stage boundary"
      actions={
        <>
          <button type="button" className="btn btn-sm" onClick={() => setDialog("paste")}><ClipboardPaste {...ic} />Bulk paste</button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setDialog("add")}><Plus {...ic} />Add rule</button>
        </>
      }
    >
      <div className="page">
        {error && <div className="callout callout-err" role="alert"><span>{error}</span></div>}
        {notice && (
          <div className="callout callout-ok banner">
            <span>{notice}</span>
            <div className="callout-actions"><button type="button" className="btn btn-sm btn-plain" onClick={() => { setNotice(null); keepFocus(); }}>Dismiss</button></div>
          </div>
        )}
        {view?.block && view.rules.length > 0 && (
          <div className="callout callout-warn" role="status">
            <span><span className="callout-title">A run cannot start with this scope.</span> {view.block.message}</span>
          </div>
        )}
        <div className="cols-side">
          <div className="stack" style={{ gap: "var(--space-6)" }}>
            {view && view.rules.length === 0 ? (
              <section className="panel">
                <div className="state" style={{ padding: "var(--space-8) var(--space-6)" }}>
                  <Shield {...ic} />
                  <div className="state-title">No scope rules yet</div>
                  <div className="state-text">A run cannot start without at least one in-scope rule. Paste the scope from the program brief, one rule per line.</div>
                  <div className="row" style={{ paddingTop: "var(--space-2)" }}>
                    <button type="button" className="btn btn-lg" onClick={() => setDialog("paste")}><ClipboardPaste {...ic} />Bulk paste rules</button>
                  </div>
                </div>
              </section>
            ) : (
              <>
                <section className="panel">
                  <div className="panel-head"><h2 className="panel-title">In scope</h2><span className="count">{fmt(ins.length)}</span></div>
                  {ins.length ? ins.map((r, i) => <RuleRow key={r.id} rule={r} last={i === ins.length - 1} onDelete={() => remove(r)} />) : (
                    <div className="state"><div className="state-text">No in-scope rules. A run cannot start until you add one.</div></div>
                  )}
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <h2 className="panel-title">Out of scope</h2><span className="count">{fmt(outs.length)}</span>
                    <span className="meta muted" style={{ marginLeft: "var(--space-2)" }}>Out of scope always wins</span>
                  </div>
                  {outs.length ? outs.map((r, i) => <RuleRow key={r.id} rule={r} last={i === outs.length - 1} onDelete={() => remove(r)} />) : (
                    <div className="state"><div className="state-text">No out-of-scope rules. Add the program's exclusions so they are never tested.</div></div>
                  )}
                </section>
              </>
            )}
          </div>

          <div className="stack" style={{ gap: "var(--space-6)", alignContent: "start" }}>
            <section className="panel">
              <div className="panel-head"><h2 className="panel-title">Test a host</h2></div>
              <div className="panel-body stack">
                <label className="search">
                  <Search {...ic} />
                  <input value={test} onChange={(e) => setTest(e.target.value)} placeholder="api.acme.example" aria-label="Host, URL or IP to test" aria-invalid={testError ? true : undefined} aria-describedby={testError ? "scope-test-error" : undefined} spellCheck={false} style={{ fontFamily: "var(--font-mono)", fontSize: 13 }} />
                </label>
                {/* Always mounted, so screen readers read each new answer (4.1.3). */}
                <div aria-live="polite" className="stack" style={{ gap: 0 }}>
                  {decision && <TestResult input={test} d={decision} />}
                  {testError && <span className="field-error" id="scope-test-error">{testError}</span>}
                </div>
                <p className="meta faint">Uses the same matcher as the pipeline. IP rules apply when the host has resolved IPs.</p>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2 className="panel-title">Root domains</h2><span className="count">{fmt(view?.roots.length ?? 0)}</span></div>
              <div className="panel-body stack">
                {view?.roots.length ? (
                  <div className="well" style={{ display: "grid", gap: 4 }}>
                    {view.roots.map((r) => <span key={r} className="data">{r}</span>)}
                  </div>
                ) : (
                  <p className="meta muted">None yet. In-scope domain and wildcard rules give the domains subfinder enumerates.</p>
                )}
                <p className="meta faint">Only these are sent to subfinder's passive sources. Every host found under them is still checked against the full scope.</p>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2 className="panel-title">Authorization</h2></div>
              <div className="panel-body stack">
                {att ? (
                  <dl className="kv">
                    <dt>Attested by</dt><dd>{att.by}</dd>
                    <dt>First attested</dt><dd>{fmtTime(att.first_at)}</dd>
                    <dt>Last confirmed</dt><dd>{fmtTime(att.at)}</dd>
                  </dl>
                ) : (
                  <p className="meta muted">No attestation recorded.</p>
                )}
                <p className="meta faint">Adding an in-scope rule asks you to confirm authorization again.</p>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head"><h2 className="panel-title">Import from a file</h2></div>
              <div className="panel-body stack">
                <div className="field">
                  <span className="field-label">A .txt file goes to</span>
                  <div><Segmented label="Import into" value={importList} onChange={setImportList} options={[{ value: "in", label: "In scope" }, { value: "out", label: "Out of scope" }]} /></div>
                </div>
                <div
                  className="dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    onFile(e.dataTransfer.files[0]);
                  }}
                >
                  <Upload {...ic} />
                  <span className="label">Drop a .txt or .csv file</span>
                  <span className="meta faint">Same rules as bulk paste. A .csv can say per row with an effect column, or HackerOne's eligible_for_submission.</span>
                  <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>Choose file</button>
                  <input ref={file} type="file" accept=".txt,.csv,text/plain,text/csv" hidden aria-hidden="true" tabIndex={-1} onChange={(e) => onFile(e.target.files?.[0])} />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {dialog === "paste" && (
        <BulkPasteDialog initial={imported} onClose={() => { setDialog(null); setImported(undefined); }} onApplied={applied} />
      )}
      {dialog === "add" && <AddRuleDialog onClose={() => setDialog(null)} onApplied={applied} />}
    </Screen>
  );
}
