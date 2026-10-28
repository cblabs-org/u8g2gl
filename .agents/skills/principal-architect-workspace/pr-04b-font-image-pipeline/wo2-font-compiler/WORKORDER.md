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
  `~/Documents/Projects/departures-board/tools/layoutsim/emsdk`
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

---
## Completion Report

### Status
complete

### Changes Made
- `cli/src/node/build-bdfconv.ts` — item 1: the glue is now written as a real,
  statically importable ES module (`bdfconv-glue.generated.ts`, a
  `// @ts-nocheck`/`/* eslint-disable */` copy of Emscripten's own EXPORT_ES6
  output) instead of a JSON-wrapped string loaded through a `data:` URL
  dynamic import. `bdfconv-source.json`'s `artefacts` key is renamed to
  match; `wasm.sha256` is byte-for-byte unchanged (rebuilt from the same
  pinned Emscripten 5.0.3, same flags, same U8G2 commit).
- `cli/src/data/bdfconv/bdfconv-glue.generated.ts` — regenerated artefact
  (item 1). `bdfconv-glue.json` deleted.
- `cli/src/data/bdfconv/bdfconv-wasm.json`, `bdfconv-source.json` —
  regenerated/updated for the new artefact filename; wasm bytes unchanged.
- `cli/src/data/bdfconv/runner.ts` — deleted (WO1's `data:` URL loader,
  superseded by `bdfconv-instance.ts`).
- `cli/src/core/fonts/bdfconv-instance.ts` — new. The low-level "boot one
  module instance, run one conversion" glue, replacing `runner.ts`; used by
  both `compileBdf()` and `test/bdfconv/smoke.test.ts`.
- `cli/src/core/fonts/bdfconv-output.ts` — new. Parses bdfconv's `-b 0` C
  output (header + the full C string-literal grammar: octal escapes,
  adjacent-literal concatenation) into exact array bytes.
- `cli/src/core/fonts/bdf-range.ts` — new (item 3). The `<bdf range>`
  grammar: parse, validate, translate to bdfconv's `-m` syntax.
- `cli/src/core/fonts/compile-bdf.ts` — new (item 2). `compileBdf()`, the
  public API.
- `cli/src/core/fonts/index.ts` — new. Barrel: `compileBdf` + types,
  `parseBdfRange` + types.
- `cli/src/core/index.ts`, `cli/src/browser/index.ts` — export the fonts
  barrel.
- `cli/src/core/schema/diagnostic.ts` — new code
  `U8G2GL_MALFORMED_BDF_RANGE`.
- `cli/src/core/validator/validate-schema.ts` — validates `<bdf range>`
  through `parseBdfRange()`, reporting `MALFORMED_BDF_RANGE` at the font
  declaration's location.
- `cli/test/bdfconv/smoke.test.ts` — repointed at `bdfconv-instance.ts`.
- `cli/test/bdfconv/provenance.test.ts` — repointed at the renamed artefact.
- `cli/test/fonts/u8g2-oracle.test.ts` — new (item 4). 4 fonts, byte-exact
  against `u8g2_fonts.c`, read by an independent small reader.
- `cli/test/fonts/parity.test.ts` — new (item 5). esbuild browser bundle run
  in a `node:vm` sandbox; 3 fonts + 2 failure cases, byte/text-identical to
  direct Node calls.
- `cli/test/fonts/determinism.test.ts` — new (item 6). Two child processes,
  cwd/TZ/TMPDIR/LANG varied; identical sha256; no leaked absolute path.
- `cli/test/fonts/bdf-range.test.ts`, `cli/test/validator/bdf-range-diagnostic.test.ts`,
  `cli/test/fonts/compile-bdf.test.ts` — unit coverage for the grammar, the
  validator diagnostic, header fields, every failure path, and concurrency.

### The API WO3 will call
```ts
// cli/src/core/fonts/index.ts (also re-exported from core/index.ts and browser/index.ts)

export function compileBdf(input: CompileBdfInput): Promise<CompileBdfResult>;

interface CompileBdfInput {
  readonly bdf: Uint8Array;       // the BDF file's raw bytes
  readonly identifier: string;    // the array name, passed to bdfconv's -n
  readonly range?: string;        // the <bdf range> attribute, untranslated
}

interface CompiledFont {
  readonly bytes: Uint8Array;         // exactly declaredLength bytes, incl. trailing NUL
  readonly declaredLength: number;    // === bytes.length
  readonly selectedGlyphs: number;
  readonly totalGlyphs: number;
  readonly fontName: string | undefined;   // never "(null)"
  readonly copyright: string | undefined;  // never "(null)"
}

interface FontCompileFailure {
  readonly ok: false;
  readonly reason: string;            // human-readable; names the offending range item
  readonly stderr: readonly string[]; // bdfconv's own stderr lines, [] if never invoked
}

type CompileBdfResult = ({ readonly ok: true } & CompiledFont) | FontCompileFailure;

// Same grammar module the validator uses for <bdf range> — call it directly if WO3's
// emitter needs to re-check a range without invoking bdfconv (it should not need to).
export function parseBdfRange(range: string): BdfRangeResult;
export const MAX_BDF_CODEPOINT = 0xffff;
```
WO3 needs no other export from `src/core/fonts/`; `bdfconv-instance.ts` and
`bdfconv-output.ts` are internal and deliberately not re-exported.

### Measurements
- **Declared length vs literal length**: always `declaredLength === literal
  bytes + 1`. bdfconv's writer (`bdf_font.c`, `bf_WriteU8G2CByFP`) always
  emits exactly `target_cnt-1+extra1` explicit bytes for a declared size of
  `target_cnt+extra1` — the array's final byte is always the C compiler's
  own implicit NUL terminator for the string literal, never a byte bdfconv
  wrote itself. `bdfconv-output.ts` verifies this relationship on every
  parse rather than assuming it, and fails rather than guess if it doesn't
  hold.
- **Oracle fonts and byte counts** (`u8g2-oracle.test.ts`, all byte-exact
  against `extern/u8g2/csrc/u8g2_fonts.c`): `u8g2_font_4x6_tr` 723 bytes,
  `u8g2_font_4x6_tf` 1451 bytes, `u8g2_font_4x6_tn` 152 bytes,
  `u8g2_font_6x13_tr` 1056 bytes (different BDF family). Every `build.c` map
  row measured for these translates losslessly into our `<bdf range>`
  grammar: `bdf_map.c`'s optional `>map_to` override is always redundant
  with its own default (`map_to = range_from` when `>` is omitted), and
  every row `build.c` writes for `-b 0` fonts sets it to exactly that value,
  so dropping it (our grammar has no `>` operator) loses nothing.
- **Timings** (measured on this machine; instance creation included, one
  fresh instance per call as required):
  - `4x6.bdf`, no range: 8.3 ms; with `range="0x20-0x7F"`: 2.5 ms
  - `unifont.bdf`, no range: 55.5 ms; with `range="0x20-0x7F"`: 52.5 ms
- **Byte size, `range="0x20-0x7F"`, three BDF sizes**: `4x6.bdf` → 723
  bytes; `6x13.bdf` → 1056 bytes; `unifont.bdf` → 1272 bytes.
- **Sweep of U8G2's `-b 0` BDFs** (every `build.c` row with the `BM_T` bit,
  364 distinct `.bdf` files under `extern/u8g2/tools/font/bdf/`, compiled
  with bdfconv's own default map `*`, not a permanent test): **363/364
  succeed.** One failure: `waffle-10.bdf` — bdfconv's default map (`32-255`)
  selects zero glyphs; the BDF's own glyphs are evidently encoded outside
  that range (`CHARSET_ENCODING "1"`, not ISO 10646 — build.c never builds
  this file with the bare default map either; it always supplies an
  explicit custom map for it). Not a `compileBdf()` defect — a font whose
  encoding requires a non-default range still requires the author to supply
  one, which is the documented contract.
- **Glue-delivery change**: `wasm.sha256` unchanged —
  `53b988238fd2b191e2d29dcdc1714b5f9a9761d8abc4a35cbbd1d5d06cbae982`, both
  before and after item 1, confirming only the delivery mechanism moved.
  Artefact hash is for a different file (`bdfconv-glue.generated.ts` vs the
  deleted `bdfconv-glue.json`) so is not directly comparable; recorded as
  `9fd5e9a6979d096362e922e864a84d9c399eeee59a309886d2d1584b0db30eaf`.

### Decisions Made
- **Directory name** `src/core/fonts/` (as the WORKORDER already named it) —
  kept as-is; nothing in `u8g2gl-standards` suggested otherwise for a
  feature directory under `core/`.
- **`bdfconv-instance.ts` lives in `src/core/fonts/`, not `src/data/bdfconv/`**
  — it is compileBdf()'s own low-level glue, not a data artefact; only the
  generated glue/wasm/source-provenance files stay in `data/bdfconv/`.
- **`range` grammar has no `>map_to` operator** — the WORKORDER's own
  examples (build.c's map rows) never need one that isn't redundant with
  the default, and adding it would mean `<bdf range>` could silently
  reindex a font's array positions, a much larger authoring surface than
  "which glyphs are included." Left out; flagged to the PA if a future WO
  needs it (see Out-of-Scope Findings).
- **Max codepoint 0xFFFF** — measured from `bdf_font.h`'s
  `tga_draw_glyph(unsigned x, unsigned y, uint16_t encoding, ...)`: nothing
  above a `uint16_t` can ever be rendered by bdfconv's own glyph selection,
  so validating it here (rather than letting bdfconv truncate silently) is
  strictly more honest.
- **Concurrency test also runs the same inputs sequentially** and asserts
  concurrent results match their sequential counterparts, not just that
  they don't throw — a subtler race (e.g. two instances sharing global
  Emscripten state) would produce wrong bytes without an exception.
- **Parity test rebuilds the input `Uint8Array` inside the vm sandbox's own
  realm** rather than passing the host's instance across — avoids any
  cross-realm `instanceof` assumption the bundled Emscripten glue might
  make, and is closer to what a real browser page would do (its own
  `Uint8Array`, not one from another realm).

### Dead Ends & Warnings
- **`vm.createContext(sandbox)` does not reflect built-ins back onto the
  sandbox object** — `sandbox.Uint8Array` is `undefined` from the host side
  even though code *running inside* the context sees it fine. Fetch such
  values as the completion value of a tiny script run in that context
  (`vm.runInContext('Uint8Array', sandbox)`) instead of reading them off
  the object you passed to `createContext`.
- **The first oracle-test reader attempt stopped at the wrong `;`** — a
  literal `;` byte can appear unescaped inside a compiled font array
  (ASCII, not one of bdfconv's always-escaped bytes), so a naive
  `[\s\S]*?;` regex for "read up to the end of the statement" truncates
  early. The real end is `";` (closing quote immediately followed by
  semicolon) — checked in both the oracle test's independent reader and
  (already correctly, by construction) in `bdfconv-output.ts`.
- **bdfconv never emits `\"` or `\\`** — bytes 34 and 92 are always in its
  octal-escaped set (`bf_WriteU8G2CByFP`'s condition list), so a backslash
  in its output is always followed by 1–3 octal digits and nothing else.
  Simplifies the parser considerably versus handling the full general C
  escape grammar; said so in `bdfconv-output.ts`'s file header rather than
  leaving it implicit.

### Out-of-Scope Findings
- **`waffle-10.bdf`** (and potentially other BDFs with non-default
  encodings) needs an explicit `range` to compile through `compileBdf()` —
  expected given the documented contract, but worth a note for whichever WO
  writes end-user documentation (WO5): the default range is not universally
  safe, unlike U8G2's own `build.c`, which always supplies an explicit map
  for such fonts.
- **`>map_to` is unsupported** in `<bdf range>` (see Decisions Made). Every
  case measured against `build.c` doesn't need it, but a future author
  wanting to remap a font's array indices (not just filter which glyphs
  are included) would need a schema change. Flag for the PA/owner if it
  comes up; not needed for WO3.

### Blockers
(none)
