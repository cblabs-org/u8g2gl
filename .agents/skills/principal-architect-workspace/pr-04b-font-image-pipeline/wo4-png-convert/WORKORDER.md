---
name: pr-04b-font-image-pipeline-wo4
description: Handoff instructions for Work Order 4 — <convert>, PNG to XBM
complexity: standard
---

# WO4 — `<convert>`: PNG to XBM

**Parent project:** PR-04b, the font and image pipeline —
[PROJECT.md](../PROJECT.md). The owner's approval of this decomposition is
recorded verbatim in that file under *Human approval of this decomposition*.

**Branch:** `u8g2gl-fonts/wo4-png-convert` (already created, base
`u8g2gl-fonts/wo3b-bdf-fixture`). **Working tree:**
`.`. Work only there.

## Role Definition

You are an expert senior software engineer and execution-focused worker agent.
You are NOT the Principal Architect. Do not make high-level architectural
decisions, do not create branches, and do not plan beyond this checklist.

**You commit on a green build and you never ask permission mid-flight.** Nobody
can answer you while you run; a question strands your work uncommitted. Where
this WORKORDER leaves a choice to you, make it and record it under *Decisions
Made*. If something genuinely blocks you, commit what is green, write the
Completion Report with status `partial` or `blocked`, and stop.

## Objective

`u8g2gl generate` accepts `<convert>`: it decodes a PNG, turns it into 1-bit
XBM bytes by `threshold` or `dither` (§14.2), and emits it exactly as an
`<xbm>` is emitted. **Every image, `<xbm>` or `<convert>`, reaches the emitter,
the budget and the editor target through one image model**, produced by the
async asset step WO3 built. No new dependency, no schema change.

## Read first

- [PROJECT.md](../PROJECT.md) — *Design decisions* (the size-mismatch and
  polarity rules below are recorded there) and the Session Log.
- WO3's and WO3b's Completion Reports:
  [../wo3-bdf-generate/WORKORDER.md](../wo3-bdf-generate/WORKORDER.md),
  [../wo3b-bdf-fixture/WORKORDER.md](../wo3b-bdf-fixture/WORKORDER.md).
- design_spec §14.2; `cli/src/core/generator/emit/images.ts`, `emit/xbm.ts`,
  `cli/src/core/assets/compile-project-assets.ts`,
  `cli/src/core/generator/report/budget.ts` (`imageDataBytes`),
  `cli/src/core/parser/parse-globals.ts` (`parseImages`).
- The PNG specification (W3C, *PNG Third Edition*) for chunk layout, filter
  types and colour types — decode from the spec, not from memory.

## The rules — prescribed by the PA

1. **Size.** The PNG's own width and height must equal the declared `width`
   and `height`. A mismatch is an error at the declaration naming both sizes
   ("`logo` declares 32x32 but `assets/logo.png` is 48x40; resize the PNG").
   No resampling. (Resampling is additive later; picking a filter now is
   design by anticipation — §1.5. This is with the CA as a question.)
2. **Colour to grey**, integer arithmetic only:
   - Alpha is composited over **white**: `c' = (c·a + 255·(255 − a) + 127) / 255`
     (integer division), per channel, before anything else.
   - Luminance, Rec. 601: `Y = (299·R + 587·G + 114·B + 500) / 1000`
     (integer division). Greyscale inputs use their grey value directly.
   - 16-bit channels use their high byte. Palette images go through `PLTE`
     and `tRNS`. Sub-8-bit greyscale is scaled to 0..255 exactly
     (`v · 255 / (2^depth − 1)`).
3. **Polarity.** A pixel with `Y < threshold` **sets** its XBM bit (drawn in
   the foreground colour); otherwise the bit is clear. So dark-on-transparent
   icon art draws the shape. `threshold` defaults to **128** when absent.
4. **Dither.** `mode="dither"` is Floyd–Steinberg, left to right, top to
   bottom (no serpentine), over integer error: quantise with the same
   `Y < threshold` rule (set → 0, clear → 255), error `e = Y_adjusted − q`,
   distribute `7e/16`, `3e/16`, `5e/16`, `1e/16` using **one** integer rounding
   rule you choose and document (e.g. `Math.trunc`, or distribute remainders
   so the four parts sum to `e`). Clamp the adjusted value to 0..255 before
   quantising. Determinism, not beauty, is the requirement.
5. **XBM packing** exactly as `parseXbm` returns it: rows of `ceil(width/8)`
   bytes, least-significant bit leftmost.
6. **Refused inputs**, each a clear error at the declaration: not a PNG
   (bad signature), a failed CRC or truncated chunk, an unknown critical
   chunk, **Adam7 interlacing** (say "save it non-interlaced"), and zero
   size. Ancillary chunks are ignored.

## Strict Boundary Box

**In scope:**
- `cli/src/core/images/` — new: the PNG decoder and the PNG→XBM conversion.
  Name per the standards skill.
- `cli/src/core/assets/**` — the asset step produces images for **both**
  kinds (item 3).
- `cli/src/core/generator/**` — `images.ts`, `xbm.ts` (move or reuse, don't
  duplicate), `generate.ts`, `budget.ts`, `unit.ts`, `scene.ts` and other
  emitters as items 3–6 need, and the three ticket-number leaks in item 6.
- `cli/src/core/validator/**` — validate `<convert>`'s existing attributes
  (item 2); remove the `<convert>` refusal (item 4).
- `cli/src/core/parser/parse-globals.ts` — only to stop casting an unchecked
  `mode` string to the union; the validator reports bad values.
- `cli/src/core/schema/diagnostic.ts` — new codes only if none fits.
- `cli/src/node/load-project.ts`, `cli/src/node/cli.ts`,
  `cli/src/node/format-budget.ts` — as needed.
- `cli/src/core/index.ts`, `cli/src/browser/index.ts` — exports.
- `cli/test/**`, `test/generated_fixture/**` (a `<convert>` image, used on a
  screen, and regenerated goldens), `test/test_*.cpp` and
  `test/CMakeLists.txt` only if the fixture change needs it.
- This WORKORDER's Completion Report.

**Explicitly out of scope:**
- **Any new npm dependency.** Decompress with the platform's
  `DecompressionStream('deflate')`, which Node (≥ 18) and browsers both
  provide as a global; the asset step is already async. If you find it
  genuinely cannot work, stop and report rather than adding a package.
- The C++ runtime, root `CMakeLists.txt`, `extern/**`, `docs/**`, `LICENSE`,
  `THIRD-PARTY-NOTICES.md`, `.agents/**` except this file.
- `cli/src/core/fonts/**`, `cli/src/data/**`.
- The schema: no new attribute or value. CLI version stays **0.9.0** (it is
  unreleased; this is part of the same change).

## Tooling Constraints

- CLI, from `cli/`: `npm test`, `npm run lint`, `npm run build`.
- C++, when the fixture changes: build into `tmp/` or `build/`, `ctest`,
  zero warnings. Baseline C++ **382** (one known skip), CLI **1161**. Run the
  two suites **one after the other**.
- Tests may build PNGs with `node:zlib` (test code is not `src/core/`). The
  committed fixture PNG is produced by a small script you commit under
  `cli/test/` so it can be regenerated, and it must be byte-stable.
- Scratch files in `tmp/` at the repo root — never `/tmp`.
- Load the **`u8g2gl-standards`** skill before writing code.

## Line-Item Instructions

- [ ] **1. PNG decode and convert** in `src/core/images/`: a decoder covering
  colour types 0, 2, 3, 4, 6 at every bit depth the spec allows for each,
  all five filter types, multiple `IDAT` chunks, and CRC checking; then the
  conversion in *The rules*. Async only where decompression forces it. Pure:
  bytes in, `XbmImage` or a failure reason out, never a throw for a defect in
  the author's file.

- [ ] **2. Validate what the schema already has.** `<convert>`'s `mode` must
  be `threshold` or `dither`; `threshold` an integer 0..255; `width` and
  `height` positive integers. Report at the attribute with an existing code
  if one fits (`INVALID_ENUM_VALUE` looks right for `mode`). `u8g2gl
  validate` reports these without converting anything.

- [ ] **3. One image model.** Extend `compileProjectAssets` so it returns
  every image — `<xbm>` parsed by the existing `parseXbm`, `<convert>`
  converted — as one `ReadonlyMap<string, XbmImage>` plus an explicit
  `failedImages` set (the pattern WO3b gave fonts). The images emitter, the
  budget and the editor target read **only** that map. Move the `<xbm>`
  missing-file and malformed-file diagnostics into the step without changing
  their codes, text or locations — the existing `<xbm>` tests must pass
  unchanged in substance. `generate`'s guard covers images as it covers
  fonts.

- [ ] **4. Emission and refusal.** Remove the `<convert>` refusal and its
  deferred-comment block. A converted image is emitted like an `<xbm>`, with a
  provenance comment: project-relative source, declared size, mode and
  effective threshold, byte count. Budget: images are measured, as now,
  including converted ones; rename the line if "xbm arrays" becomes
  misleading. Grep `cli/src` for any remaining `<convert>` "not yet
  supported" / "PR-04b" text and fix it.

- [ ] **5. Tests.**
  - Decoder: every colour type × bit depth, every filter type, palette with
    and without `tRNS`, multiple `IDAT`s, each refused input in *The rules*.
  - Conversion: the formulas, pinned with hand-computed cases in comments —
    alpha compositing, a pixel exactly at `threshold` (clear), `threshold`
    default, a width not a multiple of 8, a dither case small enough to
    verify by hand.
  - Size mismatch message.
  - **Parity**: bundle the conversion for the browser as WO2's
    `cli/test/fonts/parity.test.ts` does and run it in a bare `vm` context
    (add `DecompressionStream` and what it needs, which browsers have);
    identical bytes to Node. Reuse WO2's harness by moving it to a test
    helper, don't copy it.
  - **Determinism**: two child-process runs of the built CLI with different
    cwd and `TZ` produce identical trees for a project using `<convert>`.
  - The fixture: a `<convert>` in `test/generated_fixture/` drawn on a
    screen; goldens regenerated and reviewed; C++ suite green.

- [ ] **6. No ticket numbers in generated code — fixed and guarded.** WO3b
  found three emitted strings that put internal ticket numbers into users'
  generated files: `images.ts:179` (`PR-04b`, removed by item 4 anyway),
  `generated-config.ts:150` (`WO4 F5`), `screen.ts:569` (`PR-09`). Reword the
  remaining two so they say what the user needs without the ticket. Then add a
  test that generates the committed fixture (both targets) and fails if any
  output file matches `/\b(WO|PR-)\d/`, so this class of defect breaks the
  build instead of waiting for a grep. This changes output for unchanged
  input, which rules/03 requires a generator version bump for; 0.9.0 is that
  bump, unreleased, so no further bump — say so in the commit message.

- [ ] **7. End to end, and report it.** Built CLI on a scratch project in
  `tmp/` with one threshold and one dither `<convert>`; paste the budget and
  the generated comment for each into the report.

## Verification Requirement

Before each commit: `npm test`, `npm run lint`, `npm run build` from `cli/`;
for commits touching the fixture or C++, the C++ build and `ctest` too, zero
warnings. Report final counts for both suites.

**Branch hygiene (rule 04):** run `git branch --show-current` **as its own
command** immediately before every commit and confirm it prints
`u8g2gl-fonts/wo4-png-convert`. Do not push. Commit style `feat(cli): …`,
`test: …`, `fix(cli): …`; end each message with a `Co-Authored-By:` line
naming the model you actually are, with `<noreply@anthropic.com>`.

Commit on green without asking. When done, append the Completion Report and
commit it as `docs(workspace): WO4 Completion Report`.

## Issue Surfacing

A defect, upstream bug or concern *outside your boundary box* goes in the
Completion Report under *Out-of-Scope Findings*. Do not file issues and do not
fix it.

---

## Completion Report (written by the worker at task completion)

---
## Completion Report

### Status
complete

### Changes Made
- `cli/src/core/images/png-decode.ts` (new) - PNG decoder from the W3C spec: signature, chunk walk with CRC on every chunk, IHDR validation (colour type x depth table), PLTE/tRNS (palette alpha; grey and RGB colour keys compared at native depth), multi-IDAT, inflate through the global `DecompressionStream('deflate')` (written without awaiting the write side, no `Blob`, so the browser sandbox needs only that one global; output capped at the size the header implies), all five filters, expansion to RGBA8. Refuses, as reasons and never throws: bad signature, CRC failure, truncation/missing IEND, unknown critical chunk, Adam7 ("save it non-interlaced"), zero size, bad depth for type, short/long/corrupt data, unknown filter type, palette index out of range.
- `cli/src/core/images/png-to-xbm.ts` (new) - `rgbaToXbm` (alpha over white, Rec. 601, `Y < threshold` sets, default 128, Floyd-Steinberg) and `convertPng` (decode then convert, at the PNG's own size).
- `cli/src/core/images/convert-decl.ts` (new) - the one definition of a well-formed `<convert>` (`mode`, `threshold`, `width`, `height`), shared by the validator and the asset step so they cannot disagree.
- `cli/src/core/images/xbm.ts` - moved from `generator/emit/xbm.ts` (git mv, not duplicated); `XbmImage` is now the one image model. `cli/src/core/images/index.ts` (new) barrel; exported from `core/index.ts` and `browser/index.ts`.
- `cli/src/core/assets/compile-project-assets.ts` - produces every image (both kinds), see the image model below. `<xbm>` missing/malformed diagnostics moved here with the same codes, text and locations.
- `cli/src/core/generator/generate.ts`, `emit/index.ts`, `emit/unit.ts`, `emit/images.ts`, `report/budget.ts` - `assets` removed from `GenerateInput`, `ProjectEmissionInput`, `ProjectEmitInput` and `ReportInput`, replaced by `images`; the guard covers images (`U8G2GL_MISSING_COMPILED_IMAGE`); the `<convert>` refusal/deferred-comment block is gone; a converted image is emitted like an `<xbm>` with a provenance comment. The budget line is renamed `image data (bitmap arrays)`.
- `cli/src/core/validator/validate-schema.ts` - validates `<convert>` (INVALID_ENUM_VALUE for `mode`, TYPE_MISMATCH for threshold/size), no file access. `validate-not-yet-supported.ts` - `<convert>` entry removed. `parser/parse-globals.ts` and `schema/globals.ts` - `mode` is now the string as written instead of a cast to the union (`globals.ts` is one line outside the box's literal list but is the type parse-globals must satisfy; see Decisions).
- `cli/src/core/schema/diagnostic.ts` - two new codes, `U8G2GL_IMAGE_CONVERT_FAILED` and `U8G2GL_MISSING_COMPILED_IMAGE` (no existing code fit: the BDF ones are font-specific).
- `cli/src/node/cli.ts`, `load-project.ts` - reads `<convert>` sources; the CLI passes `compiledAssets` to the report and the editor target.
- Item 6: `emit/generated-config.ts` ("WO4 F5" removed) and `emit/screen.ts` ("PR-09" removed); the third (`images.ts`) went with the refusal block. `cli/test/generator/no-ticket-numbers.test.ts` generates the committed fixture for both targets and fails on `/\b(WO|PR-)\d/` with file and line.
- Tests: `test/images/{png-decode,png-to-xbm,parity,fixture-logo}.test.ts`, `test/assets/compile-project-images.test.ts`, `test/validator/validate-convert.test.ts`, `test/generator/emit-images.test.ts`, `test/integration/generate-convert.test.ts`, helpers `png-builder.ts` (independent PNG writer), `browser-bundle.ts` (WO2's harness moved out of `test/fonts/parity.test.ts`, which now uses it), `compiled-assets.ts`, `fixture-logo.ts`; existing tests updated for the new API and the removed refusal (`not-yet-supported`, `generate`, `budget-report`, `emit-*`, `refresh-goldens.mjs`).
- Fixture: `test/generated_fixture/globals.xml` + `screens/screen_bounds.xml` (a dithered `<convert>` drawn on the bounds screen), `assets/logo_mark.png` (produced by `cli/test/fixtures/make-fixture-logo.ts`, zlib level 0 so it is byte-stable; a test pins it), goldens regenerated and reviewed, `test/test_editor_parity.cpp` (`provide_image("logo_mark", ...)`), `test/test_generated_fixture.cpp` (busiest-screen count 8 to 9, one new test that the logo reaches `drawXBMP`). `cli/test/integration/fixtures/valid-project/images/wifi.xbm` added (see Decisions).
- Commit `aee1a57` on `u8g2gl-fonts/wo4-png-convert`.

### The image model
```ts
compileProjectAssets(input: { globals: Globals; assets: ReadonlyMap<string, Uint8Array> }): Promise<{
  fonts: ReadonlyMap<string, CompiledFont>;
  images: ReadonlyMap<string, XbmImage>;   // <xbm> parsed + <convert> converted, declaration order
  diagnostics: readonly Diagnostic[];      // fonts first, then images, each in declaration order
  failedFonts: ReadonlySet<string>;
  failedImages: ReadonlySet<string>;       // every image declaration that produced nothing
}>
```
`generate({ ..., compiledAssets })` takes images from `compiledAssets.images` and passes them to emission as `ProjectEmitInput.images`; `buildGenerateReport({ ..., images })` and the editor target (`emitEditorFiles({ ..., images })`, scene image names) read the same map, so nothing measures or emits from the raw bytes any more. `generate()`'s guard emits `U8G2GL_MISSING_COMPILED_IMAGE` for a declared image that is neither in `images` nor in `failedImages`.

### Measurements
- Decoder coverage: every colour type at every allowed depth (0: 1/2/4/8/16, 2: 8/16, 3: 1/2/4/8, 4: 8/16, 6: 8/16), width 5 so sub-byte depths end mid-byte; all five filters at 1, 2, 3 and 4 bytes per pixel and mixed per row; palette with and without tRNS; grey and RGB colour keys; 3 IDATs; each refused input in *The rules*, plus bad depth, bad header sizes, non-zlib data, unknown filter, bad palette index. 48 decoder tests, 20 conversion tests.
- Built-CLI end to end (scratch project in `tmp/`, one threshold and one dither `<convert>`, the fixture logo at 16x16):
  - Budget: `image data (bitmap arrays) (2)   64 bytes` (derivable flash 64 bytes).
  - `// mark_hard: converted from assets/logo_mark.png, 16x16, mode threshold, threshold 100, 32 bytes.`
  - `// mark_soft: converted from assets/logo_mark.png, 16x16, mode dither, threshold 128, 32 bytes.`
- Parity: 7 conversion cases (every colour family, both modes, several IDATs) and 3 refusals give identical bytes / reasons in Node and in a bare `vm` context holding only `DecompressionStream` and `console`.
- Suite counts: **CLI 1265** (baseline 1161, +104), lint (`eslint` + `tsc -p tsconfig.test.json`) and `npm run build` clean. **C++ 383** (baseline 382, +1), one known skip (`SizeOfReport.ThirtyTwoBitTarget`), **zero warnings**. The suites were run one after the other.

### Decisions Made
- **Dither rounding rule (exact).** Pixel value `v` = grey plus accumulated error, clamped to 0..255; `q = 0` if `v < threshold` else `255` (`q = 0` sets the bit); `e = v - q`. Right, below-left and below neighbours receive `Math.trunc(7e/16)`, `Math.trunc(3e/16)`, `Math.trunc(5e/16)` (toward zero); the below-right neighbour receives the remainder `e - (the three)`, so the four shares sum to `e` exactly and error is conserved. Error falling outside the image is dropped. The 2x2 mid-grey case is worked by hand in `png-to-xbm.test.ts` (result rows `0b10`, `0b01`).
- **Size check location.** `convertPng()` converts at the PNG's own size (it has no declaration to name); `compileProjectAssets()` compares to the declared size and produces "Image 'logo' declares 32x32 but 'assets/logo.png' is 48x40; resize the PNG." with `U8G2GL_IMAGE_CONVERT_FAILED`. The decode/convert work is done before the check; negligible for icon-sized art.
- **A `<convert>` the validator rejects** (bad mode/threshold/size) is not converted and adds no diagnostic in the asset step, but is put in `failedImages`, so each defect is reported once (by `validate`, from the same `convertDeclProblems()`), and the guard does not add an internal-error diagnostic on top.
- **`ConvertImageDecl.mode` is now `string`**, not the union, in `schema/globals.ts` (one line beyond the box's literal list): the parser can no longer cast an unchecked value to a union it is not, and the validator reports bad values. The schema vocabulary is unchanged.
- **Grey/colour keys.** Greyscale and RGB `tRNS` colour keys are honoured (compared at native depth); `tRNS` on types 4 and 6 is ignored. Palette `tRNS` longer than the palette is refused.
- **Nonstandard PNG leniency.** Bytes after IEND are ignored; PLTE on types 0/4 is ignored; IDAT contiguity is not enforced. Decoder output is capped at 64 MiB.
- **New codes rather than reuse**, as above. `U8G2GL_INVALID_ENUM_VALUE` for `mode` as the WORKORDER suggested; `U8G2GL_TYPE_MISMATCH` for threshold and size (the code the parser already uses for non-integer values).
- **Budget line renamed** to `image data (bitmap arrays)`; this is a `--json` field value, so a consumer matching the old string must update (0.9.0 is unreleased).
- **`assets` removed** from `GenerateInput`/emit/report inputs rather than left as dead data; the host still reads bytes and passes them to `compileProjectAssets()`.
- **Existing `valid-project` integration fixture** referenced `images/wifi.xbm` but never shipped it: it only worked because a validation error stopped generation before emission read the file. The asset step now reads it first, as it already did for a missing `<bdf>`, so the missing file surfaced. I added the file (an 8x8 XBM) rather than change the tests' meaning; a missing asset is now reported together with other errors, which is the better behaviour.
- **Fixture PNG stored at zlib level 0**, because a compressed stream's bytes depend on the zlib version and the file must be byte-stable; the decoder's compressed path is exercised by the unit tests (`node:zlib` default level).
- **Attribution.** Commit ends `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`, the model actually running.

### Dead Ends & Warnings
- The first `crcOf` helper in `png-decode.test.ts` sliced the IHDR wrongly (offsets: signature 8, length+type 8, data at [16,29), CRC at [29,33)), so every "patched header" test failed on the CRC check instead of the header rule; the tests now use `refreshIhdrCrc`. If a header-patching test reports "fails its CRC check", suspect the helper before the decoder.
- `describe` bodies cannot `await`: `emit-golden.test.ts` and `budget-report.test.ts` now generate at module level with top-level `await`.
- macOS `sed -i` takes the next argument as a backup suffix; use `sed -i ''`.
- Do not "fix" a fixture-PNG diff by regenerating with compression: the byte-stability test pins level 0.

### Out-of-Scope Findings
- `docs/implementation_plan.md:276` still describes PR-04b as future work ("Split out of PR-04, which refuses both with a named error"); `docs/design_spec.md` section 14.2 and section 18 (the budget line name, the `<convert>` size and polarity rules recorded in PROJECT.md) should be updated to say what shipped. `docs/` was outside my box. Suggest a docs work order in this PR.
- PROJECT.md's rule that size mismatch is an error and resampling is additive later is now implemented; the schema question for the CA (whether `<convert>` should ever resample) remains open as the WORKORDER said.

### Blockers
(none)
