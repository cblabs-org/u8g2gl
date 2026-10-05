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
| ~~CA-1~~ | ~~Shape of the editor track~~ | **CLOSED 2026-10-05** — track runs **after the gate**; browser-hosted, no server (`[UD-2]` static, served deferred); **E-D** design item added, E-1 not decomposed until it lands |
| ~~CA-2~~ | ~~The gate does not measure the editor~~ | **CLOSED 2026-10-05** — the four criteria stand, gate stays firmware-side; equivalency proven before designer effort. The unmeasured differentiator is recorded at `implementation_plan.md` §6 |
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
| PR-4R | U8G2GL | ★ Interim remediation from PR-04's findings: clamped bound draw-call arguments, `style_*` restricted, runtime radius bound, shared tables moved to neutral modules | PR-04 | ✅ **MERGED #6 + #7** — C++ 377 / CLI 1087 |
| PR-04b | U8G2GL | Font and image pipeline: `<bdf>` through `bdfconv` in Wasm, PNG→XBM `<convert>` | PR-04, PR-4R WO1 (#6) | ✅ **MERGED #8** — closes [Q-2]; all 12 departures-board font arrays byte-identical |
| **PR-4R2** ← **NEXT** | U8G2GL | Carried corrections from PR-4R: force an object for a bound-geometry child of a container (§13.5 — clipping made realisation observable); refuse a `time` subject bound to a coordinate (§13.2, unenforced); check a style radius at build time where the element's size is literal; state the radius bound in the box manifest's help text | PR-04b | Pending — **the clipping condition must not slip past PR-05** |
| PR-04b | U8G2GL | **Font and image pipeline:** `<bdf>` through `bdfconv` in Wasm [Q-2], PNG→XBM `<convert>`. Split out of PR-04, which refuses both with a named error | PR-04 | Pending — **on the critical path** |
| PR-05 | foundation | Integration module, build hooks, first board migrated. **Owed by PR-04:** a compile check against real U8G2 headers for the ESP-IDF build — PR-04 WO4c covers Arduino only. **Also owed by PR-04 (WO12, 2026-09-28):** `generate()` returns its report (§13.11 ends "emit → report", and the isomorphic designer needs it); `--check` reports a directory that would be removed; and the budget report's `§` and em dashes tested on a legacy Windows console | PR-04 + **PR-04b** | Pending |
| PR-06 | U8G2GL | Wasm renderer + snapshot harness. **Owed by PR-04:** a container-edge pixel test against real U8G2 — (a) an element whose clip is exactly its bounds, drawing to its last column and row; (b) a frame partly off the left edge, confirming wrapped origins draw their visible part; (c) a clipped line, allowing ~1px endpoint rounding (WO4c T1) and a corner pixel at the clipping bound (T2). Plus a compile check against real U8G2 headers for the Wasm build. **Also owed by PR-04 (WO11, WO10b, WO11b, 2026-09-27):** a subject observer cannot be removed, so an editor host that rebuilds a scene leaks observer slots and a reused binding slot can be driven by a stale observer, and rebinding text adds a second observer; the editor runtime uses default capacities, which the Wasm build must size; and an out-of-range `int` wraps silently when it reaches a narrower setter, so the host validates values first | PR-3R | Pending — may run ∥ PR-04 |
| PR-07 | foundation | ★ **GO/NO-GO GATE** — four criteria, firmware-side, settled by CA-2 | PR-05 + PR-06 | Pending |

## Editor track — the programme's destination (design_spec §20 Phase 3)

**Sequenced by CA-1 (owner, 2026-10-05): the track runs after PR-07's gate.**
The XML-to-firmware path is proven first. E-1 is explicitly *not* one PR; E-D
breaks it up before any of it is built.

| PR | Repo | Scope | Depends | Status |
|---|---|---|---|---|
| **E-D** | U8G2GL | **Editor design.** Interaction and UX design on the settled `[UD-1]`–`[UD-7]` architecture; decompose E-1 into real PRs with boundaries and acceptance criteria. Document, no code | **PR-07 GO** | Next after the gate |
| E-1 | U8G2GL | Designer shell: Monaco + custom shell `[UD-1]`, `ProjectFileSystem` on the File System Access API (`[UD-2]` static mode), CST parse/serialize with lossless round-trip `[UD-3]`. **Split by E-D** | E-D | Placeholder |
| E-2 | U8G2GL | Canvas with direct manipulation; property panel and palette driven by `<api>` manifests `[D-17]`; `[UD-4]` Wasm renderer | E-1, PR-06 | Placeholder |
| E-3 | U8G2GL | Sample data for binding preview; screen navigation design | E-2 | Placeholder — blocked U-6 |

**Browser-hosted, no server.** Generation runs client-side — `[D-10]`'s
isomorphic CLI plus PR-04b's Wasm `bdfconv` means schema, validator, generator
and font compilation all work in the browser. Firmware building stays in
PlatformIO on the user's machine, and the canvas does not need it (`[UD-4]`
renders arbitrary XML from a pre-built Wasm target). Served mode (`npx u8g2gl
design`, the Firefox/Safari path) is deferred, not dropped.

**No serializer or CST module exists on `main`** (verified 2026-10-05). It is
E-1's first job. Post-gate is the right place for it: `[UD-3]` makes round-trip
fidelity a parser contract, not a schema property, so nothing here constrains a
decision that would be costly to reverse.

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
- **Editor track** after the PR-07 gate (CA-1, 2026-10-05). E-D first.
- **PR-08 ∥ PR-09** — both touch the runtime; serialise or split by directory.
- **PR-10** strictly last in consolidation — it deletes the legacy module.

## Gate criteria (PR-07) — all four required

1. Pixel-identical to the legacy board by automated diff, not by eye
2. XML materially shorter and clearer than the C++ it replaces
3. Measured budget comfortable on `esp32dev` alongside WiFi/TLS (§18, Q-4)
4. Edit → regenerate → rebuild faster in practice than editing C++

**CA-2 settled (owner, 2026-10-05): the gate tests the framework only, and the
four criteria stand.** A fifth, editor-facing criterion was recommended and
declined; equivalency is proven before designer effort is spent. The cost was
taken knowingly and is written up at `implementation_plan.md` §6 — a GO certifies
the half shared with prior art, and criteria 2 and 4 are judged against
hand-written XML, which is the architecture's weakest case. **Judge them as
written; do not discount them for the absence of a designer.**

NO-GO is legitimate. PR-01..PR-06 are additive; the legacy display module keeps
running under PD-4.
