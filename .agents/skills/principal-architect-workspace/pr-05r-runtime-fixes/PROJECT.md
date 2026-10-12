# PROJECT — PR-05R: six defects the first real integration found

**Tier 2 · Principal Architect**
**Programme**: U8G2GL
**Parent**: [PROGRAM.md](../PROGRAM.md) — after PR-05 (#11, #12), before PR-06
**Source**: Chief Architect bridge "PR-05R: six defects the first real integration found" (pasted by
the owner, 2026-10-12); findings from [PR-05](../pr-05-integration/PROJECT.md) "Findings for the
Chief Architect"
<!-- Last updated: 2026-10-12 -->

## Mandate

PR-05 put generated code on real hardware and found six defects host testing could not. All six
are in scope:

1. Nothing calls `setFontPosTop()`, yet every text widget assumes it. A plain `begin()` +
   `ui_handler()` lights 15 pixels instead of 1392. **Also a design decision**: where the framework
   establishes ambient U8G2 state, and whose state wins.
2. The state saver restores a null font, which U8G2 dereferences.
3. The state saver does not restore font mode, though `font_decode.is_transparent` is readable.
   Correct the header's reasoning as well as the code.
4. A screen file not named `screen_*.xml` is silently ignored.
5. The generated config's PlatformIO advice (`-include`) breaks on the first unrelated library;
   the working form cuts the binding pool from 6144 B to 96 B. The §18 budget must reflect the
   real figure.
6. `library.json` `frameworks: "arduino"` keeps the runtime out of native builds.

Plus: **re-measure gate criterion 1** once the framework sets the font position itself. PR-05's
0-pixel result was obtained with foundation's legacy module setting it.

**Out of scope:** the Arduino release artefact (Q-18), Q-17's manifest-diagnostic locations,
PR-06's Wasm work, anything committed to foundation's held branch, gate criteria 2 and 4. A further
defect is reported, not absorbed, except as ruled below.

**Baselines to hold:** C++ **401** (one known skip, `SizeOfReport.ThirtyTwoBitTarget`), CLI
**1338**, **zero** warnings. Schema **0.4** (do not bump). CLI **0.11.0**, runtime **0.7.0**.
U8G2 **2.36.18**.

## Branch Strategy

Base: `origin/main` @ `9808423` (`5075322` + a `.gitignore` chore). Worktree `../U8G2GL-05r`;
the main checkout holds `main`. Branches `u8g2gl-05r/wo<N>-<topic>`, stacked, each based on the
previous WO's branch by name, no upstreams. The stack tip opens as one PR against `main`.
**Merge with a merge commit, never a squash** (`rules/04`: foundation's held branch pins a bare
commit).

**Concurrency (Option B, recommended and approved with the plan):** WO1 (C++ runtime) and WO2 (CLI
project reader) share no file except separate sections of `docs/design_spec.md`. WO2 runs in
parallel in `../U8G2GL-05r-wo2`, branched from WO1's first commit (this record). When both are
done the PA rebases WO2 onto WO1's tip; WO3 onward is serial.

**Fresh-worktree gotcha, corrected:** `.gitmodules` sets `update = none` on `extern/u8g2`, so the
bridge's `git submodule update --init --reference …` skips it. The working command is
`git submodule update --init --checkout --reference ../U8G2GL/extern/u8g2 extern/u8g2`.

## Scoping findings — PA, 2026-10-12, at `9808423`

- **Item 1.** `setFontPosTop` appears in `src/` only in comments (`u8g2gl_label.cpp:334`,
  `u8g2gl_clock.cpp:221`), and design_spec Appendix A calls it "the framework default".
- **Item 2.** `u8g2_SetFont()` (`extern/u8g2/csrc/u8g2_font.c:1279`) calls `u8g2_read_font_info()`
  on the new pointer whenever it differs from the current one, so restoring `nullptr` over a real
  font dereferences null. **The host stub cannot show it**: `test/stubs/U8g2lib.h` models only
  `u8g2_t::font`. The reproduction belongs in the real-U8G2 lane (`test/real_u8g2`,
  `u8g2gl_real_u8g2` in `test/CMakeLists.txt`).
- **Item 3, and the fourth the bridge predicted.** Every ambient setter is readable from the state
  struct (`extern/u8g2/csrc/u8g2.h`):

  | State | Field | Saved today |
  |---|---|---|
  | Draw colour | `draw_color` (also `getDrawColor()`) | yes |
  | Font | `font` | yes, null-unsafe |
  | Font mode | `font_decode.is_transparent` | **no** — header says unreadable |
  | Bitmap mode | `bitmap_transparency` | **no** — header says unreadable |
  | Font position | `font_calc_vref` (function pointer) | **no** |
  | Font direction | `font_decode.dir`, only under `U8G2_WITH_FONT_ROTATION` | **no** |

- **The fourth defect: three repaint paths bypass the saver.** `u8g2gl_label.cpp:494`,
  `u8g2gl_clock.cpp:291` and `u8g2gl_progress_bar.cpp:285` call `render(display)` directly in their
  blocked-loop animation updates, outside `u8g2gl_render_object()`. They leak draw colour and font
  into the caller and would miss the framework's font position. The label carries its own clip
  workaround for the same reason. Absorbed under R2.
- **Item 4.** The filter is `cli/src/node/read-project.ts:108`. `readProjectFiles()` can only throw
  today; it has no warning channel.
- **Item 5.** The advice is emitted at `cli/src/core/generator/emit/generated-config.ts:161-176`.
  The budget's "binding pool slots" line (`report/budget.ts:387`) reports a count with no word on
  whether the header reaches the runtime.
- **Item 6.** `library.json` `"frameworks": "arduino"`, `"platforms": "*"`.
- **Bridge gotcha, disputed (R3).** `cli/test/integration/generate.test.ts:460` pins `0.11.0`
  literally *on purpose*: a test that compares the stamp against `package.json` passes at every
  version and so cannot prove a bump happened. Put to the owner.

## Rulings (owner, 2026-10-12)

- **R1 — where ambient state is established. Agreed.** `u8g2gl_state_saver`, constructed inside
  `u8g2gl_render_object()` (§11.3), becomes save → **establish** → restore. On entry it captures
  every readable item in the table above, then establishes the framework's baseline
  (`setFontPosTop()`, direction 0). On exit it restores the caller's state exactly; a null font is
  written back to the struct directly, never through `setFont()`. **U8G2GL's state wins inside each
  object's render; the caller's at every other moment.** Setting once per frame or in `begin()` is
  rejected: user code between frames or objects would undo it, and the repaint paths would miss it.
  The class keeps its name (public header); its doc states the wider role.
  - **Owner's condition: full state setting must be cheaper than applying deltas, with no
    allocation.** PA checked the U8G2 source: every setter is a single field assignment —
    `u8g2_SetDrawColor` (`u8g2_hvline.c:249`), `u8g2_SetFontMode` (`u8g2_font.c:931`),
    `u8g2_SetBitmapMode` (`u8g2_bitmap.c:39`), `u8g2_SetFontPosTop` (`u8g2_font.c:1257`),
    `u8g2_SetFontDirection` (`u8g2_font.c:1556`). `u8g2_SetFont` already compares and returns
    when the font is unchanged; only a real change reads the font header from flash. No setter
    allocates. A delta scheme would need the same comparison, so it cannot be cheaper. WO1 confirms
    by measurement and states the per-object cost.
- **R2 — the repaint paths. Approved: absorb into WO1.**
- **R3 — the version pin. Open.** The owner: "this seems fundamentally fragile, we will have to
  update a literal in a test every time we increment the build … I'm not sure we are guarding this
  failure mode via tests in the right way altogether." The PA owes a redesign of the §13.9 guard
  before WO4; WO4 does not start until the owner confirms it.
- **R4 — item 5's form. Approved:** a `U8G2GL_GENERATED_CONFIG` macro naming the header,
  included from `u8g2gl_config.h`, measured first against PR-05's build middleware. If PlatformIO's
  string quoting defeats it, fall back to the middleware and document it.
- **R5 — item 4. Approved:** a warning naming the file and the suggested rename, not an error.
- **R6 — versions. Approved:** runtime 0.7.0 → **0.8.0**, CLI 0.11.0 → **0.12.0**. Schema stays 0.4.

## Human Approval

> R1 - I agree.  Please check that full state setting is cheaper than changing the deltas of what
> is different.  I assume that state setting is just pointers rather than mallocs etc.
> R2 - ok
> R3 - this seems fundamentally fragile, we will have tup update a literal in a test evry time we
> increment the build from what it sounds like.   I'm not sure we are guarding this failure mode via
> tests in the right way altogether.
> R4 - ok
> R5 - ok
> R6 - ok
>
> I will attach hardware later when you are ready.
>
> I approve the build.  Proceed as /principal-architect

— the owner, 2026-10-12, approving the decomposition below (WO4's version-guard design excepted,
per R3).

## Work Orders

- **[x] [wo1-ambient-state](wo1-ambient-state/WORKORDER.md):** items 1–3 and the repaint paths
  (R1, R2). Real-U8G2 reproductions first. `architect`.
- **[x] [wo2-screen-discovery](wo2-screen-discovery/WORKORDER.md):** item 4 (R5). Parallel with
  WO1. `standard`.
- **[x] [wo3-platformio](wo3-platformio/WORKORDER.md):** items 5 and 6 (R4), one PlatformIO
  measurement rig. `architect`.
- **[ ] [wo4-height-and-bool-refs](wo4-height-and-bool-refs/WORKORDER.md):** the reference-height
  mode (R7) and bool-subject comparisons on xtensa (R8). `architect`.
- **[ ] wo5-release-criterion1:** versions (R6), goldens, the §13.9 guard per R3's outcome, and the
  criterion 1 re-measurement in a scratch foundation worktree (nothing committed to foundation).
  **Blocked on R3.** `standard`.
- **[ ] wo6-readability:** `readability-reviewer` pass and remediation. `standard`.
- **Later, interactive:** an on-device criterion 1 check when the owner attaches hardware.

## Modules & Components

| Area | Files | WO |
|---|---|---|
| Ambient state | `include/u8g2gl/u8g2gl_state_saver.h`, `src/u8g2gl_core.cpp`, `src/u8g2gl_{label,clock,progress_bar}.cpp`, `test/stubs/U8g2lib.h` | WO1 |
| Project reader | `cli/src/node/read-project.ts` and its callers | WO2 |
| Generated config, budget | `cli/src/core/generator/emit/generated-config.ts`, `report/budget.ts`, `include/u8g2gl/u8g2gl_config.h` | WO3 |
| Packaging | `library.json` | WO3 |

## Session Log

- **2026-10-12 — scoping and approval.** Scoped at `9808423`; findings above. Owner approved the
  decomposition with rulings R1, R2, R4–R6; R3 left open for a PA proposal. Worktree
  `../U8G2GL-05r` created on `u8g2gl-05r/wo1-ambient-state` from `origin/main`. WO1 and WO2
  dispatched in parallel.
- **2026-10-12 — WO2 verified** (`5022984`, report `f404e96`, on `u8g2gl-05r/wo2-screen-discovery`).
  - **Suites, re-run by the PA:** CLI vitest **1349** (1338 + 11), `tsc` and lint clean. No golden moved.
  - **Built CLI:** a scratch project with `screens/home.xml`, `screens/old/` and a root `stray.xml`
    warns three times, each naming the file and the rename (`U8G2GL_SCREEN_FILE_SKIPPED`).
  - **Bridge claim corrected:** the CLI never printed "0 screens"; the silence was "0 errors,
    0 warnings". The warning count now carries it.
- **2026-10-12 — WO1 verified** (`d6282d0`, report `a60d2ff`).
  - **Suites, re-run by the PA from a clean configure:** C++ **410** (401 + 9), one skip, **0**
    warnings. No CLI file or golden touched.
  - **Reproductions (worker, real U8G2, all five failed before the fix):** the null font segfaults
    in `u8g2_font_get_byte` at address 0; a label at baseline position lit 50 pixels against 93 at
    top, and is now buffer-identical; font and bitmap mode were not restored; the marquee and clock
    repaints leaked font and mode and drew different pixels from the normal path.
  - **R1's cost condition is refuted by measurement — the PA's reasoning was wrong.** Each U8G2
    setter is a cheap assignment, but it is an out-of-line call into the C library, while a
    compare-first restore only reads a field. Measured on the arm64 host, against real U8G2:
    saver 24 → 32 B (12 → 16 B on 32-bit); construct + destruct 2.3–2.6 → 5.1–5.6 ns.
    Restoring after a label's own changes costs about 6.7 ns with full setting against 3.5 ns
    with compare-first; with a real font change, 50 against 48 ns. Nothing allocates. **Put to the
    owner.**
  - **Out of scope, noted:** `u8g2gl_obj.h`'s `render_animation_update()` doc should point at
    `u8g2gl_repaint_object()` (WO5); the repaint helper, like the code it replaced, checks
    neither visibility nor ancestor clips.
- **2026-10-12 — owner rulings on the R1 cost finding and R3.**
  > 1) yes, ok
  > 2) feels like we are over-engineering this.
  - **R1a — approved:** the saver sets only what differs — compare first, both when establishing
    the framework baseline and when restoring the caller's state. Behaviour unchanged. Sent back to
    the WO1 worker, with a re-measurement.
  - **R3 — the lock-file guard is rejected as over-engineering.** PA's simpler proposal, to
    confirm at WO4 dispatch: delete the literal version assertion, keep the stamp test reading
    `package.json`, and leave §13.9 as a review rule (the golden diff makes an output change
    visible in every PR) rather than a test.
- **2026-10-12 — R1a verified; WO2 restacked; WO3 dispatched.**
  - **R1a** (`519e8bc`, report `6131ac6`): compare-first. PA re-run from a clean configure:
    C++ **410**, one skip, **0** warnings. Worker's figures, ns per guard: one colour change
    5.0–5.7 → 3.7–4.1; a label's own changes 6.5–6.9 → 3.8–4.0; with a font change 50 → 47–48.
    Size unchanged (16 B on 32-bit). `u8g2_font_calc_vref_top` is defined but not declared by
    `u8g2.h`; the saver declares it `extern "C"`, and the real-U8G2 lane links it.
  - **WO2 rebased onto WO1's tip** (`6131ac6`) without conflict: `847b943`, report `e29f7bc`
    (pre-rebase tip `f404e96`). CLI re-run on the rebased branch: **1349**.
  - **WO3** branched from WO2 in `../U8G2GL-05r`, dispatched.
- **2026-10-12 — WO3 stopped and re-dispatched: PlatformIO through the MCP only.**
  - The first WO3 worker was dispatched allowing "`pio` or the MCP, whichever works". The owner
    asked "why are you not using the mcp server?", denied direct `pio`, and stopped the worker
    before it built anything or changed a tracked file (branch still at `842eb7b`).
  - **The PA tried the MCP:** policy `flash_requires_approval` allows `build_project`;
    `project_envs` resolves the scratch rig. **Measurement A reproduced through it** (env
    `a_include`): `u8g2gl_generated_config.h:30:10: fatal error: u8g2gl/u8g2gl_version.h: No such
    file or directory`, first in Arduino `SPI` and `Wire`, `[FAILED]` in 4.8 s.
  - WORKORDER amended: a "Tooling Constraints — PlatformIO MCP only" section; no CLI fallback —
    an MCP refusal is a stop-and-report.
- **2026-10-12 — WO3 verified** (`373d72f`, report `e17fd66`).
  - **Suites, re-run by the PA:** C++ **410**, one skip, **0** warnings (clean configure); CLI
    **1352** (1349 + 3), `tsc` and lint clean. Golden diff is the advice comment only.
  - **R4 adopted, no fallback needed:** `-I generated` + `-D U8G2GL_GENERATED_CONFIG=\"u8g2gl_generated_config.h\"`.
    The PA rebuilt env `c_macro` through the MCP (`build_project`, forced): `[SUCCESS]`, RAM
    25588 B; `size_report` filtered to `binding_pool`: `s_binding_pool` **144 B** (6 slots × 24 B)
    in `src/u8g2gl_obj.cpp:367`. Worker's default (header not delivered): 6144 B, RAM 31588 B.
    Measurement A fails in Arduino `SPI`/`Wire`; B (middleware) = C.
  - **Item 6: `"frameworks": "*"`.** With `"arduino"` the finder reports "Framework incompatible
    library"; with `"*"` the runtime builds natively, 0 warnings. A native consumer still supplies
    U8G2's `src`/`src/clib` (U8g2 itself is Arduino-format, so the finder ignores it) and
    `Arduino.h`/`Print.h` shims — in §16. Arduino envs unchanged in size and graph.
  - **Worker findings:**
    - **A seventh defect — reported, not absorbed. Put to the owner.** `ref_value="0"` on a bool
      subject validates and emits `bind_flag_if_eq(&subj, 0, …)`. `u8g2gl_obj.h:369-370` overloads
      bool subjects on `int32_t` and `bool`; on xtensa `int32_t` is `long`, so `int`→`long` and
      `int`→`bool` tie: ambiguous. Host compiles (`int32_t` is `int`). The committed
      `test/generated_fixture/generated/ui_screen_home.cpp:75` carries it, from
      `cli/test/generator/fixtures/emit-project/screens/screen_home.xml:36`. No host test can see
      it.
    - PR-05's middleware glob `*/u8g2gl/src/*.cpp` matches nothing for a `symlink://` dependency
      and stays green with the 6144 B pool — a silent miss. For foundation's cut-over: switch to
      the macro.
    - `platform = native` reports `UnknownPlatform` through the MCP; `platformio/native@1.2.1`
      works.
    - Two test-harness files outside the listed box were touched as the WO's own instruction
      required (`test/version_guard/pre_macro/include_generated_config.cpp`, a comment in
      `test/test_generated_fixture.cpp`). Accepted.
    - For WO5: `model.ts` `BudgetLine.note` doc is stale; `u8g2gl_config.h`'s header lists
      `U8G2GL_NO_PARENT`, which it does not define (pre-existing).
    - Link-time detection idea (a symbol encoding the slot count) — not built; for the owner.
- **2026-10-12 — owner: "continue and go until fixed."** In reply to the PA's three questions
  (fix the seventh defect here; WO4 versions with the simplified version test; the link-time
  check). Read as: fix it in this PR, proceed with the simplified R3, no link-time check.
  - **Criterion 1 re-measured by the PA** (foundation's harness, `git archive 499142f8` into
    `tmp/fdn/`, `-DU8G2GL_SOURCE_DIR` = this worktree at WO3's tip; nothing written to
    foundation). All five scenarios **0 differing pixels** against foundation's current baseline
    (lit counts differ from PR-05's table because later foundation fixes moved the baseline).
    `no_font_pos_top` **1407 → 0**. **But `plain_user_ui_handler` still differs by 274 pixels**,
    identically to `no_font_ref_height_all`: U8G2GL never sets `font_height_mode`, and every text
    widget's centring and `u8g2_font_calc_vref_top` read the reference ascent. An eighth ambient
    item, missed by PA scoping.
  - **R7 (PA, under "go until fixed"):** the guard establishes `setFontRefHeightAll()` and
    restores the caller's mode. Reason: a label clips to its own box, so its reference height
    must cover every glyph, not `A` and `g`; also the mode foundation's XML was tuned under.
    Flagged to the owner; reversible.
  - **R8 (PA):** one comparison overload per subject type — remove the bool subject's `int32_t`
    overloads (hand-written `bind_flag_if_eq(&b, 0, f)` is ambiguous on xtensa too), and emit a
    bool subject's ref as `false`/`true`. Runtime API change, inside the 0.8.0 bump.
  - **Renumbered:** WO4 = these fixes; WO5 = versions, simplified R3, criterion 1 evidence; WO6 =
    readability.
