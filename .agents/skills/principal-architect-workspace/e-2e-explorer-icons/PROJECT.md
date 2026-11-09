# E-2e: Widget-centred Explorer and icon Palette

**Base:** `main` @ `29f976a` (#44 merged). Runtime 0.11.1, CLI 0.15.2. **Worktree:** `../U8G2GL-e2e`.

## Owner decisions and approval

The plan for both E-2e and S-2 was presented in chat on 2026-11-09 as one document; this file
holds its E-2e part. The owner's decisions leading to it (chat, 2026-11-08/09):

1. Explorer — "Should we not just have a right click on the widget file to 'show source' or
   something?"
2. Palette — "I think we would be better using an icon set."
3. Icons for project widgets — "option 2 with option 1 as fallback is good" (option 2: a
   per-widget `icon=` on `<api>`, schema 0.6; option 1: the category's icon as the fallback).
   Rule 03 makes the schema bump the owner's decision; this is that decision.

The owner then answered the plan, in their own words:

> "Approved, proceed"

**The Lucide download is not yet approved.** The plan required approval to name the one-time
fetch of the pinned `lucide-static` package explicitly, and the owner's answer did not, so the PA
has asked separately. Until this log records a yes, no work order may fetch it. The work orders
are re-ordered so that the two that need no icons run first (see the status log).


### Work orders

| WO | Topic |
|---|---|
| WO1 | Widget-centred Explorer, and `generated_editor/` hidden |
| WO2 | Context menu: View source, Open in editor, Reveal in Finder, Copy path |
| WO3 | The icon set: vendor Lucide into core, plus the designer's `<Icon>` component |
| WO4 | Icon Palette: a tile grid with tooltips, and icons by tag and by category |
| WO5 | Docs, readability review, e2e screenshots, PA verification |

### PA rulings

1. **The icon set (WO3).**
   - **Which set:** Lucide (ISC licence), pinned to one exact version and vendored. It is not
     a runtime npm dependency.
   - **One-time download:** fetching the pinned `lucide-static` package once from the npm
     registry is a download, so it needs the owner's permission. **The owner's approval of this
     plan must say yes to that download explicitly.**
   - **The whole set, ~1,600 icons:** that way S-2's `icon=` doesn't limit authors to the 20
     icons the framework happens to use.
   - **Two generated files, so the CLI doesn't carry SVGs:**
     - `cli/src/data/icons.json` holds the name list only, for the validator.
     - The designer's sprite holds name → path data.
   - **Expected cost:** about 1 MB unpacked in the package. WO3 measures the real size against
     the 15.2 MB tarball. If it adds more than 0.5 MB compressed, WO3 stops and reports.
   - **Updating:** a script regenerates both files from a given Lucide version. Updating Lucide
     is a deliberate PR, because Lucide sometimes renames icons. Once S-2 lands, a rename would
     break authors' `icon=` values, so the update script must keep Lucide's alias table and
     fail on any name it would drop.
   - **Licence:** `THIRD-PARTY-NOTICES.md` gets the ISC notice.
2. **Framework icons: one map in the designer, `tag → icon name`.**
   - It covers each of the 16 framework elements. The fixture's project widgets aren't in it.
   - The designer names framework tags here, and only here. This is the one exception to "no
     widget named in designer code" ([D-17]), and the reason is written next to the map: the
     framework's manifests can't carry `icon=` until S-2. **S-2 moves these icons into the
     manifests and deletes the map.**
3. **Category fallback.**
   - The framework's six categories each get an icon:
     - Controls → `toggle-left`
     - Drawing → `shapes`
     - Images → `image`
     - Indicators → `gauge`
     - Layout → `layout-template`
     - Text → `type`
   - The lookup order is: the tag's own icon, then its category's icon, then a generic
     `puzzle` icon. So a category an author invents shows `puzzle`.
4. **The Palette (WO4).**
   - **Tiles:** a grid of 56 px tiles, each the icon with its label underneath, cut short with
     an ellipsis if needed. A tile with no label shows its tag.
   - **Grouping is unchanged:** Framework / Project / Drawing, then by category.
   - **Tooltip:** on hover and on keyboard focus, it shows the label, the `<tag>` and the
     description.
   - **Still behaves as before:**
     - the filter matches the label, the tag and the description;
     - the tiles are drag sources, as today;
     - the Palette doesn't re-render on a keystroke or a drag.
   - **Keyboard:** the tiles get a keyboard path. Today's list has none.
5. **The Explorer (WO1): grouped by what an author edits, not by directory.**
   - **The groups:**
     - **Project:** `u8g2gl.xml` and `globals.xml`.
     - **Screens:** one entry per screen XML.
     - **Widgets:** one entry per widget, under its own name, which opens its `.xml`. The
       widget's `.cpp`/`.hpp` aren't listed.
     - **Assets:** fonts and images.
   - **Anything else** still appears, under "Other files", so nothing on disk goes missing.
   - **`generated_editor/` is hidden,** joining `generated/` in `ignored-paths.ts`. That keeps
     the watcher, the listing and the write route in agreement, as `generated/` already does.
6. **The context menu (WO2).** It opens on right-click on any Explorer entry, and from the
   keyboard with Shift+F10 or the context-menu key.
   - **View source…** is a submenu of the widget's files (`.xml`, `.cpp`, `.hpp`).
     - It opens a **read-only** Monaco tab with C++ highlighting, marked read-only in its title.
     - It reads the file through the existing `GET /api/file`, so it needs no new route.
     - A click on a Problems row for a C++ file opens the same tab at that line. At present it
       does nothing useful.
   - **Open in editor** uses a new route, `POST /api/open`, which carries the token like every
     other route.
     - The server opens the file with `--editor <command>` (or `U8G2GL_EDITOR`) when one is
       given. Otherwise it uses the operating system's opener (`open`, `start` or
       `xdg-open`), which opens whatever app is associated with `.cpp`.
     - With `--editor code`, the server passes `-g path:line`, so a Problems row lands on its
       line.
   - **Reveal in Finder** uses a new route, `POST /api/reveal`. On macOS it runs `open -R`.
     Elsewhere it opens the containing folder, and the menu says "Reveal in file manager".
   - **Copy path** copies the project-relative path, and needs no server.
   - **Security, for both new routes:**
     - The path goes through the same validation as `/api/file`. A path outside the project, an
       ignored path or a non-existent path gets a 4xx, with no process spawned.
     - Processes are started with `spawn` and an argument array, never a shell.
     - The editor command is split once, when the server starts, and never comes from the
       request.
     - New tests cover: the token being required, `..` in the path, absolute paths, and
       ignored paths.
7. **The boundary for E-2e:**
   - `designer/src/{ui,palette,monaco}/` and the designer's styles and tests;
   - a new `designer/src/icons/`;
   - in `cli/src/node/design/`: the server, the ignored paths and the new opener, with their
     tests;
   - `cli/src/data/icons.json` and the update script;
   - `THIRD-PARTY-NOTICES.md`;
   - `docs/ui_spec.md` §6, §10 and §14, `README`/`RELEASING` if they're affected, and the CLI
     version.

   Nothing in the schema, the validator, the generator or the runtime changes.


**Renumbering.** The plan as presented numbered the icon set WO1. It is WO3 here, so that WO1
and WO2 can run while the download waits for approval. The rulings above use the new numbers,
and their substance is unchanged. **Pinned version:** `lucide-static@1.61.0` (published
2026-10-21, ISC licence).

## PA ruling 6a — Open in editor opens source and assets only (2026-11-09, PA review of WO2)

`POST /api/open` must not let the session token start native code. Today the token reads and
writes project files and builds Wasm, which runs sandboxed; the platform opener (`open`,
`explorer.exe`, `xdg-open`) *runs* what it is given when the file is executable by type (a
`.command`, `.app`, `.bat`, `.desktop`, `.sh` …), and `PUT /api/file` can write any name. So:

- `/api/open` accepts only an allowlist of extensions: `.xml`, `.cpp`, `.cc`, `.c`, `.hpp`, `.h`,
  `.json`, `.md`, `.txt`, `.bdf`, `.xbm`, `.png`. Any other gives 403 with no spawn. The check
  applies to the requested path **and** to its real path, so a symlink named `.cpp` cannot reach
  an executable. It applies whether or not `--editor` is set.
- The Explorer offers "Open in editor" only for allowlisted files.
- Reveal is unchanged: `open -R` and opening a directory start nothing from the file.
- Tests: a `.command`, a `.sh`, an extensionless file, and a `.cpp` symlink to a `.command`
  inside the project each give 403 and no spawn.

## Status log

| Date | Entry |
|---|---|
| 2026-11-09 | Owner approved the E-2e + S-2 plan: "Approved, proceed". Download of `lucide-static` not yet approved; asked. |
| 2026-11-09 | PA created worktree `../U8G2GL-e2e` from `29f976a`, branch `u8g2gl-e2e/wo1-explorer`. Worker spawned on WO1–WO2. |
| 2026-11-09 | Worker finished WO1–WO2 (`4072d51`, `df5e578`, `263aee7`). PA accepted deviations 1–6 of its report (the `session` field on Workspace, `cli.ts` help and `disk-project.ts` `locate()` outside the listed files, `explorer.exe` on Windows, the `.xml` item opening the editable tab, the platform label taken from the browser, `aria-disabled` rows). PA found that `/api/open` lets the token start native code through the platform opener; added ruling 6a and returned WO2 for it. |
| 2026-11-09 | Worker implemented ruling 6a (`adec43c`). PA reran the server and opener tests (148 passed) and read the route: both the requested name and the real path are checked before any spawn. Accepted the shared allowlist in `cli/src/core/project-fs/openable-files.ts`, outside the ruling-7 boundary, per standards §4 (one table for two layers). WO3 waits for the owner to approve the Lucide download. |
