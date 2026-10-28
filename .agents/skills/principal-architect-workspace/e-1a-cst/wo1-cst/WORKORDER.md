---
name: e-1a-wo1
description: Work Order 1 of E-1a — CST parse and print, diagnostics parity, isomorphism test, bench
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect:
do not change the design, do not create branches, do not push, do not start other work. Execute
the checklist, then WO2 when this is done (its WORKORDER.md is beside this one's folder).

**Parent project:** `e-1a-cst` ([PROJECT.md](../PROJECT.md)). Its owner-approval provenance is in
that file and in `../e-d-editor-design/PROJECT.md`. Read both before starting (rule 00).

# Where you work

- Worktree: `../U8G2GL-e1a`, branch `u8g2gl-e1a/wo1-cst`
  (already created). Run `git branch --show-current` before every commit (rule 04).
- Commit on this branch as you complete coherent steps. **Do not push.** Commit messages end
  with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Scratch files go in `tmp/` of the worktree (git-ignored), never the repo root.
- Load the `u8g2gl-standards` skill before writing code (the TypeScript sections). File
  headers with SPDX, doc comments on every export, why-comments.

# Strict boundary box

- Create `cli/src/core/cst/**` and `cli/test/cst/**`.
- Create **one** file `cli/test/architecture/core-isomorphic.test.ts`.
- Edit nothing else. Not `cli/src/core/index.ts`, not the parser, not `package.json`.
- No new dependency of any kind.

# What to build

Read [E1-DECOMPOSITION.md §1 E-1a](../../e-d-editor-design/E1-DECOMPOSITION.md) first; it is the
specification. In this WO:

- `parseCst(text: string, file: string)` returning a CST plus diagnostics. Node kinds: document,
  XML declaration, processing instruction, element, attribute, text, comment, CDATA, whitespace
  trivia. Element nodes carry name, attributes, children, and self-closing form. Attribute
  nodes carry a name range, a value range (inside the quotes), the quote character, the **raw**
  value text and the decoded value (reuse `decodeXmlEntities`' rules; do not import the
  tokeniser module from `cst/` if that creates a dependency you then cannot delete in E-1b —
  copy the decoding into `cst/` instead and note it). Every node carries `[start, end)` offsets
  into the original text; provide a line/column lookup derived from offsets (handle CRLF, a BOM,
  and tabs counting as one column, matching the tokeniser's convention — check it).
- `printCst(cst)` reproducing the input exactly.
- Well-formedness diagnostics with the **same codes** as `cli/src/core/parser/xml-tokeniser.ts`.

# Checklist

- [x] Record baselines first: `cd cli && npm ci && npm test` (expect 1353 passing) and
      `npx tsc -p tsconfig.test.json --noEmit` / `npm run lint` clean. Paste the counts below.
- [x] **a1** — a test that globs `git ls-files '*.xml'` from the repo root at test time and
      asserts `printCst(parseCst(t)) === t` for each (about 105 files).
- [x] **a2** — named synthetic cases, one per item: CRLF; mixed line endings; a BOM; tabs;
      single and double quotes; `&amp;` and `&#x…;` in values; comments before the root,
      between attribute lines and inside text; CDATA; with and without an XML declaration;
      with and without a trailing newline.
- [x] **a5** — for every attribute in a1's corpus, `text.slice(value.start, value.end)` equals
      its raw value, and the name range slices to its name.
- [x] **a6** — a parity test running `tokenizeXml` and `parseCst` on every malformed fixture
      under `cli/test/` (find them; at least `cli/test/parser/fixtures/malformed.xml` and the
      cases in `malformed.test.ts`/`xml-tokeniser.test.ts`) asserting the same code, line and
      column. Report any case where you think the tokeniser is wrong (PA ruling 4).
- [x] **a7** — `core-isomorphic.test.ts`: walk every `.ts` file under `cli/src/core/` and fail
      on any `node:` import or require, or a bare Node builtin specifier (`fs`, `path`, ...).
      It must pass on today's code. Demonstrate it fails by temporarily adding an import, then
      remove it (say so in the report; do not commit the failing state).
- [x] **a8** — a benchmark test that parses stress100's screen (generate it with
      `.agents/skills/principal-architect-workspace/e-d-editor-design/evidence/wo1/make-stress.py` into `tmp/`, or construct an equivalent
      100-element screen in the test) and **reports** the median of 50 runs. It must not fail on
      time. Paste the number.
- [x] Full CLI suite, lint and tsc clean. Count = 1353 + your new tests.
- [x] Completion report below.

# Completion report

**Status: complete.** Worker, 2026-10-27, on `u8g2gl-e1a/wo1-cst`.

### Baselines (before any change, at `1fc1456`)

- `npm ci && npm test`: **1353 tests — 1320 passed, 23 failed, 10 skipped** (90 files, 8 failing).
  The 23 failures are environmental, not code: every one is a BDF/bdfconv test that reads
  `extern/u8g2/tools/font/bdf/*.bdf`, and the `extern/u8g2` submodule is not checked out in this
  worktree (`.gitmodules` sets `update = none`). I did not initialise it (a ~large clone outside
  the box). The same 23, in the same 8 files, fail identically after the change.
- `npx tsc -p tsconfig.test.json --noEmit`: clean. `npm run lint`: clean.

### After

- `npm test`: **1738 tests — 1705 passed, 23 failed (the same baseline set), 10 skipped**
  (97 files). 1738 = 1353 + **385 new**: most are `it.each` rows, one per corpus file (a1, a5
  and a6 each run over all 105 tracked `.xml` files).
- `npm run lint` (eslint + tsc over src and test): clean.

### Commits

- `4bb89a1` feat(cst): lossless CST parse/print with tokeniser diagnostics parity

### Files

`cli/src/core/cst/`: `cst-types.ts`, `line-index.ts`, `entities.ts`, `parse-cst.ts`,
`print-cst.ts`, `index.ts`. `cli/test/cst/`: `cst-test-helpers.ts`, `round-trip.test.ts` (a1,
a5), `synthetic.test.ts` (a2), `parse-cst.test.ts`, `entities.test.ts`,
`diagnostics-parity.test.ts` (a6), `bench.test.ts` (a8). `cli/test/architecture/core-isomorphic.test.ts` (a7).
Nothing outside the box; `core/index.ts` untouched (PA ruling 3); no version bump (ruling 2).

### Design notes the PA should know

- **Printer is honest.** `printCst` emits only node-owned slices (open tag, children, close tag,
  leaf ranges) and never copies a gap, so a byte the parser fails to place makes a1 fail.
- **`invalid` node kind added** beyond the WO's list: recovery paths (a `<` with no name,
  trailing content after the root) produce one, so the tree stays lossless on malformed input.
- **Tag-internal whitespace is not a node**: it is the gap between attribute ranges inside
  `openTag`. Content-level whitespace is `whitespace` trivia.
- **Entity decoding copied**, not imported (`cst/entities.ts`), so E-1b can delete the
  tokeniser; `entities.test.ts` holds the copies equal. One deliberate difference below.
- **Line/column convention** (checked against `advance()`): LF, CRLF and lone CR each end a
  line; every other UTF-16 code unit — a tab, and each half of a surrogate pair — is one column.
  **BOM: my decision**, since the tokeniser has no rule (it cannot parse a BOM file): the BOM
  occupies no column, so a BOM file reports the same coordinates as without.

### a6 — parity result and discrepancies

Parity holds on **every** case: all 105 repository `.xml` files (well-formed ones are
diagnostic-free in both), the 5 inline cases from `malformed.test.ts`/`xml-tokeniser.test.ts`,
and 29 cases written to hit every diagnostic site and recovery branch in the tokeniser (CRLF,
lone CR, tabs and astral characters before the error included). Messages also match verbatim,
though the test asserts only code, line, column and order (ruling 4).

**Where the CST deliberately differs** (accepts well-formed input the tokeniser rejects; no
malformed fixture is affected):
1. **Leading BOM** — the tokeniser consumes U+FEFF as the root's `<` and reports
   `Expected element tag name` at 1:1. Any BOM-saved file fails to parse today.
2. **CDATA in content** — the tokeniser reports `Expected element tag name`; the CST makes a
   `cdata` node.
3. **`&#N;` beyond U+10FFFF** — `decodeXmlEntities` lets `String.fromCodePoint`'s RangeError
   escape, so `tokenizeXml` **throws** on e.g. `&#99999999;`, breaking its never-throws contract.
   The CST leaves the reference as written.

**Where I think the tokeniser is wrong but parity was kept** (E-1b decides):
4. **Text before the root** (`hello <root/>`): the root parser consumes `h` as if it were `<`,
   names the element `ello`, and reports `Unexpected character '<'` / `Expected '='` — two
   misleading errors instead of "content before the root element".
5. **`Expected '>' or '/>'` and `unclosed tag`** are located at the element's `<`, not where
   the open tag actually broke off (e.g. `<a x="1"` reports 1:1 twice).
6. **Missing `=`** does not consume anything, so `<a b "c">` cascades into four diagnostics.
7. **Empty document** is reported at a literal 1:1, not at end of input.
8. **`<!DOCTYPE …>`** is rejected as a missing tag name, then its remainder as trailing content
   (two errors). The CST keeps this parity; no fixture uses a DOCTYPE.
9. Columns count UTF-16 code units, so an astral character counts as 2. Monaco and VS Code use
   the same convention, so this is probably right, but it is a convention, not an accident.

### a7

Passes on today's code (scans 100+ import specifiers across all `src/core/**/*.ts`; also
forbids any bare package specifier, since core has no runtime dependency). **Demonstrated
failing** twice by temporarily adding to `cst/print-cst.ts` (a) `require('fs')` → *"imports
'fs': a bare Node builtin"*, and (b) `import { join } from 'node:path'` → *"imports
'node:path': a node: import"*; each restored before commit, never committed. Note: eslint's
existing `no-restricted-imports` rule on `src/core` already catches static imports; this test
additionally catches `require()` and `import()`, and is what a7 asked for.

### a8

`parseCst` on stress100 (9 813 bytes, 102 elements; the in-test generator is byte-identical to
`evidence/wo1/make-stress.py`'s output, checked): **median 0.12–0.14 ms** over 50 runs after 10
warm-up runs, three consecutive invocations (0.1368, 0.1298, 0.1175 ms). Budget 1 ms. Reported
via `console.log`, not gated.

### Not done

Nothing from the checklist. The `extern/u8g2` submodule failures are pre-existing and
environmental (see Baselines).
