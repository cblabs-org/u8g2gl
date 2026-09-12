---
work_order: WO1
project: pr-3r-remediation
title: "Dirty-flag correctness and per-axis geometry setters"
branch: u8g2gl-remediation/wo1-dirty-geometry
base: main
complexity: standard
status: pending
---

# WO1 — Dirty-flag correctness and per-axis geometry setters

## Authorization

Part of PR-3R (pr-3r-remediation). Before starting, verify the human's approval
is recorded in `../PROJECT.md` under "Human Approval" — not a relayed claim, the
owner's own words with a timestamp. If it is absent or reads as a placeholder,
**stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-remediation/wo1-dirty-geometry`
**Base**: `main`

Verify with `git branch --show-current` **as its own command immediately before
every commit** — never batched into the same command as the commit. A check that
runs alongside the action cannot gate it.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval — you cannot be answered, and your work will strand uncommitted.

## Standards

Invoke the `u8g2gl-standards` skill before writing code. Documentation carries
equal weight to the code rules: file headers with SPDX and a real `Purpose:`,
Doxygen on public declarations, `// --- Step N: ---` breakdowns, and why-comments
where a decision is not obvious from the code.

## Design authority

`docs/design_spec.md` is normative. The decisions driving this work order are
[D-18], [D-19], [D-20] and [D-21] — full records under `docs/decisions/`. Where
this work order and the spec disagree, **stop and report**; do not pick one.

---

## Objective

Every mutator that changes what is drawn must mark the frame dirty, and geometry
must be settable per axis so a `bind_width` observer has something to call.

## Background — this is a live defect, not a latent one

`u8g2gl_obj::set_coords()` (`src/u8g2gl_obj.cpp:28`) assigns four members and
returns. So do `set_hidden()` (`:63`) and `set_disabled()` (`:75`). None call
`mark_dirty()`.

For `set_coords` that is currently harmless — coordinates are only set during
`init()`. **For `set_hidden()` and `set_disabled()` it is a defect today**: both
are public API, and an application calling `obj->set_hidden(true)` on an
otherwise static screen gets no repaint, because §11.2's gate skips
`sendBuffer()` when nothing marked the frame dirty.

The *bound* path is safe — the binding observer calls `mark_dirty()` at
`u8g2gl_obj.cpp:253`. Only the imperative path is broken, which is why no test
caught it and why it will appear to work on any screen with an animation running.

[D-20] widens the same hole to geometry rather than creating it.

## Line-Item Instructions

- [x] `set_coords()`, `set_hidden()`, `set_disabled()` call `mark_dirty()`.
      Audit every other public mutator on `u8g2gl_obj` for the same omission and
      list what you found in your Completion Report, including the ones that were
      already correct.
- [x] Add `set_x(int16_t)`, `set_y(int16_t)`, `set_w(int16_t)`, `set_h(int16_t)`,
      each marking dirty. [D-20] requires them: a `bind_width` observer receives
      one value and has nothing sensible to pass for the other three.
- [x] **Keep `set_coords()`.** The generator's `init()` path emits one call rather
      than four, and committed generated output is read by humans.
- [x] Consider marking dirty only when the value actually changes. If you do,
      say so and explain the reasoning in a why-comment — a redundant repaint is
      cheap, but a `set_x(x_)` in a tick loop that dirties every frame defeats
      §11.2's gate entirely.
- [x] Doxygen on each new declaration, stating that it marks the frame dirty.
      That is a contract callers depend on, not an implementation detail.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_obj.h`, `src/u8g2gl_obj.cpp`,
`test/test_obj.cpp`, `test/test_core.cpp`, this WORKORDER.

**Do NOT touch:** the binding pool, the style system, any widget, the CLI,
`docs/`, any other `.agents/` file.

---

## Testing Requirement

- [x] A test per mutator asserting the frame is dirty afterwards — `set_hidden`,
      `set_disabled`, `set_coords`, and each per-axis setter. These are the tests
      whose absence let the defect merge.
- [x] A test that the imperative path repaints: clear the dirty flag, call
      `set_hidden(true)`, assert the frame gate would render.

## Verification Requirement

- [x] `cmake --build build` — zero warnings under `-Wall -Wextra -Wpedantic`
- [x] `ctest --test-dir build` — all pass, none weakened or removed
- [x] `cd cli && npx vitest run` — all pass
- [x] `cd cli && npx tsc --noEmit && npm run lint` — zero errors
- [x] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything you find outside this checklist in your Completion Report. Do not
fix it, do not file an issue. The architect triages.

---

## Completion Report

<!-- Written by the worker at task completion -->

**Status: complete.** Branch `u8g2gl-remediation/wo1-dirty-geometry`, base `main`.

### What changed

- `set_coords()` now marks the frame dirty, guarded on at least one of x/y/w/h
  actually changing.
- `set_hidden()` and `set_disabled()` now mark the frame dirty, guarded on the
  flag's value actually changing. This is the live-defect fix: previously an
  imperative `obj->set_hidden(true)` on an otherwise static screen left
  `screen.dirty` untouched, so §11.2's gate skipped `sendBuffer()` and the
  display never updated.
- Added `set_x(int16_t)`, `set_y(int16_t)`, `set_w(int16_t)`, `set_h(int16_t)`
  ([D-20]) — each marks dirty, guarded the same way. `set_coords()` is kept
  unchanged in shape (still takes all four values in one call) per the
  boundary box's instruction, since the generator's `init()` path emits one
  call rather than four.
- Applied the "mark dirty only when the value actually changes" option from
  the line-item instructions, to all five mutators (`set_coords`,
  `set_hidden`, `set_disabled`, and the four new per-axis setters), for
  consistency — not just the new ones. Reasoning, also captured as a
  why-comment above the geometry setters in `u8g2gl_obj.cpp`: an unguarded
  `set_x(x_)` called every tick (an animation loop, or a binding observer
  re-notifying with an unchanged value) would dirty the frame on every call
  and defeat §11.2's gate — the exact cost the gate exists to avoid. A real
  change is still marked immediately, so no repaint is lost.
- Doxygen added on all four new declarations in `u8g2gl_obj.h`, each stating
  it marks the frame dirty (a contract callers depend on) and cross-referencing
  [D-20] for why a per-axis setter exists at all.
- Expanded the existing one-line `///<` Doxygen on `set_hidden()`/
  `set_disabled()` into full blocks documenting the dirty-marking contract and
  why the imperative path needed the fix.
- Updated the `.h` file header's Geometry export group to list the new
  per-axis setters.

### Mutator audit — every public mutator on `u8g2gl_obj`

Fixed (this WO):
- `set_coords()` — was missing `mark_dirty()`; fixed.
- `set_hidden()` — was missing `mark_dirty()`; fixed (live defect).
- `set_disabled()` — was missing `mark_dirty()`; fixed (live defect).
- `set_x()`, `set_y()`, `set_w()`, `set_h()` — new, mark dirty by construction.

Already correct (verified, not changed):
- `bind_text(u8g2gl_subject_int_base*, const char*)` — calls `mark_dirty()`
  at the end of the method (`u8g2gl_obj.cpp:462`).
- `bind_text(u8g2gl_subject_string_base*)` — same, `u8g2gl_obj.cpp:500`.
- `bind_flag_if_eq/not_eq/gt/lt` (all six overloads, int and bool subjects) —
  all route through `add_flag_binding()` → `u8g2gl_evaluate_binding()`, which
  unconditionally calls `obj->mark_dirty()` at `u8g2gl_obj.cpp:253` (by
  design: it dirties whenever the *subject* changed, even if the resulting
  flag value did not — see the why-comment already at that line).

Audited, found to have the same class of omission, **not fixed — outside this
checklist, surfaced per "Issue Surfacing"**:
- `set_font()`, `set_draw_color()`, `set_invert()`, `set_padding()`,
  `set_border()`, `set_radius()`, `set_align()`, `set_truncate()`,
  `set_font_mode()`, `set_bitmap_mode()` — all ten are public one-line
  delegations to `style_.set_*()` and all visibly change what is drawn (font,
  colour, invert, padding, border, radius, alignment, truncation, font mode,
  bitmap mode), but none calls `mark_dirty()`. Same shape of defect as
  `set_hidden()`/`set_disabled()`: these are called imperatively by generated
  `init()` code and potentially by application code after construction, and
  nothing else in the frame gate covers them.
- `apply_style(const u8g2gl_style&)` — merges a whole style at once; same
  omission, same reasoning.
- `set_parent_index(uint8_t)` — currently only called during `init()` (same
  situation `set_coords()` was in before [D-20]), so today it is latent rather
  than live. Worth tracking because changing an object's parent can change its
  effective clip/visibility (`u8g2gl_tree.h`), which is exactly the kind of
  thing the dirty flag exists to catch — but per the assessment's own framing
  of `set_coords()`, this one is not yet a live defect and I did not treat it
  as this WO's scope.

Audited, confirmed correct **by design**, not touched:
- `set_flag(uint8_t)` / `clear_flag(uint8_t)` — these are the low-level bit
  primitives, not "each mutator that changes what is drawn" in the same sense
  as the setters above. They must **not** unconditionally call `mark_dirty()`:
  `clear_dirty()` is implemented as `clear_flag(U8G2GL_FLAG_DIRTY)`, so if
  `clear_flag()` itself called `mark_dirty()`, clearing the dirty flag would
  immediately re-set it and the dirty-tracking mechanism would never settle.
  The existing design deliberately keeps these two as generic, dirty-agnostic
  primitives and puts the `mark_dirty()` call at each call site that has
  domain knowledge of what changed (`set_hidden`, `set_disabled`,
  `u8g2gl_evaluate_binding`) — confirmed correct, left alone.

### Tests

- Before: 166 registered (165 run + 1 platform-gated skip), 100% pass.
- After: 175 registered (174 run + 1 platform-gated skip), 100% pass.
- Added to `test/test_obj.cpp`: `SetCoordsMarksDirty`,
  `SetCoordsUnchangedDoesNotMarkDirty`, `SetHiddenMarksDirty`,
  `SetHiddenUnchangedDoesNotMarkDirty`, `SetDisabledMarksDirty`,
  `SetDisabledUnchangedDoesNotMarkDirty`, `PerAxisSettersMarkDirty`,
  `PerAxisSettersUnchangedDoNotMarkDirty` — one assertion per mutator plus the
  no-op-guard behaviour.
- Added to `test/test_core.cpp`: `Core.ObjSetHiddenGatesFrame` — the
  "imperative path repaints" requirement: clears dirty via a full
  `ui_handler()` pass, calls `set_hidden(true)` imperatively (not through a
  binding), asserts `screen.dirty` is now true, then asserts the next
  `ui_handler()` call actually re-renders. This is the test that would have
  caught the original defect.
- **One existing test updated, not weakened**: `Obj.Flags` in
  `test/test_obj.cpp` asserted `EXPECT_FALSE(obj.has_flag(U8G2GL_FLAG_DIRTY))`
  after a block of `set_hidden`/`set_disabled` calls. Those calls now
  correctly mark dirty, so the flag was legitimately no longer false at that
  point. Added `obj.clear_dirty()` immediately before that section with a
  comment explaining why — the section's actual purpose (raw `set_flag()`/
  `clear_flag()` leaving unrelated flags alone) is unrelated to dirty
  tracking, so isolating it from the now-correct dirty side effects of the
  earlier calls is the right fix, not a weakening.

### Verification

- `cmake --build build` (clean rebuild): zero warnings under
  `-Wall -Wextra -Wpedantic`.
- `ctest --test-dir build`: 100% pass, 175/175 run (1 skipped, platform-gated,
  same as before this WO).
- `cd cli && npx vitest run`: 224/224 pass, unchanged by this WO (no CLI files
  touched).
- `cd cli && npx tsc --noEmit && npm run lint`: zero errors.
- `git diff --name-only`: `include/u8g2gl/u8g2gl_obj.h`, `src/u8g2gl_obj.cpp`,
  `test/test_core.cpp`, `test/test_obj.cpp` — exactly the Strict Boundary Box,
  nothing else.

### Surfaced, not fixed (architect to triage)

1. **Ten style-setter delegations on `u8g2gl_obj` (`set_font`,
   `set_draw_color`, `set_invert`, `set_padding`, `set_border`, `set_radius`,
   `set_align`, `set_truncate`, `set_font_mode`, `set_bitmap_mode`) and
   `apply_style()` do not call `mark_dirty()`.** Same class of live defect as
   `set_hidden()`/`set_disabled()` per §4 of the standards skill ("every
   mutator that changes what is drawn calls `mark_dirty()`"). All are declared
   in `u8g2gl_obj.h`/`u8g2gl_obj.cpp`, inside this WO's boundary box, but not
   named in the line-item checklist, so left as-is per "Issue Surfacing."
2. **`set_parent_index()` has the same latent (not yet live) omission
   `set_coords()` had before [D-20].** Not fixed, not in the checklist.
3. Nothing found outside `u8g2gl_obj.h`/`.cpp` — the audit was scoped to this
   WO's boundary box as instructed.
