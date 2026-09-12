---
work_order: WO2
project: pr-3r-remediation
title: "Label long_mode absorbs u8g2gl_scrolling_label"
branch: u8g2gl-remediation/wo2-label-long-mode
base: wo1-dirty-geometry
complexity: standard
status: pending
---

# WO2 — Label long_mode absorbs u8g2gl_scrolling_label

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

**Branch**: `u8g2gl-remediation/wo2-label-long-mode`
**Base**: `u8g2gl-remediation/wo1-dirty-geometry`

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

Absorb `u8g2gl_scrolling_label` into `u8g2gl_label` as a `long_mode` property per
[D-19], and delete `truncate`, which it supersedes.

## Background

The two widgets were identical but for three properties, so six declarations were
maintained in two places. Overflow was expressed twice and inconsistently — as a
boolean on one widget, and as an entire second widget for the third behaviour.
LVGL's single `lv_label` with a `long_mode` enum is both the familiar model (§1.4)
and the correct one.

`truncate` lives on the **style**, not the label, so its removal is wider than it
looks.

## Added by the Principal Architect after WO1 — the same defect, eleven more times

WO1 fixed `mark_dirty()` on the geometry and flag mutators and **surfaced that the
style delegations have the identical omission**. Verified: `set_font()`
(`src/u8g2gl_obj.cpp:195`) calls `style_.set_font(font)` and returns. Changing a
font, colour, padding or alignment at runtime therefore produces no repaint.

This is folded into WO2 rather than given its own work order because WO2 already
owns these exact functions — it deletes `set_truncate` from the same delegation
block. Splitting them means editing the same lines twice, which is the reasoning
that merged R1.1 and R1.2.

- [ ] Every `u8g2gl_obj` style delegation calls `mark_dirty()`: `set_font`,
      `set_draw_color`, `set_invert`, `set_padding`, `set_border`, `set_radius`,
      `set_align`, `set_font_mode`, `set_bitmap_mode`. (`set_truncate` is deleted
      by this work order, so it needs no fix.)
- [ ] `apply_style()` likewise — it changes everything at once.
- [ ] `set_parent_index()` too. Its gap is latent rather than live, as
      `set_coords()`'s was, and the reason to fix it now is that WO1 established
      the rule and an exception nobody documented will read as an oversight.
- [ ] Use the **same change-guard pattern WO1 established** — early return when
      the value is unchanged, so a setter called every tick does not defeat
      §11.2's gate. Match it; do not invent a second idiom.
- [ ] A test per setter asserting the frame is dirty afterwards. These are the
      tests whose absence let the omission survive WO1's audit.

## Line-Item Instructions

- [ ] Add `long_mode` to `u8g2gl_label` with values `clip` (default), `dots`,
      `scroll`, `scroll_circular`. Use an enum with an **explicit `uint8_t` base
      type** — an untyped enum is `int`, which this codebase has already paid for
      once.
- [ ] Move the scrolling behaviour across unchanged. It is correct and tested; it
      is changing home, not meaning. The existing scrolling-label tests become
      label tests rather than being discarded.
- [ ] `wrap` is deliberately **not** offered — U8G2GL labels are single-line. Say
      so in the Doxygen where a reader arriving from LVGL will meet it, with the
      reason, not just the fact.
- [ ] Delete `u8g2gl_scrolling_label`: `include/u8g2gl/u8g2gl_scrolling_label.h`,
      `src/u8g2gl_scrolling_label.cpp`,
      `include/u8g2gl/manifests/u8g2gl_scrolling_label.xml`,
      `test/test_scrolling_label.cpp`, and its entries in `CMakeLists.txt` and
      `test/CMakeLists.txt`.
- [ ] Delete `truncate`: `u8g2gl_style.h:67` (member) and `:77` (setter),
      `src/u8g2gl_style.cpp:67,126,147`, the `u8g2gl_obj::set_truncate` forward at
      `src/u8g2gl_obj.cpp:162`, and its assertions in `test/test_style.cpp`.
- [ ] Update `include/u8g2gl/manifests/u8g2gl_label.xml` for `long_mode`.
- [ ] Update the `u8g2gl_label` budget in `test/test_sizeof_report.cpp`. [D-19]
      prices this at roughly +16 bytes, which matches the measured gap between
      `u8g2gl_label` (56 B) and `u8g2gl_scrolling_label` (72 B) on a 64-bit host.
      **Report the measured figure with its width** — do not restate the estimate.

## Strict Boundary Box

**In scope:** the label and scrolling-label sources and headers, the style
sources and headers, **all `u8g2gl_obj` style delegations plus `apply_style()`
and `set_parent_index()`**, the label and
scrolling-label manifests, the affected tests, both `CMakeLists.txt`, this
WORKORDER.

**Do NOT touch:** other widgets, the binding pool, the CLI, `docs/`.

---

## Testing Requirement

- [ ] Every existing scrolling-label behaviour has an equivalent label test under
      `long_mode="scroll"`. Behaviour must be provably unchanged — this is a move,
      and a move that quietly alters timing is a regression.
- [ ] `long_mode="clip"` is the default when the attribute is absent.
- [ ] `dots` and `scroll_circular` each have coverage.
- [ ] No test references `truncate` or `u8g2gl_scrolling_label` afterwards.

## Verification Requirement

- [ ] `cmake --build build` — zero warnings under `-Wall -Wextra -Wpedantic`
- [ ] `ctest --test-dir build` — all pass, none weakened or removed
- [ ] `cd cli && npx vitest run` — all pass
- [ ] `cd cli && npx tsc --noEmit && npm run lint` — zero errors
- [ ] `git diff` touches only files named in the Boundary Box

## Issue Surfacing

Record anything you find outside this checklist in your Completion Report. Do not
fix it, do not file an issue. The architect triages.

---

## Completion Report

<!-- Written by the worker at task completion -->
