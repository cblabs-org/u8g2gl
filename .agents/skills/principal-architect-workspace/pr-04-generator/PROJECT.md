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
- [ ] **[WO3 — [D-20] bindable geometry](wo3-bindable-geometry/WORKORDER.md)** · base WO2 · standard · finding 3
- [ ] **[WO4 — runtime support for generated code](wo4-runtime-support/WORKORDER.md)** · base WO3 · standard · finding 4; runtime 0.4.0
- **Owner checkpoint** — WO1–4 repair merged code; WO2 is the likeliest to grow
- [ ] **[WO5 — `generate` command and shared load path](wo5-generate-command/WORKORDER.md)** · base WO4 · standard · constraint 4; NOT_YET_SUPPORTED severity split
- [ ] **[WO6 — resolver: arithmetic and anchors](wo6-resolver/WORKORDER.md)** · base WO5 · standard · [D-7], [D-20]
- [ ] **[WO7 — composite expansion and mangling](wo7-composite-expansion/WORKORDER.md)** · base WO6 · standard · §13.4, §13.6
- [ ] **[WO8 — realisation and capacities](wo8-realisation-capacities/WORKORDER.md)** · base WO7 · standard · [D-18], [D-21], `_n<N>`
- [ ] **[WO9 — project-level emission](wo9-emit-project/WORKORDER.md)** · base WO8 · standard · §13.7
- [ ] **[WO10 — screen emission and compile layer](wo10-emit-screens/WORKORDER.md)** · base WO9 · standard · §13.7, §13.8, §17.1
- [ ] **[WO11 — editor target](wo11-editor-target/WORKORDER.md)** · base WO10 · standard · [UD-4], ui_spec §15
- [ ] **[WO12 — budget, `--json`, determinism](wo12-budget-determinism/WORKORDER.md)** · base WO11 · standard · §13.9, §18, [D-16]; CLI 0.7.0

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
