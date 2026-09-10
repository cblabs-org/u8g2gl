# PROJECT — PR-03: Built-In Widget Set + Element Identity

**Tier 2 · Principal Architect**
**Programme**: U8G2GL
**Parent**: [PROGRAM.md](../PROGRAM.md)
<!-- Last updated: 2026-09-10T07:10:37Z -->

## Mandate

Build the Tier-2 widget set on the `u8g2gl_obj` base delivered by PR-01:
`u8g2gl_label`, `u8g2gl_scrolling_label`, `u8g2gl_xbm`, `u8g2gl_glyph`,
`u8g2gl_progress_bar`, `u8g2gl_clock`, `u8g2gl_switch`, `u8g2gl_button`,
plus the Tier-1 static primitives (§6.1). Each widget ships an `<api>` manifest
per [D-17]. Settle [U-1] element identity.

## Branch Strategy

Base: `main` @ `b8cfdd5` (PR-01 + PR-02 merged).
Branches: `u8g2gl-widgets/wo<N>-<topic>`, stacked serially.

## Work Order Decomposition

| WO | Branch | Scope | Complexity | Base |
|---|---|---|---|---|
| WO1 | `u8g2gl-widgets/wo1-primitives-label` | Tier-1 primitives + `u8g2gl_label` | standard | `main` |
| WO2 | `u8g2gl-widgets/wo2-scroll-xbm-glyph` | `u8g2gl_scrolling_label` + `u8g2gl_xbm` + `u8g2gl_glyph` | standard | WO1 |
| WO3 | `u8g2gl-widgets/wo3-progress-clock` | `u8g2gl_progress_bar` + `u8g2gl_clock` | standard | WO2 |
| WO4 | `u8g2gl-widgets/wo4-switch-button` | `u8g2gl_switch` + `u8g2gl_button` | standard | WO3 |
| WO5 | `u8g2gl-widgets/wo5-manifests-crosstest` | XML manifests + manifest→validator cross-test | standard | WO4 |
| WO6 | `u8g2gl-widgets/wo6-element-identity` | Element identity [U-1] — Option A: require `name` | standard | WO5 |
| WO7 | `u8g2gl-widgets/wo7-integration` | Sizeof report, readability review, stack submission | standard | WO6 |
| WO8 | `u8g2gl-widgets/wo8-identity-remediation` | Unique name allocation + 32-bit sizeof (architect-raised, post-review) | standard | WO7 |
| WO9 | `u8g2gl-widgets/wo9-name-policy` | Missing-name policy, write-back, `--fix-names` (architect-raised, owner-directed) | standard | WO8 |

## Human Approval

**APPROVED by human (Matt McNeill) on 2026-09-10T07:10:37Z.**

Decomposition presented in implementation plan. User reviewed the 7-WO breakdown
and the [U-1] element identity decision. User directed: use Option (a) — require
`name` on every element — rather than the hybrid option (c) originally proposed.
Reasoning: XML is intermediate format, generator needs names for variables anyway,
hybrid adds complexity for marginal benefit. Graceful fallback: auto-generate names
at load time with a warning diagnostic.

Approval message: "Yes" in response to "Shall I proceed with the approved plan
(with this amendment to WO6) and begin execution?"

## Status

**Complete.** All 7 WOs executed, verified, committed, and pushed.
165 C++ tests, 197 CLI tests, 0 warnings, all sizeof budgets passed.

## Session Log

### 2026-09-10T07:10:37Z — Decomposition approved, execution begins

Human approved the 7-WO decomposition with one amendment: [U-1] element identity
uses Option (a) not Option (c). WO6 drops from `architect` to `standard` complexity.
All WOs serialised — no parallelism, no merge conflicts.

Reference widgets from `esp32-app-foundation/modules/U8G2Display/widgets/` have been
read in full: LabelWidget, ScrollingTextWidget, ClockWidget, ProgressBarWidget,
ImageWidget. Behaviour to port is documented in each WORKORDER.


## Outcome

**MERGED as [#3](https://github.com/cblabs-org/u8g2gl/pull/3) on 2026-09-10.**

Nine work orders. WO1–WO7 as decomposed; WO8 and WO9 raised by the Chief Architect
after review of the open PR, WO9 at the owner's explicit direction.

Final: C++ 166 tests, CLI 224 tests, zero warnings under `-Wall -Wextra -Wpedantic`.
Schema stayed at `0.3`; CLI went `0.3.0` -> `0.5.0` (two output-affecting changes,
each bumped per `rules/03-versioning.md`).

`[U-1]` element identity is closed — see `docs/ui_spec.md` §16.1 for the decision and
its reasoning.

**Carried into PR-04:**
- Single-file `validate` always errors (no globals/manifests in scope) — pre-existing,
  makes single-file invocation misleading
- `--fix-names` has no `--dry-run`; the edits are already computed in core so one is cheap
- 64-bit sizeof ceilings have ~33% headroom and will not catch a moderate regression
- No 32-bit measurement is possible on this host; the harness skips loudly instead
