---
name: pr-04b-font-image-pipeline-wo2
description: Handoff instructions for Work Order 2 — the font compiler in src/core/
complexity: standard
---

# WO2 — the font compiler in `src/core/`

**Parent project:** PR-04b, the font and image pipeline —
[PROJECT.md](../PROJECT.md). The owner's approval of this decomposition is
recorded verbatim in that file under *Human approval of this decomposition*.

**Branch:** `u8g2gl-fonts/wo2-font-compiler` (already created, base
`u8g2gl-fonts/wo1-bdfconv-wasm`). **Working tree:**
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

One asynchronous, platform-neutral function in `src/core/` that turns a BDF
file's bytes into a U8G2 font array's bytes, using WO1's Wasm bdfconv, and that
behaves **identically** in Node and in a browser. Pin its correctness against
U8G2's own shipped font arrays, and prove it deterministic.

It is not wired into `generate` here — that is WO3. The `<bdf>` refusal stays.

## Read first

- [PROJECT.md](../PROJECT.md) — *Findings*, *Design decisions*, and the Session
  Log entry *WO1 ingested*.
- WO1's Completion Report: [../wo1-bdfconv-wasm/WORKORDER.md](../wo1-bdfconv-wasm/WORKORDER.md),
  especially *Dead Ends & Warnings*.
- `cli/src/data/bdfconv/runner.ts` — WO1's test-only loader, which this WO
  replaces.
- `extern/u8g2/tools/font/bdfconv/bdf_map.c` lines 1–24 — the `-m` grammar.
- `extern/u8g2/tools/font/build/build.c` — how U8G2 builds its own fonts: the
  table rows (e.g. line 277, `4x6`) and the map strings behind `MM_R`, `MM_F`,
  `MM_N`.

## Strict Boundary Box

**In scope — create or modify only these:**
- `cli/src/core/fonts/` — new directory: the compiler, the range translator,
  the bdfconv output parser. (If the standards skill prefers a different name
  for the directory, follow it and say so.)
- `cli/src/core/index.ts`, `cli/src/browser/index.ts` — export the compiler.
- `cli/src/data/bdfconv/**` and `cli/src/node/build-bdfconv.ts` — **only** to
  change how the glue is delivered (item 1). The Wasm bytes, the flags and
  the U8G2 commit must not change: if `bdfconv-source.json`'s `wasm.sha256`
  changes, you changed something you should not have.
- `cli/test/bdfconv/**` — update for item 1.
- `cli/src/core/validator/` — **only** a grammar check for `<bdf range>`
  (item 3), in whichever pass already checks `<bdf>` attributes
  (`validate-schema.ts:639` checks `src`).
- `cli/src/core/schema/diagnostic.ts` — a new diagnostic code only if no
  existing one fits; say why.
- `cli/eslint.config.js`, `cli/tsconfig*.json`, `cli/package.json` — only as
  item 1 needs. No new runtime dependency. Version stays 0.8.0.
- `cli/test/fonts/` — new tests.
- This WORKORDER's Completion Report.

**Explicitly out of scope — do not touch:**
- `validate-not-yet-supported.ts` (the refusal stays until WO3), the generator
  (`src/core/generator/**`), `src/node/load-project.ts`, `src/node/cli.ts`, the
  budget.
- `extern/u8g2/**` — read-only.
- The C++ runtime, `CMakeLists.txt`, `docs/**`, `LICENSE`,
  `THIRD-PARTY-NOTICES.md`, anything under `.agents/` except this file.
- Any schema vocabulary: no new attribute, element or manifest field.
  Validating the existing `range` attribute is not new vocabulary.

## Tooling Constraints

- CLI, from `cli/`: `npm test`, `npm run lint`, `npm run build`. All green
  before every commit.
- Emscripten 5.0.3 is at
  `/Users/mcneillm/Documents/Projects/departures-board/tools/layoutsim/emsdk`
  (read-only) if item 1 needs a rebuild. Download no toolchain.
- `esbuild` is already in `cli/node_modules` (through Vite). Use it for the
  parity test; do not add it to `package.json`.
- Scratch files go in `tmp/` at the repo root — never `/tmp`.
- Load the **`u8g2gl-standards`** skill before writing code.

## Line-Item Instructions

- [ ] **1. The glue becomes a real module.** WO1 loads the Emscripten glue by
  `import()` of a `data:` URL built at run time. A browser whose
  Content-Security-Policy omits `data:` from `script-src` refuses that, and no
  bundler can see through it. Change `build-bdfconv.ts` so the glue is emitted
  as a module that `src/core/` imports **statically** and `tsc` puts in
  `dist/` — for example a generated `.ts` file with a `// @ts-nocheck` and
  `/* eslint-disable */` header, or `.js` plus a `.d.ts` if you enable what
  that needs. Keep the Wasm bytes embedded (no `fetch`, no `fs`). Keep
  `locateFile` (WO1's finding). Regenerate, update `bdfconv-source.json`'s
  artefact hashes and the provenance test, delete `runner.ts` once nothing
  uses it, and re-verify `npm pack` → install into `tmp/` → convert, as WO1 did.
  **No `eval`, `new Function` or `data:`/`blob:` import anywhere.**

- [ ] **2. `compileBdf`** — the compiler. Shape (adjust names to the standards,
  keep the substance):
  ```ts
  compileBdf(input: {
    bdf: Uint8Array;        // the file's bytes; the host reads them
    identifier: string;     // e.g. 'ui_font_small_9' — passed to bdfconv -n
    range?: string;         // the <bdf range> attribute, untranslated
  }): Promise<CompiledFont | FontCompileFailure>
  ```
  - One fresh module instance per call (WO1: an instance serves one
    conversion). Invoke `-b 0 -f 1 -m <map> -n <identifier> -o /out.c /in.bdf`;
    with no `range`, the map is `*` (bdfconv's own default, `main.c:345`).
  - `CompiledFont` carries at least: the **array bytes** (`Uint8Array`, exactly
    the bytes of the C array, of exactly the declared length); the glyph counts
    bdfconv reports (`Glyphs: n/m`); and the BDF's `FONT` name and `COPYRIGHT`
    value **read from the BDF itself**, absent when absent — never the string
    `(null)` (Finding 2).
  - **Parse bdfconv's C output for the array and nothing else.** Handle the
    whole C string-literal grammar bdfconv can write: adjacent literal
    concatenation, octal escapes (`\376`, and one-digit ones like `\0`), `\"`,
    `\\`, and any other escape bdfconv emits (read its writer, `bdf_font.c`
    near line 585, to know which). **Measure** how the declared length `[N]`
    relates to the literal's length (the terminating NUL) and make the
    returned bytes equal what a C compiler would place in the array. Say what
    you measured.
  - `FontCompileFailure` carries a human-readable reason and bdfconv's stderr
    lines. It is returned, never thrown, for any defect in the author's input.
    These are failures:
    - bdfconv exits non-zero or throws;
    - **zero glyphs emitted** — WO1 found a malformed BDF exits 0 with
      `Glyphs: 0/0`; a `range` matching nothing in the font does the same, and
      the reason should say which it was when you can tell (total > 0 means the
      range selected nothing);
    - the output cannot be parsed.
  - Concurrent calls must be safe (separate instances). Test it.

- [ ] **3. `range` — translate and validate.** One module owns the grammar and
  both the validator and `compileBdf` use it, so they cannot disagree (PR-3R's
  lesson: unify, don't duplicate). Accept a comma-separated list of codepoints
  and inclusive `lo-hi` ranges, each number hex with a `0x`/`0X` prefix or
  decimal, whitespace around items tolerated. Translate to bdfconv's grammar
  (hex is `$20` there, not `0x20`). **Reject** everything else with a reason
  naming the offending item — including bdfconv's own `*`, `~`, `>`, `$`
  syntax, an empty item, `lo > hi`, and numbers beyond what bdfconv's map
  parser accepts (read `bdf_map.c` for its limit, and state it). Wire the check
  into the validator so `u8g2gl validate` reports a bad `range` against the
  declaration's location, with a diagnostic code that fits. Test both the
  translator and the diagnostic.

- [ ] **4. The oracle test — `cli/test/fonts/u8g2-oracle.test.ts`.** For at
  least four U8G2 fonts, convert the BDF from `extern/u8g2/tools/font/bdf/`
  (read in place, never copied) with the map U8G2's `build.c` uses for that
  variant, translated back into *our* `range` grammar where it can be
  expressed, and assert byte equality with the array of the same name in
  `extern/u8g2/csrc/u8g2_fonts.c`. Cover at least: `u8g2_font_4x6_tr` (723
  bytes, PA-measured), one `_tf`, one `_tn`, and one from a different font
  family. Only `_t*` variants — we always build with `-b 0`. Assert the
  **declared lengths** match as well as the bytes. The expected side must not
  be parsed by the same function as the actual side: write the test's own
  small reader for `u8g2_fonts.c`, so one shared bug cannot cancel out.
  The test's point is that a U8G2 submodule bump which changes the converter
  fails the build — say so in its header.

- [ ] **5. The parity test — `cli/test/fonts/parity.test.ts`.** Bundle the
  public compiler entry with esbuild `platform: 'browser'`, `format: 'esm'`;
  **the bundle step must fail if anything pulls in a Node builtin** (don't
  mark them external). Run the bundle in a `node:vm` context that has only
  what a browser has and this code needs (`WebAssembly`, `TextEncoder`,
  `TextDecoder`, `atob`, `btoa`, `console`, `URL`, …) — **no `require`,
  `process`, `Buffer`, or `global`**. For several fonts, and one failing
  input, compare the vm result with a direct Node call: identical bytes,
  identical glyph counts, identical failure reasons. If the vm context needs a
  global that browsers lack, that is a defect: fix the code, don't add the
  global.

- [ ] **6. The determinism test — `cli/test/fonts/determinism.test.ts`.**
  Compile the same fonts in two child processes that differ in working
  directory, `TZ` (e.g. `UTC` and `Pacific/Chatham`), `TMPDIR`, and `LANG`;
  the sha256 of every output is identical. Also assert nothing in a compiled
  result contains the absolute path of the repository or the input file.

- [ ] **7. Measure and report:** conversion time for `4x6.bdf` and for
  `unifont.bdf` with and without a `range` (instance creation included); the
  byte size of a compiled `range="0x20-0x7F"` font for three sizes of BDF;
  whether any BDF under `extern/u8g2/tools/font/bdf/` that U8G2 itself builds
  with `-b 0` fails to compile through `compileBdf` (a sweep, not a permanent
  test — run it, report counts, note failures).

## Verification Requirement

Before each commit: `npm test`, `npm run lint`, `npm run build` all green from
`cli/`. Every one of the current 1097 CLI tests still passes, plus yours.
Report final counts.

**Branch hygiene (rule 04):** run `git branch --show-current` **as its own
command** immediately before every commit and confirm it prints
`u8g2gl-fonts/wo2-font-compiler`. Do not push. Commit style
`feat(cli): …`, `test(cli): …`; every message ends with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Commit on green without asking. When done, append the Completion Report and
commit it as `docs(workspace): WO2 Completion Report`.

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

### The API WO3 will call
<!-- Exact exported names, signatures and import paths. WO3's WORKORDER is written from this. -->

### Measurements
- Declared length vs literal length:
- Oracle fonts and byte counts:
- Timings:
- Sweep of U8G2's -b 0 BDFs:
- Glue-delivery change: old vs new artefact hashes; wasm sha256 unchanged?

### Decisions Made
- Decision and rationale

### Dead Ends & Warnings
- What was attempted, why it failed, what to avoid

### Out-of-Scope Findings
- Finding and suggested action

### Blockers
(none)
```
