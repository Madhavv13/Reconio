# Changelog

All notable changes to Reconio are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased] — 0.1.0

### Added

- **Repository showcase** (2026-11-15): README with banner and screenshots, architecture, design, accessibility and runner docs, Windows CI, a security policy, contributing notes and issue/PR templates.
- **Accessibility gate** (2026-11-15): Reconio is built to WCAG 2.2 AA. `npm run test:a11y` checks every screen and dialog in Edge with axe-core, at 1440 × 900 and at 200% zoom, plus keyboard paths. Ctrl +/− zoom is on, the smallest window is 640 × 480, and layouts reflow down to 720 px.
- **Onboarding and Settings** (2026-11-15): a 4-step first run (welcome, tool check, API keys, first engagement). Settings has API keys, tools, resolvers, performance, data, privacy and about. API keys are stored in the OS keychain and shown masked.
- **Module 1: engagements and scope** (2026-11-14): one SQLite database per engagement, with forward-only migrations and backups. Engagements can be created, switched, edited and deleted (type the name to confirm). Scope parser, normalizer and matcher: domains, wildcards, patterns, IPs, CIDR and URLs, with IDN to punycode, and out of scope always wins. The Scope screen has a test box, root domains, bulk paste, `.txt` / `.csv` import, preview hints and an authorization record. Includes a scope regression suite with proptest.
- **Module 0: foundations** (2026-11-14): Tauri 2 + React + TypeScript shell styled from the Reconio Liquid Glass design system, with locally bundled fonts. Pinned subfinder, dnsx and httpx with SHA-256 verification (`npm run fetch-tools`). The process supervisor forces `-duc -nc`, rejects update and proxy flags, clears proxy variables, and uses a Windows Job Object so no tool outlives the app. TypeScript bindings are generated from Rust.

### Fixed

- Blank window on start, and an error boundary added so a failing screen can be reloaded (2026-11-14).
