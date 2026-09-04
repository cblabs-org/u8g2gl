# PROGRAM-PLAN — U8G2GL PR Sequence

Tier-1 dependency graph. Each row is one Pull Request delegated to a Tier-2
Principal Architect. Full rationale: [implementation_plan.md](../../../docs/implementation_plan.md)

## Gating decisions (human)
| ID | Decision | Blocks | Recommendation |
|---|---|---|---|
| PD-1 | Licence: MIT vs Apache-2.0 | all | Apache-2.0 (match foundation) |
| PD-2 | CLI home: standalone vs foundation/tools | PR-02 | Standalone in U8G2GL, npm-published |
| PD-3 | Widget naming: rename / generate-existing / alias | PR-03 | Alias — zero blast radius |

## PR sequence

| PR | Repo | Scope | Base | Status |
|---|---|---|---|---|
| PR-00 | U8G2GL | Spec reconciliation for foundation context + PD-1 | main | Blocked PD-1 |
| PR-01 | foundation | Subject/observer core, string storage, ui_handler deadlines | main | Blocked PD-1 |
| PR-02 | CLI | Schema, validator, display catalogue, find modes, --json | main | Blocked PD-1/PD-2 |
| PR-03 | foundation | Widget adaptation + aliases + bind mixin + gap widgets | PR-01 | Blocked PD-3 |
| PR-04 | CLI | Generator XML→C++, component inlining, layout resolution | PR-02+PR-03 | Pending |
| PR-05 | foundation | uidesign/<board>/u8g2gl + build hooks + committed generated/ | PR-04 | Pending |
| PR-06 | CLI+foundation | Wasm preview + snapshot harness (port layoutsim) | PR-03 | Pending |
| PR-07 | foundation | ★ GO/NO-GO GATE — retarget one board, pixel-diff, budget | PR-05+PR-06 | Pending |
| PR-08 | both | Components, custom widgets, collections | PR-07 | Phase 2 |
| PR-09 | foundation | Focus ring + Button/Encoder dispatch | PR-07 | Phase 2 |
| PR-10 | v3 | Advance framework.lock; retarget application boards | PR-08+PR-09 | Stretch |

## Parallelism
- **PR-01 ∥ PR-02** — different repos, no overlap. Recommended; this is the critical path.
- **PR-03 ∥ PR-04** — contract dependency on generated-code shape. Agree the contract in
  writing before both start, or serialise.
- **PR-08 ∥ PR-09** — both touch modules/U8G2Display. Conflict likely; serialise or split
  by directory with an explicit boundary.

## Gate criteria (PR-07) — all four required
1. Pixel-identical render from XML, verified by automated diff (not by eye)
2. XML materially shorter and clearer than the C++ replaced
3. Measured budget comfortable on esp32dev alongside WiFi/TLS (§18, Q-4)
4. Edit→regenerate→rebuild faster in practice than editing C++

NO-GO is a legitimate outcome. PR-01..PR-06 are independently valuable and additive.
