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

- Worktree: `/Users/mcneillm/Documents/Projects/U8G2GL-e1a`, branch `u8g2gl-e1a/wo1-cst`
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

- [ ] Record baselines first: `cd cli && npm ci && npm test` (expect 1353 passing) and
      `npx tsc -p tsconfig.test.json --noEmit` / `npm run lint` clean. Paste the counts below.
- [ ] **a1** — a test that globs `git ls-files '*.xml'` from the repo root at test time and
      asserts `printCst(parseCst(t)) === t` for each (about 105 files).
- [ ] **a2** — named synthetic cases, one per item: CRLF; mixed line endings; a BOM; tabs;
      single and double quotes; `&amp;` and `&#x…;` in values; comments before the root,
      between attribute lines and inside text; CDATA; with and without an XML declaration;
      with and without a trailing newline.
- [ ] **a5** — for every attribute in a1's corpus, `text.slice(value.start, value.end)` equals
      its raw value, and the name range slices to its name.
- [ ] **a6** — a parity test running `tokenizeXml` and `parseCst` on every malformed fixture
      under `cli/test/` (find them; at least `cli/test/parser/fixtures/malformed.xml` and the
      cases in `malformed.test.ts`/`xml-tokeniser.test.ts`) asserting the same code, line and
      column. Report any case where you think the tokeniser is wrong (PA ruling 4).
- [ ] **a7** — `core-isomorphic.test.ts`: walk every `.ts` file under `cli/src/core/` and fail
      on any `node:` import or require, or a bare Node builtin specifier (`fs`, `path`, ...).
      It must pass on today's code. Demonstrate it fails by temporarily adding an import, then
      remove it (say so in the report; do not commit the failing state).
- [ ] **a8** — a benchmark test that parses stress100's screen (generate it with
      `.agents/skills/principal-architect-workspace/e-d-editor-design/evidence/wo1/make-stress.py` into `tmp/`, or construct an equivalent
      100-element screen in the test) and **reports** the median of 50 runs. It must not fail on
      time. Paste the number.
- [ ] Full CLI suite, lint and tsc clean. Count = 1353 + your new tests.
- [ ] Completion report below.

# Completion report

*(Worker fills this in: baselines, commits, test counts, a6 discrepancies, a8 median, anything
you could not do and why.)*
