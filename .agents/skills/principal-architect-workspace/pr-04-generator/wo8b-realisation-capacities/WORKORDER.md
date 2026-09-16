---
work_order: WO8b
project: pr-04-generator
title: "Realisation, flattening and generated capacities"
branch: u8g2gl-generator/wo8b-realisation-capacities
base: u8g2gl-generator/wo8a-one-pipeline
complexity: standard
status: complete
---

# WO8b — Realisation and capacities

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of
PR-04 in `../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **the WO8
split as approved by the owner**; and that this WORKORDER's `status` is `dispatched`. If any
is missing, record it in the Completion Report and stop.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo8b-realisation-capacities`
**Base**: `u8g2gl-generator/wo8a-one-pipeline`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill. Static capacities are generated, never guessed. Deterministic.

## Design authority

design_spec §13.3, §13.5, §18.1 on `main` @ `5f2574f`; [D-18] **and its 2026-09-13
amendment**; [D-21]. **"Stop and report" means record it, do not choose, continue with the
remaining items.**

---

## Objective

Decide, for every element in the whole document, whether it becomes an object or draw calls
and why; flatten to the object array; and count every capacity the runtime needs from what
was decided. WO8a's single pipeline supplies one expanded, resolved, mangled model — consume
it; do not expand, resolve or mangle again.

## What WO8a built, and two cautions

WO8a delivered `cli/src/core/resolver/pipeline.ts` and `cli/src/core/validator/shared-model.ts`:
one expansion and one screen resolution, shared by every validator pass and by `generate()`,
with mangling wired in and a test that counts expansions over the real `expandScreens`.
**Consume that model. Do not expand, resolve or mangle again**, and do not weaken the count
assertion — it has already caught a silent fallback where every pass built its own pipeline
and the suite stayed green.

- **"Resolve once" is true of screens, not templates.** Pass 6 still resolves a composite's
  own `<view>` separately, as WO7b requires so a template defect is reported once. Do not
  assume a composite template carries resolved geometry, and do not "fix" that here.
- **The pipeline is built for one target.** `ValidateInput.pipeline` carries a display
  obligation nothing enforces: pass the pipeline built for the target you are working on, and
  say in your report where that is threaded.

## Background — this is a whole-document analysis, not a predicate

Whether an instance needs an object depends on who binds to it, what focus ring names it,
what events it carries, and whether it is a composite or has children. None of that is local
to the element.

**The [D-18] amendment applies:** an element backed by a class is **always** an object for
now. Only `draw=`-only elements are realised as draw calls. The realisation pass still
evaluates and records every condition of the rule, so the reason reported is true and the
demotion can be switched on later without rewriting this pass.

## Line-Item Instructions

- [x] **Realisation decision per instance** with a reason code for each condition that held:
      class-backed (amendment), binding, event, focus-ring member, composite, has children,
      typed child pointer. Focus and events are modelled even though `generate` refuses them
      (PROJECT.md decision 1).
- [x] A **`draw=`-only element referenced by something that needs an object** (focus ring,
      event) is an error — it has no class to instantiate.
- [x] **Flatten** depth-first in document order: object array, `uint8_t` parent table,
      `U8G2GL_NO_PARENT` at view level (§13.3). Draw-call elements keep their position in draw
      order, interleaved with objects.
- [x] **Build-time ancestor visibility** for draw-call elements: the conjunction of
      ancestor-object hidden checks and the element's own bound flags (§13.5).
- [x] **Capacities ([D-21]):** objects on the busiest screen; bindings on the busiest object;
      total bindings as the **true sum**; styles. Count against WO2's invariant (one binding,
      one pool slot, one observer).
- [x] **Per-subject observer counts → `_n<N>`:** object bindings observing the subject, plus
      **one** frame-dirty observer if any draw-call element binds it (§13.5). String subjects
      also carry `max_len`. This is the PR-01 constraint nearly lost once — test it directly.
- [x] **Choose the binding overload by subject type (WO5a 4).** A binding name may appear once
      per subject type (`bind_text` for `string` and `int`). Record the declaration whose
      `type` matches the bound subject, so WO10 and WO11 emit from that choice rather than
      re-selecting by name.
- [x] The 254-object ceiling: the validator's conservative over-count stays; report whether
      the exact count now available disagrees with it, as a finding.

## Strict Boundary Box

**In scope:** new `cli/src/core/generator/realise/` (or equivalent) and the flattened model
type; `cli/src/core/generator/` wiring to consume WO8a's pipeline result;
`cli/src/core/schema/diagnostic.ts` (new codes only); `cli/test/`; this WORKORDER.

**Do NOT touch:** emission (WO9+); the validator passes (report the ceiling question instead);
runtime; manifests; `docs/`.

---

## Testing Requirement

- [x] §13.12 example: `rule` is draw calls; `bar`, `bar_location`, `bar_wifi_icon`,
      `bar_clock`, `msg` are objects, in that array order, with parents
      `NO_PARENT, 0, 0, 0, NO_PARENT`.
- [x] A static label with no references is still an object, with the class-backed reason
      (amendment).
- [x] Two draw-call elements and one object bound to the same subject: observer count 2 (one
      object binding + one frame-dirty).
- [x] Total bindings equals the sum, not objects × max.
- [x] A `bind_text` to an int subject records the int declaration, not the string one.

## Verification Requirement

- [x] CLI tests, `tsc`, lint clean; C++ unchanged and green
- [x] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Worker:** Tier-3, 2026-09-16. **Status `complete`.** Not pushed.

### Authorization

Checked from committed files, not from the dispatch prompt:

- This WORKORDER's front matter: `project: pr-04-generator`, `status: dispatched` (as read).
- `../PROJECT.md` "Human Approval" quotes the owner, *"Approved — proceed with the twelve work
  orders, start WO1"*, recorded at `2026-09-13T19:59:36Z`.
- `../PROJECT.md` "Owner approval — WO8 split, 2026-09-16" quotes the owner, *"And yes split
  WO8 is fine."*, and the status log's 2026-09-16 entry records WO8b dispatched on this branch.

Nothing missing or inconsistent.

### Test counts

| Suite | Before (`5a52231`) | After |
|---|---|---|
| `npx vitest run` | 669, 44 files | **694**, 45 files, all pass |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` (eslint + test type-check) | clean | clean |
| `cmake --build build` warnings | 0 | 0 (no C++ touched) |
| `ctest --test-dir build` | 305, 1 known skip | 305, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |

New tests: `cli/test/generator/realise.test.ts` (25). No existing test changed.

**Run against the base — and it is weaker evidence than the count suggests.** A throwaway
worktree at `5a52231` under `tmp/`, with the test file copied in: **25 of 25 fail**. But
**23 of them fail with `realiseScreens is not a function`** — the module simply does not exist
there — which proves only that the code is new, not that any assertion discriminates
behaviour. Only the two `generate()` wiring tests fail *behaviourally*: at the base a screen
whose `<u8g2gl_box>` contains a child is generated happily (six files written) instead of
being refused, and `GenerateResult` carries no `realised`. Recorded this way rather than as
"25 fail at the base", because the honest figure for behavioural discrimination is 2. The
suite's value is as a forward pin on §13.12's array, the reason codes and the observer
arithmetic; those cannot fail at a base that has no realisation at all. The worktree is
removed.

### The realisation model's shape, and every reason code

`cli/src/core/generator/realise/`, four files: `model.ts` (shapes, no logic), `realise.ts`
(the analysis), `capacities.ts` (the counting), `index.ts`.

A `RealisedElement` carries the expanded element, its §13.4 identifier, its `realisation`
(`'object' | 'draw_calls'`), **every** reason that held, `requiredByRule`, its bindings with
the overload already chosen, its `objectIndex`, its `parentIndex`, a draw-call element's
`visibility`, and its children in document order.

The seven reason codes, reported in one fixed order (`REALISATION_REASONS`, so two runs agree
— §13.9):

| Reason | Holds when | Can fire in PR-04? |
|---|---|---|
| `class_backed` | the manifest declares a C++ class (`!isDrawingElement(declared)`) | yes |
| `binding` | it binds a subject **and** its class is the thing that must observe it | yes |
| `event` | it carries an `<event_cb>` / navigation event child | modelled; PR-09 refuses |
| `focus_ring_member` | the screen's `<focus_ring>` names it | modelled; PR-09 refuses |
| `composite` | its manifest carries a `<view>` | yes |
| `has_children` | anything is nested inside it | yes |
| `typed_child_pointer` | its enclosing composite declares a C++ class of its own | modelled; PR-08 refuses |

`binding` is a **conjunction**, exactly as §13.5 writes it: a drawing element compiles the
binding into its draw call, so the reason does not hold there. Pinned by a test that puts a
`bind_text` label and a `bind_width` box side by side and asserts the box's reasons are empty
while its binding is still recorded.

**The amendment is applied at the outcome only.** `realisation` is the interim answer (a
class-backed element is always an object); `requiredByRule` is the unamended one — whether any
reason other than `class_backed` held. A static label with no references is
`realisation: 'object'`, `reasons: ['class_backed']`, `requiredByRule: false`: exactly the
element the amendment is paying for, and the field §18 needs to state that classed-element
demotion is not yet delivered ([D-18] amendment). Switching demotion on later changes the
outcome, not this analysis.

### How the whole-document conditions are gathered

None of the seven is readable from the element alone, which is why this is one pass over the
expanded tree rather than a predicate:

- **the screen** supplies the focus ring. Entries are matched against elements written *in the
  screen* (`instantiation.length === 0`), which is exactly what Pass 2 checks them against —
  so realisation and the validator cannot disagree about what a focus entry names;
- **the element's own directives** supply events and flag bindings;
- **its manifest** supplies the class and the `<view>`;
- **its position in the expanded tree** supplies `has_children` and `typed_child_pointer` —
  the latter from its *parent* expanded element, read from the **declared** manifest, since the
  registry gives every composite `u8g2gl_obj` as a base and only a declared `extends` means the
  author wrote a class.

### The `draw=`-only refusal

New code `U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT`. The WORKORDER names focus ring and event; the
implementation refuses on **any** forcing reason (adding `has_children` and
`typed_child_pointer`), because §13.5 is one rule and those two conditions require an object
just as literally. A binding is deliberately excluded. The message names the element and which
condition created the requirement.

### What the flattened model contains

Per screen: `objects` (index = emission order = draw order), `parents` (parallel, `uint8_t`
values with `U8G2GL_NO_PARENT` = 255 at view level), `drawOrder` (every element, objects and
draw calls interleaved in document order), and `elements` (the tree shape preserved).

Indices are taken **pre-order**, before recursing, so a container precedes its children exactly
as §13.12 prints. `parentIndex` is the nearest *object* ancestor, so a draw-call element never
appears in the parent table but still records the object it is measured and hidden against.

**Build-time ancestor visibility** for draw-call elements: `visibility` is the conjunction of
each ancestor object's hidden check (outermost first) and the element's own `hidden` bound
flags — §13.5's `if (!bar.is_hidden() && ui_subject_wifi.value)`. The terms are structural
(`ancestor_visible` / `flag_clear`), not C++ text, because WO11's editor target spells the same
terms differently ([UD-4]) and this work order emits nothing.

### Capacity figures for the §13.12 fixture, and how each is counted

The fixture is §13.12's worked example reproduced whole, against its 256×64 target.

| Capacity | Value | Counted as |
|---|---|---|
| objects, busiest screen | **5** (`home`) | `bar`, `bar_location`, `bar_wifi_icon`, `bar_clock`, `msg`; `rule` has no object |
| bindings, busiest object | **1** | no object in this fixture binds twice |
| bindings, total | **4** | `bar_location` `bind_text`, `bar_wifi_icon` `bind_flag_if_eq`, `bar_clock` `bind_time`, `msg` `bind_text` |
| styles | **1** | `header` |

Every figure counts against **WO2's invariant — one binding, one pool slot, one observer** —
which a runtime test holds all thirteen binding methods to. So an object's binding count is
simply the number of bindings it declares (one `bind_*` attribute naming a subject, or one
`<bind_flag_if_*>` child, is one `add_binding()`), and:

- the **composite container binds nothing**, so it costs an object but no slot;
- a **draw-call element contributes no binding at all** — it registers nothing on any object,
  because it has no object. Its bindings cost only the subject's frame-dirty observer.

Total is the **true sum**, never `objects × max`: here 4, where the product would be 5. Pinned
by a separate test whose numbers cannot coincide — one object with three bindings, one with
one, one with none: sum 4, product 9.

`styles` is the count of distinct style *identifiers* (globals, then each screen's local ones,
deduplicated by name), keyed the way `mangle.ts` keys them so a screen style overriding a
global is one `ui_style_<name>` and one pool slot, not two.

### Per-subject observer counts, and the test that pins them

For each declared subject, in declaration order: `observers = objectBindings + (frameDirty ? 1
: 0)`, where `objectBindings` counts bindings on **objects** across every screen, and
`frameDirty` is true if **any** draw-call element binds it — contributing **exactly one**
observer however many such elements there are, and however many screens they sit on (§13.5:
the observer marks the frame, not the widget). String subjects carry `maxLen` through.

The parts are reported separately, not just the total, because the frame-dirty observer is the
one that has been lost before and it is invisible in a sum.

Tested directly, as instructed, by three tests rather than one:

- two draw-call boxes **and** one object label all bound to `level` → `objectBindings: 1`,
  `frameDirty: true`, **`observers: 2`**, and `totalBindings: 1` (only the object's binding
  takes a slot);
- two objects and no draw-call element → `observers: 2`, `frameDirty: false` — so the
  frame-dirty term is not a constant that happens to fit;
- two draw-call elements and **no** object → `observers: 1`, `totalBindings: 0` — the case
  where forgetting the frame-dirty observer would generate a subject with zero capacity and
  silently drop both bindings at runtime.

### How the binding overload is chosen

`bindingsOf` groups the effective manifest's `<bind>` entries by attribute name in
first-declaration order, then picks the overload whose declared `type` equals the bound
subject's type, recording it as `RealisedBinding.declaration`. WO10 and WO11 emit from that
choice instead of re-selecting by name (WO5a finding 4). The test is non-vacuous by
construction: `u8g2gl_obj` declares `bind_text` `string` **before** `int`, so a name-only
lookup returns the string overload; the test binds an `int` subject and asserts
`declaration.type === 'int'`, with the string case beside it as the control.

A subject whose type no overload accepts records no declaration — that is Pass 5's
`U8G2GL_TYPE_MISMATCH`, which refuses the build before emission.

### Where the per-target pipeline is threaded

`generate()` builds **one** `createScreenPipeline` for the display of the target it is
building (Step 2), hands that same pipeline to `checkProject` → `validate` (Step 3), and hands
`pipeline.expansion` to `realiseScreens` (new Step 4). One pipeline, one target, three
consumers. Realisation never calls `expandScreens`, `resolveElements` or `mangleIdentifiers` —
it consumes identifiers and the expanded tree as given, so WO8a's expansion-count test is
untouched and still passes.

WO8a's caution 1 was heeded rather than assumed away: Pass 6 does still resolve composite
templates separately, and realisation deliberately reads **only** `expansion.screens`, so that
second resolution is not in its path at all.

Results are carried on `GenerateResult` as `realised` and `capacities`, beside the existing
`resolved`, for WO9/WO10 to emit from. **Nothing is emitted here.**

### The 254-object ceiling — the exact count *does* disagree, and dangerously

The line item asked whether the exact count now disagrees with the validator's conservative
one. It does, and **not only in the safe direction.**

`countScreenObjects` (`validate-schema.ts`) does not count a composite instance at all — it
recurses into the template and counts the children in its place — and it *does* count every
`draw=`-only element. Under [D-18] both are now wrong: a composite **is** a real container
object, and a drawing element consumes no slot. So the conservative count can be **lower** than
the exact one, and its own doc comment's claim that it "can only over-flag a screen … it can
never miss a real overflow" no longer holds.

Verified empirically, not by reading: a screen of 128 instances of a one-child composite gives

```
validator TOO_MANY_OBJECTS: 0 (none)
exact object count        : 256      (structural ceiling 254)
```

A screen that overflows the `uint8_t` parent table passes `validate` today. Recorded as
finding 1 below and **not fixed** — `validate-schema.ts` is outside the Boundary Box, which
told me to keep the conservative count and report instead.

### Decisions I made

1. **A binding on a drawing element does not hold the `binding` reason.** §13.5 states the
   condition as a conjunction ("**and** its class is the thing that must observe the subject")
   and says a drawing element compiles the binding into its call instead. Read from the spec,
   not chosen.
2. **`typed_child_pointer` is restricted to a *direct* child** of a composite instance whose
   declared manifest has `extends`. A deeper element is reached through its own parent, not
   through the composite, so a broader rule would report a reason that is not true.
3. **The `draw=`-only refusal covers every forcing condition**, not only the focus ring and
   event the WORKORDER names (see above).
4. **Realisation carries no geometry.** `resolved` and `realised` are two views of one expanded
   tree in one order; duplicating coordinates into the realised model would create a second
   place for them to disagree.
5. **An unknown tag realises as draw calls with no reasons**, and raises nothing. Pass 2 already
   refuses the build, and inventing an answer here would only add a second diagnostic for one
   defect.
6. **`styles` counts distinct identifiers**, keyed as `mangle.ts` keys them (reasoning above).

### Spec disagreements (recorded, not chosen)

None found between this WORKORDER and §13.3, §13.5, §18.1, [D-18] with its amendment, or
[D-21]. The one place the WORKORDER is *narrower* than the spec — the `draw=`-only refusal
listing only focus ring and event — is recorded as decision 3 rather than treated as a
conflict, since refusing the superset is what §13.5's single rule requires.

### Out-of-scope findings (not fixed, not filed)

1. **The validator's object ceiling can be missed entirely** (evidence above): 128 composite
   instances → 256 exact objects, 254 ceiling, **zero** diagnostics. `countScreenObjects` omits
   composite containers and counts drawing elements, both inverted by [D-18]. The exact count
   is now available and is what `parent_index_` actually has to hold. **The comment in
   `validate-schema.ts` asserting it can never miss an overflow should not be left standing.**
2. **`U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT` is a `generate`-only error.** Realisation runs inside
   `generate()`, and the validator passes are outside this box, so `validate` reports nothing
   for a document `generate` refuses — precisely the journey split PROJECT.md's sharing section
   exists to prevent. It wants a Pass 9 over the realised model, or realisation moved behind
   `validate`; both are the PA's call.
3. **WO8a finding 6 is inherited, still unenforced.** `generate()` passes one pipeline to both
   validation and realisation, so the display obligation is met at the only call site that
   matters — but nothing in the types stops a future caller realising a pipeline built for a
   different target than the one being emitted, and realisation would then count capacities for
   the wrong display.
4. **A focus ring cannot name a composite child.** Entries match screen-level names (Pass 2's
   rule, which realisation follows), so `<entry name="bar_location" />` is already
   `UNKNOWN_WIDGET`. PR-09 will have to decide whether focus entries may name mangled
   identifiers; recording it now because realisation's `focus_ring_member` inherits whichever
   answer is given.
5. **Every class-backed element inherits `bind_text` and the four geometry bindings** from
   `u8g2gl_obj.xml`, so realisation records a `bind_text` binding on elements that have no text
   to bind. This is WO2's W2 / **Q-10**, already deferred by the Chief Architect; noted only
   because the capacity counts inherit it — a pool slot is counted wherever such an attribute is
   actually written, which is correct, but the *acceptance* of it is Q-10's.

### Diff boundary

`git diff --name-only 5a52231..HEAD`:

- `cli/src/core/generator/realise/model.ts`, `realise.ts`, `capacities.ts`, `index.ts` (all new)
- `cli/src/core/generator/generate.ts` (pipeline consumption, `realised`/`capacities` on the result)
- `cli/src/core/generator/index.ts` (re-export)
- `cli/src/core/schema/diagnostic.ts` (one new code)
- `cli/test/generator/realise.test.ts` (new)
- this WORKORDER

Untouched: the validator passes, runtime C++, `extern/`, manifests, `docs/`, `PROGRAM*.md`,
`cli/src/node/`, and all emission (WO9+). No existing test was changed or weakened — WO8a's
expansion-count test included.
