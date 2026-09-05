# PROGRAM — U8G2GL

**Tier 1 · Chief Architect**
<!-- Last updated: 2026-09-04T11:25:07Z -->

## Mandate
Deliver U8G2GL per [design_spec.md](../../../docs/design_spec.md) v0.2: a build-time
XML-to-C++ UI framework for U8G2 monochrome displays. Upstream home is
`esp32-app-foundation`; `departures-board-v3` is the downstream pathfinder.

Human-facing plan: [implementation_plan.md](../../../docs/implementation_plan.md)
PR sequence and graph: [PROGRAM-PLAN.md](PROGRAM-PLAN.md)

## Status
**Planning.** Blocked on four programme decisions (PD-1 licence, PD-2 CLI home,
PD-3 ratify core object model, PD-4 legacy migration strategy). No PRs spawned.

## Reconnaissance findings driving the plan
- **A-1** `modules/U8G2Display/` is an INTEGRATION REFERENCE, NOT an architectural
  basis. Its flat imperative widget model is departures-board heritage; building a
  veneer over it would encode the design we are moving past. Corrected from plan v1.0.
- **A-2** Architecture parallels LVGL 9's core decomposition: obj, obj_class with
  base_class + property table, observer, group (focus), style, event. Diverge only
  where monochrome demands: no runtime tree/layout/dirty-regions ([D-4],[D-7]).
- **A-3** Object tree is build-time; runtime is a flat array with a parent index.
  Hierarchy semantics (inherited visibility, clip-to-parent) by walking up, ~1 byte
  per object, versus LVGL's per-node child vectors.
- **F-2** `uidesign/<board>/lvglpro/` → `modules/LVGLDisplay/ui/` is an exact
  precedent to mirror for XML-source → generated-code layout.
- **F-3** `ButtonModule`/`EncoderModule` exist — §12 input integrates, not invents.
- **F-4** `departures-board/tools/layoutsim` (vendored emsdk + build_wasm.py) makes
  [D-9] a port rather than a build.

## Repositories
| Repo | Role |
|---|---|
| U8G2GL | Programme home; host CLI if PD-2 lands standalone |
| esp32-app-foundation | Upstream runtime/binding/uidesign/build (Apache-2.0) |
| departures-board-v3 | Downstream consumer, pinned via framework.lock f53cc1d7 |

## Programme Session Log

### 2026-09-04T11:25:07Z — Programme initiated
Chief Architect engaged. Spec v0.2 committed at `a79aaa7`. Reconnaissance of
esp32-app-foundation and departures-board-v3 completed; findings F-1..F-4 recorded
above and folded into the plan.

Key architectural call surfaced for human decision: PD-3 (widget naming). Existing
`LabelWidget` et al. are consumed by every system board and by pinned downstream v3.
Recommendation is type aliases (`using u8g2gl_label = LabelWidget;`), which delivers
[D-12]/[D-13]'s 1:1 XML↔class readability at zero blast radius. This converts the
programme's single largest compatibility risk into a header of using-declarations.

Sequencing deliberately front-loads independently valuable work (subject system,
display catalogue, Wasm preview, pixel-regression harness) ahead of the PR-07 gate,
so that a NO-GO at the gate still leaves the foundation better off. Stopping must
be cheap for the gate to be honest.

Defect surfaced, not ours to fix: esp32-app-foundation/library.json declares
`CC-BY-NC-SA-4.0` against an Apache-2.0 LICENSE and 120 Apache SPDX headers.

### 2026-09-04T15:56:37Z — Plan v1.1: heritage anchoring rejected
Human correction: do not let `modules/U8G2Display` heritage constrain the design;
target the optimal architecture paralleling LVGL for u8g2 matrix displays.

Plan v1.0 had reduced the programme to "codegen over the existing runtime" — sunk-cost
reasoning. Rewritten: the legacy module is an integration reference only (A-1), the
architecture parallels LVGL 9's core (A-2), and hierarchy resolves at build time to a
flat runtime (A-3).

Consequences: PD-3 changed meaning entirely — from "widget naming aliases" (an artefact
of building on legacy) to "ratify the core object model". New PD-4 covers legacy
migration by strangler-fig, since six system boards and a pinned downstream v3 depend
on the old module. New PR-00 is a real prerequisite: the committed spec has no object
model section at all — it goes from XML tags straight to widget behaviour. That gap was
invisible while legacy widgets were assumed and is fatal now. PR count 10 → 12.

### 2026-09-05T07:52:18Z — XML-to-code contract authored (spec §13, v0.3)
Closed the gap between generator and runtime work packages. §7 of the plan had
flagged PR-03 ∥ PR-04 as blocked on an unwritten contract; that contract is now
design_spec.md §13, normative, at spec v0.3 / schema 0.3.

Load-bearing decision [D-17]: widget properties are build-time `<api>` manifests
the generator reads, not runtime property tables. Considered and rejected: a
hardcoded generator table (makes custom widgets second-class) and an LVGL-style
runtime property table (pays dispatch and type erasure for a build-time lookup).
LVGL needs lv_obj_property at runtime because its editor loads XML on-device;
we have no runtime XML, so we need the descriptor without the dispatch.

Second-order win: built-in and custom widgets collapse to one mechanism. The
generator's widget knowledge becomes data, so adding a widget needs no generator
release. This retroactively strengthens §6.4 — the Tier-4 story was previously
asserted but not mechanised.

§13 also settles identifier mangling and collision policy (hard error, never a
silent rename), the static-demotion rule, component-inlining semantics, [A-3]'s
flat array with parent indices, and byte-level determinism — no timestamps, so an
unchanged project regenerates to an empty diff, which matters because generated
code is committed ([D-11]) and appears in review.

Still blocked on PD-1..PD-4. No Tier-2 PA spawned.

### 2026-09-05T09:22:51Z — PD-1 and PD-2 resolved; repository topology corrected
Human resolved PD-1: **MIT**, matching U8G2 (BSD-2-Clause) and LVGL (MIT), on the
reasoning that an Apache-2.0 project consuming MIT as a submodule is fine. Verified
and correct — MIT is the more permissive licence and flows downstream cleanly.

Investigating that phrasing surfaced a topology error in the plan. Foundation's
`modules/LVGLDisplay/library.json` declares `"lvgl/lvgl": "^9.5.0"` as an external
dependency plus `"UIDesign": "*"` for generated UI; LVGL (MIT) already sits inside
this Apache-2.0 project alongside six other MIT components. So the established
pattern is: MIT framework as a dependency, thin Apache-2.0 integration module in
`modules/`.

Plan v1.2 had PR-01 (object model) and PR-03 (widget set) landing *inside*
foundation. That was wrong — it would have made U8G2GL a foundation-internal
feature rather than a library, contradicting concept.md's positioning and making it
unusable by any U8G2 project that is not a foundation app. Corrected in v1.3: the
runtime and CLI both live in the U8G2GL repo (MIT); what goes upstream is
`modules/U8G2GLDisplay/` (Apache-2.0), the integration module. PR-01..PR-04 and
PR-06 all move to this repository; only PR-05 and PR-07 land in foundation.

This also resolves PD-2 more strongly than the original question framed it — the
CLI question was really a question about what the U8G2GL repo *is*.

Remaining: PD-3 (ratify object model, blocks PR-01), PD-4 (legacy migration,
blocks PR-05).
