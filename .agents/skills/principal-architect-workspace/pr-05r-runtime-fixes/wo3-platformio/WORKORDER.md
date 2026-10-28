---
work_order: WO3
project: pr-05r-runtime-fixes
title: "The capacity header reaches the runtime, and the manifest reaches native builds"
branch: u8g2gl-05r/wo3-platformio
base: u8g2gl-05r/wo2-screen-discovery
complexity: architect
status: complete
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

**Work only in `../U8G2GL-05r`.** **Branch**:
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
- A scratch rig already exists in `tmp/pio/` (envs `default`, `a_include`, `b_middleware`, a
  `lib/mixed_c_cpp` library, a generated fixture project). It is unbuilt except for one PA
  build: **measurement A was reproduced by the PA through the MCP** (`build_project`, env
  `a_include`): `./generated/u8g2gl_generated_config.h:30:10: fatal error:
  u8g2gl/u8g2gl_version.h: No such file or directory`, first in Arduino `SPI` and `Wire`. Reuse or
  rebuild the rig as you see fit; re-run A yourself for your own evidence.

## The design (owner ruling R4, PROJECT.md)

**A `U8G2GL_GENERATED_CONFIG` macro naming the header, included from `u8g2gl_config.h`.** Only
runtime sources and generated code include `u8g2gl_config.h`, so a project-wide `-D` cannot reach
an unrelated library or a C unit — it is inert there. One form for CMake, ESP-IDF and PlatformIO.

**Measure before committing to it.** If PlatformIO's handling of a string-valued `-D` defeats the
macro in a form a user can reasonably write in `platformio.ini`, fall back to the middleware: put
its working form in the generated header's comment and document it. Either way the header's advice
must be a form you have built.

## Tooling Constraints — PlatformIO MCP only

**The owner has denied direct use of the `pio` CLI.** Every PlatformIO operation — build, clean,
environment listing, size/map measurement, tests — goes through the PlatformIO MCP server:

- Load the `platformio-mcp:pio-manager` skill first and follow it.
- Load the tools with ToolSearch, e.g. `select:mcp__plugin_platformio-mcp_platformio__build_project,
  mcp__plugin_platformio-mcp_platformio__check_task_status,mcp__plugin_platformio-mcp_platformio__size_report,
  mcp__plugin_platformio-mcp_platformio__project_envs,mcp__plugin_platformio-mcp_platformio__clean_project,
  mcp__plugin_platformio-mcp_platformio__agent_build_diagnose`.
- Always pass `projectDir` and `environment`. Use `background: true` for builds and poll
  `check_task_status`. The policy profile (`flash_requires_approval`) allows building without
  approval; nothing in this WO flashes.
- Reading the MCP's own build logs and the `.pio/build/<env>/` artefacts (map file, ELF via `nm` /
  `xtensa-*-nm` from the toolchain package) with ordinary read-only shell commands is fine.
- **No `pio`/`platformio` shell commands, and no wrapper scripts that call them.** If the MCP
  refuses or cannot do something you need, paste the refusal or error word for word, commit what
  is green, set `status: blocked`, and stop — do not fall back to the CLI.

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

### Status

**complete** — implementation commit `373d72f`. Design R4 adopted (the `U8G2GL_GENERATED_CONFIG`
macro); PlatformIO's quoting did not defeat it. Item 6: `"frameworks": "*"` adopted.

### Baseline and final counts

| | Baseline (clean configure, each suite alone) | Final |
|---|---|---|
| C++ build warnings | 0 | **0** |
| ctest | **410** passed, 1 skip (`SizeOfReport.ThirtyTwoBitTarget`) — matches WO1's final figure | **410** passed, same 1 skip |
| vitest | **1349** | **1352** (+3, `budget-report.test.ts`) |
| `tsc`, lint | clean | clean |

No new C++ tests: the existing compile-fixture tests (`capacity_probe.cpp`'s `static_assert`, the
fixture capacity tests) and `VersionGuard.GeneratedConfigCompiles` now prove the advised form
instead of a forced include. Checked by hand that the probe fails without the definition
(`static assertion failed due to requirement '(32 * 8) == 7'`) and passes with it.

### Changes Made

- `include/u8g2gl/u8g2gl_config.h` — `#ifdef U8G2GL_GENERATED_CONFIG` / `#include
  U8G2GL_GENERATED_CONFIG` immediately after the include guard, before every default. File doc
  updated (delivery, inertness, no cycle; `Consumed Macros:` entry). **Cycle check:** the generated
  header includes only `u8g2gl/u8g2gl_version.h`, whose only `#include` lines are inside its doc
  comment, and does not include `u8g2gl_config.h`; a generated unit that includes the generated
  header first and `u8g2gl_config.h` later hits its include guard. No cycle.
- `cli/src/core/generator/emit/generated-config.ts` — emitted advice replaced (CMake/ESP-IDF
  `target_compile_definitions`, PlatformIO `-I generated` + escaped `-D`), with one line each on why
  not a forced `-include` and why not a `-D` capacity list. File header (`:26-42`) rewritten. New
  exports `GENERATED_CONFIG_MACRO` and `emittedBindingPoolSlots()` (the 0 → 1 floor, now shared by
  the header and the budget instead of being spelled twice).
- `cli/src/core/generator/report/budget.ts` — `binding pool slots` gains a `note`: the slot count
  the header sets (via `emittedBindingPoolSlots`), the default it replaces (256 =
  `U8G2GL_MAX_OBJECTS_PER_SCREEN` x `U8G2GL_MAX_BINDINGS_PER_OBJ`), and that it holds only through
  `U8G2GL_GENERATED_CONFIG`. Figure stays `unmeasured(SIZEOF_REASON)`. Printed as:
  `note — binding pool slots: u8g2gl_generated_config.h sets U8G2GL_MAX_TOTAL_BINDINGS to 6,
  replacing the runtime default of 256 slots (...). That holds only when the header reaches the
  runtime's own sources through U8G2GL_GENERATED_CONFIG (§16); a firmware built without it keeps
  the default.`
- Tests: `budget-report.test.ts` +3 (note content; floor agreement with the emitted `#define`;
  drift guard reading `u8g2gl_config.h`'s two defaults and the `MAX_TOTAL_BINDINGS` formula).
  `emit-golden.test.ts`'s advice test rewritten to the new lines and to refuse a `-include` line.
- Goldens: `npm run build` then `refresh-goldens.mjs`. Two files changed (the emit-project expected
  header and `test/generated_fixture/generated/u8g2gl_generated_config.h`); every changed line is in
  the advice comment. `generated_editor/` unchanged.
- `test/CMakeLists.txt` — `u8g2gl_fixture_runtime` (PUBLIC), `u8g2gl_fixture_fonts` and
  `version_guard_generated_config` now get `U8G2GL_GENERATED_CONFIG="<abs path>"` via
  `target_compile_definitions`, the advised CMake spelling; the forced `-include` of the generated
  config is gone (the fonts unit keeps its unrelated `fixture_u8g2_fonts.h` forced include).
- `library.json` — `"frameworks": "*"` (only that field).
- `docs/design_spec.md` — §16: the delivery, the table of forms, the quoting/path findings, why not
  a forced include or middleware, and the native consumer's obligations. §18.1: what the pool line
  says and the measured 6144 B → 96 B (foundation) / 6144 B → 144 B (rig).

### Decisions Made

- **PlatformIO spelling: bare file name + `-I generated`,** not `${PROJECT_DIR}/...`. Both built;
  the bare name needs no absolute path in the macro (an absolute path with a space would have to
  survive PlatformIO's flag splitting, which I did not test), and `-I generated` is already needed
  for the sketch's own `#include "ui.hpp"`.
- **CMake spelling: absolute path via `${CMAKE_CURRENT_LIST_DIR}`,** as before. CMake escapes the
  quotes itself (`flags.make`: `-DU8G2GL_GENERATED_CONFIG=\"/…/u8g2gl_generated_config.h\"`).
- **Shared floor helper** (`emittedBindingPoolSlots`) so the budget's "sets … to N" cannot disagree
  with the `#define` for a document with no bindings.
- **Default 256 spelled once in budget.ts, drift-guarded** by a test that reads the runtime header,
  rather than left unstated.
- **`version_guard/pre_macro/include_generated_config.cpp` switched by `#ifdef`:** the real-runtime
  control includes `u8g2gl/u8g2gl_config.h` under the macro; the frozen-0.6.0 build (no hook) still
  includes the header directly, as a generated unit would against that runtime.

### Evidence

All PlatformIO operations through the MCP: `project_envs`, `build_project` (background, polled with
`check_task_status`), `size_report` (filter `binding_pool`), `pkg_install` (once, see Dead Ends).
Pool sizes cross-checked with `xtensa-esp32-elf-nm -S` on the ELFs. Rig: `tmp/pio/` (esp32dev,
Arduino, `lib_deps = symlink://<worktree>`, U8g2 2.36.18, `lib/mixed_c_cpp` with a `.c` and a
`.cpp` unit, plus Arduino `FS`/`SPIFFS`; generated project = `emit-project` fixture regenerated with
the built CLI). Logs copied to `tmp/wo3/`. Common section:

```ini
[common]
platform = espressif32
board = esp32dev
framework = arduino
build_src_filter = +<*> +<../generated/>
build_flags = -I generated
lib_deps =
    symlink://<this worktree, absolute>
    olikraus/U8g2@^2.36.18
    mixed_c_cpp
lib_ldf_mode = deep+
```

**Default (no delivery)** — `[env:default] extends = common`. SUCCESS. `size_report`:
`s_binding_pool` **6144 B** (`u8g2gl_obj.cpp:367`); RAM 31588 B, flash 354464 B.

**A — project-wide `-include`** — `build_flags = ${common.build_flags}` +
`-include generated/u8g2gl_generated_config.h`. FAILED, first in Arduino `SPI` and `Wire`:
```
Compiling .pio/build/a_include/lib1fa/SPI/SPI.cpp.o
Compiling .pio/build/a_include/libb40/Wire/Wire.cpp.o
In file included from <command-line>:
./generated/u8g2gl_generated_config.h:30:10: fatal error: u8g2gl/u8g2gl_version.h: No such file or directory
```
Re-run after the change, with `"frameworks": "*"`: same failure (`:34:10`, the header grew).

**B — PR-05 middleware** (`extra_scripts = pre:middleware.py`, `AddBuildMiddleware` adding
`-include $PROJECT_DIR/generated/u8g2gl_generated_config.h` to the runtime's sources). SUCCESS.
`s_binding_pool` **144 B** (6 slots x 24 B); RAM 25588 B (−6000), flash 354476 B. The runtime's
compile lines carry the `-include`; `mixed_c.c.o` carries none. (First attempt matched nothing —
see Dead Ends.)

**C — the macro, exactly as emitted** (checked programmatically: the three emitted lines appear
verbatim in the env):
```ini
[env:c_macro]
extends = common
build_flags =
    -I generated
    -D U8G2GL_GENERATED_CONFIG=\"u8g2gl_generated_config.h\"
```
SUCCESS. `size_report`: `s_binding_pool` **144 B**, same as B; RAM 25588 B, flash 354476 B,
identical to B. Compile-line diff against `default` for unrelated units (`mixed_c.c.o`,
`mixed_cpp.cpp.o`, `FS.cpp.o`, `SPI.cpp.o`, U8g2's `u8g2_box.c.o` and `U8g2lib.cpp.o`): added
`-DU8G2GL_GENERATED_CONFIG=\"u8g2gl_generated_config.h\"`, removed nothing — nothing else.
- **Quoting:** the backslash-escaped quotes are required. Unescaped
  (`-D U8G2GL_GENERATED_CONFIG="u8g2gl_generated_config.h"`), PlatformIO strips them: FAILED,
  `u8g2gl_config.h:68:10: error: #include expects "FILENAME" or <FILENAME>` — loud, not silent.
- **Path:** the macro must name the file as found on the include path. A project-relative path
  (`\"generated/u8g2gl_generated_config.h\"`) FAILED: `fatal error:
  generated/u8g2gl_generated_config.h: No such file or directory` — a quoted `#include` searches the
  including file's directory (`include/u8g2gl/`) and the `-I` list, never the compiler's working
  directory. `-I generated` itself is relative to the project directory (PlatformIO passes
  `-Igenerated` through and compiles from there). `${PROJECT_DIR}/generated/u8g2gl_generated_config.h`
  (escaped) also SUCCEEDED, 144 B.

**Item 6 — native** (`platform = platformio/native@1.2.1`, no framework, `lib_deps` = worktree +
U8g2, `build_src_filter = -<*> +<../native/main.cpp> +<../generated/>`, the macro as above).
- `"frameworks": "arduino"`: `Framework incompatible library /Users/.../U8G2GL-05r` (and U8g2);
  the runtime is not built; compile fails on `'u8g2gl/u8g2gl_version.h' file not found`.
- `"frameworks": "*"`: `Dependency Graph |-- u8g2gl @ 0.7.0` — the finder builds the runtime
  natively, 0 compiler warnings. U8g2 is still `Framework incompatible` (an Arduino-format library,
  `library.properties`), with `Warning: Ignored 'U8g2' dependency for 'u8g2gl' library`; with only
  its `-I` paths the link fails on `_u8g2_ClearBuffer`, `_u8g2_DrawBox`, … (U8G2's C functions).
- Consumer obligations found, then built: `-I .pio/libdeps/native/U8g2/src`,
  `-I .pio/libdeps/native/U8g2/src/clib`, compile `src/clib/` via
  `+<../.pio/libdeps/native/U8g2/src/clib/>` in `build_src_filter`, and `Arduino.h`/`Print.h` shims
  (copies of `test/real_u8g2/`). SUCCESS; the program (generated UI init, activate, tick) runs and
  exits 0. `-DU8G2_WITHOUT_FONT_ROTATION` was not needed on this macOS clang host.
- **esp32dev unaffected** by `"*"`: `default`, `b_middleware` and `c_macro` rebuilt after the change
  succeed with the same pool sizes and RAM; the dependency graph is unchanged
  (`u8g2gl → U8g2 → SPI, Wire`).
- **Decision: adopt `"*"`**, obligations documented in §16.

### Dead Ends & Warnings

- **Middleware pattern missed silently.** PR-05's `"*/u8g2gl/src/*.cpp"` matched nothing here
  because a `symlink://` dependency keeps its directory name (`U8G2GL-05r`): the build was green and
  `s_binding_pool` stayed 6144 B. Fixed in the rig to `"*/U8G2GL-05r/src/*.cpp"`. Recorded in §16
  as a reason the middleware is the weaker form.
- **`platform = native` reported `UnknownPlatform: Unknown development platform 'native':`** through
  the MCP even though `~/.platformio/platforms/native` (1.2.1) is installed; `pkg_install` reported
  `native@1.2.1 is already installed`. `platform = platformio/native@1.2.1` works. Not investigated
  further (PlatformIO 6.1.19 / Python 3.14 package lookup); out of scope.
- PlatformIO wipes every env's build directory when `platformio.ini` changes, so size reports were
  re-taken from final rebuilds after the ini settled.
- Pre-existing LDF note on the esp32dev builds: `Warning! Circular dependencies detected between
  .../U8g2 and /Users/.../U8G2GL-05r` (deep+ mode). Not a compiler warning; not introduced here.
- `default`'s flash moved 354480 → 354464 B between my first and final builds with no runtime-code
  change between them (RAM identical); not chased.
- ESP-IDF form not built separately; the CMake form is (C++ suite). §16 says so.

### Out-of-Scope Findings

1. **Generated code does not compile on ESP32 for `ref_value="0"` on a bool subject.** The
   `emit-project` fixture's `<bind_flag_if_eq subject="wifi_connected" ref_value="0" …>` emits
   `bind_flag_if_eq(&ui_subject_wifi_connected, 0, U8G2GL_FLAG_HIDDEN)`, which on xtensa is
   `error: call of overloaded 'bind_flag_if_eq(u8g2gl_subject_bool_n<1>*, int, const uint8_t&)' is
   ambiguous` between the `int32_t` and `bool` overloads (`u8g2gl_obj.h:369-370`): `int32_t` is
   `long` there, so `int → long` and `int → bool` rank equally. Compiles on the host, where `int32_t`
   is `int`. The committed `test/generated_fixture` has the same line
   (`ui_screen_home.cpp:75`). I changed the rig's XML to `ref_value="false"`. Needs a generator or
   runtime fix and an on-target compile test; not mine to make.
2. `u8g2gl_config.h`'s header lists `U8G2GL_NO_PARENT` as an exported constant, but it is not
   defined in that file (pre-existing).
3. `cli/src/core/generator/report/model.ts`'s `BudgetLine.note` doc says the field "exists for the
   framebuffer"; it now also carries the binding pool's caveat. Outside my box; a one-line doc
   update.
4. Cheap detection idea (not built): no preprocessor check can see the library's compilation from a
   generated unit, but the linker can. `u8g2gl_obj.cpp` could define a symbol whose name encodes
   `U8G2GL_MAX_TOTAL_BINDINGS` (e.g. `u8g2gl_pool_slots_6`), and generated code reference the one
   for its own count; a runtime built without the header then fails to link with a named
   undefined symbol instead of silently keeping the default. Worth an architect look.
5. Touched two files the Boundary Box does not list by name, both comment/test-harness only and in
   the delivery path: `test/version_guard/pre_macro/include_generated_config.cpp` (the
   `version_guard_generated_config` source, which the WO asked to switch) and
   `test/test_generated_fixture.cpp` (one stale comment, "forced include").

### Blockers

None.
