---
name: pr-04b-font-image-pipeline-wo6
description: Handoff instructions for Work Order 6 — readability remediation and three small fixes
complexity: standard
---

# WO6 — readability remediation, and three small fixes

**Parent project:** PR-04b, the font and image pipeline —
[PROJECT.md](../PROJECT.md). The owner's approval of this decomposition is
recorded verbatim in that file under *Human approval of this decomposition*.

**Branch:** `u8g2gl-fonts/wo6-readability` (already created, base
`u8g2gl-fonts/wo5-docs-rehearsal`). **Working tree:**
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

Apply the readability reviewer's findings to the PR-04b stack, under the PA's
rulings below, and make three small behaviour fixes the review and WO5
surfaced. **Generated output must not change** except where item B2 says so.

## The review

[REVIEW.md](REVIEW.md), beside this file — the `readability-reviewer` agent's
report over `main..u8g2gl-fonts/wo4-png-convert`: P1 0 · P2 6 · P3 14 · P4 5,
with file:line and a fix for each. Work through **every P2 and P3 item**, and
the P4 items where the fix is a line or two. Line numbers are against
`wo4-png-convert`; WO5 added only notices, `cli/LICENSE`, `package.json` and
one packaging test, so they still hold for source.

## PA rulings on the review's open questions

1. **Work-order history in comments.** The reviewer ranked these on
   `documentation.md`'s "a reader who never saw the codebase" test. Apply that,
   **to lines this PR added only** — do not touch the hundreds of older ones:
   - **Rewrite (noise):** bare tags such as `(WO3 item 5)` or
     `PR-04b WO3b item 1`; pointers to `PROJECT.md`, "Finding N", "the
     WORKORDER" or "the Completion Report" — a source reader cannot reach
     them; narrated debate ("the PA rejected…", "WO2's WORKORDER was wrong",
     "replaces WO1's runner.ts"); and "now"/"since" relative to a history the
     reader never saw.
   - **Keep:** `§n` and `[D-n]` references, upstream source pointers such as
     `bdf_map.c:174`, and every **measured fact** — but state the fact itself,
     not which work order found it. For example, "bdfconv exits 0 with
     `Glyphs: 0/0` on a malformed BDF, so failure is detected from the output"
     is the comment; "(WO1 measured)" is not needed.
   - **Never edit a string that is emitted into generated C++** — that changes
     output for unchanged input (rules/03). The `no-ticket-numbers` test
     already guards those.
2. **`-f 1` and `-b 0`.** Read bdfconv's `main.c` help text and option
   handling and state in `compile-bdf.ts` what each flag selects and why this
   one. Do not guess; quote the source's meaning.
3. **Where the standards are silent** (the reviewer's *Observations*), do not
   invent a rule; the PA will raise it with the Chief Architect.

## Three behaviour fixes — each its own commit, each with a test

- [ ] **B1. Symlinks cannot escape the project.** `isInsideProject`
  (`cli/src/node/load-project.ts:276`) compares `resolve()`d paths, so a
  symlink inside the project pointing outside it passes, and the generator
  reads a file the confinement is meant to forbid ([D-11] / §13.10 applied to
  reads). Compare `realpath`s of both the project root and the target (the
  root may itself be reached through a symlink, e.g. macOS `/tmp` →
  `/private/tmp` — a test must cover that it still works). A target that does
  not exist keeps today's missing-file behaviour. Tests: a symlinked asset
  escaping the project is treated as outside and reported as today's
  outside-the-project case; a symlink *within* the project still works.
- [ ] **B2. The `ofl` licence prefix is too loose.** `GENERIC_LICENCE_PREFIXES`
  (`load-project.ts:327`) matches `oflow.txt`. The intent is the SIL Open Font
  Licence's usual file names: accept `ofl` only when followed by end of name,
  `.`, `-` or `_` (`OFL.txt`, `OFL-1.1.txt`, `ofl_license`). Apply the same
  word-boundary rule to the other prefixes if it does not reject a real
  licence file name you can name (`LICENSE.md`, `LICENCE-OFL`,
  `COPYING.LESSER`) — say which you did. This can change a provenance comment
  only for a project with such a file, which is a bug fix; note it in the
  commit message.
- [ ] **B3. `npm run build` starts from an empty `dist/`.** WO5 found that
  `tsc` never cleans `dist/`, so a local `npm pack` shipped a stale
  `bdfconv-glue.json`. Make the build remove `dist/` first, portably (a small
  Node one-liner or script, not `rm -rf`, since contributors may be on
  Windows); no new dependency. Test or verify: after build, `dist/` contains
  no file without a source counterpart — at minimum, report an
  `npm pack --dry-run` listing with no stale file.

## Strict Boundary Box

**In scope:** comments and documentation in every file the review names;
`cli/src/node/load-project.ts` and `cli/package.json` for B1–B3; tests for
B1–B3 under `cli/test/`; `test/CMakeLists.txt` and `test/stubs/U8g2lib.h`
**comments only**; this WORKORDER's Completion Report.

**Out of scope:** any behaviour change beyond B1–B3; any emitted string;
`docs/**`; `.agents/**` except this file; `cli/src/data/**`; `extern/**`;
older code the PR did not add (even if it has the same habit); the schema;
the version (stays 0.9.0).

## Tooling Constraints

- From `cli/`: `npm test`, `npm run lint`, `npm run build`. CLI baseline **1268**.
- Comment-only changes to `test/CMakeLists.txt` or the stub still need the C++
  suite run once at the end (baseline **383**, one known skip, zero warnings),
  sequentially after the CLI suite.
- Generated output must be unchanged except B2: run the existing golden,
  determinism and compile-fixture tests and confirm the committed fixture
  regenerates byte-identically.
- Scratch in `tmp/` at the repo root. Load **`u8g2gl-standards`** first.

## Verification Requirement

Before each commit: `npm test`, `npm run lint`, `npm run build` green. At the
end, both suites, sequentially; report counts.

**Branch hygiene (rule 04):** run `git branch --show-current` **as its own
command** immediately before every commit and confirm it prints
`u8g2gl-fonts/wo6-readability`. Do not push. Suggested commits: one for B1,
one for B2, one for B3, then the readability pass (split by area if large),
`docs(cli): …` / `fix(cli): …` / `chore(cli): …`. End each message with a
`Co-Authored-By:` line naming the model you actually are, exactly as your
system context names it, with `<noreply@anthropic.com>`.

Commit on green without asking. When done, append the Completion Report and
commit it as `docs(workspace): WO6 Completion Report`.

## Issue Surfacing

Anything outside the boundary box goes under *Out-of-Scope Findings*. Do not
file issues and do not fix it.

---

## Completion Report (written by the worker at task completion)

```markdown
---
## Completion Report

### Status
complete | partial | blocked

### Review items
| Item | Done / skipped | Note |
|---|---|---|

### B1–B3
- B1:
- B2 (which prefixes got the boundary rule):
- B3 (npm pack listing, stale files):

### Generated output
- Fixture regenerates byte-identically? Any B2 effect?

### Suite counts
- CLI / C++ / warnings:

### Decisions Made

### Out-of-Scope Findings

### Blockers
(none)
```
