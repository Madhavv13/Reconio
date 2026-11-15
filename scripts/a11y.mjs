// Accessibility check (WCAG 2.2 AA through WCAG2ICT; rules in docs/ACCESSIBILITY.md).
//
// Renders the real React app against a fake Rust core (tests/a11y/mock.ts) in Microsoft Edge,
// walks every screen and dialog, and fails if any of these are found:
//   - an axe-core violation of WCAG 2.0, 2.1 or 2.2 level A or AA;
//   - content cut off or scrolling sideways at 720 x 450 (a 1440 x 900 window at 200% zoom);
//   - a keyboard path that does not work (menu, dialog, focus after a step or a delete).
// Screenshots of every state go to test-results/a11y/<viewport>/ for a visual check.
//
// Usage: npm run test:a11y            (needs Microsoft Edge or Google Chrome installed)
//        npm run test:a11y -- --only scope   (run scenarios whose name contains "scope")
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright-core";
import { AxeBuilder } from "@axe-core/playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "test-results", "a11y");
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const VIEWPORTS = [
  { label: "1440x900", width: 1440, height: 900 },
  { label: "720x450-zoom200", width: 720, height: 450 },
];

const failures = [];
const fail = (where, what) => failures.push(`${where}: ${what}`);

/** Elements that are cut off or scroll sideways. Wide data tables may scroll inside .table-wrap. */
async function clipped(page) {
  return page.evaluate(() => {
    const bad = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) bad.push(`page scrolls sideways (${doc.scrollWidth} > ${window.innerWidth})`);
    const sel = ".scrim, .scroll, .panel, .dialog, .bar, .sidebar, .set-row, .scope-row, .onb-card, .callout, .well";
    // Anything that sits partly off screen sideways (for example a dialog wider than the window).
    for (const el of document.querySelectorAll(".dialog, .panel, .bar, .sidebar, .menu")) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < -1 || r.right > window.innerWidth + 1)) {
        bad.push(`.${el.className.toString().split(" ")[0]} runs off screen (${Math.round(r.left)} to ${Math.round(r.right)} of ${window.innerWidth})`);
      }
    }
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest(".table-wrap") || el.closest(".preview")) continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        const name = el.className.toString().split(" ").slice(0, 2).join(".");
        const text = (el.textContent ?? "").trim().slice(0, 40);
        bad.push(`.${name} is ${el.scrollWidth - el.clientWidth}px too wide ("${text}")`);
      }
    }
    return bad;
  });
}

async function scan(page, vp, name) {
  await page.waitForTimeout(350); // debounced previews (200 ms) and the GSAP thumb
  const where = `${vp.label} ${name}`;
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const v of r.violations) {
    for (const n of v.nodes) fail(where, `[${v.id}] ${v.help}: ${n.target.join(" ")}`);
  }
  if (vp.width < 1000) for (const c of await clipped(page)) fail(where, c);
  const dir = join(out, vp.label);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`) });
}

const activeIs = (page, js) => page.evaluate(js);
const focusLost = (page) => activeIs(page, () => !document.activeElement || document.activeElement === document.body);

async function expect(where, cond, what) {
  if (!(await cond)) fail(where, what);
}

// ---------- scenarios ----------

const scenarios = [
  {
    name: "onboarding",
    state: "fresh",
    async run(page, vp) {
      await page.getByRole("button", { name: "Get started" }).waitFor();
      await scan(page, vp, "onb-1-welcome");
      await page.getByRole("button", { name: "Get started" }).press("Enter");
      await page.getByText("3 of 3 tools ready").waitFor();
      await expect(`${vp.label} onboarding`, focusLost(page).then((x) => !x), "focus fell to the page body after Get started");
      await scan(page, vp, "onb-2-tools");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("heading", { name: "API keys for passive sources" }).waitFor();
      await scan(page, vp, "onb-3-keys");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByLabel("Name", { exact: true }).fill("acme.example");
      await page.getByLabel("In scope", { exact: true }).fill("acme.example\n*.acme.example\nhttps://portal.acme.example/login\nnot a host");
      await page.getByLabel("Out of scope", { exact: true }).fill("- *.legacy.acme.example");
      await page.getByText("Exclude it too").waitFor();
      await scan(page, vp, "onb-4-engagement");
      await page.getByRole("checkbox", { name: /I am authorized/ }).check();
      await page.getByRole("button", { name: "Create engagement" }).click();
      await page.getByRole("heading", { level: 1, name: "Scope" }).waitFor();
      await scan(page, vp, "scope-first");
    },
  },
  {
    name: "scope",
    state: "seeded",
    async run(page, vp) {
      await page.getByRole("heading", { level: 1, name: "Scope" }).waitFor();
      await scan(page, vp, "scope");
      await page.getByLabel("Host, URL or IP to test").fill("www.acme.example");
      await page.getByText("Decided by").waitFor();
      await scan(page, vp, "scope-test");

      await page.getByRole("button", { name: "Add rule" }).focus();
      await page.keyboard.press("Enter");
      await page.getByRole("dialog", { name: "Add rule" }).waitFor();
      await page.getByLabel("Pattern").fill("*.shop.acme.example");
      await scan(page, vp, "dialog-add-rule");
      for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
      await expect(`${vp.label} add rule`, activeIs(page, () => !!document.activeElement?.closest(".dialog")), "Tab left the dialog");
      await page.keyboard.press("Escape");
      await expect(`${vp.label} add rule`, activeIs(page, () => document.activeElement?.textContent?.includes("Add rule")), "Esc did not return focus to Add rule");

      await page.getByRole("button", { name: "Bulk paste" }).click();
      await page.getByLabel("In-scope rules").fill("api.acme.example\n*.dev.acme.example");
      await page.getByText(/new in-scope rule/).waitFor();
      await scan(page, vp, "dialog-bulk-paste");
      await page.keyboard.press("Escape");

      // Deleting a rule removes the focused button; focus must stay on the screen.
      await page.getByRole("button", { name: "Remove status.acme.example" }).focus();
      await page.keyboard.press("Enter");
      await page.getByText("status.acme.example removed.").waitFor();
      await page.waitForTimeout(100);
      await expect(`${vp.label} delete rule`, focusLost(page).then((x) => !x), "focus fell to the page body after removing a rule");
    },
  },
  {
    name: "switcher",
    state: "seeded",
    async run(page, vp) {
      const sw = page.locator(".switcher");
      await sw.waitFor();
      await sw.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("menu").waitFor();
      await expect(`${vp.label} switcher`, activeIs(page, () => document.activeElement?.getAttribute("role") === "menuitemradio"), "Enter did not move focus into the menu");
      await page.keyboard.press("ArrowDown");
      await expect(`${vp.label} switcher`, activeIs(page, () => document.activeElement?.textContent?.includes("globex.example")), "ArrowDown did not move to the next engagement");
      await page.keyboard.press("End");
      await expect(`${vp.label} switcher`, activeIs(page, () => document.activeElement?.textContent?.includes("New engagement")), "End did not move to the last item");
      await scan(page, vp, "switcher-menu");
      await page.keyboard.press("Escape");
      await expect(`${vp.label} switcher`, activeIs(page, () => document.activeElement?.classList.contains("switcher")), "Esc did not return focus to the switcher");

      await sw.click();
      await page.getByRole("menuitem", { name: "New engagement" }).click();
      await page.getByRole("heading", { level: 1, name: "New engagement" }).waitFor();
      await scan(page, vp, "engagement-new");
    },
  },
  {
    name: "engagement-settings",
    state: "seeded",
    async run(page, vp) {
      await page.getByRole("button", { name: "Engagement settings" }).click();
      await page.getByRole("heading", { level: 1, name: "Engagement settings" }).waitFor();
      await scan(page, vp, "engagement-settings");
      await page.getByRole("button", { name: "Delete engagement" }).click();
      await page.getByRole("alertdialog").waitFor();
      await page.getByLabel(/to confirm/).fill("acme.example");
      await scan(page, vp, "dialog-delete");
      await page.getByRole("alertdialog").getByRole("button", { name: "Delete engagement" }).click();
      await page.getByText("globex.example").first().waitFor();
      await page.waitForTimeout(200);
      await expect(`${vp.label} delete engagement`, page.getByRole("alertdialog").count().then((n) => n === 0), "the delete dialog stayed open after deleting");
    },
  },
  {
    name: "settings",
    state: "seeded",
    async run(page, vp) {
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await page.getByRole("heading", { level: 1, name: "Settings" }).waitFor();
      for (const section of ["API keys", "Tools", "Resolvers", "Performance", "Data", "Privacy", "About"]) {
        await page.locator(".subnav").getByRole("button", { name: section }).click();
        await page.waitForTimeout(150);
        await scan(page, vp, `settings-${section.toLowerCase().replace(" ", "-")}`);
      }
      // A rejected value marks its field invalid and points it at the error.
      await page.locator(".subnav").getByRole("button", { name: "Tools" }).click();
      const f = page.getByLabel("httpx threads");
      await f.fill("999");
      await f.press("Enter");
      await page.getByRole("alert").waitFor();
      await expect(`${vp.label} settings`, f.getAttribute("aria-invalid").then((v) => v === "true"), "rejected field is not marked aria-invalid");
      await scan(page, vp, "settings-tools-error");
    },
  },
];

// ---------- run ----------

rmSync(out, { recursive: true, force: true });
const server = await createServer({ root, logLevel: "error", server: { port: 1431, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0];

let browser;
for (const channel of ["msedge", "chrome"]) {
  try {
    browser = await chromium.launch({ channel });
    break;
  } catch {
    /* try the next installed browser */
  }
}
if (!browser) {
  console.error("Microsoft Edge or Google Chrome is needed to run the accessibility check.");
  process.exit(2);
}

for (const vp of VIEWPORTS) {
  for (const s of scenarios) {
    if (only && !s.name.includes(only)) continue;
    // axe needs a page that belongs to an explicit browser context.
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    page.on("pageerror", (e) => fail(`${vp.label} ${s.name}`, `page error: ${e.message}`));
    await page.goto(`${base}tests/a11y/harness.html?state=${s.state}`);
    try {
      await s.run(page, vp);
    } catch (e) {
      fail(`${vp.label} ${s.name}`, `scenario stopped: ${e.message.split("\n")[0]}`);
      await page.screenshot({ path: join(out, `${vp.label}-${s.name}-stopped.png`) }).catch(() => {});
    }
    await context.close();
    console.log(`${failures.length ? "…" : "✓"} ${vp.label} ${s.name}`);
  }
}

await browser.close();
await server.close();

if (failures.length) {
  console.error(`\n${failures.length} accessibility problem(s):\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\nScreenshots: ${out}`);
  process.exit(1);
}
console.log(`\nNo accessibility problems found. Screenshots: ${out}`);
