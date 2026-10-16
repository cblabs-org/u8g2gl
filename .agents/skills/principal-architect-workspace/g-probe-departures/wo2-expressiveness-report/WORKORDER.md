---
name: g-probe-wo2
description: Handoff instructions for Work Order 2 — EXPRESSIVENESS.md report
complexity: standard
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent. You are NOT the Principal Architect. Do not make high-level architectural decisions, do not branch, and do not plan. Your task is strictly limited to executing the checklist below.

# Objective

Write `EXPRESSIVENESS.md` at the repo root — the three-part deliverable for the PR-07 gate. This document reports what the framework can and cannot express, using WO1's XML and rendering output as evidence.

# Strict Boundary Box

- **DO NOT** modify any file in `src/`, `cli/`, `wasm/`, `docs/`, or `test/`.
- **DO NOT** modify any file WO1 created in `tmp/g-probe/` — read them.
- **DO NOT** propose schema changes, new widgets, or generator work. If you find a gap, report it.
- Your output is **one file**: `EXPRESSIVENESS.md` at the repo root.
- You may also create scratch scripts in `tmp/g-probe/` for line-counting.

# Tooling Constraints

- Read WO1's output in `tmp/g-probe/` — the XML files, gap documents, rendering output, and MANIFEST.md.
- Read `docs/design_spec.md` for spec references.
- Read `.agents/skills/principal-architect-workspace/pr-05-integration/C2-ANALYSIS.md` for the line-counting methodology. Match its rigour: separate concerns, count by kind (code/blank/comment), attribute every line.
- Read `tmp/g-probe-source/layoutSWR.json` for the original v3 layout.

# Source Material

1. **`tmp/g-probe/`** — all of WO1's output
2. **`tmp/g-probe-source/layoutSWR.json`** — the v3 layout (174 lines)
3. **`tmp/g-probe-source/nationalRailBoard.json`** — v1 mock data (102 lines)
4. **`docs/design_spec.md`** — the spec
5. **`.agents/skills/principal-architect-workspace/pr-05-integration/C2-ANALYSIS.md`** — line-counting methodology
6. **`docs/implementation_plan.md`** — gate criteria context

# Line-Item Instructions

- [ ] **Read all WO1 output.** Ingest the XML files, gap documents, rendering results, and MANIFEST.md. Understand what rendered and what didn't.

- [ ] **Write Part 1 — "What Rendered".** This section shows:
  - Which v3 widgets were expressible and how they map to U8G2GL elements
  - The rendering output (SHA-256 hash, lit pixel count, display dimensions)
  - A comparison note: does v3 itself produce a reference rendering of layoutSWR against this mock data? If not (the v1 data shape doesn't match v3's expectations), say so — do not invent a reference.
  - Include inline code blocks of the XML that rendered successfully.

- [ ] **Write Part 2 — "What Could Not Be Expressed".** For **each gap**:
  - **What the layout needs.** Quote the v3 JSON widget definition.
  - **Why the schema cannot say it.** Reference the specific spec section (§6.5 static structure, §9 collections, etc.).
  - **Which open question it belongs to.** [Q-8] repeaters, [Q-15] cards, or a new one.
  - **What closing it would cost in schema surface.** Be specific: how many new elements, attributes, or concepts? Evaluate against §1.5's deferral rule — "add an attribute" is never free.
  - **The workaround, if one exists.** Show the hand-expanded XML from WO1's `departures_workaround.xml` and state honestly: is this something a human would write? For the designer (which is the point of U8G2GL), is this nearly as bad as impossible?

  Organise this section by gap, not by widget. Expected gaps:
  1. **Repeaters ([Q-8])** — service lists and carriage formation
  2. **Message pool ([Q-15] or new)** — cycling through multiple messages
  3. **Per-carriage indicators** — icons/class/loading within a repeated template

  **Tone guidance from the bridge:** "Do not treat a gap as a verdict." The framework has not failed; it has not yet built the features this screen needs. Write it so a reader cannot misread the gap as a NO-GO.

- [ ] **Write Part 3 — "What It Cost".** Line-count comparison following C2-ANALYSIS.md's methodology:
  - Count the v3 JSON layout: total / blank / code lines, separated into layout vs. scaffolding.
  - Count the U8G2GL XML (static version): same breakdown.
  - Count the workaround XML: same breakdown.
  - Present the ratios: static XML / v3 JSON, workaround XML / v3 JSON.
  - Separate what is layout from what is project scaffolding (paid once per project).
  - Be honest about what the comparison means. The static XML is incomplete (it cannot express the full screen). The workaround XML is complete but nobody would write it. The fair number is what the XML would be *with repeaters* — project that, using C2-ANALYSIS.md's methodology, but label it as a projection.

- [ ] **Write the gate summary paragraph.** One paragraph a reader at the gate can act on:
  - Can this framework describe the screens it exists to describe?
  - If not, what is the shortest path to yes?
  - What does Phase 2 need to build?

  **Calibrate:** The answer is almost certainly "not yet, and the shortest path is [Q-8] repeaters plus a message-cycling mechanism." That is a backlog item, not a failure.

- [ ] **Final review.** Read the completed document end to end. Check:
  - Every claim is backed by a file reference or spec citation
  - No gap is presented as a verdict
  - No workaround is presented as a solution
  - The line counts add up
  - The gate summary is actionable

# Verification Requirement

1. `EXPRESSIVENESS.md` exists at the repo root
2. It has three numbered parts plus a gate summary
3. Every gap references a spec section and an open question
4. Line counts are internally consistent (totals sum correctly)
5. The document can be read by someone who has not seen the probe — no dangling references

**Before committing, ask the user if they are happy with the changes.**

# Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*, surface it in your Completion Report below — do not file issues directly. The Principal Architect will triage and file them under the correct author identity.

---

## Completion Report
<!-- Written by the worker at task completion -->
