---
work_order: WO2b
project: pr-3r-remediation
title: "Reversing scroll — make long_mode=scroll match its specification"
branch: u8g2gl-remediation/wo2b-scroll-semantics
base: u8g2gl-remediation/wo2-label-long-mode
complexity: standard
status: complete
---

# WO2b — Reversing scroll

## Authorization

Part of PR-3R, approved by the human on 2026-09-13 — verify the verbatim record
in `../PROJECT.md`. **WO2b was added by the Principal Architect during execution**
to close a defect WO2 surfaced; the owner was informed. If the PROJECT.md record
is absent or reads as a placeholder, **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-remediation/wo2b-scroll-semantics`
**Base**: `u8g2gl-remediation/wo2-label-long-mode`

Verify with `git branch --show-current` **as its own command immediately before
every commit** — never batched into the same command as the commit.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval — you cannot be answered, and your work will strand uncommitted.

## Standards

Invoke the `u8g2gl-standards` skill before writing code. Its §4.1 design baseline
names the decisions that changed the element model.

---

## Objective

`long_mode="scroll"` must **reverse at each end**, as design_spec §6 and [D-19]
both define it. It currently wraps continuously, which is `scroll_circular`.

## Background — why this exists

WO2 was correct to produce what it produced. The spec contradicted itself: the
semantics table said `scroll` reverses, while §15.4's migration table mapped the
old `u8g2gl_scrolling_label` onto `scroll`. That widget wrapped continuously —
its own source says it wraps "to re-enter smoothly from the right edge".

The Chief Architect resolved it on 2026-09-13: **the migration table was the
error** and now maps to `scroll_circular`. The semantics table stands, because it
matches LVGL exactly (`LV_LABEL_LONG_SCROLL` bounces, `LV_LABEL_LONG_SCROLL_CIRCULAR`
wraps) and §1.4 makes that familiarity a goal.

So `scroll_circular` is already correct and must not change. What is missing is
reversing scroll.

**Do not redefine `scroll` as wrapping to avoid the work.** That would diverge
from LVGL silently, on the identifier an LVGL user is most likely to reach for —
worse than a missing mode.

## Line-Item Instructions

- [ ] Implement reversing behaviour for `long_mode="scroll"`: travel until the
      text's far edge reaches the widget bound, then reverse, then reverse again
      at the origin, indefinitely.
- [ ] **Dwell at each end using the existing `static_dwell_ms`.** It already
      exists and already means "pause while stationary"; a second timing property
      for the same concept is schema surface we do not need (§1.5).
- [ ] `initial_delay_ms` continues to apply to the first departure only, as now.
- [ ] `scroll_px_per_sec` governs both directions. A separate return speed is not
      offered; if you think it is needed, surface that rather than adding it.
- [ ] **Leave `scroll_circular` alone.** It is correct. WO2 gave it one clean
      distinction — never latching `is_scroll_finished()` — which remains right:
      a continuous marquee never finishes.
- [ ] `is_scroll_finished()` for `scroll`: reversing is also endless, so it should
      behave as it does for `scroll_circular`. Confirm what WO2 implemented and
      match it deliberately rather than by accident; say which you chose and why.
- [ ] Keep the change inside the existing state machine. If reversing needs a
      direction flag, one flag — do not restructure code WO2 just moved.
- [ ] Why-comment at the direction flip explaining that `scroll` reverses and
      `scroll_circular` wraps, and that these are LVGL's semantics. The next
      reader will otherwise assume one is a copy-paste error of the other.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_label.h`, `src/u8g2gl_label.cpp`,
`test/test_label.cpp`, `include/u8g2gl/manifests/u8g2gl_label.xml` only if a
property description needs correcting, this WORKORDER.

**Do NOT touch:** `scroll_circular`'s behaviour; any other widget; the style
system; the dirty-flag work from WO1/WO2; the CLI; `docs/`.

---

## Testing Requirement

- [ ] `scroll` reverses: advance time past the far edge and assert the offset
      begins decreasing. This is the test that fails against WO2's implementation
      and is the whole point of this work order.
- [ ] `scroll` dwells at both ends for `static_dwell_ms`.
- [ ] `scroll` and `scroll_circular` are **observably different** — one test that
      would fail if the two modes were ever collapsed again.
- [ ] `scroll_circular`'s existing tests pass **unchanged**. If one needs editing,
      you have altered behaviour that was correct; stop and surface it.
- [ ] Text shorter than the widget does not scroll in either mode.

## Verification Requirement

- [ ] `cmake --build build` — zero warnings under `-Wall -Wextra -Wpedantic`
- [ ] `ctest --test-dir build` — all pass, none weakened or removed
- [ ] `cd cli && npx vitest run` — all pass
- [ ] Report measured `sizeof(u8g2gl_label)` with the host width. It was 80 bytes
      after WO2; if a direction flag pushes it further, say so — §1.3 forbids a
      cost claim the budget cannot substantiate.
- [ ] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything outside this checklist in your Completion Report. Do not fix it,
do not file an issue. The architect triages and files.

---

## Completion Report

<!-- Written by the worker at task completion -->

**Status: complete.**

### What changed

- **`include/u8g2gl/u8g2gl_label.h`**: rewrote `set_long_mode()`'s Doxygen to
  state the corrected LVGL-matching semantics — `scroll` reverses, `scroll_circular`
  wraps — and to record why (WO2 had wired the absorbed
  `u8g2gl_scrolling_label`'s continuous wrap onto `scroll` by mistake; the
  design spec's semantics table always specified reversing). Updated
  `is_scroll_finished()`'s doc to say neither marquee mode ever latches, since
  reversing is endless the same way wrapping is. Added one new private member,
  `scroll_forward_` (bool), documented and placed in the existing trailing
  bool group so no new padding is introduced. Updated the file-header
  `Purpose` block to mention WO2b.
- **`src/u8g2gl_label.cpp`**: `tick()`'s Step 5 now branches on `long_mode_`.
  `U8G2GL_LONG_SCROLL_CIRCULAR`'s branch is the original code, moved but not
  altered — same `message_width_ + 30` wrap gap, same `-w_` re-entry, same
  never-latches behaviour. `U8G2GL_LONG_SCROLL`'s new branch walks `scroll_x_`
  from `0` up to `scroll_max = message_width_ - w_` (the offset at which the
  text's far edge exactly reaches the widget's opposite bound), clamps and
  dwells there for `static_dwell_ms_` (reusing the existing property, no new
  schema surface), flips `scroll_forward_`, then walks back down to `0` and
  dwells again, indefinitely — `scroll_finished_` is never set by this path,
  matching `scroll_circular`'s "endless, so never finishes" contract.
  `reset_scroll()` now also resets `scroll_forward_ = true` so a rewound label
  always departs forward. `render_scroll()` needed no changes: it already
  draws at `x_ - scroll_x_`, which is correct for both the wrap range
  (`-w_..message_width_+30`) and the new bounce range (`0..scroll_max`).
- **`test/test_label.cpp`**: replaced `LabelScroll.WrapAroundSignalsFinished`
  (which asserted exactly the wrap-and-latch behaviour this work order
  removes from `scroll`) with `LabelScroll.ReversesAtFarEdgeAndReturnsToOrigin`,
  which drives the marquee to the far edge, asserts the offset there, asserts
  `is_scroll_finished()` stays `false`, then drives it through the dwell and
  back to the origin, asserting the offset genuinely decreases and returns to
  `10`. Added `LabelScroll.DwellsAtFarEndForStaticDwellMs` (asserts the tick
  that reaches the far edge reports `static_dwell_ms_`, not the usual
  per-pixel interval, and that position holds steady mid-dwell). Added
  `Label.ScrollAndScrollCircularAreObservablyDifferent`, run against both
  modes side by side with identical setup, asserting `scroll`'s offset stays
  bounded (`<= x_`) while `scroll_circular`'s goes past it after wrapping —
  this is the test the Objective's line item 1 required, so the two modes can
  never be silently collapsed again. Added `Label.ShortTextDoesNotScrollInEitherMode`,
  parameterised over both scrolling modes, confirming the no-scroll dwell path
  (Step 4) governs both and neither moves `scroll_x_`.

### Not touched

`scroll_circular`'s implementation and its two existing tests
(`LabelScrollCircular.WrapsWithoutSignalingFinished`,
`LabelScrollCircular.StillMarquees`) are byte-for-byte unchanged and pass
without modification, as required. No other widget, the style system, the
WO1/WO2 dirty-flag work, the CLI, or `docs/` were touched. The manifest XML's
`long_mode` property descriptions already read generically ("scroll and
scroll_circular marquee the text") and did not misstate wrap-vs-reverse
semantics, so `include/u8g2gl/manifests/u8g2gl_label.xml` needed no edit.

### is_scroll_finished() decision (line item explicitly requiring a stated choice)

WO2 latched `scroll_finished_ = true` for `long_mode="scroll"` on its first
wrap. Reversing has no equivalent "cycle complete" moment — it runs forever,
bouncing between the two ends — so I made it behave exactly as
`scroll_circular` already does: `is_scroll_finished()` always reports `false`
for the marquee itself under `U8G2GL_LONG_SCROLL` now, same as under
`U8G2GL_LONG_SCROLL_CIRCULAR`. This is a deliberate choice, not an oversight:
a message-rotation controller that was relying on WO2's old latch-on-wrap
signal for `scroll` will need to move to a fixed-duration rotation or to
`scroll_circular` plus its own timer — see Issue Surfacing below.

### Test counts

- **Before** (WO2 baseline, `git show HEAD:test/test_label.cpp`): **32 tests**
  in `test_label.cpp`.
- **After**: **35 tests** — `LabelScroll.WrapAroundSignalsFinished` was
  replaced by `LabelScroll.ReversesAtFarEdgeAndReturnsToOrigin` (net 0), and
  three new tests were added: `LabelScroll.DwellsAtFarEndForStaticDwellMs`,
  `Label.ScrollAndScrollCircularAreObservablyDifferent`, and
  `Label.ShortTextDoesNotScrollInEitherMode` (net +3). All 35 pass.
- Full project `ctest --test-dir build`: **210 tests, 100% pass** (one
  pre-existing, unrelated `SizeOfReport.ThirtyTwoBitTarget` skip, present
  before this work order too — it is gated on a 32-bit build that this host
  doesn't run).
- CLI: `npx vitest run` — **220 tests, 26 files, all pass**, untouched by this
  change (no CLI files were in scope).

### Measured sizeof(u8g2gl_label)

**80 bytes**, unchanged from WO2's baseline, on this 64-bit host
(`sizeof(u8g2gl_obj)` is 48 bytes on the same host). The new
`scroll_forward_` bool landed inside the existing trailing group of four
`bool` members with no new padding introduced — confirmed by
`test/test_label.cpp`'s `Label.SizeOf` (`RecordProperty` + `EXPECT_LE(...,
80u)`), which passed without needing its ceiling raised.

### Verification

- `cmake --build build` — clean, zero warnings under `-Wall -Wextra -Wpedantic`.
- `ctest --test-dir build` — 210/210 pass (1 pre-existing skip, unrelated).
- `cd cli && npx vitest run` — 220/220 pass.
- `git diff --stat` — touches only `include/u8g2gl/u8g2gl_label.h`,
  `src/u8g2gl_label.cpp`, `test/test_label.cpp`, and this `WORKORDER.md`.

### Issue Surfacing (not fixed, per instructions)

- **Behavioural break for any consumer relying on WO2's old `scroll`
  latch-on-wrap signal.** WO2's Completion Report (referenced in this
  WORKORDER's Background) noted `u8g2gl_scrolling_label`'s
  `is_scroll_finished()` was the signal `wd_scrolling_message_pool`-style
  controllers use to advance to the next message. That controller pattern, if
  it exists anywhere downstream targeting `long_mode="scroll"` specifically
  (as opposed to the always-was-non-latching `scroll_circular`), will now
  never see `is_scroll_finished()` become true for the marquee itself.
  Nothing in this WORKORDER's boundary box (`include/`, `src/`, `test/` for
  `u8g2gl_label` only) surfaced such a consumer, but I did not search outside
  it — the architect should confirm no in-tree or documented example wires a
  message-rotation controller to `scroll`'s old latching behaviour, and if one
  does, decide whether it should move to `scroll_circular` plus its own timer,
  or whether a rotation needs a different signal altogether.
- **No separate return-speed property was requested or added** —
  `scroll_px_per_sec` governs both directions, per the WORKORDER's explicit
  instruction not to add one. Flagging only because it is the one place a
  future request for "faster snap-back" would most likely land, and it should
  be a deliberate schema decision, not a reflexive addition.
