# E-D: The Editor Design

**Type:** Design PR. A document and a decomposition, no source changes
**Base:** `main` @ `fdf75ed` (the PR-07 GO)
**Branch prefix:** `u8g2gl-ed/`
**Worktree:** `../U8G2GL-ed`
**Ledger row:** `implementation_plan.md` §5, editor track: E-D
**Deliverables:** `EDITOR-DESIGN.md` (the interaction design and five decisions),
the E-1 decomposition with acceptance criteria, and `LOOP-BUDGET.md` (WO1's measurements)

---

## What E-D is for

`[UD-1]`–`[UD-7]` settle the editor's architecture. E-D supplies what they leave out:
the **interaction design** (what a person does and what the editor does back) and a
breakdown of E-1 into PRs that someone can build and a reviewer can check.

The bridge set five decisions only E-D can settle:

1. the edit loop, and whether E-2's **16 ms** target is reachable
2. the two modes: live editing and the compiled test run
3. custom widgets in the browser
4. what E-1 contains
5. where the tagged questions land: [Q-17], [Q-10], [Q-7], [Q-19], [U-6]

## Findings before decomposition (research, 2026-10-22)

Found by reading `main`, and put to the owner before any work began:

1. **The prebuilt editor Wasm renders one test project.** `wasm/CMakeLists.txt` links
   `test/generated_fixture`'s registry, fonts and images. `wasm/bridge.cpp` hardcodes that
   fixture's font and image names. No real project's fonts render, let alone its widgets.
2. **Static mode cannot run a compiler**, so neither the test run nor a custom widget's C++
   can be built from the browser under the 2026-10-05 "no server component" ruling.
3. **Of ui_spec §15's seven "must add" schema features, only `help=` exists in schema 0.4.**
   There is no grouping, no `<previews>`, no palette metadata, no `visible_when`, and no
   sample data.
4. **No CST exists.** The tokeniser (`cli/src/core/parser/xml-tokeniser.ts`) records line
   and column at the *start* of each attribute. It records no offsets, no end positions and
   no quote style, and it keeps comments as strings without positions.

## The owner's rulings

**Premise, 2026-10-23.** The owner, verbatim:

> "So I would expect that anyone using this is building a system with esp32 or arduino, so thye have a toolchain installed.  We should focus on user 2 and not compromise their experience for user 1 at this point."

"User 2" is a widget author or ESP32/Arduino developer with a C++ toolchain. "User 1" is
ui_spec §1's non-coding layout designer.

**On in-browser compilation, 2026-10-24.** The owner, verbatim:

> "OK - I can see now why B is basically a long-shot.  I think we can assuem a designer has the full too-chain installed for building a U8G2 application.  If we make that assumption, what is the most effective option do you think?"

Option B, a C++ compiler running in the browser, is set aside. It was judged a long shot
because of the dynamic-linking problem and the cost of owning a toolchain, not because of
download size.

**Decision, 2026-10-26: served-first.** The owner, verbatim:

> "OK - let's make this decision to go with this option.  I think e should come back and reassess at stages as we go along and see what we learn and if that changes things."

"This option" is **A + E**:
- `npx u8g2gl design` serves the editor, watches the project, and rebuilds the project's
  editor Wasm with a pinned Emscripten that the CLI manages.
- Rendering stays in-browser Wasm, so the server is **never in the 16 ms edit loop**.
- Served mode becomes primary and static mode is deferred. This **reverses the sequencing**
  of the owner's 2026-10-05 `[UD-2]` amendment. It does not reverse `[UD-2]` itself, because
  one `ProjectFileSystem` interface keeps both modes possible.
- E-D proposes the amendment text for ui_spec and implementation_plan. It does not land it,
  because those are Tier-1 documents.

"Reassess at stages" is built into the plan as named checkpoints, each with a trigger.
See `EDITOR-DESIGN.md`.

## Work-order ledger

The PA does the work orders directly. This is design work, so no workers are spawned.
Each work order ends with a push.

- [x] **WO1 · Measure.** Done 2026-10-26: [LOOP-BUDGET.md](LOOP-BUDGET.md). Write `LOOP-BUDGET.md`: time each stage of the live path (parse,
  validate, resolve, scene, Wasm build, render, blit) on the G-PROBE-2 departures project and
  the test fixture, and time a rebuild of the project editor Wasm with G-PROBE-2's two
  widgets. Scripts and logs go in `evidence/`, build output in `build/`, with no source changes.
- [x] **WO2 · Design.** Done 2026-10-26: [EDITOR-DESIGN.md](EDITOR-DESIGN.md). Write `EDITOR-DESIGN.md`: the interaction design, the five decisions,
  the rulings on the tagged questions, the reassessment checkpoints, and the biggest risk.
- [x] **WO3 · Decompose.** Done 2026-10-26: [E1-DECOMPOSITION.md](E1-DECOMPOSITION.md). Split E-1 into PRs with acceptance criteria, and draft the
  amendment text for `[UD-2]` (ui_spec) and the editor-track ledger (implementation_plan).

## Status Log

- **2026-10-22.** Research on `origin/main` @ `fdf75ed`. The four findings above were put to
  the owner with a proposed shape. Owner: "Not yet — I want to discuss the findings before
  you start."
- **2026-10-23 to 2026-10-26.** Options discussed: A (a local watcher), B (in-browser clang),
  C (placeholders only), D (a committed project Wasm), E (served mode), and a native
  renderer. The rulings above were recorded verbatim.
- **2026-10-26. Decomposition approved.** The owner, verbatim:

  > "Approved — proceed with E-D as revised: worktree from origin/main, WO1 measure, WO2 design, WO3 decomposition with checkpoints."

  *Provenance note:* the owner sent this through a reply button whose text the PA drafted,
  answering the revised shape presented that turn. It is recorded as the owner's approval
  because the owner chose to send it. It is flagged here because this programme records its
  rulings word for word, and the reader should know whose words these first were.
- **2026-10-26. WO1 complete.** 16 ms is reachable: a nudge on the departures screen costs
  1.1 ms median and 1.9 ms worst in Chromium with Monaco, and 100 elements cost 3.3 ms worst.
  A widget rebuild takes 2.7 s, or about 1.1 s with an `-O1` link. Five new findings
  (LOOP-BUDGET.md §6):
  - F5: G-PROBE-2's widget C++ had never run; its "full screen" render was a JavaScript
    imitation.
  - F6: the editor Wasm's capacities are constants, so a 256-byte subject is refused.
  - F7: collection widgets render blank because no data can reach them.
  - F10: no Emscripten is managed, and CI builds no Wasm. This corrects the PA's 2026-10-24
    statement to the owner.
- **2026-10-26. WO2 and WO3 complete.**
  - EDITOR-DESIGN.md: the interaction design, the five decisions, six reassessment
    checkpoints, and the biggest risk (§9): collection widgets render blank until PR-08 can be
    filled by name.
  - E1-DECOMPOSITION.md: E-1 as five PRs (E-1a to E-1e) with acceptance criteria, plus
    proposed Tier-1 text for `[UD-2]`, the ledger, and a requirement on PR-08.
  - **Awaiting the owner's approval of the E-1 decomposition before any E-1 work begins**
    (rule 01).
- **2026-10-26. E-1 decomposition approved.** The owner, verbatim:

  > "Approved — the E-1 decomposition (E-1a to E-1e) as written in E1-DECOMPOSITION.md."

  *Provenance note:* as with the earlier approval, the owner sent this through a reply button
  whose text the PA drafted, after the PA's closing summary of all three work orders.

  **Scope of this approval:** it approves the *decomposition*: E-1 as five PRs, their
  boundaries and their acceptance criteria. It does not start any of them. Each E-1 PR is a
  PR of its own, with its own Principal Architect and plan gate. That PA verifies provenance
  from this entry (rule 00), and the owner approves that PR's Work-Order breakdown in turn.
  The proposed Tier-1 text (E1-DECOMPOSITION.md §4) is still the Chief Architect's to land.
