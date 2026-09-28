---
name: pr-04b-font-image-pipeline-wo3b
description: Handoff instructions for Work Order 3b — the fixture, real U8G2, and the editor target
complexity: standard
---

# WO3b — the fixture, real U8G2, and the editor target

**Parent project:** PR-04b, the font and image pipeline —
[PROJECT.md](../PROJECT.md). The owner's approval of this decomposition is
recorded verbatim in that file under *Human approval of this decomposition*.

**Branch:** `u8g2gl-fonts/wo3b-bdf-fixture` (already created, base
`u8g2gl-fonts/wo3-bdf-generate`). **Working tree:**
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

Prove that a compiled `<bdf>` font is what **real U8G2** consumes: put `<bdf>`
fonts into the committed compile-layer fixture, compile the generated C++,
link it against U8G2's own C sources, and measure the result. Make the editor
target handle `<bdf>` fonts exactly as it handles `<builtin>` ones. Fix two
things the PA found reviewing WO3.

## Read first

- [PROJECT.md](../PROJECT.md) — Session Log entries *WO2 ingested* and
  *WO3 ingested*.
- WO3's Completion Report, [../wo3-bdf-generate/WORKORDER.md](../wo3-bdf-generate/WORKORDER.md),
  especially *The surface WO3b and WO4 will use*.
- `test/CMakeLists.txt` — how `test_generated_fixture` builds against the stub,
  and how `u8g2gl_real_u8g2` and `test_rbox_bound.cpp` link **real** U8G2 C
  sources (PR-4R's radius-bound test: the pattern to copy — measure, then pin
  in a test that fails if a U8G2 bump changes the answer).
- `test/editor_host/editor_host.cpp` — `provide_font(name, data)`: the host,
  not the registry, supplies font bytes by name.
- `cli/test/generator/refresh-goldens.mjs`, `compile-fixture.test.ts`,
  `determinism.test.ts`, `emit-editor.test.ts`.

## Strict Boundary Box

**In scope:**
- `cli/src/core/assets/**`, `cli/src/core/generator/generate.ts` — item 1.
- `cli/src/core/generator/emit/fonts.ts` — item 2, and anything item 5 needs.
- `cli/src/core/generator/emit/scene.ts` and the editor target's other
  emitters — item 5 only.
- `cli/test/**` — including `refresh-goldens.mjs`, which must call
  `compileProjectAssets` before `generate` if it does not already.
- `test/generated_fixture/**` — new assets, `globals.xml`, one or more screens
  using the new fonts, regenerated `generated/` and `generated_editor/`.
- `test/stubs/U8g2lib.h` — `U8G2_FONT_SECTION` if the stub lacks it (it does).
- `test/CMakeLists.txt`, new `test/test_*.cpp` files, `test/editor_host/**`
  only as item 5 needs, `test/generated_fixture/support/**`.
- This WORKORDER's Completion Report.

**Explicitly out of scope:**
- The C++ runtime (`include/`, `src/`), the root `CMakeLists.txt` — if the
  runtime needs a change, stop that item and report it.
- `<convert>` (WO4). `extern/u8g2/**` (read-only). `docs/**`, `LICENSE`,
  `THIRD-PARTY-NOTICES.md` (WO5 does notices), `.agents/**` except this file.
- `cli/src/core/fonts/**`, `cli/src/data/bdfconv/**` — final.
- The schema, manifests, CLI version (stays 0.9.0).

## Tooling Constraints

- CLI, from `cli/`: `npm test`, `npm run lint`, `npm run build`.
- C++, from the repo root: configure and build into `build/` (git-ignored) the
  way the existing suite is built (read `test/CMakeLists.txt` and any build
  notes in PR-04's WORKORDERs for the exact commands), then `ctest`. Baseline:
  **377 tests, one known skip (`SizeOfReport.ThirtyTwoBitTarget`), zero
  warnings** under `-Wall -Wextra -Wpedantic`. Run the C++ and CLI suites
  **one after the other**, not concurrently.
- Scratch files in `tmp/` at the repo root — never `/tmp`.
- Load the **`u8g2gl-standards`** skill before writing code (both `cpp.md` and
  `typescript.md` apply here).

## Line-Item Instructions

- [ ] **1. Failed fonts are data, not inferred from diagnostic text.** WO3's
  `generate()` works out which fonts failed to compile by reading
  `offendingText` off the compile step's diagnostics (`generate.ts` ~line 229),
  and changed those diagnostics' `offendingText` to the font name so that it
  could. Presentation fields must not drive control flow: reword a diagnostic
  and the "host forgot `compileProjectAssets()`" guard silently changes
  behaviour. Give the compile result an explicit set of failed font names,
  drive the guard from it, and return the new diagnostics' `offendingText` to
  the convention `images.ts` uses. Test the guard for all three cases:
  compiled, failed (no second diagnostic), and never compiled (the guard's
  diagnostic).

- [ ] **2. No work-order references in generated output.** The provenance
  comment WO3 emits says `range: unfiltered (every glyph — no range declared,
  WO3 item 1)`. Generated files are the user's; internal ticket numbers do not
  belong there. Reword (e.g. `range: none — every glyph`) and grep every
  emitter's **emitted strings** (not source comments) for `WO\d`, `PR-\d` and
  similar; fix any you find, and list them.

- [ ] **3. `<bdf>` in the committed fixture.** Add to `test/generated_fixture/`:
  - U8G2's public-domain `extern/u8g2/tools/font/bdf/4x6.bdf`, copied to
    `assets/fonts/4x6.bdf`, with a `LICENSE` beside it quoting the BDF's own
    `COPYRIGHT` line and naming its origin (U8G2 2.36.18, `tools/font/bdf/`),
    declared with `range="0x20-0x7F"`;
  - a small BDF **you write** (MIT, header comment saying so), with glyphs
    below 0x20, in ASCII, and **above 0xFF** (e.g. U+2190 ←), declared with
    **no** `range`, and no licence file beside it;
  - at least one element on a screen that uses each font, so `set_font` with
    a `<bdf>` font goes through the emitter.
  Regenerate `generated/` and `generated_editor/` with `refresh-goldens.mjs`
  and review the diff by eye before committing. Existing determinism and
  golden tests must cover the new files without special cases.

- [ ] **4. Real U8G2 consumes the generated array — `test/test_bdf_real_u8g2.cpp`**
  (name yours). Build the fixture's generated `ui_fonts.cpp` against **real**
  U8G2 (as `u8g2gl_real_u8g2` / `test_rbox_bound` do — not the stub) and assert,
  on a real `u8g2_t` with a full-buffer memory setup:
  - `ui_font_<4x6 name>` is byte-identical to U8G2's own `u8g2_font_4x6_tr`
    (`memcmp` over the full length, and equal lengths — `sizeof` the
    `ui_fontdata_` array if you can reach it, otherwise say how you got the
    length);
  - with each compiled font set, `u8g2_GetMaxCharHeight`, `u8g2_GetAscent`,
    `u8g2_GetDescent` and `u8g2_GetStrWidth` for a fixed string equal
    values **measured from the BDF itself** (`FONTBOUNDINGBOX`, per-glyph
    `DWIDTH`/`BBX`). Derive the expected numbers by reading the BDF, write
    them into the test as constants with a comment showing the derivation;
    do not derive them from U8G2's output;
  - for your own font, draw the above-0xFF glyph with `u8g2_DrawGlyph` and the
    below-0x20 one, and compare the buffer's pixels with the BDF's `BITMAP`
    rows. This is the test that proves the absent-`range` fix reaches the
    screen.
  Header comment: this test exists so that a U8G2 bump which changes the
  converter or the font format fails the build.

- [ ] **5. The editor target.** Trace how the editor target handles a
  `<builtin>` font end to end: `scene.ts` lists font names, the registry's
  `font` property takes `value.pointer`, and `editor_host::provide_font`
  supplies bytes by name. Make a `<bdf>` font follow the same path — listed by
  its declared name, resolved by `provide_font` with its compiled bytes — so
  the designer can compile it with `compileBdf` and hand over the bytes. Extend
  the existing editor-parity test (`test_editor_parity.cpp` and/or
  `emit-editor.test.ts`) so a screen using a `<bdf>` font produces the same
  draw-call history in the editor host as in firmware. If `scene.json` needs
  to tell the designer anything new about a `<bdf>` font (e.g. its `src` and
  `range`), stop: that is editor-contract surface for the PA — report what you
  would add and why, and do not add it.

- [ ] **6. Run everything, sequentially,** and report counts: C++ (377 + new,
  one known skip, zero warnings) and CLI (1158 + new).

## Verification Requirement

Before each commit: `npm test`, `npm run lint`, `npm run build` from `cli/`,
and — for any commit touching C++ or the fixture — the full C++ build and
`ctest`, with zero warnings. Report final counts for both suites.

**Branch hygiene (rule 04):** run `git branch --show-current` **as its own
command** immediately before every commit and confirm it prints
`u8g2gl-fonts/wo3b-bdf-fixture`. Do not push. Commit style `fix(cli): …`,
`test: …`, `feat(cli,test): …`; every message ends with:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

Commit on green without asking. When done, append the Completion Report and
commit it as `docs(workspace): WO3b Completion Report`.

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

### Measurements
- Metrics derived from each BDF vs U8G2's answers:
- memcmp against u8g2_font_4x6_tr:
- Glyph pixel comparison (above-0xFF, below-0x20):
- Suite counts (C++, CLI), warnings:

### Emitted strings that referenced internal tickets
- file:line — before → after

### Editor target
<!-- How a <bdf> font travels, and anything you would add to scene.json but did not. -->

### Decisions Made
- Decision and rationale

### Dead Ends & Warnings
- What was attempted, why it failed, what to avoid

### Out-of-Scope Findings
- Finding and suggested action

### Blockers
(none)
```
