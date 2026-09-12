# PROJECT — PR-3R: Remediation to [D-18] / [D-19] / [D-20] / [D-21], schema 0.4

**Tier 2 · Principal Architect**
**Programme**: U8G2GL
**Parent**: [PROGRAM.md](../PROGRAM.md)
**Assessment**: [REMEDIATION-D18.md](../REMEDIATION-D18.md)
<!-- Last updated: 2026-09-12 -->

## Mandate

Realign the merged runtime, CLI and widget set to the decisions taken on
2026-09-11 (`245f9be`) and 2026-09-12, so PR-04's generator is written once
against the correct shapes rather than twice.

**This PR blocks PR-04.** The generator consumes the schema model and the
manifests directly.

## Why now

No user XML exists outside this repository's fixtures. The break is cheap today
and expensive after PR-05 puts generated code in a real application. That window
is the entire reason this is an interim PR rather than a backlog item.

## Branch Strategy

Base: `main` @ `1ff25d2`. Branches `u8g2gl-remediation/wo<N>-<topic>`, stacked
serially. PR head is the last branch in the stack.

## Work Order Decomposition

- [ ] **[WO1 — dirty-flag correctness and per-axis geometry](wo1-dirty-geometry/WORKORDER.md)** · `u8g2gl-remediation/wo1-dirty-geometry` · base `main` · standard · R1.1, R1.2
- [ ] **[WO2 — label `long_mode` absorbs `u8g2gl_scrolling_label`](wo2-label-long-mode/WORKORDER.md)** · base WO1 · standard · R1.3, R3.1, R3.2
- [ ] **[WO3 — `u8g2gl_draw_*` free functions](wo3-draw-functions/WORKORDER.md)** · base WO2 · standard · new work, required by WO4
- [ ] **[WO4 — manifests: `animated` out, `draw=` in](wo4-manifests/WORKORDER.md)** · base WO3 · standard · R2.5, R3.3, R3.4
- [ ] **[WO5 — merge component schema into widget manifest](wo5-schema-merge/WORKORDER.md)** · base WO4 · standard · R2.1
- [ ] **[WO6 — validator: primitives, composite tags, cycles, container geometry](wo6-validator/WORKORDER.md)** · base WO5 · standard · R2.2, R2.3, R2.4
- [ ] **[WO7 — capacity defaults and the structural object ceiling](wo7-capacities/WORKORDER.md)** · base WO6 · standard · [D-21]
- [ ] **[WO8 — schema 0.4, the 0.3 refusal path, integration](wo8-schema-04/WORKORDER.md)** · base WO7 · standard · R2.6

**WO4 was re-graded `mechanical` → `standard`.** Stripping `animated` from 17
XML files is rote, but the same work order changes `widget-manifest.ts`, the
manifest parser and the cross-test, and the cross-test must end *meaningful*
rather than merely green. That is judgement, not transcription.

**Ordering rationale.** WO1 and WO2 are runtime-only and unblock nothing else, so
they go first and can be reviewed while the schema work proceeds. WO3 must
precede WO4 because the manifests name functions that would otherwise not exist
and the cross-test would be red between them. WO8 is last because the version
refusal path must describe changes that have all already landed.

## Deviations from the assessment

**The `u8g2gl_draw_*` free functions are in scope** (WO3), though
REMEDIATION-D18.md lists them under "genuinely new work". WO4 points eight
manifests at those functions and `manifest-crosstest.test.ts` verifies manifests
against real C++ symbols — so excluding them would leave the cross-test red for
the length of the PR. Eight small functions is a cheaper price than a knowingly
broken test.

**R1.1 and R1.2 are one work order, not two.** The assessment recommends R1.1
first and alone. The per-axis setters are the same functions that need the dirty
call, so splitting them means editing `set_coords` to add `mark_dirty()` and then
immediately restructuring it to add `set_x`/`set_y`/`set_w`/`set_h`. Same
surface, twice.

**R1.1 is a live defect, not a latent one.** The assessment says the missing
`mark_dirty()` is harmless until [D-20] lands. That holds for `set_coords`, which
only runs during `init()`. It does not hold for `set_hidden()` and
`set_disabled()`, which are public API: an application calling
`obj->set_hidden(true)` on a static screen gets no repaint today, in merged code.
The bound path is safe because the observer marks dirty; the imperative path is
not. WO1 treats this as the correctness fix it is.

## Findings added by the Chief Architect

Not in the assessment; verified against the code on 2026-09-12.

**`TIER1_PRIMITIVES` has already drifted.** It names `u8g2gl_frame`,
`u8g2gl_disc` and `u8g2gl_bitmap`, none of which have manifests, and omits
`ellipse`, `pixel`, `triangle` and `xbm`, which do. Tested: `<u8g2gl_frame>`
**passes validation** while `<u8g2gl_nonsense>` is correctly rejected. Three
phantom tags validate today and would reach PR-04's generator with nothing behind
them. R2.2 closes a live hole, not just a design smell.

**The static pools no longer fit the design** — now [D-21]. `MAX_BINDINGS_PER_OBJ`
is 4 while [D-20] makes four geometry properties bindable, so one element binding
its geometry has nothing left for `text`. `MAX_OBJECTS_PER_SCREEN` is 32 while
[D-18] turns every composite into an object. Neither is validated, and
`add_binding()` fails by returning `false` — a value generated code can ignore.
WO7 takes the runtime and validator half; the generator emitting exact capacities
is PR-04.

## Human Approval

<!-- Record the owner's own words and the timestamp. A worker verifies this as
     its authorization, so it must be genuine. -->

**APPROVED by the human (Matt McNeill) on 2026-09-13.**

The owner's own words, verbatim:

> "ok please can you give me a md bridget prompt to ask an implementation
> architect to start work on the PR3R please ?"

Context: the owner had the eight-work-order decomposition, the three deviations
from the assessment and the `[D-21]` record in front of them, and separately
directed that migration tooling be dropped ("no need for migration we have never
written any xml yet never mind having downstream users"). That direction is
recorded in WO8's boundary box.

## Status Log

- 2026-09-13 — Approved by the owner; handed to a Principal Architect to execute.
- 2026-09-12 — `--migrate` tooling rejected by the owner; WO8 trimmed and the
  rejection recorded in its boundary box.
- 2026-09-12 — Decomposition drafted by the Chief Architect. [D-21] recorded in
  `docs/decisions/d21-generated-capacities.md`, design_spec §3/§13.7/§18.1, and
  the plan ledger as PR-3R.
