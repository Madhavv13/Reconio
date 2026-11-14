// Copies the design system and logo into the app. The files in ../ui-design-system-glass and
// ../logo stay the source of truth; never edit the copies under src/.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(app, "..");
const copies = [
  ["ui-design-system-glass/tokens.css", "src/styles/design/tokens.css"],
  ["ui-design-system-glass/components.css", "src/styles/design/components.css"],
  ["logo/reconio-mark.svg", "src/assets/reconio-mark.svg"],
  ["logo/reconio-app-icon.svg", "src/assets/reconio-app-icon.svg"],
  ["logo/reconio-app-icon.svg", "public/reconio-app-icon.svg"],
];

for (const [from, to] of copies) {
  const src = join(repo, from);
  if (!existsSync(src)) {
    // Building from a checkout that only has the app folder: keep the committed copies.
    console.warn(`sync-design: ${from} not found, keeping the committed copy`);
    continue;
  }
  mkdirSync(dirname(join(app, to)), { recursive: true });
  copyFileSync(src, join(app, to));
}
console.log("sync-design: design system and logo copied");
