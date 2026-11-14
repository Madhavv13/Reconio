import { useEffect, useState } from "react";
import { Lock, Trash2 } from "lucide-react";
import { keysDelete, keysList, keysSet, type AppError, type KeyStatus } from "../../ipc";

const ic = { className: "ic", strokeWidth: 1.5, "aria-hidden": true } as const;

function KeyRow({ k, onChange }: { k: KeyStatus; onChange: (k: KeyStatus) => void }) {
  const [editing, setEditing] = useState(!k.masked);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setEditing(!k.masked), [k.masked]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await keysSet(k.source, value);
      setValue("");
      onChange(saved);
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
      onChange({ ...k, masked: null });
    } catch (e) {
      setError((e as AppError).message);
    }
  };

  return (
    <div className="set-row">
      <div className="set-text">
        <span className="body-strong">{k.label}</span>
        {error ? (
          <span className="meta" style={{ color: "var(--danger)" }}>{error}</span>
        ) : k.masked ? (
          <span className="meta muted">Saved. subfinder uses this source.</span>
        ) : (
          <span className="meta faint">Not set. subfinder skips this source.</span>
        )}
      </div>
      {editing ? (
        <>
          <input
            className="input"
            type="password"
            placeholder={k.placeholder}
            aria-label={`${k.label} API key`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && value && save()}
            autoComplete="off"
            spellCheck={false}
            style={{ width: 240, height: "var(--size-control-sm)" }}
          />
          <button type="button" className="btn btn-sm" disabled={!value || busy} onClick={save}>Save</button>
          {k.masked && <button type="button" className="btn btn-sm btn-plain" onClick={() => { setEditing(false); setValue(""); setError(null); }}>Cancel</button>}
        </>
      ) : (
        <>
          <span className="data-sm muted">{k.masked}</span>
          <button type="button" className="btn btn-sm btn-plain" onClick={() => setEditing(true)}>Replace</button>
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
          <div className="callout callout-warn"><Lock {...ic} /><div>{error}</div></div>
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
