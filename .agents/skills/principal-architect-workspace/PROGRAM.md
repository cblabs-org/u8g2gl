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
**Planning.** Blocked on three programme decisions (PD-1 licence, PD-2 CLI home,
PD-3 widget naming). No PRs spawned. No Tier-2 PA engaged.

## Reconnaissance findings driving the plan
- **F-1** `modules/U8G2Display/` already ships the widget runtime (IGfxWidget,
  DrawingPrimitives, 8 widgets, IDisplayBoard, CarouselEngine, system boards).
  Programme is codegen+binding over an existing runtime, not greenfield.
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
