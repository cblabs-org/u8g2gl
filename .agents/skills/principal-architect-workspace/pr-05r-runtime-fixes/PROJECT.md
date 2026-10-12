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

- **[ ] [wo1-ambient-state](wo1-ambient-state/WORKORDER.md):** items 1–3 and the repaint paths
  (R1, R2). Real-U8G2 reproductions first. `architect`.
- **[ ] [wo2-screen-discovery](wo2-screen-discovery/WORKORDER.md):** item 4 (R5). Parallel with
  WO1. `standard`.
- **[ ] wo3-platformio:** items 5 and 6 (R4), one PlatformIO measurement rig. `architect`.
  WORKORDER written after WO1/WO2 land.
- **[ ] wo4-release-criterion1:** versions (R6), goldens, the §13.9 guard per R3's outcome, and the
  criterion 1 re-measurement in a scratch foundation worktree (nothing committed to foundation).
  **Blocked on R3.** `standard`.
- **[ ] wo5-readability:** `readability-reviewer` pass and remediation. `standard`.
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
