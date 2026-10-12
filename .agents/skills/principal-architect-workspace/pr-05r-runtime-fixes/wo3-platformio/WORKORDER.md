---
work_order: WO3
project: pr-05r-runtime-fixes
title: "The capacity header reaches the runtime, and the manifest reaches native builds"
branch: u8g2gl-05r/wo3-platformio
base: u8g2gl-05r/wo2-screen-discovery
complexity: architect
status: dispatched
---

# WO3 — a capacity header every build system can deliver, and a manifest that builds natively

## Authorization

Part of PR-05R (`pr-05r-runtime-fixes`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition, and "Rulings" R4 states this WO's
design. This WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-05r`.** **Branch**:
`u8g2gl-05r/wo3-platformio` (already checked out, no upstream) · **Base**:
`u8g2gl-05r/wo2-screen-discovery`. Run `git branch --show-current` **as its own command immediately
before every commit** (`.agents/rules/04-branch-hygiene.md`). Scratch files and the PlatformIO
measurement projects go in `tmp/` in this worktree (`.agents/rules/02-workspace.md`), never in
`/tmp`. **Do not touch `../esp32-app-foundation*`** — read it for reference only.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. A decision this WORKORDER does not cover and that cannot be made inside
the Boundary Box: commit what is green, set `status: blocked`, write the Completion Report, stop.

## Standards

Load `u8g2gl-standards` first: `references/cpp.md`, `references/typescript.md`,
`references/documentation.md`. **§4.1** on lines you add or change: cite published references
(`§16`, `§18`, `[D-21]`) and measured facts; no work-order tags, no workspace paths, no narrated
debate. Pre-existing citations are not yours to sweep.

---

## Objective

A PlatformIO, CMake or ESP-IDF consumer can follow the generated header's own advice and get a
binding pool sized from the project, with no effect on unrelated libraries; the §18 budget says
truthfully what that costs and what it depends on; and `library.json` no longer keeps the runtime
out of a native PlatformIO build.

## Background (PA scoping)

- **Item 5.** `cli/src/core/generator/emit/generated-config.ts:161-176` emits advice to force-include
  `u8g2gl_generated_config.h` project-wide (`build_flags = -include generated/...` for PlatformIO;
  `add_compile_options(-include ...)` for CMake / ESP-IDF). The runtime sizes
  `s_binding_pool[U8G2GL_MAX_TOTAL_BINDINGS]` (`src/u8g2gl_obj.cpp:367`) from
  `include/u8g2gl/u8g2gl_config.h:89`, whose default is objects × bindings-per-object.
- **Measured in PR-05 on a real multi-library firmware (foundation, `esp32dev`):** the project-wide
  `-include` fails on the first unrelated library — `u8g2gl_generated_config.h:30:10: fatal error:
  u8g2gl/u8g2gl_version.h: No such file or directory`, first in Arduino `FS`, then `PsychicHttp`.
  It would also reach C units, where `static_assert` is not a keyword before C23. What works is a
  build middleware adding the `-include` to the runtime's own sources only. It cut `s_binding_pool`
  from **6144 B to 96 B** and `esp32dev` RAM from 63388 B to 57340 B. Reference implementation,
  read only: `../esp32-app-foundation-u8g2gl/scripts/u8g2gl_generate.py`.
- **Item 6.** `library.json` declares `"frameworks": "arduino"`, `"platforms": "*"`. A native env
  has no framework, so PlatformIO's library finder never builds the runtime there. Foundation works
  around it with `-I .pio/libdeps/native/u8g2gl/...` and a test-local unity file
  (`../esp32-app-foundation-u8g2gl/platformio.ini`, native env). Its native env also compiles
  U8G2 with `-DU8G2_WITHOUT_FONT_ROTATION` and supplies Arduino shims; the runtime includes
  `U8g2lib.h`, which needs `Arduino.h`/`Print.h`.
- `pio` is installed (`/opt/homebrew/bin/pio`). The PlatformIO MCP tools may also be available;
  use whichever works, and say which.

## The design (owner ruling R4, PROJECT.md)

**A `U8G2GL_GENERATED_CONFIG` macro naming the header, included from `u8g2gl_config.h`.** Only
runtime sources and generated code include `u8g2gl_config.h`, so a project-wide `-D` cannot reach
an unrelated library or a C unit — it is inert there. One form for CMake, ESP-IDF and PlatformIO.

**Measure before committing to it.** If PlatformIO's handling of a string-valued `-D` defeats the
macro in a form a user can reasonably write in `platformio.ini`, fall back to the middleware: put
its working form in the generated header's comment and document it. Either way the header's advice
must be a form you have built.

## Line-Item Instructions

- [ ] **Baseline first**, from a clean configure, each suite alone: C++ (expect **410**, one skip,
      **0** warnings — confirm against the WO1 Completion Report's final figure) and CLI (vitest
      **1349**, `tsc`, lint).
- [ ] **Measurement rig** in `tmp/pio/`: an `esp32dev` Arduino project depending on this worktree
      (`lib_deps = symlink://<worktree>` or a file path), a generated project (any fixture, e.g.
      `cli/test/generator/fixtures/emit-project`, generated with the built CLI), and **at least one
      unrelated library that compiles C and C++ units** (Arduino `FS` is a known first failure).
      Measure, with build output pasted:
  - [ ] **A** — the current advice, project-wide `-include`: reproduce the failure.
  - [ ] **B** — the middleware form (PR-05's): builds; `s_binding_pool` size from the map file or
        `nm -S`.
  - [ ] **C** — the macro form, after implementing it: builds; same pool size as B; the unrelated
        libraries' compile lines carry an inert `-D` and nothing else. Record the exact
        `platformio.ini` spelling that works, including quoting, and whether `${PROJECT_DIR}` or a
        relative path is needed (state what the path is relative to).
  - [ ] **Pool size without the header** (the default), for the budget wording.
- [ ] `include/u8g2gl/u8g2gl_config.h` — include `U8G2GL_GENERATED_CONFIG` when defined, before the
      defaults it overrides. Check for an include cycle through `u8g2gl_version.h` and say what you
      found. Update the file doc.
- [ ] `cli/src/core/generator/emit/generated-config.ts` — replace the emitted advice with the
      measured form for CMake, ESP-IDF and PlatformIO (or the middleware, if C failed). Update the
      file's own header comment (`:28-42`), which explains why a forced include was chosen.
- [ ] The C++ suite's generated-fixture build and `version_guard_generated_config`
      (`test/CMakeLists.txt`) currently deliver the header somehow — switch them to the advised form
      so the suite proves the advice, not a different mechanism.
- [ ] **§18 budget** (`cli/src/core/generator/report/budget.ts:387` and its tests): the binding
      pool line must not imply a figure the firmware will not have. State the slot count the header
      sets, the default it replaces, and that it holds only when the header reaches the runtime via
      `U8G2GL_GENERATED_CONFIG`. Keep the existing rule that the generator never invents a `sizeof`
      (`SIZEOF_REASON`). Do not add a detection mechanism; if you see a cheap one, report it.
- [ ] `docs/design_spec.md` §16 (build integration) and §18/§18.1 — the advised form, and the
      measured 6144 B → 96 B as the reason it matters. **Only those sections.**
- [ ] **Item 6:** in `tmp/pio/`, a `native` env consuming the runtime with `"frameworks": "*"`.
      Record what PlatformIO's library finder does, and what the consumer must still supply (U8G2's
      C sources and an Arduino `Print` shim, at least). Then confirm the `esp32dev` Arduino build is
      unaffected. **Decision rule:** if `"*"` lets the finder build the runtime natively and breaks
      nothing on Arduino, adopt it and document the native consumer's obligations in §16. If it
      breaks something, keep `"arduino"`, document the measured reason in §16, and report.
- [ ] Regenerate goldens: **`npx tsc` (or `npm run build`) first** — `refresh-goldens.mjs` reads
      `dist/` and silently regenerates stale output otherwise. The golden diff must be the advice
      comment only; review every line.

## Strict Boundary Box

- **In:** `include/u8g2gl/u8g2gl_config.h`, `cli/src/core/generator/emit/generated-config.ts`,
  `cli/src/core/generator/report/budget.ts`, their tests, goldens and the compile fixture
  (`test/generated_fixture`), `test/CMakeLists.txt` where it delivers the header, `library.json`
  `frameworks` only, design_spec §16 and §18.
- **Out:** versions (`package.json`, `u8g2gl_version.h`, `CMakeLists.txt` VERSION, `library.json`
  `version` — WO4); the version-pin test in `cli/test/integration/generate.test.ts` (WO4); the
  state saver and widgets (WO1); the project reader (WO2); anything in foundation's repositories.

## Verification Requirement

- [ ] C++ from a **clean configure**: **0** warnings; ctest at the baseline plus any new tests, one
      skip. CLI: vitest, `tsc`, lint clean. State both totals.
- [ ] Measurements A, B, C, the default pool size, and the native result pasted with the
      `platformio.ini` excerpts that produced them.
- [ ] The emitted advice is character-for-character the form measurement C (or B) built.
- [ ] Golden diff is the advice comment only.
- [ ] `git diff --name-only <base>..HEAD` within the Boundary Box.

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix them, do not file issues. Known and
handled elsewhere: version bumps and the version-pin test (WO4); `u8g2gl_obj.h`'s
`render_animation_update()` doc (WO5).

---

## Completion Report (append below on completion)

Use: Status · Baseline and final counts · Changes Made · Decisions Made · Evidence (A/B/C, default,
native) · Dead Ends & Warnings · Out-of-Scope Findings · Blockers.
