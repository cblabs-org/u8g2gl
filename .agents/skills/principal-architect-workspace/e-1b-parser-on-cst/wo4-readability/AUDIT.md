---
name: e-1b-wo4-readability
description: Remediate readability and documentation defects found in the E-1b diff (parser on the CST)
complexity: mechanical
---

# AUDIT / WO — E-1b Readability & Documentation Remediation

**Scope reviewed:** `git diff origin/u8g2gl-e1a/wo3-readability..HEAD -- cli/` on `u8g2gl-e1b/wo3-fixes` (worktree `/Users/mcneillm/Documents/Projects/U8G2GL-e1b`). Paths below are relative to `cli/`.
**Reviewed:** 2026-10-27
**Standards:** `u8g2gl-standards` skill (`documentation.md` §1-§5, `typescript.md`)

## Objective

The diff is in good shape: every new file has a header with SPDX, a true `File:` path and a real `Purpose:`; the new public API (`tokenizeXml`, `rootElementName`, `offsetOf`, `getAttributeLocation`, the location types) is documented with lifetimes and failure modes; there are no P1 findings and no workspace pointers (acceptance tags b1-b5, E-1a/E-1b/E-2, PA ruling N, WO names, Q-17) on any added line. The remaining work is **stale documentation left behind by the tokeniser's removal** and **change-narrating wording** that will rot.

## Strict Boundary Box

**Do NOT touch:** behaviour (comments, headers, test titles only); the two JSON goldens (`test/cst/tokeniser-*.json`) — they are recorded data; pre-existing pointers on lines this diff does not touch.
**Do NOT:** create branches, open PRs, rebase, merge, commit or push.
If a fix seems to need a behavioural change, stop and surface it.

## Tooling Constraints

Run from `cli/`: `npm run build`, `npm test`, and the repo's lint/typecheck. Zero errors/warnings; no test weakened.

## Line-Item Instructions

### P2 — Stale documentation (actively misleading)

- [x] `test/parser/xml-tokeniser.test.ts:6-7,20` — The file, its `Purpose:` ("Verification tests for the low-level XML tokeniser and position tracker") and `describe('XML Tokeniser'` describe a module that no longer exists; the diff only changed its import path. **Fix:** rewrite `Purpose:`/`Description:` to say it tests `tokenizeXml`/`decodeXmlEntities` as the public raw-tree reader (built on the CST); retitle the `describe` to `'tokenizeXml'`. Renaming the file to match (`raw-xml-reader.test.ts`) is optional and needs the architect's nod, since `File:` must then be updated too.
  **Resolved (024d49a): Purpose rewritten, describe retitled `tokenizeXml`. File rename declined: optional, and no architect nod.**
- [x] `src/core/cst/index.ts:9-10` — Says the CST is "deliberately not re-exported from core/index.ts yet: the public surface is settled when the first consumer lands, not before." The first consumer (`parser/cst-adapter.ts`) has landed, so the stated reason is false. **Fix:** state the current fact and reason (e.g. consumed by `parser/cst-adapter.ts`; still not re-exported from `core/index.ts` because <the reason that is now true — architect to confirm, else drop the sentence>). Same file, line 17: `LineIndex ... Offset → line/column lookup` is now two-way; change to `Offset ↔ line/column lookup` to match `line-index.ts`.
  **Resolved (024d49a): states the adapter is an internal consumer and the CST becomes public API when the designer's canvas editing needs it (PA ruling); `↔` fixed.**

### P3 — Consistency and documentation gaps

- [x] `test/cst/synthetic.test.ts:59` — `// A tab is one column, as in the tokeniser.` points at a deleted module (untouched line, made stale by this change). **Fix:** `// A tab is one column, like every other UTF-16 code unit (line-index.ts).`
  **Resolved (024d49a).**
- [x] `test/cst/tokeniser-golden.ts:28-40` — `Exports:` omits two exported interfaces, `FrozenInlineDiagnostics` and `FrozenDifference`. **Fix:** add them under "Golden shapes".
  **Resolved (024d49a).**
- [x] `test/cst/tokeniser-golden.ts:133-135` — The banner for `at` reads `// at` / ``// `line:column`, refusing…`` with the verb missing, so the description is a fragment. **Fix:** `// at` / `// A location as \`line:column\`, refusing one in some other file: …`.
  **Resolved (024d49a).**
- [x] `src/node/load-project.ts:163-173` — `loadProject`'s Doxygen does not mention the new behaviour: a single file whose root no parser takes yields a `U8G2GL_MALFORMED_XML` diagnostic (its own well-formedness errors if it has any, else "Unrecognised root"). **Fix:** add one sentence to the description and note that diagnostics appear in the returned model's load diagnostics (as the code does).
  **Resolved (024d49a).**
- [x] Change-narrating wording in new/changed comments (34 occurrences across `src/core/parser/cst-adapter.ts`-adjacent files). A comment is read by someone who was never here; "used to / until now / now / the old or original scanner / has always / did once" describe an event, not the code. Keep the fact, drop the narrative:
  - `src/core/cst/line-index.ts:8-10,15-16` ("…so no diagnostic moved when the parser switched"; "the old scanner had no rule for") → state the convention only (LF, CRLF, lone CR end a line; BOM occupies no column).
  - `src/core/cst/entities.ts:13,49-52` and `src/core/cst/cst-types.ts:88` → drop "the parser used before the CST" / "original scanner let it escape"; keep "a reference beyond U+10FFFF is left as written because `String.fromCodePoint` throws a RangeError there".
  - `src/core/cst/parse-cst.ts` header (lines ~14-26) and in-body comments at ~120, 144, 156, 183-185, 244-246, 304-305, 333-334, 407, 426, 436-439, 475 ("the original scanner …") → where the point is that recovery paths must keep producing the diagnostics the golden records, say that once, citing `test/cst/tokeniser-diagnostics.json`; elsewhere describe the rule itself ("reported at 1:1 literally, not at an offset").
  - `src/core/parser/raw-xml.ts` `RawXmlAttribute` doc ("Both are derived…") is fine; `src/core/parser/index.ts:39` is fine.
  - `test/integration/single-file-root.test.ts:8-12,61` ("used to pass validation unread"; "A deliberate change: until now `<foo/>` passed validation silently") → "A file no parser takes must fail, not pass unread: …".
  - `test/manifests/attribute-locations.test.ts:8-9` ("These used to report at the `<widget>` or `<bind>` tag") → drop the sentence; keep the §15.1 statement.
  - `test/cst/entities.test.ts:8-10` ("Two copies existed while the old tokeniser lived; this test used to…") and `:37` title ("where the old tokeniser threw") → keep the behaviour: "leaves a reference beyond U+10FFFF as written rather than throwing".
  - `test/cst/diagnostics-parity.test.ts:7-13`, `test/cst/raw-adapter.test.ts:7-18,39,69-70` — these legitimately concern the recorded tokeniser (the goldens are its record), so "recorded tokeniser" may stay; remove only the "now/before/gone" framing (e.g. `'a leading BOM: two diagnostics before, a clean tree … now'` → `'a leading BOM is skipped and occupies no column'` with the recorded behaviour in the body).
  - `test/node/bom-and-root-dispatch.test.ts:7-15` ("now parses", "as the old first-`<name` search let it") → state the two guarantees without the comparison.
  - `src/core/parser/name-policy.ts:134-138` ("how this once went wrong … put line 1's edits one code unit early") → keep the reason for sharing `LineIndex` (a second table disagrees on CRLF and on the BOM) in the present tense, drop "once".
  **Resolved (024d49a), every listed site. One deliberate remainder: `tokenizeXml`'s doc says it "keeps its historical name, from when it was a tokeniser", per the PA ruling. The parity/adapter tests keep "recorded tokeniser".**

### P4 — Optional, only if the architect approves

- [x] `src/core/parser/cst-adapter.ts:70` — `toRawAttribute` has no banner while `locate`, `foldNewlines`, `decodeFolded`, `toRawElement` do (§2 completeness). Add a two-line banner, or leave as trivial.
  **Resolved (024d49a): banner added.**
- [x] `src/core/manifest/manifest-registry.ts:~236` — `at: SourceLocation | undefined = undefined` plus `[]` placeholders at three call sites to reach it. Use `at?: SourceLocation` and consider an options object. Readability only.
  **Resolved (3508701): `options: { suggestions?, at? }`; no placeholders left.**
- [x] `src/node/fix-names.ts:~31-33` — import list is no longer alphabetical (`rootElementName` sits between `parseScreenFile` and `parseWidgetManifestFile`).
  **Resolved (3508701).**
- [x] `src/node/load-project.ts:~233` — `tokenizeXml` runs for dispatch and again inside the chosen `parse*File`. Not a standards matter; mention only for awareness.
  **Declined: awareness only, per the audit. Parsing a single file twice costs well under a millisecond; avoiding it would mean threading a parsed document into every `parse*File`, a change to their signatures.**

## Verification Requirement

- [x] build — zero warnings/errors
- [x] `npm test` — all pass, none weakened or deleted (retitled tests keep their assertions)
- [x] `git diff` shows only comments, headers and test titles; goldens untouched
- [x] `grep -rniE "tokeni[sz]er?" src test --include='*.ts'` leaves only: `tokenizeXml` identifiers, `tokeniser-golden.ts` / `tokeniser-*.json` references, `expression.ts` (an unrelated tokeniser), and deliberate "recorded tokeniser" wording in the parity/adapter tests

## Issue Surfacing

Report any defect outside this checklist in your Completion Report; do not fix or file it.

## Review Notes

**Severity counts:** P1 0 · P2 2 · P3 5 (the narrative-wording item is one grouped item) · P4 4

**Files reviewed:** `core/parser/{cst-adapter,name-policy,index,raw-xml,parse-widget-manifest,parse-globals,parse-project,parse-screen}.ts`, `core/schema/{source-location,widget-manifest}.ts`, `core/cst/{line-index,parse-cst,entities,cst-types,index}.ts`, `core/manifest/manifest-registry.ts`, `core/validator/validate-schema.ts`, `node/{load-project,fix-names}.ts`, and tests `cst/{raw-adapter,diagnostics-parity,entities,tokeniser-golden,synthetic,cst-test-helpers}`, `integration/single-file-root`, `manifests/attribute-locations`, `node/bom-and-root-dispatch`, `parser/xml-tokeniser`.

**Pointer sweep (your explicit ask):** swept added lines for acceptance tags b1-b5, E-1a/E-1b/E-2, PA ruling N, WO/PR-nn names, Q-nn and `.agents` paths — **none found** on added or changed lines. Hits seen are all pre-existing (e.g. `PR-04 WO3` in `widget-manifest.ts`, `PR-3R WO9` in `load-project.ts`) and are not defects under §4.1. The JSON goldens contain `PR-04 WO…` strings, but as recorded XML comment *data* from fixtures; leave them (editing would invalidate the hashes).

**Live-tokeniser sweep:** no comment calls the deleted tokeniser live, apart from the three stale items above (`xml-tokeniser.test.ts`, `cst/index.ts`, `synthetic.test.ts:59`). `src/core/cst/parse-cst.ts:17` correctly cites the golden as a record.

**Uncertain:** the P2 `cst/index.ts` fix needs the architect to say whether a still-true reason exists for not re-exporting from `core/index.ts`.

**Observations (standards silent):**
- `tokenizeXml` no longer tokenises; it adapts the CST. Renaming would be public-API churn and is not mandated, but the name now misleads. Architect's call.
- `OffsetRange` (schema) and `CstRange` (cst) are structurally identical. Deliberate (core/schema stays independent of cst) and works, but a shared type would remove a duplicate if the layering allows.
- `test/cst/tokeniser-golden.ts` and others write temp files under `cli/tmp/`; `rules/02` prefers repo-root `tmp/`. Pre-existing pattern, not changed here.

**Exemplary:** `cst-adapter.ts` — the header states why the module exists and the tree-shape contract, steps are named by purpose, and each helper has a banner. Pattern-match against it.

## Completion Report

**Branch** `u8g2gl-e1b/wo4-readability`, from `wo3-fixes`'s tip `070bfbd`; not pushed.

**Commits:** `9d2363d` (this audit), `024d49a` (P2/P3, plus the P4 `toRawAttribute` banner; comments, headers and test titles only), `3508701` (P4 code items: the `manifestDiagnostic` options object, fix-names import order), and this report.

**Verification:** build clean; `npm run lint` (eslint + tsc) clean; **2228 passed, 0 failed**, no test weakened or deleted (retitled tests keep their assertions). The goldens `test/cst/tokeniser-*.json` are untouched. `git diff` for `024d49a` is comments, headers and test titles only; `3508701` changes code, and only as P4 recommended.

**Grep** `grep -rniE "tokeni[sz]er?" src test --include='*.ts'`, minus `tokenizeXml` identifiers, golden references, `expression.ts` and "recorded tokeniser": leaves `catalogue/query.ts` (display-search tokenising, unrelated; the audit's list missed it), the `tokenizeXml` doc's historical-name sentence (PA ruling), the `xml-tokeniser.test.ts` file name (rename declined), and "the tokeniser was recorded" / "recorded from the tokeniser" in the parity and adapter tests, which concern the record.

**Outside the checklist:** nothing new found. The audit's observations (`OffsetRange` duplicating `CstRange`; tests writing to `cli/tmp/`) are pre-existing or deliberate and left alone.
