# G-PROBE: Can U8G2GL Express a Real Departures Screen?

**Type:** Expressiveness probe (read-only analysis — no firmware, no schema changes)
**Base:** `main` @ `fa475f4`
**Branch prefix:** `u8g2gl-probe/`
**Source material:** `layoutSWR.json` (174 lines, departures-board-v3) + `nationalRailBoard.json` (102 lines, departures-board v1)
**Deliverable:** `EXPRESSIVENESS.md` — three-part report for the PR-07 gate

---

## Decomposition

This probe is two work orders, not three. The analysis (Part 2) depends on having the XML (Part 1), and the line-count (Part 3) depends on both — but Part 3 is arithmetic that fits naturally into the same WO as Part 2. Splitting it would manufacture a handoff where none is needed.

### Work Order Ledger

- **[ ] [wo1-xml-authoring](wo1-xml-authoring/WORKORDER.md):** Author the U8G2GL XML that expresses as much of `layoutSWR.json` as schema 0.4 allows. For each widget that cannot be expressed (ServiceListWidget, TrainFormationWidget, ScrollingMessagePoolWidget), write the XML *up to the gap* and document precisely where the schema stops. Produce a hand-expanded workaround for the formation widget (12 carriages) — labelled as a workaround, not a solution. Render what can be rendered against the mock data via the Wasm harness. Archive the source material from the two departures-board repos into `tmp/g-probe-source/`.

- **[ ] [wo2-expressiveness-report](wo2-expressiveness-report/WORKORDER.md):** Write `EXPRESSIVENESS.md` at the repo root. Part 1: what rendered and how (include the render script, reference the XML, show what pixels appeared). Part 2: for each gap — what the layout needs, why the schema cannot say it, which open question it maps to, what closing it would cost in schema surface. Part 3: line-count comparison using C2-ANALYSIS.md's methodology — separate layout from scaffolding. One-paragraph gate summary at the end.

### Dependencies

```
wo1 → wo2 (wo2 reads wo1's XML and rendering output)
```

Serialised, not parallel. No file overlap.

---

## Modules & Components

| Module | First Touched | Notes |
|---|---|---|
| `tmp/g-probe-source/` | WO1 | Archived layout + mock data from external repos |
| Wasm harness (`wasm/`) | WO1 | Read-only — used for rendering, not modified |
| Spec (`docs/design_spec.md`) | WO2 | Read-only — referenced for gap analysis |
| `EXPRESSIVENESS.md` | WO2 | Deliverable |

---

## Session Log

### 2026-10-16 — Initial decomposition

**Research findings:**
- `layoutSWR.json` is 174 lines (the bridge said 173; it has a trailing newline making 174 physical lines, 173 of content). Seven widgets + three primitives.
- The mock data (`nationalRailBoard.json`) is v1, not v3. The data shapes differ: v1 uses `header.firstServiceFormation[]` with `classType`/`hasWheelchair`/`hasBike`/`loading`, v3 uses `services.main[0].formation.carriages[]` with `class`/`wheelchair`/`bike`/`loading`. The field mapping is different but the content is equivalent: 12 carriages, 10 services, 2 long messages.
- Schema 0.4 has no repeater ([Q-8]), no card ([Q-15]), no collection rendering in the view layer. `wd_service_list` is specified in §6.5/§9 as a *custom C++ element* — its rendering is hand-coded, not expressed in XML.
- The Wasm harness (`bridge.cpp`) accepts `ui_scene.json` — the generator's output format. It does **not** accept XML directly. The pipeline is XML → CLI generator → scene JSON → Wasm bridge. **The probe must run the generator to get renderable output.**
- C2-ANALYSIS.md (388 lines) establishes the line-counting methodology: separate layout from scaffolding, count code/blank/comment, attribute concerns.

**Predicted gaps (to be confirmed by WO1):**
1. **ServiceListWidget** → [Q-8] repeaters. No way to express "for each row in services, render this template." Each row must be hand-expanded to individual `<u8g2gl_label>` elements. The column definitions (`width`, `align`, `truncate`) have no schema equivalent — each column is a separate label with manual positioning.
2. **TrainFormationWidget** → [Q-8] repeaters + [Q-15] cards. 12 carriages, each with class/wheelchair/bike/loading indicators. Hand-expansion to 12 `<u8g2gl_box>` elements is possible but omits all the per-carriage data (icons, class markers, loading). The carriage is too complex for a single drawing element — it's a composite unit.
3. **ScrollingMessagePoolWidget** → [Q-15] cards or a new cycling mechanism. A pool of messages that cycle with pause/scroll transitions. `<u8g2gl_label long_mode="scroll">` handles one message; cycling through a *pool* requires runtime state the schema doesn't express.
4. **ClockWidget `secondaryFont`** → The spec's `<u8g2gl_clock>` has `secondary_font` for the seconds digits. This should be expressible.
5. **`align="CENTER"` on LabelWidget** → `<u8g2gl_label align="center">` exists. This is expressible.
6. **`visible: false`** → `hidden` flag exists but is runtime-driven via `bind_flag_if_eq`, not a static attribute. Need to check if there's a literal `hidden="true"`.

**Decision:** Two WOs is correct. WO1 is `standard` — clear boundary, concrete checklist. WO2 is `standard` — the analysis is structured by the template the bridge gave.

---

## Owner Approval

> *(awaiting owner approval of this decomposition)*
