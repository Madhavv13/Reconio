// Fake Rust core for the accessibility check (npm run test:a11y). It answers every IPC command
// the app uses with seeded data, so each screen can be rendered in a normal browser and scanned.
// It is only loaded by tests/a11y/harness.html and never ships in the app.
//
// ?state=fresh   first launch: onboarding, no engagements
// ?state=seeded  onboarding done, two engagements, acme.example open with scope rules
import type { ActiveEngagement, Decision, Engagement, KeyStatus, Preview, PreviewRule, Rule, Settings, ToolStatus } from "../../src/ipc";
import type { Hint } from "../../src/ipc/bindings/Hint";
import type { Kind } from "../../src/ipc/bindings/Kind";

const now = Math.floor(Date.now() / 1000);

const settings: Settings = {
  tools: {
    subfinder: { threads: 10, rate_limit: 0, timeout: 30 },
    dnsx: { threads: 50, rate_limit: 300, timeout: 5 },
    httpx: { threads: 25, rate_limit: 100, timeout: 10 },
  },
  resolvers: ["1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4"],
  performance: { runs_at_once: 2, chunks_per_stage: 2, density: "comfortable", keep_running_in_background: false, notify_when_run_ends: true },
  privacy: { check_for_updates: true, send_crash_reports: false, send_usage_statistics: false },
};

const SOURCES = [
  ["github", "GitHub"],
  ["chaos", "Chaos"],
  ["securitytrails", "SecurityTrails"],
  ["virustotal", "VirusTotal"],
  ["censys", "Censys"],
  ["shodan", "Shodan"],
] as const;

function kindOf(v: string): Kind {
  if (/^[\d.]+\/\d+$/.test(v) || /:.*\/\d+$/.test(v)) return "cidr";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v) || v.includes(":")) return "ip";
  if (v.startsWith("*.") && v.split("*").length === 2) return "wildcard";
  if (v.includes("*")) return "pattern";
  return "domain";
}

function normalize(token: string): { value: string; path: string | null } {
  const t = token.trim().replace(/^[-*•]\s+/, "");
  const m = /^(?:[a-z]+:\/\/)?([^/?#]+)([/?#].*)?$/i.exec(t);
  const host = (m?.[1] ?? t).toLowerCase().replace(/\.$/, "");
  const path = m?.[2] && m[2] !== "/" ? m[2] : null;
  return { value: host, path };
}

let nextRule = 1;
const rule = (pattern: string, effect: "in" | "out"): Rule => {
  const n = normalize(pattern);
  return { id: nextRule++, kind: kindOf(n.value), effect, pattern, normalized: n.value, note: null };
};

type State = {
  onboarded: boolean;
  engagements: Engagement[];
  active: string | null;
  rules: Record<string, Rule[]>;
  keys: Record<string, string | null>;
  settings: Settings;
};

function initial(): State {
  const fresh = new URLSearchParams(location.search).get("state") === "fresh";
  if (fresh) return { onboarded: false, engagements: [], active: null, rules: {}, keys: {}, settings };
  const acme: Engagement = { id: "e-acme", name: "acme.example", client: "Acme Corp", notes: null, created_at: now - 86400, last_opened_at: now };
  const globex: Engagement = { id: "e-globex", name: "globex.example", client: null, notes: null, created_at: now - 3600, last_opened_at: now - 60 };
  return {
    onboarded: true,
    engagements: [acme, globex],
    active: acme.id,
    rules: {
      [acme.id]: [
        rule("acme.example", "in"),
        rule("*.acme.example", "in"),
        rule("203.0.113.0/24", "in"),
        rule("https://portal.acme.example/login", "in"),
        rule("*.legacy.acme.example", "out"),
        rule("status.acme.example", "out"),
      ],
      [globex.id]: [rule("*.globex.example", "in")],
    },
    keys: { github: "ghp_abcdefghijklmnop3f2a" },
    settings,
  };
}

const st = initial();

const mask = (k: string) => `${k.slice(0, 4)}${"•".repeat(12)}${k.slice(-4)}`;
const roots = (rules: Rule[]) =>
  [...new Set(rules.filter((r) => r.effect === "in" && (r.kind === "domain" || r.kind === "wildcard")).map((r) => r.normalized.replace(/^\*\./, "")))]
    .filter((r, _, all) => !all.some((o) => o !== r && r.endsWith(`.${o}`)))
    .sort();

function activeView(): ActiveEngagement | null {
  const e = st.engagements.find((x) => x.id === st.active);
  if (!e) return null;
  return {
    engagement: e,
    attestation: { by: "pentester", first_at: e.created_at, at: e.created_at },
    folder: `C:\\Users\\pentester\\AppData\\Roaming\\Reconio\\engagements\\${e.id}`,
    size_bytes: 196608,
    rule_count: st.rules[e.id]?.length ?? 0,
  };
}

function preview(inText: string, outText: string, fresh: boolean): Preview {
  const saved = fresh || !st.active ? [] : st.rules[st.active] ?? [];
  const rules: PreviewRule[] = [];
  const invalid: Preview["invalid"] = [];
  const hints: Hint[] = [];
  for (const [text, source] of [[inText, "in"], [outText, "out"]] as const) {
    text.split("\n").forEach((line, i) => {
      const t = line.replace(/#.*/, "").trim().replace(/^[-*•]\s+/, "");
      if (!t) return;
      const n = normalize(t);
      if (!/^[a-z0-9*_.:-]+(\/\d+)?$/.test(n.value) || !n.value.includes(".")) {
        invalid.push({ source, line: i + 1, text: t, reason: "Not a valid domain name" });
        return;
      }
      const kind = kindOf(n.value);
      const existing = saved.some((r) => r.normalized === n.value && r.effect === source);
      rules.push({ kind, effect: source, pattern: t, normalized: n.value, source, line: i + 1, dropped_path: n.path, existing });
      if (n.path) {
        hints.push({ code: "path_ignored", rule: t, effect: source, host: n.value, message: `Path ${n.path} ignored. Reconio checks whole hosts, so this rule is wider than the program's.`, action: null });
      }
      if (kind === "wildcard" && source === "out") {
        const base = n.value.slice(2);
        hints.push({
          code: "base_still_in_scope", rule: t, effect: source, host: base,
          message: `${base} itself is still in scope. ${n.value} excludes only its subdomains.`,
          action: { label: "Exclude it too", pattern: base, effect: "out", replace: null },
        });
      }
    });
  }
  return { rules, invalid, hints, roots: roots([...saved, ...rules.map((r) => ({ ...r, id: null, note: null }))]) };
}

const ok = (tool: ToolStatus["tool"], v: string): ToolStatus => ({
  tool, path: `C:\\Program Files\\Reconio\\${tool}.exe`, expected_version: v, detected_version: v, state: "ok", problem: null,
});

function fail(message: string): never {
  throw { code: "invalid", message };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handler(cmd: string, a: any = {}): unknown {
  switch (cmd) {
    case "onboarding_done": return st.onboarded;
    case "onboarding_complete": st.onboarded = true; return null;
    case "tools_status": return [ok("subfinder", "2.17.0"), ok("dnsx", "1.3.1"), ok("httpx", "1.12.0")];
    case "engagement_list": return st.engagements;
    case "engagement_active": return activeView();
    case "engagement_open": st.active = a.id; return activeView();
    case "engagement_create": {
      const input = a.input;
      if (!input.authorized) fail("Confirm that you are authorized to test this scope.");
      if (st.engagements.some((e) => e.name.toLowerCase() === input.name.trim().toLowerCase())) fail(`An engagement called ${input.name} already exists. Choose another name.`);
      const e: Engagement = { id: `e-${st.engagements.length + 1}`, name: input.name.trim(), client: input.client, notes: null, created_at: now, last_opened_at: now };
      st.engagements.unshift(e);
      st.rules[e.id] = preview(input.in_text, input.out_text, true).rules.map((r) => rule(r.pattern, r.effect));
      st.active = e.id;
      return activeView();
    }
    case "engagement_update": {
      const e = st.engagements.find((x) => x.id === a.id)!;
      Object.assign(e, { name: a.name, client: a.client, notes: a.notes });
      return e;
    }
    case "engagement_delete": {
      const e = st.engagements.find((x) => x.id === a.id)!;
      if (a.typedName.trim() !== e.name) fail("The name you typed does not match. Nothing was deleted.");
      st.engagements = st.engagements.filter((x) => x.id !== a.id);
      st.active = null;
      return null;
    }
    case "scope_list": {
      const rules = st.rules[st.active ?? ""] ?? [];
      return { rules, roots: roots(rules), block: null };
    }
    case "scope_parse_preview": return preview(a.inText, a.outText, a.fresh);
    case "scope_apply": {
      const p = preview(a.inText, a.outText, false);
      const fresh = p.rules.filter((r) => !r.existing);
      st.rules[st.active!].push(...fresh.map((r) => rule(r.pattern, r.effect)));
      return { added: fresh.length, attestation: null };
    }
    case "scope_delete": st.rules[st.active!] = st.rules[st.active!].filter((r) => r.id !== a.id); return null;
    case "scope_test": {
      const host = normalize(a.input).value;
      const rules = st.rules[st.active!] ?? [];
      const out = rules.find((r) => r.effect === "out" && (r.normalized === host || (r.kind === "wildcard" && host.endsWith(r.normalized.slice(1)))));
      const inn = rules.find((r) => r.effect === "in" && (r.normalized === host || (r.kind === "wildcard" && host.endsWith(r.normalized.slice(1)))));
      const d: Decision = out
        ? { verdict: "out", reason: "out_rule", rule: out }
        : inn
          ? { verdict: "in", reason: "in_rule", rule: inn }
          : { verdict: "pending", reason: "awaiting_ips", rule: null };
      return d;
    }
    case "scope_import": return { in_text: a.list === "in" ? a.text : "", out_text: a.list === "out" ? a.text : "", skipped: [] };
    case "settings_get": return st.settings;
    case "settings_set": {
      const s = a.settings as Settings;
      if (s.tools.httpx.threads > 300) fail("httpx threads must be 1 to 300.");
      st.settings = s;
      return s;
    }
    case "keys_list":
      return SOURCES.map(([source, label]): KeyStatus => ({
        source, label, placeholder: source === "censys" ? "Paste API ID and secret as id:secret" : "Paste API key",
        masked: st.keys[source] ? mask(st.keys[source]!) : null,
      }));
    case "keys_set": st.keys[a.source] = a.value; return { source: a.source, label: a.source, placeholder: "", masked: mask(a.value) };
    case "keys_delete": st.keys[a.source] = null; return null;
    case "data_info":
      return { folder: "C:\\Users\\pentester\\AppData\\Roaming\\Reconio", engagements: st.engagements.map((e) => ({ id: e.id, name: e.name, size_bytes: 196608 })) };
    case "plugin:app|version": return "0.1.0";
    case "plugin:opener|reveal_item_in_dir": return null;
    default:
      throw { code: "io", message: `The accessibility mock does not know the command ${cmd}.` };
  }
}
