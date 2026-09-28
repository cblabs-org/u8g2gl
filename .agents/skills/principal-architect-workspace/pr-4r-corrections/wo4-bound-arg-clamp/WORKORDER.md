---
work_order: WO4
project: pr-4r-corrections
title: "A bound draw-call argument clamps exactly as an object's binding does"
branch: u8g2gl-4r/wo4-bound-arg-clamp
base: u8g2gl-4r/wo3-radius-clamp
complexity: standard
status: dispatched
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
- [x] **Write the failing test first** *(written and failing at the base as required; held uncommitted with the rest, see report)*, at the base (WO3's tip). Add a fixture screen, or extend an
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
- [ ] **BLOCKED — Firmware emission:** *(done in `tmp/wo4-pending.patch`; the generated units do not compile without an include this box excludes)* `drawCallFor()` spells every bound **integer** argument through the
      helper: `u8g2gl_coord_bound(40, ui_subject_x.get())`, and `u8g2gl_coord_bound(0, …)` for a
      zero origin and for a size, which has no origin. The object path clamps a size the same way,
      with origin 0. One spelling, no special case for zero, so the output reads uniformly. If a bound
      draw argument can be non-integer (bool, colour), leave it alone and say so. Update
      `SUBJECT_READ_SUFFIX`'s neighbourhood and the module header to state the rule.
      **§13.5's example in the spec** will then differ from the emitted text. Note that for the
      Chief Architect; do not edit `docs/`.
- [ ] **HELD — Editor host:** *(done in the patch; held because it must land with the emitter)* `draw_call()` computes a bound integer argument with the **same helper**
      (origin from the scene, 0 when absent), so the host cannot drift from firmware. If the
      registry thunk's implicit `int32_t` → `int16_t` narrowing remains reachable for a **literal**
      argument, report it as a finding. Literals are validated to `int16_t` today, so do not change
      the registry emitter unless the test requires it.
- [x] **Scene format:** *(unchanged: the existing `origin` suffices, version stays 2)* if the scene JSON's shape must change to carry anything new, it needs a
      scene-format version bump. Avoid that if the origin already suffices, which the PA expects.
- [ ] **NOT DONE — CLI version 0.7.0 → 0.8.0** *(needs non-spelling assertion edits; see report)* (`cli/package.json` and anything the build stamps from it).
      Rules/03: a generator change that alters output without an input change is breaking and
      **requires** it. Schema stays 0.4. Runtime stays 0.5.0 (WO3 bumped it).
- [ ] **HELD — Regenerate the goldens.** *(regenerated and reviewed in the patch; they cannot compile, see report)* They move because every bound draw-call argument's spelling
      changes. The commit that moves them says so, and why, in its message. Review the golden
      diff: **only** bound draw-call arguments (and any stamp) may change. Anything else: stop and
      report.
- [ ] **HELD — CLI tests** *(six spelling-only edits in the patch, listed)*: `emit-draw-args` (or the nearest) asserts the new spelling, including a zero
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

- [ ] The two-realisation test: identical at the extremes and at an in-range control; fails at the
      base behaviourally *(fails at the base as required; passes with the patch plus the include; held)*
- [ ] Editor parity still green, now over clamped values *(green with the patch plus the include; held)*
- [x] Object-path tests unchanged and green

## Verification Requirement

- [x] CLI vitest, tsc, lint; C++ build zero warnings on a clean configure; ctest all pass. Each suite
      alone *(at the committed tip)*
- [x] Golden diff reviewed: bound draw-call arguments only *(the regenerated goldens; they also need an include line the box excludes)*
- [x] `git diff --name-only u8g2gl-4r/wo3-radius-clamp..HEAD` within the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Status: BLOCKED, stopped and reported.** The work is written but half of it is held. The
generated screen units cannot compile the new spelling, because nothing they include declares
`u8g2gl_coord_bound()`. The only fixes are in files the Strict Boundary Box excludes. Committed
and green: the public helper, with the object path using it. Held: the emitter, the editor host,
the tests, the goldens and the six assertion edits, saved as a patch that applies cleanly to the
tip. Not done: the CLI version bump, which needs a class of assertion edit this WO does not allow.

**Commits:** `e8e21a4` refactor(runtime): one public bound-value clamp, `u8g2gl_coord_bound()`.
Then the commit that adds this report.

### Blocker 1: the generated units cannot see the helper

The emitter now spells `u8g2gl_coord_bound(40, ui_subject_knob_x.get())`. The generated
`ui_screen_*.cpp` includes `ui.hpp`, `u8g2gl/u8g2gl_draw.h` and each object's class header. None
of these includes `u8g2gl_coord.h` directly or indirectly. `u8g2gl_draw.h` forward-declares
`U8G2` so that it does not pull in `U8g2lib.h`, and `u8g2gl_coord.h` does pull it in. The build
therefore fails:

```
ui_screen_bounds.cpp:112:34: error: use of undeclared identifier 'u8g2gl_coord_bound'
```

Every fix lies outside the box:
- **`cli/src/core/generator/emit/screen.ts`** Step 2 emits `DRAW_HEADER` whenever a unit has
  draw calls. Emitting `#include "u8g2gl/u8g2gl_coord.h"` beside it is the natural fix. It is
  one sorted line, emitted either with `DRAW_HEADER` or only when a bound integer argument exists.
- **`include/u8g2gl/u8g2gl_draw.h`**: including `u8g2gl_coord.h` here would break that header's
  deliberate forward declaration. I do not recommend it.

Either fix also adds an `#include` line to the goldens, which is not a bound draw-call argument.
The WO says to stop and report on that. It affects three golden files: the fixture's
`ui_screen_bounds.cpp` and `ui_screen_gauges.cpp`, and `cli/test/generator/fixtures/emit-project/expected/ui_screen_home.cpp`.

**Proved, not assumed.** I added the include by hand to the two regenerated fixture units, as
research only, and later reverted it. The C++ suite then built with 0 warnings and passed **377
of 377** (one known skip), including the three new tests. With the patch applied, the CLI passes
**1082 / 64**, and `tsc` and lint are clean. The include is the only thing missing.

### Blocker 2: the CLI version bump needs assertion edits that are not spelling changes

`cli/test/integration/generate.test.ts` pins the version literally on purpose: a test that reads
it back from `package.json` would pass at every version (PR-04 WO10's carry). Moving to 0.8.0
means changing these assertions: line 344 `"u8g2gl 0.7.0 — target 'primary' …"`, line 462
`toBe('0.7.0')`, line 466 `'// generator: 0.7.0'`, line 467 `--version` `toBe('0.7.0')`, and the
test title at line 458, "the 0.7.0 proof". None of these is an old-to-new bound-argument
spelling change. WO3 explicitly allowed "update any test pinning the runtime version"; this WO
has no such line. Held for the PA. The goldens stamp `0.0.0-golden` and do not move with the bump.

### The held work: `tmp/wo4-pending.patch`

The patch is in this worktree (the directory is git-ignored), 397 lines, made against `e8e21a4`,
and `git apply --check` passes. To land it: apply the patch, add the include (blocker 1),
regenerate the goldens, bump the version (blocker 2), then build and test.

### Baseline and counts

| Suite | Base (WO3 tip `32bb736`) | Committed tip | Patch + include (probe) |
|---|---|---|---|
| CLI vitest | 1082 / 64 files | 1082 / 64 | 1082 / 64 |
| `tsc`, lint | clean | clean | clean |
| C++ build, clean configure | 0 warnings | 0 warnings | 0 warnings |
| ctest | 374, one known skip | 374, one known skip | 377, one known skip |

Each suite was run alone.

### The helper (committed)

`int16_t u8g2gl_coord_bound(int16_t origin, int32_t value)` is a public inline function in
`include/u8g2gl/u8g2gl_coord.h`. It contains exactly the old arithmetic: pre-bound the value to
±65536, add the origin in 32 bits, clamp **the sum** into `int16_t`. The reasoning comment moved
with it, including the Chief Architect's 2026-09-19 ruling. The file header's Purpose, Description
and export list name it. `u8g2gl_bound_coord()` in `src/u8g2gl_obj.cpp` keeps its null-slot guard
and now calls the helper. There is no behaviour change: `test_obj` and `test_binding` pass
unchanged (107 matching tests).

### The spelling rule (in the patch)

In `drawCallFor()`, a bound argument whose prop is `type="int"` is spelled
`u8g2gl_coord_bound(<origin>, <subject>.get())`. The origin is the container's absolute corner
for a position and `0` otherwise, so a screen-level position and a size both get `0`. There is
one spelling and no special case for zero. A bound argument of any other type (`bool`, colour)
is left as the plain read. No shipped drawing manifest binds one: all 8 drawing manifests bind
only `int`. The function name is exported as `BOUND_INTEGER_HELPER` next to
`SUBJECT_READ_SUFFIX`, with the rule stated. The module header and the `DrawArgumentSource` doc
state it too. **For the Chief Architect:** design_spec §13.5's example now differs from the
emitted text (`docs/` not edited).

### The two-realisation test, its base failure and the wrapped values

`GeneratedFixture.ABoundPositionClampsTheSameWhicheverWayItIsRealised` is in
`test/test_generated_fixture.cpp` and is held in the patch.

**My choice, stated:** the WO's construction cannot be built today. It asks for two elements of
the **same class**, one forced to an object by `<event_cb>` or a focus ring. Both conditions are
refused until PR-09 (`validate-not-yet-supported.ts`). A drawing element (`u8g2gl_box`, …) has
no class, so any forcing reason raises `DRAWING_ELEMENT_NEEDS_OBJECT`. And every class-backed
element is always an object ([D-18]'s interim amendment). So no XML exists today whose one class
is realised both ways.

The test uses the fixture's existing pair instead. `track`'s `knob` (`u8g2gl_box`, a draw call)
and `readout` (`u8g2gl_label`, an object) have the same `bind_x="$position"` → `knob_x`, in the
same container at x=40. The screen-level `dot` covers origin 0. The test compares the object's
clamped `get_x()` with the x the draw call hands U8G2 (`drawBox` args[0], via `u8g2gl_coord_pos`),
at +40000, at −40000 and at the control, 5. For the control it also checks the object's recorded
`drawUTF8` x against `drawBox` x. No new fixture XML was needed.

**At the base it fails for the right reason: the draw-call path wraps.**

| value | object `get_x()` (clamped) | knob draw call at base (wrapped) | dot draw call at base (wrapped) | after |
|---|---|---|---|---|
| 5 (control) | 45 | 45 | 5 | 45 / 5, agrees before and after |
| 40000 | 32767 | **40040** (40+40000 → int16 −25496) | **40000** (→ −25536) | 32767 / 32767 |
| −40000 | −32768 (U8G2 gets 32768) | **25576** (→ +25576, on screen) | **25536** | 32768 / 32768 |

**Parity** (`test/test_editor_parity.cpp`, held) adds two tests:
- `EditorParity.BoundsScreenWithAKnobBeyondInt16OnBothTargets`: the logs agree at the base, both
  wrapped (`last_draw_box_x` 40000, then 25536). After the fix they agree on 32767 and 32768.
- `EditorParity.GaugesScreenWithABoundWidthBeyondInt16OnBothTargets` covers the bound **size**.
  At the base, level=40000 wrapped to −25536 and was refused (0 boxes on both targets), and
  level=−40000 wrapped to 25536 and **drew a box 25536 wide** (1 box on both). After the fix:
  width 32767, and nothing drawn for −40000.

### Editor host change (in the patch)

`editor_host::draw_call()` handles an argument bound to a subject whose read value is `INT` like
this: `arg.integer = u8g2gl_coord_bound(origin, arg.integer)`. The origin is the scene's
`origin`, or 0 when absent. This replaces `arg.integer += origin`. The header and function
banner were updated. **Scene format unchanged:** the existing `origin` suffices, and the version
stays 2.

**Finding:** after this change the registry thunk's implicit `int32_t` → `int16_t` narrowing is
still reachable only for **literal** arguments. The validator holds those to `int16_t`, so the
thunk emitter was not changed.

### Golden diff summary (in the patch, reviewed)

Four lines in three files. Each is one bound draw-call argument changing spelling:
- `test/generated_fixture/generated/ui_screen_bounds.cpp:112`: `40 + ui_subject_knob_x.get()` → `u8g2gl_coord_bound(40, ui_subject_knob_x.get())`
- `ui_screen_bounds.cpp:115`: `ui_subject_knob_x.get()` → `u8g2gl_coord_bound(0, ui_subject_knob_x.get())`
- `ui_screen_gauges.cpp:87` (a bound width): `ui_subject_level.get()` → `u8g2gl_coord_bound(0, ui_subject_level.get())`
- `cli/test/generator/fixtures/emit-project/expected/ui_screen_home.cpp:147` (a bound width): the same change

`generated_editor/` (the registry and the scene) is unchanged. No stamp moved. Blocker 1's
include line would be the only other change.

### Assertion edits (in the patch; each changes only the old spelling to the new)

1. `cli/test/generator/emit-draw-args.test.ts:128`: `'ui_subject_level.get()'` → `'u8g2gl_coord_bound(0, ui_subject_level.get())'` (a bound size)
2. `cli/test/generator/emit-screen.test.ts:351`: `4, 50, ui_subject_level.get(), 6` → `4, 50, u8g2gl_coord_bound(0, ui_subject_level.get()), 6`
3. `cli/test/generator/emit-screen.test.ts:465`: `40 + ui_subject_level.get()` → `u8g2gl_coord_bound(40, ui_subject_level.get())`
4. `cli/test/generator/emit-screen.test.ts:474`: `ui_subject_level.get(), 50` → `u8g2gl_coord_bound(0, ui_subject_level.get()), 50` (a zero origin). Its **test title**
   also changed, from "leaves a screen-level bound position as its value — the control" to
   "spells a screen-level bound position with origin 0 — the control". The old title would be
   false. The title is not an assertion, but I list it.
5. `cli/test/generator/manifest-fixes.test.ts:105`: `4, 20, ui_subject_level.get(), 6` → the `u8g2gl_coord_bound(0, …)` spelling
6. `cli/test/validator/validator-hardening.test.ts:255`: `ui_subject_offset.get(), 40` → `u8g2gl_coord_bound(0, ui_subject_offset.get()), 40`

Between them, these cover a zero origin, a non-zero origin and a bound size. No other existing
assertion changed. The version-pin edits (blocker 2) were not made.

### Version

Not bumped: the version is still 0.7.0, because of blocker 2. The runtime stays 0.5.0 and the
schema stays 0.4. The helper is new public API in the runtime, so the runtime minor may want
revisiting. That is the PA's call; WO3 already took the runtime to 0.5.0 in this PR.

### Built CLI output (patch applied, `npx tsc`, on a copy of the fixture in `tmp/`, then reverted)

```
$ node cli/dist/node/cli.js generate tmp/cli-demo
Generated 10 firmware file(s) in tmp/cli-demo/generated for target 'host':
ui_screen_bounds.cpp:112:        u8g2gl_draw_box(display, u8g2gl_coord_bound(40, ui_subject_knob_x.get()), 10, 4, 4, true, 0);  // track_knob: no object (§13.5)
ui_screen_bounds.cpp:115:    u8g2gl_draw_box(display, u8g2gl_coord_bound(0, ui_subject_knob_x.get()), 40, 2, 2, true, 0);  // dot: no object (§13.5)
ui_screen_gauges.cpp:87:    u8g2gl_draw_box(display, 4, 20, u8g2gl_coord_bound(0, ui_subject_level.get()), 6, true, 0);  // level_bar: no object (§13.5)
```

The same run shows the missing include: the units include only `ui.hpp`, `u8g2gl_draw.h`,
`u8g2gl_label.h` and `u8g2gl_obj.h`.

### Boundary

`git diff --name-only u8g2gl-4r/wo3-radius-clamp..HEAD` lists `include/u8g2gl/u8g2gl_coord.h`,
`src/u8g2gl_obj.cpp` and this WORKORDER, all inside the box. The patch touches only in-box files.
No out-of-box file was edited, apart from the hand-added include in two in-box golden units,
which was reverted.

### Findings (out of scope; not fixed, not filed)

1. **The WO's two-realisation construction cannot be built in PR-4R.** See the test section.
   Until PR-09 allows events and focus rings, or a drawing element can be an object, the
   comparison is necessarily between two classes.
2. **Draw calls are not clipped to their container; objects are.** At the extremes the object
   is clipped out by `u8g2gl_render_object()` (empty clip), while the draw call is still issued
   (off-screen). Pixels agree, but the U8G2 call logs cannot match call for call. More generally,
   a draw-call child that overhangs its container paints outside it, and an object child does
   not. That is a second way realisation is observable, separate from item 1 of the mandate.
3. **A time subject bound to a draw argument** reaches `u8g2gl_coord_bound(int16_t, int32_t)` as
   `uint32_t` in firmware, an implicit conversion (no warning without `-Wconversion`). The host
   casts to `int32_t` explicitly, so the two agree. Epoch seconds above `INT32_MAX` become
   negative before the clamp on both targets.
4. **`u8g2gl_draw.h`'s Coordinates table** does not mention the bound-value clamp that happens
   before its conversions. That is a candidate for WO5, next to WO3's carried note about the same
   table.
5. **Naming:** `u8g2gl_coord.h` already uses "BOUND" for `u8g2gl_coord_clamp()`'s clip corners,
   and now also has `u8g2gl_coord_bound()` for subject-bound values. The header disambiguates
   ("BOUND VALUE"), but a reader may trip on it. The name `u8g2gl_coord_bound` is the WO's.
