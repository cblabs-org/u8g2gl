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
- [ ] **[WO3 — `<bdf>` through `generate`](wo3-bdf-generate/WORKORDER.md)** · `u8g2gl-fonts/wo3-bdf-generate` · base WO2 · standard · absent-`range` correction; assets as bytes; async compile step; refusal removed; emission, provenance, budget; CLI 0.9.0
- [ ] **WO3b — the fixture, real U8G2, and the editor target** · `u8g2gl-fonts/wo3b-bdf-fixture` · base WO3 · standard · `<bdf>` in `test/generated_fixture/`; generated array linked against real U8G2 and measured; editor target resolves `<bdf>` fonts; editor parity (split from WO3, 2026-09-28)
- [ ] **WO4 — `<convert>`: PNG to XBM** · `u8g2gl-fonts/wo4-png-convert` · base WO3b · standard · one image model shared with `<xbm>`; parity; notices row for any decoder dependency
- [ ] **WO5 — licences, docs and a migration rehearsal** · `u8g2gl-fonts/wo5-docs-rehearsal` · base WO4 · standard · §22.1 wording; departures-board-v3's ten BDFs through the built CLI, compared with its `fonts.cpp`
- [ ] **WO6 — readability remediation** · `u8g2gl-fonts/wo6-readability` · base WO5 · standard · from the `readability-reviewer` report over the stack

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
