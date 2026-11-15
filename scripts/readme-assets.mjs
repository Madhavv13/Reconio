// README images: renders .github/assets/banner.html to banner.png and copies the curated app
// screenshots from the accessibility run into .github/assets/screens/.
//
// Usage: npm run test:a11y   (makes fresh screenshots of every screen)
//        npm run readme:assets
//
// When a module adds screens: add their screenshot names to SCREENS, run both commands and
// update the Screenshots section of README.md.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, ".github", "assets");
const shots = join(root, "test-results", "a11y", "1440x900");

// Screenshot names written by scripts/a11y.mjs, in README order.
const SCREENS = [
  "scope-test",
  "onb-2-tools",
  "onb-4-engagement",
  "dialog-add-rule",
  "dialog-bulk-paste",
  "switcher-menu",
  "engagement-settings",
  "settings-api-keys",
  "settings-tools",
];

const missing = SCREENS.filter((s) => !existsSync(join(shots, `${s}.png`)));
if (missing.length) {
  console.error(`Missing screenshots: ${missing.join(", ")}. Run npm run test:a11y first.`);
  process.exit(1);
}
mkdirSync(join(assets, "screens"), { recursive: true });
for (const s of SCREENS) copyFileSync(join(shots, `${s}.png`), join(assets, "screens", `${s}.png`));
console.log(`✓ ${SCREENS.length} screenshots copied`);

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
  console.error("Microsoft Edge or Google Chrome is needed to render the banner.");
  process.exit(2);
}
const page = await browser.newPage({ viewport: { width: 1280, height: 400 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(join(assets, "banner.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.locator("#banner").screenshot({ path: join(assets, "banner.png"), omitBackground: true });
await browser.close();
console.log("✓ banner.png rendered");
