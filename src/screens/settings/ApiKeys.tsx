import { useEffect, useId, useRef, useState } from "react";
import { Lock, Trash2 } from "lucide-react";
import { keysDelete, keysList, keysSet, type AppError, type KeyStatus } from "../../ipc";
import { announce } from "../../ui/a11y";

const ic = { className: "ic", strokeWidth: 1.5, "aria-hidden": true } as const;

function KeyRow({ k, onChange }: { k: KeyStatus; onChange: (k: KeyStatus) => void }) {
  const [editing, setEditing] = useState(!k.masked);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  // After Save, Replace or Delete the control the user pressed is replaced by another one;
  // move focus to its replacement so it never falls to the page body (2.4.3).
  const focusNext = useRef<null | "input" | "replace">(null);
  const input = useRef<HTMLInputElement>(null);
  const replace = useRef<HTMLButtonElement>(null);

  useEffect(() => setEditing(!k.masked), [k.masked]);
  useEffect(() => {
    if (focusNext.current === "input") input.current?.focus();
    if (focusNext.current === "replace") replace.current?.focus();
    focusNext.current = null;
  }, [editing, k.masked]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await keysSet(k.source, value);
      setValue("");
      focusNext.current = "replace";
      onChange(saved);
      announce(`${k.label} key saved.`);
    } catch (e) {
      setError((e as AppError).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError(null);
    try {
      await keysDelete(k.source);
      focusNext.current = "input";
      onChange({ ...k, masked: null });
      announce(`${k.label} key deleted.`);
    } catch (e) {
      setError((e as AppError).message);
    }
  };

  return (
    <div className="set-row">
      <div className="set-text">
        <span className="body-strong">{k.label}</span>
        {error ? (
          <span className="meta" role="alert" id={errorId} style={{ color: "var(--danger)" }}>{error}</span>
        ) : k.masked ? (
          <span className="meta muted">Saved. subfinder uses this source.</span>
        ) : (
          <span className="meta faint">Not set. subfinder skips this source.</span>
        )}
      </div>
      {editing ? (
        <>
          <input
            ref={input}
            className="input"
            type="password"
            placeholder={k.placeholder}
            aria-label={`${k.label} API key`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && value && save()}
            autoComplete="off"
            spellCheck={false}
            style={{ width: 240, maxWidth: "100%", height: "var(--size-control-sm)" }}
          />
          <button type="button" className="btn btn-sm" disabled={!value || busy} onClick={save}>
            Save<span className="sr-only"> {k.label} key</span>
          </button>
          {k.masked && (
            <button
              type="button"
              className="btn btn-sm btn-plain"
              onClick={() => { focusNext.current = "replace"; setEditing(false); setValue(""); setError(null); }}
            >
              Cancel
            </button>
          )}
        </>
      ) : (
        <>
          <span className="data-sm muted">{k.masked}</span>
          <button type="button" ref={replace} className="btn btn-sm btn-plain" onClick={() => { focusNext.current = "input"; setEditing(true); }}>
            Replace<span className="sr-only"> {k.label} key</span>
          </button>
          <button type="button" className="btn btn-sm btn-plain btn-icon" aria-label={`Delete ${k.label} key`} title="Delete key" onClick={remove}>
            <Trash2 {...ic} />
          </button>
        </>
      )}
    </div>
  );
}

// API keys for passive sources (SET-01), stored only in the OS keychain.
export function ApiKeys() {
  const [keys, setKeys] = useState<KeyStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    keysList().then(setKeys).catch((e) => setError((e as AppError).message));
  }, []);

  return (
    <>
      <div className="panel-body">
        {error ? (
          <div className="callout callout-warn" role="alert"><Lock {...ic} /><div>{error}</div></div>
        ) : (
          <div className="callout"><Lock {...ic} /><div>Keys are saved in Windows Credential Manager. They never reach the engagement database, logs, exports or crash reports.</div></div>
        )}
      </div>
      {keys?.map((k) => (
        <KeyRow key={k.source} k={k} onChange={(n) => setKeys(keys.map((x) => (x.source === n.source ? n : x)))} />
      ))}
    </>
  );
}
