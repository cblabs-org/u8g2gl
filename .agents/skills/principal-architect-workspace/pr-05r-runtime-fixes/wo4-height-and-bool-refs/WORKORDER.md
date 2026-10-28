---
work_order: WO4
project: pr-05r-runtime-fixes
title: "The last ambient item, and a bool comparison the ESP32 can resolve"
branch: u8g2gl-05r/wo4-height-and-bool-refs
base: u8g2gl-05r/wo3-platformio
complexity: architect
status: complete
---

# WO4 — establish the reference-height mode; make bool-subject comparisons unambiguous on xtensa

## Authorization

Part of PR-05R (`pr-05r-runtime-fixes`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition, and its Session Log records the
owner's "continue and go until fixed" and the PA's rulings R7 and R8 that this WO executes. This
WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `.`.** **Branch**:
`u8g2gl-05r/wo4-height-and-bool-refs` (already checked out, no upstream) · **Base**:
`u8g2gl-05r/wo3-platformio`. Run `git branch --show-current` **as its own command immediately
before every commit** (`.agents/rules/04-branch-hygiene.md`). Scratch in `tmp/`
(`.agents/rules/02-workspace.md`), never `/tmp`. `tmp/fdn/` is the PA's foundation harness
build — read it, rebuild it, do not edit its sources.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. A decision this WORKORDER does not cover and that cannot be made inside
the Boundary Box: commit what is green, set `status: blocked`, write the Completion Report, stop.

## Standards

Load `u8g2gl-standards` first: `references/cpp.md`, `references/typescript.md`,
`references/documentation.md`. **§4.1** on lines you add or change: cite published references
and measured facts; no work-order tags, no workspace paths, no narrated debate. Pre-existing
citations are not yours to sweep; comments this WO makes wrong are yours to correct.

## Tooling Constraints — PlatformIO MCP only

**The owner has denied direct use of the `pio` CLI.** Any PlatformIO build goes through the
PlatformIO MCP server: load the `platformio-mcp:pio-manager` skill, load tools with ToolSearch
(`select:mcp__plugin_platformio-mcp_platformio__build_project,mcp__plugin_platformio-mcp_platformio__check_task_status,mcp__plugin_platformio-mcp_platformio__project_envs`),
always pass `projectDir` and `environment`, use `background: true` and poll. No `pio` shell
commands or wrappers. If the MCP refuses, paste the refusal, commit what is green, set
`status: blocked`, stop. The scratch rig is `tmp/pio/` (esp32dev, Arduino).

---

## Objective

(A) U8G2GL establishes U8G2's font reference-height mode inside its render guard and restores the
caller's, so a plain `begin()` user renders the same pixels as foundation's legacy-state display.
(B) A bool subject's comparison compiles on ESP32 whether generated or hand-written.

## Part A — reference-height mode (PA ruling R7)

**Measured by the PA** (foundation's render harness, `tmp/fdn/`, built against this branch at
WO3's tip with `-DU8G2GL_SOURCE_DIR` pointing at this worktree): criterion 1 holds, all five
scenarios **0 differing pixels**; `no_font_pos_top` now **0** (was 1407 before WO1); but
`no_font_ref_height_all` and `plain_user_ui_handler` both differ by **274 pixels** (137 + 137,
rows 19..29, columns 5..128). Re-run: `cmake --build tmp/fdn/build --target after` (configured
with `-DU8G2_SOURCE_DIR=<worktree>/extern/u8g2 -DU8G2GL_SOURCE_DIR=<worktree>
-DRENDER_AFTER_DIR=<worktree>/tmp/fdn/after-05r`).

Every text widget centres on `getAscent() - getDescent()` (`u8g2gl_label.cpp:338`,
`u8g2gl_clock.cpp:224`, `u8g2gl_button.cpp:177`, `u8g2gl_progress_bar.cpp:263`), and
`u8g2_font_calc_vref_top` measures from `font_ref_ascent`. Both depend on `u8g2->font_height_mode`
(`u8g2_font.c:1181-1222`; `0` text, `1` extended text, `2` all — use U8G2's own
`U8G2_FONT_HEIGHT_MODE_*` names). Nothing in U8G2GL sets it; U8G2's setup leaves it at text
(`u8g2_setup.c:88`).

**Ruling R7: the framework establishes `setFontRefHeightAll()`.** A label clips to its own box, so
the reference height must cover every glyph in the font, not just `A` and `g`. It is also the mode
foundation's XML was tuned under.

- [ ] `u8g2gl_state_saver`: capture `font_height_mode`; establish ALL compare-first (the R1a
      rule); restore the caller's mode compare-first through the matching setter
      (`setFontRefHeightText` / `ExtendedText` / `All`). Each of these calls `u8g2_UpdateRefHeight`
      on the **current** font, so restore the font before the height mode — state the order and
      why in the destructor's comments. `UpdateRefHeight` returns early on a null font; confirm the
      null-font path still holds.
- [ ] `test/stubs/U8g2lib.h`: model `font_height_mode` under its real name, and the three setters.
- [ ] Real-U8G2 tests in `test/test_ambient_state.cpp`: a label rendered after
      `setFontRefHeightText()` lights the same buffer as after `setFontRefHeightAll()`; the
      caller's mode comes back; show both failing before the change.
- [ ] Re-run the cost benchmark from WO1 (`tmp/bench/`) for the label case and paste it.
- [ ] Docs: the saver's header and class doc, `u8g2gl_render_object()`'s doc, design_spec §11.3
      and Appendix A — the established baseline is now position top, direction 0, reference
      height all.
- [ ] **Re-run the foundation harness** and paste the `compare` and `state probe` output. The
      target is: five scenarios 0 differing, and `plain_user_ui_handler` **0**. If it is not 0,
      report what differs — do not chase it outside this box.

## Part B — bool comparisons on xtensa (PA ruling R8)

**Found by WO3, confirmed by the PA:** `u8g2gl_obj.h:369-372` overloads `bind_flag_if_eq` and
`bind_flag_if_not_eq` on a bool subject for both `int32_t` and `bool`. On xtensa `int32_t` is
`long`, so a literal `0` converts to either equally: ambiguous. The generator types `0`/`1` on a
bool subject as `int` (`cli/src/core/generator/emit/screen-model.ts`, the `refType` line), so
`cli/test/generator/fixtures/emit-project/screens/screen_home.xml:36` (`ref_value="0"`) emits
`bind_flag_if_eq(&ui_subject_wifi_connected, 0, …)` — committed in
`test/generated_fixture/generated/ui_screen_home.cpp:75`. The host compiles it; ESP32 cannot.
Hand-written `obj.bind_flag_if_eq(&b, 0, flag)` fails the same way.

**Ruling R8: one overload per subject type.**
- [ ] Runtime: remove the `int32_t` overloads for `u8g2gl_subject_bool_base*` (declarations and
      `src/u8g2gl_obj.cpp:589`, `:597`). Before removing, find every caller (runtime, tests, the
      editor registry in `u8g2gl_editor.*`, generated code) and state what each did. If a caller
      relies on comparing a bool subject against an integer other than 0/1, **stop and report**.
- [ ] Generator: a bool subject's `ref_value` is always emitted as `bool` — `0` → `false`, `1` →
      `true`. The validator already restricts it to `true`/`false`/`0`/`1`
      (`validate-types.ts:291`); keep that. Update the `refType` comment.
- [ ] Keep `screen_home.xml:36` as `ref_value="0"` — it is the regression input. Regenerate
      goldens and the compile fixture: **`npm run build` first** (`refresh-goldens.mjs` reads
      `dist/`). The golden diff must be the `0` → `false` (and any `1` → `true`) lines only.
- [ ] Tests: a CLI test that a bool subject's comparison never emits an integer literal; C++ tests
      updated for the removed overloads.
- [ ] **On-target proof, through the MCP:** in `tmp/pio/`, an esp32dev env that compiles the
      regenerated `test/generated_fixture/generated/` (with whatever main/support it needs). Show
      it failing on the WO3 tip's fixture with the ambiguity error, and building after. Paste both.
- [ ] design_spec: wherever the bool-subject overloads or `ref_value` typing are described.

## Strict Boundary Box

- **In:** `include/u8g2gl/u8g2gl_state_saver.h`, `u8g2gl_core.*` docs, `u8g2gl_obj.h`/`.cpp`
  (the two overloads only), `u8g2gl_editor.*` only if it registers the removed overloads,
  `test/stubs/U8g2lib.h`, C++ tests, `cli/src/core/generator/emit/screen-model.ts` and
  `screen.ts` (ref typing only), CLI tests, goldens, `test/generated_fixture/`, design_spec
  §11.3, Appendix A and the bool-binding passages.
- **Out:** versions (WO5); the version-pin test (WO5); the validator's accepted set; WO3's config
  and manifest work; foundation's sources (`tmp/fdn/` is read-and-build only).

## Verification Requirement

- [ ] C++ from a **clean configure**: **0** warnings; ctest **410 + your new tests** (minus any
      removed with the overloads — say which), one skip. CLI: vitest **≥ 1352**, `tsc`, lint.
- [ ] Part A tests failing before and passing after; foundation harness output pasted.
- [ ] Part B MCP builds failing before and passing after; golden diff described.
- [ ] `git diff --name-only <base>..HEAD` within the Boundary Box.

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix them, do not file issues. Known and
handled elsewhere: version bumps and the version-pin test (WO5); `u8g2gl_obj.h`'s
`render_animation_update()` doc, `model.ts` `BudgetLine.note`, `U8G2GL_NO_PARENT` in
`u8g2gl_config.h`'s header (WO6).

---

## Completion Report (append below on completion)

Use: Status · Baseline and final counts · Changes Made · Decisions Made · Evidence · Dead Ends &
Warnings · Out-of-Scope Findings · Blockers.

### Status

**complete.** Both parts are green and committed on `u8g2gl-05r/wo4-height-and-bool-refs`:
`48ce8b2` (Part A, reference height) and `c228a33` (Part B, bool comparisons). Not pushed.

### Baseline and final counts

| | Baseline (`8dffafb`, clean configure) | Final (`c228a33`, clean configure) |
|---|---|---|
| C++ build warnings | 0 | **0** |
| ctest | 410, 1 skip (`SizeOfReport.ThirtyTwoBitTarget`) | **414**, same 1 skip |
| vitest | 1352 | **1353** |
| `tsc --noEmit` / `npm run lint` | clean | clean |

ctest arithmetic: 410 + 5 (Part A) − 2 (Part B, removed with the overloads:
`BindingInvariant.BindFlagIfEqBoolIntRef`, `BindingInvariant.BindFlagIfNotEqBoolIntRef`) + 1 (Part B) = 414.

### Changes Made

**Part A — reference height (R7)**
- `include/u8g2gl/u8g2gl_state_saver.h`: captures `font_height_mode`; establishes
  `setFontRefHeightAll()` compare-first (after `setFontPosTop()`); the destructor restores the font
  first, then the mode compare-first through the matching setter (`restore_height_mode()`:
  `U8G2_FONT_HEIGHT_MODE_TEXT` → `setFontRefHeightText()`, `_XTEXT` → `ExtendedText()`, anything
  else → `All()` and the raw value written back, so even an out-of-range value returns verbatim).
  File header, class doc table, ctor/dtor docs and the cost paragraph updated.
  `sizeof` unchanged on the 64-bit host (32 B: the new byte fits the trailing word); on a 32-bit
  target 16 → 20 B (computed: 3 pointers + 5 bytes, 4-byte aligned).
- `include/u8g2gl/u8g2gl_core.h`: `u8g2gl_render_object()` doc names the reference height.
- `test/stubs/U8g2lib.h`: `U8G2_FONT_HEIGHT_MODE_*`, `u8g2_t::font_height_mode` (default text), the
  three setters (logged); header and struct doc updated. The stub has no metrics, so it does not
  model `font_ref_ascent/descent` — said so in the struct doc.
- `test/test_ambient_state.cpp` (real U8G2): `ambient_state` now also reads `font_height_mode`,
  `font_ref_ascent`, `font_ref_descent`, so every existing restore check covers them. New:
  `CallerReferenceHeightDrawsTheSamePixels`, `CallerReferenceHeightComesBackAfterRender` (all
  three modes, caller font helvR08 whose ascent is 8 under text / 11 under all),
  `NullFontKeepsTheCallerReferenceHeightMode`.
- `test/test_obj.cpp` (stub): `SavesAndRestores` extended to the mode; new
  `HeightModeIsRestoredAfterTheFont` (call-log order) and `HeightModeIsSetOnlyWhenItDiffers`
  (no setter when the caller is already in all; unknown value 7 restored verbatim).
- `docs/design_spec.md`: §11.3 lifecycle tree and the state-saver paragraph (baseline is now
  position top, reference height all, direction 0; why all; compare-first; restore order; null
  font); Appendix A — `setFontRefHeightAll` in the State list and its own implementation note. The
  removed sentence "Every setter involved is a single field assignment" was no longer true.

**Part B — bool comparisons (R8)**
- `include/u8g2gl/u8g2gl_obj.h`, `src/u8g2gl_obj.cpp`: the two `int32_t` overloads for
  `u8g2gl_subject_bool_base*` removed; the `bool` overloads now call `add_flag_binding()` directly
  (they used to delegate to the removed ones). Doxygen on the remaining pair explains why one
  overload per subject type.
- `cli/src/core/generator/emit/screen-model.ts`: a bool subject's `refType` is always `bool`, and
  `ref` normalises `0`/`1` to `false`/`true` (new private `boolRef()`; anything else passes through
  for `cppValue()` to refuse). `FlagComparison.refType`/`.ref` docs rewritten. `screen.ts` and
  `scene.ts` unchanged — both read the model.
- Goldens regenerated (`npm run build`, then `node test/generator/refresh-goldens.mjs`).
  **Golden diff, complete:**
  `cli/test/generator/fixtures/emit-project/expected/ui_screen_home.cpp` and
  `test/generated_fixture/generated/ui_screen_home.cpp` — one line each,
  `bind_flag_if_eq(&ui_subject_wifi_connected, 0, …)` → `…, false, …)`;
  `test/generated_fixture/generated_editor/ui_scene.json` — one line, `"ref": 0` → `"ref": false`.
  `ui_editor_registry.cpp` regenerated unchanged. `screen_home.xml:36` kept as `ref_value="0"`.
- CLI tests: `emit-screen.test.ts` §13.12 expectation updated; new test "never spells a bool
  subject's comparison as an integer literal, on an object or a draw call's guard" (0 and 1, eq and
  not_eq, on labels and on `u8g2gl_pixel` guards; plus a regex that no digit follows the subject).
  `emit-editor.test.ts`: the scene test renamed and its `ref: 0` expectation now `ref: false`.
- C++ tests: the two `…BoolIntRef` invariant tests removed. New
  `Binding.BoolComparisonResolvesForEveryIntegerType` — SFINAE `static_assert`s that
  `bind_flag_if_eq/not_eq(bool_base*, Ref, uint8_t)` is well-formed for `bool`, `int`, `long`,
  `long long`, plus a runtime check that `0L` means `false`. `long`/`long long` reproduce the xtensa
  ambiguity on any host. `Binding.BoolFlagIfEq` keeps its literal `0` (now the hand-written case)
  with a comment.
- `docs/design_spec.md`: §8.4 (which variants each subject type takes; bool `ref_value` emitted as
  a C++ bool), §13.8 (example now `false`; the one-overload-per-type rule and why), §13.12 worked
  example `0` → `false`.

### Callers of the removed overloads (checked before removal)

| Caller | What it did | After |
|---|---|---|
| `test/generated_fixture/generated/ui_screen_home.cpp:75` (generated) | literal `0` on a bool subject: exact match for `int32_t` on host, ambiguous on xtensa | regenerated as `false` |
| `cli/.../expected/ui_screen_home.cpp:109` (golden) | same | regenerated as `false` |
| `test/test_binding.cpp` `BindFlagIf{Eq,NotEq}BoolIntRef` | `static_cast<int32_t>(0)` to reach the int32_t overload on purpose | removed |
| `test/test_subject.cpp` `Binding.BoolFlagIfEq` | literal `0` | now converts to `false`; same behaviour |
| `test/generated_fixture/generated_editor/ui_editor_registry.cpp:1647,1665` (generated by `cli/src/core/generator/emit/editor-registry.ts:392`) | for a bool subject, `ref.type == U8G2GL_EDITOR_BOOL ? …(ref.boolean) : …(ref.integer)` — the integer branch reached the int32_t overload | still compiles; `ref.integer` (int32_t) converts implicitly to `bool`. See Out-of-Scope |
| `include/u8g2gl/u8g2gl_editor.*` | no reference to the overloads (only a struct doc naming `"bind_flag_if_eq"`) | unchanged |

No caller compares a bool subject against an integer other than 0/1; the validator admits only
`true`/`false`/`0`/`1` (unchanged). No stop condition.

### Decisions Made

- **Restore order: font, then height mode.** Stated in the destructor. Measured fact worth the
  architect knowing: the order is not strictly load-bearing, because `u8g2_SetFont()` also calls
  `u8g2_UpdateRefHeight()` under whatever mode is current, so mode-first also converges when the
  font changed. Font-first makes the *last* computation the mode setter's on the caller's own font,
  so correctness does not depend on whether `setFont()` ran (it is skipped when the pointer is
  unchanged). The stub test pins this order.
- **Null-font path holds:** the constructor's `setFontRefHeightAll()` and the destructor's mode
  setter both return early from `u8g2_UpdateRefHeight()` on a null font; only the mode field moves.
  The widget's leftover `font_ref_*` stays in the struct, harmless for the same reason the leftover
  font metrics already were (next `setFont()` recomputes). Proven by
  `NullFontKeepsTheCallerReferenceHeightMode` and the existing null-font test.
- **Out-of-range mode value** is restored verbatim (all's heights, then the raw byte), rather than
  silently normalised to 2 — the saver's rule is "exactly what it captured".
- **The `0`/`1` → `false`/`true` normalisation lives in the model** (`screen-model.ts`), not in
  `screen.ts`, so the object call, the draw-call guard and the editor scene JSON all agree from one
  place.

### Evidence

**Part A, before the change** (`build/test/test_ambient_state` at `8dffafb` + new tests):
```
[ RUN      ] AmbientState.CallerReferenceHeightDrawsTheSamePixels
test/test_ambient_state.cpp:266: Failure
  std::memcmp(text_mode, all_mode, kBufferBytes)  Which is: -124   vs 0
lit pixels: text 93, all 93
[  FAILED  ] AmbientState.CallerReferenceHeightDrawsTheSamePixels
[  PASSED  ] 7 tests.
```
Same lit count, shifted by a row — the 274-pixel signature. `CallerReferenceHeightComesBackAfterRender`
and the null-font case **cannot** fail on the base (nothing there touches the mode). To show they
have teeth, they were run against the new saver with only the destructor's mode restore removed:
```
CallerReferenceHeightComesBackAfterRender: reference-height mode 2 vs 0; reference ascent 11 vs 8
                                           (text), 2 vs 1 / 11 vs 8 (extended text)   FAILED
NullFontKeepsTheCallerReferenceHeightMode: 2 vs 0                                     FAILED
CallerStateComesBackAfterRender:           reference-height mode 2 vs 0               FAILED
```
**After:** all 8 `[ OK ]`.

**Cost** (Apple arm64 host, `-O2`, real U8G2 2.36.18 linked from `u8g2gl_u8g2_csrc_arduino`,
1e7 iterations × 3 runs, ns per construct+destruct pair around what a label sets — `setFont(6x10)`,
`setDrawColor(1)`, `setFontMode(0)`; caller in baseline position; scratch `tmp/bench/bench_wo4.cpp`,
not committed):

| Caller | Before (`8dffafb` saver) | After |
|---|---|---|
| same font, text mode (U8G2 default) | 4.19 / 3.83 / 3.96 (re-run 4.20 / 4.28 / 3.99) | 7.68 / 8.05 / 7.43 |
| caller font 5x7, text mode | 45.65 / 46.35 / 47.75 | 54.13 / 53.02 / 53.19 |
| same font, caller already in all | 4.00 / 4.02 / 3.95 | 4.01 / 3.98 / 4.01 |

`sizeof(u8g2gl_state_saver)` 32 B both (64-bit host). A default-mode caller pays two extra
out-of-line setters per object render, each re-running `u8g2_UpdateRefHeight()`; a caller in all
pays nothing. Nothing allocates.

**Foundation harness** (`cmake --build tmp/fdn/build --target after`, at `c228a33`; identical output
at `48ce8b2`):
```
compare with tmp/fdn/test/render/baseline/diagnostics_board
  connected     identical=yes differing_pixels=0
  ap_mode       identical=yes differing_pixels=0
  disconnected  identical=yes differing_pixels=0
  long_ssid     identical=yes differing_pixels=0
  device_dev91  identical=yes differing_pixels=0
connected     lit=1405
ap_mode       lit=1477
disconnected  lit=1326
long_ssid     lit=1679
device_dev91  lit=1362
state probe (connected, versus the normal migrated frame):
  no_font_pos_top          differing_pixels=0 (rendered-only 0, normal-only 0)
  no_font_ref_height_all   differing_pixels=0 (rendered-only 0, normal-only 0)
  plain_user_ui_handler    differing_pixels=0 (rendered-only 0, normal-only 0)
  font mode after runtime render_fn=1, after board render=1 (before=1)
truncation probe: 181 of 181 lengths identical; of the 41 truncated, 41 identical
```
Target met: five scenarios 0, `plain_user_ui_handler` **274 → 0**, `no_font_ref_height_all`
**274 → 0**. (The harness build prints 2 `-Wunused-parameter` warnings from foundation's own
`IGfxWidget.hpp:137` — not U8G2GL code.)

**Part B, host before:** the new `test_subject.cpp` compiled against the `48ce8b2` headers
(`git archive` into `tmp/oldinc/`):
```
test_subject.cpp:348: static assertion failed due to requirement 'bool_eq_resolves<long, void>::value'
test_subject.cpp:349: ... 'bool_eq_resolves<long long, void>::value'
test_subject.cpp:351: ... 'bool_not_eq_resolves<long, void>::value'
test_subject.cpp:352: ... 'bool_not_eq_resolves<long long, void>::value'
test_subject.cpp:358: error: call to member function 'bind_flag_if_eq' is ambiguous
```
CLI before: the new emit-screen test against the base `screen-model.ts` →
`AssertionError: expected [ …(8) ] to include '    ui_obj_a.bind_flag_if_eq(&ui_subj…'` (FAIL).

**Part B, on-target, through the PlatformIO MCP** (`build_project`, `projectDir` `tmp/pio`,
`background: true`, `forceExecution: true`, polled; no `pio` shell). Two envs added to
`tmp/pio/platformio.ini`, esp32dev / Arduino, `-D U8G2GL_GENERATED_CONFIG="u8g2gl_generated_config.h"`,
sketch `tmp/pio/fixture/main.cpp` (inits and ticks/renders all three fixture screens, plus one
hand-written `hand_written.bind_flag_if_eq(&ui_subject_wifi_connected, 0, U8G2GL_FLAG_HIDDEN)`):
- `fixture_before` — runtime and committed fixture from the WO3 tip (`git archive
  u8g2gl-05r/wo3-platformio` into `tmp/wo3tip/`):
  ```
  fixture/main.cpp:18:33: error: call of overloaded 'bind_flag_if_eq(u8g2gl_subject_bool_n<2>*, int, const uint8_t&)' is ambiguous
  tmp/wo3tip/test/generated_fixture/generated/ui_screen_home.cpp:75:41: error: call of overloaded
      'bind_flag_if_eq(u8g2gl_subject_bool_n<2>*, int, const uint8_t&)' is ambiguous
     75 |     ui_obj_bar_wifi_icon.bind_flag_if_eq(&ui_subject_wifi_connected, 0, U8G2GL_FLAG_HIDDEN);
  u8g2gl_obj.h:369:10: note: candidate: 'bool u8g2gl_obj::bind_flag_if_eq(u8g2gl_subject_bool_base*, int32_t, uint8_t)'
  u8g2gl_obj.h:370:10: note: candidate: 'bool u8g2gl_obj::bind_flag_if_eq(u8g2gl_subject_bool_base*, bool, uint8_t)'
  ========================== [FAILED] Took 3.65 seconds ==========================
  ```
  (The first run, before the hand-written line was added, failed on the generated line alone:
  `[FAILED] Took 8.07 seconds`.)
- `fixture_after` — this worktree's runtime and regenerated fixture, same sketch:
  ```
  RAM:   [=         ]   8.0% (used 26100 bytes from 327680 bytes)
  Flash: [==        ]  24.5% (used 320832 bytes from 1310720 bytes)
  ========================= [SUCCESS] Took 5.08 seconds =========================
  ```
  (Without the hand-written line: 26068 / 320764 B, `[SUCCESS] Took 10.72 seconds`; that run
  compiled `u8g2gl_obj.cpp` and `ui_screen_home.cpp` fresh.) No compiler warnings in either after-log.
Logs copied to `tmp/wo4_mcp_fixture_{before,before2,after,after2}.log`.

`git diff --name-only u8g2gl-05r/wo3-platformio..HEAD`: the PA's own `PROJECT.md` and this
WORKORDER (`8dffafb`), plus the 16 files listed under Changes Made — all within the Boundary Box.

### Dead Ends & Warnings

- The bench and the scratch probes need `-Itest/real_u8g2` (the `Arduino.h` shim) and must link
  `libu8g2gl_u8g2_csrc_arduino.a`, as WO1 found.
- The `tmp/pio` rig symlinks the *live* worktree, so an on-target "before" needs a separate copy
  of the old runtime as well as the old fixture: the old fixture compiles against the new runtime.
  Hence `tmp/wo3tip/` and a separate env.
- `ref_value="0"` on a bool subject in foundation's own XML (if any) now compiles on ESP32 either
  way; the harness build is unaffected.

### Out-of-Scope Findings

- **Editor registry emitter** (`cli/src/core/generator/emit/editor-registry.ts:392-393`, not in this
  WO's box): for a bool subject it still emits a branch that passes `ref.integer` (int32_t) to the
  now bool-only overload. It compiles and is correct for 0/1 (the only integers the validator
  admits), but the conversion is implicit and an out-of-range integer from an unvalidated path
  would read as `true` rather than "never equal" as before. Since the scene JSON now always carries
  a bool `ref` for a bool subject, that branch is dead for generated scenes; the emitter could drop
  it or spell `ref.integer != 0`. Regenerating would change `ui_editor_registry.cpp`.
- **Versioning (WO5):** Part B changes generator output for unchanged input (`0` → `false`) and
  removes two public runtime overloads — both need the bumps already planned in WO5.
- The four widget comments that say the saver "establishes setFontPosTop()"
  (`u8g2gl_label.cpp:334`, `u8g2gl_clock.cpp:221`, and the centring in `u8g2gl_button.cpp:176`,
  `u8g2gl_progress_bar.cpp:263`) are still true but do not mention that the height they centre on
  is now all's. Outside the box; not wrong.

### Blockers

None.
