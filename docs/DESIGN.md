# Design: Reconio Liquid Glass

Reconio's interface is a dark UI for long recon sessions. Almost everything is solid ink, and glass is a quiet accent used only on the few surfaces that float over content. Every screen is built from the design system's tokens and component classes, and nothing is hard-coded.

> The tokens and component CSS in [`src/styles/design/`](../src/styles/design) are **copies**. The design system has its own source folder, and `npm run sync-design` (run automatically before `dev` and `build`) copies it in. Don't edit the copies. Change the system and sync it.

## Principles

1. **Data sits on ink.** Tables, logs, scope lists and every control (buttons, inputs, switches, tabs) are flat ink with a hairline border. They're never glass.
2. **Glass is for what floats.** That means the sidebar, floating bars, dialogs, menus, the inspector and the command palette. It's mostly opaque, with no refraction, coloured halos or glows. Under `prefers-reduced-transparency` it becomes solid.
3. **One accent.** Warm amber-orange marks selection, the running stage, progress and the primary action. Status colours appear only on data that needs them.
4. **Operator language.** Short, literal and in sentence case: "Run full pipeline", "Out of scope", "No results yet". The pentest vocabulary (engagement, scope, live host) is used, never "project" or "workspace".
5. **Motion that settles.** GSAP drives state changes with `expo.out` easing, and every animation respects `prefers-reduced-motion`.

## Colour

| Token | Value | Use |
|---|---|---|
| `--ink-0` → `--ink-4` | `#0A0807` → `#2B231D` | Window ground to raised surfaces (neutrals tinted toward the accent) |
| `--text-1` / `--text-2` / `--text-3` | `#F8F2EC` / `#CBBFB4` / `#A29488` | Text hierarchy (all ≥ 5.2:1 on surfaces) |
| `--accent` | `#FF8A3D` | Selection, primary button, running stage, progress |
| `--status-2xx` | `#34D399` | Success, live |
| `--status-3xx` | `#38BDF8` | Info, redirects |
| `--status-4xx` | `#FACC15` | Warnings, out of scope, 4xx |
| `--status-5xx` | `#F87171` | Errors, high severity, 5xx |

Dark only for v1. Colour is never the only signal: every status also has a word or a shape.

## Type

- **Manrope** (400 to 700) for interface text, and **JetBrains Mono** for data: hosts, URLs, IPs, status codes, timestamps and logs. Both are bundled locally through `@fontsource`, with no CDN.
- Tabular numerals everywhere, and numbers are grouped (`12,481`).
- Named styles such as `title-lg`, `title`, `section`, `body`, `label`, `meta`, `data` and `log`. Column heads and labels are sentence case, never tracked uppercase.

## Shape and layout

- Controls are capsules (`--radius-pill`). Containers use `--radius-lg` (20 px), and the inspector and palette use `--radius-xl` (28 px). A nested radius equals the outer radius minus the padding.
- Spacing is on a 4 px grid. Table rows are 36 px by default and 28 px in compact density.
- App shell: a floating sidebar on the left, one solid content panel, and floating bars over it. Content scrolls under them, with spacers so nothing is hidden.

## Brand

- The name is **Reconio**: one word, capital R, the rest lowercase.
- The logo is the app icon in [`public/reconio-app-icon.svg`](../public/reconio-app-icon.svg) and the tile-less mark in [`src/assets/reconio-mark.svg`](../src/assets/reconio-mark.svg). Use them as supplied and never redraw them.
