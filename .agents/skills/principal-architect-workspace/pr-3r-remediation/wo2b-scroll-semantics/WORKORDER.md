---
work_order: WO2b
project: pr-3r-remediation
title: "Reversing scroll — make long_mode=scroll match its specification"
branch: u8g2gl-remediation/wo2b-scroll-semantics
base: u8g2gl-remediation/wo2-label-long-mode
complexity: standard
status: pending
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
