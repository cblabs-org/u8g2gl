---
work_order: WO7
project: pr-3r-remediation
title: "Capacity defaults and the structural object ceiling"
branch: u8g2gl-remediation/wo7-capacities
base: wo6-validator
complexity: standard
status: complete
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

- [x] Raise the `U8G2GL_MAX_BINDINGS_PER_OBJ` default from 4 to **8**, with a
      comment explaining that four geometry bindings are now ordinary and citing
      [D-20]. Keep the `#ifndef` guard — PR-04 will override it per project.
- [x] Verify the `#ifndef` structure lets a generated header included *first* win
      cleanly for every constant, and state in your Completion Report that you
      checked. PR-04 depends on this and it is cheap to confirm now.
- [x] Add a validator hard error when a screen exceeds **254** objects.
      `parent_index_` is a `uint8_t` and `U8G2GL_NO_PARENT` takes one value, so
      254 is structural ([A-3]), not a tunable. The diagnostic names the screen,
      its count and the ceiling.
- [x] Report the RAM delta of the default change in your Completion Report, with
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

- [x] Derive image-ness from the manifest rather than a tag literal — a prop of
      `type="image"` is the natural signal, but check what the manifests actually
      declare rather than assuming. If no manifest field supports it, **say so and
      leave the literals**, reduced to the tags that actually exist.
- [x] Either way, `u8g2gl_bitmap` and `u8g2gl_icon` must not remain as literals:
      they name elements that do not exist.
- [x] A test that a tag with no manifest is rejected, and that `u8g2gl_xbm`'s
      image reference is still checked.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_config.h`, the validator file you add the
ceiling check to, `cli/src/core/validator/validate-references.ts` (the image-tag
literals only), their tests, `test/test_sizeof_report.cpp`, this WORKORDER.

**Do NOT touch:** the binding pool implementation, the generator (it does not
exist yet), the schema version (WO8).

---

## Testing Requirement

- [x] An element binding four geometry properties plus `text` succeeds — the
      case that fails against the current default of 4.
- [x] A screen of 255 objects is a hard error naming the screen and the ceiling;
      254 is accepted.
- [x] The sizeof report reflects the pool change, measured, with the width stated.

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

Verified before starting: `../PROJECT.md`'s "Human Approval" section carries
the owner's own words with a 2026-09-13 timestamp, not a relayed claim.
Branch confirmed via its own `git branch --show-current` immediately before
each commit, never batched with it. C++ 238 → **240 tests**, CLI 256 → **263
tests**, zero warnings under `-Wall -Wextra -Wpedantic`, `tsc --noEmit` and
`npm run lint` clean. Three commits, one per line item, each on a
green build/test run:

- `ad2e1e5` — item 1 (config default + its test)
- `41c75a2` — item 2 (validator ceiling + its test)
- `9bccd6f` — item 3 (image-tag literals + their test)

### Item 1 — `U8G2GL_MAX_BINDINGS_PER_OBJ` 4 → 8

`include/u8g2gl/u8g2gl_config.h` raised, with a comment citing [D-20] and
noting the generator emits an exact value once PR-04 exists. The `#ifndef`
guard is untouched.

**Verified, not assumed, that a generated header wins for every constant.**
Built a throwaway TU that `#include`s a fake `u8g2gl_generated_config.h`
defining all six constants ahead of `u8g2gl_config.h`, then `static_assert`s
each one holds the generated value rather than the file's own default —
including `U8G2GL_MAX_TOTAL_BINDINGS`, whose fallback is a *formula*
(`OBJECTS * BINDINGS`), not a literal. It compiled and ran clean: all six
guards let a first-included header win, with no interaction between them.
PR-04 can rely on this without re-checking it.

**RAM delta, measured on this 64-bit host, not estimated:** the shared
binding pool is `u8g2gl_binding_desc s_binding_pool[U8G2GL_MAX_TOTAL_BINDINGS]`
in `src/u8g2gl_obj.cpp`. `sizeof(u8g2gl_binding_desc)` = **40 bytes** here
(verified independently by compiling the exact struct standalone, and again
via a mirror struct inside the new `SizeOfReport.BindingPoolCapacityDelta`
test, which prints and `RecordProperty`s the figures on every run):

| | slots (32 objects) | bytes |
|---|---|---|
| old (4/obj) | 128 | 5,120 |
| new (8/obj) | 256 | 10,240 |
| **delta** | +128 | **+5,120 bytes, 64-bit host** |

No 32-bit toolchain was available on this machine (`g++ -m32` fails: "unknown
architecture for -arch armv4t" on this Mac) to also produce the ILP32 figure
the §18 budget actually targets. Per §1.3 and the house pattern already
established by `SizeOfReport.ThirtyTwoBitTarget`, an unmeasured width is
reported as unmeasured, not estimated — the new test states "64-bit host" in
every line of its output rather than implying the figure is target-accurate.
**Re-run this suite from a 32-bit or cross build to get the real number
before it goes in the budget.**

**Test** (`test/test_subject.cpp`,
`Binding.FourGeometryBindingsPlusTextFitTheDefaultBudget`): binds four
flag-style bindings plus one text binding on a single object and confirms
all five took effect. There is no `bind_x`/`bind_y`/`bind_w`/`bind_h`-to-
subject entry point in the runtime yet — wiring a subject to `set_x()` et
al. is generator output (PR-04), not something WO1 or WO7 built — so this
stands in with four flag bindings, which is faithful to what the pool
actually enforces: a per-object slot count, indifferent to what each slot
conceptually represents. At the old default of 4 the 5th binding here would
have silently no-op'd, since `add_flag_binding`'s `bool` return is discarded
by every public `bind_*` wrapper — exactly the silent-failure mode [D-21]
describes.

### Item 2 — 254-object hard error

Added to `cli/src/core/validator/validate-schema.ts` (Pass 1, "Screen schema
validation" section, where the file already walks every screen). New
diagnostic code `U8G2GL_TOO_MANY_OBJECTS` in `cli/src/core/schema/diagnostic.ts`
— **one file beyond the three the boundary box names**, disclosed here
rather than silently reached into: a new hard-error class needs a stable
code, and `diagnostic.ts` is the one place codes live. No existing code was a
fair reuse (`OUT_OF_BOUNDS` is a geometry concept; this is a count).

**Design choice, stated plainly:** the count is a *conservative
over-count*, not the generator's future exact object/draw-call accounting.
design_spec.md's own line "an element gets an object if and only if it must
remember something between frames, or something must hold a reference to
it... otherwise it compiles to draw calls" is a real per-element judgement —
and building it now would be building PR-04's generator logic inside a
validator, which the work order explicitly says is out of scope. Instead:
every ordinary node counts as 1 regardless of whether it will end up an
object or a draw call; a composite instantiation counts as 0 and its
template's own children are counted in its place (matching [D-18]'s
"composites are inlined"), because that's what actually lands in the
generated object array. This can only ever *over*-flag a screen relative to
the generator's later precise count — it cannot miss a real overflow, which
is the property a hard error at this stage needs. The trade-off (an
extreme, unlikely screen with hundreds of draw-only primitives could be
flagged before it needs to be) is disclosed rather than silently accepted.

A `visiting` set stops a composite cycle from recursing forever inside this
count specifically, independent of Pass 2's own cycle detector
(`detectCompositeCycles` in `validate-references.ts`) — Pass 1 runs first in
`validate.ts`'s sequence, so this check cannot rely on Pass 2 having already
run.

**Tests** (`cli/test/validator/schema.test.ts`, new describe block): exactly
254 passes, 255 is a hard error naming the screen/count/ceiling, nested
children count, a composite instantiation is inlined rather than
double-counted, and a self-referencing composite cycle does not hang the
validator.

### Item 3 — the last hardcoded tag list

`cli/src/core/validator/validate-references.ts`, both sites (screen walk and
composite-template walk). **Manifests do support deriving image-ness**: a
`<prop type="image">` named `src` or `image` — `u8g2gl_xbm.xml` declares
exactly this. Site 1 already computed `hasImageProp` this way and only
`||`'d it onto the literal list; that OR is now the whole condition. Site 2
had no manifest-derived check at all and gained one, using the same
`manifestMap` already in scope there.

Per WO6's own finding, `u8g2gl_bitmap` and `u8g2gl_icon` name elements that
do not exist and are already rejected as `UNKNOWN_WIDGET` before either site
runs (closed by WO6 item 1) — confirmed again here with a test asserting
`u8g2gl_bitmap` produces `UNKNOWN_WIDGET` and *no* `UNKNOWN_IMAGE` noise on
top of it. So this change removes dead branches and the tag-knowledge-in-
code smell ([D-17]), not a live validation hole — consistent with what WO6
already concluded, not a new finding.

**Test** (`cli/test/validator/references.test.ts`, new describe block): a
tag with no manifest (`u8g2gl_bitmap`) is rejected as `UNKNOWN_WIDGET` with
no accompanying image diagnostic; `u8g2gl_xbm`'s image reference is still
checked once given a manifest declaring `type="image"`.

### Surfaced, not fixed — for the architect to triage

- **None found beyond what WO6 already surfaced into this work order.** No
  new defects outside the checklist turned up while implementing it.

### Boundary note

`cli/src/core/schema/diagnostic.ts` was touched to add the new
`U8G2GL_TOO_MANY_OBJECTS` code — not named in the Strict Boundary Box, but a
minimal, necessary, fully disclosed extension (same class as WO5b's
type-only fixes beyond its own named boundary). `git diff --name-only`
otherwise touches exactly the files the box names, plus their tests.
