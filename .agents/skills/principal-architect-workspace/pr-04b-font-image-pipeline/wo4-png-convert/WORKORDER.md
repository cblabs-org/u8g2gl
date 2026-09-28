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
`/Users/mcneillm/Documents/Projects/U8G2GL-04b`. Work only there.

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

```markdown
---
## Completion Report

### Status
complete | partial | blocked

### Changes Made
- `path` — what changed and why

### The image model
<!-- The asset step's final signature; how the emitter, budget and editor read images. -->

### Measurements
- Decoder coverage (colour types x depths, filters):
- Built-CLI budget and emitted comments:
- Suite counts (C++, CLI), warnings:

### Decisions Made
- Including the dither rounding rule, stated exactly.

### Dead Ends & Warnings
- What was attempted, why it failed, what to avoid

### Out-of-Scope Findings
- Finding and suggested action

### Blockers
(none)
```
