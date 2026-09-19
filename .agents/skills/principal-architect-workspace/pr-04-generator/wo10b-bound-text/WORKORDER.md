---
work_order: WO10b
project: pr-04-generator
title: "Bound text reaches the label; Chief Architect emission rulings (ui_obj_, init order, relative bound positions)"
branch: u8g2gl-generator/wo10b-bound-text
base: u8g2gl-generator/wo11-editor-target
complexity: high
status: draft — PA revises against WO11's Completion Report before dispatch
---

# WO10b — Bound text reaches the label

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of PR-04 in
`../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **WO10b as approved by the
owner** ("WO10b — owner decision, 2026-09-19" under Human Approval); that the Chief Architect's
rulings are recorded ("Chief Architect rulings on CA-BRIDGE-2026-09-18"); and that this
WORKORDER's `status` is `dispatched`.
If any is missing, record it in the Completion Report and stop.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo10b-bound-text` · **Base**: `u8g2gl-generator/wo11-editor-target`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval — you cannot be answered,
and your work will strand uncommitted. Do not push or tag.

## Standards

`u8g2gl-standards` skill: `references/cpp.md`, `references/documentation.md`. **No heap.** Zero
warnings. Every mutator that changes what is drawn calls `mark_dirty()`, guarded on change.

## Design authority

design_spec §7.2, §8.4, §10, §11.3, §13.4, §13.5, §13.7, §13.8, §13.12 (as amended on `main` @
`ff20f0c`); `docs/decisions/d20-bindable-geometry.md` and its 2026-09-19 amendment. **Must land
before PR-04 is submitted** (owner, 2026-09-19). "Stop and report" means record it, do not choose,
continue with the remaining items.

---

## Objective

A label bound to a subject draws that subject's value. Today it draws nothing.

## Background — confirmed by the PA in merged code (PR-01/PR-03)

`u8g2gl_obj::bind_text(u8g2gl_subject_string_base*)` and the int overload register
`u8g2gl_on_text_binding_change` (`src/u8g2gl_obj.cpp:417`), whose comment says the widget "reads
the subject directly when it renders". But `u8g2gl_label::render()` draws only `text_`, which only
`set_text()` assigns, and nothing assigns it from the subject. The binding marks the frame dirty
and **nothing appears**. §13.12's `msg` and `bar_location` would be blank on a device. WO10's
generated fixture test is green only because it does not assert bound text.

## Root cause (stated by the PA — confirm or correct it in your report)

**Runtime.** Nothing reads the subject: the observer only marks dirty, and every label render path
reads `text_`. The generator emits `bind_text(&subject)` correctly and last. The new init order
(styles before properties) neither causes nor masks the defect, but it means an active binding must
take precedence over a literal `text`, whatever order the two were set in.

## Line-Item Instructions

### A. Bound text (the defect)

- [ ] **The label draws its bound subject at render time**, as the observer's comment already
      promises: a string subject's current value; an int subject formatted through its
      `bind_text_fmt` (default `%d` if none). A literal `text` still works when nothing is bound.
- [ ] **Where formatted text lives.** Prefer a stack buffer inside `render()` (no per-object RAM).
      `dots` and `scroll` modes need the text's width, which today is cached in
      `message_width_`: say how width is kept correct when the subject changes, and state the RAM
      and per-frame cost of your choice. Size the buffer from a documented constant, and truncate,
      never overflow.
- [ ] **Change marks dirty and re-measures.** A subject change must mark the frame dirty (it does)
      and invalidate any cached width, so scroll/dots stay correct.
- [ ] **An active binding wins over a literal `text`** in either set order (manifest: "Overridden
      when bind_text is active").
- [ ] **Acceptance tests, both of which must FAIL at the base** (Chief Architect):
      (1) **runtime:** bind a label to a string subject, set a value, render, and assert the text
      drawn *is that value*. If the U8G2 test double can't record drawn text, extend it in its
      existing idiom (WO11 added an ordered call log; use it). Never weaken the test;
      (2) **end to end:** the generated fixture with `bind_text` compiles, and its label draws the
      subject's text. Extend WO10's generated-fixture test to assert it.
      Also: changing the subject changes the drawn text; an int-bound label with
      `bind_text_fmt="%d°C"` draws the formatted value; `dots` on a long bound string truncates
      correctly. **Remove any "do not assert bound text" carve-out in WO11's parity test** and
      assert it on both targets.
- [ ] **Button too, if it shares the path.** `u8g2gl_button` declares `bind_text`; if its render has
      the same defect, fix it the same way and say so.

### B. Chief Architect rulings, 2026-09-19 (spec already on `main`)

- [ ] **Ruling 2 — every emitted object is `ui_obj_<name>`**, composite children
      `ui_obj_<instance>_<child>` (§13.4, §13.12). Through `mangle.ts`, the single naming
      authority; its collision table covers the new family. Regenerate the goldens, the committed
      firmware fixture and WO11's editor fixture **once**, and **say in the commit message** that
      the goldens change for this ruling. Bump nothing: goldens pin `0.0.0-golden`, and the CLI
      version bump is WO12's.
- [ ] **Ruling 3 — own attributes win over named styles** (§10). Emit init as construct → **apply
      styles → set properties** → bind → events → focus ring (§13.7), in the shared
      `emit/screen-model.ts` so both targets change together. Test: an element with `font=` and a
      style whose font differs ends with its own font; the same for an inline `style_*` override.
- [ ] **Ruling 1a — bound positions are container-relative** (§7.2, [D-20] amendment). Draw-call
      primitives: add the container's build-time device-absolute origin into the emitted bound
      argument (`origin + subject.get()`), through `emit/placement.ts` only.
- [ ] **Ruling 1b — object-backed elements (PA mechanism, PROJECT.md).** `bind_x(subject, int16_t
      origin)` and `bind_y(subject, int16_t origin)`: the observer applies `origin + value`,
      summed in 32 bits and clamped to int16_t as a sum. `bind_width` and `bind_height` are
      unchanged. In `u8g2gl_binding_desc`, make `ref_value` one named member of an anonymous union
      with `int16_t coord_origin`, with a comment saying which binding kind uses which. Update
      the manifests' `bind_x`/`bind_y` emission so the origin is emitted as a literal. Tests: a
      child of a container at x=40 bound to 5 is at 45; a screen-level element is at its value;
      the clamp holds at the int16_t edges.
- [ ] The editor registry's set-by-name for `bind_x`/`bind_y` carries the origin too, so the parity
      test covers the new argument.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_label.h`, `src/u8g2gl_label.cpp`, `include/u8g2gl/u8g2gl_button.h`,
`src/u8g2gl_button.cpp` (the same defect only), `include/u8g2gl/u8g2gl_obj.h` and
`src/u8g2gl_obj.cpp` (text-binding plumbing; `bind_x`/`bind_y` origin; the descriptor union),
`include/u8g2gl/u8g2gl_editor.h`/`src/u8g2gl_editor.cpp` (the origin only),
`include/u8g2gl/manifests/u8g2gl_obj.xml` and the bundled `cli/src/data/manifests.json` (the
`bind_x`/`bind_y` signature only), `cli/src/core/resolver/mangle.ts`, `cli/src/core/generator/emit/`
(naming, init order, bound origin), goldens and committed fixtures, `test/`, `cli/test/`, this
WORKORDER.

**Do NOT touch:** the validator (rulings 1c and 6 are WO11b's); `docs/`; `PROGRAM*.md`. Do not move
text binding off `u8g2gl_obj` (Q-10). Run every suite alone.

## Verification Requirement

- [ ] `cmake --build build` zero warnings; `ctest --test-dir build` all pass, including the
      real-U8G2 header target
- [ ] CLI `vitest`, `tsc`, lint clean
- [ ] Goldens and fixtures regenerate byte-identically from the committed generator after your change
- [ ] Diff limited to the Boundary Box

---

## Completion Report

*To be filled in by the worker.*
