---
name: pr-04b-font-image-pipeline-wo1
description: Handoff instructions for Work Order 1 — bdfconv as a committed Wasm artefact
complexity: standard
---

# WO1 — bdfconv as a committed Wasm artefact

**Parent project:** PR-04b, the font and image pipeline —
[PROJECT.md](../PROJECT.md). The owner's approval of this decomposition is
recorded verbatim in that file under *Human approval of this decomposition*.

**Branch:** `u8g2gl-fonts/wo1-bdfconv-wasm` (already created, base `main` @
`453f9f3`). **Working tree:** `/Users/mcneillm/Documents/Projects/U8G2GL-04b` —
a dedicated worktree. Work only there; never in `/Users/mcneillm/Documents/Projects/U8G2GL`.

## Role Definition

You are an expert senior software engineer and execution-focused worker agent.
You are NOT the Principal Architect. Do not make high-level architectural
decisions, do not create branches, and do not plan beyond this checklist.

**You commit on a green build and you never ask permission mid-flight.** Nobody
can answer you while you run; a question strands your work uncommitted. Where
this WORKORDER leaves a choice to you, make it, and record it under *Decisions
Made*. If something genuinely blocks you, commit what is green, write the
Completion Report with status `partial` or `blocked`, and stop.

## Objective

Build U8G2's `bdfconv` to WebAssembly from the pinned submodule, commit the
result as a data artefact the CLI can load **identically in Node and in a
browser** — no file read, no fetch — and record its provenance so it can be
reproduced and checked, as `catalogue-source.json` does for the catalogue.

This WO delivers the artefact and a minimal way to run it. The font-compiler
API that uses it is WO2's; do not build that here.

## What is already measured (PA, 2026-09-28 — reproduce, don't re-derive)

Read [PROJECT.md](../PROJECT.md) *Findings* 1–4 first. In short:

- Emscripten **5.0.3** (`285c424dfa9e83b03cf8490c65ceadb7c45f28eb`) is installed at
  `/Users/mcneillm/Documents/Projects/departures-board/tools/layoutsim/emsdk`.
  Activate it with `source <that>/emsdk_env.sh`. **Use it read-only; download no
  toolchain.** Do not modify anything in that directory.
- This command, run against `extern/u8g2/tools/font/bdfconv/*.c`, produced a
  58,180-byte `bdfconv.wasm` (sha256 `0d252ab9…955b`), and a rebuild was byte-identical:
  ```
  emcc -O2 -w -sMODULARIZE -sEXPORT_ES6 -sENVIRONMENT=web -sEXIT_RUNTIME=1 \
       -sINVOKE_RUN=0 -sEXPORTED_RUNTIME_METHODS=FS,callMain -o bdfconv.mjs <sources>
  ```
- Run under Node with `factory({ wasmBinary, print(){}, printErr(){} })`, then
  `FS.writeFile('/in.bdf', …)`, `callMain(['-f','1','-m','32-127','-n',name,'-o','/out.c','/in.bdf'])`,
  `FS.readFile('/out.c')`: output equals native bdfconv byte for byte.
- `callMain` under `EXIT_RUNTIME=1` may throw an `ExitStatus`; one module
  instance serves one conversion.

You may change flags where you have a measured reason (for example
`-sALLOW_MEMORY_GROWTH=1` if a large font exhausts the default heap), and record
why. Every flag you ship is recorded in the provenance file.

## Strict Boundary Box

**In scope — create or modify only these:**
- `cli/src/node/build-bdfconv.ts` — new. The regeneration script.
- `cli/src/data/bdfconv/` — new directory: the generated artefact module(s) and
  `bdfconv-source.json` (provenance).
- `cli/package.json` — a `build:bdfconv` script; `files` so the artefact and its
  licence notices ship. **No new runtime dependency.** Version stays 0.8.0.
- `cli/eslint.config.js`, `cli/tsconfig*.json` — only as far as needed so the
  generated glue is compiled/copied into `dist/` and excluded from lint rules it
  cannot meet (it is machine-generated). Do not weaken the `src/core/**`
  `no-restricted-imports` rule.
- `cli/test/bdfconv/` — new tests.
- `cli/LICENSES/` (or an equivalent path inside the npm package) — the
  BSD-2-Clause notice for bdfconv and the MIT notice for Emscripten's generated
  runtime glue, so both travel with the package.
- `THIRD-PARTY-NOTICES.md` (repo root) — a row for bdfconv-as-Wasm and the
  Emscripten glue; amend the U8G2 row's "Nothing from it is copied into U8G2GL's
  … published packages", which stops being true.
- This WORKORDER's Completion Report.

**Explicitly out of scope — do not touch:**
- `src/core/**` of the CLI (the compiler API is WO2), the validator, the
  generator, `load-project.ts`, the budget.
- `validate-not-yet-supported.ts` — the `<bdf>` refusal stays until WO3.
- `extern/u8g2/**` — read-only; never patch bdfconv.
- The C++ runtime, `CMakeLists.txt`, `docs/**`, `LICENSE`.
- Any schema, manifest, or `.agents/rules/` file.

## Tooling Constraints

- CLI: from `cli/`, `npm test` (vitest), `npm run lint` (eslint + tsc on tests),
  `npm run build` (tsc). All three green before every commit.
- No C++ change in this WO, so the C++ suite need not run.
- Scratch files go in `tmp/` at the repo root (git-ignored) — never `/tmp`.
- Load the **`u8g2gl-standards`** skill before writing any code: file headers
  with SPDX, Doxygen/TSDoc on exports, step breakdowns, why-comments.

## Line-Item Instructions

- [ ] **`cli/src/node/build-bdfconv.ts`** — the regeneration script, modelled on
  `build-catalogue.ts`. It:
  - reads bdfconv's sources from `extern/u8g2/tools/font/bdfconv/` (default) or
    a `--u8g2-path`, in **sorted** order;
  - finds `emcc` via `--emsdk`/`EMSDK` or `PATH`, and **refuses** to build unless
    `emcc --version` reports exactly the pinned version, naming both versions;
  - builds with the recorded flags into a scratch directory under `tmp/`, then
    writes the artefact module(s) into `cli/src/data/bdfconv/`;
  - writes `bdfconv-source.json`: U8G2 tag and commit (read from the submodule,
    not hard-coded), Emscripten version and commit, the exact flag list, and
    sha256 of the Wasm and of each committed artefact file;
  - is wired as `npm run build:bdfconv`.
- [ ] **The artefact** — committed under `cli/src/data/bdfconv/`. Requirements,
  the means are yours:
  - loading it performs **no `fetch`, no `fs`, no `import.meta.url` resolution
    at run time** — the Wasm bytes are embedded (a base64 data module, or
    Emscripten's `-sSINGLE_FILE`; measure which glue is cleaner and say why);
  - its glue imports nothing from Node (`grep` it and say so in the report);
  - `npm run build` places it in `dist/` such that the **packed** package works:
    verify with `npm pack` into `tmp/`, install that tarball into a scratch
    project under `tmp/`, and convert a font from there.
- [ ] **A thin runner for tests only** — whatever minimal function the tests need
  to instantiate the module and run one conversion. Put it beside the artefact
  in `cli/src/data/bdfconv/`, not in `src/core/`; WO2 designs the real API and
  may replace it.
- [ ] **`cli/test/bdfconv/provenance.test.ts`** —
  - the recorded U8G2 commit equals `catalogue-source.json`'s **and** the
    submodule's pinned gitlink (read with `git ls-tree HEAD extern/u8g2` or the
    submodule's `HEAD`), so the catalogue, the font list and the converter
    cannot silently come from different U8G2 commits;
  - the sha256 of each committed artefact file equals the recorded one.
- [ ] **`cli/test/bdfconv/smoke.test.ts`** — the committed artefact converts
  `extern/u8g2/tools/font/bdf/4x6.bdf` with `-b 0 -f 1 -m 32-127` and the output
  contains a 723-byte array (Finding 4). Read the BDF from the submodule; do not
  copy it. A malformed BDF produces a failure the test can observe (non-zero
  status or thrown `ExitStatus`) and does not hang or kill the test process.
- [ ] **Measure and report, do not test permanently:**
  1. Rebuild twice via `npm run build:bdfconv`; the committed files are
     byte-identical across the two runs. Then build from a *different* checkout
     path (e.g. copy bdfconv's sources into `tmp/elsewhere/`) and compare: if an
     absolute path leaks into the Wasm, find the flag that stops it (e.g.
     `-ffile-prefix-map`) and record it.
  2. Convert the largest BDF in `extern/u8g2/tools/font/bdf/` (`unifont_jp.bdf`,
     9.4 MB) with no `-m` restriction; report success, time taken and peak
     behaviour. If it fails on heap, add memory growth and re-measure.
  3. The artefact's total committed size and the size it adds to `npm pack`.
- [ ] **Licences** — `THIRD-PARTY-NOTICES.md` row(s) and the in-package notice
  files. bdfconv's copyright line is `Copyright (c) 2017, olikraus@gmail.com`,
  BSD-2-Clause (`extern/u8g2/tools/font/bdfconv/main.c` header;
  `extern/u8g2/LICENSE`). BSD-2 requires the notice to accompany *binary*
  redistribution, which the Wasm is. Check `npm pack --dry-run` lists the notice
  files.

## Verification Requirement

Before each commit: `npm test`, `npm run lint`, `npm run build` all green from
`cli/`. The CLI suite must still show every one of the baseline's 1087 tests
passing, plus yours. Report the final counts.

**Branch hygiene (rule 04):** run `git branch --show-current` **as its own
command** immediately before every commit and confirm it prints
`u8g2gl-fonts/wo1-bdfconv-wasm`. Do not push. Commit messages use the
programme's style (`feat(cli): …`, `test(cli): …`, `docs(notices): …`) and end
with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Commit on green without asking. When done, append the Completion Report below
and commit it as `docs(workspace): WO1 Completion Report`.

## Issue Surfacing

A defect, upstream bug or concern *outside your boundary box* goes in your
Completion Report under *Out-of-Scope Findings*. Do not file issues and do not
fix it — the PA triages and files.

---

## Completion Report (written by the worker at task completion)

```markdown
---
## Completion Report

### Status
complete | partial | blocked

### Changes Made
- `path` — what changed and why

### Measurements
- Rebuild determinism (same path, different path):
- unifont_jp.bdf conversion:
- Artefact size, committed and packed:
- Node imports in glue (grep result):

### Decisions Made
- Decision and rationale

### Dead Ends & Warnings
- What was attempted, why it failed, what to avoid

### Out-of-Scope Findings
- Finding and suggested action

### Blockers
(none)
```

---

## Completion Report

### Status
complete

### Changes Made
- `cli/src/node/build-bdfconv.ts` — new. Regeneration script modelled on
  `build-catalogue.ts`: finds `emcc` via `--emsdk`/`EMSDK`/`PATH`, refuses to
  build unless it reports exactly Emscripten 5.0.3, builds bdfconv's sorted
  `.c` sources into `tmp/bdfconv-build/`, and writes the committed artefact
  and its provenance record. Wired as `npm run build:bdfconv`.
- `cli/src/data/bdfconv/bdfconv-glue.json` — new, generated. Emscripten's
  `MODULARIZE`+`EXPORT_ES6` JS glue, as one JSON string field (`source`).
- `cli/src/data/bdfconv/bdfconv-wasm.json` — new, generated. The compiled
  Wasm's raw bytes, base64-encoded, as one JSON string field (`base64`).
- `cli/src/data/bdfconv/bdfconv-source.json` — new, generated. U8G2 tag and
  commit, Emscripten version and commit, the exact flags (with the
  machine-specific `-ffile-prefix-map` value replaced by a placeholder — see
  Decisions Made), the Wasm's sha256, and the sha256 of each committed
  artefact file.
- `cli/src/data/bdfconv/runner.ts` — new, hand-written. The thin runner the
  Line-Item Instructions ask for: `instantiateBdfconv()` turns the two JSON
  modules back into a running Emscripten instance with no `fetch`, no
  `node:fs` and no `import.meta.url` resolution, by dynamically importing the
  glue source from a `data:` URL and passing the decoded Wasm bytes as
  `wasmBinary` directly; `convertBdf()` runs one conversion. WO2 owns the real
  font-compiler API and may replace this outright.
- `cli/test/bdfconv/provenance.test.ts` — new. Cross-checks
  `bdfconv-source.json`'s U8G2 commit against `catalogue-source.json`'s and
  against the submodule's own pinned gitlink (`git ls-tree HEAD extern/u8g2`,
  read independently of `readU8g2Source()`), and recomputes sha256 over every
  committed artefact file against the recorded value. 8 tests.
- `cli/test/bdfconv/smoke.test.ts` — new. The correctness-oracle test
  (Finding 4): converts U8G2's own `4x6.bdf` and asserts the output contains
  `test_font[723]`. A second case feeds a malformed BDF and asserts on the
  actual observed behaviour (see Dead Ends & Warnings). 2 tests.
- `cli/package.json` — added `build:bdfconv` script; added
  `src/data/bdfconv/bdfconv-glue.json`, `src/data/bdfconv/bdfconv-wasm.json`
  and `LICENSES/` to `files`. No new runtime dependency; version untouched
  (0.8.0).
- `cli/LICENSES/bdfconv-BSD-2-Clause.txt` — new. bdfconv's BSD-2-Clause notice,
  now required because the compiled binary ships in the package (binary
  redistribution).
- `cli/LICENSES/emscripten-glue-MIT.txt` — new. Emscripten's MIT notice for the
  generated JS glue, which also ships.
- `THIRD-PARTY-NOTICES.md` — amended the U8G2 row (the "nothing is copied into
  published packages" line stops being true of the compiled bdfconv binary)
  and added an Emscripten row for the build-time-only toolchain whose
  generated output ships.

### Measurements
- **Rebuild determinism (same path, different path):** Built twice from
  `extern/u8g2` via `npm run build:bdfconv` — `bdfconv-glue.json` and
  `bdfconv-wasm.json` byte-identical across both runs. Then built a third time
  from bdfconv's sources copied into `tmp/elsewhere-u8g2/` (a different
  absolute path) — Wasm sha256 `53b98823…ae982` matched exactly across all
  three builds. Without `-ffile-prefix-map`, the same three-way comparison
  showed the compiler's absolute source path leaking into the `.wasm` as
  debug-info strings (confirmed with `strings bdfconv.wasm | grep /Users`);
  adding the flag eliminated it. This is why the flag is in the recorded set.
- **unifont_jp.bdf conversion:** With the recorded flags (`-sALLOW_MEMORY_GROWTH=1`
  included), converting U8G2's largest bundled BDF (9.4 MB, no `-m`
  restriction) through the committed artefact succeeds in ~80 ms, producing a
  10,650-character output. Without memory growth, the same conversion throws
  `RuntimeError: Aborted(OOM)` after ~56 ms — confirmed before adding the flag,
  reconfirmed passing after.
- **Artefact size, committed and packed:** `bdfconv-glue.json` 60,341 bytes,
  `bdfconv-wasm.json` 77,299 bytes, `bdfconv-source.json` 788 bytes — 148 KB
  committed under `cli/src/data/bdfconv/`. Raw Wasm is 57,958 bytes.
  `npm pack --dry-run`: the artefact appears twice (once under `src/data/`, once
  compiled to `dist/data/`) plus `runner.js`/`.d.ts` and the two `LICENSES/`
  files, contributing roughly 284 KB of the packed tarball's total 670 KB
  (399 files). `npm pack --dry-run` confirms both `LICENSES/*.txt` files are
  listed.
- **Node imports in glue (grep result):** No `node:` import and no
  `require("node...")` anywhere in the committed glue source. The only
  substring match for `node:` is `node:current`, an unrelated object property
  name inside the glue's own MEMFS path-walking code, not an import.

### Decisions Made
- **A base64 data module, not `-sSINGLE_FILE`.** Tried `-sSINGLE_FILE=1` first
  (embeds the Wasm as base64 inside the glue itself, one file). It works, but
  the resulting JS text already contains raw base64-as-binary-string bytes,
  and the `data:` URL trick this runner needs to import the glue with no disk
  write requires base64-encoding *that whole text* a second time — nearly
  doubling the effective encoding overhead for no benefit, and making "sha256
  of the Wasm" mean something indirect (hashing base64 text embedded inside
  JS, not the Wasm bytes themselves). Building glue and Wasm as two separate
  artefacts, each base64-encoded exactly once, keeps `bdfconv-source.json`'s
  `wasm.sha256` a literal, direct hash of the real binary, and each committed
  file's own sha256 is what's actually written to disk.
- **`locateFile` must be supplied even though `wasmBinary` is also supplied.**
  Measured: instantiating with `{ wasmBinary }` alone throws `TypeError:
  Invalid URL`. The glue unconditionally calls `findWasmBinary()` during init
  to compute a cache-key string, even when `wasmBinary` is already present;
  its fallback path does `new URL("bdfconv.wasm", import.meta.url)`, which is
  invalid because `import.meta.url` is itself the `data:` URL the glue was
  imported from. Passing `locateFile: (path) => path` takes the other branch
  and the returned string is never read, since `wasmBinary` takes priority.
  This is recorded here because it is exactly the kind of thing WO2 would
  otherwise lose an hour to rediscovering.
- **`-ffile-prefix-map`'s value is recorded as a placeholder, not the literal
  path.** The flag's left-hand side is necessarily this machine's absolute
  checkout path at build time, but baking that literal path into a *committed*
  provenance file would make `bdfconv-source.json` differ across checkouts
  with no input change — the determinism rule (typescript.md §5) this
  repository holds generated output to. `bdfconv-source.json` records
  `-ffile-prefix-map=<bdfconv-source-dir>=bdfconv`; the build script always
  uses the real path at build time, which is what the flag's effect actually
  depends on.
- **`@vite-ignore` on the dynamic `import()`.** Vitest (via Vite's module
  transform) tries to statically analyse dynamic `import()` calls and failed
  on the runtime-built `data:` URL with the same `Invalid URL` symptom before
  the `locateFile` fix was even reached. The directive tells the bundler this
  specifier is deliberately dynamic; it has no effect on plain Node.

### Dead Ends & Warnings
- **A malformed BDF does not throw or exit non-zero.** The WORKORDER
  anticipated "a malformed BDF produces a failure the test can observe
  (non-zero status or thrown `ExitStatus`)". Measured behaviour: `callMain`
  returns normally, and bdfconv writes a degenerate `Glyphs: 0/0` font. This
  is Finding 2 in the wild — the same `printf("%s", NULL)` undefined-behaviour
  path a BDF with no `COPYRIGHT` hits — just reached from a different kind of
  bad input. `smoke.test.ts` was written to assert on the actual observed
  output (`"Glyphs: 0/0"`) rather than a throw that does not occur. Anyone
  building error handling on top of this artefact should not assume a bad
  file causes a thrown exception — it does not, reliably.
- **`readAsync`'s `fetch` call is present but unreachable dead code** in the
  committed glue, because `ENVIRONMENT=web` plus always-supplied `wasmBinary`
  means the branch that calls it is never taken. Confirmed by running fully
  offline. Worth knowing if a future audit greps for `fetch(` and is alarmed
  to find one match.

### Out-of-Scope Findings
(none beyond what PROJECT.md already recorded as Findings 1–4, all reproduced
above rather than re-derived)

### Blockers
(none)

