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

- [ ] `set_coords()`, `set_hidden()`, `set_disabled()` call `mark_dirty()`.
      Audit every other public mutator on `u8g2gl_obj` for the same omission and
      list what you found in your Completion Report, including the ones that were
      already correct.
- [ ] Add `set_x(int16_t)`, `set_y(int16_t)`, `set_w(int16_t)`, `set_h(int16_t)`,
      each marking dirty. [D-20] requires them: a `bind_width` observer receives
      one value and has nothing sensible to pass for the other three.
- [ ] **Keep `set_coords()`.** The generator's `init()` path emits one call rather
      than four, and committed generated output is read by humans.
- [ ] Consider marking dirty only when the value actually changes. If you do,
      say so and explain the reasoning in a why-comment — a redundant repaint is
      cheap, but a `set_x(x_)` in a tick loop that dirties every frame defeats
      §11.2's gate entirely.
- [ ] Doxygen on each new declaration, stating that it marks the frame dirty.
      That is a contract callers depend on, not an implementation detail.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_obj.h`, `src/u8g2gl_obj.cpp`,
`test/test_obj.cpp`, `test/test_core.cpp`, this WORKORDER.

**Do NOT touch:** the binding pool, the style system, any widget, the CLI,
`docs/`, any other `.agents/` file.

---

## Testing Requirement

- [ ] A test per mutator asserting the frame is dirty afterwards — `set_hidden`,
      `set_disabled`, `set_coords`, and each per-axis setter. These are the tests
      whose absence let the defect merge.
- [ ] A test that the imperative path repaints: clear the dirty flag, call
      `set_hidden(true)`, assert the frame gate would render.

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
