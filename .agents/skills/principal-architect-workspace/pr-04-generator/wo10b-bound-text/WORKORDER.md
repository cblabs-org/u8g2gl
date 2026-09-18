---
work_order: WO10b
project: pr-04-generator
title: "Bound text reaches the label (runtime)"
branch: u8g2gl-generator/wo10b-bound-text
base: u8g2gl-generator/wo11-editor-target
complexity: standard
status: draft — PA revises against WO11's Completion Report before dispatch
---

# WO10b — Bound text reaches the label

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of PR-04 in
`../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **WO10b as approved by the
owner** ("Owner approval — WO10b and WO11b"); and that this WORKORDER's `status` is `dispatched`.
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

design_spec §8.4, §11.3, §13.5, §13.8, §13.12. "Stop and report" means record it, do not choose,
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

## Line-Item Instructions

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
- [ ] **Tests that fail at the base:** a string-bound label draws the subject's value; changing the
      subject changes the drawn text; an int-bound label with `bind_text_fmt="%d°C"` draws the
      formatted value; `dots` mode on a long bound string truncates correctly. Extend WO10's
      generated fixture test to assert `msg`'s bound text appears in the stub's draw history.
- [ ] **Button too, if it shares the path.** `u8g2gl_button` declares `bind_text`; if its render has
      the same defect, fix it the same way and say so.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_label.h`, `src/u8g2gl_label.cpp`, `include/u8g2gl/u8g2gl_button.h`,
`src/u8g2gl_button.cpp` (the same defect only), `src/u8g2gl_obj.cpp` (text-binding plumbing only),
`test/` (tests and the generated fixture's C++ test), this WORKORDER.

**Do NOT touch:** the CLI or generator; manifests; `docs/`; `PROGRAM*.md`. Do not move text binding
off `u8g2gl_obj` (Q-10). Run every suite alone.

## Verification Requirement

- [ ] `cmake --build build` zero warnings; `ctest --test-dir build` all pass, including the
      real-U8G2 header target
- [ ] CLI suite unchanged and green
- [ ] Diff limited to the Boundary Box

---

## Completion Report

*To be filled in by the worker.*
