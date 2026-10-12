---
work_order: WO2
project: pr-05r-runtime-fixes
title: "An XML file the project skips is named, never silent"
branch: u8g2gl-05r/wo2-screen-discovery
base: u8g2gl-05r/wo1-ambient-state (its first commit, the PR-05R workspace record)
complexity: standard
status: dispatched
---

# WO2 — a misnamed screen file produces a diagnostic, not "0 screens"

## Authorization

Part of PR-05R (`pr-05r-runtime-fixes`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition, and "Rulings" R5 states this WO's
severity. This WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-05r-wo2`.** **Branch**:
`u8g2gl-05r/wo2-screen-discovery` (already checked out, no upstream). Run
`git branch --show-current` **as its own command immediately before every commit**
(`.agents/rules/04-branch-hygiene.md`). Scratch files go in `tmp/` in this worktree
(`.agents/rules/02-workspace.md`), never in `/tmp`.

Another worker is running WO1 (C++ runtime) in `../U8G2GL-05r` at the same time. Do not touch that
directory or the C++ runtime.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. A decision this WORKORDER does not cover and that cannot be made inside
the Boundary Box: commit what is green, set `status: blocked`, write the Completion Report, stop.

## Standards

Load `u8g2gl-standards` first: `references/typescript.md`, `references/documentation.md`.
**§4.1**: on lines you add or change, cite published references (`§15.1`, `§19`) and measured
facts; no work-order tags, no workspace paths, no narrated debate. Pre-existing citations are not
yours to sweep.

---

## Objective

A project directory containing `.xml` files that produced no screen says so: `validate` and
`generate` each warn, naming every skipped file, why it was skipped, and the rename that would
make it count — in text and in `--json` output.

## Background (PA scoping at `9808423`)

- `readProjectFiles()` (`cli/src/node/read-project.ts:74`) keeps `screens/*.xml` only when the
  name starts with `screen_` (`:108`). Anything else is dropped without trace; `validate` and
  `generate` exit 0 and report "0 screens". design_spec §19 states the naming; nothing enforces
  or reports it.
- §1.2 makes diagnostics the product; §15.1 requires file, line and column with a suggestion.
- `readProjectFiles()` can only throw today; it has no warning channel. Diagnostics with
  `'warning'` severity already exist in the validator (see `validate-not-yet-supported.ts`,
  `validate-realisation.ts`) — reuse that diagnostic type and its formatting; do not invent a
  second one.

## The rule (owner ruling R5, PROJECT.md)

**Keep the `screen_*.xml` convention, and make skipping it impossible to miss.** Severity is a
**warning** (exit code unchanged), not an error, so a notes file kept in `screens/` does not block
a build.

What counts as skipped:
- a file in `screens/` ending `.xml` (case-insensitive) whose name does not match `screen_*.xml`
  exactly — including `Screen_home.xml`, `screen_home.XML`, `home.xml`;
- an `.xml` file at the project root other than `u8g2gl.xml` and `globals.xml`;
- a subdirectory of `screens/` (discovery is not recursive) — say so once per directory.

Each warning: the file's project-relative path as its location (line 1, column 1 — the file
itself is the subject), why it was skipped, and a suggestion with the concrete rename (e.g.
`rename to screens/screen_home.xml`; for a case variant, the lower-cased form). Order: by code
unit, as discovery already sorts (§13.9).

## Line-Item Instructions

- [ ] **Baseline first**, in `cli/`: `npm ci`, vitest (expect **1338**), `tsc`, lint. Record it.
- [ ] **Reproduce with the built CLI** before changing anything: a project with
      `screens/home.xml` → `validate` and `generate` exit 0 with no mention of it. Paste the output.
- [ ] `cli/src/node/read-project.ts` — collect skipped entries as warning diagnostics and return
      them on `ProjectFiles` (a new readonly field). Update the file and function docs.
- [ ] Every caller of `readProjectFiles()` (find them all; at least the `validate` and `generate`
      commands) merges these into its reported warnings, text and `--json`, so they count in the
      summary. When the project yields **zero** screens and something was skipped, the summary
      line must not read as a clean "0 screens" with no hint.
- [ ] Check `cli/src/browser/` and any designer entry that discovers screens by name: if it applies
      the same filter, give it the same warnings; if it does not discover files, note that in the
      Completion Report.
- [ ] Tests: unit tests on the reader (each skipped form above, a correctly named file not warned,
      root-level `u8g2gl.xml`/`globals.xml` not warned, ordering); integration tests through the
      built CLI for `validate` and `generate`, text and `--json`.
- [ ] Check that no existing fixture or example project now warns unexpectedly; if one does, fix
      the fixture only if it is plainly a misnamed screen, otherwise report it.
- [ ] `docs/design_spec.md` §19 (screen file naming): state that a non-matching `.xml` is reported
      as a warning, with the forms above. **Only §19** (and §15 if it lists warnings) — WO1 edits
      Appendix A and §11.3 of this file in parallel.

## Strict Boundary Box

- **In:** `cli/src/node/read-project.ts`, its callers in `cli/src/`, tests under `cli/test/`,
  design_spec §19 (and §15 only if it enumerates warnings).
- **Out:** the C++ runtime, `include/`, `test/` (C++), `library.json`; the generated config emitter
  and budget (WO3); `package.json` version and goldens (WO4); the version-pin test in
  `cli/test/integration/generate.test.ts` (under a separate owner ruling — leave it alone).
- This WO must not change any generated output. If a golden moves, stop and report.

## Verification Requirement

- [ ] CLI: vitest **1338 + your new tests**, `tsc`, lint clean. State the total.
- [ ] The reproduction re-run with the rebuilt CLI (`npm run build` first — the integration tests
      and any manual run read `dist/`), now warning; paste text and `--json` output.
- [ ] `git diff --name-only <base>..HEAD` within the Boundary Box.

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix them, do not file issues. Known and
handled elsewhere, do not re-report: ambient U8G2 state (WO1), the generated config's PlatformIO
advice and `library.json` frameworks (WO3), version bumps and the version-pin test (WO4).

---

## Completion Report (append below on completion)

Use: Status · Baseline and final counts · Changes Made · Decisions Made · Evidence (before/after
CLI output) · Dead Ends & Warnings · Out-of-Scope Findings · Blockers.
