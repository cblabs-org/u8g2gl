---
name: pr-04b-font-image-pipeline-wo5
description: Handoff instructions for Work Order 5 — licences, docs and a migration rehearsal
complexity: standard
---

# WO5 — licences, docs and a migration rehearsal

**Parent project:** PR-04b, the font and image pipeline —
[PROJECT.md](../PROJECT.md). The owner's approval of this decomposition is
recorded verbatim in that file under *Human approval of this decomposition*.

**Branch:** `u8g2gl-fonts/wo5-docs-rehearsal` (already created, base
`u8g2gl-fonts/wo4-png-convert`). **Working tree:**
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

Make the licensing position of everything this PR ships or commits explicit,
and prove the pipeline is ready for PR-05 by running **every** BDF in
departures-board-v3 through the built CLI and comparing the arrays with the
ones that project ships today.

## Strict Boundary Box

**In scope:**
- `LICENSE` (repo root) — one sentence, item 1.
- `THIRD-PARTY-NOTICES.md` — items 1–2.
- `cli/package.json` and, if you choose that route, `cli/LICENSE` or a
  `prepack` step — item 3.
- `cli/test/**` — a test for item 3 if you add a copied file; nothing else.
- This WORKORDER's Completion Report — item 4's results live here.

**Explicitly out of scope:**
- `docs/**` — the specifications and the implementation plan are the Chief
  Architect's. If you find something there that is now wrong, list it under
  *Out-of-Scope Findings* with the exact line and suggested wording.
- **`/Users/mcneillm/Documents/Projects/departures-board-v3` is read-only.**
  Copy what you need into `tmp/`; never write, build, commit or run its
  scripts inside that tree. It has uncommitted files belonging to someone
  else's work — do not touch or report on them.
- All source under `cli/src/`, the C++ runtime and tests, `extern/**`.

## Tooling Constraints

- From `cli/`: `npm test`, `npm run lint`, `npm run build` green before every
  commit (CLI baseline **1265**). No C++ change, so no CMake run is needed.
- Scratch in `tmp/` at the repo root — never `/tmp`.
- Load the **`u8g2gl-standards`** skill (documentation rules apply to
  notices too).

## Line-Item Instructions

- [ ] **1. The licence of a converted font.** `LICENSE` ends with the §22.1
  paragraph about fonts. Add one sentence making explicit that **converting a
  font with `<bdf>` does not change its licence** — the compiled array carries
  whatever terms the BDF did — and that U8G2's own fonts carry per-group terms
  (the fntgrp link is already there). Mirror the same statement in
  `THIRD-PARTY-NOTICES.md` in a short *Fonts and images* section, which also
  says the same for a `<convert>` PNG.

- [ ] **2. What this repository now carries.** Audit
  `git diff --stat main..HEAD` for third-party material the PR added, and
  give each a notices entry or a stated reason it needs none:
  - U8G2's public-domain `4x6.bdf`, copied into
    `cli/test/integration/fixtures/valid-project/fonts/` and
    `test/generated_fixture/assets/fonts/` (test fixtures; not in the npm
    package — confirm with `npm pack --dry-run`);
  - the hand-written `arrow_mini.bdf` and the generated fixture PNG (ours,
    MIT — confirm their headers or generating scripts say so);
  - the bdfconv Wasm and Emscripten glue rows WO1 added — re-read them against
    what now ships (WO2 changed the glue file's name and format) and fix any
    stale file name.

- [ ] **3. The npm package carries its licence.** Run `npm pack --dry-run` in
  `cli/`. npm includes a `LICENSE` only from the package directory, and
  `cli/` has none, so the MIT text and the font paragraph are probably
  missing from the published package. If so, fix it in the way that cannot
  drift — for example copying the root `LICENSE` in a `prepack` script, or a
  committed copy plus a test that it is byte-identical to the root file. State
  which and why. Confirm `LICENSES/` (WO1) is still listed.

- [ ] **4. Migration rehearsal — report only, nothing committed from it.**
  departures-board-v3 has **14** BDFs in `src/fonts/source/` and ships
  compiled arrays in `src/fonts/fonts.cpp`, produced by its
  `scripts/build_fonts.py` with `bdfconv -f 1 -m '0-65535' -n <name>`, from
  the same bdfconv source as our pinned submodule (PA-measured).
  - Copy the 14 BDFs into a scratch project under `tmp/`, declare each as a
    `<bdf>` with **no** `range`, and run the **built** CLI
    (`node cli/dist/node/cli.js generate`).
  - For every array in `fonts.cpp`, find the BDF it came from (read
    `build_fonts.py` to learn the name mapping; some arrays may come from
    non-BDF sources — say which) and compare **bytes** — parse both sides
    into byte arrays with a small script in `tmp/`, independent of
    `cli/src/core/fonts/bdfconv-output.ts`.
  - Report a table: font, our byte count, theirs, identical yes/no. For any
    mismatch, find the cause (post-processing in `build_fonts.py`, a
    different map, a stale committed `fonts.cpp`, …) with evidence, and say
    whether PR-05 needs to do anything about it. Do not "fix" either side.
  - Paste the budget the CLI printed for that project.

## Verification Requirement

Before each commit: `npm test`, `npm run lint`, `npm run build` all green from
`cli/`.

**Branch hygiene (rule 04):** run `git branch --show-current` **as its own
command** immediately before every commit and confirm it prints
`u8g2gl-fonts/wo5-docs-rehearsal`. Do not push. Commit style
`docs(notices): …`, `chore(cli): …`; end each message with a
`Co-Authored-By:` line naming the model you actually are, exactly as your
system context names it, with `<noreply@anthropic.com>`.

Commit on green without asking. When done, append the Completion Report and
commit it as `docs(workspace): WO5 Completion Report`.

## Issue Surfacing

A defect or concern *outside your boundary box* goes in the Completion Report
under *Out-of-Scope Findings*. Do not file issues and do not fix it.

---

## Completion Report (written by the worker at task completion)

```markdown
---
## Completion Report

### Status
complete | partial | blocked

### Changes Made
- `path` — what changed and why

### npm package contents
<!-- Before and after, for LICENSE and LICENSES/. -->

### Migration rehearsal
| Array in fonts.cpp | Source | Ours (B) | Theirs (B) | Identical |
|---|---|---|---|---|

- Causes of any mismatch, with evidence:
- What PR-05 needs to know:
- Budget output:

### Decisions Made
- Decision and rationale

### Out-of-Scope Findings
- Including any now-wrong lines in docs/, with suggested wording.

### Blockers
(none)
```

---
## Completion Report

### Status
complete

### Changes Made
- `LICENSE` — one paragraph added after the "Fonts you supply yourself" paragraph: converting a font with `<bdf>` does not change its licence; the array carries whatever terms the BDF carried. (The U8G2 per-group terms and fntgrp link were already there.)
- `THIRD-PARTY-NOTICES.md` — new *Fonts and images* section (conversion keeps the licence, for `<bdf>` and for a `<convert>` PNG; U8G2's fonts are per-group); new *Material committed to this repository for testing* table giving 4x6.bdf (public domain, U8G2 2.36.18, test-only), arrow_mini.bdf (MIT, SPDX header confirmed) and logo_mark.png (MIT, generated by `cli/test/fixtures/make-fixture-logo.ts`, SPDX header confirmed, byte-identity already test-enforced), each with "in the npm package? No". Fixed the two rows that named the stale `bdfconv-glue.json`: the glue is `src/data/bdfconv/bdfconv-glue.generated.ts`, shipped as `dist/data/bdfconv/bdfconv-glue.generated.js`.
- `cli/LICENSES/emscripten-glue-MIT.txt` — same stale file name corrected (this file ships in the package; a one-token fix, noted as a small step past the literal box).
- `cli/package.json` — removed `src/data/bdfconv/bdfconv-glue.json` from `files`: it no longer exists (WO2 renamed it); it only ever matched nothing.
- `cli/LICENSE` — new, a committed copy of the root `LICENSE`.
- `cli/test/packaging/package-licence.test.ts` — new, 3 tests: cli/LICENSE byte-identical to root; `npm pack --dry-run --json` lists `LICENSE` and >=2 `LICENSES/` files; every path in `files` exists.
- Commit `9791ee0` (`docs(notices): ...`). CLI tests 1265 -> 1268; lint, build green.

### npm package contents
Before: `LICENSES/bdfconv-BSD-2-Clause.txt`, `LICENSES/emscripten-glue-MIT.txt` listed; **no `LICENSE`** (the MIT text and font paragraph were missing from the tarball). `package.json` `files` also named a nonexistent glue path.
After: `LICENSE` (1.8 kB) plus both `LICENSES/` files listed; glue ships as `dist/data/bdfconv/bdfconv-glue.generated.js`, wasm as `dist/data/bdfconv/bdfconv-wasm.json` and `src/data/bdfconv/bdfconv-wasm.json`. No `test/` file in the tarball, so the fixtures are confirmed not published.

### Migration rehearsal
Scratch project `tmp/rehearsal/proj` (git-ignored): the 14 BDFs from `src/fonts/source/`, each a `<bdf>` with no `range`, built with `node cli/dist/node/cli.js generate`. Both sides parsed by `tmp/rehearsal/compare.py`, independent of `bdfconv-output.ts` (it decodes C octal, hex and raw-char string-literal escapes and counts the literal's implicit terminating NUL, which is what `sizeof` sees).

| Array in fonts.cpp | Source | Ours (B) | Theirs (B) | Identical |
|---|---|---|---|---|
| FormationIcons7 | FormationIcons7.bdf | 85 | 85 | yes |
| NatRailClockLarge9 | NatRailClockLarge9.bdf | 154 | 154 | yes |
| NatRailClockSmall7 | NatRailClockSmall7.bdf | 137 | 137 | yes |
| NatRailSmall9 | NatRailSmall9.bdf | 947 | 947 | yes |
| NatRailTall12 | NatRailTall12.bdf | 1221 | 1221 | yes |
| SWRClockHuge11 | SWRClockHuge11.bdf | 193 | 193 | yes |
| SWRClockMega13 | SWRClockMega13.bdf | 251 | 251 | yes |
| Underground10 | Underground10.bdf | 1079 | 1079 | yes |
| UndergroundClock8 | UndergroundClock8.bdf | 168 | 168 | yes |
| WeatherIcons11 | WeatherIcons11.bdf | 173 | 173 | yes |
| WeatherIcons16 | WeatherIcons16.bdf | 225 | 225 | yes |
| WifiIcons11 | WifiIcons11.bdf | 138 | 138 | yes |
| (no array) | RailClockHuge11.bdf | 193 | - | n/a |
| (no array) | RailClockMega13.bdf | 251 | - | n/a |

All 12 arrays are byte-identical; every array comes from a BDF (none from a non-BDF source). 12 BDFs are generated from a `.txt` by `txt_to_bdf`; the array name is the BDF filename stem.

- Causes of any mismatch, with evidence: none. The two BDFs without an array, `RailClockHuge11.bdf` and `RailClockMega13.bdf`, are untracked stale leftovers: `build_fonts.py` only globs `*.txt`, they have no `.txt`, `.gitignore` line 43 ignores `src/fonts/source/*.bdf`, and `diff` against `SWRClockHuge11.bdf` shows only the `FONT` line differs (our arrays for them are 193 and 251 bytes, the same as the SWR ones). departures-board-v3 never compiles them. Their sizes are in the budget below, so the real project's figure is 5215 - 193 - 251 = **4771 bytes**.
- What PR-05 needs to know: (1) no data-level work; `<bdf>` with no `range` reproduces `bdfconv -f 1 -m '0-65535'` exactly. (2) Font names must match `[a-z][a-z0-9_]*`, so the PascalCase names (`NatRailSmall9`) must be renamed lowercase (`natrailsmall9`) in `<fonts>`, and the C++ that referenced the array names must use the generated `ui_font_<name>` / `ui_fontdata_<name>` symbols. (3) Generated arrays are `static const` behind a `ui_font_<name>` pointer, not the old public `const uint8_t Name[]`. (4) `fonts.cpp` there is a git-ignored build artefact, and `source/*.bdf` are too; the rehearsal used the local working-tree copies, so it proves parity with what that checkout built, not with any committed data.
- Budget output (`fonts (compiled bdf) (14)`):
```
  FLASH
    runtime core                          unmeasured
    framework element classes (1)         unmeasured
    custom element classes (1)            unmeasured
    fonts (builtin) (0)                   unmeasured
    fonts (compiled bdf) (14)             5215 bytes
    image data (bitmap arrays) (1)           8 bytes
    generated code                        unmeasured
    ------------------------------------------------
    derivable                             5223 bytes
```
(The 8 bytes of image data is the fixture wifi.xbm carried over from the template project.)

### Decisions Made
- Item 3: committed `cli/LICENSE` plus a byte-identity test, not a `prepack` copy. A `prepack` copy would need `cli/LICENSE` in `.gitignore`, which is outside the box; the test makes drift a failing build, and the package works with a plain `npm pack` and no lifecycle scripts.
- Also fixed the stale filename in `cli/LICENSES/emscripten-glue-MIT.txt` and in `package.json` `files` (item 2 says fix stale names; both ship in the package).
- Rehearsal: used lowercase names for the `<bdf>` declarations (validator requires it) and dropped `<focus_ring>` from the scratch screen only.

### Out-of-Scope Findings
- `cli/dist/data/bdfconv/bdfconv-glue.json` (60 kB) is in the local, git-ignored `dist/` and is packed into the tarball. It is a leftover of the pre-WO2 build (`tsc` never cleans `dist/`), so a developer's local `npm pack` ships a stale file; a release from a clean checkout would not. Suggest the release procedure runs from a clean `dist/` (e.g. `rm -rf dist && npm run build`, or a `prebuild` clean). `cli/src/` and the build config are outside this box.
- `docs/design_spec.md` line 2075 (the §22 table row): "`bdfconv` (build-time tool only) | BSD 2-clause | Yes — build tool, not linked". Since WO1 the compiled bdfconv Wasm and the Emscripten glue ship in the npm package. Suggested wording: "`bdfconv` (compiled to WebAssembly and shipped in the npm package; also used at build time) | BSD 2-clause | Yes — shipped in the package, with its licence text in `LICENSES/`". The line after it, "Emscripten toolchain (build-time)", likewise should say its generated glue code ships (MIT).
- `docs/design_spec.md` line 2088, the quoted "Summarised in the shipped `LICENSE`" text: it now omits the sentence added here. Suggested addition: "Converting a font does not change its licence: the compiled array carries whatever terms the BDF carried."

### Blockers
(none)
