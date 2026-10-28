---
work_order: WO-A
project: pr-05-integration
title: "The runtime becomes a PlatformIO library"
branch: u8g2gl-05/wo1-packaging
base: main @ 1254eb3
complexity: standard
status: complete
---

# WO-A: the runtime becomes a PlatformIO library

## Authorization

Part of PR-05 (`pr-05-integration`). Check two things in the committed files:

- `../PROJECT.md` "Human Approval" quotes the owner's approval of this decomposition.
- "Rulings" R2, R3 and R6, and "Bridge corrections" 1–3, state this WO's rules.

This WORKORDER's `status` must be `dispatched`. If any of this is missing, **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `.`.**
- **Branch:** `u8g2gl-05/wo1-packaging`, already checked out, no upstream.
- **Base:** `main` @ `1254eb3`.
- `extern/u8g2` is already initialised.

Run `git branch --show-current` **as its own command immediately before every commit**
(`.agents/rules/04-branch-hygiene.md`). Scratch files go in `tmp/` in this worktree, never in `/tmp`.

## COMMIT ON A GREEN BUILD, then PUSH THIS BRANCH

You are authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer.

When everything is green and committed, you are also authorized to push this one branch:
`git push -u origin u8g2gl-05/wo1-packaging`. Foundation needs a fetchable commit to pin (R6).

Do **not** tag, publish to npm or any registry, or open a PR.

A decision this WORKORDER does not cover, and that cannot be made inside the Boundary Box: commit
what is green, set `status: blocked`, write the Completion Report, and stop.

## Standards

Load `u8g2gl-standards` first (`.agents/skills/u8g2gl-standards/`): `references/cpp.md`,
`references/typescript.md` and `references/documentation.md`.

**§4.1** applies to lines you add or change. Cite published references (`§16`, `rules/03`) and
measured facts. No work-order tags (no "PR-05", "WO-A"), no workspace paths, no narrated debate.
Pre-existing citations are not yours to sweep.

---

## Objective

`lib_deps = https://github.com/cblabs-org/u8g2gl.git#<sha>` must install and build the runtime in
a PlatformIO project. It must fetch none of this repository's submodules, and the version it
declares must be one CMake has checked against `u8g2gl_version.h`.

## Strict Boundary Box

**In scope:**
- `library.json` (new)
- `CMakeLists.txt`: the version-agreement block, and the submodule message at `:84`
- `.gitmodules`
- `cli/test/integration/generate.test.ts:345`
- Every instruction that tells a contributor how to initialise a submodule: `CMakeLists.txt:84`,
  `.agents/skills/principal-architect-workspace/CONTEXT_BRIDGE.md:319`, and any other you find
  with `grep -rn "submodule update"`

**Out of scope:**
- Any file under `src/` or `include/`, and any generator or CLI source.
- Every version number. Runtime, CLI and schema all stay as they are, because metadata changes no
  output and no API.
- `library.properties` (see Instruction 6).
- Any change to `generate.test.ts:460-473`, "the 0.11.0 proof", which R2 keeps deliberately.
- Moving headers.

## Tooling Constraints

- **C++:** `cmake -S . -B build && cmake --build build -j && ctest --test-dir build --output-on-failure`.
- **CLI:** `cd cli && npm ci && npm run build && npm test && npm run lint`.
- Run the two suites **sequentially, never in parallel**: contended runs measure nothing.
- **PlatformIO verification:** `~/.platformio/penv/bin/pio` is permitted in **this** repository,
  inside `tmp/` only. Foundation's MCP-only rule governs foundation, not this tree.

---

## Line-Item Instructions

1. [ ] **`library.json`.** Write the PlatformIO manifest:
   - `name: "u8g2gl"`, and a `version` equal to `u8g2gl_version.h` (0.7.0).
   - `description`, `keywords`, `license: "MIT"`, `authors`, a `homepage`, and a `repository` of
     type git at `https://github.com/cblabs-org/u8g2gl.git`.
   - `frameworks: "arduino"`, because the runtime includes `U8g2lib.h`, Arduino's wrapper.
   - `platforms: "*"`.
   - `dependencies: { "olikraus/U8g2": "^2.36.18" }`, matching the pinned submodule tag.
   - An `export.exclude` list for `cli/`, `docs/`, `test/`, `extern/` and `.agents/`. It only
     affects `pio pkg pack`, but it stops a future packed archive from carrying them.

   Rely on the defaults (`src/` compiled, `include/` on the include path) unless measurement says
   otherwise. It must work with a consumer that uses `lib_compat_mode = strict` and
   `framework = arduino, espidf`, as foundation's `env:esp32dev` does.

2. [ ] **Version agreement at configure time** (`CMakeLists.txt`). Extend the existing block so
   configure **refuses** when `library.json`'s `"version"` differs from the header.
   - Use the same `FATAL_ERROR` style, naming both values and both files.
   - Use a regex on the file contents, **not** `string(JSON)`. That needs CMake 3.19, and the floor
     here is 3.16.
   - Add `library.json` to `CMAKE_CONFIGURE_DEPENDS`.
   - **Prove the refusal.** Temporarily set `library.json` to `0.7.1`, show configure fails with
     the message, restore it, and show configure passes. Record both outputs, trimmed, in the
     Completion Report.

3. [ ] **`.gitmodules`.** Add `update = none` to all four submodules (R3).
   - Update `CMakeLists.txt:84` to tell the contributor to run
     `git submodule update --init --checkout extern/u8g2`.
   - Fix every other initialisation instruction you find in the same way, including
     `CONTEXT_BRIDGE.md:319`, which keeps its `--reference` form plus `--checkout`.
   - **Measure:** clone this branch fresh (`git clone --recursive` from the local path into `tmp/`,
     using `-c protocol.file.allow=always`) and show that no submodule is populated. Then show that
     the new `--checkout` instruction populates `extern/u8g2`.

4. [ ] **`generate.test.ts:345`.** Replace the literal `0.11.0` in that one assertion with
   `packageVersion`, which is already read from `package.json` at `:24`. Leave `:460-473` alone.

5. [ ] **PlatformIO end to end.** This is the headline behaviour, so prove it.
   - After committing and pushing (see above), create `tmp/pio-consumer/`. Give it a
     `platformio.ini` with `platform = espressif32`, `board = esp32dev`,
     `framework = arduino, espidf`, `lib_compat_mode = strict`, and
     `lib_deps = https://github.com/cblabs-org/u8g2gl.git#<your pushed sha>`.
   - Give it a `src/main.cpp` that includes `u8g2gl/u8g2gl_version.h` and `u8g2gl/u8g2gl_core.h`,
     uses `U8G2GL_REQUIRE_RUNTIME_VERSION(0, 7);`, and calls `ui_handler` on a `U8G2` instance.
   - If the dual framework takes too long to fetch, `framework = arduino` alone is acceptable. Say
     which one you used.
   - Run `pio run -d tmp/pio-consumer` and record:
     - whether it built;
     - the size of `.pio/libdeps/esp32dev/u8g2gl/`;
     - that `extern/u8g2` and `.agents/skills/*` under it are **empty**;
     - that `U8g2` was resolved as a dependency.
   - If it fails for a reason inside the Boundary Box, fix it, re-commit, re-push and repeat. If it
     fails for a reason outside it (for example, a header that needs moving), stop and report.

6. [ ] **Do not write `library.properties`.** The Arduino 1.5 format puts only `src/` on the include
   path, and the public headers live in `include/u8g2gl/`. Confirm that claim from the Arduino
   library specification (one sentence, with the URL) in the Completion Report. The PA has put the
   decision to the owner.

7. [ ] **Suites.** Run the C++ and CLI suites sequentially. Expected: C++ 401 with the one known
   skip, CLI 1338, zero warnings. Any change from the baseline is a defect: explain it or fix it.

8. [ ] **Commit.** Use conventional commits with scopes, as `git log` shows. For example
   `build(runtime): ship as a PlatformIO library; version agreement checked at configure`, and a
   separate commit for the submodule change. End each message with
   `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Push as authorized above.

## Verification Requirement

- Both suites at baseline.
- The configure refusal demonstrated.
- The fresh recursive clone carries no submodule content.
- The PlatformIO consumer build in Instruction 5 is green against the **pushed** sha.

Report the pushed sha.

## Issue Surfacing

Report defects outside the Boundary Box in the Completion Report. Do not file them.

---

## Completion Report

### Status

**Complete.** All eight instructions done. Both suites at baseline, configure refusal shown, a
recursive clone carries no submodule content, and the PlatformIO consumer built green against the
**pushed** sha.

- **Pushed sha (code):** `69c37e01f75198a4aa3fa84b8926fcf139e30f02` on `origin/u8g2gl-05/wo1-packaging`.
  The Completion Report commit that follows it adds only this file.
- **Suites:** C++ **401** (400 passed, 1 skipped: `SizeOfReport.ThirtyTwoBitTarget`), CLI **1338**
  passed (90 files), lint and `tsc -p tsconfig.test.json` clean, zero warnings. Run sequentially.

### Changes Made

| Commit | Content |
|---|---|
| `1dee2db` `build(runtime): ship as a PlatformIO library; version agreement checked at configure` | `library.json` (new); `CMakeLists.txt` version-agreement block; `generate.test.ts:345` |
| `69c37e0` `build(submodules): update = none, so a consumer clone fetches none of them` | `.gitmodules` (`update = none` x4); `CMakeLists.txt:84` message; `CONTEXT_BRIDGE.md:319` |

- `library.json`: name, version 0.7.0, description, keywords, MIT, author, homepage, git
  repository, `frameworks: "arduino"`, `platforms: "*"`, `dependencies: olikraus/U8g2 ^2.36.18`,
  `export.exclude` for `cli docs test extern .agents`. The defaults (`src/` compiled, `include/` on
  the path) worked unchanged.
- CMake reads `library.json`'s `"version"` with a regex (CMake 3.16-safe), adds the file to
  `CMAKE_CONFIGURE_DEPENDS`, and `FATAL_ERROR`s naming both values and both files.
- `generate.test.ts:345` now builds its expectation from `packageVersion` (a template literal,
  because the original was a double-quoted string). `:460-473` untouched.
- No version number moved. Nothing under `src/` or `include/` was touched.

### Configure refusal (Instruction 2)

With `library.json` set to `0.7.1`:

```
CMake Error at CMakeLists.txt:40 (message):
  Runtime version mismatch: library.json says 0.7.1,
  include/u8g2gl/u8g2gl_version.h says 0.7.0.  Bump both together.

-- Configuring incomplete, errors occurred!
```

Restored to `0.7.0`:

```
-- Configuring done (3.0s)
-- Generating done (0.1s)
-- Build files have been written to: .../tmp/refuse
```

### Clone measurement (Instruction 3)

`git -c protocol.file.allow=always clone --recursive --branch u8g2gl-05/wo1-packaging <local path> tmp/clonetest`:

```
Skipping submodule '.agents/skills/embedded-systems'
Skipping submodule '.agents/skills/lvgl-pro-expert'
Skipping submodule '.agents/skills/oo-expert'
Skipping submodule 'extern/u8g2'
```

All four paths held **0** entries; `git submodule status` showed all four with a leading `-`; the
whole clone was 13 MB. Then `git submodule update --init --checkout --reference
<main checkout>/extern/u8g2 extern/u8g2` checked out `d66b49af...` (12 top-level entries), and the
three skill submodules stayed empty.

### PlatformIO consumer (Instruction 5)

`tmp/pio-consumer/`: `platform = espressif32`, `board = esp32dev`, **`framework = arduino, espidf`**
(the full dual framework, not the fallback), `lib_compat_mode = strict`,
`lib_deps = https://github.com/cblabs-org/u8g2gl.git#69c37e01f75198a4aa3fa84b8926fcf139e30f02`.
`main.cpp` includes `u8g2gl/u8g2gl_version.h` and `u8g2gl/u8g2gl_core.h`, uses
`U8G2GL_REQUIRE_RUNTIME_VERSION(0, 7);` and calls `ui_handler(display)` on a
`U8G2_SSD1306_128X64_NONAME_F_HW_I2C`.

- **Built: yes.** `[SUCCESS] Took 54.90 seconds`; RAM 17456 B (5.3%), Flash 279505 B (6.7%).
- **Dependency graph:** `u8g2gl @ 0.7.0+sha.69c37e0` and `U8g2 @ 2.36.18`, so U8g2 was resolved
  as a dependency and strict mode accepted the library.
- All 15 `src/*.cpp` files compiled; no warning came from u8g2gl (the one warning in the log is
  the Arduino core's `ssl_client.cpp` PSK notice).
- **`.pio/libdeps/esp32dev/u8g2gl/`: 10 MB.** `extern/u8g2` has **0** entries. The `.agents/skills`
  directory holds five entries (`embedded-systems`, `lvgl-pro-expert`, `oo-expert`,
  `principal-architect-workspace`, `u8g2gl-standards`); the three submodule ones are empty and the
  other two are ordinary tracked directories. This is the working tree, not a packed archive, so
  `export.exclude` does not apply and `cli/`, `docs/`, `test/` are present (~10 MB total).

### Decisions Made

- Commit split: the `CMakeLists.txt` message edit went in the submodule commit, the version block
  in the packaging commit (done by staging the file twice).
- `library.json` author is the owner, from `git config` and the user email.

### Dead Ends & Warnings

1. **The dual-framework build needs two consumer settings that are not the library's business.**
   Without them the first attempts failed: (a) the sdkconfig must set `CONFIG_FREERTOS_HZ=1000` (`esp32-arduino requires
   CONFIG_FREERTOS_HZ=1000 (currently 100)`); (b) Arduino as an IDF component needs
   `CONFIG_AUTOSTART_ARDUINO=y`, otherwise the link fails with `undefined reference to app_main`.
   I put both in `tmp/pio-consumer/sdkconfig.defaults`. Foundation's `env:esp32dev` presumably has
   its own sdkconfig; WO-B2 should confirm it sets both.
2. **Arduino 1.5 claim (Instruction 6), confirmed.** The Arduino library specification says
   the `src` folder is added to the include search path and only the headers in the root of `src/`
   (not its subfolders) form the library's interface
   (https://arduino.github.io/arduino-cli/latest/library-specification/, source
   `docs/library-specification.md` in `arduino/arduino-cli`). The runtime's headers are in
   `include/u8g2gl/`, so `library.properties` was not written.
3. BSD `sed -i` needs `-i ''` on this machine; `tmp/` is git-ignored and nothing in it was committed.

### Out-of-Scope Findings

- `CONTEXT_BRIDGE.md:320-322` still says the CLI pins its version literally "so every version bump
  breaks it". After this WO that is only true of the deliberate pin at `:467`; the note is now
  misleading.
- Historical records still show the old `git submodule update --init` form (`pr-4r3-corrections`
  PROJECT/CA-BRIDGE/WORKORDER, `pr-04-generator` WORKORDER/BRIDGE). I left them: they are dated
  records, and `update = none` makes those commands silently do nothing. A reader following one
  needs `--checkout`.
- `test/CMakeLists.txt` and `cli` docs were checked: no other contributor-facing initialisation
  instruction exists in live files.

### Blockers

None. Not done: no tag, npm publish or PR, as instructed.
