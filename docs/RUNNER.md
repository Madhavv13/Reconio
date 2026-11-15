# Reconio Runner — step by step

How to run Reconio on your Windows PC. Do the steps in order. Each step says what to type and what you should see.

> Applies to Module 1 (engagements and scope). Updated at the end of every module. See also the [README](../README.md) and [accessibility rules](ACCESSIBILITY.md).

---

## Part A — One-time setup

Do Part A only once on a new computer. If your machine is already set up, go straight to Part B.

### Step 1. Open a terminal in the Reconio folder

1. Open **File Explorer** and go to the folder you cloned Reconio into.
2. Click the address bar, type `powershell`, and press **Enter**.

A blue or black window opens. Every command below is typed in this window.

### Step 2. Check the required programs are installed

Type each line and press **Enter**:

```
node --version
cargo --version
```

You should see version numbers, for example `v25.6.1` and `cargo 1.99.0`.

If you see "not recognized", install the missing program, close the terminal, and start again at Step 1:

- Node.js: https://nodejs.org (LTS version)
- Rust: https://rustup.rs. During setup, accept the offer to install **Visual Studio Build Tools** with **Desktop development with C++**.

### Step 3. Install the app's packages

```
npm install
```

Wait until it finishes and you get the prompt back. You should see `added ... packages` or `up to date`.

### Step 4. Download the recon tools

```
npm run fetch-tools
```

You should see:

```
↓ subfinder 2.17.0 ... verified
↓ dnsx 1.3.1 ... verified
↓ httpx 1.12.0 ... verified
```

"verified" means the file's checksum matches the one pinned in `tools.lock.json`. If you see `CHECKSUM MISMATCH`, stop and see Problems at the end of this page.

Setup is done.

---

## Part B — Run Reconio

Do this every time you want to open the app while developing.

### Step 5. Start the app

In the terminal from Step 1, type:

```
npm run tauri dev
```

- **The first start after an update takes 3 to 5 minutes**, because Rust compiles everything. You will see many `Compiling ...` lines. That is normal.
- Later starts take a few seconds.

The Reconio window opens by itself when it is ready.

### Step 6. Go through the setup screens

The very first time, Reconio opens a 4-step setup (the step names are along the top):

1. **Welcome:** the Reconio icon and **Get started**. Click it.
2. **Tool check:** subfinder, dnsx and httpx each show **Passed** with their version and "SHA-256 matches". The bottom says "3 of 3 tools ready". Click **Continue**. (If a tool fails, Continue stays disabled and the row says how to fix it.)
3. **API keys (optional):** paste a key for any passive source you have and click **Save**. It shows masked, like `ghp_••••3f2a`, and goes into Windows Credential Manager. Or click **Skip for now**.
4. **First engagement:** fill it in as in Step 7.

If you already created engagements before this update, step 4 also has **Use my existing engagements**, which finishes setup without creating a new one.

The setup never shows again once it is finished.

### Step 7. Create your first engagement

On the **First engagement** step:

1. **Name:** type `acme.example`.
2. **Client:** type `Acme Corp` (optional).
3. Click in the **In scope** box and paste these lines:

   ```
   acme.example
   *.acme.example
   203.0.113.0/24
   https://portal.acme.example/login
   ```

4. Click in the **Out of scope** box and paste:

   ```
   - *.legacy.acme.example
   - status.acme.example
   ```

   A preview appears under the boxes. Check that it shows:
   - every rule with its kind (**Domain**, **Wildcard**, **CIDR**) and **In scope** or **Out of scope**;
   - a yellow note on `portal.acme.example`: "Path /login ignored...";
   - a yellow note on `*.legacy.acme.example`: "legacy.acme.example itself is still in scope..." with an **Exclude it too** button.
5. Notice that **Create engagement** is greyed out.
6. Tick **I am authorized to test this scope.** The button turns orange.
7. Click **Create engagement**.

You land on the **Scope** screen, and the window title changes to `acme.example — Reconio`.

### Step 8. Check the Scope screen

You should see:

- **In scope** list with 4 rules. **Out of scope** list with 2 rules, on a yellow background with an **Out of scope** tag.
- **Root domains** on the right: `acme.example`. These are the only names that will be sent to subfinder's passive sources.
- **Authorization**: your Windows user name and the time.

### Step 9. Test some hosts

Type each value into **Test a host** (top right). The answer appears under the box:

| Type this | You should see |
|---|---|
| `www.acme.example` | **In scope**, decided by `*.acme.example` |
| `x.legacy.acme.example` | **Out of scope**, decided by `*.legacy.acme.example` |
| `203.0.113.5` | **In scope**, decided by `203.0.113.0/24` |
| `other.example` | **Pending**: no name rule matches, but an IP range is in scope, so a scan would resolve it first |

### Step 10. Add a rule

1. Click **Add rule** (top right, orange).
2. **Pattern:** type `*.shop.acme.example`. Under the box it says "Detected kind: wildcard...".
3. Keep **Effect** on **In scope**, tick the authorization box and click **Add rule**.

A green message says "1 rule added." and the rule appears in the In scope list.

Also try **Bulk paste** (next to Add rule): paste several lines, choose **In scope** or **Out of scope** under **Add to**, and check the preview before adding.

### Step 11. Make a second engagement and switch

1. Click the engagement name at the top of the sidebar (`acme.example`). A menu opens.
2. Click **New engagement**. Name it `globex.example`, put `*.globex.example` in In scope, tick the box and create it.
3. Open the menu again and click `acme.example`. Its rules come back, and the globex rule is not among them. Each engagement keeps its own data.

### Step 12. Engagement settings and delete

1. Switch to `globex.example`, then click **Engagement settings** in the sidebar.
2. You see the details, the authorization record, and the storage folder with its size. **Open folder** shows it in File Explorer.
3. Click **Delete engagement**. The red button stays disabled until you type `globex.example` exactly. Type it and confirm.

Reconio switches back to `acme.example`.

### Step 13. Settings

Click **Settings** at the bottom of the sidebar. The sections on the left match the mockup:

- **API keys**: the same list as in setup. Saved keys show masked, with **Replace** and a delete button.
- **Tools**: each tool with a green shape and **Bundled, verified**, plus threads, rate limit and timeout. Change a number and click elsewhere to save it ("Saved" appears in the top bar). A value outside the limits shows a red message and is not saved.
- **Resolvers**: one IP per line, then **Save**.
- **Performance**, **Data** (your data folder and the size of each engagement), **Privacy** and **About** (app and tool versions).

### Step 14. Close the app

Close the Reconio window. Next time, it reopens on the last engagement you used.

---

## Part C — Run the tests (optional)

### Step 15. Run the tests

In the terminal, in the Reconio folder:

```
npm run test:rust
```

Wait for it to finish. Look for these two lines:

```
test result: ok. 81 passed; 0 failed
test result: ok. 6 passed; 0 failed
```

The second line is the **scope regression suite**: 35 real-world scope decisions, 7 paste-parsing cases and 4 randomised checks. If it ever fails, the release is blocked.

If any test says `FAILED`, copy the output into a bug report.

Then run the accessibility check (Microsoft Edge must be installed; it is on every Windows 11 PC):

```
npm run test:a11y
```

It opens every screen and dialog in a hidden Edge window, at full size and at 200% zoom, and checks them against WCAG 2.2 AA. The last line should be:

```
No accessibility problems found. Screenshots: ...\Reconio\test-results\a11y
```

The screenshots folder shows every screen it checked. If it lists problems, copy the output into a bug report. See [ACCESSIBILITY.md](ACCESSIBILITY.md) for what it checks and the rules every screen follows.

### Try zoom in the app

In the running app, press **Ctrl +** a few times. Everything gets bigger and nothing is cut off; at 200% the sidebar moves above the content. **Ctrl 0** goes back to normal size.

---

## Part D — Make an installer (optional)

### Step 16. Build the installer

```
npm run tauri build
```

This takes 5 to 10 minutes the first time. When it finishes, the last lines show where the installers are:

```
Finished 2 bundles at:
  ...\src-tauri\target\release\bundle\msi\Reconio_0.1.0_x64_en-US.msi
  ...\src-tauri\target\release\bundle\nsis\Reconio_0.1.0_x64-setup.exe
```

### Step 17. Install and open Reconio

1. In File Explorer, open `src-tauri\target\release\bundle\nsis\` inside the Reconio folder.
2. Double-click `Reconio_0.1.0_x64-setup.exe` and follow the installer.
3. If Windows shows **"Windows protected your PC"**, click **More info**, then **Run anyway**. This appears because the app is not code-signed yet.
4. Open **Reconio** from the Start menu. It uses the same engagements as the dev app.

---

## Where your data is

All engagements are stored in `%APPDATA%\Reconio`. Paste that into the File Explorer address bar to open it.

- `app.db` is the list of engagements.
- `engagements\<id>\engagement.db` holds one engagement's scope (and, from Module 2, its results).

**To start again from an empty app**, close Reconio and delete the `%APPDATA%\Reconio` folder. This deletes every engagement.

---

## Problems

| What you see | What to do |
|---|---|
| `'node' is not recognized` or `'cargo' is not recognized` | Install the program (Step 2), close the terminal, and open a new one |
| `Port 1420 is already in use` | Reconio is already running in another terminal. Close that one, then run Step 5 again |
| `manifest.json` or `binaries\subfinder... doesn't exist` | The tools were not downloaded. Run Step 4 |
| `CHECKSUM MISMATCH` in Step 4 | The download is broken or not the pinned version. Run Step 4 again. If it keeps happening, open an issue. Never edit the checksum |
| A tool shows **Does not match the build** or **Missing** | Run `npm run fetch-tools -- --force`, then Step 5 again |
| `link.exe not found` | Install Visual Studio Build Tools with **Desktop development with C++** (Step 2) |
| **Create engagement** stays grey | Fill in the name and tick **I am authorized to test this scope** |
| "An engagement called ... already exists" | Names must be unique, and capital letters don't make a name different. Pick another name |
| A red box says **This screen stopped working** | Click **Reload**. If it comes back, open an issue with a screenshot of the box |
