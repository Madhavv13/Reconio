import { Fragment, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import mark from "../../assets/reconio-mark.svg";
import icon from "../../assets/reconio-app-icon.svg";
import { onboardingComplete } from "../../ipc";
import { useEngagement } from "../../state/engagement";
import { NewEngagement } from "../engagement-new/NewEngagement";
import { ApiKeys } from "../settings/ApiKeys";
import { useTools } from "../settings/useTools";

const ic = { className: "ic", strokeWidth: 1.5, "aria-hidden": true } as const;
const STEPS = ["Welcome", "Tool check", "API keys", "First engagement"];

function Steps({ current }: { current: number }) {
  return (
    <ol className="steps" aria-label="Setup steps">
      {STEPS.map((s, i) => (
        <Fragment key={s}>
          {i > 0 && <li className="step-sep" aria-hidden="true" />}
          <li className="step" data-state={i < current ? "done" : undefined} aria-current={i === current ? "step" : undefined}>
            <span className="step-n">{i < current ? <Check {...ic} /> : i + 1}</span>
            {s}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

// Step 1 (mockup onboarding-1-welcome.html)
function Welcome({ next }: { next: () => void }) {
  return (
    <div className="welcome">
      <img className="app-icon app-icon-xl" src={icon} alt="" width={96} height={96} style={{ marginBottom: "var(--space-2)" }} />
      <h1 className="wordmark wordmark-lg" style={{ margin: 0 }}>Reconio</h1>
      <p className="title" style={{ fontWeight: 500 }}>Recon for one engagement at a time.</p>
      <p className="state-text">
        Reconio runs subfinder, dnsx and httpx against the scope you set. Scope is checked at every stage, so nothing outside it is resolved or probed.
      </p>
      <div className="row" style={{ paddingTop: "var(--space-4)" }}>
        <button type="button" className="btn btn-primary btn-lg" onClick={next} autoFocus>Get started<ArrowRight {...ic} /></button>
      </div>
      <p className="meta faint">Setup takes about 2 minutes. Have the scope of an engagement you are authorized to test.</p>
    </div>
  );
}

// Step 2 (mockup onboarding-2-tools.html): the real tool check (ONB-02).
function ToolCheckStep({ back, next }: { back: () => void; next: () => void }) {
  const { status, checking, recheck, failed, allOk } = useTools();
  const summary = !status ? "Checking 3 tools" : allOk ? "3 of 3 tools ready" : `${failed.length} ${failed.length === 1 ? "tool" : "tools"} failed. Fix ${failed.length === 1 ? "it" : "them"} to continue.`;
  return (
    <section className="panel onb-card">
      <div className="panel-head">
        <span className="panel-title">Tool check</span>
        <span className="spacer" />
        <button type="button" className="btn btn-sm" onClick={recheck} disabled={checking}><RefreshCw {...ic} />Check again</button>
      </div>
      {(status ?? (["subfinder", "dnsx", "httpx"] as const).map((tool) => ({ tool, state: null, detected_version: null, expected_version: null, path: "", problem: null }))).map((t) => (
        <div className="set-row" key={t.tool}>
          <div className="set-text">
            <span className="row">
              <span className="body-strong mono">{t.tool}</span>
              {t.state && (
                <span className="data-sm muted">
                  {t.detected_version ?? t.expected_version ?? "unknown"}, SHA-256 {t.state === "tampered" ? "differs" : t.state === "ok" ? "matches" : "not checked"}
                </span>
              )}
            </span>
            {t.problem ? <span className="field-error">{t.problem}</span> : <span className="data-sm faint" style={{ wordBreak: "break-all" }}>{t.path}</span>}
          </div>
          {!t.state || checking ? (
            <span className="row meta muted" style={{ gap: 6 }}><Loader2 {...ic} />Checking</span>
          ) : t.state === "ok" ? (
            <span className="row label" style={{ gap: 6 }}><CheckCircle2 {...ic} style={{ color: "var(--success)" }} />Passed</span>
          ) : (
            <span className="row label" style={{ gap: 6 }}><AlertCircle {...ic} style={{ color: "var(--danger)" }} />Failed</span>
          )}
        </div>
      ))}
      <div className="onb-foot">
        <button type="button" className="btn btn-plain" onClick={back}><ArrowLeft {...ic} />Back</button>
        <span className="spacer" />
        <span className="meta muted" role="status">{summary}</span>
        <button type="button" className="btn btn-primary" onClick={next} disabled={!allOk || checking}>Continue<ArrowRight {...ic} /></button>
      </div>
    </section>
  );
}

// Step 3 (mockup onboarding-3-keys.html): optional keys, saved in the OS keychain (SET-01).
function KeysStep({ back, next }: { back: () => void; next: () => void }) {
  return (
    <section className="panel onb-card" style={{ width: 760 }}>
      <div className="panel-head"><span className="panel-title">API keys for passive sources</span><span className="meta muted">Optional</span></div>
      <ApiKeys />
      <div className="onb-foot">
        <button type="button" className="btn btn-plain" onClick={back}><ArrowLeft {...ic} />Back</button>
        <span className="spacer" />
        <button type="button" className="btn btn-plain" onClick={next}>Skip for now</button>
        <button type="button" className="btn btn-primary" onClick={next}>Continue<ArrowRight {...ic} /></button>
      </div>
    </section>
  );
}

// First launch (ONB-01): Welcome → Tool check → API keys → First engagement. No app shell.
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { list } = useEngagement();
  const [step, setStep] = useState(0);

  const finish = async () => {
    await onboardingComplete();
    onDone();
  };

  return (
    <div className="onb">
      <div className="onb-top">
        <span className="wordmark"><img className="wordmark-mark" src={mark} alt="" width={22} height={22} />Reconio</span>
        <span className="spacer" />
        <Steps current={step} />
        <span className="spacer" />
        <span className="meta muted">Step {step + 1} of 4</span>
      </div>
      <main className="onb-main">
        {step === 0 && <Welcome next={() => setStep(1)} />}
        {step === 1 && <ToolCheckStep back={() => setStep(0)} next={() => setStep(2)} />}
        {step === 2 && <KeysStep back={() => setStep(1)} next={() => setStep(3)} />}
        {step === 3 && (
          <NewEngagement
            onBack={() => setStep(2)}
            onCreated={finish}
            footerExtra={
              list && list.length > 0 ? (
                <button type="button" className="btn btn-plain" onClick={finish}>Use my existing engagements</button>
              ) : undefined
            }
          />
        )}
      </main>
    </div>
  );
}
