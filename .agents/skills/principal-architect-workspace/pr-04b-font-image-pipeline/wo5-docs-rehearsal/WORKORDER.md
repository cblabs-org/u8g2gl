---
name: pr-04b-font-image-pipeline-wo5
description: Handoff instructions for Work Order 5 — licences, docs and a migration rehearsal
complexity: standard
---

# WO5 — licences, docs and a migration rehearsal

**Parent project:** PR-04b, the font and image pipeline —
[PROJECT.md](../PROJECT.md). The owner's approval of this decomposition is
recorded verbatim in that file under *Human approval of this decomposition*.

**Branch:** `u8g2gl-fonts/wo5-docs-rehearsal` (already created, base
`u8g2gl-fonts/wo4-png-convert`). **Working tree:**
`/Users/mcneillm/Documents/Projects/U8G2GL-04b`. Work only there.

## Role Definition

You are an expert senior software engineer and execution-focused worker agent.
You are NOT the Principal Architect. Do not make high-level architectural
decisions, do not create branches, and do not plan beyond this checklist.

**You commit on a green build and you never ask permission mid-flight.** Nobody
can answer you while you run; a question strands your work uncommitted. Where
this WORKORDER leaves a choice to you, make it and record it under *Decisions
Made*. If something genuinely blocks you, commit what is green, write the
Completion Report with status `partial` or `blocked`, and stop.

## Objective

Make the licensing position of everything this PR ships or commits explicit,
and prove the pipeline is ready for PR-05 by running **every** BDF in
departures-board-v3 through the built CLI and comparing the arrays with the
ones that project ships today.

## Strict Boundary Box

**In scope:**
- `LICENSE` (repo root) — one sentence, item 1.
- `THIRD-PARTY-NOTICES.md` — items 1–2.
- `cli/package.json` and, if you choose that route, `cli/LICENSE` or a
  `prepack` step — item 3.
- `cli/test/**` — a test for item 3 if you add a copied file; nothing else.
- This WORKORDER's Completion Report — item 4's results live here.

**Explicitly out of scope:**
- `docs/**` — the specifications and the implementation plan are the Chief
  Architect's. If you find something there that is now wrong, list it under
  *Out-of-Scope Findings* with the exact line and suggested wording.
- **`/Users/mcneillm/Documents/Projects/departures-board-v3` is read-only.**
  Copy what you need into `tmp/`; never write, build, commit or run its
  scripts inside that tree. It has uncommitted files belonging to someone
  else's work — do not touch or report on them.
- All source under `cli/src/`, the C++ runtime and tests, `extern/**`.

## Tooling Constraints

- From `cli/`: `npm test`, `npm run lint`, `npm run build` green before every
  commit (CLI baseline **1265**). No C++ change, so no CMake run is needed.
- Scratch in `tmp/` at the repo root — never `/tmp`.
- Load the **`u8g2gl-standards`** skill (documentation rules apply to
  notices too).

## Line-Item Instructions

- [ ] **1. The licence of a converted font.** `LICENSE` ends with the §22.1
  paragraph about fonts. Add one sentence making explicit that **converting a
  font with `<bdf>` does not change its licence** — the compiled array carries
  whatever terms the BDF did — and that U8G2's own fonts carry per-group terms
  (the fntgrp link is already there). Mirror the same statement in
  `THIRD-PARTY-NOTICES.md` in a short *Fonts and images* section, which also
  says the same for a `<convert>` PNG.

- [ ] **2. What this repository now carries.** Audit
  `git diff --stat main..HEAD` for third-party material the PR added, and
  give each a notices entry or a stated reason it needs none:
  - U8G2's public-domain `4x6.bdf`, copied into
    `cli/test/integration/fixtures/valid-project/fonts/` and
    `test/generated_fixture/assets/fonts/` (test fixtures; not in the npm
    package — confirm with `npm pack --dry-run`);
  - the hand-written `arrow_mini.bdf` and the generated fixture PNG (ours,
    MIT — confirm their headers or generating scripts say so);
  - the bdfconv Wasm and Emscripten glue rows WO1 added — re-read them against
    what now ships (WO2 changed the glue file's name and format) and fix any
    stale file name.

- [ ] **3. The npm package carries its licence.** Run `npm pack --dry-run` in
  `cli/`. npm includes a `LICENSE` only from the package directory, and
  `cli/` has none, so the MIT text and the font paragraph are probably
  missing from the published package. If so, fix it in the way that cannot
  drift — for example copying the root `LICENSE` in a `prepack` script, or a
  committed copy plus a test that it is byte-identical to the root file. State
  which and why. Confirm `LICENSES/` (WO1) is still listed.

- [ ] **4. Migration rehearsal — report only, nothing committed from it.**
  departures-board-v3 has **14** BDFs in `src/fonts/source/` and ships
  compiled arrays in `src/fonts/fonts.cpp`, produced by its
  `scripts/build_fonts.py` with `bdfconv -f 1 -m '0-65535' -n <name>`, from
  the same bdfconv source as our pinned submodule (PA-measured).
  - Copy the 14 BDFs into a scratch project under `tmp/`, declare each as a
    `<bdf>` with **no** `range`, and run the **built** CLI
    (`node cli/dist/node/cli.js generate`).
  - For every array in `fonts.cpp`, find the BDF it came from (read
    `build_fonts.py` to learn the name mapping; some arrays may come from
    non-BDF sources — say which) and compare **bytes** — parse both sides
    into byte arrays with a small script in `tmp/`, independent of
    `cli/src/core/fonts/bdfconv-output.ts`.
  - Report a table: font, our byte count, theirs, identical yes/no. For any
    mismatch, find the cause (post-processing in `build_fonts.py`, a
    different map, a stale committed `fonts.cpp`, …) with evidence, and say
    whether PR-05 needs to do anything about it. Do not "fix" either side.
  - Paste the budget the CLI printed for that project.

## Verification Requirement

Before each commit: `npm test`, `npm run lint`, `npm run build` all green from
`cli/`.

**Branch hygiene (rule 04):** run `git branch --show-current` **as its own
command** immediately before every commit and confirm it prints
`u8g2gl-fonts/wo5-docs-rehearsal`. Do not push. Commit style
`docs(notices): …`, `chore(cli): …`; end each message with a
`Co-Authored-By:` line naming the model you actually are, exactly as your
system context names it, with `<noreply@anthropic.com>`.

Commit on green without asking. When done, append the Completion Report and
commit it as `docs(workspace): WO5 Completion Report`.

## Issue Surfacing

A defect or concern *outside your boundary box* goes in the Completion Report
under *Out-of-Scope Findings*. Do not file issues and do not fix it.

---

## Completion Report (written by the worker at task completion)

```markdown
---
## Completion Report

### Status
complete | partial | blocked

### Changes Made
- `path` — what changed and why

### npm package contents
<!-- Before and after, for LICENSE and LICENSES/. -->

### Migration rehearsal
| Array in fonts.cpp | Source | Ours (B) | Theirs (B) | Identical |
|---|---|---|---|---|

- Causes of any mismatch, with evidence:
- What PR-05 needs to know:
- Budget output:

### Decisions Made
- Decision and rationale

### Out-of-Scope Findings
- Including any now-wrong lines in docs/, with suggested wording.

### Blockers
(none)
```
