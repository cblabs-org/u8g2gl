---
work_order: WO2
project: pr-04-generator
title: "Manifest ↔ runtime parity: every manifest target exists with the right shape"
branch: u8g2gl-generator/wo2-manifest-parity
base: u8g2gl-generator/wo1-manifest-registry
complexity: standard
status: complete
---

# WO2 — Manifest ↔ runtime parity

## Authorization

Part of PR-04 (`pr-04-generator`). Before starting, verify the human's approval
is recorded in `../PROJECT.md` under "Human Approval" — the owner's own words with
a timestamp. If it is absent or a placeholder, **stop and report**. Also confirm
this WORKORDER's `status` is `dispatched`; a `draft` has not been revised against
its predecessor and must not be executed.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo2-manifest-parity`
**Base**: `u8g2gl-generator/wo1-manifest-registry`

Verify with `git branch --show-current` **as its own command immediately before
every commit**, never batched with the commit.

## COMMIT ON A GREEN BUILD

You are authorized to commit on a green build. Do NOT stop to ask for approval —
you cannot be answered, and your work will strand uncommitted.

## Standards

Invoke the `u8g2gl-standards` skill before writing code; read `references/cpp.md`
and `references/typescript.md`. Every mutator that changes what is drawn calls
`mark_dirty()`, guarded on the value changing (the house pattern from PR-3R WO1).
Zero warnings. No heap.

## Design authority

`docs/design_spec.md` is normative — §6.3, §8, §13.1, §13.8. Where this work
order and the spec disagree, **stop and report**.

---

## Objective

The generator will emit a call for every `setter=`, `draw=` and `<bind setter=>`
in every manifest. Prove each one exists with the shape the generator will assume,
and repair the ones that do not.

## Background

- `u8g2gl_clock.xml` declares `<bind name="bind_time" type="int" setter="bind_time" />`.
  No `bind_time` exists in `include/` or `src/`, and the type should be `time`
  (`u8g2gl_subject_time` exists). §13.12's worked example calls it.
- `bind_value` on `u8g2gl_progress_bar.xml` and `u8g2gl_switch.xml` — the same:
  declared, not implemented.
- `manifest-crosstest.test.ts` checks only that `draw=` names a declared function.
  It never checked `<prop setter=>` or `<bind setter=>`, which is how these shipped.
- The generator will pass a drawing element's props to its `draw=` function **in
  manifest declaration order** (WO1 pins that order). Nothing verifies the header
  agrees.

**PA decision recorded in PROJECT.md:** `bind_time` is **implemented**, not
refused.

## Line-Item Instructions

- [x] **Cross-test: `<prop setter=>`.** Parse the class headers along the
      effective `extends` chain (use WO1's registry) and assert each setter is a
      declared public method. Self-check the extractor is not vacuous.
- [x] **Cross-test: `<bind setter=>`.** Same, for every binding — the check the
      Chief Architect directed.
- [x] **Cross-test: `draw=` shape.** For each drawing element, the draw function's
      parameters after `U8G2&` match the manifest's `draw=` props in count and
      declaration order, by name.
- [x] **Cross-test: bind types.** Every `<bind type=>` is a subject type
      (`int|string|bool|time`).
- [x] **Implement `u8g2gl_clock::bind_time(u8g2gl_subject_time_base*)`** and retype
      the manifest to `time`.
- [x] **Implement `bind_value`** on the progress bar and the switch against the
      subject types their manifests declare.
- [x] **One binding, one slot, one observer.** Every object binding method —
      existing and new — consumes exactly one `s_binding_pool` slot and one subject
      observer slot, and returns `false` on exhaustion. Add a runtime test per
      binding method asserting both. WO8 counts capacities against this invariant;
      if an existing method violates it, fix the method, not the invariant.
- [x] Fix any further mismatch the new cross-tests expose **in manifests or by
      adding a missing runtime method**. If a mismatch needs a design choice (a
      manifest naming behaviour the class cannot sensibly have), **stop and
      report** it rather than choosing.

## Added by the Principal Architect after WO1

WO1 built the manifest registry (`cli/src/core/manifest/`) that resolves
`extends`, and surfaced three findings that belong here. Use the registry's
effective manifests for every cross-test above rather than re-walking `extends`
yourself — a second walk is exactly the duplication this PR is avoiding.

- [x] **F1 — base-object manifest carries label-only props.**
      `include/u8g2gl/manifests/u8g2gl_obj.xml` declares `font`, `align`,
      `bind_text`, `bind_text_int` (and `bind_text_fmt` via `fmt`). Now that
      `extends` resolves, every element inheriting the base accepts them. Move
      each declaration to the manifests of the classes that actually implement it.
      **Decide membership from the C++, not from intent:** a prop belongs on
      `u8g2gl_obj.xml` only if `u8g2gl_obj` itself declares the setter. The
      setter cross-test is the proof. Record what moved where.
- [x] **F2 — make the implicit `extends` default explicit.** The parser
      (`parse-widget-manifest.ts`) fills a missing `extends` with `u8g2gl_obj`, so
      the schema pass's "Missing required attribute 'extends'" can never fire and
      a genuine self-extends cannot be told apart. **PA decision:** remove the
      parser default; the registry applies it instead, **only to a manifest with a
      `<view>`** (a composite realises as `u8g2gl_obj`, design_spec §13.12). A plain
      widget without `extends` then produces the existing schema error. Add a test
      for each branch; keep WO1's self-extends-as-root handling only if the
      framework's own `u8g2gl_obj.xml` still needs it, and say which.
- [x] **F10 — tests must not run a stale build.** `cli/test/integration/` runs
      `dist/node/cli.js`, and nothing rebuilds it before `vitest run`, so a stale
      `dist/` silently tests old code. Make the test run build first (a `pretest`
      script or a vitest `globalSetup`), whichever keeps `npx vitest run` honest
      for a worker who never ran `npm run build`.

## Strict Boundary Box

**In scope:** `cli/test/manifests/manifest-crosstest.test.ts` (and helpers beside
it); `include/u8g2gl/manifests/*.xml` (setter, type and bind corrections, and F1's
moves); `cli/src/core/parser/parse-widget-manifest.ts` and
`cli/src/core/manifest/` (F2 only); `cli/package.json` / `cli/vitest.config.ts`
(F10 only); tests affected by F1/F2;
`include/u8g2gl/u8g2gl_clock.h`, `u8g2gl_progress_bar.h`, `u8g2gl_switch.h`,
`u8g2gl_obj.h` and their `src/` counterparts (binding methods only);
`cli/src/data/manifests.json` (rebuilt); `test/` C++ tests; this WORKORDER.

**Do NOT touch:** geometry bindings (`bind_x` etc.) — WO3; the validator — WO3;
the render path or version header — WO4; schema vocabulary (no new manifest
attributes — owner decision).

---

## Testing Requirement

- [ ] Each new cross-test fails against WO1's tip for at least one real manifest
      (bind setters certainly), then passes.
- [x] Clock renders a bound time subject; progress bar and switch update from a
      bound subject and mark dirty.
- [x] Pool/observer invariant tested per binding method, including exhaustion.

## Verification Requirement

- [x] `cmake --build build` — zero warnings under `-Wall -Wextra -Wpedantic`
- [x] `ctest --test-dir build` — all pass
- [x] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean
- [x] `git diff --name-only` limited to the Boundary Box

## Issue Surfacing

Record anything outside this checklist in your Completion Report. Do not fix it,
do not file issues.

---

## Completion Report

**Worker:** Tier-3, 2026-09-13. Branch `u8g2gl-generator/wo2-manifest-parity`,
not pushed. **Commits:** `33cd27b` (runtime bindings and invariant tests),
`0257d57` (cross-tests, F2, F10), plus this report.

### Authorization

I checked the committed files, not the dispatch prompt. The front matter names
`project: pr-04-generator` and was `status: dispatched`. In `../PROJECT.md`,
"Human Approval" quotes the owner, *"Approved — proceed with the twelve work
orders, start WO1"*, recorded at `2026-09-13T19:59:36Z`. The status log records
WO2 as "revised and dispatched". Nothing was inconsistent.

### Test counts

| Suite | Before (`277641c`) | After |
|---|---|---|
| `cmake --build build` warnings | 0 | **0** |
| `ctest --test-dir build` | 240 pass, 1 known skip | **260 pass**, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |
| `npx vitest run` | 293 tests, 29 files | **383 tests**, 29 files, all pass |
| `npx tsc --noEmit`, `npm run lint` | clean | clean |

No existing test was weakened. Existing tests changed:
- `manifest-crosstest.test.ts`: rewritten; the original per-file checks are kept.
- `manifest-registry.test.ts`: one test renamed ("…as a root when no u8g2gl_obj
  is registered"), same assertions; one comment updated.

### Per line item

- **Cross-tests** (`cli/test/manifests/manifest-crosstest.test.ts`). They read
  the header surface through a new test-only extractor,
  `cli/test/manifests/cpp-header.ts`. `extends` is resolved by WO1's registry
  (`buildManifestRegistry` over `parseFrameworkManifests`), fed from the
  manifests on disk so a manifest edit is checked before the bundle is rebuilt.
  Nothing re-walks `extends`.
  - **`<prop setter=>`:** every setter must be a public method on some class
    along the effective `chain`. A class that declares its own setter props
    must also have `<tag>.h` declaring it.
  - **`<bind setter=>`:** stricter than name-only. There must be a public
    overload named `setter` whose first parameter is
    `u8g2gl_subject_<type>_base*`. This is what catches `bind_time` typed
    `int`.
  - **`draw=` shape:** all of an element's `draw=` props name one function. That
    function's first parameter is `U8G2&`, and the rest match the `draw=` props
    by name, count and order. Checked in two orders: see "draw= argument order"
    below.
  - **Bind types:** every `<bind type=>` is in the set of
    `u8g2gl_subject_<t>_base` classes read out of `u8g2gl_subject.h`.
  - **Self-checks, so no check is vacuous:** the manifest directory is non-empty;
    registry and parse diagnostics are empty; `u8g2gl_draw_box`'s parameters are
    extracted by name. On `u8g2gl_obj` the extractor sees `set_coords(x,y,w,h)`
    but not the private `add_flag_binding` or protected `add_value_binding`. A
    synthetic header exercises default-private access, re-opened sections, an
    inline body with nested braces, a commented-out declaration and a default
    argument. Subject types are exactly `int,string,bool,time` (§8.1).
- **`bind_time`:** `u8g2gl_clock::bind_time(u8g2gl_subject_time_base*)`, and
  `u8g2gl_clock.xml`'s bind retyped from `int` to `time`.
- **`bind_value`:**
  - `u8g2gl_progress_bar::bind_value(u8g2gl_subject_int_base*)`
  - `u8g2gl_switch::bind_value(u8g2gl_subject_bool_base*)`
  - Both match their manifests' declared `int` / `bool`.
- **Shared mechanism.** A new protected
  `u8g2gl_obj::add_value_binding(void* subject, u8g2gl_subject_type_t, u8g2gl_observer_cb)`,
  plus protected static `binding_object()` / `binding_subject()`.
  - It claims one pool slot, registers one observer, rolls the slot back if the
    subject is full, and invokes the widget's callback once so the current value
    shows on the first frame.
  - The subject holds the pool slot, not the widget, so a notification after
    destruction hits an inactive slot (tested).
  - Each widget's callback is a private static member that applies the value
    through the widget's own guarded setter.
  - The progress bar clamps in `int32_t` before narrowing, and guards on the
    target changing, because `set_value()` itself marks dirty unconditionally.
  - No heap, no new per-object members, no virtuals.
- **One binding, one slot, one observer.**
  - All 10 existing `u8g2gl_obj` binding methods (`bind_text` ×2,
    `bind_flag_if_*` ×8) were `void` and discarded exhaustion. They now return
    `bool`: source-compatible, and no call site changed.
  - Their first-call behaviour already met the invariant, so no allocation
    logic changed. The exception is re-binding; see finding W1.
  - `test/test_binding.cpp` runs one templated check for each of the 13 binding
    methods, in three halves:
    1. A success leaves exactly `capacity − 1` observers and
       `U8G2GL_MAX_BINDINGS_PER_OBJ − 1` pool slots. Subject capacity is 2 so
       "consumed 1" and "consumed 2" can be told apart.
    2. A full subject fails.
    3. An exhausted per-object allowance returns `false` and takes no observer.
  - Subject overflow is a debug-build `assert` (WO6 Finding B), so half 2 is an
    `EXPECT_DEATH` in this debug build. Its no-slot-leak assertion runs only
    under `NDEBUG`, the same split `ObserverPool.FullPoolReturnsFalse` uses.
  - Also: a null subject consumes nothing, and a self-check shows the
    measuring helpers are not vacuous.
- **Behaviour tests:**
  - `Clock.BindTimeRendersBoundSubject`: bound value rendered, a change marks
    dirty and renders, an unchanged `notify()` does not mark dirty.
  - `Clock.BindTimeNotificationAfterDestructionIsSafe`.
  - `ProgressBar.BindValueUpdatesFromSubjectAndMarksDirty`: includes clamping
    300→100 and −1→0, and no dirty on an unchanged clamped value.
  - `ProgressBar.BindValueAnimatesLikeSetValue`.
  - `Switch.BindValueUpdatesFromSubjectAndMarksDirty`: includes the rendered
    handle position.
- **Further mismatches:** one, which needs a design choice. Not fixed; see
  "draw= argument order".
- **F1 — nothing moved.** By the WO's rule (membership from the C++), every prop
  and binding on `u8g2gl_obj.xml` stays. `u8g2gl_obj` itself publicly declares:
  - `set_font(const uint8_t*)`
  - `set_align(u8g2gl_align_t)`
  - `bind_text(u8g2gl_subject_int_base*, const char*)`, the target of
    `bind_text_int` and of `bind_text_fmt` via `fmt`
  - `bind_text(u8g2gl_subject_string_base*)`

  The setter cross-test passes on `u8g2gl_obj` with these declarations. The
  finding's concern, that `<u8g2gl_pixel bind_text=…>` validates, is therefore
  not a manifest error but a C++ API placement question. See finding W2.
- **F2:**
  - The parser no longer defaults `extends`.
  - The registry applies `u8g2gl_obj` only to a manifest with a `<view>`, and
    only when `u8g2gl_obj` is registered. A hand-built unit-test registry
    without it leaves the composite a root rather than reporting an `extends`
    the author never wrote.
  - A plain widget without `extends` is a root, and the schema pass now reports
    it end to end.
  - **Self-extends handling kept, narrowed to `u8g2gl_obj`.** `u8g2gl_obj.xml`
    must satisfy the schema's required `extends` and has no parent, so it now
    declares `extends="u8g2gl_obj"`. Any other self-extends is reported as the
    cycle `wd_a -> wd_a`.
  - Tests, one per branch:
    - parser leaves `extends` unset
    - registry: composite inherits `u8g2gl_obj`
    - registry: plain widget gets no parent
    - registry: project self-extends is a cycle
    - schema: parsed plain widget without `extends` gets
      `Missing required attribute 'extends' on widget 'wd_meter'.`
    - schema: framework manifests report nothing
- **F10:** `cli/test/helpers/build-dist.ts` is a vitest `globalSetup` wired in
  `vitest.config.ts`. It runs the pinned `node_modules/typescript/bin/tsc` via
  `process.execPath` before any test. A `pretest` script was rejected because it
  covers only `npm test`. Verified by deleting `cli/dist/` and running
  `npx vitest run`: `dist/node/cli.js` was rebuilt and all 383 passed.

### Mismatches the new cross-tests exposed, and resolutions

| Element | Check | Mismatch | Resolution |
|---|---|---|---|
| `u8g2gl_clock` | bind setter | no `bind_time(u8g2gl_subject_int_base*)` (no `bind_time` at all; type wrong) | implemented `bind_time(u8g2gl_subject_time_base*)`, manifest type → `time` |
| `u8g2gl_progress_bar` | bind setter | no `bind_value(u8g2gl_subject_int_base*)` | implemented |
| `u8g2gl_switch` | bind setter | no `bind_value(u8g2gl_subject_bool_base*)` | implemented |
| `u8g2gl_box` | draw shape, effective order | effective `draw=` order `x,y,width,height,radius,filled`; `u8g2gl_draw_box` takes `…,filled,radius` | **not resolved — design choice, reported below**; pinned with `it.fails` |

**Against WO1's tip (`984aff2`).** I ran the new cross-test in a temporary
worktree, since removed. At `984aff2` the checks behave like this:
- **Bind-setter check: fails** for clock, progress bar and switch, as required.
- **Prop-setter, bind-type and draw-shape (declaration order) checks: no real
  manifest fails.** At WO1 every `setter=` already existed, `int` is a valid
  subject type, and every draw function matched its declared props. So the
  testing requirement "each new cross-test fails for at least one real manifest"
  is **not met** for those three, and its box is left unticked.
- **Effective-order `u8g2gl_box` mismatch: already present.** It comes from
  WO1's registry plus the old parser default.

To prove those three checks are not vacuous, I planted one fault each in the
same worktree:
- `set_long_mode` → `set_long_mod`: caught by the prop-setter check
- a bind type of `float`: caught by the bind-type check, and by bind setter
- `x` and `y` swapped in `u8g2gl_hline.xml`: caught by the draw-shape check

All seven expected failures appeared (the three real bind-setter failures plus
four from the planted faults).

### Decisions I had to make

- **D1 — explicit `extends="u8g2gl_obj"` on the 8 drawing-set manifests.**
  - Removing the parser default made `box`, `circle`, `ellipse`, `hline`,
    `line`, `pixel`, `triangle` and `vline` plain widgets with no `extends`.
  - The schema pass (validator: off-limits) then errors on every project.
  - Adding the attribute keeps effective manifests exactly as they were
    under WO1. Accepted attributes are unchanged; schema diagnostics stay
    zero.
  - It is the literal "make the implicit default explicit". No new vocabulary.
  - **But it is in tension with the spec.** §6.2 says drawing elements are "free
    functions in the runtime, not classes", while §6.5 calls `extends` real C++
    inheritance.
  - I kept today's behaviour rather than choose. The PA should decide whether
    drawing elements extend `u8g2gl_obj`. The alternative is no `extends`,
    which needs the WO3 validator to exempt manifests whose props are all
    `draw=`.
- **D2 — `bind_text`/`bind_flag_if_*` return `bool`.** Required by "returns
  `false` on exhaustion". Source-compatible.
- **D3 — value-binding plumbing on `u8g2gl_obj`,** as a protected helper rather
  than per-widget pool access or a virtual.
  - The pool is file-private in `u8g2gl_obj.cpp`.
  - A virtual would add a vtable entry.
  - Per-widget subject members would add per-object RAM.
  - The helper adds neither.
- **D4 — progress-bar change guard in the observer, not in `set_value()`.**
  `set_value()` is not a binding method (Boundary Box). See W3.
- **D5 — cross-test uses on-disk manifests, not the bundle.** The bundle drift
  guard already ties the two together.
- **D6 — bind-setter check matches the subject parameter type,** not just the
  name. Name-only would not have caught `bind_time` typed `int`.

### Open question for the PA — draw= argument order

The WO says the generator passes a drawing element's props to its `draw=`
function "in manifest declaration order (WO1 pins that order)". Those are two
different orders once a drawing element has `extends`:
- **Declared order** (the element's own manifest) matches every draw function.
- **WO1's effective order** puts an override in the parent's position. For
  `u8g2gl_box`, `radius` inherits `u8g2gl_obj`'s slot 11, ahead of the appended
  `filled`, giving `…,radius,filled` against `u8g2gl_draw_box(…, filled, radius)`.

Choices:
- (a) The draw-argument helper uses the element's **declared** `draw=` props.
  No manifest or C++ change.
- (b) Drawing elements stop extending `u8g2gl_obj` (see D1). Effective then
  equals declared.
- (c) Reorder `u8g2gl_draw_box`'s parameters. Render path, WO4.

The cross-test pins the declared order as passing, and the effective order for
`u8g2gl_box` as `it.fails` (`OPEN_EFFECTIVE_ORDER_MISMATCHES`). Either
resolution turns that test red, forcing the list to be updated.

### Out-of-scope findings (not fixed, not filed)

- **W1 — re-binding violates one-binding-one-slot-one-observer.**
  - A second `bind_text` on the same object reuses the text slot but registers
    another observer on the new subject. The old subject keeps its observer,
    which now points at a slot naming the new subject.
  - Net effect: 0 slots, +1 observer per re-bind; the old subject still dirties
    the object; re-binding the same subject twice doubles its observers.
  - If the second `add_observer` fails, the rollback deactivates the reused slot
    and the **previous** binding is lost too.
  - `bind_flag_if_*` and the new value bindings take a fresh slot per call, so a
    re-bind stacks bindings.
  - Fixing this needs either a `remove_observer` on subjects (`u8g2gl_subject.h`,
    outside the box) or refusing re-binds, which contradicts the documented
    "binding one replaces the other". Generated code binds once, so first-call
    behaviour, which meets the invariant and is tested, is what WO8 counts.
- **W2 — F1's real cause is C++ placement.** `set_font`, `set_align` and
  `bind_text` live on `u8g2gl_obj`, so every element inherits them in C++ and
  hence in the manifest. Uses:
  - `font`: clock, progress bar, glyph, button use `style_.font`
  - `align`: clock and button read `style_.align`
  - `bind_text`: rendered only by label and button, but §6.3 lists it for the
    progress bar too

  Narrowing it means moving methods off `u8g2gl_obj` (ISP, §3 of the standards),
  or not letting drawing elements extend it (D1): a design decision.
- **W3 — `u8g2gl_progress_bar::set_value()` marks dirty unconditionally.** It
  violates the "guarded on the value changing" rule, and
  `set_animate_duration_ms()` does not mark dirty (it changes no pixels by
  itself, so that one is arguably fine).
- **W4 — composites now inherit `u8g2gl_obj`'s props** through F2's registry
  default. So `disabled`, `draw_color`, `invert`, `padding`, `border`, `radius`,
  `font`, `align` and `bind_text*` are accepted on a composite instance, where
  WO1 accepted only `COMMON_ATTRIBUTES`. This is PA-intended (§13.12), but WO3
  should confirm composites are meant to accept, and forward, those.
- **W5 — stale comments caused by F2, outside the box:**
  - `validate-references.ts` §3: "a composite has no `extends`, so declared and
    effective props are the same list". Declared is still what it uses, and
    correctly so.
  - `schema/widget-manifest.ts` on `extends`: "Always present on a real widget
    manifest". Now enforced by the schema pass, not the parser.
- **W6 — spec §6.3 lists bindings no manifest declares:** `bind_src` (xbm),
  `bind_glyph` (glyph) and `bind_text` on the progress bar, which inherits it
  anyway (W2). Not touched: adding them needs runtime methods outside this WO's
  classes.
- **W7 — debug-build subject overflow aborts.** In a debug build a subject
  overflow aborts before `add_value_binding`/`add_flag_binding` can return
  `false`. The "returns `false` on exhaustion" contract is observable in release
  builds only, which is consistent with WO6's policy that overflow is a
  generator sizing bug.
- **W8 — `test/test_subject.cpp`'s header** still reads "Description:
  Implementation of test_subject.cpp". Its `FourGeometryBindingsPlusText…`
  comment says the `bind_*` wrappers "discard" their bool, which is no longer
  true. Not edited, since the test is unchanged.
