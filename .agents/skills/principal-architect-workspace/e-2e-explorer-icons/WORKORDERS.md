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

- [ ] Ruling 1, from the tarball the PA places at `tmp/lucide-static-1.61.0.tgz`. Extract it
      into `tmp/` and never into the source tree.
- [ ] A script, under `scripts/`, that generates the name list (`cli/src/data/icons.json`) and
      the designer's sprite from a given tarball. It keeps Lucide's aliases, and fails if any
      name in the current list would disappear.
- [ ] An `<Icon name>` component in `designer/src/icons/`.
- [ ] The ISC notice in `THIRD-PARTY-NOTICES.md`.
- [ ] Measure the package before and after with `scripts/check-package.mjs`, and report the
      tarball and unpacked sizes. Stop and report if the tarball grows by more than 0.5 MB.

# WO4 — icon Palette (`u8g2gl-e2e/wo4-palette`)

- [ ] Rulings 2–4: the framework tag → icon map, with its comment saying why it exists and that
      S-2 deletes it; the category fallback; and `puzzle` last.
- [ ] The tile grid, with a tooltip on hover and on focus, the filter unchanged, and the drag
      unchanged. Keyboard: the arrow keys move between tiles.
- [ ] Unit tests on the lookup order, plus e2e for the tooltip, the filter and a drag.
- [ ] The render rule: no re-render on a keystroke or a drag. Show this with the render counter.

# WO5 — docs, review, evidence (`u8g2gl-e2e/wo5-readability`)

- [ ] ui_spec §6 (the Explorer and the Palette), §10 (View source) and §14 (what is out of scope
      still holds: no C++ editing). The README if it describes the Explorer.
- [ ] CLI version 0.15.2 → 0.15.3 (rule 03). Under VER-1 the merged PR's patch bump is this one.
- [ ] Spawn the `readability-reviewer` on E-2e's diff against the base. Resolve P1–P3, and
      decide P4 with reasons.
- [ ] Screenshots under `tmp/e2e/`: the Explorer, its context menu, a View source tab, and the
      Palette with a tooltip showing.
- [ ] A final run of every suite, one at a time: guard; CLI, lint and tsc; goldens; C++; Wasm,
      then `build:e2e`; designer unit; e2e; production and its no-hook grep. Then write a
      completion report at the end of this file.
