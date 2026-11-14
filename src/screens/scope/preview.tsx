import { useEffect, useState } from "react";
import { scopeParsePreview, type Effect, type Hint, type HintAction, type Preview, type PreviewRule } from "../../ipc";
import { KIND_LABEL, fmt, plural } from "../../ui/format";

/** Parses both boxes in the Rust core as the user types (200 ms debounce). */
export function usePreview(inText: string, outText: string, fresh = false): Preview | null {
  const [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => {
    if (!inText.trim() && !outText.trim()) {
      setPreview(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      scopeParsePreview(inText, outText, fresh).then((p) => live && setPreview(p));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [inText, outText, fresh]);
  return preview;
}

/** Applies a hint action to the two boxes: replace a rule where it was typed, or add one line. */
export function applyHintAction(
  texts: { in: string; out: string },
  action: HintAction,
  source: Effect,
): { in: string; out: string } {
  const next = { ...texts };
  if (action.replace) {
    next[source] = next[source].replace(action.replace, action.pattern);
  } else {
    const t = next[action.effect];
    next[action.effect] = (t && !t.endsWith("\n") ? t + "\n" : t) + action.pattern;
  }
  return next;
}

const SHOW_MAX = 500;
const WARN_CODES = new Set(["path_ignored", "base_not_in_scope", "base_still_in_scope", "did_you_mean"]);

function HintLine({ hint, onAction }: { hint: Hint; onAction: (a: HintAction) => void }) {
  return (
    <span className="row" style={{ gap: "var(--space-2)", marginLeft: "auto", minWidth: 0 }}>
      <span className={`meta${WARN_CODES.has(hint.code) ? "" : " muted"}`} style={WARN_CODES.has(hint.code) ? { color: "var(--warning)" } : undefined}>
        {hint.message}
      </span>
      {hint.action && (
        <button type="button" className="btn btn-sm" onClick={() => onAction(hint.action!)}>
          {hint.action.label}
        </button>
      )}
    </span>
  );
}

type Props = {
  preview: Preview;
  onAction: (action: HintAction, rule: PreviewRule) => void;
  /** Sentence after the counts, for example "Nothing is saved until you create the engagement." */
  footnote: string;
};

// The parsed-rules preview (SCOPE-02, SCOPE-12): every rule with its kind and effect, its
// hints and their one-click actions, then every invalid line with the reason.
export function ScopePreview({ preview, onAction, footnote }: Props) {
  const rows = preview.rules.slice(0, SHOW_MAX);
  const hintsFor = (r: PreviewRule) => preview.hints.filter((h) => h.rule === r.pattern && h.effect === r.effect);
  const nIn = preview.rules.filter((r) => r.effect === "in" && !r.existing).length;
  const nOut = preview.rules.filter((r) => r.effect === "out" && !r.existing).length;
  const nExisting = preview.rules.filter((r) => r.existing).length;

  return (
    <div className="stack" style={{ gap: "var(--space-2)" }}>
      <div className="well" style={{ padding: 0, fontFamily: "var(--font-sans)", maxHeight: 360, overflow: "auto" }}>
        {rows.map((r, i) => (
          <div key={`${r.effect}${r.kind}${r.normalized}`} className={`scope-row${r.effect === "out" ? " out" : ""}`} style={{ height: "auto", minHeight: "var(--size-row)", flexWrap: "wrap", padding: "6px var(--space-3)", borderBottom: i === rows.length - 1 && !preview.invalid.length ? 0 : undefined }}>
            <span className="data" style={{ minWidth: 220 }}>{r.normalized}</span>
            <span className="tag">{KIND_LABEL[r.kind]}</span>
            {r.effect === "out" ? <span className="tag tag-out">Out of scope</span> : <span className="tag tag-scope">In scope</span>}
            {r.existing && <span className="meta faint">Already saved</span>}
            {hintsFor(r).map((h) => (
              <HintLine key={h.code} hint={h} onAction={(a) => onAction(a, r)} />
            ))}
          </div>
        ))}
        {preview.rules.length > SHOW_MAX && (
          <div className="scope-row"><span className="meta muted">and {fmt(preview.rules.length - SHOW_MAX)} more rules</span></div>
        )}
        {preview.invalid.map((x) => (
          <div key={`${x.source}${x.line}${x.text}`} className="scope-row" style={{ height: "auto", minHeight: "var(--size-row)", padding: "6px var(--space-3)" }}>
            <span className="data" style={{ minWidth: 220, color: "var(--text-2)" }}>{x.text}</span>
            <span className="meta muted">{x.source === "in" ? "In scope" : "Out of scope"} box, line {x.line}</span>
            <span className="meta" style={{ marginLeft: "auto", color: "var(--danger)" }}>{x.reason}</span>
          </div>
        ))}
      </div>
      <span className="meta muted">
        {plural(nIn, "new in-scope rule")}, {plural(nOut, "new out-of-scope rule")}
        {nExisting > 0 && `, ${fmt(nExisting)} already saved`}
        {preview.invalid.length > 0 && `, ${plural(preview.invalid.length, "invalid line")} skipped`}. Out of scope always wins. {footnote}
      </span>
    </div>
  );
}
