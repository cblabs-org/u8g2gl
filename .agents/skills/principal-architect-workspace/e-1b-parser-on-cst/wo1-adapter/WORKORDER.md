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

- [x] **First commit — freeze (PA ruling 2).** A script in `cli/test/cst/` (or `tmp/`, with only
      the JSON committed) that runs today's `tokenizeXml` and writes:
      (a) diagnostics for E-1a's whole parity corpus, and (b) the raw tree for every tracked
      `.xml` file. Commit the goldens. Repoint E-1a's parity test at golden (a).
- [x] The CST → raw adapter in `cli/src/core/parser/`. `tokenizeXml(xml, filename)` keeps its
      signature and returns the same `RawXmlDocument` shape, with ranges added (ruling 6).
      Existing `loc` fields derived from ranges. Text content and comment collection must match
      the old rules exactly (golden (b) is the check).
- [x] Switch every importer of `./xml-tokeniser.js` to the adapter; re-export
      `decodeXmlEntities` from the CST's implementation. Delete `xml-tokeniser.ts`.
- [x] Tests asserting the three intentional differences (ruling 3): with golden (a) showing the
      old diagnostic and the new parse succeeding.
- [x] **b1** — the full suite passes unchanged (1815). List any test you had to change, and why.
- [x] **b2** — no golden under `cli/test/generator/fixtures/**/expected` changes: run
      `git status` after the suite and confirm; also run the determinism check script CI uses
      (`.github/workflows/ci.yml`, job `determinism-check`) locally if it can run, or explain.
- [x] **b4** — `git grep -n "tokeniser\|tokenize" -- cli/src` shows only the adapter's own name;
      nothing else in `cli/src` scans XML. Paste the output.
- [x] **b5** — run `.agents/skills/principal-architect-workspace/e-d-editor-design/evidence/wo1/bench-edit-loop.mjs`
      (read it first for how to run it on the probe and stress100 projects; build the CLI with
      `npm run build` if it imports `dist/`). Parse and check medians must be at most 1.2× WO1's
      (`bench-probe.txt`, `bench-stress100.txt` beside it). Paste before/after.
- [x] Lint and tsc clean. Completion report below.

# Completion report

**Commits** (branch `u8g2gl-e1b/wo1-adapter`, not pushed):
- `9a77dda` test(cst): freeze the tokeniser's diagnostics and trees into goldens
- `630c0fe` refactor(parser): build the raw XML tree from the CST; delete the tokeniser
- this report

**Freeze.** The script ran from `tmp/freeze-tokeniser.ts` (not committed; it imports the deleted
file). Goldens in `cli/test/cst/`: `tokeniser-diagnostics.json` (code, line, column, message for
105 repository files, 5 existing inline cases, 29 recovery-branch cases, and the 3 intentional
differences) and `tokeniser-trees.json` (raw trees for the 105 files and the 34 inline cases).
Each repository entry carries the SHA-256 of its text, so an edited file fails as a stale entry,
not as a parser regression. Reader and tree serialiser: `cli/test/cst/tokeniser-golden.ts`.
`diagnostics-parity.test.ts` now reads the golden.

**Adapter.** `cli/src/core/parser/cst-adapter.ts`: `tokenizeXml` = `parseCst` + one walk.
`decodeXmlEntities` is `decodeEntities` re-exported (same function object). Ranges: new
`OffsetRange` in `schema/source-location.ts`; `RawXmlAttribute.nameRange/valueRange`,
`RawXmlElement.range`; `loc`/`nameLoc`/`endLoc` derived via the CST's `LineIndex`. To match the
old tree exactly the walk folds CR/CRLF to LF *before* entity decoding (the CST keeps raw text).
`raw-adapter.test.ts` checks every tree and every diagnostic *including message* against the
goldens, the three differences, and the ranges against the text on all 105 files.

**Intentional differences (ruling 3).** Tested in `raw-adapter.test.ts`, each against its
recorded old result: leading BOM (old: 2 diagnostics; now clean, BOM takes no column); CDATA in
content (old: missing tag name at 1:11; now clean, CDATA joins `textContent` undecoded — a choice
the adapter had to make, documented in its header); `&#99999999;` (old: threw `RangeError`; now
left as written).

**b1.** Before 1815 passed. After **2205 passed, 0 failed** (99 files). New: 388 in
`raw-adapter.test.ts`, +1 parity coverage check, +1 entity identity check. Existing tests changed:
- `test/cst/diagnostics-parity.test.ts` — compared CST against `tokenizeXml`; now against the
  golden (ruling 2). Same cases, from the golden.
- `test/cst/entities.test.ts` — compared the two decoder copies and asserted the old one throws
  out of range. One copy remains, so it now asserts the public name *is* the CST function and
  checks the same inputs against literal expected values; the throw assertion is gone (ruling 3).
- `test/parser/xml-tokeniser.test.ts` — import path only (`parser/xml-tokeniser.js` →
  `parser/index.js`); assertions untouched.

**b2.** `git status` after the suite: clean; nothing under `cli/test/generator/fixtures/**/expected`
changed. The CI `determinism-check` script, extracted from `ci.yml` and run locally against merge
base `019b103`: "No fixture goldens changed. Determinism check passed trivially." exit 0. No
version bump.

**b4.** `git grep -n "tokeniser\|tokenize" -- cli/src`:
```
cli/src/core/catalogue/query.ts:10: *              tokenized search with fuzzy edit-distance fallback, constraint-based
cli/src/core/catalogue/query.ts:140:function tokenizeQuery(query: string): string[] {
cli/src/core/catalogue/query.ts:181:  // --- Step 1: Collect known controllers and tokenize query ---
cli/src/core/catalogue/query.ts:183:  const rawTokens = tokenizeQuery(query);
cli/src/core/cst/parse-cst.ts:17: *              is recorded in cli/test/cst/tokeniser-diagnostics.json and the
cli/src/core/parser/cst-adapter.ts:32: * - tokenizeXml():        Parse XML text into a RawXmlDocument; never throws
cli/src/core/parser/cst-adapter.ts:149:export function tokenizeXml(xml: string, filename: string): RawXmlDocument {
cli/src/core/parser/index.ts:23: * - tokenizeXml: Read XML text into the raw element tree (built from the CST)
cli/src/core/parser/index.ts:48:export { tokenizeXml, decodeXmlEntities } from './cst-adapter.js';
cli/src/core/parser/name-policy.ts:93: *                    `tokenizeXml`.
cli/src/core/parser/name-policy.ts:103:  // `tokenizeXml` records `loc` at the '<' itself. XML forbids whitespace
cli/src/core/parser/name-policy.ts:124: * `tokenizeXml` produces would place edits in the wrong place on CRLF files only,
cli/src/core/parser/parse-globals.ts:42:import { tokenizeXml } from './cst-adapter.js';
cli/src/core/parser/parse-globals.ts:379:  const rawDoc = tokenizeXml(xml, filename);
cli/src/core/parser/parse-project.ts:33:import { tokenizeXml } from './cst-adapter.js';
cli/src/core/parser/parse-project.ts:199:  const rawDoc = tokenizeXml(xml, filename);
cli/src/core/parser/parse-screen.ts:30:import { tokenizeXml } from './cst-adapter.js';
cli/src/core/parser/parse-screen.ts:156:  const rawDoc = tokenizeXml(xml, filename);
cli/src/core/parser/parse-widget-manifest.ts:52:import { tokenizeXml } from './cst-adapter.js';
cli/src/core/parser/parse-widget-manifest.ts:306:  const rawDoc = tokenizeXml(xml, filename);
```
plus `cli/src/core/resolver/expression.ts:14` ("A tokeniser and recursive-descent parser for").
Besides the adapter's own name: `catalogue/query.ts` tokenises display-search text and
`resolver/expression.ts` tokenises expressions — neither reads XML. `parse-cst.ts:17` names the
golden file. **Not clean, outside this WO's box:** `node/fix-names.ts:56` and
`node/load-project.ts:205` sniff the root tag with `/<([a-zA-Z0-9_]+)/`. Not a scanner, but it
reads XML outside `core/cst/`; `node/` is out of bounds here, so left for the PA.

**b5.** Emscripten is not installed here, so the Wasm stages cannot run. Parse and check do not
touch Wasm, so `tmp/bench-no-wasm.mjs` is the WO1 script with only the Wasm stages
(apply/render/blit) removed. Projects built per LOOP-BUDGET §7 into `tmp/bench/`. Run on the same
machine against this branch and against E-1a's tip `4f2c050` (exported with `git archive`, built
in `tmp/base/`), node v26.8.1, 200 iterations after 30 warm-up, two runs each. Medians, ms:

| | WO1 | base `4f2c050` (runs 1/2) | E-1b (runs 1/2) | E-1b / WO1 |
|---|---|---|---|---|
| probe parse | 0.023 | 0.022 / 0.023 | 0.023 / 0.023 | 1.00× |
| probe check | 0.118 | 0.114 / 0.112 | 0.114 / 0.114 | 0.97× |
| stress100 parse | 0.169 | 0.162 / 0.160 | 0.152 / 0.151 | 0.90× |
| stress100 check | 0.396 | 0.390 / 0.389 | 0.412 / 0.403 | 1.04× max |

All within 1.2×.

**Lint and tsc.** `npm run lint` (eslint + `tsc -p tsconfig.test.json`) clean; `npm run build` clean.

**Boundary notes.**
- `cli/src/core/cst/{parse-cst,entities,line-index,cst-types}.ts`: **comment-only** edits. They
  named `xml-tokeniser.ts` as a live reference ("mirrors xml-tokeniser.ts's XmlScanner", "a
  deliberate copy of decodeXmlEntities from parser/xml-tokeniser.ts", "the parser does not consume
  this yet"), which became false when the file was deleted. They now describe the recorded
  behaviour. No code changed in `cst/`.
- `parser/name-policy.ts`: comment-only, same reason.

**Observations for the PA (not acted on).**
- `name-policy.ts`'s `buildLineStartOffsets` has no BOM rule, while `LineIndex` gives the BOM no
  column. A name insertion on line 1 of a BOM file would land one code unit early. Unreachable
  before (BOM files did not parse), now reachable only for a nameless widget on line 1.
- The parity corpus is the files recorded on 2026-10-27; an `.xml` file added later is not
  compared, and editing a recorded file fails its hash check until the entry is removed.
