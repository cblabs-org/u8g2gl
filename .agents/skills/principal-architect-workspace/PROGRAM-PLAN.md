# PROGRAM-PLAN — U8G2GL PR Sequence

Tier-1 dependency graph. Each row is one PR delegated to a Tier-2 Principal
Architect by bridge prompt. Full rationale: [implementation_plan.md](../../../docs/implementation_plan.md).
Normative scope: [design_spec.md](../../../docs/design_spec.md) §20; editor:
[ui_spec.md](../../../docs/ui_spec.md).

<!-- Rewritten 2026-09-13. The previous version still showed PR-01/02 as blocked,
     placed the runtime in the foundation repo, named a "property table" ([D-17]
     rejected it) and "component inlining" ([D-18] removed it), had no PR-3R, and
     contained no PR for the editor. -->

## Programme decisions

All four closed: **PD-1** MIT · **PD-2** U8G2GL repo ships runtime and CLI;
foundation gets an integration module · **PD-3** virtual base, flat parent-index
hierarchy · **PD-4** strangler-fig migration of the legacy display module.

## Open — owner decisions needed

| ID | Question | Blocks |
|---|---|---|
| **CA-1** | **Shape of the editor track** — how many PRs, and does it sit behind the PR-07 gate or run alongside it? See "Editor track" below | E-1 |
| **CA-2** | **The gate does not measure the editor.** All four PR-07 criteria are firmware-side. The programme could pass or fail GO/NO-GO without testing the thing it exists to build | PR-07 |
| U-6 | Where sample data lives | E-3 |
| Q-1 | Multi-target layout overrides — needs two real targets | — |

## Phase 1 — Prove the loop

| PR | Repo | Scope | Base | Status |
|---|---|---|---|---|
| PR-01 | U8G2GL | Runtime core: object model, subjects, styles, frame gate | main | ✅ **MERGED #1** |
| PR-02 | U8G2GL | CLI: schema, validator, display catalogue, `find`, `--json` | main | ✅ **MERGED #2** |
| PR-03 | U8G2GL | Widget set + `[U-1]` element identity | PR-01 | ✅ **MERGED #3** |
| PR-3R | U8G2GL | ★ Interim remediation to `[D-18]`–`[D-21]`, schema 0.4 | PR-03 | ✅ **MERGED #4** |
| PR-04 | U8G2GL | Generator XML→C++ per §13: realisation, composite expansion, build-time layout, mangling, generated capacities `[D-21]`, editor-target registry `[UD-4]` | PR-3R | ✅ **MERGED #5** — 21 WOs, C++ 361 / CLI 1044 |
| **PR-4R** | U8G2GL | ★ Interim remediation from PR-04's findings: clamp bound draw-call arguments as the object path does (realisation must not be observable, [D-18]); restrict inline `style_*` to §10's nine; runtime clamps a rounded box's radius at draw time; move shared validator/generator lookup tables to a neutral module | PR-04 | **NEXT** — may run ∥ PR-04b |
| PR-04b | U8G2GL | **Font and image pipeline:** `<bdf>` through `bdfconv` in Wasm [Q-2], PNG→XBM `<convert>`. Split out of PR-04, which refuses both with a named error | PR-04 | Pending — **on the critical path** |
| PR-05 | foundation | Integration module, build hooks, first board migrated. **Owed by PR-04:** a compile check against real U8G2 headers for the ESP-IDF build — PR-04 WO4c covers Arduino only. **Also owed by PR-04 (WO12, 2026-09-28):** `generate()` returns its report (§13.11 ends "emit → report", and the isomorphic designer needs it); `--check` reports a directory that would be removed; and the budget report's `§` and em dashes tested on a legacy Windows console | PR-04 + **PR-04b** | Pending |
| PR-06 | U8G2GL | Wasm renderer + snapshot harness. **Owed by PR-04:** a container-edge pixel test against real U8G2 — (a) an element whose clip is exactly its bounds, drawing to its last column and row; (b) a frame partly off the left edge, confirming wrapped origins draw their visible part; (c) a clipped line, allowing ~1px endpoint rounding (WO4c T1) and a corner pixel at the clipping bound (T2). Plus a compile check against real U8G2 headers for the Wasm build. **Also owed by PR-04 (WO11, WO10b, WO11b, 2026-09-27):** a subject observer cannot be removed, so an editor host that rebuilds a scene leaks observer slots and a reused binding slot can be driven by a stale observer, and rebinding text adds a second observer; the editor runtime uses default capacities, which the Wasm build must size; and an out-of-range `int` wraps silently when it reaches a narrower setter, so the host validates values first | PR-3R | Pending — may run ∥ PR-04 |
| PR-07 | foundation | ★ **GO/NO-GO GATE** | PR-05 + PR-06 | Pending — see CA-2 |

## Editor track — the programme's destination (design_spec §20 Phase 3)

**Not yet decomposed. Placeholders only, so the editor cannot fall out of the
graph again.** The shape below is a starting proposal for CA-1, not a decision.

| PR | Repo | Scope | Depends | Status |
|---|---|---|---|---|
| E-1 | U8G2GL | Designer shell: Monaco + custom shell `[UD-1]`, project filesystem API, lossless XML round-trip `[UD-3]` | PR-04, PR-06 | Placeholder |
| E-2 | U8G2GL | Canvas with direct manipulation; property panel and palette driven by `<api>` manifests `[D-17]` | E-1 | Placeholder |
| E-3 | U8G2GL | Sample data for binding preview; screen navigation design | E-2 | Placeholder — blocked U-6 |

## Phase 2 — Composition

| PR | Repo | Scope | Depends |
|---|---|---|---|
| PR-08 | both | **Re-scoped:** custom C++ elements via `extends` (§6.5), collection API (§9). *Composites are no longer here* — PR-3R put them in the type model and PR-04 expands them | PR-07 |
| PR-09 | foundation | Focus groups, input dispatch. *`u8g2gl_button` and `u8g2gl_switch` already shipped in PR-03*. **Owed by PR-04 (Chief Architect ruling, 2026-09-19; owner agreed 2026-09-19):** §10 gives an element's own attributes precedence over a named style, and PR-04 delivers that by applying styles before properties at init (§13.7). `focus_style` re-applies a style at run time, where `apply_style`'s `merge_from` would overwrite properties the element set itself, so PR-09 must track which properties those are | PR-07 |
| PR-08b | U8G2GL | `<row>`/`<col>` stacking sugar, only if real usage has shown the need | PR-08 |

## Phase 3 — Consolidation and stretch

| PR | Repo | Scope | Depends |
|---|---|---|---|
| PR-10 | foundation | Migrate remaining boards; retire the legacy display module | PR-08 + PR-09 |
| PR-11 | departures-board-v3 | Advance `framework.lock`; retarget application boards | PR-10 |

*Naming note: design_spec §20 calls its Phase 3 "Interaction & the Editor"; this
ledger's Phase 3 is consolidation. The editor track above is §20's Phase 3. The
phase labels are left unaligned rather than renumbered across three documents.*

## External dependency — U8G2 (decided 2026-09-14)

Pinned to **U8G2 2.36.18**, the version `esp32-app-foundation` already builds.
The owner decided U8G2 is fetched into this repo and installed as a library in
every app using U8G2GL or the designer, following `modules/LVGLDisplay`.

| Consumer | Mechanism | Lands in |
|---|---|---|
| This repo — real-header compile check, catalogue builder | Git submodule pinned to the tag confirmed by the owner 2026-09-14 | PR-04 (WO4c) |
| Wasm renderer and designer | Compile U8G2's C source from the submodule | PR-06 |
| Apps using the library | `library.json` dependency `olikraus/U8g2@^2.36.18`, as `LVGLDisplay` does for LVGL | PR-05 |

Licence: code BSD-2-Clause, fonts per-group. A notices row in both repos.

## Parallelism

- **PR-04 ∥ PR-06** — both build against §13 and `[UD-4]`. PR-06's dynamic
  construction consumes PR-04's editor registry, so **agree the registry's shape
  before either PA starts**, or one of them writes it twice.
- **PR-4R ∥ PR-04b** — different areas (runtime, draw-arg emission and the
  validator, against the font and image pipeline), but both touch
  `cli/src/core/generator/emit/`. Watch that seam; serialise if it gets busy.
- **PR-05** strictly after PR-04 **and PR-04b**. departures-board-v3's screens use
  custom BDF fonts (`NatRailTall12`, `RailClockMega13`, `NatRailClockLarge9` and
  others), so the first board migration can't finish without `bdfconv`. [Q-2]
  moved from "work, not risk" onto the critical path on 2026-09-13.
- **PR-04b** extends `generate`'s asset handling, so it follows PR-04 rather than
  running alongside it — two PAs editing the generator at once is the conflict to
  avoid.
- **Editor track** after PR-04 and PR-06. Its relation to PR-07 is CA-1.
- **PR-08 ∥ PR-09** — both touch the runtime; serialise or split by directory.
- **PR-10** strictly last in consolidation — it deletes the legacy module.

## Gate criteria (PR-07) — all four required

1. Pixel-identical to the legacy board by automated diff, not by eye
2. XML materially shorter and clearer than the C++ it replaces
3. Measured budget comfortable on `esp32dev` alongside WiFi/TLS (§18, Q-4)
4. Edit → regenerate → rebuild faster in practice than editing C++

**Chief Architect note (CA-2):** every criterion is firmware-side. None asks
whether the editor is viable, so a GO says nothing about the programme's stated
purpose and a NO-GO could kill the editor without it ever being tested. Owner
decision whether to add an editor criterion, or to state explicitly that the gate
tests the framework only.

NO-GO is legitimate. PR-01..PR-06 are additive; the legacy display module keeps
running under PD-4.
