---
name: e-1b-wo1
description: Work Order 1 of E-1b — the parser on the CST, the tokeniser frozen and deleted
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches beyond what these WOs name, do not push, do
not start other work. Execute this checklist, then WO2 (`../wo2-q17/WORKORDER.md`).

**Parent project:** `e-1b-parser-on-cst` ([PROJECT.md](../PROJECT.md)). Read it and its PA rulings
first, and the provenance it cites (rule 00). The specification is
`.agents/skills/principal-architect-workspace/e-d-editor-design/E1-DECOMPOSITION.md` §1 E-1b. E-1a's
`e-1a-cst/PROJECT.md` and its WORKORDERs describe the CST you build on.

# Where you work

- Worktree `/Users/mcneillm/Documents/Projects/U8G2GL-e1b`, branch `u8g2gl-e1b/wo1-adapter`
  (created). `extern/u8g2` is checked out: the baseline is **1815 passing, 0 failing**.
- `git branch --show-current` before every commit (rule 04). Commit as you go; **do not push**.
  Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Scratch in `tmp/`.
- Load `u8g2gl-standards` before writing code. No workspace pointers in source comments (no
  AC tags, no PR names, no "PA ruling N"): keep the fact, drop the pointer.

# Strict boundary box

- `cli/src/core/parser/**` (including deleting `xml-tokeniser.ts`), `cli/src/core/schema/source-location.ts`,
  `cli/src/core/index.ts` (only to keep the same exported names), `cli/src/core/cst/**` only if the
  adapter needs a small helper exported, and tests under `cli/test/`.
- Nothing in the generator, validator, resolver or `node/`. No dependency changes.

# Checklist

- [ ] **First commit — freeze (PA ruling 2).** A script in `cli/test/cst/` (or `tmp/`, with only
      the JSON committed) that runs today's `tokenizeXml` and writes:
      (a) diagnostics for E-1a's whole parity corpus, and (b) the raw tree for every tracked
      `.xml` file. Commit the goldens. Repoint E-1a's parity test at golden (a).
- [ ] The CST → raw adapter in `cli/src/core/parser/`. `tokenizeXml(xml, filename)` keeps its
      signature and returns the same `RawXmlDocument` shape, with ranges added (ruling 6).
      Existing `loc` fields derived from ranges. Text content and comment collection must match
      the old rules exactly (golden (b) is the check).
- [ ] Switch every importer of `./xml-tokeniser.js` to the adapter; re-export
      `decodeXmlEntities` from the CST's implementation. Delete `xml-tokeniser.ts`.
- [ ] Tests asserting the three intentional differences (ruling 3): with golden (a) showing the
      old diagnostic and the new parse succeeding.
- [ ] **b1** — the full suite passes unchanged (1815). List any test you had to change, and why.
- [ ] **b2** — no golden under `cli/test/generator/fixtures/**/expected` changes: run
      `git status` after the suite and confirm; also run the determinism check script CI uses
      (`.github/workflows/ci.yml`, job `determinism-check`) locally if it can run, or explain.
- [ ] **b4** — `git grep -n "tokeniser\|tokenize" -- cli/src` shows only the adapter's own name;
      nothing else in `cli/src` scans XML. Paste the output.
- [ ] **b5** — run `.agents/skills/principal-architect-workspace/e-d-editor-design/evidence/wo1/bench-edit-loop.mjs`
      (read it first for how to run it on the probe and stress100 projects; build the CLI with
      `npm run build` if it imports `dist/`). Parse and check medians must be at most 1.2× WO1's
      (`bench-probe.txt`, `bench-stress100.txt` beside it). Paste before/after.
- [ ] Lint and tsc clean. Completion report below.

# Completion report

*(Worker fills this in.)*
