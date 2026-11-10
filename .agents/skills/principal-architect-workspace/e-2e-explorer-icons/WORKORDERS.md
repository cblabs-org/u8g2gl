---
name: e-2e-wo1-wo5
description: Work Orders 1–5 of E-2e — widget-centred Explorer, context menu, icon Palette
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.
Do not change the design, do not create any branches beyond the five named here, do not push, and
do not start other work.

**Parent project:** `e-2e-explorer-icons` ([PROJECT.md](PROJECT.md)). Its rulings are binding.
Its owner approval is recorded in its status log (rule 00).

**Run WO1 and WO2, then stop and report.** WO3 needs a one-time download that the owner has not
yet approved. The PA starts WO3–WO5 with a follow-up message once PROJECT.md's status log records
that approval. Do not fetch `lucide-static` or any other package yourself under any
circumstances; the PA will place the tarball in `tmp/`.

# Where you work

- **Worktree:** `../U8G2GL-e2e`, starting on `u8g2gl-e2e/wo1-explorer` (the PA's records are its
  first commit). For each later WO, run `git checkout -b u8g2gl-e2e/woN-<name>` from the previous
  tip.
- **Install:** run `npm ci` in `cli/` **before** `npm ci` and any build in `designer/`. The
  designer's `tsconfig.node.json` reads the CLI's `@types`, so the other order fails with TS2688.
- **Commits:** verify the branch before every commit. Commit as you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`.
- **Baselines:** record them first, running the suites one at a time. Build the framework editor
  Wasm before `npm run build:e2e`. Emscripten: `source
  ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh` (never commit that
  path).
- **Standards:** load `u8g2gl-standards` before writing code. No workspace pointers in source
  comments or test titles. The home-path guard must pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a browser window on the owner's
  desktop.
- **Processes:** never open the owner's editor, Finder or file manager from a test. The opener
  in WO2 is injected, and tests use a fake.
- **Timing runs:** after each one, read `pmset -g log` (read only). A run that overlaps a Sleep
  or DarkWake is void and must be repeated. Change no power setting.

# WO1 — widget-centred Explorer (`u8g2gl-e2e/wo1-explorer`)

- [x] Ruling 5. The groups are Project, Screens, Widgets (one entry per widget directory, opening
      its `.xml`, the C++ not listed), Assets, and "Other files" for anything else.
- [x] Add `generated_editor` to `IGNORED_DIRECTORIES` in `cli/src/node/design/ignored-paths.ts`,
      with its why-comment updated, and a test for the watcher, the listing and the write route.
- [x] Unit tests on the grouping, including a widget whose directory has no `.xml`, which falls
      to "Other files".
- [x] Update the existing e2e tests that click Explorer file entries.

# WO2 — context menu (`u8g2gl-e2e/wo2-context-menu`)

- [x] Ruling 6. A context menu component, opened by right-click, Shift+F10 or the
      context-menu key, closed by Escape or a click outside, navigable by the arrow keys.
- [x] **View source:** a read-only Monaco tab with C++ highlighting, read through
      `GET /api/file`. Its title says read-only. A Problems row on a C++ file opens it at the line.
- [x] **Open in editor:** `POST /api/open` with `{ path, line? }`, and the `--editor <command>`
      flag and `U8G2GL_EDITOR`. The command is split once at start-up. `code`, `code-insiders`
      and `cursor` get `-g path:line`; any other command gets the absolute path only.
      Otherwise the platform opener.
- [x] **Reveal:** `POST /api/reveal`. On macOS `open -R <path>`; elsewhere open the containing
      folder, and the menu label says "Reveal in file manager".
- [x] **Copy path:** the project-relative path, with no server.
- [x] **Security tests** for both routes: no token gives 403; `..`, an absolute path, an ignored
      path, and a missing file each give 4xx, and **no spawn happens** (assert on the fake
      opener). Every spawn uses an argument array and no shell.
- [x] `--help` documents `--editor`.

# WO3 — the icon set (`u8g2gl-e2e/wo3-icons`) — **waits for the PA**

- [x] Ruling 1, from the tarball the PA places at `tmp/lucide-static-1.61.0.tgz`. Extract it
      into `tmp/` and never into the source tree.
- [x] A script, under `scripts/`, that generates the name list (`cli/src/data/icons.json`) and
      the designer's sprite from a given tarball. It keeps Lucide's aliases, and fails if any
      name in the current list would disappear.
- [x] An `<Icon name>` component in `designer/src/icons/`.
- [x] The ISC notice in `THIRD-PARTY-NOTICES.md`.
- [x] Measure the package before and after with `scripts/check-package.mjs`, and report the
      tarball and unpacked sizes. Stop and report if the tarball grows by more than 0.5 MB.

# WO4 — icon Palette (`u8g2gl-e2e/wo4-palette`)

- [x] Rulings 2–4: the framework tag → icon map, with its comment saying why it exists and that
      S-2 deletes it; the category fallback; and `puzzle` last.
- [x] The tile grid, with a tooltip on hover and on focus, the filter unchanged, and the drag
      unchanged. Keyboard: the arrow keys move between tiles.
- [x] Unit tests on the lookup order, plus e2e for the tooltip, the filter and a drag.
- [x] The render rule: no re-render on a keystroke or a drag. Show this with the render counter.

# WO5 — docs, review, evidence (`u8g2gl-e2e/wo5-readability`)

- [x] ui_spec §6 (the Explorer and the Palette), §10 (View source) and §14 (what is out of scope
      still holds: no C++ editing). The README if it describes the Explorer.
- [x] CLI version 0.15.2 → 0.15.3 (rule 03). Under VER-1 the merged PR's patch bump is this one.
- [x] Spawn the `readability-reviewer` on E-2e's diff against the base. Resolve P1–P3, and
      decide P4 with reasons.
- [x] Screenshots under `tmp/e2e/`: the Explorer, its context menu, a View source tab, and the
      Palette with a tooltip showing.
- [x] A final run of every suite, one at a time: guard; CLI, lint and tsc; goldens; C++; Wasm,
      then `build:e2e`; designer unit; e2e; production and its no-hook grep. Then write a
      completion report at the end of this file.

# Completion report (WO1–WO5)

**Branches and commits.** Each branch is cut from the one before. Nothing is pushed.

| Branch | Commits |
|---|---|
| `u8g2gl-e2e/wo1-explorer` | `4072d51` widget-centred Explorer, `generated_editor/` hidden |
| `u8g2gl-e2e/wo2-context-menu` | `df5e578` context menu; `263aee7` ticks; `adec43c` ruling 6a (Open in editor allowlist) |
| `u8g2gl-e2e/wo3-icons` | `edd0a15` Lucide 1.61.0 vendored: name list, sprite, update script, `<Icon>`, ISC notice |
| `u8g2gl-e2e/wo4-palette` | `289e91f` icon Palette: tiles, tooltips, keyboard, icons by tag and by category |
| `u8g2gl-e2e/wo5-readability` | `0d34765` ui_spec §6/§10/§14, README, CLI 0.15.3; `8f1c92d` readability fixes; this report |

**Provenance.** Each stage's approval was read from PROJECT.md's status log before work began:

- WO1–WO2: "Approved, proceed", 2026-11-09.
- Ruling 6a: committed in `382853d`.
- The Lucide download: "Yes, download it", 2026-11-10.

Nothing was fetched from the network. WO3 read the tarball the PA placed in `tmp/`, extracted under `tmp/`, and ran none of its code.

**Package size.** Measured with `scripts/check-package.mjs`; tarball and unpacked sizes in bytes.

| Point | Tarball | Unpacked | Files |
|---|---|---|---|
| Before (WO2 tip) | 15,222,576 | 54,243,150 | 760 |
| After WO3 | 15,223,704 (+1,128) | 54,247,394 | 761 |
| After WO4 | 15,324,346 (+101,770) | 54,735,815 (+492,665) | 762 |
| Final, 0.15.3 | 15,324,752 (+102,176, 0.10 MB) | 54,737,463 (+494,313) | 762 |

The sprite only enters the bundle once something draws an icon, which is WO4's Palette. That is why WO3 grew by only the licence text. The total growth, 0.10 MB, is under the 0.5 MB gate. The sprite is 452 KB raw and 91 KB gzipped.

**Final suites.** Run one at a time on `8f1c92d`, all green.

| Suite | Result |
|---|---|
| Home-path guard | self-test 11/11; tree clean |
| CLI `npm test` | 2710 passed, 23 skipped (baseline 2612) |
| CLI lint and tsc | clean |
| Goldens (`test/generator`) | 276 passed; no golden changed |
| C++ (Debug) | 515/515 (1 skipped); 0 warnings |
| Wasm editor build | succeeds |
| Wasm tests | snapshot, placeholder and last-error pass |
| `build:e2e` | builds |
| Designer unit | 157 passed (baseline 137) |
| `node --test scripts/update-icons.test.mjs` | 7 passed |
| Designer e2e | 80 passed (baseline 74 passed + 1 intermittent) |
| Production build | no test hook found by the grep |
| `test:e2e:production` | 3 passed |
| `check-package.mjs` | PASS |

- **Timing runs:** every e2e run was checked against `pmset -g log`. None overlapped a Sleep or DarkWake.
- **The baseline's one failure** was the intermittent `structure.spec.ts` Delete test. It predates E-2e and passed in every later run.

**Readability review.** The review ran on the whole diff against `29f976a`, including the 6a fix: P1 0, P2 0, P3 5, P4 6. All P3s are resolved, comments only. P4 decisions:

- **Accepted:**
  - reflowed the `ignored-paths.ts` header and moved its why-comment above the doc comment;
  - named the Palette's bare numbers;
  - one C++ extension list in the designer;
  - one `puzzle` constant;
  - dropped "six" from the category map's comment;
  - a why-comment that on Windows `--editor` must name an executable such as `Code.exe`, not `code.cmd`. `spawn` with no shell cannot run a `.cmd`, and starting a shell would break ruling 6. This is a documented limitation, not changed behaviour.
- **Declined:**
  - **"S-2" in the tag map's comment.** The PA's instruction requires the comment to say S-2 deletes the map.
  - **Merging the asset extensions with the open allowlist.** They mean different things: what the Explorer groups as an asset, and what may be opened.
  - **The last-segment path helpers.** They are one-liners, and sharing them would add an import between unrelated modules.
  - **The e2e `console.log` of render counts.** It is an existing pattern.

**Deviations, beyond those accepted at WO2 and 6a.**

1. **The icon name list is also read by the designer.** `cli/src/data/icons.json` holds Lucide's alias table (alias → canonical name) beside the names, so that an `icon=` written with an old name still validates in S-2. The designer's `icon-names.ts` reads the same file, so the designer and the validator cannot disagree on what exists. The sprite holds only canonical icons.
2. **The ISC notice has its own section** in `THIRD-PARTY-NOTICES.md`. It is not a row in the designer-bundle table, whose test compares that table with the designer's npm lock file, and Lucide is not an npm dependency. The licence text is in `cli/LICENSES/lucide-ISC.txt`, verbatim, including Feather's MIT for the icons derived from it.
3. **Tiles are all in the tab order, plus the arrow keys.** I used this instead of a single roving tab stop. React does not reset a `tabIndex` that was changed outside it, so a roving stop could leave two tiles tabbable after a filter.
4. **A tooltip shows on hover and on focus, and is the tile's own state.** The e2e test shows the Palette's render count stays at 0 across typing, a canvas drag and a tooltip.
5. **Icon choices.** The 16 framework icons are my choice, within ruling 2; the PA can swap any of them in one line. The six category icons are as ruled.

**Not verified.**

- No real editor or Finder was launched, by design. Open and Reveal were checked through a fake opener and through `page.route`.
- The Windows and Linux openers were checked only as argument arrays.
- The `@cross-browser` subset does not include the new specs, so Firefox and WebKit did not run them.
- The e2e "Reveal in file manager" label reflects Playwright's Desktop Chrome emulation (deviation 5 at WO2).

**Evidence.** Screenshots of the Explorer, its context menu, a View source tab and the Palette with a tooltip are in `tmp/e2e/`, which is git-ignored: `explorer.png`, `explorer-context-menu.png`, `view-source.png` and `palette-tooltip.png`.

