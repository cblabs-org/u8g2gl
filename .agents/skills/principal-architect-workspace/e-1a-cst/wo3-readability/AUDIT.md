# E-1a CST — Readability & Documentation Audit

**Scope:** `git diff origin/main..HEAD -- cli/` on `u8g2gl-e1a/wo2-edits` (18 files, 2651 lines, all new): `cli/src/core/cst/*` (8), `cli/test/cst/*` (9), `cli/test/architecture/core-isomorphic.test.ts`.
**Standards:** `u8g2gl-standards` (TypeScript naming, `documentation.md`, `typescript.md`). Judged as TypeScript throughout.
**Reviewed:** 2026-10-27. No source edited.

**Severity counts:** P1 0 · P2 0 · P3 5 · P4 5

**Verdict:** No significant defects. Naming (PascalCase types, camelCase functions, kebab-case files, string-union `kind`/`CstQuote`, no `I` prefix, no `enum`, no `any`) is correct. No `node:` import in `src/core/cst/` (grep-verified; the ESLint `no-restricted-imports` rule and the new architecture test both back this). Every file has an SPDX header, a truthful `File:` path, and a `Purpose:` that explains why the module exists. Every exported symbol listed in a header exists, and every export has TSDoc. No stale docs found: I checked the `File:` paths, the `index.ts` export list against the actual re-exports, `XmlScanner`/`decodeXmlEntities`/`advance()`/`tokenizeXml`/`DIAGNOSTIC_CODES.MALFORMED_XML` against `parser/xml-tokeniser.ts` and `schema/diagnostic.ts`, and the layering-test claim. `cst-types.ts`, `line-index.ts` and `entities.ts` are exemplary, so pattern-match against them.

## Line-Item Instructions

### P3 — Consistency and documentation gaps

- [x] **Provenance citations on new lines (documentation.md §4.1).** The rule binds new lines, and all of these are new. They name workspace artefacts the reader will not have. Rewrite each to a durable reference or to the conclusion plus its reason.
  - `cli/test/cst/cst-test-helpers.ts:19,61` — "the E-D bench", "LOOP-BUDGET §1". `LOOP-BUDGET.md` exists only under `.agents/skills/principal-architect-workspace/`. **Fix:** state the fact (100 alternating `u8g2gl_label`/`u8g2gl_box` in one `<view>`, the per-edit re-parse budget being 1 ms) and drop the workspace pointer.
  - `cli/test/cst/bench.test.ts:7` ("E-1a a8", "LOOP-BUDGET §1, §5.3"), `:25` ("(a8, ...)"), `:50` ("[a8]"). **Fix:** drop the tags; keep the 1 ms per-keystroke budget as a stated figure.
  - `cli/test/cst/diagnostics-parity.test.ts:7` ("E-1a a6"), `:28` ("PA ruling 4"), `:82` ("(a6)"). **Fix:** `:28` becomes "Parity is defined over code, line and column; messages are prose and may be reworded independently."
  - `cli/test/cst/round-trip.test.ts:7,22,34` ("E-1a a1 and a5", "(a1)", "(a5)"); `:24` "at the time E-1a was specified" is fine to keep as a count rationale but drop the tag.
  - `cli/test/cst/synthetic.test.ts:7,11,31` ("E-1a a2", "item of a2", "(a2)", "a1 alone").
  - `cli/test/cst/edits.test.ts:7` ("E-1a a3, a4"), `:120` ("(a3)"), `:13` ("the probe project's departures screen" points at a workspace project; name the fixture file instead).
  - `cli/test/cst/line-diff.ts:7` ("E-1a a3").
  - `cli/src/core/cst/{entities.ts:9,12; parse-cst.ts:10; line-index.ts:10; index.ts:7}` — "E-1b" is a roadmap tag that will mean nothing after the work lands. **Fix:** say "when the parser moves onto the CST and `xml-tokeniser.ts` is deleted" and keep a `docs/implementation_plan.md` section reference if one exists.
  - **Resolved** (`3b9da32`). Every listed pointer dropped and its fact kept: the bench states 100 elements and the 1 ms budget; parity states "code, line and column; messages are prose"; roadmap names became "the parser does not consume this yet" / "when the tokeniser is deleted"; the departures fixture is named by file. Criterion tags also removed from `describe`/`it` titles. Grep of `cst/**` and the architecture test for E-1x, E-D, LOOP-BUDGET, a1–a8, "PA ruling", "probe project", stress100, WO-numbers: no comment hits (the departures screen's load *path* remains, as code). No `docs/implementation_plan.md` section reference was added.
- [x] **Non-obvious branch conditions with no why-comment (documentation.md §4).** These encode layout decisions that someone will "simplify".
  - `cli/src/core/cst/edits.ts:342` — `startsLine(...) && lineStartAt(cst, close.start) > parent.openTag.end`. The second clause guards against a close tag on the same line as the open tag, but nothing says so. **Fix:** add a one-line comment.
  - `cli/src/core/cst/edits.ts:368-369` — `lineEndAt(cst, Math.max(start - 1, 0))` and `start > 0 ? previousBreak : start`. The existing comment says the last line takes the preceding break, but not why `start > 0` or what happens for a lone element on line 1. **Fix:** explain both guards.
  - `cli/src/core/cst/edits.ts:219` — `sharesLine || !startsLine(cst, last.start)` has two reasons for appending inline, and the doc comment only covers the first. **Fix:** a comment for the second.
  - `cli/src/core/cst/edits.ts:248` — the leading-whitespace walk includes `\r\n`, so a same-line removal can swallow a line break. The TSDoc says "the whitespace before it", which understates this. **Fix:** say so in the comment, or in the TSDoc if intended.
  - **Resolved** (`3b9da32`). Comments added at all four sites. `:248`: the walk does consume `\r\n` (CR and LF are in the class), and that is intended — the comment and the TSDoc now say so, including that a following `/>` is pulled up a line. `:368-369`: explaining the guards exposed a **defect, not fixed** (behaviour frozen for this WO): with a BOM, line 1 starts at offset 1, so for the sole element of a one-line BOM file `start > 0` holds, `lineEndAt(0)` is end of text, and `removeElement` returns `[{start: len, end: len}]` — it removes nothing (reproduced: `'\uFEFF<a/>'`). **Fixed** in the follow-up commit below (PA-approved behaviour change): line 1 is now detected by line number, not `start > 0`, so the BOM is kept and the element removed. The defect note is gone from the comment. The other edit functions were checked on line 1 after a BOM (`insertElement` into a self-closing and an empty parent, `insertAttribute`, `removeAttribute` same-line and per-line, `renameElementTag`, `replaceAttributeValue`): all already correct, because they go through `lineStartAt`, which skips the BOM. Six tests added under "edits after a byte-order mark".
- [x] **Invisible BOM literals.** `cli/src/core/cst/print-cst.ts:29` (`['﻿']`), `cli/test/cst/parse-cst.test.ts:129`, `cli/test/cst/synthetic.test.ts:47` contain a raw U+FEFF (verified with `od`: bytes `357 273 277`). A reader sees `''`. **Fix:** write `'﻿'`. The literal is a one-character mistake waiting to happen, which is also why `0xfeff` is repeated in `line-index.ts:56` and `parse-cst.ts:427` (see P4).
  - **Resolved** (`3b9da32`). `print-cst.ts` uses the new `BOM` constant; the two tests write `'\uFEFF'`. No raw U+FEFF remains in `cst/**` (byte grep).
- [x] **Bench hard-codes its own run count.** `cli/test/cst/bench.test.ts:48` uses `samples[24]`/`samples[25]` and `:26` writes "median of 50 runs" while `MEASURED_RUNS` exists at `:23`. Change `MEASURED_RUNS` and the median silently becomes wrong. **Fix:** derive the middle from `MEASURED_RUNS` (`samples.length / 2`), and build the test title and the "budget 1 ms" figure from named constants.
  - **Resolved** (`3b9da32`). Median derived from `samples.length` (odd/even handled); title, element count (`STRESS_ELEMENTS`), expected element total and budget (`BUDGET_MS`) all from named constants.
- [x] **`cst-types.ts` header contradicts its own type.** `cli/src/core/cst/cst-types.ts:12` says "Plain readonly data", but `CstDocument.lines` (`:219`) is a `LineIndex` class instance. **Fix:** "Plain readonly data apart from the document's `LineIndex`." (A small inaccuracy, kept at P3 because it is stale-style documentation.)
  - **Resolved** (`3b9da32`). Now "Plain readonly data, apart from the document's LineIndex (a class instance, itself immutable)".

### P4 — Optional, only if the architect approves

- [x] `cli/src/core/cst/parse-cst.ts:304-402` — `element()` is about 100 lines, with the close-tag scan (Step 5, `:371-392`) nested inside Step 4's loop. documentation.md §3 prefers extraction to annotation: pull out a `closeTag()` method. Behaviour must not change.
  - **Declined / deferred** (PA ruling: keep the diff small). Recorded for a later change.
- [x] `0xfeff` appears in `line-index.ts:56`, `parse-cst.ts:427` and `print-cst.ts:29`. A shared `BOM` constant would help; no rule mandates one, and `line-index.ts` is deliberately dependency-free.
  - **Resolved** (`3b9da32`, PA approved). `export const BOM = '\uFEFF'` in `line-index.ts` (keeps that file dependency-free), re-exported from `index.ts`, used in `line-index.ts`, `parse-cst.ts` and `print-cst.ts`. `charCodeAt(0) === 0xfeff` became `startsWith(BOM)`: identical for every string.
- [x] `cli/src/core/cst/edits.ts:43,47,147` — `isHorizontalSpace`, `isBlank` and `elementChildren` lack the short banner their neighbours have. Trivial, so arguably fine.
  - **Declined** (PA ruling: trivial helpers).
- [x] `cli/src/core/cst/edits.ts:341` — `parent.closeTag!` is safe because of the guard at `:291`, but the non-null assertion is not explained. A one-word comment, or restructure to avoid `!`.
  - **Resolved** (`3b9da32`, PA approved). Why-comment on the assertion: the top-of-function guard refuses an unclosed parent, and the self-closing case has already returned.
- [x] Lines over about 110 columns (`edits.ts` 2, `parse-cst.ts` 5, `edits.test.ts` 11, `cst-test-helpers.ts` 1, mostly object literals). The repo has no Prettier config and the standards set no limit, so this is a note only.
  - **Noted only** (PA ruling). No change.

## Verification Requirement (for the remediation worker)

- [x] `cd cli && npm run lint` — zero warnings (`eslint . && tsc -p tsconfig.test.json`)
- [x] `cd cli && npx vitest run test/cst test/architecture` — all pass, none weakened
- [x] Diff shows only comments, header text and the `'﻿'` / `MEASURED_RUNS` substitutions; no behavioural change in `src/core/cst/`

## Observations (standards silent)

- `typescript.md` §6 says core should be tested "with no Node globals available". `core-isomorphic.test.ts` is the static equivalent and is good, but the standards do not say whether a static scan satisfies that line.
- documentation.md §4.1 forbids work-order tags but does not say whether a roadmap name such as "E-1b" counts. I treated it as provenance because it is not a published reference; the architect may rule otherwise.

## Remediation record

Worker, 2026-10-27, branch `u8g2gl-e1a/wo3-readability` from `u8g2gl-e1a/wo2-edits` @ `e28d388`.

- `f89857b` docs(e-1a): WO3 readability audit (this file, as delivered)
- `3b9da32` docs(cst): resolve readability audit findings

Verification: full CLI suite **1809 passed, 0 failed, 0 skipped** (98 files; the
`extern/u8g2` submodule is now checked out). `npm run lint` and
`npx tsc -p tsconfig.test.json --noEmit` clean. Non-comment changes in `src/core/cst/`: the
`BOM` constant, its re-export, and its three uses; nothing else. Bench after the change: median
0.1245 ms.

### Follow-up: `removeElement` BOM defect

- *(commit below)* fix(cst): removeElement keeps a BOM on line 1

Suite after the fix: **1815 passed, 0 failed, 0 skipped** (1809 + 6 new). Lint and tsc clean.
