import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Terminal } from "lucide-react";
import {
  TOOLS, onToolExit, onToolLines, toolVersionStream, toolsStatus,
  type Tool, type ToolLine, type ToolStatus,
} from "../../ipc";

const STATE_WORD: Record<ToolStatus["state"], string> = {
  ok: "Bundled, verified",
  missing: "Missing",
  tampered: "Does not match the build",
  version_mismatch: "Wrong version",
  unreadable: "Cannot be read",
};

type LogLine = ToolLine & { time: string; tool: Tool };
const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

// Tool check (ONB-02) and the supervisor streaming spike for Module 0.
// Becomes Settings → Tools and onboarding step 2 in Module 4.
export function ToolCheck() {
  const [status, setStatus] = useState<ToolStatus[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const jobs = useRef(new Map<string, Tool>());
  const logEnd = useRef<HTMLDivElement>(null);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await toolsStatus());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
    const offLines = onToolLines(({ job, lines }) => {
      const tool = jobs.current.get(job);
      if (!tool) return;
      const t = now();
      setLog((l) => [...l, ...lines.filter((x) => x.text.trim()).map((x) => ({ ...x, tool, time: t }))].slice(-2000));
    });
    const offExit = onToolExit(({ job, code, error }) => {
      const tool = jobs.current.get(job);
      if (!tool) return;
      jobs.current.delete(job);
      const text = error ? `Could not run: ${error}` : `Exited with code ${code ?? "none"}`;
      setLog((l) => [...l, { stream: error || code ? "stderr" : "stdout", text, tool, time: now() }]);
    });
    return () => {
      offLines.then((f) => f());
      offExit.then((f) => f());
    };
  }, [check]);

  useEffect(() => logEnd.current?.scrollIntoView({ block: "end" }), [log]);

  const stream = async (tool: Tool) => {
    const job = await toolVersionStream(tool);
    jobs.current.set(job, tool);
  };

  const allOk = status?.every((s) => s.state === "ok");

  return (
    <div className="page page-narrow">
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">Tools</span>
          {status && (
            <span className="meta muted">
              {allOk ? "Every tool passed the check." : "A tool failed the check. Runs stay disabled until it passes."}
            </span>
          )}
          <span className="spacer" />
          <button className="btn btn-sm" onClick={check} disabled={checking}>
            <RefreshCw className="ic" strokeWidth={1.5} aria-hidden />
            {checking ? "Checking" : "Check tools"}
          </button>
        </div>
        <table className="dt">
          <thead>
            <tr><th>Tool</th><th>Version</th><th>Binary</th><th>Path</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {TOOLS.map((tool) => {
              const s = status?.find((x) => x.tool === tool);
              return (
                <tr key={tool}>
                  <td className="data">{tool}</td>
                  <td className="data">{s ? (s.detected_version ?? "unknown") : <span className="skeleton" style={{ width: 48 }} />}</td>
                  <td>
                    {s ? (
                      <span className="row" style={{ gap: 6 }}>
                        <span className={`shape ${s.state === "ok" ? "s2xx" : "s5xx"}`} />
                        {STATE_WORD[s.state]}
                      </span>
                    ) : "Checking"}
                    {s?.problem && <div className="meta muted">{s.problem}</div>}
                  </td>
                  <td className="data-sm muted" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }} title={s?.path}>{s?.path}</td>
                  <td>
                    <button className="btn btn-sm btn-plain" onClick={() => stream(tool)} disabled={!s || s.state === "missing"}>
                      <Terminal className="ic" strokeWidth={1.5} aria-hidden />Version output
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="panel-body">
          <p className="meta faint">
            Reconio runs only the tools bundled with it, never ones on PATH. Every run adds -duc, so no tool checks for updates by itself, and proxy variables are removed from its environment.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">Output</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-plain" onClick={() => setLog([])} disabled={!log.length}>Clear</button>
        </div>
        <div className="log log-box" style={{ border: 0, borderRadius: 0 }} role="log" aria-live="off">
          {log.length === 0 ? (
            <div className="state"><span className="state-text">No output yet. Choose Version output on a tool.</span></div>
          ) : (
            log.map((l, i) => (
              <div key={i} className={`log-line${l.stream === "stderr" && /error|could not/i.test(l.text) ? " log-err" : ""}`}>
                <span className="log-time">{l.time}</span>
                <span className="log-tool">{l.tool}</span>
                <span className="log-lvl">{l.stream === "stderr" ? "info" : "out"}</span>
                <span className="log-msg">{l.text}</span>
              </div>
            ))
          )}
          <div ref={logEnd} />
        </div>
      </section>
    </div>
  );
}
