## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

**Requirement IDs:** <!-- e.g. SCOPE-04, RUN-12 -->

## Screenshots

<!-- Required for UI changes: before / after at 1440 × 900. The a11y run writes them to test-results/a11y/. -->

## Checklist

- [ ] `npm run build` passes
- [ ] `npm run test:rust` passes (and regenerated `src/ipc/bindings` are committed)
- [ ] `npm run test:a11y` passes, and any new screen or dialog has a scenario in `scripts/a11y.mjs`
- [ ] UI matches its mockup and uses design tokens only
- [ ] Tools are started only through the supervisor, and no raw tool arguments come from the webview
- [ ] No API keys, real client scope or personal data in code, tests or screenshots
- [ ] `CHANGELOG.md` updated
