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

| WO | Branch | Scope | Source | Complexity |
|---|---|---|---|---|
| WO1 | `wo1-dirty-geometry` | `mark_dirty()` on all mutators; per-axis `set_x/y/w/h` | R1.1, R1.2 | standard |
| WO2 | `wo2-label-long-mode` | `long_mode` absorbs `u8g2gl_scrolling_label`; delete `truncate` from style | R1.3, R3.1, R3.2 | standard |
| WO3 | `wo3-draw-functions` | Eight `u8g2gl_draw_*` free functions | new work, required by WO4 | standard |
| WO4 | `wo4-manifests` | All 17 manifests: `animated` out, `draw=` in on eight primitives | R2.5, R3.3, R3.4 | mechanical |
| WO5 | `wo5-schema-merge` | `Component`/`ComponentProp` → `WidgetManifest` + `PropDef`; props gain `help` | R2.1 | standard |
| WO6 | `wo6-validator` | Drop `TIER1_PRIMITIVES`; composite tag validation; cycle detection; geometry vs container | R2.2, R2.3, R2.4 | standard |
| WO7 | `wo7-capacities` | `MAX_BINDINGS_PER_OBJ` default → 8; hard 254-object validator error | [D-21] | standard |
| WO8 | `wo8-schema-04` | Schema 0.3 → 0.4, §15.4 refusal path, integration, sizeof report | R2.6 | standard |

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

**Status: AWAITING APPROVAL.**

## Status Log

- 2026-09-12 — Decomposition drafted by the Chief Architect. [D-21] recorded in
  `docs/decisions/d21-generated-capacities.md`, design_spec §3/§13.7/§18.1, and
  the plan ledger as PR-3R.
