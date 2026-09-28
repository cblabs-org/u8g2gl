---
work_order: WO4
project: pr-4r-corrections
title: "A bound draw-call argument clamps exactly as an object's binding does"
branch: u8g2gl-4r/wo4-bound-arg-clamp
base: u8g2gl-4r/wo3-radius-clamp
complexity: standard
status: complete
---

# WO4 — realisation must not be observable

## Authorization

Part of PR-4R (`pr-4r-corrections`). Verify from committed files: `../PROJECT.md` "Human Approval"
quotes the owner's approval of this PR with a timestamp, and its mandate lists item 1. This
WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-4r`.** **Branch**:
`u8g2gl-4r/wo4-bound-arg-clamp` (already checked out) · **Base**: `u8g2gl-4r/wo3-radius-clamp`.
Run `git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR.

## Standards

Load `u8g2gl-standards` first: `references/cpp.md`, `references/typescript.md` and
`references/documentation.md`. §4.1 [D-18]: primitives compile to `u8g2gl_draw_*` **free
functions**. Do not tidy them into a class. Determinism (§13.9): the emitted spelling must be
stable.

---

## Objective

The same XML behaves the same way on either side of §13.5's realisation rule. A bound value
reaching a **draw call** is clamped into `int16_t` after its container origin is added, **by the
same code** that clamps it on the object path, in firmware and in the editor host alike.

## Design authority

design_spec §13.5, final paragraph, normative: *"a value reaching a draw call is clamped exactly as
the object path clamps it — into `int16_t`, after the container origin is added (§7.2) — instead of
wrapping in whatever narrower parameter the draw function happens to take."* [D-18] is the reason:
if one path clamps and the other wraps, realisation becomes observable, and the decision breaks.

## Background: three paths, one of which clamps

1. **Object path, clamps.** `u8g2gl_bound_coord()` in `src/u8g2gl_obj.cpp` bounds the subject value
   to ±65536, adds the `int16_t` origin in 32 bits, and clamps **the sum** to `int16_t` (Chief
   Architect, 2026-09-19: the sum, never each term). It is `static`, file-local.
2. **Firmware draw call, wraps.** `drawCallFor()` in `cli/src/core/generator/emit/draw-args.ts`
   spells a bound argument as `ui_subject_x.get()` or `40 + ui_subject_x.get()`. An `int32_t`
   expression is passed to an `int16_t` parameter and narrows implicitly. See
   `test/generated_fixture/generated/ui_screen_bounds.cpp:112`.
3. **Editor host, wraps.** `editor_host::draw_call()` in `test/editor_host/editor_host.cpp` does
   `arg.integer += origin` with no clamp. The registry thunk then passes the `int32_t` to the same
   `int16_t` parameter. The parity test compares firmware and editor call for call, so today it
   proves they **wrap identically**. It must end up proving they **clamp identically**.

## Line-Item Instructions

- [x] **Measure the baseline**, each suite alone. Record the counts WO3 left.
- [x] **Write the failing test first** *(failed at the base as required; landed in `6f30698`)*, at the base (WO3's tip). Add a fixture screen, or extend an
      existing one: **two elements of the same class with the same position binding**, inside the
      same container so they share an origin. One is realised as an **object** by a §13.5 condition
      that does not change its drawing (e.g. an `<event_cb>`, or membership of a focus ring: your
      choice, stated). The other is realised as **draw calls**. Drive the subject **out of range**
      in both directions (e.g. `40000` and `-40000`) and assert the two draw **identically**: the
      same recorded U8G2 call and arguments, from the test double's log. Check that it fails at the
      base for the right reason (the draw-call path wraps), and record the base's wrapped values.
      A value that stays in range should agree before and after. Include one as a control.
- [x] **One runtime helper, public** *(committed, `e8e21a4`)*, in `include/u8g2gl/u8g2gl_coord.h`, e.g.
      `int16_t u8g2gl_coord_bound(int16_t origin, int32_t value)`, containing exactly the logic of
      today's `u8g2gl_bound_coord()` arithmetic: the ±65536 pre-bound, the sum, the `int16_t`
      clamp. Move the reasoning comment with it. `u8g2gl_obj.cpp` calls the helper, so the object
      path's behaviour is unchanged, and its existing tests prove it.
- [x] **Firmware emission:** *(`6f30698`, with the `u8g2gl_coord.h` include from `screen.ts`, per the PA amendment)* `drawCallFor()` spells every bound **integer** argument through the
      helper: `u8g2gl_coord_bound(40, ui_subject_x.get())`, and `u8g2gl_coord_bound(0, …)` for a
      zero origin and for a size, which has no origin. The object path clamps a size the same way,
      with origin 0. One spelling, no special case for zero, so the output reads uniformly. If a bound
      draw argument can be non-integer (bool, colour), leave it alone and say so. Update
      `SUBJECT_READ_SUFFIX`'s neighbourhood and the module header to state the rule.
      **§13.5's example in the spec** will then differ from the emitted text. Note that for the
      Chief Architect; do not edit `docs/`.
- [x] **Editor host:** *(`6f30698`)* `draw_call()` computes a bound integer argument with the **same helper**
      (origin from the scene, 0 when absent), so the host cannot drift from firmware. If the
      registry thunk's implicit `int32_t` → `int16_t` narrowing remains reachable for a **literal**
      argument, report it as a finding. Literals are validated to `int16_t` today, so do not change
      the registry emitter unless the test requires it.
- [x] **Scene format:** *(unchanged: the existing `origin` suffices, version stays 2)* if the scene JSON's shape must change to carry anything new, it needs a
      scene-format version bump. Avoid that if the origin already suffices, which the PA expects.
- [x] **CLI version 0.7.0 → 0.8.0** *(`6f30698`; version literals changed under the PA amendment)* (`cli/package.json` and anything the build stamps from it).
      Rules/03: a generator change that alters output without an input change is breaking and
      **requires** it. Schema stays 0.4. Runtime stays 0.5.0 (WO3 bumped it).
- [x] **Regenerate the goldens.** *(`6f30698`: bound arguments and the include line only)* They move because every bound draw-call argument's spelling
      changes. The commit that moves them says so, and why, in its message. Review the golden
      diff: **only** bound draw-call arguments (and any stamp) may change. Anything else: stop and
      report.
- [x] **CLI tests** *(six spelling-only edits, listed; one new include test)*: `emit-draw-args` (or the nearest) asserts the new spelling, including a zero
      origin and a bound size. Existing assertions that spell the old `40 + ui_subject_x.get()`
      form change **to the new spelling only**. List every one in the report.
- [x] Run the **built CLI** on the fixture and show a bound draw call as generated.

## PA amendment, 2026-09-28: unblocked

The worker's stop was correct; both blockers were gaps in the PA's box, not in the work.

1. **The generated include.** `cli/src/core/generator/emit/screen.ts` is **in scope**, for Step 2
   only: emit `#include "u8g2gl/u8g2gl_coord.h"` beside `DRAW_HEADER`, sorted with the other
   includes (§13.9), and only if the unit emits a bound draw-call argument or unconditionally. Your
   call; state it. **Do not** include it from `u8g2gl_draw.h`, which forward-declares U8G2 on purpose.
   The goldens may therefore change by **that include line**, in addition to bound arguments. Any
   other golden change is still stop-and-report.
2. **The version bump.** Tests pinning the CLI version literally (e.g.
   `cli/test/integration/generate.test.ts`, `0.7.0` at :344, :458, :462, :466, :467) may change
   `0.7.0` → `0.8.0`, literals and titles only. List each.
3. **The two-realisation test.** Accepted as built: `knob` (a box, as draw calls) against `readout`
   (a label, realised as an object), sharing `bind_x="$position"` in `track`, plus the
   screen-level `dot` for origin 0. The same-class construction cannot be expressed before PR-09.
   That goes in the Completion Report as a finding, not a gap.
4. **Runtime version stays 0.5.0.** The helper lands in the same unreleased minor as WO3.

Apply `tmp/wo4-pending.patch`, add the include, regenerate the goldens, bump to 0.8.0, run every
suite alone, update the Completion Report, set `status: complete`, commit.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_coord.h`, `src/u8g2gl_obj.cpp` (use the helper, no behaviour
change), `cli/src/core/generator/emit/draw-args.ts`, `cli/src/core/generator/emit/screen.ts` (Step 2's include only; PA amendment), `test/editor_host/editor_host.cpp`,
`test/test_generated_fixture.cpp`, `test/test_editor_parity.cpp`, `test/test_obj.cpp`,
`test/test_binding.cpp`, the committed fixture (`test/generated_fixture/**`, including new XML and
regenerated goldens), `cli/test/` (draw-args tests and golden-spelling assertions), `cli/package.json`
(version) and whatever the build stamps from it, this WORKORDER.

**Do NOT touch:** the object-path arithmetic's **behaviour**; `emit/fonts.ts`, `images.ts`, `xbm.ts`
(PR-04b); the validator; the radius work (WO3); `docs/`; `PROGRAM*.md`; `PROJECT.md`; the schema
version; the runtime version.

---

## Testing Requirement

- [x] The two-realisation test: identical at the extremes and at an in-range control; fails at the
      base behaviourally *(label against box, accepted by the PA amendment)*
- [x] Editor parity still green, now over clamped values
- [x] Object-path tests unchanged and green

## Verification Requirement

- [x] CLI vitest, tsc, lint; C++ build zero warnings on a clean configure; ctest all pass. Each suite
      alone *(at `6f30698`)*
- [x] Golden diff reviewed: bound draw-call arguments only, plus the amended include line
- [x] `git diff --name-only u8g2gl-4r/wo3-radius-clamp..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Status: COMPLETE.** I stopped once with two blockers (the report of 2026-09-28 at `e553a52`),
both of which the PA amendment above resolved. This report replaces that one.

**Commits:**
- `e8e21a4`: the public helper, with the object path using it; no behaviour change.
- `e553a52`: the blocked report.
- `6f30698`: the emitter, the include, the editor host, the tests, the goldens and CLI 0.8.0.
  **This commit moves the goldens**, and its message says so and why.
- Then this report.

### Counts, each suite run alone

| Suite | Base (WO3 tip `32bb736`) | Final (`6f30698`) |
|---|---|---|
| CLI vitest | 1082 / 64 files | **1083 / 64** (+1: the include test) |
| `tsc`, lint | clean | clean |
| C++ build, clean configure | 0 warnings | **0 warnings** |
| ctest | 374, one known skip | **377, one known skip** (+3: the two-realisation test and two parity tests) |

### The helper

`int16_t u8g2gl_coord_bound(int16_t origin, int32_t value)` is a public inline function in
`include/u8g2gl/u8g2gl_coord.h`. It contains exactly the old `u8g2gl_bound_coord()` arithmetic:
pre-bound the value to ±65536, add the origin in 32 bits, clamp **the sum** into `int16_t`
(Chief Architect, 2026-09-19). Its reasoning comment moved with it, and the header's Purpose,
Description and export list name it. `src/u8g2gl_obj.cpp` keeps its null-slot guard and calls
the helper. Object behaviour is unchanged, and `test_obj` and `test_binding` pass as they were.

### The spelling rule

In `drawCallFor()`, every bound argument whose prop is `type="int"` is spelled
`u8g2gl_coord_bound(<origin>, <subject>.get())`. The origin is the container's absolute corner
for a position, and `0` for a screen-level position or a size. There is one spelling with no
zero special case.

A bound argument of any other type (`bool`, colour) stays a plain read. No shipped drawing
manifest has one: all 8 drawing manifests bind only `int`. The helper's name is exported as
`BOUND_INTEGER_HELPER` next to `SUBJECT_READ_SUFFIX`, with the rule stated there, in the module
header and on `DrawArgumentSource`.

**For the Chief Architect:** design_spec §13.5's example now differs from the emitted text.
`docs/` is not edited.

**The include (PA amendment).** `screen.ts` Step 2 emits `#include "u8g2gl/u8g2gl_coord.h"`
next to `DRAW_HEADER`, sorted, in **every unit that has draw calls**. I chose that over "only
units with a bound argument" because deciding the latter in Step 2 would re-derive the
draw-args rule a second time. The header holds only inline functions, so an unused include costs
nothing. It is not included from `u8g2gl_draw.h`. The new CLI test
`emit-screen.test.ts` "includes the coordinate header beside the draw header" checks it.

### The two-realisation test: its base failure and the wrapped values

The test is `GeneratedFixture.ABoundPositionClampsTheSameWhicheverWayItIsRealised`, accepted by
the PA amendment. `track`'s `knob` (a `u8g2gl_box`, drawn as a draw call) and `readout` (a
`u8g2gl_label`, realised as an object) share `bind_x="$position"` → `knob_x` in the same container
at x=40. The screen-level `dot` covers origin 0. No new fixture XML was needed.

The test compares the object's clamped `get_x()` with the x the draw call hands to U8G2 (via
`u8g2gl_coord_pos`), at ±40000 and at the in-range control, 5. For the control it also checks
the object's recorded `drawUTF8` x.

At the base it fails for the right reason: the draw-call path wraps.

| value | object x | knob draw call at base | dot draw call at base | final |
|---|---|---|---|---|
| 5 (control) | 45 | 45 | 5 | 45 / 5, same before and after |
| 40000 | 32767 | **40040** | **40000** | 32767 / 32767 |
| −40000 | −32768 (U8G2 gets 32768) | **25576**, on screen | **25536** | 32768 / 32768 |

**Parity.** At the base, firmware and editor agreed on the **wrapped** values. Both now agree on
the clamped ones:
- `EditorParity.BoundsScreenWithAKnobBeyondInt16OnBothTargets`: the base had `last_draw_box_x`
  40000 and 25536 on both targets.
- `EditorParity.GaugesScreenWithABoundWidthBeyondInt16OnBothTargets` covers a bound **size**.
  At the base, 40000 drew nothing on either target, and −40000 drew a box **25536 wide** on
  both. Now 40000 draws width 32767, and −40000 draws nothing.

### Editor host change

`editor_host::draw_call()`, for an argument bound to a subject whose read value is `INT`:
`arg.integer = u8g2gl_coord_bound(origin, arg.integer)`, with the origin taken from the scene or
0 when absent. This replaces `arg.integer += origin`, and the header and function banner were
updated. The scene format is unchanged and stays at version 2. The registry thunk's `int32_t` →
`int16_t` narrowing is now reachable only by **literal** arguments, which the validator keeps
within `int16_t`, so the registry emitter is unchanged.

### Golden diff summary (reviewed: nothing outside the two allowed kinds)

- `test/generated_fixture/generated/ui_screen_bounds.cpp`: the include; `40 + ui_subject_knob_x.get()` → `u8g2gl_coord_bound(40, ui_subject_knob_x.get())`; `ui_subject_knob_x.get()` → `u8g2gl_coord_bound(0, ui_subject_knob_x.get())`
- `.../ui_screen_gauges.cpp`: the include; the bound width → `u8g2gl_coord_bound(0, ui_subject_level.get())`
- `.../ui_screen_home.cpp`: the include only. Its draw calls are not bound.
- `cli/test/generator/fixtures/emit-project/expected/ui_screen_home.cpp`: the include; the bound width → `u8g2gl_coord_bound(0, ui_subject_level.get())`

`generated_editor/` is unchanged. The goldens stamp `0.0.0-golden`, which did not move.

### Assertion edits

**Spelling only, old to new:**
1. `cli/test/generator/emit-draw-args.test.ts:128`: `'ui_subject_level.get()'` → `'u8g2gl_coord_bound(0, ui_subject_level.get())'` (a bound size)
2. `cli/test/generator/emit-screen.test.ts:351`: `4, 50, ui_subject_level.get(), 6` → `4, 50, u8g2gl_coord_bound(0, ui_subject_level.get()), 6`
3. `cli/test/generator/emit-screen.test.ts:465`: `40 + ui_subject_level.get()` → `u8g2gl_coord_bound(40, ui_subject_level.get())`
4. `cli/test/generator/emit-screen.test.ts:474`: `ui_subject_level.get(), 50` → `u8g2gl_coord_bound(0, ui_subject_level.get()), 50`. Its title
   (line 473) also changed, from "leaves a screen-level bound position as its value — the control"
   to "spells a screen-level bound position with origin 0 — the control", because the old title
   would be false.
5. `cli/test/generator/manifest-fixes.test.ts:105`: `4, 20, ui_subject_level.get(), 6` → the `u8g2gl_coord_bound(0, …)` spelling
6. `cli/test/validator/validator-hardening.test.ts:255`: `ui_subject_offset.get(), 40` → `u8g2gl_coord_bound(0, ui_subject_offset.get()), 40`

**Version literals, 0.7.0 → 0.8.0 (PA amendment), all in `cli/test/integration/generate.test.ts`:**
- :344, the banner `u8g2gl 0.7.0 — target 'primary' …`
- :458, the title "the 0.7.0 proof"
- :462, `packageVersion` `toBe('0.7.0')`
- :466, `'// generator: 0.7.0'`
- :467, `--version` `toBe('0.7.0')`

No other existing assertion changed. The new tests are the include test, the two-realisation test
and the two parity tests.

### Versions

- CLI: 0.7.0 → **0.8.0** in `cli/package.json`, which is what `--version`, the banner and the
  `// generator:` stamp read.
- Schema: stays 0.4.
- Runtime: stays 0.5.0 (PA amendment).

### Built CLI output (on a copy of the fixture in `tmp/`)

```
$ node cli/dist/node/cli.js --version
0.8.0
$ node cli/dist/node/cli.js generate tmp/cli-demo
Generated 10 firmware file(s) in tmp/cli-demo/generated for target 'host':
u8g2gl 0.8.0 — target 'host' (U8G2_SSD1306_128X64_NONAME_F_HW_I2C 128x64)
u8g2gl_generated_config.h:4:// generator: 0.8.0
ui_screen_bounds.cpp:9:#include "u8g2gl/u8g2gl_coord.h"
ui_screen_bounds.cpp:113:        u8g2gl_draw_box(display, u8g2gl_coord_bound(40, ui_subject_knob_x.get()), 10, 4, 4, true, 0);  // track_knob: no object (§13.5)
ui_screen_bounds.cpp:116:    u8g2gl_draw_box(display, u8g2gl_coord_bound(0, ui_subject_knob_x.get()), 40, 2, 2, true, 0);  // dot: no object (§13.5)
```

### Boundary

`git diff --name-only 32bb736..HEAD` (the WO's base tip) lists only in-box files:
- the helper in `u8g2gl_coord.h`, and `u8g2gl_obj.cpp`
- `draw-args.ts`, and `screen.ts` (Step 2's include only, under the amendment)
- `editor_host.cpp`, `test_generated_fixture.cpp`, `test_editor_parity.cpp`
- the fixture goldens and the CLI tests and goldens
- `cli/package.json`
- this WORKORDER

`PROJECT.md` also appears in that range, from the PA's amendment commit `9bfe368`, and against
the branch `u8g2gl-4r/wo3-radius-clamp` from the PA's `32bb736` as well. Neither is a worker
commit. My commits (`e8e21a4`, `e553a52`, `6f30698` and this one) do not touch it.

### Findings (out of scope; not fixed, not filed)

1. **The same-class, two-realisation construction cannot be expressed before PR-09.**
   `<event_cb>` and `<focus_ring>` are refused (`validate-not-yet-supported.ts`). A drawing
   element has no class, so forcing one to be an object gives `DRAWING_ELEMENT_NEEDS_OBJECT`. And
   under [D-18]'s interim amendment every class-backed element is always an object. The comparison
   is therefore necessarily between two classes. It is worth revisiting when PR-09 lands.
2. **Draw calls are not clipped to their container; objects are.** At the extremes the object is
   skipped by `u8g2gl_render_object()` (empty clip) while the draw call is still issued,
   off-screen. The pixels agree, but the call logs cannot match call for call. More generally, a
   draw-call child that overhangs its container paints outside it and an object child does not.
   That is a second way realisation can be seen, separate from mandate item 1.
3. **A time subject bound to a draw argument** reaches `u8g2gl_coord_bound()` as `uint32_t` in
   firmware, an implicit conversion (no warning without `-Wconversion`). The editor host casts to
   `int32_t` explicitly, so the two agree. Epoch seconds above `INT32_MAX` go negative before the
   clamp on both targets.
4. **`u8g2gl_draw.h`'s Coordinates table** does not mention the bound-value clamp that happens
   before its conversions. This is a candidate for WO5, beside WO3's carried note on the same table.
5. **Naming:** `u8g2gl_coord.h` uses "BOUND" both for `u8g2gl_coord_clamp()`'s clip corners and for
   `u8g2gl_coord_bound()`'s subject-bound values. The header tells them apart ("BOUND VALUE"), but
   a reader may trip on it.
6. **`cli/package-lock.json` is stale.** It records the package as `0.6.0`, and it was already
   stale before this WO, at 0.7.0. It is not in the box and I did not touch it. `npm install`
   would rewrite it.
