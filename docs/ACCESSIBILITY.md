# Accessibility: build rules

Reconio is built to **WCAG 2.2 level AA**, applied to desktop software through the W3C's [WCAG2ICT](https://www.w3.org/TR/wcag2ict-22/) guidance. This rule stands for every screen, every module and every later build. It isn't a one-off pass. Read this page before building any screen.

## The gate

`npm run test:a11y` must pass before a module is committed, and CI runs it on every push. It renders the real app in Microsoft Edge against a fake core ([tests/a11y/mock.ts](../tests/a11y/mock.ts)) and walks every screen and dialog at 1440 × 900 and at 720 × 450 (a 1440 × 900 window at 200% zoom). It fails on:

- any axe-core violation of WCAG 2.0, 2.1 or 2.2, level A or AA;
- content that is cut off, runs off screen or scrolls sideways at 720 × 450;
- a broken keyboard path: the engagement menu, the dialog focus trap and Esc, focus after an onboarding step, focus after deleting a row, or invalid fields that aren't marked.

Screenshots of every state go to `test-results/a11y/`. Look at them, because axe can't see layout.

**A new screen isn't done until it has a scenario in [scripts/a11y.mjs](../scripts/a11y.mjs)**, plus an answer in the mock if it calls a new command.

The automated check finds only some of WCAG's problems. Before each release, also do a keyboard-only walkthrough of the main journeys and a screen-reader pass with NVDA (Windows) and VoiceOver (macOS).

## Structure

- Each screen uses `<Screen>`: its title is the `h1` and takes focus when the screen opens. Panel titles are `<h2 className="panel-title">`. Landmarks: the sidebar is `<nav>` and the content is `<main>`.
- Every input has a visible `<label htmlFor>`, or an `aria-label` when the design shows no label. Icon-only buttons have an `aria-label`. Decorative icons get `aria-hidden`.
- A button's accessible name starts with its visible text (2.5.3). Add context with `<span className="sr-only">` after the visible words, not with an `aria-label` that replaces them.

## Keyboard and focus

- Everything works with the keyboard alone. Use real `<button>` and `<input>` elements.
- Menus follow the ARIA menu pattern (see the switcher in [Sidebar.tsx](../src/shell/Sidebar.tsx)). Dialogs use [Dialog.tsx](../src/ui/Dialog.tsx), which traps focus, closes on Esc and returns focus.
- Focus must never fall to the page body. When the focused control disappears (a deleted row, a closed step, a dialog whose opener is gone), call `keepFocus()` or `restoreFocus()` from [a11y.ts](../src/ui/a11y.ts), or focus the obvious next control.
- A button that turns itself off during an action uses `aria-disabled` and ignores clicks. Don't use `disabled` for this, because it drops focus.
- Focus is always visible through the kit's focus ring. Never remove an outline without putting something in its place.
- `.scroll` has `scroll-padding`, so a focused control is never hidden under the floating bars (2.4.11).

## Messages

- Status messages ("2 rules added.", "Saved.") go through `announce()` in [a11y.ts](../src/ui/a11y.ts). Don't add a new `role="status"` element for each message.
- Errors: put `role="alert"` on the message, and give the field `aria-invalid` and `aria-describedby` pointing at it.
- A result that updates as the user types lives inside an `aria-live="polite"` container that is always mounted (see "Test a host" in [ScopeScreen.tsx](../src/screens/scope/ScopeScreen.tsx)).
- Run progress (Module 2) is announced at most once every 5 seconds.

## Colour and text

- Use only the design tokens. Text on surfaces is `--text-1`, `--text-2` or `--text-3` (all at least 5.2:1). `--text-off` (about 3:1) is for disabled controls only.
- Never rely on colour alone: every status, scope state and severity also has a word or a shape.
- Targets are at least 24 × 24 px. The kit's smallest control is 28 px.

## Size, zoom and reflow

- Ctrl + and Ctrl − zoom the app (`zoomHotkeysEnabled` in [tauri.conf.json](../src-tauri/tauri.conf.json)), and the smallest window is 640 × 480. Layouts must work down to 720 px wide: below 900 px columns stack, and below 760 px the sidebar moves above the content (rules at the end of [layout.css](../src/styles/layout.css)).
- Never give a panel or dialog a fixed width without `max-width: 100%`.
- Wide data tables go in `<TableWrap label="…">` ([TableWrap.tsx](../src/ui/TableWrap.tsx)), which scrolls sideways inside the panel and can be focused and scrolled with the keyboard.

## Motion and transparency

- Every animation, CSS or GSAP, respects `prefers-reduced-motion`, and glass falls back to solid under `prefers-reduced-transparency`. The kit and [Segmented.tsx](../src/ui/Segmented.tsx) handle both.

## Coming with later modules

- **Pipeline (Module 2):** stage states in words, throttled announcements, and a log panel that scrolls with the keyboard.
- **Results tables (Module 3):** `role="grid"` with arrow-key navigation and announced row selection. New rows are counted in a live message instead of being inserted under the screen reader.
- **Command palette (Module 4):** the combobox pattern with a listbox.
