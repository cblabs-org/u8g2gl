# U8G2GL — Implementation Plan

**Programme-level plan. Chief Architect tier.**

**Version**: 1.1
**Date**: September 2026
**Companion documents**: [design_spec.md](design_spec.md) (v0.2, what to build) · [concept.md](concept.md) (why)
**Programme workspace**: `.agents/skills/principal-architect-workspace/`

> This plan sequences the work. Where it and the spec disagree on *what* to build, the spec wins; on *where* and *in what order*, this plan wins.

---

## 1. Architectural Stance

### 1.1 The heritage constraint is rejected — [A-1]

`esp32-app-foundation/modules/U8G2Display/` contains a working widget layer inherited from departures-board: `IGfxWidget`, `DrawingPrimitives`, eight widgets, `IDisplayBoard`, `CarouselEngine`, six system boards.

**It is an integration reference, not an architectural basis.**

What it legitimately teaches: how a display module is shaped inside this framework — `library.json`, native-build exclusion, `web/` diagnostic assets, carousel and board lifecycle integration points, where adapters attach. That knowledge is valuable and should be reused.

What it must *not* do is set the architecture. Its widget model is a flat list of imperatively-driven objects with `setCoords`/`setVisible` and per-widget setters — the departures-board paradigm. Building U8G2GL as a binding-and-codegen veneer over that model would encode a design we are explicitly trying to move past, and would trade the programme's whole purpose for a shorter Phase 1.

> **Correction from v1.0 of this plan.** The previous revision treated the existing runtime as the foundation to build on and reduced the programme to "codegen over what exists". That was sunk-cost reasoning: *the code exists* is not an argument that *the design is right*. This revision plans the optimal architecture and treats migration as a separate, explicit concern.

### 1.2 The target: parallel LVGL 9's core decomposition — [A-2]

LVGL's core is a well-factored answer to the same problem, arrived at over a decade. The architecture should mirror its decomposition, diverging only where monochrome genuinely demands it.

| LVGL 9 core | U8G2GL equivalent | Status |
|---|---|---|
| `lv_obj` — base object | `u8g2gl_obj` — coords, flags, class ptr, parent | **Adopt** |
| `lv_obj_class` — `base_class`, ctor/dtor, `event_cb`, **property table** | `u8g2gl_obj_class` | **Adopt** — this is what makes `extends` (§6.4) and XML property codegen work |
| `lv_obj_property` — generic get/set by ID | property descriptors per class | **Adopt** — the codegen substrate |
| `lv_observer` — subjects and observers | subject system (§8) | **Adopt** |
| `lv_group` — encoder/keypad focus | focus group (§12.2) | **Adopt, and rename**: the spec's `<focus_ring>` is LVGL's group |
| `lv_obj_style` | reduced monochrome style set (§10) | **Adopt, reduced** |
| `lv_obj_event` | event dispatch | **Adopt, reduced** |
| `lv_obj_tree` — runtime parent/child | see [A-3] | **Diverge** |
| `lv_obj_pos` — runtime positioning | resolved at build time ([D-7]) | **Diverge** |
| `lv_refr` — dirty regions, partial render | full-frame redraw ([D-4]), frame gate ([D-15]) | **Diverge** |
| `layouts/` — flex, grid | none ([D-7]) | **Omit** |
| `lv_display` + `flush_cb` | U8G2 instance behind an adapter port | **Adapt** |
| `lv_indev` | `ButtonModule` / `EncoderModule` adapter | **Adapt** |

The divergences are all already-decided spec positions, and all trace to the same root: monochrome full-frame redraw with build-time layout. That coherence is a good sign the spec and this architecture agree.

### 1.3 Object tree: build-time hierarchy, flat runtime — [A-3]

The one genuinely open architectural question, and it should be settled before code.

LVGL keeps a real runtime tree — parent pointer plus child array per object — because it needs runtime layout, dirty-region invalidation, and dynamic add/remove. U8G2GL needs none of those ([D-4], [D-7]), but hierarchy still has to *mean* something: hiding a container must hide its children, and a child must clip to its parent.

**Proposal: a flat array of objects, each holding a parent index; no child lists.**

- Render walks the flat array in document order — cache-friendly, no traversal.
- Effective visibility = own flag AND all ancestors' flags, computed by walking *up* (depth is 2–4 in practice, and the walk is a handful of comparisons).
- Effective clip = intersection of ancestor bounds, same walk.
- Cost: one `uint8_t`/`uint16_t` per object, versus a child vector per node.

This keeps LVGL's hierarchy *semantics* while spending almost nothing, and it composes with components being inlined at generation time (§6.3). It is the kind of decision that is nearly free now and expensive after fifty widgets exist — hence [PD-3] below.

---

## 2. Programme Decisions Pending — human call required

### PD-1 · Licence — blocks all PRs

| Option | Case for | Case against |
|---|---|---|
| **MIT** (current spec §22) | Already committed | A differently-licensed module inside an Apache-2.0 repo complicates upstreaming |
| **Apache-2.0** *(recommended)* | Matches foundation exactly — LICENSE plus 120 SPDX headers. Adds a patent grant. Permissive and commercial-friendly, so §22's actual requirement is met | Amend spec §22 and the committed `LICENSE` |

> **Unrelated defect, surfaced not fixed:** `esp32-app-foundation/library.json` declares `"license": "CC-BY-NC-SA-4.0"` against an Apache-2.0 LICENSE and 120 Apache SPDX headers. That metadata currently advertises the framework as non-commercial.

### PD-2 · Where the host-side CLI lives — blocks PR-02

**Recommended: standalone in this repository**, npm-published, consumed by foundation as a pre-build step. [D-10] specifies npm distribution; both foundation and departures-board-v3 need the tool, and vendoring it twice is worse than a cross-repo dependency. The alternative — `foundation/tools/` — puts a TypeScript host tool inside a firmware library and forces v3 to vendor a framework to obtain a build tool.

### PD-3 · Ratify the core object model — blocks PR-01

[A-2] and [A-3] are architecture, and they are mine to propose but yours to ratify before they are cast in code. Specifically: the LVGL-parallel decomposition, and the flat-runtime/build-time-tree model.

This supersedes v1.0's PD-3 (widget naming aliases), which existed only because that revision planned to build on the legacy widgets. With [A-1] that question dissolves — new code gets the spec's naming ([D-12]/[D-13]) directly, and the legacy question becomes migration, not naming.

### PD-4 · Migration strategy for legacy `U8G2Display` — blocks PR-05

The new module cannot land big-bang: `modules/U8G2Display` is consumed by six system boards *and* by departures-board-v3 through a pinned `framework.lock`.

**Recommended: strangler-fig.** Build the optimal architecture as a new `modules/U8G2GL/`; migrate system boards to it one PR at a time; retire `modules/U8G2Display` once nothing depends on it. End state is a single module with the right architecture, reached without a flag day and without stranding the pinned downstream.

---

## 3. Repository Topology

| Repository | Role | Licence |
|---|---|---|
| **U8G2GL** (this repo) | Programme home — spec, concept, plan, workspace. Host CLI if PD-2 lands standalone | PD-1 |
| **esp32-app-foundation** | Upstream home for the runtime, `uidesign/`, build integration | Apache-2.0 |
| **departures-board-v3** | Downstream pathfinder. Pinned at `framework.lock` `f53cc1d7` | — |
| departures-board (v1) | Reference only — `layoutsim` Wasm harness, original widget designs | — |

Build in `esp32-app-foundation` first; v3 is a consumer that picks the work up by advancing its lock.

---

## 4. Dependency Graph

```
              ┌─────────────────────────────────┐
              │ PR-00  Spec: core object model  │   (U8G2GL)
              │        + ADR in foundation      │
              └────────────────┬────────────────┘
                               │  ratifies PD-3
              ┌────────────────┴────────────────┐
              ▼                                 ▼
  ┌─────────────────────────────┐  ┌──────────────────────────────┐
  │ PR-01  Core runtime:        │  │ PR-02  CLI + schema +        │
  │  obj, class, property table,│  │        display catalogue      │
  │  observer, frame gate       │  │        + validator            │
  └──────────────┬──────────────┘  └───────────────┬──────────────┘
                 │                                 │
                 ▼                                 │
  ┌─────────────────────────────┐                  │
  │ PR-03  Widget set on the    │                  │
  │        new object model     │                  │
  └──────────────┬──────────────┘                  │
                 ├─────────────────┬───────────────┘
                 ▼                 ▼
  ┌─────────────────────────┐  ┌──────────────────────────┐
  │ PR-06 Wasm preview +    │  │ PR-04  Generator XML→C++ │
  │       snapshot harness  │  └────────────┬─────────────┘
  └───────────┬─────────────┘               ▼
              │                 ┌──────────────────────────┐
              │                 │ PR-05  uidesign/ + build │
              │                 │        + first migration │
              │                 └────────────┬─────────────┘
              └──────────────┬───────────────┘
                             ▼
              ╔════════════════════════════════╗
              ║ PR-07  ★ GO / NO-GO GATE       ║
              ╚════════════════════════════════╝
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
  ┌────────────────────┐        ┌──────────────────────┐
  │ PR-08 Components,  │        │ PR-09 Focus group +  │
  │  custom widgets,   │        │  Button/Encoder indev│
  │  collections       │        └──────────────────────┘
  └────────────────────┘                    │
              └──────────────┬──────────────┘
                             ▼
              ┌──────────────────────────────┐
              │ PR-10  Retire U8G2Display    │
              ├──────────────────────────────┤
              │ PR-11  departures-board-v3   │
              └──────────────────────────────┘
```

---

## 5. Project Ledger

### Phase 0 — Architecture

| PR | Repo | Scope | Depends | Blocked by |
|---|---|---|---|---|
| **PR-00** | U8G2GL + foundation | Add the missing core-architecture section to the spec — object model, class system, property table, groups, [A-3] tree model. Land an ADR in `foundation/docs/developer/adr/`. Reconcile §20 phases and §22 licence | — | PD-1, PD-3 |

The spec as committed jumps from XML tags straight to widget behaviour and never defines an object model. That gap is invisible while the plan assumed legacy widgets and fatal now. **PR-00 is a genuine prerequisite, not documentation tidy-up.**

### Phase 1 — Prove the loop

| PR | Repo | Scope | Depends | Blocked by |
|---|---|---|---|---|
| **PR-01** | foundation | New `modules/U8G2GL/` core: `u8g2gl_obj`, class system with `base_class`, property table, subject/observer, style, frame gate + `ui_handler()` deadlines ([D-15]). Native unit tests | PR-00 | PD-3, PD-4 |
| **PR-02** | CLI | Schema, validator with §15 diagnostics, display catalogue from U8G2 ([D-14]), `find` modes (§5.2), `--json` ([D-16]) | — | PD-2 |
| **PR-03** | foundation | Widget set on the new model: label, scrolling label, xbm, glyph, box/line/circle primitives, progress bar, clock. Ported *in behaviour* from the legacy widgets, rewritten to the object model | PR-01 | — |
| **PR-04** | CLI | Generator XML → C++: property emission, component inlining, build-time layout ([D-7]) | PR-02, PR-03 | — |
| **PR-05** | foundation | `uidesign/<board>/u8g2gl/` per the `lvglpro` precedent, PlatformIO/CMake pre-build, committed `generated/`, first system board migrated | PR-04 | PD-4 |
| **PR-06** | CLI + foundation | Wasm preview + snapshot harness, ported from `departures-board/tools/layoutsim` | PR-03 | — |
| **PR-07** | foundation | **★ GATE** — §6 | PR-05, PR-06 | — |

### Phase 2 — Composition

| PR | Repo | Scope | Depends |
|---|---|---|---|
| **PR-08** | both | Components (§6.3), custom widgets via `extends` (§6.4), collection API (§9) | PR-07 |
| **PR-09** | foundation | Focus groups (§12.2), input dispatch via `ButtonModule`/`EncoderModule` | PR-07 |

### Phase 3 — Consolidation and stretch

| PR | Repo | Scope | Depends |
|---|---|---|---|
| **PR-10** | foundation | Migrate remaining system boards; retire `modules/U8G2Display` (PD-4 end state) | PR-08, PR-09 |
| **PR-11** | departures-board-v3 | Advance `framework.lock`; retarget the application board set | PR-10 |

---

## 6. The Gate — PR-07

**Target:** one existing system board, re-authored in XML on the new architecture. `DiagnosticsBoard` is the recommended candidate — real content, exercises labels and value binding, no downstream dependency — subject to the Tier-2 PA confirming on inspection.

**Pass requires all four:**

1. Renders **pixel-identically** to the legacy board, by automated diff — not by eye.
2. The XML is materially shorter and clearer than the C++ it replaces.
3. Measured flash and RAM comfortable on `esp32dev` alongside WiFi and TLS ([D-1], §18, Q-4).
4. Edit → regenerate → rebuild faster in practice than editing C++ was.

**On failure, stop.** PR-01 through PR-06 leave the foundation with a clean object model, a subject system, a display catalogue, a Wasm preview and a pixel-regression harness — all additive, none dependent on the XML layer, and `modules/U8G2Display` still running untouched under PD-4's strangler-fig. That is what makes stopping cheap, and a gate nobody can afford to honour is not a gate.

---

## 7. Concurrency & Conflict Advisory

| Pair | Overlap | Guidance |
|---|---|---|
| PR-01 ∥ PR-02 | None — different repos | **Safe. Recommended** — the critical path |
| PR-03 ∥ PR-04 | Contract dependency: PR-04 generates against PR-03's property tables | Freeze the property-descriptor format in PR-01 so both can proceed against it |
| PR-04 ∥ PR-06 | Both consume PR-03; different repos | Safe, same caveat |
| PR-08 ∥ PR-09 | Both touch `modules/U8G2GL` | **Conflict likely.** Serialise or split by directory |
| Any ∥ PR-10 | PR-10 deletes the legacy module | Strictly last |

---

## 8. Risk Register

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Two display modules coexisting confuses contributors and doubles maintenance | **High** | PD-4 strangler-fig with PR-10 as an explicit, scheduled retirement — not "someday" |
| R-2 | Rebuilding widgets loses hard-won behaviour from the legacy set (scroll timing, clock alignment, stipple fill) | **High** | PR-03 ports *behaviour* deliberately; PR-06's pixel snapshots make regressions visible |
| R-3 | Generated code harder to debug than the C++ it replaces | High | PR-07 criterion 2; stop is real |
| R-4 | Object model wrong in a way only discovered at PR-08 | Medium | PR-00 ratifies it against LVGL's proven decomposition before code |
| R-5 | Cross-repo drift between CLI and runtime | Medium | Generator version in generated files (§13.2); runtime rejects major mismatch (§16) |
| R-6 | `bdfconv` packaging (Q-2) blocks fonts | Medium | Wasm route proven by `layoutsim`; `<builtin>` needs no pipeline (§22.1) |
| R-7 | Downstream v3 stranded on the pinned lock | Medium | v3 only moves at PR-11; legacy module survives until PR-10 |
| R-8 | Scope creep toward the visual editor | Medium | Editor stays out of the committed plan |

---

## 9. Immediate Next Actions

1. **Settle PD-1 (licence), PD-2 (CLI home), PD-3 (ratify the object model), PD-4 (migration strategy).** PD-3 is the substantive one — [A-2] and [A-3] in §1.
2. On PD-1 + PD-3, spawn the Tier-2 Principal Architect for **PR-00**.
3. PR-02 is independent of the architecture question and can start as soon as PD-1 and PD-2 land — worth running in parallel with PR-00 to keep the critical path short.

Programme state: `.agents/skills/principal-architect-workspace/PROGRAM.md` · PR graph: `PROGRAM-PLAN.md`
