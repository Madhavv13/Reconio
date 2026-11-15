// Accessibility helpers (WCAG 2.2 AA through WCAG2ICT). Rules: ../../../legal/01-accessibility-wcag.md.

let region: HTMLElement | null = null;

/** Creates the one polite live region the app uses for status messages (4.1.3). It must exist
 *  before the first message: screen readers often ignore a live region that is inserted
 *  together with its text, but they read a change to one that is already there. */
export function mountAnnouncer() {
  if (region || typeof document === "undefined") return;
  region = document.createElement("div");
  region.className = "sr-only";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.id = "announcer";
  document.body.appendChild(region);
}

/** Reads a short status message ("2 rules added.") to screen-reader users without moving focus. */
export function announce(message: string) {
  mountAnnouncer();
  if (!region) return;
  const r = region;
  r.textContent = "";
  // Clearing first makes the same message twice in a row still announce.
  setTimeout(() => {
    r.textContent = message;
  }, 50);
}

/** The current screen's title, which takes focus when nothing else has it (2.4.3). */
function screenTitle(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-screen-title]");
}

/** Moves focus to the screen title if the focused element was removed (for example a row's
 *  delete button, or the button of a step that just closed). Focus must never fall back to
 *  the page body, where keyboard and screen-reader users lose their place. */
export function keepFocus() {
  requestAnimationFrame(() => {
    const a = document.activeElement;
    if (!a || a === document.body || !a.isConnected) screenTitle()?.focus();
  });
}

/** Focuses `el` if it is still on screen, otherwise the screen title. */
export function restoreFocus(el: HTMLElement | null) {
  if (el?.isConnected) el.focus();
  else screenTitle()?.focus();
}
