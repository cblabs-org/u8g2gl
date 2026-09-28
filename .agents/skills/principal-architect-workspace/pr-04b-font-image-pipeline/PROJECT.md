# PROJECT — PR-04b: the font and image pipeline

**Tier 2 · Principal Architect**
**Programme**: U8G2GL
**Parent**: [PROGRAM.md](../PROGRAM.md)
**Contract**: [design_spec.md §14](../../../../docs/design_spec.md) (normative), §13.9, §13.4, §18; [ui_spec.md §12](../../../../docs/ui_spec.md)
<!-- Last updated: 2026-09-28 -->

## Mandate

Replace the generator's two named refusals — `<bdf>` fonts and `<convert>` images
(`validate-not-yet-supported.ts` Step 3) — with implementations. `<bdf>` compiles
through U8G2's own `bdfconv`, built from the pinned submodule; `<convert>` turns a
PNG into XBM bytes. **The schema does not change.** One pipeline serves the CLI
(Node) and the designer (browser); `src/core/` never imports `node:`.

Critical path: departures-board-v3's screens use custom BDF fonts, so PR-05 cannot
migrate a real board until this lands.

**Not ours:** PR-4R2's items (§13.5 clipping condition, `time` subject bound to a
coordinate, build-time style-radius check, box manifest help text); any schema or
manifest vocabulary; the BDF pixel editor (Phase 4).

## Branch Strategy

Base: `main` @ `453f9f3`. Branches `u8g2gl-fonts/wo<N>-<topic>`, stacked serially.
PR head is the last branch. Work happens in the dedicated worktree
`../U8G2GL-04b` so the main checkout is never shared (rule 04). Sync with `main`
using `git rebase --update-refs` before submission.

Baseline at base, re-measured in the worktree 2026-09-28: **CLI 1087 tests across
64 files**; C++ 377 tests with one known skip (`SizeOfReport.ThirtyTwoBitTarget`),
zero warnings, tsc and lint clean. Schema 0.4, CLI 0.8.0, runtime 0.5.0.

## Findings that shaped the decomposition

Measured on 2026-09-28 before any work order was written, in the session
scratchpad, against `extern/u8g2` at 2.36.18 (`d66b49af`).

1. **bdfconv is deterministic across hosts.** Native build, two runs from
   different working directories and `TZ=Asia/Tokyo`: byte-identical. The source
   contains no `time()`, `__DATE__`, `getcwd` or `argv[0]` use. Its output header
   carries only BDF-derived text (`Fontname`, `Copyright`, glyph count, build
   mode) — input, not host.
2. **One hazard in that header.** A BDF with no `COPYRIGHT` makes bdfconv
   `printf("%s", NULL)` (`bdf_font.c:585`), which is undefined behaviour. macOS
   libc and Emscripten's musl both print `(null)` today, so nothing breaks, but
   U8G2GL should not depend on it: **the generator takes the array bytes from
   bdfconv and writes its own header**, never bdfconv's text.
3. **Wasm settles [Q-2].** Built with the Emscripten 5.0.3 already installed at
   `departures-board/tools/layoutsim/emsdk` (no download): `bdfconv.wasm` is
   **58,180 bytes**, and a rebuild is byte-identical to the first. Built with
   `-sENVIRONMENT=web -sMODULARIZE -sEXPORT_ES6`, the glue imports nothing from
   Node and runs unmodified under Node when handed `wasmBinary` directly, using
   MEMFS for its files. **Wasm output equals native output byte for byte.**
4. **A correctness oracle exists.** Converting U8G2's own public-domain
   `tools/font/bdf/4x6.bdf` with `-b 0 -f 1 -m '32-127'` reproduces
   `u8g2_font_4x6_tr` in `csrc/u8g2_fonts.c` **byte for byte (723 bytes)**. The
   pipeline can therefore be pinned against U8G2's shipped arrays, so a submodule
   bump that changes the converter fails the build.
5. **departures-board-v3 vendors the same bdfconv.** Its `tools/bdfconv/*.c` is
   identical to the pinned submodule's; it invokes `-f 1 -m '0-65535' -n <name>`.
   PR-05's migration can therefore be checked for byte-identical font arrays.
6. **The generator needs no glyph metrics.** Nothing in `src/core/` measures text
   at build time, so a compiled font is an array and a byte count. The designer
   will want metrics (ui_spec §12's string ruler), and it gets them by loading the
   array into the Wasm runtime ([D-9]) rather than from a second parser.
7. **`range` is parsed but never validated.** `BdfFontDecl.range` documents
   `"0x20-0x7F"`; nothing checks its grammar or translates it to bdfconv's `-m`.
   Validating an existing attribute is not new schema surface.
8. **The loader reads assets as text.** `readAssets` in `load-project.ts` returns
   `Map<string, string>`, fine for `.xbm`; BDF is text but PNG is binary, so the
   asset channel must carry bytes.

## Design decisions (PA)

- **The Wasm artefact is committed, with provenance** — the catalogue pattern
  that closed [Q-11]. Emscripten is not a dependency of building or testing the
  CLI; it is needed only to *regenerate* the artefact, which a script does and a
  test checks against the recorded hashes and U8G2 commit.
- **The Wasm bytes are embedded in a TypeScript data module**, so neither Node
  nor the browser fetches or reads a file to get them. That is what makes it one
  pipeline rather than two loaders.
- **bdfconv's text output is parsed for its array and nothing else.** The
  generator formats the array and writes the provenance header itself (§14.1:
  project-relative source path, adjacent licence file if any).
- **Budget: compiled fonts are measured.** A `<bdf>`'s flash cost is its array's
  length — exact, not estimated (§1.3). `<builtin>` stays unmeasured, as now.
- **`<convert>` with a PNG whose size differs from the declared `width`/`height`
  is refused**, naming both sizes. Resampling is additive and can come later
  without breaking anyone; choosing a filter now would be design by anticipation
  (§1.5). Raised with the CA — see the CA bridge, non-blocking.
- **Polarity:** a pixel darker than the threshold sets the bit (drawn in the
  foreground colour); a transparent pixel is composited over white, so it stays
  clear. This is ImageMagick's convention for XBM. Raised with the CA,
  non-blocking.
- **Versions:** CLI/generator 0.8.0 → **0.9.0** in WO3 (new capability; no
  existing valid input's output changes). Schema unchanged. Runtime unchanged
  unless a WO proves otherwise.

## Work Order Decomposition

- [x] **[WO1 — bdfconv as a committed Wasm artefact](wo1-bdfconv-wasm/WORKORDER.md)** ✅ `c14086f`…`004fb17` · `u8g2gl-fonts/wo1-bdfconv-wasm` · base `main` @ `453f9f3` · standard · findings 1–3; [Q-2]; notices row
- [x] **[WO2 — the font compiler in `src/core/`](wo2-font-compiler/WORKORDER.md)** ✅ `8d45c91`…`975ca41` · `u8g2gl-fonts/wo2-font-compiler` · base WO1 · standard · findings 2, 4, 7; U8G2 oracle test; Node↔browser parity; determinism
- [x] **[WO3 — `<bdf>` through `generate`](wo3-bdf-generate/WORKORDER.md)** ✅ `95b3c03`, `9ffc4bf`, `a0f0df9` · `u8g2gl-fonts/wo3-bdf-generate` · base WO2 · standard · absent-`range` correction; assets as bytes; async compile step; refusal removed; emission, provenance, budget; CLI 0.9.0
- [x] **[WO3b — the fixture, real U8G2, and the editor target](wo3b-bdf-fixture/WORKORDER.md)** ✅ `93e54fa`, `b991378`, `3296112`, `1e46500` · `u8g2gl-fonts/wo3b-bdf-fixture` · base WO3 · standard · `<bdf>` in `test/generated_fixture/`; generated array linked against real U8G2 and measured; editor target resolves `<bdf>` fonts; editor parity (split from WO3, 2026-09-28)
- [x] **[WO4 — `<convert>`: PNG to XBM](wo4-png-convert/WORKORDER.md)** ✅ `aee1a57`, `8d31354` · `u8g2gl-fonts/wo4-png-convert` · base WO3b · standard · zero-dependency PNG decoder; one image model for `<xbm>` and `<convert>`; attribute validation; parity; ticket-number leaks fixed and guarded by a test
- [x] **[WO5 — licences, docs and a migration rehearsal](wo5-docs-rehearsal/WORKORDER.md)** ✅ `9791ee0`, `b810c00` · `u8g2gl-fonts/wo5-docs-rehearsal` · base WO4 · standard · licence of a converted font; notices audit; npm package carries LICENSE; departures-board-v3's **14** BDFs through the built CLI, compared byte for byte with its `fonts.cpp`
- [ ] **[WO6 — readability remediation, and three small fixes](wo6-readability/WORKORDER.md)** · `u8g2gl-fonts/wo6-readability` · base WO5 · standard · [review](wo6-readability/REVIEW.md) P2/P3; B1 symlink confinement; B2 `ofl` prefix; B3 clean `dist/`

WORKORDERs are written just in time, each after its predecessor's Completion
Report is ingested, so each can name the API surface the previous one delivered.

## Human approval of this decomposition

> **Owner, 2026-09-28 at about 14:47Z (UTC; received mid-turn, so the minute is approximate), in the PA session, verbatim:**
> "Approved to proceed autonomously.  Stack any major questions as a bridge prompt to pass back to the CA for review.  If they are severe enough to block implementation, then you'll have to wait for me to return to the bench."

Recorded 2026-09-28T14:52Z. The owner gave this approval while the PA was still
surveying, before the ledger above was written; it authorizes the PA to
decompose and execute PR-04b autonomously within the Mandate. The PA holds the
work to the Mandate and its Scope exclusions; anything that would change the
schema, manifest vocabulary or system design stops and goes to the owner.

## Session Log

### 2026-09-28 — PA session opened
- Read rules 00–04, CONTEXT_BRIDGE, design_spec §13.4/§13.9/§14/§18/§21/§22,
  ui_spec §12. Measured findings 1–8. Created worktree `../U8G2GL-04b` on
  `u8g2gl-fonts/wo1-bdfconv-wasm` from `main` @ `453f9f3`; submodule initialised
  from the main checkout's clone (no network).

### 2026-09-28 — WO1 ingested
- **Complete**, 4 commits, CLI **1097** (+10). PA re-ran suite, lint and build
  in the worktree: green.
- Flags added by measurement: `-ffile-prefix-map` (an absolute path leaked into
  the Wasm without it) and `-sALLOW_MEMORY_GROWTH=1` (`unifont_jp.bdf`, 9.4 MB,
  OOMs without it; ~80 ms with it). Rebuild from a different absolute path is
  byte-identical.
- **A malformed BDF does not fail**: bdfconv exits 0 with a zero-glyph font.
  WO2 must detect it from the output, not the exit status.
- **PA review finding carried into WO2:** the runner loads the glue with
  `import()` of a `data:` URL. It works in Node, but a browser
  Content-Security-Policy without `data:` in `script-src` blocks it, and a
  bundler cannot see through it. WO2 makes the glue a real module that is
  statically imported.
- **Seam for WO2/WO3:** `generate()` is synchronous and Wasm instantiation is
  asynchronous, so font compilation is a separate async core step. Both hosts
  call it with bytes before `generate`.
- bdfconv's map grammar (`bdf_map.c`) writes hex as `$20`, not `0x20`, and has
  `*`, `~` exclusion and `>` remap. Its default map is `*`.

### 2026-09-28 — WO2 ingested
- **Complete**, 3 code commits, CLI **1138** (+41). PA re-ran suite, lint and
  build: green. `src/core/fonts/` has no Node API use.
- `compileBdf` is byte-exact against four U8G2 arrays (`4x6_tr` 723 B, `4x6_tf`
  1451 B, `4x6_tn` 152 B, `6x13_tr` 1056 B), read by an independent reader. A
  browser bundle run in a bare `vm` context gives identical results. Output is
  stable across cwd, TZ, TMPDIR and LANG. The glue is now a statically imported
  module; the Wasm hash is unchanged.
- Declared array length is always literal length + 1 (the implicit NUL), and
  the parser checks this rather than assuming it.
- `range` rejects bdfconv's own `*`, `~`, `>`, `$`; the maximum codepoint is
  0xFFFF (bdfconv's glyph encoding is `uint16_t`).
- **PA error, found in review:** WO2's WORKORDER said an absent `range` maps
  to bdfconv's `*`. `bdf_map.c:174` defines `*` as 32–255, so fonts with glyphs
  above 255 would silently lose them. The correct default is `0-65535` (no
  filter, and what departures-board-v3 passes). Carried as WO3 item 1.
- **WO3 split** into WO3 (the CLI path) and WO3b (committed C++ fixture,
  real-U8G2 test, editor target) before dispatch, because the C++ and editor
  halves need CMake and a different verification loop.
- **PA naming decision for WO3:** the compiled array is `static`
  `ui_fontdata_<name>` with `ui_font_<name>` a pointer to it, so `ui.hpp` keeps
  one declaration form for both font kinds. `ui_font_<name>_data` was rejected:
  it collides with a `<bdf>` named `<name>_data`.

### 2026-09-28 — WO3 ingested
- **Complete**, CLI **1158** (+20), CLI **0.9.0**. PA re-ran suite, lint and
  build: green.
- Absent `range` is now 0–65535. A sweep of all 396 BDFs in U8G2's tree
  compiles 396/396, including `waffle-10.bdf`, which failed under `*`.
- **PA end-to-end through the built CLI**, using `test/generated_fixture`
  plus two departures-board-v3 fonts copied into `tmp/`: WeatherIcons16 with no
  `range` (10/10 glyphs, 225 B) and NatRailSmall9 with `0x20-0x7F` (947 B,
  matching the PA's native bdfconv measurement at session start). The budget
  shows `fonts (compiled bdf) (2)  1172 bytes`, measured. Two runs from
  different cwd and TZ gave identical trees, with no absolute paths.
- **PA review findings carried into WO3b:** (1) `generate()` infers which
  fonts failed from diagnostics' `offendingText`, which is presentation data
  driving control flow; replaced by an explicit failed set. (2) The emitted
  provenance comment contains "WO3 item 1", an internal ticket in the user's
  generated code.
- The public-domain `4x6.bdf` is now copied into
  `cli/test/integration/fixtures/valid-project/fonts/` (12.9k lines). WO5's
  notices pass must cover it.

### 2026-09-28 — WO3b ingested
- **Complete**, 3 code commits. PA re-ran both suites one after the other, with
  a clean C++ build in `tmp/pa-cbuild`: **C++ 382** (+5, one known skip,
  **zero warnings**) and **CLI 1161** (+3); lint clean.
- `test_bdf_real_u8g2.cpp` links the fixture's generated `ui_fonts.cpp`
  against real U8G2. The compiled 4x6 font `memcmp`s equal to
  `u8g2_font_4x6_tr`. Metrics match values derived from the BDF's own
  `BBX`/`DWIDTH`. Glyphs above 0xFF and below 0x20 draw pixel for pixel as
  their BDF `BITMAP` rows say, which proves the absent-`range` fix reaches the
  screen. Expected values come from the BDF, never from U8G2's output (the PA
  checked the constants).
- Failed fonts are now an explicit `failedFonts` set. The ticket reference in
  the fonts comment is gone.
- The editor target needed no new plumbing: `<bdf>` fonts travel by name to
  `editor_host::provide_font` exactly as `<builtin>` fonts do, and `scene.json`
  needs nothing new.
- Worker signed commits `Claude Sonnet 5`, its actual identity, not the
  template's line. Accepted; WO4 onward asks each worker to name the model it
  is.
- **Carried into WO4:** three older emitters also leak ticket numbers into
  generated code (`images.ts` `PR-04b`, `generated-config.ts` `WO4 F5`,
  `screen.ts` `PR-09`). Fix them, and add a test that fails on any `WO<n>`
  or `PR-<n>` in generated output.

### 2026-09-28 — WO4 decisions (PA)
- **No PNG dependency.** `DecompressionStream('deflate')` is a global in
  Node ≥ 18 (the `engines` floor) and in browsers, and the asset step is
  already async. This avoids a licence row and a supply-chain question.
- The size, grey-conversion, polarity and dither rules are prescribed in
  WO4's WORKORDER, integer-only. Size mismatch and polarity stay CA
  questions 2–3.
- `<convert>`'s `mode` and `threshold` are currently parsed through an
  unchecked cast and never validated. WO4 validates them, which is existing
  vocabulary, not new schema.

### 2026-09-28 — WO4 ingested
- **Complete**, one code commit. PA re-ran the suites one after the other,
  with a clean C++ build: **CLI 1265** (+104), **C++ 383** (+1, one known
  skip, **zero warnings**); lint and build clean.
- **PA independent oracle:** a 10x2 RGBA PNG built in Python outside the
  codebase, covering opaque grey, a pixel exactly at the threshold, alpha 0,
  alpha 128 over black, pure R/G/B and a width not a multiple of 8. Through
  the built CLI it gives `65 01 00 02`, **exactly the bytes computed by hand**
  from WO4's rules.
- No npm dependency: PNG inflate uses `DecompressionStream`. One image model:
  `compileProjectAssets` returns `images` + `failedImages` for both `<xbm>`
  and `<convert>`, and the emitter, budget and editor read only that.
  `no-ticket-numbers.test.ts` guards generated output against `WO<n>` and
  `PR-<n>`.
- Public-surface changes, for the PR description: the budget `--json` item
  `image data (xbm arrays)` is now `image data (bitmap arrays)`;
  `GenerateInput.assets` is replaced by compiled `images`;
  `ConvertImageDecl.mode` is typed `string` and validated. Two new codes:
  `U8G2GL_IMAGE_CONVERT_FAILED`, `U8G2GL_MISSING_COMPILED_IMAGE`.
- **Attribution defect:** WO4's two commits say `Co-Authored-By: Claude
  Sonnet 5.5`, a model that does not exist (workers run on Sonnet 5). Nothing
  is pushed; the PA corrects the trailer during the pre-submission rebase.
- Worker's out-of-scope findings (docs, which are the CA's):
  `implementation_plan.md:276` still calls PR-04b future work; §14.2 and §18
  should record the `<convert>` rules and the renamed budget line. Added to
  the CA bridge.
- Correction to this ledger: departures-board-v3 has **14** BDFs, not ten.

### 2026-09-28 — WO5 ingested
- **Complete.** CLI **1268** (+3); lint and build green. `LICENSE` and
  `THIRD-PARTY-NOTICES.md` now say that converting a font with `<bdf>`, or an
  image with `<convert>`, does not change its licence. The notices carry a
  provenance table for the test material the PR adds: `4x6.bdf` (public
  domain), and `arrow_mini.bdf` and `logo_mark.png` (MIT), none of them in
  the npm package.
- **The published package had no `LICENSE`.** `cli/LICENSE` is a committed
  copy of the root file, and a test pins it byte-identical and checks
  `npm pack`'s file list.
- **Migration rehearsal: all 12 arrays in departures-board-v3's `fonts.cpp`
  are byte-identical** to what the built CLI produces from the same BDFs with
  no `range`. The PA reproduced two with its own parser: NatRailTall12 1221 B
  and WifiIcons11 138 B, both identical. (The PA's first parser stopped at a
  literal `;` byte opening a line, the trap WO2 recorded; anchoring the end to
  a line end fixed it.) Two of the 14 BDFs (`RailClockHuge11`,
  `RailClockMega13`) are stale leftovers that project never compiles.
- **For PR-05:** font names must be renamed to `[a-z][a-z0-9_]*`. Generated
  symbols are `ui_font_<name>` (pointer) and `ui_fontdata_<name>` (array), not
  the old PascalCase arrays. Nothing else needed.
- **Carried into WO6:** `tsc` never cleans `dist/`, so a local `npm pack`
  shipped a stale `bdfconv-glue.json`. The build should start from an empty
  `dist/`.
- To the CA bridge: design_spec §22's dependency table (line ~2075) still
  says bdfconv is a "build tool, not linked", and the Emscripten row likewise.
  Both now ship in the npm package. The `LICENSE` quote at ~2088 lacks the new
  sentence.

### 2026-09-28 — readability review ingested; WO6 dispatched
- `readability-reviewer` over `main..wo4-png-convert`: **P1 0 · P2 6 · P3 14 ·
  P4 5**. It found stale comments left by later work orders, and history
  narration. Report committed as [wo6-readability/REVIEW.md](wo6-readability/REVIEW.md).
- **PA ruling on history in comments:** for lines this PR added, rewrite bare
  ticket tags, pointers to workspace documents a source reader cannot reach,
  and narrated debate. Keep §/[D-n] references, upstream source pointers, and
  measured facts stated as facts. No new rule mid-PR; it is suggested to the CA.
- **Two behaviour defects the reviewer spotted**, both in code this PR
  extended, go into WO6 with tests: a symlink can escape asset-read
  confinement (`resolve()`, not `realpath`), and the licence-file prefix `ofl`,
  which was the PA's own rule, matches `oflow.txt`. Plus WO5's carry: the
  build starts from an empty `dist/`.
