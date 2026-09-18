# PROJECT — PR-04: Generator, XML → C++ per design_spec §13

**Tier 2 · Principal Architect**
**Programme**: U8G2GL
**Parent**: [PROGRAM.md](../PROGRAM.md)
**Contract**: [design_spec.md §13](../../../../docs/design_spec.md) (normative)
<!-- Last updated: 2026-09-13 -->

## Mandate

Generator XML → C++ per §13: property emission, composite expansion, build-time
layout ([D-7], [D-20]), identifier mangling, realisation ([D-18]), generated
capacities ([D-21]), and the `generate` command. Firmware **and** editor targets
([UD-4], ui_spec §15). `--json` on every command ([D-16]).

## Branch Strategy

Base: `main` @ `f693aab`. Branches `u8g2gl-generator/wo<N>-<topic>`, stacked
serially. PR head is the last branch in the stack. Sync with `main` using
`git rebase --update-refs` before submission.

Baseline at base: **C++ 240 tests, CLI 266 tests, zero warnings** under
`-Wall -Wextra -Wpedantic`. Schema 0.4, CLI 0.6.0, runtime 0.3.0.

## Findings that shaped the decomposition

Verified against the code on 2026-09-13, before any work order was written.

1. **The CLI never loads the framework manifests.** `read-project.ts` discovers
   only the project's `widgets/`; `include/u8g2gl/manifests/` is never read and
   the npm package does not ship it. Four test fixtures validate only because
   they carry stale copies of `u8g2gl_label.xml` (still `animated="false"`).
   Nothing resolves `extends`.
2. **Manifests name methods the runtime lacks.** `bind_time` (clock) and
   `bind_value` (progress bar, switch) exist in no header. The cross-test checks
   only that `draw=` names exist — not `setter=`, not `<bind>` setters, not the
   order of draw-function parameters.
3. **[D-20] bindable geometry has no surface** — no manifest binding, no runtime
   method, and the validator rejects `bind_width` as unknown.
4. **No per-object render wrapper.** `ui_handler` calls `render_fn`; nothing in
   `src/` sets up the state saver, clip and effective visibility §11.3 describes.
   The §16 major-version guard does not exist; CMake says `0.3.0`.
5. **No focus ring, dispatch, events or screen stack in the runtime** (PR-09).
6. **Realisation of classed elements had no data source** — resolved as an
   amendment to [D-18], below.

## Firmware / editor sharing — decided deliberately

PR-3R found three of its four real defects by unifying duplicated logic. So:

- **One pipeline, one intermediate model.** Load → validate → resolve → expand →
  realise → flatten runs once. The firmware and editor emitters are two thin
  backends over that model.
- **Three shared helpers**, used by the validator and both emitters where they
  apply: the manifest registry with `extends` resolved; the §13.2 value→C++
  spelling (so a setter call is spelled in one place); the draw-function argument
  order.
- **Sharing is enforced by a test, not by intent.** WO11 builds the same fixture
  through both targets and asserts identical draw-call history from the U8G2
  stub. The only legitimate difference is where values come from — literals in
  firmware, a runtime value in an editor thunk.

## Work Order Decomposition

- [x] **[WO1 — manifest registry](wo1-manifest-registry/WORKORDER.md)** ✅ `6c71715` · `u8g2gl-generator/wo1-manifest-registry` · base `main` @ `f693aab` · standard · finding 1; widget/composite prop-check unification (inherited)
- [x] **[WO2 — manifest ↔ runtime parity](wo2-manifest-parity/WORKORDER.md)** ✅ `33cd27b`, `0257d57` · base WO1 · standard · finding 2; `bind_time`, `bind_value`
- [x] **[WO3 — [D-20] bindable geometry](wo3-bindable-geometry/WORKORDER.md)** ✅ `a652fd6` (partial by design — one stop-and-report, resolved by the PA) · base WO2 · standard · finding 3
- [x] **[WO4 — runtime support for generated code](wo4-runtime-support/WORKORDER.md)** ✅ `6a78247` · base WO3 · standard · finding 4; runtime 0.4.0
- **Owner checkpoint** — reached 2026-09-14; rulings below. WO4b added, WO5 split
- [x] **[WO4b — clipping correctness and pre-1.0 version guard](wo4b-clipping-version/WORKORDER.md)** ✅ `4094489` · `u8g2gl-generator/wo4b-clipping-version` · base WO4 · standard · F1, F4, F6, version guard (checkpoint-approved)
- [x] **[WO5a — manifest and validator carries](wo5a-validator-carries/WORKORDER.md)** · base WO4b · standard · WO1 F5, WO3 carries, `extends` remedy (checkpoint-approved split)
- [x] **[WO5b — `generate` command and shared load path](wo5b-generate-command/WORKORDER.md)** · base WO5a · standard · constraint 4; NOT_YET_SUPPORTED severity split; WO1 F9
- [x] **[WO6 — resolver: arithmetic and anchors](wo6-resolver/WORKORDER.md)** ✅ `6b5d562` · base WO5b · standard · [D-7], [D-20]
- [x] **[WO7 — composite expansion and mangling](wo7-composite-expansion/WORKORDER.md)** ✅ `a19b65a` · base WO6 · standard · §13.4, §13.6
- [x] **[WO4c — the runtime compiles against real U8G2](wo4c-real-u8g2/WORKORDER.md)** ✅ `7924d24`, `62dd06b`, `468e386` · `u8g2gl-generator/wo4c-real-u8g2` · base WO7 (stack tip) · standard · G1, stub coordinate types, U8G2 submodule, Q-11 (CA-approved) — numbered for its origin in WO4b, placed after WO7 in the stack
- [x] **[WO7b — the geometry contract](wo7b-geometry-contract/WORKORDER.md)** ✅ `9970859` · base WO4c · standard · §7.2 / §13.2 normative contract, WO6 and WO7 carries (CA-approved)
- [x] **[WO8a — one pipeline](wo8a-one-pipeline/WORKORDER.md)** ✅ `2954fc2` · `u8g2gl-generator/wo8a-one-pipeline` · base WO7b · standard · expand once, resolve once, mangling wired in, non-rectangular geometry, WO7b carries (owner-approved split)
- [x] **[WO8b — realisation and capacities](wo8b-realisation-capacities/WORKORDER.md)** ✅ `6c2c909` · base WO8a · standard · [D-18], [D-21], `_n<N>`
- [x] **[WO8c — validator alignment](wo8c-validator-alignment/WORKORDER.md)** ✅ `ae1e7a9` · `u8g2gl-generator/wo8c-validator-alignment` · base `pa-ca-rulings` (PA spec-rulings commit on WO8b) · standard · exact object ceiling, refusal severity, `wd_` un-reserved (owner-approved)
- [x] **[WO9 — project-level emission](wo9-emit-project/WORKORDER.md)** ✅ `136c0c2` · base WO8c · standard · §13.7
- [x] **[WO10 — screen emission and compile layer](wo10-emit-screens/WORKORDER.md)** ✅ `3a58ab3` · base WO9 · standard · §13.7, §13.8, §17.1
- [ ] **[WO11 — editor target](wo11-editor-target/WORKORDER.md)** · base WO10 · standard · [UD-4], ui_spec §15
- [ ] **[WO10b — bound text reaches the label](wo10b-bound-text/WORKORDER.md)** · `u8g2gl-generator/wo10b-bound-text` · base WO11 · standard · runtime defect found in WO10 review (owner-approved 2026-09-18)
- [ ] **[WO11b — validator hardening](wo11b-validator-hardening/WORKORDER.md)** · `u8g2gl-generator/wo11b-validator-hardening` · base WO10b · standard · validate/generate asymmetries from WO9/WO10, WO12's validator carries (owner-approved 2026-09-18)
- [ ] **[WO12 — budget, `--json`, determinism](wo12-budget-determinism/WORKORDER.md)** · base WO11b · standard · §13.9, §18, [D-16]; CLI 0.7.0

**WO2–WO12 were drafted before WO1 ran.** Their line items are revised by the PA
against each predecessor's Completion Report before dispatch; the boundaries are
the approved decomposition.

### Standing instructions carried in every WORKORDER

- Workers **commit on a green build and never ask permission mid-flight** — they
  cannot be answered, and their work strands.
- Load the `u8g2gl-standards` skill before writing code.
- Run `git branch --show-current` as its own command immediately before every
  commit.
- Out-of-scope findings go in the Completion Report. Filing issues is the PA's
  authority, not the worker's.
- **Never measure one suite while another runs.** WO8c launched a full CLI run alongside a
  base-worktree suite and a `cmake`/`ctest` cycle: it reported seven files failing in 3616s,
  and the same tree run alone gives 702/702 in 5.9s. A contended run measures nothing — every
  figure in a Completion Report must come from an uncontended run.
- **"Stop and report" means: do not choose — record it in the Completion Report,
  then continue with the remaining line items.** It never means halt the work order
  or ask for permission. (Clarified after WO5a noticed WORKORDERs said "stop" while
  dispatch prompts said "record and continue".)

## Decisions — Chief Architect, 2026-09-13 (recorded in PROGRAM.md @ `f693aab`)

1. **Focus ring, events, screen navigation — deferred to PR-09.** `generate`
   refuses them with `U8G2GL_NOT_YET_SUPPORTED`; realisation still models them.
   Collections, and composites that also have C++, get the same treatment until
   PR-08. **Condition:** `validate` reports these as a **warning** and `generate`
   as an **error**, so the editor never shows as valid a document `generate`
   refuses — the same journey split as [U-1]. → WO5. *PA application:* the same
   split is used for `<bdf>` and `<convert>`, for the same reason.
2. **Classed elements always become objects** — interim, recorded as an
   amendment to [D-18]. The manifest-vocabulary alternative is declined. The §18
   report **must** state that classed-element demotion is not yet delivered.
   → WO8, WO12.
3. **`<bdf>` and PNG `<convert>` — named errors in PR-04.** The refusal message
   names PR-04b, which replaces it (departures-board-v3 uses custom BDF fonts).
   → WO5.
4. **[U-6] does not gate PR-04.** No sample-data hooks. It gates editor track E-3.
5. **Versions.** CLI → 0.7.0. Runtime 0.3.0 → **0.4.0 approved**. No schema bump.

**Spec corrections on `main` @ `f693aab`, re-read before use:** §13.3 (parent
index `uint8_t`, 254-object hard ceiling, no widening), §12.4 (tick returns a
`uint32_t` deadline), §13.5 (one frame-dirty observer per subject), §13.12 (a
composite emits `static u8g2gl_obj bar;`).

### PA decision — `bind_time`: implement, do not refuse

The Chief Architect confirmed that the spec is right (the clock binds time) and the
defect is in merged code: `u8g2gl_clock.xml` declares `bind_time` typed `int`,
and no `bind_time` exists in `include/` or `src/`. Asked to choose between
implementing it and refusing it.

**Implemented, in WO2.** `u8g2gl_clock::bind_time(u8g2gl_subject_time_base*)`,
with the manifest's bind type corrected to `time`. Reasons:

- `bind_time` is the clock's primary binding (§6.3). Refusing it leaves a
  framework element unusable in exactly the case it exists for, and makes
  §13.12's worked example impossible to generate.
- `u8g2gl_subject_time` already exists, so this is one method plus a manifest
  fix — cheaper than a refusal path PR-05 would have to remove.
- `bind_value` on the switch and progress bar is the same defect and is fixed the
  same way.

**Either way, as directed:** WO2 extends the manifest cross-test to check
`<bind>` setters. PR-03's cross-test checked only `<prop>` targets, which is how
this got through.

## Work Order Reviews

### WO1 — complete (`6c71715`)

**Verified independently, not from the report:** commits only on the WO1 branch;
nothing under `include/`, `src/` or `docs/` changed; C++ zero warnings and `ctest`
green (240, one known 32-bit skip); CLI 266 → **293**, `tsc` and lint clean. End to
end through the built CLI: a project using `<u8g2gl_label>` with no local manifest
copy now validates, and a copied framework manifest produces
`U8G2GL_SHADOWED_FRAMEWORK_MANIFEST`.

**The merge found what PR-3R said it would.** Seven asymmetries between the
widget and composite paths (A1–A7), including a tag declared as both being
double-reported (A3) and image references never checked inside composites (A7).
That makes four for four on the unification pattern.

**Decisions accepted:** `ValidateInput.manifests` is the registry; a manifest whose
`extends` names itself is a root; per-file schema checks run on the manifest as
declared, not the effective one, so an inherited defect is reported once against
its owner; composite messages now read "on <x>".

**Triage of the eleven findings:**

| # | Finding | Placed |
|---|---|---|
| F1 | `u8g2gl_obj.xml` declares label-only props (`font`, `align`, `bind_text`) on the base, so with `extends` resolved a `<u8g2gl_pixel>` accepts `bind_text` | **WO2** — manifest data correctness, and WO2's cross-test is the tool that should catch it |
| F2 | The parser defaults a missing `extends` to `u8g2gl_obj`, so "missing required `extends`" can never fire and a real self-extends is undetectable | **WO2** — PA decision below |
| F3 | design_spec §6.5 example extends `u8g2gl_widget`, which does not exist | **Chief Architect** — spec defect |
| F4 | Prop checking walks only screens, never a composite's `<view>` (§13.11 requires it) | **WO3** — attribute acceptance |
| F5 | `validate` on a single framework manifest file reports shadowing | **WO5** — single-file path moves into `loadProject()` |
| F6 | `tsconfig` covers only `src/`; four type errors already exist in tests | **WO3** — it rewrites those validator tests |
| F7 | Duplicate plain-widget manifests are not diagnosed; duplicate composites are | **WO3** |
| F8 | Should collection `<element>`s be inherited? | **PA decision below** |
| F9 | Diagnostics against a bundled framework manifest print without a source line | **WO5** — the file map is built in `loadProject()` |
| F10 | Integration tests run `dist/`, which nothing rebuilds before `vitest` | **WO2** — first work order after this; a stale build silently tests old code |
| F11 | "component" wording remains in schema/references/identifiers passes | **WO3** |

**PA decision — F2.** The default moves out of the parser and into the registry,
where it is visible: a manifest with a `<view>` and no `extends` inherits
`u8g2gl_obj`, because that is what it realises as (§13.12, corrected); a plain
widget with no `extends` is the error the schema check already describes.

**PA decision — F8.** Collection `<element>`s are **not** inherited. Collections
are refused until PR-08 (decision 1), so nothing in PR-04 reads them; inheriting
them now would decide PR-08's semantics by accident.

### WO2 — complete (`33cd27b`, `0257d57`)

**Verified independently:** commits only on the WO2 branch; `docs/` untouched; C++
240 → **260**, zero warnings (one known 32-bit skip); CLI 293 → **383** starting
from a deleted `dist/`, which is itself the proof F10 works; `tsc` clean.

`bind_time` (typed `time`) and `bind_value` exist and are tested. **Every object
binding method now returns `bool`** and a runtime test holds all thirteen to one
pool slot and one observer, including on exhaustion — the invariant WO8 counts
against. The cross-tests check prop setters, bind setters with subject type, bind
types and draw-parameter order, through WO1's registry rather than a second
`extends` walk.

**F1 resolved as no move, correctly.** `u8g2gl_obj` itself declares `set_font`,
`set_align` and both `bind_text` overloads, so by the "decide from the C++" rule
they belong on its manifest. The real cause is C++ placement — see W2.

**Testing box left unticked, accepted.** Against WO1's tip only the bind-setter
check had a real manifest to catch; the other three found nothing wrong. The worker
proved each non-vacuous by breaking a manifest in a throwaway worktree. That meets
the intent.

**Checked against the Chief Architect's F3 ruling (`4e4b992`):** `extends` must name
a manifest; every class-backed built-in extends `u8g2gl_obj`.

**PA decision — the worker's question 2: drawing manifests do not `extends`.**
WO2 added `extends="u8g2gl_obj"` to the eight drawing manifests to keep the schema
check quiet once F2 removed the parser default, and said plainly that this
conflicts with §6.2 and §6.5. It does: a drawing element has no class ([D-18]),
and §6.5 now states `extends` is real C++ inheritance. The ruling concerns
class-backed elements and gives no licence to claim a class that does not exist.
Resolved in WO3:

- A `draw=`-only manifest declares **no** `extends`, and declaring one is an error.
- `u8g2gl_obj` is the single root class manifest — the base §13.7 names as the
  contract — and drops its self-referencing `extends`.
- A manifest with `setter=` props and no `extends`, other than that root, is the
  existing schema error. A composite still inherits `u8g2gl_obj` via the registry.

**PA decision — the worker's question 1: draw-argument order.** This dissolves
with question 2. Box's `radius`-before-`filled` order came from inheriting
`u8g2gl_obj`'s style `radius`; without `extends`, the box's effective order is its
declared order, which matches `u8g2gl_draw_box`. WO3 removes the `it.fails`
marker, and the generator uses effective order, which for drawing elements is
declared order. Neither alternative is needed: C++ parameters stay as they are.

**Triage of W1–W8:**

| # | Finding | Placed |
|---|---|---|
| W1 | Re-binding stacks a second observer; a failed re-bind loses the original | **Carried forward, not PR-04.** Generated code binds each attribute once per element, and the validator rejects a duplicate attribute. A hand-written-use defect; for PR-05, when an application first drives the runtime directly |
| W2 | `font`, `align`, text binding live on `u8g2gl_obj` in C++, so every element inherits them | **Carried forward.** A standards §3 ISP concern on merged runtime, not a PR-04 defect; moving them is a runtime redesign. Reported to the Chief Architect |
| W3 | `u8g2gl_progress_bar::set_value()` marks dirty without a change guard | **WO4** — runtime, house pattern |
| W4 | Composites inherit `u8g2gl_obj`'s props | **Accepted, intended.** A composite realises as `u8g2gl_obj` (§13.12), so its container has those setters |
| W5 | Comments stale after F2 in `validate-references.ts`, `schema/widget-manifest.ts` | **WO3** |
| W6 | §6.3 lists `bind_src` (xbm), `bind_glyph` (glyph); no manifest or runtime declares them | **Chief Architect** — spec lists bindings that do not exist. Today they fail honestly as unknown attributes |
| W7 | A full subject asserts in debug before `false` is observable | **Accepted, by design.** The header documents it; generated capacities are exact, so it cannot fire in generated code |
| W8 | `test_subject.cpp` placeholder header, stale comment | **WO4** |

### WO3 — complete (`a652fd6`), `partial` by design

**Verified independently:** commits only on the WO3 branch; `docs/` untouched; C++
260 → **266**, zero warnings; CLI 383 → **406**; `tsc` clean; `npm run lint` clean and
now also type-checks the tests. Only the seven class-backed manifests declare
`extends`; `u8g2gl_obj` is the root through one documented constant; the cross-test
exception list is gone.

[D-20] is now real end to end: `bind_x/y/width/height` on objects (one slot, one
observer, per-axis setters so dirty only on change), four geometry `<bind>`s on
`u8g2gl_obj.xml` and each drawing manifest, binding types checked from manifests,
and `U8G2GL_BOUND_GEOMETRY_ANCHORED_CHILD`. `COMMON_ATTRIBUTES` now holds only
identity/anchor/style attributes; geometry and `hidden` come from manifests.
`focusStyle` stays because the parser writes and references reads it.

**F6 was four times worse than recorded** — sixteen test type errors, three of them
`@ts-expect-error` over commented-out code checking nothing. This is the vacuous-test
pattern again, and the test type-check now in `lint` is what stops its return.

**Decisions accepted:** drawing elements bind only the four [D-20] axes (§1.5 — no
demonstrated need for bindable `radius`); `hcenter="false"` is not an anchor; a
composite's `<view>` children count as its children for the [D-20] rule.

**The stop-and-report — PA decision: no new vocabulary for flags.** The worker could
not declare `hidden` for drawing elements because `BindDef` describes attributes,
not `<bind_flag_if_*>` children. None is needed. §8.4 fixes the flag set at
`hidden` and `disabled`, so it is not per-element data. `hidden` applies to every
element (realised as an object flag or as a draw-time guard, §13.5); `disabled` on a
`draw=`-only element is an error, because there is nothing to disable. That rule
follows from "has no class", which the registry already knows — not from an element
list. → WO5.

**Worker decision overruled — binding overloads.** It accepted every type declared
on the same C++ method, so `bind_text` accepts an int subject (§8.4's own example)
but `bind_text_int` now also accepts a string. `bind_text_int` appears nowhere in the
spec. **Decision:** delete `bind_text_int`; declare `bind_text` once per subject type
(`<bind name="bind_text" type="string" …/>` and `type="int"`); the validator accepts
a subject type if any binding of that name declares it; the registry merges bindings
by (name, type). This is existing vocabulary used twice, not new vocabulary, and it
removes the inference. → WO5.

**Remaining findings:**

| # | Finding | Placed |
|---|---|---|
| 3 | On drawing manifests `<bind setter="width">` names a prop, not a method — the two-meanings ambiguity §13.1 criticises | **Owner, at the WO4 checkpoint.** A dedicated attribute is new vocabulary. Interim: as built, documented |
| 4 | Composite interiors are prop-checked but not type-checked | **WO7** — a `$subject` resolves only after expansion, so types are checked on the expanded tree |
| 5 | `CommonAttributes` in `schema/widget-node.ts` still lists geometry and `hidden` | **WO6** — the resolver reads geometry off nodes |
| 6 | A manifest with both `setter=` and `draw=` props is undefined | **WO5** — an error: [D-18] says a manifest declares one or the other |
| 7 | `vitest run` alone does not catch test type errors | **Accepted** — every WORKORDER's green definition already includes `lint` |

### WO4 — complete (`6a78247`)

**Verified independently:** commits only on the WO4 branch; `docs/` and `cli/`
untouched; C++ 266 → **277**, zero warnings after reconfigure; CLI 406 unchanged,
`tsc` and lint clean. The version guard's refusal is proven by a real failing
compile — `VersionGuard.MismatchedSchemaMajorFailsToCompile` passes only when the
compiler stops with the guard's own message, with a matching-major control beside it.

**Delivered:** `u8g2gl_render_object(U8G2&, objs, parents, index)` taking a screen's
own arrays (effective visibility, empty-clip skip, state saver, clip, `render()`,
reset); `u8g2gl_version.h` at runtime 0.4.0 / schema 0.4 with
`U8G2GL_REQUIRE_SCHEMA_VERSION`, and a configure-time check that CMake and the header
agree; `u8g2gl_frame_dirty_observer`, pinned to the observer type at library build
time; W3 and W8 closed.

**Decisions accepted:** the guard compares the **schema** major, not the generator
major — the CLI and runtime are versioned separately, so a generator comparison
would mean nothing (rules/03-versioning.md). Clip is reset to the full display after
each object because U8G2 cannot read the clip back. Negative clip origins clamp to 0.

**Interruption handled without loss.** The worker hit the API usage limit mid-flight
with eleven files uncommitted. Nothing was committed, stashed or discarded on its
behalf; the same worker was resumed with its context and re-derived its state from
`git diff`. Recorded because a fresh worker reconstructing a half-finished diff is
the riskier path, and this is the first time it has come up.

**Triage of F1–F8:**

| # | Finding | Placed |
|---|---|---|
| F1 | `setClipWindow(x, y, x+w-1, y+h-1)` clips away the last column and row. **Confirmed against U8G2 source** (`departures-board-v3/framework/.pio/libdeps/esp32dev/U8g2/src/clib/`): `u8g2_apply_clip_window` sets `user_x1 = min(user_x1, clip_x1)`, whose default is `width`; `u8g2_IsIntersection` states "upper limits are not included"; `u8g2_DrawHVLine` returns on `x >= user_x1`. So `clip_x1` is **exclusive** and the correct call is `setClipWindow(x, y, x+w, y+h)`. Affects WO4's `u8g2_render_object`, `u8g2gl_label`'s scroll clip, and design_spec §11.3's text | **Owner checkpoint** — proposed WO4b; §11.3 to the **Chief Architect** |
| F2 | §16 says runtime and CLI are versioned "in lockstep"; they are not (CLI 0.6→0.7, runtime 0.4), and §16 does not say which major is compared | **Chief Architect** — spec defect; rules/03-versioning.md already describes the real, separate versioning |
| F3 | The guard cannot catch 0.3 → 0.4, which §15.4 calls breaking, because both are major 0 | **Owner checkpoint** — pre-1.0 policy |
| F4 | `u8g2gl_state_saver` does not save the clip window, though its header and §11.3 say it does; nor font or bitmap mode | **Owner checkpoint** — proposed WO4b |
| F5 | Generated capacities do not reach the library: the pool is sized in `u8g2gl_obj.cpp`, compiled without the generated header | **WO9** (design) and **WO10** (proof). Without it [D-21] silently does not happen |
| F6 | A scrolling `u8g2gl_label` sets its own clip and resets to full display, so it can draw outside its container | **Owner checkpoint** — proposed WO4b |
| F7 | §13.12 calls `render()` directly; generated code copying it would draw hidden objects unclipped | **WO10** (must use the wrapper, with a test) and **Chief Architect** (example predates the wrapper) |
| F8 | Other test files may still carry placeholder headers | **End-of-PR readability review** |

---

## Owner Checkpoint — after WO4 (2026-09-14)

WO1–WO4 repaired merged code and are complete and verified: C++ 240 → **277**, CLI
266 → **406**, zero warnings. Stack tip `u8g2gl-generator/wo4-runtime-support`. Every
WO1–WO4 finding is placed above. Four things need the owner before WO5 is dispatched.

**1. Add WO4b — clipping correctness (F1, F4, F6)?** Recommended. [D-18] made
composites real containers precisely so that clipping would mean something, and the
three findings together say framework clipping is not yet trustworthy: the clip
corner **is** off by one (F1, confirmed against U8G2 source after the checkpoint was
first written — the second corner is exclusive), the state saver does not save the
clip it claims to, and a scrolling label escapes its container. WO10's compile layer
runs against the U8G2 stub, which cannot catch any of them. Scope: correct every
`setClipWindow` call to the exclusive form and add a stub test that pins it;
`u8g2gl_state_saver` saves and restores the clip (or the claim is removed); the label
clips inside the effective clip rather than replacing it. The stub should model
U8G2's exclusive upper bound so the test means something.

**2. Pre-1.0 version guard (F3).** The guard as built compares the schema major, so
0.3 against 0.4 compiles. Recommended: while major is 0, compare major **and** minor,
matching §15.4's statement that 0.3 → 0.4 is breaking. A one-line change to the
macro, which already takes the minor. Belongs in WO4b if approved, otherwise WO9.

**3. `setter=` on drawing-element bindings (held from WO3).** `<bind name="bind_width"
setter="width">` uses `setter=` to name a prop, not a method — the two-meanings
ambiguity §13.1 says [D-18] resolved. Options: (a) keep, documented; (b) a dedicated
attribute such as `prop=`, which is new manifest vocabulary, a schema-minor owner
decision. Recommendation: **(a) for PR-04**, with the ambiguity recorded against the
next schema bump. Nobody has shown the need, and §1.5 prices vocabulary highest.

**4. WO5 has grown.** It now carries the `generate` command and shared load path, the
not-yet-supported policy, F5 and F9 from WO1, three WO3 carries (flags, `bind_text`
overloads, mixed manifests) and the `extends` message. Recommended split:
**WO5a — manifest and validator carries** (flags, overloads, mixed manifests,
`extends` message, F5 single-file shadowing) and **WO5b — `generate` command**
(load path, policy, writer, `--check`, F9). The carries are validator behaviour
changes; the command is new surface; one diff for both is not reviewable — the same
reasoning that split PR-3R's WO5 from WO5b.

If all four are approved as recommended, the ledger goes from twelve work orders to
fourteen (WO4b, WO5a/WO5b).

### Checkpoint rulings — Chief Architect, delivered in the owner's session, 2026-09-14

Recorded in PROGRAM.md; spec at `main` @ `ef73776`. **The ledger is now fourteen work
orders.** Provenance: the rulings were pasted into this Principal Architect session by
the owner, as the answer to the checkpoint the owner's approval established; they
amend the approved decomposition within PR-04's mandate and do not replace the Human
Approval below.

1. **WO4b — APPROVED.** F4 and F6 are ordinary defects, fixed in WO4b. For F1: put the
   clip-window corner convention in **exactly one function**, document it there as an
   assumption **not verified by a pixel test**, pin the chosen convention with a test,
   and **do not fetch U8G2 source**.
2. **Version guard — APPROVED, in WO4b.** Compare major, and minor too while major is 0.
   §16 and `rules/03-versioning.md` on `main` now say this.
3. **`setter=` naming a prop on `<bind>` — KEEP for PR-04.** Recorded as **Q-9** for the
   next schema bump. No `prop=`, no new manifest vocabulary.
4. **WO5 split into WO5a (findings) and WO5b (`generate`) — APPROVED.**

**Non-blocking findings, resolved on `main`:** F2 fixed (§16: runtime and CLI versioned
independently). F7 fixed (§13.12 now calls `u8g2gl_render_object()` for every object,
draw calls kept in document order — WO10 may follow the example). W2 recorded as
**Q-10**, decided before E-2 — **do not** move `font`/`align`/text binding off
`u8g2gl_obj` in PR-04. W6 removed from §6.3 and recorded as **Q-12** — **do not**
implement `bind_src` or `bind_glyph`. **Q-11**: the PR-02 catalogue builder took
`--u8g2-path` without recording it.

**`bind_time` — confirmed shipping.** §13.12 calls it, correctly. For the record, it
was delivered in **WO2** (`33cd27b`: the method, and `type="time"` on the manifest),
not WO4; both are in the stack.

**Rebase target is `main` @ `ef73776`** (§6.3, §13.12, §16, §21, rules/03 changed).

### PA note on F1 — the ruling's premise and the evidence

Ruling 1 was premised on there being no U8G2 checkout on this machine. After the
checkpoint was first sent, a search completed and found U8G2 **2.36.18** already present
in departures-board-v3's PlatformIO cache
(`departures-board-v3/framework/.pio/libdeps/esp32dev/U8g2/src/clib/`). Nothing was
fetched. Reading it shows the second clip corner is **exclusive**
(`u8g2_apply_clip_window`, `u8g2_IsIntersection`, `u8g2_DrawHVLine`; commit `fcdce73`).

The ruling's structure is followed exactly — one function, a pinning test, a PR-06
pixel test — and WO4b chooses the exclusive form the source supports. The single
adjustment is wording: the comment says the convention is **read from U8G2 source but
not verified by a pixel test**, rather than an unsupported assumption, because the
first is true and the second no longer is. Raised with the owner rather than applied
silently.

**Obligation on PR-06.** PR-06's real-U8G2 build must add a **pixel test at a container
edge**: an object whose clip is exactly its bounds, drawing to its last column and row.
Any one-pixel difference in the corner convention shows directly. If it disagrees, the
fix is the one function WO4b creates, and the pinning test's comment points there.

### WO4b — complete (`4094489`)

**Verified independently:** commits only on the WO4b branch; `docs/` and `cli/`
untouched; C++ 277 → **284**, zero warnings after reconfigure; CLI 406 unchanged, `tsc`
and lint clean. `grep setClipWindow include src` finds exactly one call, in
`u8g2gl_apply_clip` (`src/u8g2gl_core.cpp:191`). All four version-guard compile tests
pass, including `VersionGuard.StaleSchemaMinorFailsToCompile` — 0.3 against 0.4 now
really fails to compile.

**Delivered:** `bool u8g2gl_apply_clip(U8G2&, const u8g2gl_rect&)`, the exclusive
`(x, y, x+w, y+h)` convention, documented there with the U8G2 2.36.18 evidence and the
PR-06 pixel-test obligation, pinned by a test naming it; the state saver's header now
states it does not save clip, font mode or bitmap mode (U8G2 has no getters for them),
with clip lifetime the wrapper's job; `u8g2gl_label::render()` no longer touches the
clip in any mode; the guard compares major, and minor while major is 0.

**The worker proved its tests catch the defects** by building them against the old code
in a throwaway worktree: the container test failed on the old label (two clips set,
right edge 99 not 40), and `(0, 3)` compiled cleanly against the old macro.

**Spec disagreement, correctly not resolved:** design_spec §11.3 on `main` still says
`x+w-1, y+h-1` and that the state saver saves the clip. → **Chief Architect.**

**Triage of G1–G7:**

| # | Finding | Placed |
|---|---|---|
| G1 | **The runtime does not compile against real U8G2.** `u8g2gl_state_saver` calls `getFont()`, which U8G2 2.36.18's `U8g2lib.h` does not declare — only the stub does. **Verified by the PA:** every `U8G2` method the runtime calls was checked against the real header; `getFont` is the only one missing. Real U8G2 exposes the font as `getU8g2()->font` (`U8g2lib.h:70`, `u8g2.h:359`). Pre-dates PR-04; invisible because nothing has ever compiled the runtime against real U8G2 | **Owner — proposed WO4c** |
| G2 | `render_animation_update()` cannot see ancestors, so a marquee redrawn while the loop is blocked is bounded by its own bounds, not its container's; the next full frame is correct | **Accepted** — [D-5]'s escape hatch runs outside the frame by design; the limitation is documented at the label |
| G3 | Comments outside the box still overstate the state saver (`u8g2gl_obj.h:396`, `u8g2gl_button.cpp:85`) | **End-of-PR readability review** |
| G4 | The far clip corner is not clamped to the display; `u8g2_uint_t` is 8-bit without `U8G2_16BIT` | **Downgraded, proposed WO4c.** `u8g2.h:74` forces `U8G2_16BIT` on every 32-bit environment, which is every supported target (§2.1); only AVR is exposed. A clamp in `u8g2gl_apply_clip` is cheap insurance, not a live defect |
| G5 | The stub records clip calls but does not model U8G2's exclusive bound | **Accepted** — PR-06's container-edge pixel test is the real check |
| G6 | The "major only from 1.0" branch of the guard has no test | **Accepted** — no runtime at major 1 exists to test against |
| G7 | This branch's `rules/03-versioning.md` predates `main` @ `ef73776` | **Rebase before submission** |

### Proposed WO4c — runtime compiles against real U8G2 (awaiting the owner)

**Not added to the ledger on the PA's judgement** — the owner has just set it at
fourteen. Recommended because G1 is a hard compile failure in merged code that PR-05's
first real build would hit, and the cause — a test stub offering an API the real library
lacks — will recur unless the stub is corrected:

- the state saver reads the font via `display.getU8g2()->font`;
- the stub stops declaring `getFont()` and gains `getU8g2()` returning a struct with a
  `font` member, so the runtime can no longer compile against an API real U8G2 lacks;
- G4's far-corner clamp in `u8g2gl_apply_clip`.

Small, runtime-only, and independent of WO5a–WO12, so it can land anywhere in the stack
before submission. Evidence: U8G2 2.36.18 in departures-board-v3's PlatformIO cache,
read, nothing fetched.

### WO5a — complete (`a31527c`)

**Verified independently:** commits only on the WO5a branch; runtime `src/` and
`test/` untouched; C++ 284 unchanged, zero warnings; CLI 406 → **418**, `tsc` and lint
clean. `bind_text_int` appears nowhere in the manifests or the bundle; `bind_text` is
declared once per subject type on `u8g2gl_obj`, `u8g2gl_label` and `u8g2gl_button`.

**Delivered:** `U8G2GL_INAPPLICABLE_FLAG` for `disabled` on a drawing element, decided
from the effective manifest, never a tag; bindings merged by (name, type), with WO3's
same-setter inference removed, so a string subject on an int-only binding fails again;
`U8G2GL_MIXED_EMISSION_TARGETS`; the unknown-`extends` message now carries the §6.5
remedy; single-file `validate` of a bundled framework manifest no longer reports
shadowing, while a project copy still does.

**The worker ran its new tests against the base** in a throwaway worktree: eight fail
there, one or more per line item, and every control passes on both. One existing test
changed, correctly — it pinned the replace-by-name binding merge this work order
reverses.

**Triage:**

| # | Finding | Placed |
|---|---|---|
| 1 | Flag values are never checked: `flag="hiden"`, or a directive with no `flag`, validates silently | **WO7** — its types pass already walks binding directives on the expanded tree |
| 2 | "Is a drawing element" is spelled in three places (schema pass, prop checks, cross-test) | **WO8** — one registry helper, the three call sites migrated. Realisation needs the same predicate, and PR-3R's evidence says three copies is where the next defect hides |
| 3 | `bind_text_int` still appears in `docs/ui_flows.md:174` and d19 | **Chief Architect** |
| 4 | A binding name now appears once per type, so emission must choose the overload matching the subject, never the first by name | **WO8, WO10, WO11** |
| 5 | Composites are not checked for mixed emission targets | **Accepted** — composite props carry neither `setter=` nor `draw=` |
| 6 | Single-file mode reports `UNKNOWN_SCHEMA_VERSION ''` for any non-project file | **WO5b** — the single-file path moves into `loadProject()` |
| 7 | WORKORDERs said "stop and report"; dispatch prompts said "record and continue" | **Resolved** — defined once under Standing instructions |

### WO5b — complete (`dc82dea`)

**Verified independently:** commits only on the WO5b branch; runtime, manifests and
`docs/` untouched; C++ 284 unchanged, zero warnings; CLI 418 → **458**, `tsc` and lint
clean. **End to end through the built CLI**, on a throwaway project:

- a clean `generate` writes six stamped files (`// source`, `// schema`, `// generator`,
  `// target`) with no timestamp anywhere;
- `--check` exits 0 on an up-to-date directory and 1 after a hand edit, naming the file;
- with a `<bdf>` font, `validate` exits 0 with `U8G2GL_NOT_YET_SUPPORTED` as a
  **warning** and `generate` exits 1 with the same code as an **error**, naming PR-04b,
  and writes nothing — decision 1's journey split and decision 3's refusal, as required.

**Decisions accepted:** `validate()` defaults the policy to `'warning'` and `generate()`
fixes `'error'` with no override; `--out` is relative to the working directory while
`<output dir>` is relative to the project; unknown `generate` options exit 2; new code
`U8G2GL_UNKNOWN_TARGET` with suggestions; `--json` `files` carries
`created | updated | unchanged | deleted`. Existing `validate` fixture assertions moved
from 0 to 3 and 2 warnings, correctly — those fixtures use `<bdf>` and `<focus_ring>`.

**S1 — spec disagreement, resolved for the header.** §13.9 says the header carries
source path, schema version and generator version "only"; §13.12's worked example shows
a `Target:` line. The spec contradicts itself; the worker included the target, which
§13.12 and the WORKORDER both require. Kept. §13.9's "only" → **Chief Architect**.

**Triage:**

| # | Finding | Placed |
|---|---|---|
| 1 | **The parser drops `extends` on a composite** (`parse-widget-manifest.ts:240–257` sets it only when there is no `<view>`). An author who writes `<widget extends="…"><view>` has `extends` silently ignored, so the PR-08 refusal for a composite with C++ can never fire from real XML. **Checked by the PA against the source** | **WO7** — the parser keeps `extends` on a `<view>` manifest; the refusal fires; a composite without `extends` still inherits `u8g2gl_obj` via the registry |
| 2 | Collections already **error** in `validate`: pass 2 reports a declared collection child such as `<column>` as `U8G2GL_UNKNOWN_COMPONENT`, so decision 1's "warning in `validate`" does not hold for collections | **WO7** — a child tag the parent's effective manifest declares as an `<element>` is known; only the not-yet-supported policy reports it |
| 3 | `src/core/index.ts` does not export the generator | **WO6** — it exposes the resolver from core anyway |
| 4 | `<output prefix>` is parsed but unused; unit names are hardcoded `ui_*` | **WO9** — decide against §13.4's fixed `ui_` identifiers; if it cannot mean anything, diagnose it rather than silently accept it |
| 5 | Diagnostics sort with locale-dependent `localeCompare` (pre-existing in `validate.ts`) | **WO12** — determinism: §13.9 orders diagnostics by file, line, column, and locale must not change that |
| 6 | `getPackageVersion()` falls back to `'0.3.0'`, which would stamp a wrong generator version into committed output | **WO9** — the first work order emitting real content; fail loudly instead |
| 7 | `<output dir>` is never validated; `dir="../src"` is accepted | **WO12** |
| 8 | Deleting stale generated files leaves empty directories | **WO12** |
| 9 | `generate` usage errors are prose on stderr, not JSON (matching `find`) | **WO12** — the [D-16] `--json` contract |

### WO6 — complete (`6b5d562`)

**Verified independently:** commits only on the WO6 branch; runtime and `docs/`
untouched; C++ 284 unchanged, zero warnings; CLI 458 → **550**, `tsc` and lint clean.
`validate-geometry.ts` imports the resolver and no longer parses numbers itself — one
evaluator, as required. **End to end through the built CLI** against a 128-wide target:
`width="#screen_width - 8"` validates; `x="#screen_width - 8" width="16"` fails with
`U8G2GL_OUT_OF_BOUNDS` reporting the computed value ("extends to x=136, display is 128px
wide (0..127)"); `x="10 / 0"` gives `U8G2GL_DIVISION_BY_ZERO` naming the expression,
attribute and element; `right="0" width="40"` resolves. The worker's new validator tests
fail 7 of 13 at the base, with the other 6 as controls.

**Delivered:** `cli/src/core/resolver/` — integer-only evaluator with truncating
division and `int32_t` range checks on every intermediate; anchor rules; a resolved model
with per-coordinate provenance. Over-constraint is raised only in the resolver now, with
its message unchanged. `generate()` resolves against the built target and refuses on a
resolution error. Core exports the resolver and the generator (WO5b carry).
`CommonAttributes` no longer types geometry or `hidden`, pinned by a type test (WO3
carry). New codes: `UNKNOWN_CONSTANT`, `NON_INTEGER_CONSTANT`, `DIVISION_BY_ZERO`,
`MALFORMED_EXPRESSION`, `INTEGER_OVERFLOW`.

**Decisions accepted:** `hcenter` with `x` or `right` is over-constrained — consistent
with §7.2's "supplying all three is a validation error"; centring floors a negative
remainder, which is §7.2's "round down"; unary minus is accepted; a constant's value must
be an integer literal. `INTEGER_OVERFLOW` beyond the four named codes is right: it keeps
§13.2's `int32_t` claim honest.

**Triage:**

| # | Finding | Placed |
|---|---|---|
| 1 | `validate` checks bounds only against the first target; `generate --target <other>` does not re-check bounds | **Proposed WO7b** |
| 2 | An under-determined axis (`width` with no `x`) has no spec default; the resolved model leaves `x` absent | **Proposed WO7b** — with 4 |
| 3 | `hcenter`/`vcenter` values are never type-checked; `hcenter="yes"` centres | **Proposed WO7b** |
| 4 | Deferral is silent: `$prop` in a screen, or `#parent_height` under a parent with no height, resolves to nothing | **Proposed WO7b** — after expansion, an unresolved or under-determined coordinate on an element whose manifest declares geometry must be an error, never a silent absence reaching emission |
| 5 | Anchor-derived values are not range-checked; the runtime stores coordinates as `int16_t` while §13.2 says `int32_t` | **Chief Architect** (§13.2 vs runtime); the range check itself joins **proposed WO7b** once the width is ruled |
| 6 | A `<const>` named like a built-in (`screen_width`) is shadowed silently | **Proposed WO7b** — a reserved-name error, §13.4's rule applied to constants |
| 7 | An `<int>` constant's value is checked only where used, not where declared | **Proposed WO7b** |
| 8 | Anchors on centre-positioned elements (circle, ellipse, pixel) are undefined; `right` is accepted on `u8g2gl_line`, which has no `x` | **Chief Architect** (spec gap); interim rule in **proposed WO7b**: anchors only where the effective manifest declares `x`, `y`, `width`, `height` (§6.2's rectangular convention) |
| 9 | §7.3's `<target_override>` is not resolved | **Accepted — [Q-1]**, still deferred until two real targets exist |
| 10 | A `types.test.ts` title still says "all 23 required diagnostic codes" | **End-of-PR readability review** |
| 11 | `generate` resolves the first target twice | **WO8** — consume `GenerateResult.resolved`; no third resolve |

### Proposed WO7b — the geometry contract (awaiting the owner)

**Not added on the PA's judgement.** WO7 already carries five findings on top of its own
scope (expansion, `$prop` substitution, prefixing, mangling), and piling seven validator
rules into the same diff would make it unreviewable — the reason the owner approved
splitting WO5. Recommended as **WO7b, after WO7**, because findings 2 and 4 can only be
judged once composites are expanded and every coordinate has had its chance to resolve.

Scope: findings 1, 2+4, 3, 6, 7, 8 above, and 5's range check once the Chief Architect
rules on `int16_t` versus `int32_t`. Validator and resolver only; no emission, no runtime.
If the owner declines, the same items fold into WO8, which is the first consumer that
cannot tolerate an absent coordinate.

### WO7 — complete (`a19b65a`)

**Verified independently:** commits only on the WO7 branch; runtime and `docs/`
untouched; C++ 284 unchanged, zero warnings; CLI 550 → **596**, `tsc` and lint clean.
**End to end through the built CLI** with a `card` composite whose label binds
`$title_subject` and sizes against `#parent_width`:

- a clean instance validates;
- `title_subject="nope"` gives `U8G2GL_UNKNOWN_SUBJECT` at the instance — "Prop
  'title_subject' of `<card>` 'c' is given 'nope' as a subject name, but globals.xml
  declares no subject 'nope' (§6.4)";
- a child of width `#parent_width + 20` gives `U8G2GL_OUT_OF_BOUNDS` measured against the
  **instance**, not the display — "extends to x=120, containing element `<card>` is
  100px wide (0..99)" — with the instantiation chain attached.

The worker did not run its new tests against the base; the end-to-end run above is the
substitute evidence that expansion changed behaviour.

**Delivered:** `expand.ts` (argument binding, `$prop` and subject substitution,
recursive prefixing, no invented names), `mangle.ts` (§13.4's full table, reserved
prefixes, keywords, `U8G2GL_NAME_COLLISION` naming both sources), `provenance.ts`
(original location plus instance chain, appended to messages so `Diagnostic` keeps its
shape). §13.12's identifiers and geometry asserted on a 256-wide display. Composite top
levels are bounds-checked per instance. All four carries closed: types pass on the
expanded tree, flag values checked with near-miss suggestions, the parser keeps `extends`
on `<view>` manifests (end-to-end: `validate` warns, `generate` refuses), declared
collection children are no longer `UNKNOWN_COMPONENT`. New code `U8G2GL_UNKNOWN_PROP`.

**PA scoping error — F1.** WO7's line item required a collision to be a hard error, and
the module does exactly that, but I drew the boundary around the resolver and never
named the two call sites. So **neither `validate` nor `generate` calls the mangler yet**,
and Pass 7's older one-level check still runs. Same class of error as PR-3R's WO5:
trace an objective to the surface that delivers it. → WO8.

**Triage:**

| # | Finding | Placed |
|---|---|---|
| F1 | Mangling not wired into `validate` or `generate`; the older one-level collision check still runs, naming one source | **WO8** — one `mangleIdentifiers` call on the single pipeline; retire Pass 7's check; `generate` refuses on its errors |
| F2 | `generate()` resolves unexpanded screens, so its resolved model has no composite interiors | **WO8** — expand once, then resolve |
| F3 | Expansion runs twice per `validate` (Passes 5 and 6) because `ValidateInput` cannot carry one result | **WO8** — with F2: one expansion, shared |
| F4/F5 | Font, image, style and enum arguments are not checked after substitution; `font="nope"` passed to a composite validates | **Proposed WO7b** |
| F6 | `hidden="$p"` cannot be substituted: the parser makes `hidden` a boolean before expansion | **Proposed WO7b** |
| F7 | The [D-20] bound-geometry container check still walks unexpanded trees, missing nested composites | **Proposed WO7b** |
| F8 | The flag set (`hidden`, `disabled`) is spelled in two passes | **WO8** — with the registry predicate consolidation already there |
| F9 | A string `$prop` inside longer text (`text="Hi $who"`) is not substituted; the spec is silent | **Chief Architect** — spec decision; interim in proposed WO7b: diagnose it rather than pass `$who` through literally |
| F10 | A required prop that also has a default is reported missing; no schema rule rejects the declaration | **Proposed WO7b** — `required` with `default` is a schema error |
| F11 | A `geometry.test.ts` title undersells the per-instance check | **End-of-PR readability review** |
| F12 | §6.4's example uses `format="HH:MM"`; the clock manifest accepts `hh_mm` | **Chief Architect** |
| S1 | §6.6 says user tags carry `wd_` by convention; §13.4 reserves `wd_`, so a composite named `wd_card` is rejected | **Chief Architect** — the spec contradicts itself on the recommended user prefix |

**Proposed WO7b, enlarged.** WO7's evidence strengthens the case for it: the expansion
it now runs makes silent deferral and under-determined axes judgeable, and it surfaced
four more checks that only mean something after substitution (F4/F5, F6, F7, F10) plus an
interim rule for F9. Recommended scope is now WO6's findings 1, 2+4, 3, 6, 7, 8 and WO7's
F4/F5, F6, F7, F9-interim, F10 — every "validate the expanded tree" check in one place,
which also answers WO7's note that these checks must run on the template or the expanded
tree, never both.

### Rulings on WO4c and WO7b — Chief Architect, delivered in the owner's session, 2026-09-14

Recorded in PROGRAM.md; spec at `main` @ `5f2574f`. **Ledger is now sixteen.**

Real U8G2 2.36.18 was also found in esp32-app-foundation's PlatformIO cache, so the
following are checked against real source.

1. **WO4c — APPROVED, extended.** Read the font through `getU8g2()->font` and drop
   `getFont()` from the stub. **F1 is settled: the clip window's far corner is
   exclusive** — `u8g2.h:352/354` document `clip_x1`/`clip_y1` as "(excluded)", and
   `u8g2_clip_intersection2` agrees; the one function holding the convention cites that
   instead of an unverified note, and PR-06's edge test now guards it rather than
   discovering it. **New finding:** the stub's coordinate types are wrong — the stub takes
   `int`, real U8G2 takes `u8g2_uint_t` (`uint16_t`, `U8G2_16BIT` on), so on hardware a
   negative origin wraps (−5 → 65531) and no degenerate-input test against the `int` stub
   can catch it. Retype stub coordinates, make conversions explicit, clamp the clip window
   at both corners.
2. **WO7b — APPROVED.** The contract is normative in §7.2: anchors only where the manifest
   declares `x`, `y`, `width`, `height` (the PA's interim rule, made permanent); every
   element fully positioned, never a silent zero; `hcenter`/`vcenter` strict booleans;
   `screen_width`, `screen_height`, `parent_width`, `parent_height` reserved; constants
   validated where declared; bounds checked for the target being generated.
3. **§13.2 — coordinates are `int16_t`**, matching `u8g2gl_obj`. Other `int` properties
   stay `int32_t` (`set_time(uint32_t)` needs the width). "Fits `int16_t`" and "inside its
   container" are separate checks; WO7b adds the first.

### U8G2 dependency — decided

**Owner decision (2026-09-14), verbatim, as relayed by the Chief Architect:**

> "submodule approach is fine with pinned like the other example I gave you is fine"

The "other example" is esp32-app-foundation's `modules/LVGLDisplay`, which declares a pinned
`library.json` dependency rather than committing the library. The owner authorised fetching
U8G2 into this repository as a submodule.

**Version: U8G2 2.36.18.** The newest upstream tag is 2.37.1, but the PlatformIO registry
stops at 2.36.18 (released 2026-03-08), applications install U8G2 from that registry, and
esp32-app-foundation already builds 2.36.18 — so tests and firmware stay on one version.
Because 2.36.18 is the chosen version, no "2.36.18" reference in PROGRAM.md, PROGRAM-PLAN.md
or design_spec §21 changes.

**In PR-04 (WO4c):** submodule at `extern/u8g2` pinned to tag 2.36.18; a host CMake target
compiling the runtime against U8G2's real headers — WO4c's acceptance test, the check that
would have caught `getFont()` and the `int`/`u8g2_uint_t` mismatch; `THIRD-PARTY-NOTICES.md`
with a U8G2 row (code BSD-2-Clause; fonts licensed per font group, U8G2 wiki "fntgrp"); the
catalogue builder defaults to the submodule and records the U8G2 commit — closing Q-11.

**PR-05 (not PR-04, recorded only):** the integration module declares
`olikraus/U8g2@^2.36.18` in `library.json`, and foundation's notices gain a row.

**Record-keeping done in this PR:** PROGRAM.md's U8G2 decision section now carries the owner
quote in place of "the owner hasn't confirmed it"; PROGRAM-PLAN.md's "*(CA recommendation,
awaiting owner confirmation)*" now reads "confirmed by the owner 2026-09-14".

**Stack position.** WO4c is numbered for its origin (G1 in WO4b's review) but sits after WO7
in the stack: WO4c → WO7b → WO8. The stack is serial and WO4c touches no file WO5a–WO7 did,
so placing it at the tip avoids rebasing finished work orders a second time.

### WO4c — first pass (`7924d24`), `partial`; re-dispatched

**Verified independently:** commits only on the WO4c branch; `docs/`, `PROGRAM*.md` and
manifests untouched; `extern/u8g2` pinned at `d66b49af3e48` (2.36.18); `getFont` survives
only in comments. **Fresh configure and build:** zero warnings, **300** C++ tests including
`RealU8g2.RuntimeCompilesAgainstRealHeaders`, which the worker showed fails on the base
with exactly `no member named 'getFont' in 'U8G2'`. CLI 596 → **602**, `tsc` and lint
clean. The rebuilt catalogue is byte-identical; its U8G2 tag and commit are recorded in
`cli/src/data/catalogue-source.json`, leaving the `CATALOGUE` export's shape unchanged —
**Q-11 closed**. `THIRD-PARTY-NOTICES.md` added. `u8g2gl_coord.h` holds only the
conversion helpers.

**S1 and H1 settled from the pinned source — and the PA's instruction was wrong.** WO4c's
WORKORDER said "no conversion may silently wrap: clamp, shorten or skip". The worker could
not apply that to text (a scrolling label draws at negative x every step) and reported that
"skip" now hides outlines, rounded boxes, bitmaps and circles partly off the left or top
edge. Reading `extern/u8g2/csrc/`:

- `u8g2_clip_intersection2` (`u8g2_hvline.c:87–99`) handles `a > b` explicitly; its comment
  says a plain `return 0` "will not handle the case with negative a";
- `u8g2_is_intersection_decision_tree` treats a wrapped span as intersecting;
- frames, boxes, XBM and glyphs all reach `u8g2_DrawHVLine` → `u8g2_clip_intersection2`;
  circle outlines plot per pixel, where a wrapped negative pixel is correctly off-screen.

**U8G2 is designed to take a negative origin as a wrapped `u8g2_uint_t` and draw the
visible part.** So the PA's "skip" choice introduced a visible regression (H1), and S1's
explicit text wrap is correct rather than an exception. **PA ruling:** draw origins and end
points convert through one explicit, documented wrap citing that source; sizes `<= 0` are
still skipped; the clip window keeps its clamping at both corners, exactly as the Chief
Architect ruled. WO4c re-dispatched on the same branch to apply it.

**For the Chief Architect — premise correction.** The WO4c ruling stated that on hardware
a negative origin wraps so "an element partly off the left edge jumps off the right edge".
For every drawing path above, U8G2's clipping handles the wrap and draws only the visible
part. The ruling's instructions — explicit conversions, clip clamped at both corners — stand
and are followed; only that stated consequence does not hold, and it is what led the PA to
write "skip". Recorded, not applied silently. PR-06's container-edge pixel test should
include an element partly off the left edge, which checks this directly on real U8G2.

**Triage:**

| # | Finding | Placed |
|---|---|---|
| S1 | Text positions cannot follow "no silent wrap" | **Resolved by the ruling above** — explicit wrap is correct, for text and every draw origin |
| H1 | "Skip" hides partly-off-edge outlines, rounded boxes, XBM, circles | **Resolved by the ruling above** — re-dispatched to WO4c, with a partly-off-edge test per affected widget |
| H2 | The real-header target exposed only `getFont`; other stub mismatches were implicit conversions, now corrected in the stub | **Accepted** — the retyped stub and tests are what catch narrowing; the header check cannot |
| H3 | Stub measurement getters still return `int` | **WO4c follow-up** |
| H4 | U8G2 2.36.18 forces 16-bit coordinates, so WO4b's 8-bit G4 cannot occur | **Accepted** — G4 closed as not reachable on the pinned version |
| H5 | Only the Arduino build is compiled against real headers; ESP-IDF and the Wasm editor are not | **PR-06** (Wasm build) and **PR-05** (integration), recorded |
| H6 | A fresh clone fails to configure until the submodule is initialised | **WO4c follow-up** — a clear configure-time message; contributor docs at the end-of-PR review |
| H7 | `u8g2gl_coord.h` needs U8G2 on the include path | **Accepted** — every runtime translation unit already requires U8G2 |
| H8 | One catalogue test reads departures-board's U8G2 copy when present | **WO4c follow-up** — a machine-dependent test is nondeterminism |
| H9 | Stale state-saver comments outside the box (WO4b G3) | **End-of-PR readability review** |
| §11.3 | Still says `x+w-1, y+h-1` and that the state saver saves the clip | **Chief Architect** (carried from WO4b) |

### WO4c — second pass (`62dd06b`); re-dispatched for lines

**Verified independently:** commits only on the WO4c branch; `docs/`, `PROGRAM*.md`,
manifests and CLI source untouched; C++ **301**, zero warnings, including
`RealU8g2.RuntimeCompilesAgainstRealHeaders`; CLI 602, `tsc` and lint clean. The helper set
is `u8g2gl_coord_pos` (explicit wrap, citing the U8G2 source), `u8g2gl_coord_size`,
`u8g2gl_coord_clamp`, `u8g2gl_coord_span`; the skip helper is gone. H3, H6, H8 closed. The
worker also compiled every runtime source against the real headers with
`-Wconversion -Wsign-conversion` added and got no diagnostics — beyond what was asked.

**N1 — the PA's wrap ruling was too broad, confirmed in source.** `u8g2_DrawLine`
(`extern/u8g2/csrc/u8g2_line.c`) says at line 49 "no intersection check at the moment,
should be added...", computes `dx`/`dy` from unsigned coordinates (lines 51–52), and loops
pixel by pixel from `x1` to `x2` (line 78). A line from (−2, 0) to (10, 10) arrives with
`x1 = 65534`: about 65,000 iterations and a nearly flat visible part. The first pass had
skipped such lines (wrong, but cheap); the second pass passes them wrapped (wrong and
slow). The wrap ruling holds for every primitive reaching `u8g2_DrawHVLine` →
`u8g2_clip_intersection2`; `u8g2_DrawLine` has no such path.

**PA ruling:** lines, and the outline triangles composed from them, clip the segment to the
display in signed `int32_t` arithmetic before converting, so the endpoints U8G2 receives
are non-negative and in range; `u8g2_DrawPixel` still applies the clip window per pixel.
Filled triangles take signed `int16_t` vertices and are unaffected. Re-dispatched to WO4c as
one narrow item.

**Lesson recorded.** Two successive PA rulings on this conversion were each right for most
primitives and wrong for one. Both errors were found by reading the drawing path each
primitive actually takes, not by reasoning about "U8G2" as one thing. PR-06's
container-edge pixel test must include **a line partly off the left edge** as well as a
frame, so real pixels confirm both rules.

**Carried:** N2 (8-bit U8G2 builds would wrap positions above 255 into view) — **accepted**,
the pinned 2.36.18 forces 16-bit. H5, H7, H9 and §11.3 unchanged from the first-pass triage.

### WO4c — complete (`468e386`)

**Verified independently:** commits only on the WO4c branch; the third pass touched five
files, all inside the box (`u8g2gl_coord.h`, `u8g2gl_draw.h`, `u8g2gl_draw.cpp`,
`test_draw.cpp`, the WORKORDER); `docs/`, `PROGRAM*.md` and `cli/` untouched. C++ 301 →
**305**, zero warnings, including five `DrawLineClip` tests and
`RealU8g2.RuntimeCompilesAgainstRealHeaders`; CLI 602, `tsc` and lint clean.

**Delivered:** `u8g2gl_clip_line_to_display()` in `src/u8g2gl_draw.cpp` — Cohen–Sutherland
against the display's own dimensions, products in `int64_t` and rounded division, an
eight-pass bound that guarantees termination, citing `u8g2_line.c:49–52, 78`. Clipped
endpoints convert through `u8g2gl_coord_clamp` (the size rule refuses 0, which is a valid
endpoint). Outline triangles inherit it through `u8g2gl_draw_line`; filled triangles and
every other primitive keep the explicit wrap. `DrawLineClip.PartlyOffLeftEdgeReachesU8g2InsideDisplay`
failed at `62dd06b` with `x1 = 65534`, as required. The worker widened the ruling's
`int32_t` to `int64_t` for the products, correctly — they overflow `int32_t`.

**Accepted:** T1 — a clipped endpoint is rounded to a whole pixel on the true line, so a
clipped line's visible pixels can differ by about one from drawing the whole segment; this
is inherent to integer clipping. T2 — a line grazing a display corner can reach the
eight-pass bound and lose one or two corner pixels; the bound is what guarantees
termination, and the loss is cosmetic. **Both go to PR-06's container-edge pixel test,
which must include a clipped line.**

**WO4c overall.** Three passes. The work order's objective was met on the first; the second
and third corrected PA rulings on coordinate conversion — first too narrow ("skip"), then
too broad ("wrap everything") — each caught by a worker reporting what the real drawing
path does. The runtime now compiles against real U8G2 2.36.18, pinned at `extern/u8g2`, as
a `ctest` acceptance check; Q-11 is closed; `THIRD-PARTY-NOTICES.md` exists.

**Still open, carried:** H5 (only the Arduino build is checked against real headers →
PR-05/PR-06), H9 (stale state-saver comments → end-of-PR readability review), N2 (8-bit
wrap, unreachable on 2.36.18), and §11.3's clip text for the Chief Architect.

### WO7b — complete (`9970859`)

**Verified independently:** commits only on the WO7b branch; runtime C++, `extern/`,
`docs/` and `PROGRAM*.md` untouched; C++ 305 unchanged, zero warnings; CLI 602 → **641**,
`tsc` and lint clean. The worker's new and changed tests fail 31 of 71 at the base, the
remainder being deliberate controls. **End to end through the built CLI** against a project
with a 256-wide and a 128-wide target:

- `right=` on a `u8g2gl_line` → `U8G2GL_INAPPLICABLE_ANCHOR`;
- a label with `width` and no `x` → `U8G2GL_UNRESOLVED_GEOMETRY`;
- a constant named `screen_width` → `U8G2GL_INVALID_NAME`;
- `hcenter="yes"` → `U8G2GL_INVALID_ENUM_VALUE`;
- a clean screen validates, and `validate` reports the target it checked — human output
  "Geometry checked against target 'small' (…, 128x64)", and a `target` object in `--json`;
- a 200-wide label: `generate --target` 256-wide exits 0; 128-wide exits 1 with
  `U8G2GL_OUT_OF_BOUNDS`.

**Delivered:** new codes `U8G2GL_INAPPLICABLE_ANCHOR`, `U8G2GL_UNRESOLVED_GEOMETRY`,
`U8G2GL_COORDINATE_OUT_OF_RANGE` (checked before, and separately from, container bounds;
an axis that fails it is not bounds-checked), `U8G2GL_UNSUBSTITUTED_PROP`; constants
validated at declaration; substituted font/image/style/enum arguments checked;
`hidden="$p"` survives parsing and gets the boolean rule after expansion; the [D-20]
bound-geometry rule on the expanded tree; each check on the template or the expanded tree,
never both, with "reported once" tests.

**Fixture edits accepted.** Both valid fixture projects violated the new normative rules —
they declared `screen_width`/`screen_height`, left `header_bar` unpositioned, and declared a
prop both `required` and defaulted. The worker fixed the fixtures, not the rules, and no
location assertion moved. Two tests that asserted anchors on any element now assert the
rectangular-only rule. Correct: the fixtures were wrong under §7.2.

**Triage:**

| # | Finding | Placed |
|---|---|---|
| — | §13.2 says the `int16_t` rule covers "any anchor or constant", then that only a *result* must fit; WO7b checks resolved `x`/`y`/`width`/`height` only | **Chief Architect** — which values must fit `int16_t` |
| 1 | Composite expansion now runs **four** times per `validate` | **Proposed WO8a** — expand once; more urgent than when WO7 first reported it |
| 2 | Line and triangle endpoints and circle/ellipse radii are never resolved: no expressions, no `int16_t` check, no bounds check | **Proposed WO8a** — a gap in §7.2's "every element fully positioned" for non-rectangular elements, and WO9/WO10 cannot emit a draw call without literal arguments |
| 3 | `hidden` is not a strict boolean (`hidden="yes"` becomes `false`); a `hidden="$p"` written directly in a screen stays text unreported | **Proposed WO8a** — the same strictness §7.2 gives `hcenter` |
| 4 | A `$name` in a screen (outside any composite) is silently skipped for font/image/style/enum attributes | **Proposed WO8a** |
| 5 | Pass 4 still reports a missing required prop on an instance when the prop has a default, so the now-invalid declaration reads as two defects | **Proposed WO8a** |
| 6 | A `<style name="$s">` child is not checked after substitution | **Proposed WO8a** |
| 7 | `generate()` step 3 still resolves unexpanded screens (WO7 F2) | **Proposed WO8a** — with 1 |
| 8 | WORKORDER named `schema/diagnostic.ts` for `cli/src/core/schema/diagnostic.ts` | **Accepted** — the PA's shorthand |
| 9 | New tests avoid `wd_` composite names because full `validate` rejects them | **Chief Architect** — WO7 S1, still open |

### Proposed split — WO8a / WO8b (awaiting the owner)

WO8's own scope — realisation with reason codes, flattening, [D-21] capacities and
per-subject `_n<N>` observer counts — is the most consequential analysis in PR-04
(constraint 3: "price it honestly"). It already carries WO5a's drawing predicate and
overload selection, WO6's resolve-once, and WO7's mangling wiring, expand-once and flag
set. WO7b's findings add seven more. One diff containing all of it would not be reviewable,
which is the reason the owner approved splitting WO5.

**WO8a — one pipeline.** Expand once and resolve once, shared by `validate` and `generate`
(WO7 F2/F3, WO7b 1/7, WO6 11); wire `mangleIdentifiers` in and retire the one-level check
(WO7 F1); one drawing-element predicate and one flag set on the registry (WO5a, WO7 F8);
resolve line/triangle endpoints and radii with the `int16_t` and bounds checks (WO7b 2);
strict `hidden` and `$`-placeholders outside composites (WO7b 3, 4); the required-with-default
double report and `<style name="$s">` (WO7b 5, 6). Validator, resolver and generator
plumbing only — no realisation, no emission.

**WO8b — realisation and capacities.** WO8's own line items as drafted, on top of the single
pipeline, including overload selection by subject type (WO5a).

Recommended order: WO8a → WO8b. Realisation must consume one expanded, fully resolved,
mangled model; building it before that model exists would mean writing it twice. **If the
owner declines**, WO8 proceeds as one work order carrying all of the above.

### Owner approval — WO8 split, 2026-09-16

**APPROVED by the human (Matt McNeill) on 2026-09-16.** The owner's own words, verbatim:

> "And yes split WO8 is fine."

Context: the owner had the WO7b review and the split proposal above in front of them —
WO8a (one pipeline: expand once, resolve once, mangling wired in, non-rectangular geometry
resolved, five WO7b checking gaps) then WO8b (realisation, flattening, capacities,
`_n<N>` counts, overload selection). The ledger is now **seventeen** work orders. The
combined `wo8-realisation-capacities/WORKORDER.md` is retired in favour of the two.

The same message asked for a bridge prompt to the Chief Architect; it is
`CA-BRIDGE-2026-09-16.md` in this directory.

### WO8a — complete (`2954fc2`)

**Verified independently:** one commit, on the WO8a branch only; runtime C++, `extern/`,
`docs/` and `PROGRAM*.md` untouched; C++ 305 unchanged, zero warnings; CLI 641 → **669**,
`tsc` and lint clean; 20 of 38 new tests fail at the base, the rest controls. **End to end
through the built CLI:**

- `a_b` at screen level beside child `b` of instance `a` → `U8G2GL_NAME_COLLISION`, and both
  `validate` and `generate` exit 1 — the check WO7 built and nothing called until now;
- `hidden="yes"` → `U8G2GL_INVALID_ENUM_VALUE`;
- `x1="#screen_width - 8"` on a line resolves; `x1="#screen_width + 40"` →
  `U8G2GL_OUT_OF_BOUNDS`. Non-rectangular geometry is resolved and checked at last.

**Delivered:** `resolver/pipeline.ts` and `validator/shared-model.ts` — one expansion and one
screen resolution, shared by every validator pass and by `generate()`, with a test that wraps
the real `expandScreens` so a fifth expansion fails loudly; mangling wired in and the older
one-level collision check retired; the drawing-element predicate and the flag set on the
registry, every call site migrated; strict `hidden`; screen-level `$name` and substituted
`<style name="$s">` checked; required-with-default reported once. No new diagnostic codes.

**Boundary excursion — accepted.** `cli/src/core/parser/parse-widget-tree.ts` is not in the
box and the worker changed it, flagging it rather than widening scope silently. The edit is
confined to the one `hidden`-parsing function — the same function WO7b changed for the same
attribute — and line item 5 is undeliverable without it: the parser collapsed `hidden="yes"`
to `false` before any validator could see a value to report. Reviewed the diff: it replaces
`text === 'true'` with "`true`/`false` are booleans, anything else stays text", and documents
both defects that shaped the rule. Correct, and correctly disclosed.

**The expansion-count test earned its keep before it ever shipped.** A substitution the worker
used to point the passes at the shared model silently did not match; every pass fell back to
building its own pipeline and all 642 tests still passed. Lint's unused-variable error is what
exposed it. That is the vacuous-green failure mode this PR keeps meeting — a count assertion
over the real function is the guard.

**Triage:**

| # | Finding | Placed |
|---|---|---|
| 1 | A `radius` is never bounds-checked: `radius="500"` on a 128-wide display validates. Needs the centre-positioned-element semantics §7.2 defers | **Chief Architect** — with WO6 finding 8, already on the bridge |
| 2 | No `bool` prop except `hidden` is value-checked: `filled="yes"` passes. Confirmed end to end | **WO9** — emission maps a prop value to C++; `yes` is not a `bool` literal |
| 3 | A screen-level `$prop` in a `bind_*` attribute is still silent | **WO9** — same group |
| 4 | A literal `<style>` child inside a `<view>` is unchecked | **WO9** — same group |
| 5 | Non-coordinate `int` props are never evaluated, so `scroll_px_per_sec="#speed"` reaches emission as text | **WO9** — the §13.2 value helper cannot spell an unresolved expression |
| 6 | `ValidateInput.pipeline` carries a trust-based display obligation | **Noted** — WO8b and WO9 must pass the pipeline built for the target they are working on |
| 7 | "Resolve once" is true of **screens**; Pass 6 still resolves composite templates separately, as WO7b requires | **WO8b** — told explicitly not to assume it away |

### WO8b — complete (`6c2c909`)

**Verified independently:** one commit, on the WO8b branch only; runtime C++, `extern/`,
`docs/`, `PROGRAM*.md` and the validator passes untouched; C++ 305 unchanged, zero warnings;
CLI 669 → **694**, `tsc` and lint clean; no existing test changed, WO8a's expansion counter
included.

**The three things that had to be right are right.** Realisation is one pass over the whole
document, recording every reason code that held — including the three that only PR-08/PR-09
can trigger — so a reported reason is true rather than merely sufficient. The [D-18]
amendment is applied **at the outcome only**: `requiredByRule` keeps the unamended answer, so
demotion can be switched on later without rewriting the pass. Per-subject observers are object
bindings plus **exactly one** frame-dirty observer, pinned by three tests including the
zero-object case — the PR-01 constraint that was nearly lost in a stray commit. §13.12's
example reproduces exactly: five objects in order, parents `NO_PARENT,0,0,0,NO_PARENT`, `rule`
as interleaved draw calls, and total bindings **4** where the product would be 5.

**The worker priced its own base run honestly**, which is worth recording: 25 of 25 new tests
fail at the base, but 23 fail only because the module does not exist there. It reported "2
discriminate behaviour" rather than claiming 25.

**Finding 1 reproduced by the PA, and it is a live defect.** A project of 128 composite
instances reaches **256 objects**; `validate` and `generate` both exit 0 with no diagnostic.
`countScreenObjects` omits composite containers and counts drawing elements — both inverted by
[D-18] — so its comment claiming it "can never miss a real overflow" is false. `parent_index_`
is a `uint8_t`, so emission would write an unrepresentable parent table. **This must be fixed
before WO9/WO10 emit.**

**Triage:**

| # | Finding | Placed |
|---|---|---|
| 1 | The 254-object ceiling can be missed entirely; the conservative over-count is now an under-count | **Proposed WO8c** — replace it with realisation's exact count |
| 2 | `U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT` is `generate`-only, so `validate` passes a document `generate` refuses | **Proposed WO8c** — decision 1's journey split: warning in `validate`, error in `generate` |
| 3 | The pipeline's per-target display obligation is met at the only call site but unenforced by the types | **Noted** — WO9 threads the pipeline for the target it emits |
| 4 | A focus ring cannot name a composite child | **PR-09** — recorded; it decides whether entries may name mangled identifiers |
| 5 | Every class-backed element inherits `bind_text` and geometry bindings from `u8g2gl_obj.xml`, which capacity counts inherit | **Q-10**, already deferred to E-2 |

### Chief Architect rulings on CA-BRIDGE-2026-09-16 — applied 2026-09-16

All seven ruled; the spec edits and record-keeping were delegated to this PR. What changed:

1. **§13.2 — as implemented.** Only a **resolved coordinate** must fit `int16_t`; constants
   keep their `int32_t` check at declaration, and anchor arithmetic may pass through wider
   intermediates. The first sentence now says "a resolved coordinate".
2. **§13.4 — `wd_` is no longer reserved.** By [D-12] a tag *is* its class name, so `wd_`
   names classes users write and the generator never produces one. **Precondition confirmed
   before changing it:** `wd_` appears in the CLI only in two copies of the reserved-prefix
   list (`mangle.ts:50`, `validate-identifiers.ts:27`) and one prefix-strip
   (`parse-widget-tree.ts:380`) — no emitted symbol, so nothing needs renaming. The code
   change and a restored `wd_` fixture are **proposed WO8c** (those files are a worker's, not
   the PA's, and the two duplicate lists should collapse to one).
3. **§11.3 — corrected to the pinned source.** `setClipWindow(x, y, x+w, y+h)`, citing
   `u8g2.h:352/354`; the state saver saves draw colour and font only, because U8G2 has no
   getter for clip window, font mode or bitmap mode; clip lifetime belongs to the render
   wrapper.
4. **Negative origins — accepted, no action.** The wrap-everywhere-except-lines split stands.
5. **`$prop` interpolation — hard error ratified for 0.4**, and recorded as **Q-13** in §21 as
   a candidate for the next schema bump.
6. **Three inconsistencies fixed:** §6.4's example is `format="hh_mm"`; §13.9 admits the
   Target line, with the reason (the target is an input, so determinism is unaffected);
   `ui_flows.md` now shows `bind_text` declared once per subject type, and **d19 keeps its
   text** with a dated amendment appended — decision records are history.
7. **Obligations recorded:** `PROGRAM-PLAN.md`'s PR-06 row now carries the container-edge
   pixel test (exact-bounds clip, frame partly off the left edge, clipped line with the ~1px
   and corner-pixel tolerances) and a real-header compile check for the Wasm build; the PR-05
   row carries the same check for ESP-IDF. **§21's Q-11 is marked closed** by WO4c, citing
   `catalogue-source.json`.

### Proposed WO8c — validator alignment (awaiting the owner)

Three small validator changes that the rulings and WO8b's findings imply, kept out of WO9 so
emission stays one reviewable diff:

- **The exact object ceiling.** Replace `countScreenObjects` with realisation's exact count,
  so the 254 structural limit ([A-3], [D-21]) is enforced rather than missed. A regression
  test at 256 objects — the case that passes today.
- **Realisation's refusal obeys the journey split.** `U8G2GL_DRAWING_ELEMENT_NEEDS_OBJECT`
  becomes a warning in `validate` and an error in `generate`, like every other
  not-yet-supported and refusal path (decision 1), so `validate` never passes a document
  `generate` refuses.
- **`wd_` un-reserved (ruling 2).** Remove it from both prefix lists, collapse the two lists
  into one, and restore a `wd_`-named fixture so a test covers §6.6's convention.

Small, validator-only, and a prerequisite for WO9: emission must not be written against a
ceiling check that can under-count. **If the owner declines**, these fold into WO9.

### Owner approval — WO8c, 2026-09-17

**APPROVED by the human (Matt McNeill) on 2026-09-17**, with the placement left to the PA.
The owner's own words, verbatim:

> "you can add wo8c or wo9 whichever you prefer"

**PA choice: a separate WO8c.** Three reasons, all from this PR's own evidence:

1. **It is a prerequisite, not an extra.** Emission must not be written against a ceiling
   check that under-counts; WO9 would otherwise inherit a guard the PA has demonstrated does
   not fire.
2. **Different failure modes.** WO8c is validator alignment — one count, one severity rule,
   one prefix list. WO9 is new emitted surface with golden files. Mixing them puts a
   behaviour change and a new artefact in one diff, which is what the owner split WO5 and WO8
   to avoid.
3. **WO9 already carries four value-completeness gaps** from WO8a on top of its own scope.

The ledger is now **eighteen** work orders. WO9's base moves to WO8c.

### WO8c — complete (`ae1e7a9`)

**Verified independently:** one commit, on the WO8c branch only; `docs/`, `PROGRAM*.md`,
runtime C++, manifests and realisation's own analysis (`realise.ts`, `capacities.ts`)
untouched; C++ 305 unchanged, zero warnings; CLI 694 → **702** across 46 files, `tsc` and
lint clean. One reserved-prefix list survives — `['u8g2gl_', 'ui_']` in `mangle.ts`, imported
by `validate-identifiers.ts` — and `fixtures/valid/widgets/wd_badge/` exists.

**End to end through the built CLI:**

- 128 composite instances → 256 objects → `U8G2GL_TOO_MANY_OBJECTS`, and **both** `validate`
  and `generate` exit 1. This is the case that exited 0 twice yesterday;
- 127 instances → 254 objects → passes;
- **300 drawing elements → passes.** The old count rejected them, which nobody had noticed:
  it was wrong in *both* directions, and the worker found the second half;
- a `wd_thing` composite validates.

**The dependency inversion is accepted, and correctly disclosed.** The ceiling is now Pass 9
checking `RealisedScreen.objects.length` — the length of the array emission writes a `uint8_t`
parent table for — so the check cannot disagree with the thing it protects. That makes the
validator import `generator/realise/`, which is backwards. The worker took that over
inventing a second count, and said so plainly. It is the right trade: **a drifted second count
is the defect**, as this very ceiling demonstrated. Three source scans now fail if a second
count or a second prefix list appears.

**Triage:**

| # | Finding | Placed |
|---|---|---|
| 1 | `parse-widget-tree.ts:380`'s comment now misstates why it strips `wd_`, and the strip pools `<wd_badge>` with `<badge>` for name synthesis | **End-of-PR readability review.** The pool is harmless — the synthesised-name allocator is document-wide and dedupes (PR-03 WO8) — but the comment is now wrong |
| 2 | Realisation's home (`generator/realise/`) is a layering wart now that the validator consumes it | **Recorded.** A move to a neutral `core/` location is behaviour-free; it is not worth churning mid-emission. Raise it at the end-of-PR review, where the reviewer sees the whole shape |
| 3 | `notYetSupportedPolicy` now also carries realisation's refusal severity, so the name is narrower than its meaning | **End-of-PR readability review** |
| 4 | `validate` now realises on every run — correct, but new work in the path the designer drives per keystroke | **Accepted, recorded for the editor track.** Correctness first; realisation is linear in elements. E-1/E-2 should measure it against ui_spec §4.1's 16 ms budget before optimising |
| 5 | `Capacities.maxObjectsPerScreen` (max across screens) and the per-screen ceiling answer different questions with similar names | **WO12** — it reports capacities in the §18.1 budget |
| 6 | `DRAWING_ELEMENT_NEEDS_OBJECT`'s comment in `diagnostic.ts` still reads as build-only | **End-of-PR readability review** |

**Process lesson added to Standing instructions:** the worker ran a full suite concurrently
with a base-worktree suite and a `cmake`/`ctest` cycle, got "seven files failing in 3616s",
and re-ran it alone to get 702/702 in 5.9s. It reported the contended figure as measuring
nothing rather than as a result. Every green figure must come from an uncontended run.

### WO9 — complete (`136c0c2`) — the generator emits C++

**Verified independently:** one commit, on the WO9 branch only; `include/`, `src/`, `extern/`,
`docs/`, `PROGRAM*.md`, the manifests and realisation's analysis untouched; C++ 305 unchanged,
zero warnings; CLI 702 → **776** across 51 files, `tsc` and lint clean — every suite run alone,
per the new standing instruction.

**Generated a project end to end and read the output.** Seven units: `u8g2gl_generated_config.h`,
`ui.hpp`, `ui_subjects.cpp`, `ui_styles.cpp`, `ui_fonts.cpp`, `ui_images.cpp` and the screen
unit. What that showed:

- **Capacities come from realisation, not a guess:** for a two-object screen,
  `MAX_OBJECTS_PER_SCREEN 2`, `MAX_BINDINGS_PER_OBJ 1`, `MAX_TOTAL_BINDINGS 2`,
  `MAX_STYLES 1` — the true sum, not the product ([D-21]).
- **`_n<N>` is real:** `u8g2gl_subject_string_n<16, 2> ui_subject_station;` with the comment
  "2 observers; 2 object bindings; no frame-dirty observer; 16 usable characters, so
  max_len + 1 bytes (§8.2)". That is the PR-01 constraint, emitted and explained.
- **Header stamp** carries source, schema, generator and target, with **no timestamp**.
- **Regeneration is byte-identical** (`diff -r` clean across two `--out` runs), and `--check`
  exits 0 on an up-to-date directory.
- **`<bdf>` is refused** with the PR-04b message; `filled="yes"` now errors
  (`U8G2GL_INVALID_ENUM_VALUE`) — the value carry closed.

**Two decisions accepted, one of them a good withdrawal.** The worker first emitted a
`.cmake` file of `-D` definitions for WO4's F5, then withdrew it: it spelled the four
capacities a second time — exactly the drift WO8c spent a work order removing — and CMake's
`#` comments could not carry the `// GENERATED` marker the writer uses to delete stale output,
so it would have lingered forever once renamed. Integration is now `-include` of the one
header. **WO10 proves it.** `<output prefix>` is diagnosed as meaningless against §13.4's
fixed `ui_` identifiers, with `prefix="ui_"` accepted as a redundant restatement.

**Base proof priced honestly again:** of 37 new tests, the worker reported **10** as
behavioural failures at the base and said the other 27 fail trivially because their modules do
not exist there.

**Triage:**

| # | Finding | Placed |
|---|---|---|
| 1 | Every drawing manifest marks `x/y/width/height` `required="true"`, so §6.2's and §8.4's own `bind_width` examples cannot validate and no drawing element can be anchor-positioned | **WO10** — **PA decision:** the manifests drop `required` on geometry a binding or anchor can supply. This is manifest data ([D-17]), not schema vocabulary, and WO7b's "every element fully positioned" rule already catches a genuinely missing position |
| 2 | `u8g2gl_circle.xml` / `u8g2gl_ellipse.xml` declare `segments` as an enum with **no `emit=`**, so no enumerator can be spelled — **WO10 cannot emit a circle or ellipse** | **WO10** — `emit="U8G2GL_DRAW_SEGMENT_{VALUE^^}"`; the runtime's `u8g2gl_draw_segment_t` spells `UPPER_RIGHT`, `UPPER_LEFT`, `LOWER_LEFT`, `LOWER_RIGHT`, `ALL`, and its values mirror U8G2's option bits and must not be renumbered |
| 3 | §13.5's example reads `ui_subject_level.value`, which cannot compile — the member is private and `get()` is the accessor | **Chief Architect** — spec defect; the worker followed the runtime |
| 4 | §13.7's emitted-file list names subjects, fonts and images but not a styles unit, which the work order required and WO9 emits | **Chief Architect** — add the styles unit to §13.7 |
| 5 | A `<builtin>` font name is never validated: emission aliases it verbatim (`ui_font_<name> = <name>`), so a typo becomes a link error in the user's firmware build. **Checked by the PA** — nothing in the validator looks at it. Now checkable, since U8G2 is pinned at `extern/u8g2` | **WO12** — validate `<builtin>` names against U8G2's own font symbols, the same way [D-14] derives the display catalogue |
| 6 | A subject's `value` is never type-checked by any pass (emission now reports it); a string's initial value is never checked against `max_len`; `StyleDecl` still carries `truncate`, which [D-19] deleted | **WO12** |
| 7 | `U8G2GL_UNRESOLVED_GEOMETRY` is now reused for non-coordinate `int` props, where its name is narrower than its use | **WO12** — with the `notYetSupportedPolicy` rename |
| 8 | A `<bind_flag_if_*>` directive's `subject="$p"` at screen level is still silent — WO8a's carry named the attribute form only | **WO10** — it emits bindings |

**One deliberate behavioural change in an existing test, accepted:** with every `type="bool"`
prop strict, `hide="yes"` is now reported at the attribute the author wrote rather than on the
substituted `hidden="$hide"` inside the template. Still exactly one diagnostic, and closer to
the author.

### WO10 — complete (`3a58ab3`) — generated code compiles and runs

**Verified independently:** commits only on the WO10 branch; runtime sources, `docs/`,
`extern/` and `PROGRAM*.md` untouched. Suites run one after another, never together: C++ 305 →
**315** with zero warnings, ten of them the generated fixture's; CLI 776 → **824** across 54
files, `tsc` and lint clean.

- **No direct `render()` calls.** `.render(` appears only in comments; `u8g2gl_render_object`
  is emitted 6 times in the home screen and 4 in the gauges screen. The worker also proved the
  check is not vacuous by temporarily emitting `ghost.render(display);` — both hidden-object
  tests failed.
- **The generated capacities reach the library's own compilation.** The runtime is compiled a
  second time as `u8g2gl_fixture_runtime` with the generated config force-included (WO9's
  design). A probe compiled *into that library* asserts the binding total equals 5, counted by
  hand; without the forced include the library fails to compile with `'(32 * 8) == 5'`. [D-21]
  is proven, not assumed.
- **Regeneration matches the committed fixture byte for byte**, apart from the one line the
  goldens deliberately pin: `// generator: 0.0.0-golden` where a live run stamps `0.6.0`, so a
  version bump does not churn the fixture. **WO12's plan assumed the opposite** and is adjusted.
- `.vite/` at the repo root is vitest's cache and is already git-ignored — finding 13 closed.

**Stop-and-report 1 — confirmed by the PA, and it is a runtime defect in merged code.** When a
bound subject changes, `u8g2gl_on_text_binding_change` (`src/u8g2gl_obj.cpp:417`) fires, and
its own comment says "the widget reads the subject directly when it renders". But
`u8g2gl_label::render()` draws only `text_`, which only `set_text()` assigns, and nothing
assigns it from the subject. So `bind_text` marks the frame dirty and **nothing appears** — for
string subjects and formatted int subjects alike, since PR-01/PR-03. §13.12's `msg` and
`bar_location` would be blank on a device whatever the generator emits. The fixture test is
green because it does not assert bound text, and the worker said so rather than asserting
around it. **Not the generator's defect, and outside every PR-04 box so far → proposed WO10b.**

**Stop-and-report 2 — reproduced, and it was the PA's premise.** WO10's work order said WO7b's
"fully positioned" rule would catch a box whose `required` size was dropped. It catches a
missing *position*, not a missing *size*: a box with no `width` and no binding now passes
`validate` (exit 0) and is refused by `generate` (exit 1, `U8G2GL_MISSING_REQUIRED`). No bad code
ships, but the validate/generate journey split is broken → **proposed WO11b**.

**Decisions accepted:** a `ui.cpp` unit for `ui_init()` and the one-per-subject frame-dirty
observers; `emit/placement.ts` translating the resolver's container-relative coordinates into
the runtime's absolute ones, reusable by WO11; screen descriptor `ui_screen_<name>`; every object
ticked, since manifests no longer declare which animate; the fixture on 128×64 to match the stub,
with §13.12 checked line for line at 256 wide in the CLI tests; two shared-helper exports with no
behaviour change; the `generate.ts` wiring excursion (+12/−6), disclosed.

**Triage:**

| # | Finding | Placed |
|---|---|---|
| SR1 | A label never draws a bound subject | **Proposed WO10b** |
| SR2 | `validate` accepts a missing size that `generate` refuses | **Proposed WO11b** |
| 1 | The manifest parser invents `set_<name>` setters for a composite's template parameters; emission filters them | **Proposed WO11b** |
| 2 | A bound position inside an offset container is treated as absolute; the spec is silent | **Chief Architect** |
| 3 | A container moved by a binding leaves its children behind | **Chief Architect** — with 2: [D-20] says absolute children only, but not absolute to *what* once emitted coordinates are device-absolute |
| 4 | §13.7's file list names neither `ui.cpp` nor WO9's styles unit | **Chief Architect** — with WO9's §13.7 item |
| 5 | The screen descriptor name is not in `mangle.ts`'s collision table, so screen `a_objs`'s descriptor can collide with screen `a`'s object table | **Proposed WO11b** |
| 6 | §13.4 checks C++ keywords but not C library names: an element named `clock` collides with `clock()`, and a WO9 golden already has one | **Chief Architect** — a §13.4 rule change (reserve the names, or prefix emitted objects); the fix follows the ruling |
| 7 | The stub is named `U8G2lib.h`, real U8G2 ships `U8g2lib.h` | **Checked by the PA — cosmetic.** The runtime headers try both spellings, so a case-sensitive build finds the real header. Rename the stub at the end-of-PR review |
| 8 | `style_*` overrides are never validated, except `style_font` | **Proposed WO11b** |
| 9 | Flag directives are under-validated: missing `ref_value`, `gt`/`lt` on bool, string or time subjects, and unknown suffixes all pass, and emission refuses them | **Proposed WO11b** |
| 10 | `bind_text_fmt` on a string subject validates, but the emitted call would not compile | **Proposed WO11b** |
| 11 | A literal `hidden` on a drawing element is rejected; only the bound form works | **Accepted** — WO3's design: a drawing element is hidden through `<bind_flag_if_*>` (§6.2) |
| 12 | Following §13.7's order literally, a named style's font overrides an element's own `font=` | **Chief Architect** — precedence |
| 13 | `.vite/` at the repo root | **Closed** — vitest's cache, git-ignored |

### Proposed WO10b and WO11b (awaiting the owner)

**WO10b — bound text reaches the label (runtime).** `u8g2gl_label` renders a bound subject:
a string subject's current value, and an int subject formatted through its `bind_text_fmt`,
read **at render time** — which is what `u8g2gl_on_text_binding_change`'s own comment already
promises, and needs no per-label buffer for the string case. A formatted int needs somewhere to
format into: a stack buffer inside `render()` costs no RAM per object, but `dots` and `scroll`
modes need the text width, so the worker states the choice and its cost. Tests assert the stub's
draw history contains the bound text, and the generated fixture's `msg` shows it. Runtime-only,
touching no file WO11 or WO12 uses.

**WO11b — validator hardening.** The validate/generate asymmetries and silent acceptances WO9
and WO10 surfaced: a missing size (SR2), invented template setters (1), the screen-descriptor
collision (5), `style_*` overrides (8), flag directives (9), `bind_text_fmt` on a string (10),
plus WO9's carries — `<builtin>` font names checked against U8G2's real font symbols, subject
`value` typing and string `max_len`, `StyleDecl.truncate`, and the `UNRESOLVED_GEOMETRY` and
`notYetSupportedPolicy` renames. **This takes the validator carries out of WO12**, leaving it
budget, `--json` and determinism, which is what it was scoped for.

**Placement.** Both are independent of WO11 (editor target), which proceeds now. Recommended
order: WO11 → WO10b → WO11b → WO12. Approving both takes the ledger to **twenty**.

### Lessons distilled — checkpoint 2026-09-18

What PR-04 taught that the reviews above record only in passing. Written for whoever resumes
after compaction.

**1. Interruptions are routine; the resume protocol works.** Five workers hit an API usage limit
mid-flight (WO4, WO7, WO4c, WO10, WO11). Nothing was lost once, because the protocol never
varied: snapshot the tree (`git log --oneline <dispatch>..HEAD`, `git status --short`); never
commit, stash or discard on a worker's behalf; resume the **same** agent with `SendMessage`
(reload its schema with `ToolSearch` after a session restart), telling it exactly what state it
left. A fresh agent reconstructing a half-finished diff is the riskier path. After compaction the
old agents are gone — re-dispatch fresh from the committed WORKORDER.

**2. The PA's own premises were wrong four times, all the same way.** WO7's boundary built the
mangler but left out its two call sites, so collisions went unenforced. WO4c's first ruling said
"skip" a negative origin, which hid visible shapes; the correction said "wrap everything", which
broke `drawLine`. WO10's work order assumed WO7b's rule caught a missing *size* when it catches a
missing *position*. **Each was a rule stated about a category ("U8G2", "geometry", "the
resolver") that held for most members and failed for one.** The fix every time was reading the
specific path — `u8g2_line.c`, the call graph, the rule's actual condition. Trace an objective to
the exact surface that delivers it, and a rule to the exact code path it governs.

**3. Workers were right to stop, and the boundary is why.** Every PA error above was caught by a
worker declining to act outside its box and reporting instead. Tight boxes plus "stop and report
means record and continue" produced better outcomes than loose boxes would have. Keep them tight.

**4. The PA's end-to-end check found what green suites did not.** The 254-object ceiling was
missed entirely (256 objects passed both commands) though every test was green; bound text never
draws though the fixture test was green. Both surfaced only by running the built CLI, or reading
the runtime, against the claim. Always run the headline behaviour end to end yourself.

**5. The PA's own tooling misled it twice, harmlessly — but only because it re-checked.** A grep
for a string-valued `"target"` falsely suggested WO7b's `--json` field was missing (it is an
object). A zsh `C="node x"; $C` and a cwd that had drifted into `cli/` made two end-to-end runs
fail for reasons that had nothing to do with the work. Before reporting a defect, confirm the
check itself is sound; use absolute paths.

**6. Duplication is where defects hide — five times now in PR-04.** The ceiling's second count
(wrong in both directions), two reserved-prefix lists, three spellings of "drawing element", two
widget/composite prop blocks (seven asymmetries), and a `.cmake` define list that would have
spelled the capacities twice. WO8c now scans the source for a second count or prefix list. When a
work order touches a rule, ask where else it is spelled.

**7. Vacuous green keeps recurring.** WO8a's passes silently fell back to their own pipelines and
all 642 tests stayed green; lint's unused-variable error caught it. Guards that assert a *count*
over the real function (expansions, emitted `render_object` calls, symbols in a binary) are what
stop it. Workers now also say how many base failures are behavioural versus "the module does not
exist yet" — keep asking for that split.

**8. Never touch a tree a worker owns.** When the Chief Architect's rulings arrived mid-WO8b, the
spec edits waited until the worker finished, then went on their own PA branch (`pa-ca-rulings`).
Editing underneath a running worker risks its `git add` sweeping PA files into its commit.

**9. How the owner works.** Approves splits when the reviewability case is made; delegates
placement when asked ("whichever you prefer" — then the PA chooses and records why); relays Chief
Architect rulings by pasting them into this session. Record each ruling's provenance and each
approval verbatim. Ask before anything outward-facing: pushing, opening the PR, filing issues.

### Owner approval — WO10b and WO11b, 2026-09-18

**APPROVED by the human (Matt McNeill) on 2026-09-18.** The owner's own words, verbatim:

> "ok please update the checkpoint-bridge - I approve 10a and 10b so that those approvals are
> contained in the checkpoint."

**Reading, recorded rather than silently assumed.** There is no WO10a. The only two proposals
pending were **WO10b** (bound text reaches the label) and **WO11b** (validator hardening), and the
owner's immediately preceding message asked the PA to "summarise 10b and 11b" — which the PA did,
describing exactly those two. The approval is therefore read as covering **WO10b and WO11b**. The
PA asked the owner to confirm that reading in one line; **if no confirmation is recorded below,
the resuming PA should get it before dispatching WO11b** (WO10b is unambiguous under either
reading).

Ledger is now **twenty**: WO11 → WO10b → WO11b → WO12. WO12 is re-based on WO11b.

## Human Approval

<!-- The owner's own words and the timestamp. A worker verifies this as its
     authorization. The Chief Architect's decisions above are not approval of
     this decomposition; this is. -->

**APPROVED by the human (Matt McNeill) on 2026-09-13**, recorded at
`2026-09-13T19:59:36Z`.

The owner's own words, verbatim:

> "Approved — proceed with the twelve work orders, start WO1"

Context: the owner had the twelve-work-order decomposition, the six findings
above, the sharing decision, the Chief Architect's answers to the five decisions
and the PA's `bind_time` decision in front of them.

## Status Log

- 2026-09-18 — **Resumed after compaction; WO11 re-dispatched** to a fresh worker on the owner's instruction *"ok - proceed"*. Branch verified clean (nothing after `ad8062f` but PA workspace commits). `main` has moved to `c99d9f2` (docs only: the UiUiUi prior-art review, Q-14/Q-15) — not blocking; rebase at wrap-up, expect a §21 table conflict beside Q-13. WO10b/WO11b reading confirmation still not received — required before WO11b is dispatched.
- 2026-09-18 — **Owner approved WO10b and WO11b.** Ledger now **twenty**; order WO11 → WO10b → WO11b → WO12. Both WORKORDERs drafted; WO12 re-based on WO11b. Chief Architect bridge `CA-BRIDGE-2026-09-18.md` (six items) sent to the owner to relay; rulings awaited.
- 2026-09-18 — **Checkpoint for context compaction.** WO11's worker hit the usage limit before changing anything (branch clean at `ad8062f`). `main` unchanged at `5f2574f`; the stack contains it. Lessons distilled below; `BRIDGE-PR04-CHECKPOINT.md` written so a fresh session can resume. WO10b and WO11b still await the owner.
- 2026-09-18 — **WO10 complete** (`3a58ab3`) — **generated code compiles and runs in the C++
  suite.** Interrupted once by an API usage limit before touching anything, and resumed.
  Verified independently. **Stop-and-report 1 confirmed in the runtime: a label bound to a
  subject never draws its text** — a defect in merged code since PR-01/PR-03. **WO10b
  (runtime) and WO11b (validator hardening) proposed to the owner, not added.** WO11
  dispatched on `u8g2gl-generator/wo11-editor-target`.
- 2026-09-17 — **WO9 complete** (`136c0c2`) — **the generator emits C++.** Verified
  independently, including generating a project end to end, reading the emitted units and
  confirming byte-identical regeneration. WO10 dispatched on
  `u8g2gl-generator/wo10-emit-screens` with three manifest fixes it needs first. Two items
  added for the Chief Architect (§13.5's `.value`, §13.7's file list).
- 2026-09-17 — **WO8c complete** (`ae1e7a9`). Verified independently, including end to end:
  256 objects now fails both commands, 254 passes, **300 drawing elements now pass** (a false
  rejection nobody had noticed), and a `wd_` element validates. WO9 dispatched on
  `u8g2gl-generator/wo9-emit-project`.
- 2026-09-17 — **Owner approved WO8c**, leaving the placement to the PA. Ledger now
  **eighteen**. WO8c dispatched on `u8g2gl-generator/wo8c-validator-alignment`; WO9 re-based
  on it.
- 2026-09-16 — **Chief Architect rulings on CA-BRIDGE-2026-09-16 received and applied.** All
  seven ruled; the spec edits and record-keeping were delegated to this PR and are done on
  `u8g2gl-generator/pa-ca-rulings`. **WO8c proposed to the owner** for the validator work the
  rulings and WO8b imply; not dispatched.
- 2026-09-16 — **WO8b complete** (`6c2c909`). Verified independently. Its ceiling finding
  reproduced end to end: 128 composite instances reach **256 objects** and both `validate`
  and `generate` exit 0 — a live hole in [D-21]'s structural guard.
- 2026-09-16 — **WO8a complete** (`2954fc2`). Verified independently, including end to end
  through the built CLI. Boundary excursion into `parse-widget-tree.ts` accepted. WO8b
  dispatched on `u8g2gl-generator/wo8b-realisation-capacities`; four value-completeness
  findings to WO9; the radius bounds check added to the Chief Architect's list.
- 2026-09-16 — **Owner approved the WO8 split.** Ledger now **seventeen**. WO8a dispatched
  on `u8g2gl-generator/wo8a-one-pipeline`; WO8b drafted on top of it; the combined
  `wo8-realisation-capacities/` retired. Bridge prompt for the Chief Architect written to
  `CA-BRIDGE-2026-09-16.md` (seven items: §13.2 `int16_t` scope, the `wd_` prefix, §11.3's
  clip text, the negative-origin premise, `$prop` interpolation, two small inconsistencies,
  and the obligations handed to PR-05/PR-06).
- 2026-09-15 — **WO7b complete** (`9970859`, report `c4f359d`). Verified independently,
  including end to end through the built CLI. **WO8 split proposed (WO8a / WO8b) and held
  for the owner** — WO8 now carries eleven items beyond its own scope. Not dispatched.
- 2026-09-15 — **WO4c complete** after a third pass (`468e386`, report `c5f5d7c`).
  Verified independently. WO7b dispatched on `u8g2gl-generator/wo7b-geometry-contract`.
- 2026-09-15 — **WO4c second pass** (`62dd06b`, report `2e8c5d6`). Verified
  independently. N1 confirmed in the pinned source: `u8g2_DrawLine` cannot take a wrapped
  endpoint. **PA ruling:** lines clip to the display in signed arithmetic before
  converting. WO4c re-dispatched for that one item.
- 2026-09-15 — **WO4c first pass** (`7924d24`, report `f286f80`), status `partial`;
  interrupted once by an API usage limit and resumed with its context. Verified
  independently, including a fresh configure. **PA ruling from pinned U8G2 source:** draw
  origins wrap explicitly (U8G2 clips negative-as-wrapped by design); the WORKORDER's
  "skip" wording caused a visible regression and is withdrawn. WO4c re-dispatched to
  finish, with H3, H6, H8.
- 2026-09-14 — **Rulings on WO4c and WO7b received** (`main` @ `5f2574f`); owner's U8G2
  dependency decision recorded. **Stack rebased onto `main` @ `5f2574f`** with
  `--update-refs`: 40 commits, no conflicts (no file shared with `main`), all ten branches
  moved; C++ 284 and CLI 596 green on the rebased tip. **Every commit SHA before this
  entry predates the rebase**; the rebased WO7 review is `1393d26`. Ledger now sixteen.
  WO4c dispatched on `u8g2gl-generator/wo4c-real-u8g2`; WO7b drafted; WO8 re-based on WO7b.
- 2026-09-14 — **WO7 complete** (`a19b65a`, report `7cbf909`). Interrupted once by
  an API usage limit and resumed with its context. Verified independently, including
  end to end through the built CLI. WO8 branch cut but **not dispatched**: its scope
  depends on the owner's answer on WO7b. WO4c and WO7b await the owner.
- 2026-09-14 — **WO6 complete** (`6b5d562`, report `e275f2f`). Verified
  independently, including end to end through the built CLI. WO7 dispatched on
  `u8g2gl-generator/wo7-composite-expansion`. **WO7b proposed to the owner, not
  added.** WO4c still awaiting the owner.
- 2026-09-14 — **WO5b complete** (`dc82dea`, report `7038a16`). Verified
  independently, including end to end through the built CLI. WO6 dispatched on
  `u8g2gl-generator/wo6-resolver`. WO4c still awaiting the owner.
- 2026-09-14 — **WO5a complete** (`a31527c`, report `1ebbae3`). Verified
  independently. WO5b dispatched on `u8g2gl-generator/wo5b-generate-command`. WO4c
  still awaiting the owner.
- 2026-09-14 — **WO4b complete** (`4094489`, report `084339c`). Verified
  independently. G1 confirmed against real U8G2: the runtime does not compile against
  it (`getFont()`). **WO4c proposed to the owner, not added.** WO5a dispatched on
  `u8g2gl-generator/wo5a-validator-carries` — CLI-only, independent of G1.
- 2026-09-14 — **Checkpoint rulings received** (Chief Architect, `main` @ `ef73776`):
  WO4b approved, version guard approved, `setter=` kept (Q-9), WO5 split approved.
  Ledger now fourteen. WO4b dispatched on `u8g2gl-generator/wo4b-clipping-version`;
  WO5a/WO5b drafted; `wo5-generate-command/` retired in favour of the two.
- 2026-09-14 — **WO4 complete** (`6a78247`, report `0a8a77f`). The worker was cut
  off by an API usage limit with its work uncommitted; the tree was left untouched
  and the same worker resumed with its context, finishing from that state. Verified
  independently. **Owner checkpoint reached — WO5 not dispatched.**
- 2026-09-13 — Chief Architect ruling on F3 (`main` @ `4e4b992`): `extends` must name
  a manifest. The registry's error stays; its message gains the remedy (→ WO5).
- 2026-09-13 — **WO3 complete** (`a652fd6`, report `d2b79ca`), status `partial` by
  design. Verified independently; stop-and-report resolved by the PA; one question
  held for the owner checkpoint. WO4 revised and dispatched on
  `u8g2gl-generator/wo4-runtime-support`.
- 2026-09-13 — **WO2 complete** (`33cd27b`, `0257d57`, report `400cf1b`). Verified
  independently; two design questions answered by the PA, consistent with the Chief
  Architect's F3 ruling on `main` @ `4e4b992`. WO3 revised and dispatched on
  `u8g2gl-generator/wo3-bindable-geometry`.
- 2026-09-13 — **WO1 complete** (`6c71715`, report `984aff2`). Verified independently;
  findings triaged below. WO2 revised and dispatched on
  `u8g2gl-generator/wo2-manifest-parity`.
- 2026-09-13T19:59Z — **Approved by the owner.** WO1 branch cut from `f693aab`;
  WO1 dispatched.
- 2026-09-13 — Chief Architect answered the five decisions and four spec reports;
  recorded above. `bind_time` decision taken by the PA.
- 2026-09-13 — Decomposition drafted by the Principal Architect.
