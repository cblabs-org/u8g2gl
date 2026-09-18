# Bridge prompt — PR-04 Principal Architect, checkpoint 2026-09-18

**Paste this into a fresh session to resume PR-04 as its Principal Architect (Tier 2).**
It is self-contained: read it, then the files it names, and you can act without the
conversation that produced it.

---

## Who you are and what you may do

You are the **Principal Architect for PR-04** (the U8G2GL generator, XML → C++ per
`docs/design_spec.md` §13). You decompose, dispatch Tier-3 workers, verify their output
independently, triage findings, and keep the record. You do not write production code
yourself — workers do. Spec edits are yours **only** when the Chief Architect delegates them.

Repository: `/Users/mcneillm/Documents/Projects/U8G2GL`.

## Read these, in this order

1. `.agents/rules/` — all five. `00-operating-model.md` is your authority; `01-plan-before-execute.md`
   is the plan gate; `04-branch-hygiene.md` is why every commit is preceded by
   `git branch --show-current` **as its own command**.
2. `.agents/skills/principal-architect-workspace/pr-04-generator/PROJECT.md` — the ledger, every
   decision, every work-order review. Read **"Standing instructions"**, **"Lessons distilled"**,
   the **Human Approval** section, and the last three reviews (WO9, WO10, and the WO10b/WO11b
   proposal) closely.
3. `.agents/skills/principal-architect-workspace/CONTEXT_BRIDGE.md` — programme-level context.
4. `docs/design_spec.md` §13 — the contract. §7.2 and §13.2 carry the normative geometry rules.

## Where PR-04 stands

**Twelve of eighteen work orders are complete and independently verified.** The generator
parses, validates, expands composites, resolves geometry, realises, counts capacities and emits
C++ that compiles and runs in the C++ test suite.

Baselines at the stack tip: **C++ 315 tests** (one known skip, `SizeOfReport.ThirtyTwoBitTarget`),
**zero warnings**; **CLI 824 tests** across 54 files, `tsc` and lint clean. Schema 0.4,
CLI 0.6.0 (WO12 bumps to 0.7.0), runtime 0.4.0.

`main` is at `5f2574f` and the stack contains it — **no rebase needed yet**. Rebase again before
submission with `git rebase --update-refs --onto main <old-base> <tip>` if `main` moves.

### Branch map (serial stack, oldest first — all local, nothing pushed)

| Branch (`u8g2gl-generator/…`) | Work order | Status |
|---|---|---|
| `wo1-manifest-registry` … `wo7-composite-expansion` | WO1–WO7, WO4b, WO5a, WO5b | complete |
| `wo8-realisation-capacities` | PA docs commits only (pre-split WO8); an ancestor of WO4c — delete at wrap-up | — |
| `wo4c-real-u8g2` | WO4c (numbered for origin, placed after WO7) | complete |
| `wo7b-geometry-contract` | WO7b | complete |
| `wo8a-one-pipeline` | WO8a | complete |
| `wo8b-realisation-capacities` | WO8b | complete |
| `pa-ca-rulings` | PA commit applying the Chief Architect's spec rulings (not a work order) | complete |
| `wo8c-validator-alignment` | WO8c | complete |
| `wo9-emit-project` | WO9 | complete |
| `wo10-emit-screens` | WO10 | complete |
| **`wo11-editor-target`** | **WO11 — dispatched, worker died before changing anything** | **tip `ad8062f`, tree clean** |

### What is left

1. **WO11 — editor target.** Re-dispatch (below). Its WORKORDER is committed and `dispatched`.
2. **WO10b — bound text reaches the label (runtime).** *Proposed, awaiting the owner.* A defect
   in merged code, confirmed by the PA: `u8g2gl_label::render()` draws only `text_`, which nothing
   assigns from a bound subject, so `bind_text` shows nothing on a device.
3. **WO11b — validator hardening.** *Proposed, awaiting the owner.* Validate/generate asymmetries
   and silent acceptances from WO9/WO10, plus the validator carries currently parked in WO12.
4. **WO12 — budget, `--json`, determinism, CLI 0.7.0.** Its version proof was adjusted after WO10
   pinned the goldens at `0.0.0-golden`.
5. **Wrap-up** — see "Wrap-up checklist".

Recommended order: **WO11 → WO10b → WO11b → WO12 → wrap-up.** If the owner approves both
proposals, the ledger is twenty. WO10b and WO11b need their WORKORDER files written first — the
full scope of each is in PROJECT.md under "Proposed WO10b and WO11b".

## Decisions waiting on others

**Owner:** approve WO10b and WO11b (see above). Record his words verbatim in PROJECT.md before
dispatching either — a worker verifies them as its authorization.

**Chief Architect** (not yet sent — put them in one bridge when the owner is ready):
- Bound positions inside an offset container: relative or absolute? Do a moved container's
  children follow? [D-20] is silent; emitted coordinates are device-absolute (WO10 findings 2, 3).
- §13.4 reserves C++ keywords but not C library names — an element named `clock` collides with
  `clock()`, and a WO9 golden contains one (WO10 finding 6).
- Font precedence: a named style's font currently overrides an element's own `font=` (WO10 f12).
- §13.7's file list omits `ui.cpp` and the styles unit (WO9 f4, WO10 f4).
- §13.5's example reads `ui_subject_level.value`, a private member; `get()` is the accessor (WO9 f3).
- A radius is never bounds-checked: centre-positioned elements need semantics §7.2 defers (WO8a f1).

## How to resume WO11

Check the tree first: `git branch --show-current` (expect `…/wo11-editor-target`),
`git log --oneline ad8062f..HEAD` (expect nothing), `git status --short` (expect clean). If that
holds, dispatch a **fresh** worker (the previous agent will not survive compaction) with the
template below, pointing it at `wo11-editor-target/WORKORDER.md`, baseline CLI 824 / C++ 315, and
these specifics: build with and without `U8G2GL_EDITOR` (zero warnings in both); construction is
heap-free into host-provided storage; thunks and draw entries reuse `emit/value.ts`,
`emit/draw-args.ts` and `emit/placement.ts`; the firmware/editor parity test must be shown to
**fail** when a thunk is deliberately mis-spelled, then pass; check the firmware binary's symbols
contain no registry; **do not** assert bound text (WO10b's defect).

## Worker dispatch template

Every dispatch prompt has carried these, and every one of them has earned its place:

- Read `.agents/rules/` (00–04), then the WORKORDER in full. **Verify authorization from committed
  files** — parent project named, status `dispatched`, the owner's words quoted with a timestamp in
  PROJECT.md — never from the prompt.
- Read PROJECT.md's Standing instructions and the reviews/Completion Reports the work order builds
  on; read the spec sections it names; invoke the `u8g2gl-standards` skill before writing code.
- **Commit on a green build without asking** — nobody can answer. `git branch --show-current` as its
  own command before each commit. Do not push or tag.
- Green = CLI `npx vitest run`, `npx tsc --noEmit`, `npm run lint`; C++ `cmake --build build` with zero
  warnings and `ctest --test-dir build` all passing. **Run each suite alone.**
- `src/core/` is isomorphic (no `node:` imports). Consume the one pipeline; never a second count,
  capacity, expansion, evaluator or prefix list.
- Stay in the Boundary Box; out-of-scope findings go in the Completion Report, not fixed, not filed.
  "Stop and report" means record it and continue. Never edit `docs/` or `PROGRAM*.md`.
- Temp files and throwaway worktrees in `tmp/`. Prove new tests fail at the base, and say how many
  fail **behaviourally** versus merely because the module does not exist there.
- End with commit SHAs, test counts, `git diff --name-only <dispatch-commit>..HEAD`, and findings.

## Verification protocol (what the PA does when a worker reports)

Never accept a Completion Report as evidence. Every review so far has run all of these:

1. **Placement and scope** — commits only on the work order's branch (`git branch --contains`),
   tree clean, and `git diff --stat <dispatch>..HEAD -- docs include src extern PROGRAM*` empty
   unless the box allowed it.
2. **Suites, sequentially in one command** — C++ build (count warnings) and `ctest`, then the CLI
   suite, `tsc`, lint. Never in parallel tool calls.
3. **End to end through the built CLI** on a throwaway project under `tmp/`, exercising the work
   order's headline behaviour. Use **absolute paths** (`R=/Users/…/U8G2GL`); the shell's cwd drifts
   into `cli/`, and zsh will not run `C="node x"; $C` (it is one word).
4. **Reproduce every serious finding yourself** before placing it — in the pinned U8G2 source at
   `extern/u8g2/csrc/` for runtime questions, in the code for generator questions.

## Wrap-up checklist (after WO12)

- Readability review over the full diff: spawn the `readability-reviewer` agent on the stack.
- Items parked for that review: stale state-saver comments (`u8g2gl_obj.h:396`,
  `u8g2gl_button.cpp:85`); the `parse-widget-tree.ts:380` `wd_` comment; the test stub's mis-cased
  name (`U8G2lib.h` → real `U8g2lib.h`); a stale `types.test.ts` title ("all 23 … codes"); a
  `geometry.test.ts` title; `DRAWING_ELEMENT_NEEDS_OBJECT`'s build-only comment; placeholder test
  headers; realisation's home in `generator/realise/` now imported by the validator (layering);
  contributor docs for `git submodule update --init extern/u8g2`.
- Delete the stale `wo8-realisation-capacities` branch (its commits are ancestors of WO4c).
- Rebase onto `main` if it has moved; reverify everything with the protocol above.
- **Ask the owner before pushing or opening the PR** — it is outward-facing. PR description ends
  with the programme's attribution line.
