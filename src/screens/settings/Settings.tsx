import { Fragment, useEffect, useState, type ReactNode } from "react";
import { FolderOpen, Gauge, Info, Key, Lock, RefreshCw, Server, Wrench, Folder, type LucideIcon } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import icon from "../../assets/reconio-app-icon.svg";
import { Screen } from "../../shell/Screen";
import { dataInfo, settingsGet, settingsSet, type AppError, type DataInfo, type Settings as S } from "../../ipc";
import { Segmented } from "../../ui/Segmented";
import { fmtBytes } from "../../ui/format";
import { ApiKeys } from "./ApiKeys";
import { useTools } from "./useTools";

const ic = { className: "ic", strokeWidth: 1.5, "aria-hidden": true } as const;

type Section = "keys" | "tools" | "resolvers" | "performance" | "data" | "privacy" | "about";
const SECTIONS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: "keys", label: "API keys", icon: Key },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "resolvers", label: "Resolvers", icon: Server },
  { id: "performance", label: "Performance", icon: Gauge },
  { id: "data", label: "Data", icon: Folder },
  { id: "privacy", label: "Privacy", icon: Lock },
  { id: "about", label: "About", icon: Info },
];

const STATE_WORD = { ok: "Bundled, verified", missing: "Missing", tampered: "Does not match the build", version_mismatch: "Wrong version", unreadable: "Cannot be read" } as const;

/** A number field that saves when it loses focus or on Enter, and shows the core's validation error. */
function NumberField({ label, value, min, max, width = 84, onCommit }: { label: string; value: number; min: number; max: number; width?: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => {
    const n = Number(v);
    if (v.trim() !== "" && Number.isInteger(n) && n !== value) onCommit(n);
    else setV(String(value));
  };
  return (
    <input
      className="input"
      type="number"
      min={min}
      max={max}
      value={v}
      aria-label={label}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      style={{ width, height: "var(--size-control-sm)" }}
    />
  );
}

function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head"><span className="panel-title">{title}</span><span className="spacer" />{actions}</div>
      {children}
    </section>
  );
}

function SetRow({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-text"><span className="body-strong">{title}</span><span className="meta muted">{hint}</span></div>
      {children}
    </div>
  );
}

function ToolsSection({ s, save }: { s: S; save: (n: S) => void }) {
  const { status, checking, recheck } = useTools();
  const set = (tool: keyof S["tools"], key: keyof S["tools"]["dnsx"], v: number) =>
    save({ ...s, tools: { ...s.tools, [tool]: { ...s.tools[tool], [key]: v } } });
  return (
    <Panel title="Tools" actions={<button type="button" className="btn btn-sm" onClick={recheck} disabled={checking}><RefreshCw {...ic} />{checking ? "Checking" : "Check tools"}</button>}>
      <table className="dt">
        <thead><tr><th>Tool</th><th>Version</th><th>Binary</th><th>Threads</th><th>Rate limit /s</th><th>Timeout s</th></tr></thead>
        <tbody>
          {(["subfinder", "dnsx", "httpx"] as const).map((tool) => {
            const st = status?.find((x) => x.tool === tool);
            const lim = s.tools[tool];
            const max = { subfinder: [100, 1000, 300], dnsx: [500, 5000, 60], httpx: [300, 2000, 60] }[tool];
            return (
              <tr key={tool}>
                <td className="data">{tool}</td>
                <td className="data">{st?.detected_version ?? "…"}</td>
                <td>
                  {st ? (
                    <span className="row" style={{ gap: 6 }} title={st.problem ?? st.path}>
                      <span className={`shape ${st.state === "ok" ? "s2xx" : "s5xx"}`} />{STATE_WORD[st.state]}
                    </span>
                  ) : "Checking"}
                </td>
                <td><NumberField label={`${tool} threads`} value={lim.threads} min={1} max={max[0]} onCommit={(v) => set(tool, "threads", v)} /></td>
                <td><NumberField label={`${tool} rate limit`} value={lim.rate_limit} min={tool === "subfinder" ? 0 : 1} max={max[1]} width={92} onCommit={(v) => set(tool, "rate_limit", v)} /></td>
                <td><NumberField label={`${tool} timeout`} value={lim.timeout} min={1} max={max[2]} width={76} onCommit={(v) => set(tool, "timeout", v)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="panel-body stack">
        {status?.filter((x) => x.problem).map((x) => <span key={x.tool} className="field-error">{x.problem}</span>)}
        <p className="meta faint">Limits: subfinder 1 to 100 threads, 0 to 1,000 per second (0 means no limit). dnsx 1 to 500 threads and 1 to 5,000 per second. httpx 1 to 300 threads, 1 to 2,000 per second, 1 to 60 s timeout.</p>
        <p className="meta faint">Reconio runs only the tools bundled with it, never ones on PATH, and every run disables the tools' own update checks.</p>
      </div>
    </Panel>
  );
}

function ResolversSection({ s, save }: { s: S; save: (n: S) => Promise<boolean> }) {
  const [text, setText] = useState(s.resolvers.join("\n"));
  useEffect(() => setText(s.resolvers.join("\n")), [s.resolvers]);
  const dirty = text.trim() !== s.resolvers.join("\n");
  return (
    <Panel title="Resolvers" actions={<button type="button" className="btn btn-sm btn-primary" disabled={!dirty} onClick={() => save({ ...s, resolvers: text.split(/[\n,]/) })}>Save</button>}>
      <div className="panel-body stack">
        <textarea className="textarea" rows={8} aria-label="Resolvers, one per line" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
        <p className="meta faint">One IP address per line, optionally with a port. Runs use this saved list. A run cannot start with an empty list.</p>
      </div>
    </Panel>
  );
}

function PerformanceSection({ s, save }: { s: S; save: (n: S) => void }) {
  const p = s.performance;
  const set = (patch: Partial<S["performance"]>) => save({ ...s, performance: { ...p, ...patch } });
  return (
    <Panel title="Performance">
      <SetRow title="Runs at once" hint="Across all engagements. Extra runs wait in a queue. 1 to 8.">
        <NumberField label="Runs at once" value={p.runs_at_once} min={1} max={8} onCommit={(v) => set({ runs_at_once: v })} />
      </SetRow>
      <SetRow title="Chunks at once per stage" hint="1 to 8. Higher is faster and louder.">
        <NumberField label="Chunks at once" value={p.chunks_per_stage} min={1} max={8} onCommit={(v) => set({ chunks_per_stage: v })} />
      </SetRow>
      <SetRow title="Table density" hint="Comfortable rows are 36 px, compact rows 28 px.">
        <Segmented label="Table density" value={p.density} onChange={(density) => set({ density })} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
      </SetRow>
      <SetRow title="Keep running in the background" hint="Runs continue with the window closed. Reconio stays in the tray.">
        <input type="checkbox" className="switch" checked={p.keep_running_in_background} onChange={(e) => set({ keep_running_in_background: e.target.checked })} aria-label="Keep running in the background" />
      </SetRow>
      <SetRow title="Notify when a run ends" hint="An OS notification when a run completes, fails or needs attention while Reconio is not in focus.">
        <input type="checkbox" className="switch" checked={p.notify_when_run_ends} onChange={(e) => set({ notify_when_run_ends: e.target.checked })} aria-label="Notify when a run ends" />
      </SetRow>
    </Panel>
  );
}

function DataSection() {
  const [d, setD] = useState<DataInfo | null>(null);
  useEffect(() => {
    dataInfo().then(setD);
  }, []);
  return (
    <Panel title="Data">
      <div className="panel-body stack">
        <div className="field">
          <span className="field-label">Data folder</span>
          <div className="row">
            <div className="well grow" style={{ wordBreak: "break-all" }}>{d?.folder}</div>
            <button type="button" className="btn btn-plain btn-icon" aria-label="Open data folder" title="Open folder" onClick={() => d && revealItemInDir(`${d.folder}/app.db`)}><FolderOpen {...ic} /></button>
          </div>
          <span className="field-hint">Every engagement has its own folder and database here.</span>
        </div>
      </div>
      <table className="dt">
        <thead><tr><th>Engagement</th><th>State</th><th className="num">Size</th></tr></thead>
        <tbody>
          {d?.engagements.map((e) => (
            <tr key={e.id}><td className="data">{e.name}</td><td>Active</td><td className="num">{fmtBytes(e.size_bytes)}</td></tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function PrivacySection({ s, save }: { s: S; save: (n: S) => void }) {
  const p = s.privacy;
  const set = (patch: Partial<S["privacy"]>) => save({ ...s, privacy: { ...p, ...patch } });
  return (
    <Panel title="Privacy">
      <SetRow title="Check for updates" hint="On launch and every 24 hours. Release notes are shown before anything installs.">
        <input type="checkbox" className="switch" checked={p.check_for_updates} onChange={(e) => set({ check_for_updates: e.target.checked })} aria-label="Check for updates" />
      </SetRow>
      <SetRow title="Send crash reports" hint="Off by default. Reports never contain keys, hosts or results.">
        <input type="checkbox" className="switch" checked={p.send_crash_reports} onChange={(e) => set({ send_crash_reports: e.target.checked })} aria-label="Send crash reports" />
      </SetRow>
      <SetRow title="Send anonymous usage statistics" hint="Off by default.">
        <input type="checkbox" className="switch" checked={p.send_usage_statistics} onChange={(e) => set({ send_usage_statistics: e.target.checked })} aria-label="Send anonymous usage statistics" />
      </SetRow>
      <div className="panel-body stack" style={{ borderTop: "1px solid var(--line-1)" }}>
        <span className="section">Network destinations other than recon traffic</span>
        <table className="dt compact">
          <thead><tr><th>Destination</th><th>Why</th><th>When</th></tr></thead>
          <tbody>
            <tr><td>Passive sources you enable in subfinder</td><td>They receive the root domains being enumerated</td><td>During runs</td></tr>
          </tbody>
        </table>
        <p className="meta faint">This build contacts no update or crash-report server. The switches above take effect when those services ship.</p>
      </div>
    </Panel>
  );
}

function AboutSection() {
  const [version, setVersion] = useState("");
  const { status } = useTools();
  useEffect(() => {
    getVersion().then(setVersion);
  }, []);
  return (
    <section className="panel">
      <div className="panel-body stack" style={{ justifyItems: "start", gap: "var(--space-4)", padding: "var(--space-6)" }}>
        <div className="about-head">
          <img className="app-icon" src={icon} alt="" width={64} height={64} />
          <div className="stack" style={{ gap: 6 }}>
            <span className="wordmark wordmark-lg">Reconio</span>
            <span className="meta muted">Recon for authorized engagements</span>
          </div>
        </div>
        <dl className="kv">
          <dt>Version</dt><dd>{version}</dd>
          {(["subfinder", "dnsx", "httpx"] as const).map((t) => (
            <Fragment key={t}>
              <dt>{t}</dt>
              <dd>{status?.find((x) => x.tool === t)?.detected_version ?? "…"}, MIT</dd>
            </Fragment>
          ))}
        </dl>
        <p className="meta faint">subfinder, dnsx and httpx are made by ProjectDiscovery and shipped unmodified under the MIT license.</p>
      </div>
    </section>
  );
}

// Settings (SET-01 to SET-09; mockup settings.html).
export function Settings() {
  const [section, setSection] = useState<Section>("keys");
  const [s, setS] = useState<S | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    settingsGet().then(setS).catch((e) => setError((e as AppError).message));
  }, []);

  const save = async (next: S): Promise<boolean> => {
    setError(null);
    setSaved(false);
    try {
      setS(await settingsSet(next));
      setSaved(true);
      return true;
    } catch (e) {
      setError((e as AppError).message);
      return false;
    }
  };

  return (
    <Screen title="Settings" meta={saved && !error ? "Saved" : undefined}>
      <div className="page">
        <div className="cols-nav">
          <nav className="subnav" aria-label="Settings sections">
            {SECTIONS.map((x) => (
              <button
                key={x.id}
                type="button"
                className="subnav-item"
                aria-current={section === x.id ? "true" : undefined}
                onClick={() => { setSection(x.id); setError(null); setSaved(false); }}
              >
                <x.icon {...ic} />{x.label}
              </button>
            ))}
          </nav>
          <div className="stack" style={{ gap: "var(--space-4)" }}>
            {error && <div className="callout callout-err" role="alert"><span>{error}</span></div>}
            {section === "keys" && <section className="panel"><div className="panel-head"><span className="panel-title">API keys</span></div><ApiKeys /></section>}
            {s && section === "tools" && <ToolsSection s={s} save={save} />}
            {s && section === "resolvers" && <ResolversSection s={s} save={save} />}
            {s && section === "performance" && <PerformanceSection s={s} save={save} />}
            {section === "data" && <DataSection />}
            {s && section === "privacy" && <PrivacySection s={s} save={save} />}
            {section === "about" && <AboutSection />}
          </div>
        </div>
      </div>
    </Screen>
  );
}
