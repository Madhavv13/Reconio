# Contributing to Reconio

Reconio is proprietary software, developed in a private repository. These notes describe how work is done here, for everyone who has been given access.

## How work is organised

Reconio is built **one module at a time** (see the [roadmap](README.md#roadmap)). Each module:

1. is built against its requirements, which are referenced by ID, for example `SCOPE-04` or `RUN-12`;
2. ports every new screen from its approved design mockup, using only the design system ([docs/DESIGN.md](docs/DESIGN.md));
3. passes all the quality gates below;
4. is reviewed, then committed with a clear message (`Module 2: pipeline engine`).

## Quality gates

Run these before you open a pull request. CI runs them too.

```sh
npm run build          # TypeScript check + Vite build
npm run test:rust      # Rust tests, including the scope regression suite; regenerates TS bindings
npm run test:a11y      # accessibility check: axe-core, 200% zoom and keyboard paths for every screen
```

- **New screen?** Add a scenario for it in [scripts/a11y.mjs](scripts/a11y.mjs) (and the mock answers it needs in [tests/a11y/mock.ts](tests/a11y/mock.ts)).
- **Changed scope behaviour?** Add the case to [src-tauri/tests/fixtures/scope_cases.json](src-tauri/tests/fixtures/scope_cases.json). The regression suite must keep passing.
- **Changed a Rust type used by the UI?** Commit the regenerated files in `src/ipc/bindings`.
- **New screen in the README?** Add its screenshot name to [scripts/readme-assets.mjs](scripts/readme-assets.mjs), then run `npm run test:a11y && npm run readme:assets`.

## Rules that don't bend

- Tools are started **only** through the supervisor, and never looked up on `PATH`.
- The webview never sends raw tool arguments. Add a typed command instead.
- API keys stay in the OS keychain and never reach a database, log or export.
- Tool versions change only through a reviewed edit of [tools.lock.json](tools.lock.json), with checksums copied from the official release. Never edit a checksum to make a download pass.
- UI uses design tokens only, with no hard-coded colours, radii or durations.

## Commits and pull requests

- Keep each commit focused, and write the message in the imperative ("Add bulk paste preview").
- Reference requirement IDs in commits, tests and PR descriptions where they apply.
- Fill in the pull request template, including the screenshots for UI changes.
