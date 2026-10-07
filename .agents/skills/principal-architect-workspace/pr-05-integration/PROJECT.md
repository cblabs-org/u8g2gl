# PROJECT — PR-05: foundation integration and the first real board

**Tier 2 · Principal Architect**
**Programme**: U8G2GL
**Parent**: [PROGRAM.md](../PROGRAM.md) — after PR-4R3 (#10); PR-07's gate depends on it
**Source**: Chief Architect bridge "PR-05: foundation integration and the first real board"
(pasted by the owner, 2026-10-06)
**Twin project**: `esp32-app-foundation` →
`.agents/skills/principal-architect-workspace/pr-u8g2gl-05/PROJECT.md` (the integration module,
the board, and the gate evidence). This file owns the U8G2GL half and the programme view.
<!-- Last updated: 2026-10-06 -->

## Mandate

The first PR that leaves this repository. Two PRs, one work programme:

| Repo | Branch prefix | Scope |
|---|---|---|
| `cblabs-org/u8g2gl` @ `1254eb3` | `u8g2gl-05/` | **Packaging only** (WO-A) |
| `matthewmcneill/esp32-app-foundation` @ `e5342373` | `u8g2gl-integration/` | `modules/U8G2GLDisplay/`, the generated UI, the pre-build hook, the notices row, `DiagnosticsBoard` migrated, and PR-07's "before" evidence |

**Out of scope:** other boards (PR-10), the Wasm preview and snapshot harness (PR-06), publishing
or tagging anything, Q-17's parser change, any generator or runtime change. A generator or runtime
defect found here is **reported**, not fixed.

**Baselines (U8G2GL):** C++ **401** (one known skip, `SizeOfReport.ThirtyTwoBitTarget`), CLI
**1338**, zero warnings. Schema **0.4**, CLI **0.11.0**, runtime **0.7.0**. None of these versions
moves in this PR: packaging metadata changes no output and no API.

## Human Approval

> "Please proceed with the development - I will work with you to connect to the platformio mcp
> (which is already on the machine) and also attache a device later when back at the bench.  For
> now get on with the dev - thanks."
>
> — the owner, 2026-10-06, in reply to the PA's scoping report and proposed decomposition
> (WO-A; WO-B1..B4) with rulings R1–R7.

The owner answered R4 and R5 directly. R1–R3, R6 and R7 were approved as the PA recommended them
in the plan the owner approved. They are recorded below as approved and stand unless the owner
overturns them.

## Rulings

| # | Question | Ruling |
|---|---|---|
| R1 | Does `U8G2GLDisplay` own the display in PR-05? | **No.** With one board migrated, the other legacy boards still need the panel, and two modules cannot both drive one SPI display. In PR-05 the module is a **board host**: an `IDisplayBoard` that runs a generated screen inside the legacy carousel, calling the screen's public `tick_fn` / `render_fn` (`u8g2gl_screen`, `include/u8g2gl/u8g2gl_core.h`). It does not call `ui_handler()`, which clears and sends the buffer itself; the legacy module already does both (`U8G2Display.cpp:1413`). Display, carousel and screensaver ownership move in PR-10 |
| R2 | The CLI version pinned in `cli/test/integration/generate.test.ts` | **Keep the deliberate pin** at `:467` ("the 0.11.0 proof"; its comment explains why a self-referential check proves nothing). Change only the **incidental** literal at `:345` to read `package.json` |
| R3 | PlatformIO clones a git dependency `--recursive` | Set **`update = none`** on all four submodules. Without it every consumer fetches `extern/u8g2` (~200 MB) and two **private** `mm-skills` repos, and the install fails for anyone without access. Contributors then initialise with `--checkout` |
| R4 | No PlatformIO MCP in the PA session | The owner will connect the PlatformIO MCP. Until then, foundation work that needs a PlatformIO build is **deferred, not done by CLI** (foundation `rules/04`) |
| R5 | Hardware | The owner will attach an esp32dev + SSD1322 later. An interactive on-device WO is added then |
| R6 | Merge order | The U8G2GL PR merges **first**; foundation re-pins `lib_deps` to the merge commit on `main` before its own merge. Development pins to the pushed WO-A branch commit |
| R7 | Web diagnostics | **Deferred to PR-10.** The legacy Screenshot tab already captures the new board, which draws into the legacy buffer |

## Bridge corrections, as found on scoping

1. **"Version read from the same place `CMakeLists.txt` reads it."** JSON cannot read a header.
   The buildable form: CMake configure refuses when `library.json` disagrees with
   `u8g2gl_version.h`, the same mechanism that already guards `project(... VERSION)`.
2. **"Native/Wasm exclusions" in the runtime's manifest.** Wasm is not a PlatformIO platform, and
   native exclusion depends on the consumer's environment names. It belongs in foundation (module
   `extraScript` or `lib_ignore`), not in a library published for any U8G2 user.
3. **`library.properties`.** The Arduino 1.5 library format puts only `src/` on the include path.
   The runtime's public headers are in `include/u8g2gl/`, so a `library.properties` today would
   advertise an Arduino library that cannot compile. WO-A ships `library.json` only; see
   **Open for the owner**.
4. **The pinned CLI version** is deliberate (R2).
5. **`DiagnosticsBoard` has a downstream user.** `departures-board-v3/src/main.cpp:22` includes
   it. It is harmless, since v3 is pinned at `framework.lock` `f53cc1d7` and nothing is deleted,
   but §6's "no downstream dependency" is wrong.
6. **Measured: PlatformIO 6.1.19 honours `update = none`** on both of its clone paths, a branch
   or tag (`clone --recursive --depth 1`) and a commit (`fetch --depth=1` then
   `submodule update --init --recursive --force`). Tested in a scratch repo; `--force` does not
   override it.

`DiagnosticsBoard` is **confirmed** as the first subject: four labels, two fonts, live values,
288 lines. Two notes for the gate:

- Its fonts are `_tr`, which have no glyph `0xB7`, so the "·" separator very probably never
  renders. Pixel identity means reproducing that. The baseline will show it.
- Its `tick()` reads hardware directly, so the migrated version needs injectable inputs to be
  rendered with fixed values.

## Branch Strategy

**U8G2GL.** Worktree `../U8G2GL-05` from `origin/main` @ `1254eb3`; the main checkout is parked on a
merged branch. One WO: `u8g2gl-05/wo1-packaging`, with no upstream. It is pushed once green, because
foundation needs a fetchable commit to pin (R6). The PR opens from it against `main`.

**Foundation.** Worktree `../esp32-app-foundation-u8g2gl` from `origin/main` @ `e5342373`; the main
checkout is on `chore/migrate-bug-fixer-to-daemon-plugin`, and a bug-fixer daemon works there.
Stacked `u8g2gl-integration/wo<N>-<topic>`, serial.

## Work Order Ledger

### U8G2GL

- **[x] [wo1-packaging](wo1-packaging/WORKORDER.md):** `library.json`, version agreement at
  configure time, submodules `update = none`, the incidental version literal. **Complete and
  verified by the PA.** Pushed. **Pin: `82ec83f2bbce02080c3dd1ab6618bcf6559bfde5`** (the code; later commits add only workspace records).

### Foundation (ledger of record: the twin `PROJECT.md`)

- **[ ] WO-B1 `wo1-baseline`:** the "before" evidence. Part 1 (pixel baseline, line counts)
  *dispatched*; Part 2 (flash/RAM, edit-loop timing, native suite count) waits for the PlatformIO
  MCP (R4).
- **[ ] WO-B2 `wo2-module`:** `modules/U8G2GLDisplay/` board host,
  `uidesign/ssd1322-256x64/u8g2gl/`, pinned `lib_deps`, pre-build hook, notices row, `main.cpp`
  switch. Blocked on WO-A's pushed commit and on R4 for its build.
- **[ ] WO-B3 `wo3-evidence`:** the "after" measurements, the same harness, `EVIDENCE.md`, and a
  PR description announcing the PD-4 freeze.
- **[ ] WO-B4 `wo4-readability`:** foundation standards pass.
- **[ ] WO-B5 (interactive):** an on-device check against the host render, when hardware is
  attached (R5).

## Concurrency

WO-A and WO-B1 touch different repositories: **parallel, no overlap.** WO-B2 consumes WO-A's
pushed commit, so it is serial after both.

## Open for the owner

- **Arduino IDE packaging (correction 3).** §16 promises an Arduino library. It needs either the
  public headers under `src/` or a forwarding layer there, which is a runtime layout change and
  outside a packaging-only PR. A ruling is needed before anyone builds it.
- **Private repositories.** Both are private, so the pinned git `lib_deps` resolves only with the
  owner's GitHub credentials, and foundation has no CI. This works today; it is recorded so the
  first external consumer does not discover it.

## Session Log

- **2026-10-06 — scoping and dispatch.** Scoped both repos read-only; the findings are above.
  Owner approved. Worktrees created. WO-A and WO-B1 Part 1 dispatched in parallel.
- **2026-10-06 — WO-A verified.**
  - **Suites:** re-run by the PA, sequentially, from a clean build directory: C++ 401 (1 skip,
    `SizeOfReport.ThirtyTwoBitTarget`), CLI 1338, lint clean, zero warnings. Baselines held.
  - **Configure refusal:** demonstrated by the worker (`library.json` 0.7.1 → "Runtime version
    mismatch: library.json says 0.7.1 …").
  - **Fresh recursive clone:** 13 MB, with no submodule populated.
  - **PlatformIO consumer:** `esp32dev`, `framework = arduino, espidf`,
    `lib_compat_mode = strict`, pinned to the pre-rewrite form of `82ec83f`. Builds with `u8g2gl @ 0.7.0` and
    `U8g2 @ 2.36.18`. `libdeps/u8g2gl` is 10 MB and `extern/u8g2` is empty (PA re-checked).
  - **Carried to WO-B2:** the consumer needed `CONFIG_FREERTOS_HZ=1000` and
    `CONFIG_AUTOSTART_ARDUINO=y`, which are dual-framework settings. Confirm foundation sets them.
  - **Fixed by the PA:** the stale `CONTEXT_BRIDGE.md` note on the version pin (worker finding).
    Older dated workspace records showing `--init` without `--checkout` are left as history.
  - **For the owner:** `library.json` names the author "Matthew McNeill". The email was removed
    at the owner's request (2026-10-06), and the branch history was then rewritten so it never
    appears. See the session log.
    The source headers say "Matt McNeill (CB Labs)". Which should the published manifest carry?
- **2026-10-06 — foundation WO-B1 Part 1 and WO-B2 Part 1 verified.**
  - **Pixels:** the migrated `DiagnosticsBoard` renders **byte-identical to legacy** in all four
    scenarios, defects included. The PA reproduced this from a clean archive. The gate's
    criterion 1 is met in the host harness; the device check is WO-B5.
  - **Criterion 2 is not obviously met:** 138 authored code lines against 99. The detail is in the
    twin PROJECT and its EVIDENCE §2.
  - **Legacy defects the baseline records**, bug for bug:
    - an off-by-one clip, so descenders are cut;
    - a "·" separator that never draws;
    - a long SSID cut mid-glyph.

## Findings for the Chief Architect — U8G2GL runtime and CLI (reported, not fixed here)

Measured by foundation WO-B2 in the host harness (real U8G2 2.36.18) and confirmed in source by the
PA where cited.

1. **The runtime never establishes `setFontPosTop()`, but every text widget assumes it.**
   - `u8g2gl_label.cpp:334` and `u8g2gl_clock.cpp:221` assume it; design_spec §Appendix A
     (`:2216`) calls it "the framework default"; nothing in `src/` sets it.
   - Measured: the `connected` frame drawn by a plain `begin()` + `ui_handler()` user lights
     **15 pixels instead of 1392**.
   - Foundation is unaffected only because its legacy module sets it. **Severity: high** for any
     other consumer, and the first thing a new user would hit.
2. **The state saver restores a null font**, and U8G2 dereferences it. That is a segfault on the
   first frame when no font was current before a widget drew (`u8g2gl_state_saver.h:80-83`).
3. **The state saver does not restore the font mode.** Its header says U8G2 has no getter, but
   `u8g2->font_decode.is_transparent` is readable. A label left the legacy module's
   transparent mode as solid for every later board. Foundation's host board restores it.
4. **A screen file not named `screen_*.xml` is silently ignored.** `validate` and `generate` both
   exit 0 and report "0 screens". design_spec §19 states the naming but nothing enforces or
   reports it.
5. **The generated config's PlatformIO guidance, `build_flags = -include
   generated/u8g2gl_generated_config.h`, is likely unworkable in a multi-library project.** It is
   a relative path. It reaches C units, where `static_assert` is not a keyword before C23. And it
   reaches libraries that cannot resolve `u8g2gl/`. Without it the runtime's binding pool keeps
   its default size.
   - **Measured (foundation WO-B2 Part 2): confirmed, and worse than predicted.** The project-wide
     `-include` fails on the first unrelated library, before any C unit:
     `u8g2gl_generated_config.h:30:10: fatal error: u8g2gl/u8g2gl_version.h: No such file or
     directory`, first in the Arduino `FS` library and then in `PsychicHttp`.
   - **What works:** a PlatformIO build middleware that adds the include to the runtime's own 15
     sources only. It shrank `s_binding_pool` from 6144 B to 96 B, and `esp32dev` RAM from
     63388 B to 57340 B. The generated header's comment should recommend that form, or the
     runtime should take the header path by a macro.
6. **`library.json` `frameworks: "arduino"` excludes the runtime from native and other
   non-Arduino PlatformIO builds.** This was WO-A's own choice, because the runtime includes
   `U8g2lib.h`.
   - Foundation's native tests work around it by compiling the runtime through a test-local
     unity file.
   - `"*"` would match `platforms` and let PlatformIO's library finder build it on native. It
     needs a decision, since a native build then also needs U8G2's C symbols, which foundation
     stubs out.
- **2026-10-06 — history rewritten at the owner's instruction.** The owner asked for the contact
  address to be cleaned out of the history.
  - `git filter-branch --prune-empty --tree-filter` over `1254eb3..u8g2gl-05/wo1-packaging`
    removed the field from every commit's `library.json`. The removal commit, now empty, was
    dropped.
  - **Verified:**
    - `git log -p` over the range contains no occurrence;
    - the final tree is identical to the pre-rewrite tip `a324695`;
    - the code commit `82ec83f` differs from the old `69c37e0` only in `library.json`.
  - **Pushed:** with `--force-with-lease` against `0fe144f`.
  - **Old refs removed:** the `refs/original` backup was deleted and this branch's reflogs
    expired. No ref reaches `1dee2db`, `69c37e0`, `47618b5` or `0fe144f`.
  - **Foundation re-pinned** to `82ec83f`, and a fresh `FetchContent` reproduces every render.
  - **Residual:** GitHub keeps unreachable commits viewable by sha until its own garbage
    collection. A guaranteed purge of the old commits is a GitHub Support request. The objects
    also remain in the local object store until `git gc` prunes them.
  - Older log entries citing the old shas describe what was verified at the time.
