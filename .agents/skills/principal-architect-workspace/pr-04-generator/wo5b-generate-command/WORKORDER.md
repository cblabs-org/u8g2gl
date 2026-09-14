---
work_order: WO5b
project: pr-04-generator
title: "`generate` command, shared load path, not-yet-supported policy"
branch: u8g2gl-generator/wo5b-generate-command
base: u8g2gl-generator/wo5a-validator-carries
complexity: standard
status: draft — PA revises against WO5a's Completion Report before dispatch
---

# WO5b — `generate` command and shared load path

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval of PR-04 in
`../PROJECT.md` under "Human Approval" (owner's own words, timestamped), that
`../PROJECT.md` records **the WO5 split as approved at the owner checkpoint**
("Checkpoint rulings"), and that this WORKORDER's `status` is `dispatched`. Otherwise
**stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo5b-generate-command`
**Base**: `u8g2gl-generator/wo5a-validator-carries`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. `src/core/` stays isomorphic.

## Design authority

design_spec §13.9, §13.10, §15.3, §16 **on `main` @ `ef73776`**; ui_spec §16.1.
PROJECT.md decisions 1 and 3. Where this work order and the spec disagree, **stop and
report**.

---

## Objective

A `generate` command that runs exactly the validation `validate` runs, refuses on any
error, and writes a deterministic file set confined to the output directory. It emits
only stamped headers here; content arrives in WO9–WO10.

## Line-Item Instructions

- [ ] **Extract `loadProject()`** from `handleValidateCommand` (`cli.ts`) into
      `src/node/`. `validate` and `generate` both call it. The `'error'` missing-name
      policy is inherited — **do not add auto-naming** to `generate`; `--fix-names`
      stays on `validate`.
- [ ] **Not-yet-supported policy.** A validator parameter, shaped like the name policy
      (a parameter, not a branch): `'warning'` for `validate`, `'error'` for
      `generate`. It reports `U8G2GL_NOT_YET_SUPPORTED` for, each with a message naming
      the PR that delivers it:
  - `<focus_ring>`, `<event_cb>`, `<screen_load_event>`, `<screen_back_event>` → PR-09
  - collection `<element>` children (§9), and a composite that also has a C++ class
    (`view` + `extends`) → PR-08
  - `<bdf>` fonts and `<convert>` images → **PR-04b**; the message must be specific
    enough that PR-04b can replace it
- [ ] **`generate [path] --target <name> --out <dir> --check --json`.** `--target`
      defaults to the first `<target>`; `--out` defaults to the project's
      `<output dir>` or `generated/`.
- [ ] **Core API:** `generate()` in `src/core/generator/` returns an in-memory, ordered
      set of `{ path, content }` plus diagnostics. No I/O in core.
- [ ] **Node writer:** writes only under the output directory (§13.10). Deletes a stale
      file only if it carries the GENERATED header. Refuses to write anything if
      validation has any error.
- [ ] **`--check`:** writes nothing; exits non-zero and lists files that would change
      (§16's CI check).
- [ ] **Header stamp** on every generated file: source path, schema version, generator
      version, target. **No timestamp** (§13.9).
- [ ] **F9 (from WO1):** diagnostics located in a bundled framework manifest print with
      no source line, because the file map holds only project files. `loadProject()`
      builds the map; include the bundled manifest text.
- [ ] `--json` contract documented in `printUsage` and TSDoc:
      `{ files, diagnostics, errors, warnings }` (budget arrives in WO12).

## Strict Boundary Box

**In scope:** `cli/src/node/cli.ts`, new `cli/src/node/load-project.ts` and writer
module, new `cli/src/core/generator/`, `cli/src/core/validator/` (policy parameter and
the not-yet-supported checks only), `schema/diagnostic.ts`, tests, this WORKORDER.

**Do NOT touch:** runtime; manifests; the WO5a carries; resolution or emitted content
(WO6+).

---

## Testing Requirement

- [ ] Same project: `validate` warns, `generate` errors, same code and location.
- [ ] `generate` on a project with a missing name fails with the same diagnostic as
      `validate`.
- [ ] Writer never escapes `--out` (path traversal test); never deletes an unstamped
      file.
- [ ] `--check` on an up-to-date directory exits 0; after a hand edit, non-zero.
- [ ] Two runs produce byte-identical output.
- [ ] A diagnostic inside a bundled framework manifest prints its source line.

## Verification Requirement

- [ ] CLI tests, `tsc`, lint clean; C++ suite unchanged and green
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
