---
work_order: WO7
project: pr-3r-remediation
title: "Capacity defaults and the structural object ceiling"
branch: u8g2gl-remediation/wo7-capacities
base: wo6-validator
complexity: standard
status: pending
---

# WO7 — Capacity defaults and the structural object ceiling

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

**Branch**: `u8g2gl-remediation/wo7-capacities`
**Base**: `u8g2gl-remediation/wo6-validator`

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

Take the runtime and validator half of [D-21]: make the hand-written defaults
survivable, and make the structural ceiling a hard error instead of a silent
runtime failure.

## Background

`U8G2GL_MAX_BINDINGS_PER_OBJ` is **4** (`u8g2gl_config.h:62`). [D-20] makes `x`,
`y`, `width` and `height` bindable, so an element binding all four geometry
properties has consumed its entire budget with nothing left for `text` or
`hidden`. That is not a tight fit — it is a ceiling the design's own examples
cross.

`U8G2GL_MAX_OBJECTS_PER_SCREEN` is 32, and [D-18] turns every composite into a
real object, so counts rise structurally.

Neither is validated, and `add_binding()` fails by returning `false` — a value
generated code can ignore. The result is a screen that compiles, links, boots and
silently fails to update one widget.

**The generator emitting exact capacities is PR-04's half of [D-21].** This work
order does not build that. It makes the defaults sane for hand-written use and
adds the ceiling the object model actually has.

## Line-Item Instructions

- [ ] Raise the `U8G2GL_MAX_BINDINGS_PER_OBJ` default from 4 to **8**, with a
      comment explaining that four geometry bindings are now ordinary and citing
      [D-20]. Keep the `#ifndef` guard — PR-04 will override it per project.
- [ ] Verify the `#ifndef` structure lets a generated header included *first* win
      cleanly for every constant, and state in your Completion Report that you
      checked. PR-04 depends on this and it is cheap to confirm now.
- [ ] Add a validator hard error when a screen exceeds **254** objects.
      `parent_index_` is a `uint8_t` and `U8G2GL_NO_PARENT` takes one value, so
      254 is structural ([A-3]), not a tunable. The diagnostic names the screen,
      its count and the ceiling.
- [ ] Report the RAM delta of the default change in your Completion Report, with
      the host width. Doubling a per-object pool is not free and §1.3 forbids
      claims the budget cannot substantiate.

## Added by the Principal Architect after WO6 — the last hardcoded tag list

`cli/src/core/validator/validate-references.ts` still tests
`node.tag === 'u8g2gl_bitmap' || node.tag === 'u8g2gl_xbm' || node.tag ===
'u8g2gl_icon'` at two sites (around lines 197 and 382) to decide whether a node
references an image. Of those three, **only `u8g2gl_xbm` has a manifest.**

WO6 surfaced this as "the same class of defect as `TIER1_PRIMITIVES`". Checked,
and it is milder than that: WO6's own first item already closed the phantom-tag
hole, so `<u8g2gl_bitmap>` and `<u8g2gl_icon>` now fail `UNKNOWN_WIDGET` before
these branches are reached. What remains is **dead branches plus the same
tag-knowledge-in-code smell**, not a live validation hole.

It is still worth closing here, because WO7 is the last work order before WO8's
integration pass and this is the last hardcoded element list in the CLI.

- [ ] Derive image-ness from the manifest rather than a tag literal — a prop of
      `type="image"` is the natural signal, but check what the manifests actually
      declare rather than assuming. If no manifest field supports it, **say so and
      leave the literals**, reduced to the tags that actually exist.
- [ ] Either way, `u8g2gl_bitmap` and `u8g2gl_icon` must not remain as literals:
      they name elements that do not exist.
- [ ] A test that a tag with no manifest is rejected, and that `u8g2gl_xbm`'s
      image reference is still checked.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_config.h`, the validator file you add the
ceiling check to, `cli/src/core/validator/validate-references.ts` (the image-tag
literals only), their tests, `test/test_sizeof_report.cpp`, this WORKORDER.

**Do NOT touch:** the binding pool implementation, the generator (it does not
exist yet), the schema version (WO8).

---

## Testing Requirement

- [ ] An element binding four geometry properties plus `text` succeeds — the
      case that fails against the current default of 4.
- [ ] A screen of 255 objects is a hard error naming the screen and the ceiling;
      254 is accepted.
- [ ] The sizeof report reflects the pool change, measured, with the width stated.

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
