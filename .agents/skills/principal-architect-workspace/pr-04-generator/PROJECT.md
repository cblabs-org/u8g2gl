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

- [ ] **[WO1 — manifest registry](wo1-manifest-registry/WORKORDER.md)** · `u8g2gl-generator/wo1-manifest-registry` · base `main` @ `f693aab` · standard · finding 1; widget/composite prop-check unification (inherited)
- [ ] **[WO2 — manifest ↔ runtime parity](wo2-manifest-parity/WORKORDER.md)** · base WO1 · standard · finding 2; `bind_time`, `bind_value`
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

- 2026-09-13T19:59Z — **Approved by the owner.** WO1 branch cut from `f693aab`;
  WO1 dispatched.
- 2026-09-13 — Chief Architect answered the five decisions and four spec reports;
  recorded above. `bind_time` decision taken by the PA.
- 2026-09-13 — Decomposition drafted by the Principal Architect.
