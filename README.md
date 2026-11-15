# Reconio

Desktop recon for authorized security testing: subfinder → dnsx → httpx per engagement, with scope enforced between every stage. Tauri v2, React + TypeScript, Rust core, SQLite.

Requirements live in [../docs/PRD.md](../docs/PRD.md); the build plan and module progress in [../docs/MVP.md](../docs/MVP.md); full run, test and build instructions in [../docs/Runner.md](../docs/Runner.md). UI is built only from [../ui-design-system-glass](../ui-design-system-glass/design-system.md), and every screen meets WCAG 2.2 AA: see the build rules in [../legal/01-accessibility-wcag.md](../legal/01-accessibility-wcag.md).

## Setup

Needs Node 20+, Rust (stable, MSVC on Windows), and on Windows the WebView2 runtime.

```sh
npm install
npm run fetch-tools     # downloads pinned subfinder, dnsx, httpx; verifies SHA-256 from tools.lock.json
npm run tauri dev
```

## Scripts

| Script | What it does |
|---|---|
| `npm run fetch-tools` | Download and verify the pinned tools into `src-tauri/binaries/` (fails on any checksum mismatch) |
| `npm run sync-design` | Copy tokens, components and logo from the design folders (runs before `dev` and `build`) |
| `npm run test:rust` | Rust tests: tool check, supervisor, Job Object kill, and regenerates TS bindings in `src/ipc/bindings` |
| `npm run test:a11y` | Accessibility check: every screen in Edge with axe-core (WCAG 2.2 AA), 200% zoom layout and keyboard paths. Must pass before a commit |
| `npm run tauri build` | Release app plus `.msi` and NSIS installers |

## Layout

- `src-tauri/src/tools` – tool registry and the tool check (ONB-02). Tools are never looked up on PATH.
- `src-tauri/src/supervisor` – the only code that starts tool processes: forces `-duc`/`-nc`, rejects update and proxy flags, clears proxy variables, Job Object / process group so no tool outlives Reconio (§9.3).
- `src-tauri/src/commands.rs` – typed IPC commands; the webview never passes raw tool arguments.
- `src/` – React app; `src/ipc/bindings` is generated from Rust (ts-rs).
