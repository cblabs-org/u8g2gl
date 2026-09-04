# PROGRAM-PLAN — U8G2GL PR Sequence

Tier-1 dependency graph. Each row is one PR delegated to a Tier-2 Principal Architect.
Full rationale: [implementation_plan.md](../../../docs/implementation_plan.md)

## Gating decisions (human)
| ID | Decision | Blocks | Recommendation |
|---|---|---|---|
| PD-1 | Licence: MIT vs Apache-2.0 | all | Apache-2.0 (match foundation) |
| PD-2 | CLI home: standalone vs foundation/tools | PR-02 | Standalone in U8G2GL, npm-published |
| PD-3 | Ratify core object model (A-2 LVGL parallel, A-3 flat runtime) | PR-00/01 | As proposed |
| PD-4 | Legacy U8G2Display migration | PR-05 | Strangler-fig, retire at PR-10 |

## PR sequence

| PR | Repo | Scope | Base | Status |
|---|---|---|---|---|
| PR-00 | U8G2GL+fnd | Spec core-architecture section + foundation ADR + §22 licence | main | Blocked PD-1/PD-3 |
| PR-01 | foundation | modules/U8G2GL core: obj, class+base_class, property table, observer, style, frame gate | PR-00 | Blocked PD-3/PD-4 |
| PR-02 | CLI | Schema, validator, display catalogue, find modes, --json | main | Blocked PD-1/PD-2 |
| PR-03 | foundation | Widget set rebuilt on the object model (behaviour ported from legacy) | PR-01 | Pending |
| PR-04 | CLI | Generator XML→C++, property emission, component inlining, layout resolution | PR-02+PR-03 | Pending |
| PR-05 | foundation | uidesign/<board>/u8g2gl + build hooks + first board migrated | PR-04 | Blocked PD-4 |
| PR-06 | CLI+fnd | Wasm preview + snapshot harness (port layoutsim) | PR-03 | Pending |
| PR-07 | foundation | ★ GO/NO-GO GATE — pixel-diff, budget, ergonomics | PR-05+PR-06 | Pending |
| PR-08 | both | Components, custom widgets via extends, collections | PR-07 | Phase 2 |
| PR-09 | foundation | Focus groups + Button/Encoder indev | PR-07 | Phase 2 |
| PR-10 | foundation | Migrate remaining boards; retire modules/U8G2Display | PR-08+PR-09 | Phase 3 |
| PR-11 | v3 | Advance framework.lock; retarget application boards | PR-10 | Stretch |

## Parallelism
- **PR-00 ∥ PR-02** — PR-02 is independent of the object model. Recommended, shortens critical path.
- **PR-01 ∥ PR-02** — different repos, no overlap.
- **PR-03 ∥ PR-04** — contract dependency on property-descriptor format. Freeze that format
  in PR-01 so both proceed against it.
- **PR-08 ∥ PR-09** — both touch modules/U8G2GL. Serialise or split by directory.
- **PR-10** — strictly last; it deletes the legacy module.

## Gate criteria (PR-07) — all four required
1. Pixel-identical to the legacy board by automated diff (not by eye)
2. XML materially shorter and clearer than the C++ replaced
3. Measured budget comfortable on esp32dev alongside WiFi/TLS (§18, Q-4)
4. Edit→regenerate→rebuild faster in practice than editing C++

NO-GO is legitimate. PR-01..PR-06 are additive; legacy U8G2Display still runs under PD-4.
