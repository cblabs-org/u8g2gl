---
name: pr-04b-wo-readability
description: Remediate readability and documentation defects found in the PR-04b font and image pipeline
complexity: standard   # the history-narration items need judgement about which fact to keep
---

# WO — Readability & Documentation Remediation (PR-04b)

**Scope reviewed:** `git diff main..u8g2gl-fonts/wo4-png-convert`, source and tests only. Excluded as briefed: generated glue, wasm and source JSON, `test/generated_fixture/generated*`, `.bdf`, `.png`, `.agents/`. Reviewed from the branch tip with `git show`, not the working tree.
**Reviewed:** 2026-09-28
**Standards:** `u8g2gl-standards` skill (`documentation.md`, `typescript.md`; SKILL.md §2, §4)

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do not
> branch, and do not plan. Execute the checklist below.

## Objective

The code is structurally sound: no `node:` import in `src/core/`, no `any`, SPDX and a truthful `File:` path on every new source file, functions banner-documented. It is held back by three things. There are three stale comments that describe code which no longer exists. About 175 added comment lines narrate work-order history (`WO3 item 5`, `WO1 Finding 2`, "the WORKORDER said…"). A handful of headers were not updated when the file's job grew. Remove the narration but keep every fact it was carrying.

## Strict Boundary Box

**Do NOT touch:**
- Any behaviour. Comments, banners, headers and (P4 only) nothing else. No logic changes.
- Generated output. Comments inside `cli/src/core/generator/emit/*.ts` that are **string literals emitted into generated C++** must not change. That would alter output without an input change, which needs a generator version bump (`rules/03-versioning.md`). Edit only `//` and `/** */` comments in the TypeScript itself.
- `no-ticket-numbers.test.ts`'s regex and its "bad" sample strings (`'(WO4 F5, §16)'`, `'// PR-04b'`). They are deliberate test data.
- The user-facing `PR-08` / `PR-09` in not-yet-supported diagnostics and their tests. They tell an author which release delivers a construct, so they are functional (see "Where references help").
- Pre-existing history references in untouched code. There are hundreds (`PR-04 WO8c`, `WO10` and so on in `generate.ts`, the validators and `realise/`). Surface them, do not fix them.

**Do NOT:** create branches, open PRs, rebase, or merge.

If a fix appears to require a behavioural change, stop and surface it rather than making it.

## Tooling Constraints

- From `cli/`: the project's typecheck and `vitest` commands. Zero warnings, all tests pass, none weakened.
- Golden and determinism tests must pass unchanged. That proves no emitted byte moved.

## Where work-order references help, and where they are noise

Rule of thumb: a comment should still be true and useful to someone who has never seen a work order. Ask "what would this line say if the WO did not exist?" If the answer is a fact, keep the fact and delete the label.

**Help (keep):**
- `§n`, `[D-n]`, `[UD-n]`, `typescript.md §1`, `rules/03`. These are stable, findable decision records. They are what `documentation.md` §4 asks for.
- Upstream source pointers, e.g. `bdf_map.c:174` defines `*` as 32–255 (`compile-bdf.ts:22-27`) and `bf_WriteU8G2CByFP`. They are checkable.
- `PR-08` / `PR-09` inside a user-facing not-yet-supported message, and in the `NOT_YET_SUPPORTED` docs. They are information for the author.
- Measured facts that came out of a WO, provided the fact is stated: "bdfconv exits 0 with `Glyphs: 0/0` on a malformed BDF", "`-ffile-prefix-map` is needed or the wasm embeds the build path", "an unfiltered range is 0–0xFFFF, not `*`". These are the "discovered painfully" comments `documentation.md` §4 wants. The label is noise. The fact is gold.

**Noise (remove or rewrite):**
- Bare provenance tags: `(PR-04b WO3 item 5)`, `(WO3 item 1)`, `WO4 item 3`. `item N` indexes a document a reader will not have open. They are never the reason.
- Pointers to workspace documents: `PROJECT.md Finding 3/4`, `WO1 Finding 2`, "the Completion Report's Decisions Made", "per the WORKORDER", "written for this WORKORDER". These sit under `.agents/`, are not stable, and are not reachable from a source checkout.
- Debate or history: "the PA rejected the latter during WO2→WO3 handoff", "WO2's WORKORDER was wrong here", "Replaces WO1's `runner.ts`", "`… were here too until PR-04b removed them`", "the guard that used to read this field", "is gone (WO3 item 4)". This explains a decision by narrating who made it. State the *reason* (it is already there in most cases) and drop the who.
- "Since PR-04b WO3 the unit also…", "now", "no longer". These are true only relative to a moment.

## Line-Item Instructions

Ordered by severity. Line numbers are in the branch-tip file. Stale documentation is ranked one level above the equivalent omission.

### P1
None. No heap use, `std::function`, `node:` import in core, `any`, or budget inaccuracy was found.

### P2 — Stale or misleading documentation

- [ ] `cli/src/core/generator/report/budget.ts:~187-189` (diff hunk around `compiledBdfFontBytes`). The banner block reads `// flashLines` immediately followed by `// compiledBdfFontBytes`. The old `flashLines` banner was left orphaned above the new function, and the real `flashLines` (`~:209-214`) now has a banner that starts mid-sentence: `// §18's flash table. …` with no name line. **Fix:** delete the stray `// flashLines` line above `compiledBdfFontBytes`. Restore `// flashLines` as the first line of the banner that begins "§18's flash table".
- [ ] `cli/src/core/assets/compile-project-assets.ts:117-123, 143, 170-171, 191`. Four comments point at `images.ts` behaviour that no longer exists.
  - `:118-120`: "the same condition images.ts's missingAsset() reports". `images.ts` has no `missingAsset()`; it reads no assets at all.
  - `:121` and `:143`: "offendingText is font.src, images.ts's own convention" — `images.ts` sets no `offendingText`.
  - `:170`: "The <xbm> text is exactly what images.ts said before this step took the job over".
  - `:191`: "unchanged from when images.ts raised it".
  - **Fix:** reword each to stand alone. E.g. `:121-123` → "offendingText is the declaration's `src`, for every asset diagnostic in this module, so all four read the same way." Drop the other three history clauses.
- [ ] `cli/src/node/cli.ts:781-786`. The comment says the editor target shares the one call "because both read from `result`, which this build's compiledAssets already flow into". This is wrong. `editorFilesOf()` and `reportFor()` now take `compiledAssets` as an explicit argument (`:664-668, :698-703`) and read `compiledAssets.images` / `.fonts` directly, not `result`. **Fix:** replace with: "Asynchronous, so it runs before the synchronous `generate()`. The same result is passed to `generate()`, the editor target and the budget report, so all three read one set of compiled fonts and images."
- [ ] `test/CMakeLists.txt:~557-558` says "Real U8G2's own header declares U8G2_FONT_SECTION (u8x8.h)". Verified against `extern/u8g2` 2.36.18: `U8G2_FONT_SECTION` is defined in **`u8g2.h:188`** as `U8X8_FONT_SECTION(name)`; `u8x8.h:155-170` defines `U8X8_FONT_SECTION`. **Fix:** say `u8g2.h` and (optionally) that it forwards to `u8x8.h`'s `U8X8_FONT_SECTION`. In `test/stubs/U8g2lib.h:64` the doc names only `U8X8_FONT_SECTION` while the macro being stubbed is `U8G2_FONT_SECTION`; say "the stub for `U8G2_FONT_SECTION` (u8g2.h), which real U8G2 forwards to `U8X8_FONT_SECTION` (u8x8.h)".
- [ ] `cli/src/core/validator/validate-not-yet-supported.ts:11-13, 25-27`. Two stale statements after the `<bdf>`/`<convert>` entries were removed.
  - Purpose still says "The Chief Architect's PR-04 decisions 1 and 3 fix the set". Decision 3 was the PR-04b entry, and it is gone.
  - `:25-27` inserts "`<bdf>` fonts and `<convert>` images were here too until PR-04b removed their entries" *inside* the bullet list of what the pass reports, so it reads as a third bullet.
  - **Fix:** say "decision 1 fixes the set" and delete `:25-27` (the removal is in git history). Also `diagnostic.ts:172-173`: the same sentence, cleaned, is fine. Leave that one, minus the now-run-together "The message names the PR…" line wrap.
- [ ] `cli/src/core/generator/emit/images.ts:125-126`. "Its diagnostics are always empty **now**". `emitImagesUnit` still builds `const diagnostics: Diagnostic[] = []` (`:129`) and returns it. **Fix:** "Diagnostics are always empty: asset defects are reported by `compileProjectAssets()`. The field exists because every unit emitter returns `EmittedUnit`." Leave the code, since removing the variable is a behavioural-adjacent edit.

### P3 — Documentation gaps and history narration

- [ ] **Headers that were not updated when the file's job changed.**
  - `cli/src/node/load-project.ts:13-21`. The Description never mentions the two new outputs (`assets` bytes, `bdfLicenceFiles`) or the confinement rule. Add one paragraph: what is read, that a `src` outside the project root is silently left absent (`compileProjectAssets` reports it), and why licence discovery lives here (core cannot list directories).
  - `cli/src/node/cli.ts:11-18`. It still describes `generate` without the asynchronous asset step. Add one sentence. Note also the stray `generate --target-kind editor (PR-04 WO11…)` paragraph after the Exports list (`:23-25`); fold it into the Description.
  - `cli/src/core/validator/validate-schema.ts:7-32`. The Description lists what Pass 1 checks but not the two additions at `:651-663` (`MALFORMED_BDF_RANGE` via `parseBdfRange`; `<convert>` attributes via `convertDeclProblems`). Add both, with the "one definition, two consumers" reason.
  - `cli/src/core/generator/generate.ts:18-23`. The header narrates "PR-04 WO8b added… WO9 emitted… WO10 emits…" (pre-existing). The new asset paragraph beneath it is good. Add `compiledAssets`, `bdfLicenceFiles` and the `MISSING_COMPILED_*` guard to the `@param` of `generate()` (`:278`), which mentions only "Loaded project, target name and generator version".
- [ ] **Header `Exports:` lists that omit exported symbols.**
  - `cli/src/core/images/png-to-xbm.ts:39-44` omits `ConvertOptions` and `ConvertFailure`.
  - `cli/src/core/images/convert-decl.ts:20-23` omits `ConvertDeclShape`.
  - `cli/src/core/fonts/bdfconv-instance.ts:21-26` omits `BdfconvFS`.
  - `cli/src/core/fonts/bdfconv-output.ts:27-30` matches.
- [ ] **`build-bdfconv.ts` flag rationale is incomplete and points at unreachable documents** (`cli/src/node/build-bdfconv.ts:38-55`).
  - Only two of the nine emcc flags are explained. Add a one-line why to `-sENVIRONMENT=web` (forces the glue's fetch-free path that `bdfconv-instance.ts` relies on), `-sEXIT_RUNTIME=1` (makes `exit()` throw `ExitStatus`, which `convertBdf` catches), `-sINVOKE_RUN=0` and `-w`.
  - Replace "(WORKORDER 'What is already measured'… the Completion Report's Decisions Made)" with the facts already given underneath.
  - `:39` "Measured 2026-09-28 (PROJECT.md Finding 3)": keep the date and the measurement, drop the pointer.
  - `:170-171` "(WO1 provenance.test.ts)" is garbled; say "checked by `test/bdfconv/provenance.test.ts`".
  - `:234` drop "(WO2 item 1)".
  - `:8` "(§14, PR-04b WO1)" → "(§14.1)".
- [ ] **`compile-bdf.ts` `-b 0` and `-f 1` are unexplained** (`cli/src/core/fonts/compile-bdf.ts:110-121`). The only comment is "WO2 always builds with -b 0 (WORKORDER: …)". That is the sole place a reader learns why bbx mode 0, and the C++ test header (`test_bdf_real_u8g2.cpp:46-55`) proves it matters, because it crops every glyph to its ink box. **Fix:** replace with "`-b 0`: bdfconv's minimal-bbx mode, which crops each glyph to its ink (see `test/test_bdf_real_u8g2.cpp`) and is what U8G2's own shipped fonts use. `-f 1`: <what it selects>". The `-f` meaning was not verified in this review; the worker must read `extern/u8g2/tools/font/bdfconv` before writing it, and must not guess.
- [ ] **`emitFontsUnit` has no step breakdown** (`cli/src/core/generator/emit/fonts.ts:187-233`, about 45 lines with a builtin branch, a compiled branch and a guard). Add `// --- Step 1: Alias each <builtin> ---`, `Step 2: Compile-guard then emit each <bdf>`, replacing the lone `// --- A compiled <bdf> (WO3 item 5) ---` at `:208`. Likewise `compileProjectAssets()` (`compile-project-assets.ts:298-349`): Step 1 fonts, Step 2 images, Step 3 collect into maps and failure sets in declaration order.
- [ ] **A cast whose safety rests on an earlier step has no why-comment** (`compile-project-assets.ts:255`, `image.mode as 'threshold' | 'dither'`). It is safe only because Step 1 (`:232`) already returned for any `mode` outside `CONVERT_MODES`. `globals.ts` deliberately widened `mode` to `string` so the validator could see bad values. Add: "Safe: Step 1 returned for any mode `convertDeclProblems` rejects."
- [ ] **Volatile line number in a header** (`cli/src/core/fonts/bdfconv-output.ts:11-12`, "`bf_WriteU8G2CByFP` … ~line 605"). It goes stale on the next U8G2 bump, which `provenance.test.ts` is designed to surface. Drop "~line 605"; keep the function name and file.
- [ ] **Minor doc defects.**
  - `cli/src/node/load-project.ts:326` `GENERIC_LICENCE_PREFIXES` is documented as "Filenames … taken as licence provenance" but they are lower-case *prefixes*; say so. Also `:283-284` "An `<xbm>`'s, a `<convert>`'s and a `<bdf>`'s `src`." is a sentence fragment; make it a sentence.
  - `cli/src/core/generator/emit/images.ts:90` the banner param list `width, height, byteCount — the produced image's size` is not one parameter.
  - `cli/src/core/generator/emit/images.ts:62-66` `ImageDeclaration.image` has no doc comment, and `fonts.ts:65-67` `FontDeclaration.font` likewise.
  - `cli/src/core/images/xbm.ts:~54` only `WIDTH_DEFINE` has a doc comment; `HEIGHT_DEFINE` beside it does not.
- [ ] **History narration in file headers and public doc comments that carries meaning only for someone holding the work orders.** Rewrite each so the comment stands alone. Do not delete the fact each is carrying (in brackets).

  | File:line | Rewrite |
  |---|---|
  | `cli/src/core/assets/compile-project-assets.ts:7`, "The seam WO1 named and WO3 fills" | Open with why: "`generate()` is synchronous but `compileBdf()` and PNG inflation are not…" (already the next sentence). Delete the WO sentence. `:34-38` "WO3b item 1 moved… guard off of parsing that field" → keep only "`failedFonts` / `failedImages` are the explicit sets the guard uses, so it never parses a presentation field". `:40` "(PR-04b WO4)" delete. |
  | `cli/src/core/fonts/compile-bdf.ts:7-12` | Purpose starts "PR-04b WO2's public API". Say what it is: "The one platform-neutral function that turns a BDF's bytes into a U8G2 font array's bytes." Delete "the `<bdf>` refusal … is gone (WO3 item 4)". `:14` "WO1's finding: one instance serves exactly one conversion" → "one instance serves exactly one conversion (the runtime exits after `main`)". `:18` "WO1 Finding 2" → "bdfconv exits 0 with `Glyphs: 0/0` on a malformed BDF". `:22-27` remove the "PR-04b WO3 item 1 correction / WO2's WORKORDER said `*`" framing, **keep** the `bdf_map.c:174` `*` = 32–255 explanation as a why-comment. `:50, :95-96, :146` likewise. |
  | `cli/src/core/fonts/bdfconv-instance.ts:8-13, 17-18, 49` | Delete "Replaces WO1's `runner.ts`…" and "(WO2 item 1)". Keep why the glue is a static import (a `data:` URL import does not survive CSP or a bundler; that fact is in `build-bdfconv.ts`). `:17-18` "for the same reason WO1 needed it" → "`locateFile` is still required: the glue calls `findWasmBinary()` during init to compute a cache key even when `wasmBinary` is supplied". `:49` "(WO1 finding)" delete. |
  | `cli/src/core/fonts/bdfconv-output.ts:9, :153` | Delete "(PR-04b WO2 item 2)" and "(WO1 Finding 2)". Keep "bdfconv prints the literal `(null)`…". |
  | `cli/src/core/fonts/bdf-range.ts:8-9` | "(PR-3R's lesson: unify, not duplicate) — PR-04b WO2 item 3" → "so there is one definition of a range's meaning." |
  | `cli/src/core/fonts/index.ts:7`, `assets/index.ts:7`, `browser/index.ts:8-12` | "(PR-04b WO2) — the public API WO3 wires into `generate`" etc. State what the barrel is; drop who wires it. |
  | `cli/src/core/generator/emit/fonts.ts:13, 58-59, 77-84, 99, 108, 160, 208` | `:13` "since PR-04b WO3" delete. `:58-59`, `:77`, `:99`, `:108`, `:160`, `:208`: drop "WO3 item 5". `:82` "per the WORKORDER" → "as a precaution: nothing here should depend on the comment style" (the `*/` sanitising). |
  | `cli/src/core/resolver/mangle.ts:281, 289-291` | The reason is good; the framing is history. `:281` drop "(PR-04b WO3 item 5)". `:289` "the PA rejected the latter during WO2→WO3 handoff because…" → "`ui_font_<name>_data` is rejected because it collides with a `<bdf>` legitimately named `<name>_data`: `ui_font_small_data` would be ambiguous between font `small` and font `small_data`." Keep the rest. |
  | `cli/src/core/schema/diagnostic.ts:295-296, 305, 317, 328, 336` | Five new code doc comments each carry "(PR-04b WOn item m)". Delete the parentheticals. These are the public, stable diagnostic-code docs (`typescript.md §4`), so a ticket tag is the wrong audience. |
  | `cli/src/core/generator/emit/index.ts:116, 120`, `unit.ts:78, 85`, `generate.ts:77-78, 88, 194, 243, 329`, `report/budget.ts:99-104, 176, 194`, `node/load-project.ts:87, 101, 284, 331`, `node/cli.ts:781`, `validator/validate-schema.ts:651-652` | Delete each "(PR-04b WO3 item n / WO4)" tag. The sentence beside each already states the reason. |
  | `cli/src/node/build-bdfconv.ts` | See the flag item above. |

- [ ] **History narration in tests** (91 added lines). Same rule; the tests read as a log of the work orders. Rewrite Purpose/Description to state what the test protects, and drop `(PR-04b WOn item m)` from `describe(...)` titles. Test titles show in CI output and are the most-read text a test has.

  | Group | Files:lines |
  |---|---|
  | Titles | `cli/test/generator/emit-fonts.test.ts:72, 267`; `emit-images.test.ts:72`; `integration/generate-bdf.test.ts:101`; `integration/generate-convert.test.ts:111`; `node/load-project-assets.test.ts:70, 91`; `validator/validate-convert.test.ts:45` |
  | Headers | `assets/compile-project-assets.test.ts:7, 14`; `assets/compile-project-images.test.ts:7-8`; `bdfconv/provenance.test.ts:7, 12`; `bdfconv/smoke.test.ts:9, 13, 17, 21`; `fonts/bdf-range.test.ts:7`; `fonts/compile-bdf.test.ts:7, 9`; `fonts/determinism.test.ts:8, 11, 15`; `fonts/parity.test.ts:7, 12, 21`; `fonts/u8g2-oracle.test.ts:7, 24`; `generator/emit-fonts.test.ts:7`; `generator/emit-images.test.ts:7`; `helpers/browser-bundle.ts:7`; `helpers/u8g2-font-reader.ts:9`; `images/*.test.ts` headers; `integration/generate-bdf.test.ts:7, 10`; `integration/generate-convert.test.ts:7`; `node/load-project-assets.test.ts:7`; `validator/bdf-range-diagnostic.test.ts:8`; `validator/validate-convert.test.ts:7`; `generator/refresh-goldens.mjs:17, 20, 57` |
  | Inline | `bdfconv/provenance.test.ts:89`; `bdfconv/smoke.test.ts:64-65`; `fonts/compile-bdf.test.ts:62` (the `it(...)` title cites "WO1 Finding 2"); `generator/determinism.test.ts:50-51`; `generator/emit-editor.test.ts:212-213`; `generator/emit-fonts.test.ts:203`; `generator/generate.test.ts:48-49`; `integration/cli.test.ts:56-57`; `integration/generate.test.ts:173, 372, 466`; `integration/generate-bdf.test.ts:115`; `validator/not-yet-supported.test.ts:114`; `validator/validate.test.ts:75-76` |

  `provenance.test.ts:12` and `smoke.test.ts:9` name "PROJECT.md Finding 4's correctness oracle". State the property instead ("converting the same BDF natively and through wasm must produce identical bytes").
- [ ] **History narration in C++ tests and CMake.** `test/test_bdf_real_u8g2.cpp:12, 29, 36, 199`: "per the WORKORDER", "written for this WORKORDER", "(WO3 item 1)". "per the WORKORDER — never read back from U8G2's own output" holds the actual rule, that metrics are derived from the BDF text, not U8G2's output, because that would be circular. Keep the rule, drop the attribution. `test/CMakeLists.txt:535, 571` "(PR-04b WO3b item 4)" and "item 4's oracle check". `test/test_editor_parity.cpp:107, 113`; `test/test_generated_fixture.cpp:63, 380`: comments like `// bounds: two <bdf> labels since PR-04b WO3b, the <convert> image since WO4 (home has 5)` should say what the 9 objects are and nothing about when they arrived. `test/stubs/U8g2lib.h:64` "PR-04b WO3b". This one is the C++ standard's own file, so a ticket tag is doubly out of place.
- [ ] **`no-ticket-numbers.test.ts` header** (`cli/test/generator/no-ticket-numbers.test.ts:8-9, 16-19`). The Purpose is good ("generated code goes into users' repositories"). But the header itself cites "PR-04b WO4 item 6", "WO3b found three such strings by grep", and a versioning note ("0.9.0 is that bump and is unreleased"). The versioning note is a release decision and will be false as soon as 0.9.0 ships. Move it to the commit message or changelog. Keep one sentence saying why the regex is `\b(WO|PR-)\d`.

### P4 — Optional, only if the architect approves

- [ ] **Shared `byteLines` helper.** `emit/fonts.ts:135-150` and `emit/images.ts:105-119` are near-identical; `fonts.ts`'s own comment admits it follows the other's rule. The two differ in `BYTES_PER_LINE` (16 vs 12) and in the input type (`Uint8Array` vs `readonly number[]`). Extracting one helper in `unit.ts` would touch emitted output only if a width changed, so keep both widths. This is opinion, not a rule; leave as is if the two are expected to diverge.
- [ ] `compile-project-assets.ts:125-131, 147-155` inline the `file/line/column` fallback that `locOf()` (`:164`) exists for and the image diagnostics use. Move `locOf` up and use it for the two font diagnostics too.
- [ ] `compile-bdf.ts:108`, `bdfconv-instance.ts:126`. A local named `module` shadows the CommonJS `module` in Node contexts. Consider `bdfconv`.
- [ ] `bdfconv-output.ts:144` uses `headerMatch[1]!`, where the rest of the module narrows explicitly under `noUncheckedIndexedAccess`.
- [ ] `emit/images.ts:141-143` `if (produced === undefined) continue;` is unreachable, since `imageDeclarations()` only lists images the map holds. A one-line comment saying so is present; a `!` would be tighter. Leave it.

## Verification Requirement

- [ ] Typecheck (`tsc --noEmit` from `cli/`) — zero warnings
- [ ] `vitest run` from `cli/` — all pass, none weakened, golden and determinism tests unchanged
- [ ] C++ build and `ctest` for the touched `test/*.cpp`, `test/CMakeLists.txt`, `test/stubs/U8g2lib.h` — zero warnings, all pass
- [ ] No behavioural change: `git diff` shows only comment lines, header blocks, and `describe`/`it` **title strings**. Titles are the one non-comment edit; confirm no title is referenced by a test filter or CI config first (`grep -rn "PR-04b" .github package.json cli/package.json`).
- [ ] `git diff --stat` on `test/generated_fixture/generated*` and `cli/test/generator/fixtures/**/expected/` is empty.
- [ ] `grep -rnE 'WO[0-9]|PR-04b|Finding [0-9]|WORKORDER|Completion Report' cli/src/core/{fonts,images,assets} cli/src/node/build-bdfconv.ts cli/src/core/generator/emit/{fonts,images}.ts` returns nothing. The other files in scope (budget, load-project, cli, generate, diagnostic, mangle, unit, emit/index) should retain none of the PR-04b tags added by this branch. Pre-existing `PR-04 WOnn` references elsewhere may remain and are not part of this order.

## Issue Surfacing

If you find a defect outside this checklist, surface it in your Completion Report — do not fix it and do not file an issue.

## Review Notes

**Severity counts:** P1 0 · P2 6 · P3 14 (grouped items; most are one-line comment trims) · P4 5

**Method.** Standards loaded first (SKILL.md, `documentation.md`, `typescript.md`). I checked each changed source and test file for SPDX, a `File:` path matching the file (including `images/xbm.ts`, which moved from `emit/`, and correctly says `src/core/images/xbm.ts`), a `Purpose:` and an `Exports:` list, and for banners and step comments. Then I read the key files in full: `compile-bdf`, `bdfconv-*`, `bdf-range`, `png-decode` (structure), `png-to-xbm`, `convert-decl`, `xbm`, `compile-project-assets`, `emit/fonts`, `emit/images`, the `generate.ts` diff, `budget.ts`, `load-project.ts`, `build-bdfconv.ts`, the `cli.ts` diff and the C++ test with its CMake block. Added lines carrying work-order references were found by pattern over the diff (175 hits: 84 in `cli/src`, 91 in tests and C++).

Checked and clean: no `node:` import anywhere under `src/core/`; no `any`; no `enum`; naming follows the TypeScript table (no false C++-scheme reports); every new file has SPDX and a truthful path; determinism is respected (no timestamps, sorted licence lists, declaration-ordered maps).

I did not build or run anything (read-only brief). The `-f 1` question above is therefore unverified.

**What is good (pattern-match against these).**
- `cli/src/core/images/png-decode.ts`: a header that says why it exists (no image library, must run in Node and browser) and states its invariants; step-numbered `decodePng`; a banner on every helper; the `inflate` why-comment about not awaiting the write is exactly the "discovered painfully" kind.
- `cli/src/core/images/png-to-xbm.ts`: the dither rounding rule is stated exactly in the header, with the reason the four shares sum to `e`.
- `cli/src/core/fonts/bdfconv-output.ts`: the "measured relationship" (declared length is literal bytes + implicit NUL) is documented and then verified in code.
- `cli/src/core/images/convert-decl.ts`: one definition, two consumers, and the header says why.
- `emit/fonts.ts` `sanitiseCommentField`: documents the threat (newline ending a `//` comment).

**Observations (the standards are silent).**
1. **Ticket references in comments are a codebase habit, not a PR-04b one.** Untouched code has several hundred (`PR-04 WO8c`, `WO10`, `PR-3R WO8`, in `generate.ts`, `validate-*.ts`, `realise/`, `resolver/`). The standards say nothing for or against. The team already decided that ticket numbers do not belong in *generated output* (`no-ticket-numbers.test.ts`); the same argument (audience is a future reader, the tickets live under `.agents/`) applies to comments. I ranked the PR-04b additions P3/P4 on the strength of `documentation.md` §1's "could a reviewer who has never seen this codebase say what the module is for" test and the stale-doc rule, not because a rule forbids the tag. **Recommendation:** either add a sentence to `documentation.md` ("cite decisions `[D-n]`/`§n`, not work orders") and sweep the older code in a separate order, or accept the habit and downgrade the history-narration items in this order to P4. I have left that call with the architect.
2. **Path confinement uses `resolve()`, not `realpath`** (`load-project.ts:276`, `isInsideProject`). A symlink inside the project pointing outside it passes the "inside project" check, though the comment cites [D-11] and §13.10's write boundary. This is a behaviour question, not readability, so I have not made a work item. Worth a decision.
3. **`GENERIC_LICENCE_PREFIXES` includes `'ofl'` as a bare prefix** (`load-project.ts:327`), so a file named `oflow.txt` beside a BDF would be listed as licence provenance in generated comments. Cosmetic and low-risk; noting for the owner.
4. **`budget.ts` header still says "Any flash figure" is unmeasured** (`:22-27` region) while `flashLines` now returns measured figures for image and compiled-font arrays. It was already partly inconsistent for `<xbm>` before this branch. A one-line correction is worth making when `budget.ts` is next opened.

**Files reviewed:** all source and test files in the diff under `cli/src/**`, `cli/test/**`, `test/*.cpp`, `test/CMakeLists.txt`, `test/stubs/U8g2lib.h`, `test/generated_fixture/{globals.xml,screens/screen_bounds.xml}` (skimmed). Test files were checked for headers and history narration by pattern and sampled for content, not read line by line.

## Completion Report

<!-- Written by the remediation worker at task completion -->
