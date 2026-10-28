---
name: device-measurements-wo2
description: Handoff instructions for Work Order 2 — M4 xtensa sweep and M5 gate re-measurements (build only)
complexity: standard
---

# device-measurements / WO2 — build-only measurements (M4, then M5)

## Role Definition

You are an expert senior embedded/build engineer and execution-focused worker agent. You are NOT
the Principal Architect. Do not make high-level architectural decisions, do not branch, and do not
plan. Your task is strictly limited to executing the checklist below.

**Parent project:** `.agents/skills/principal-architect-workspace/device-measurements/PROJECT.md`
— its Status Log records the owner's approval of this decomposition. Verify it before you start
(`.agents/rules/00-operating-model.md`).

## Objective

Two build measurements, no device:

- **M4 (priority):** compile the generated fixture corpus for the xtensa targets and report every
  error or warning of the class PR-05R found (host-clean, target-broken). It is the manual
  rehearsal of the CI check spec §17.3 requires PR-06 to automate, so **what you had to do to make
  it work is PR-06's specification** — write it down as such.
- **M5:** re-measure Criterion 3 (foundation `esp32dev` flash/RAM) against runtime 0.8.0, and try
  `lib_ldf_mode` / explicit `lib_deps` for Criterion 4's +4.99 s.

Do M4 completely before starting M5. If time runs short, M5's Criterion 4 is the one to cut.

## Strict Boundary Box

- **Work only in this worktree** (`../U8G2GL-device`), only under
  `tmp/m4/` and `tmp/m5/` (git-ignored), plus your Completion Report in this file.
- **Read-only:** `tmp/fdn/` and `tmp/device*/` belong to another worker running in parallel. You may
  read `tmp/fdn/`; copy it if you need to edit, never edit it in place.
- **Do not edit** anything under `src/`, `include/`, `cli/`, `docs/`, tests or any tracked file.
  No runtime, CLI or generator change, no fix. A defect is a finding with a reproduction.
- **Do not touch** `../U8G2GL-05r` (PR #13's worktree).
- **Foundation is read-only.** The only operation allowed on
  `~/Documents/Projects/esp32-app-foundation` is `git archive <commit> | tar -x -C
  tmp/m5/<dir>` (and read-only `git show`/`git log`). No checkout, branch, commit, fetch or file
  edit there.
- **No device.** Never flash, erase or upload; never acquire the device lock.
- **Never create or edit `.pio-mcp-policy.json`** or enrol a directory in an MCP policy profile.
  If a build is refused by policy, stop and report.
- **Do not commit.** The PA reviews and commits.

## Tooling Constraints

- **PlatformIO goes through the PlatformIO MCP only** (`mcp__plugin_platformio-mcp_platformio__*`:
  `build_project`, `clean_project`, `size_report`, `get_project_config`, `check_task_status`,
  `query_logs`, `pkg_list`). **Direct `pio` / `platformio` on the command line is denied by the
  owner.** If the MCP cannot do what you need, stop and report — do not work around it.
- `forceExecution: true` bypasses the MCP's result cache, **not SCons's** object cache: use
  `clean_project` when you need a true rebuild (a PR-05R lesson).
- Reading the toolchain binaries directly for analysis (e.g. `xtensa-esp32-elf-nm`, `-size`) under
  `~/.platformio/packages/` is fine — that is not invoking PlatformIO.
- Temporary files: `tmp/` of this worktree (`.agents/rules/02-workspace.md`).

## Context you need

- **Runtime under test:** this worktree at `81e533f`, runtime 0.8.0 / CLI 0.12.0.
- **The defect class:** read
  `../U8G2GL-05r/.agents/skills/principal-architect-workspace/pr-05r-runtime-fixes/PROJECT.md`
  around the "seventh defect" (≈ lines 235–285) and spec §-text at `docs/design_spec.md:1662`. In
  short: `int32_t` is `long` on xtensa and `int` on the host, so an integer literal beside both an
  `int32_t` and a `bool` overload is ambiguous only on the target. The same class includes anything
  that depends on `int`/`long`/`size_t`/`char` signedness differing between host and xtensa
  (`-funsigned-char`? check), format-string width mismatches, and narrowing.
- **Corpus:** `cli/test/generator/fixtures/emit-project/expected/` (6 `.cpp` + headers, including
  `u8g2gl_generated_config.h`). Also, reported separately (owner ruling R2):
  foundation's committed generated project `tmp/fdn/uidesign/ssd1322-256x64/u8g2gl/generated/`, and
  WO1's scratch project `tmp/device-m1/ui/` generated output **if it exists when you get there**
  (if not, say so; the PA will add it).
- **Criterion 3 baseline** (foundation's held tip `499142f8`, runtime 0.7.0): read
  `git show 499142f8:.agents/skills/principal-architect-workspace/pr-u8g2gl-05/evidence/EVIDENCE.md`
  in the foundation repo — section 3 (flash/RAM, ≈ lines 940–1020) for the method: `esp32dev` clean
  build, the `RAM:`/`Flash:` lines and `size_report` sections, the `.flash.text + .flash.rodata +
  .iram0.text + .dram0.data + .iram0.vectors` flash sum. The final post-fix figure recorded for the
  gate is **flash 1344575 B (85.5%)**; find the matching RAM figure in that document and quote it.
- **Criterion 4 baseline:** same EVIDENCE.md, ≈ lines 1261–1445: interleaved noop/edit builds of
  legacy (`7396e43d`) and stack trees through the MCP; **+4.99 s per build, all of it PlatformIO's
  library dependency scan**; generator 0.05 s; compile 0.75 s faster.

## Line-Item Instructions

### M4 — xtensa sweep (do first)

- [ ] `tmp/m4/` PlatformIO project, two envs: `esp32dev` (ESP32, LX6) and `nano_esp32`
  (`arduino_nano_esp32`, ESP32-S3, LX7); `platform = espressif32`, `framework = arduino`,
  `lib_deps` = `symlink://` this worktree + `olikraus/U8g2@2.36.18`. Pin the platform version and
  record it. Source = the corpus `.cpp` files (via `build_src_filter` or a copy — say which) plus a
  minimal `main.cpp` with `setup()`/`loop()` that references the generated entry points so it links.
- [ ] Flags: the corpus's own requirements (`-std=gnu++17`, `U8G2GL_GENERATED_CONFIG`, include path)
  **plus** `-Wall -Wextra`. Record every flag and why it was needed.
- [ ] Build both envs. Report: errors (file:line, message), warnings split into
  *generated code* / *runtime* / *third-party*, compile and link result, and wall time.
- [ ] **Positive control — prove the check catches the known defect.** Repeat the same build
  against the **pre-fix** state: the fixture `expected/` and runtime as they were at
  `u8g2gl-05r/wo3-platformio` (use `git archive u8g2gl-05r/wo3-platformio` into `tmp/m4/control/`;
  a branch in this repo, read-only). It must **fail** with the `int32_t`/`bool` ambiguity at
  `ui_screen_home.cpp`. If it does not fail, the sweep does not detect the class — stop and report.
- [ ] Repeat the sweep (both envs) for foundation's generated project and, if present, WO1's
  scratch project. Report separately.
- [ ] **Host contrast:** for any target-only diagnostic you find, show the host compiler accepting
  the same file (`c++ -std=gnu++17 -fsyntax-only` with the same includes is enough), so it is
  established as host-clean, target-broken.
- [ ] `tmp/m4/PR06-SPEC.md` — written as input to PR-06's CI: the exact steps; packages and versions
  (platform, toolchain, framework, U8g2); every flag and file you had to supply and why; what
  *cannot* run in CI and what can (network fetches, cache size on disk, cold vs warm time); the
  positive control as the check's self-test; what the check deliberately does **not** cover. Be
  concrete enough that a PR-06 worker could implement it without this session.

### M5 — Criterion 3, then Criterion 4

- [ ] `tmp/m5/fdn-07/` — copy of `tmp/fdn/` built **as-is** (its pinned runtime) for `esp32dev`,
  clean build: the same-session 0.7.0 baseline, so a toolchain drift since 2026-10-07 is not
  mistaken for a runtime change. Record its pin (the `[u8g2gl]` section).
- [ ] `tmp/m5/fdn-08/` — copy of `tmp/fdn/` with the `[u8g2gl]` pin replaced by `symlink://` this
  worktree (0.8.0). Note PR-05R's finding that PR-05's middleware glob `*/u8g2gl/src/*.cpp`
  matches nothing for a `symlink://` dependency and silently leaves the 6144 B binding pool — check
  whether that applies, and state which pool size each build actually has (from `nm`). If the
  0.8.0 runtime needs a config change in foundation to build, make the minimum in the copy and
  record the diff.
- [ ] Clean-build both for `esp32dev`; report the `RAM:`/`Flash:` lines and `size_report` sections
  using the EVIDENCE.md method, and a table: recorded figure (EVIDENCE.md) / same-session 0.7.0 /
  0.8.0, with deltas. Attribute the 0.7.0 → 0.8.0 delta by symbol (`xtensa-esp32-elf-nm -S
  --size-sort -C`, joined by name), at least the top movers.
- [ ] **Criterion 4.** `git archive 7396e43d` from foundation into `tmp/m5/legacy/`. Variants of
  the stack tree (`fdn-08` copies): **S0** as-is; **S1** `lib_ldf_mode = chain`; **S2**
  `lib_ldf_mode = off` with explicit `lib_deps` for every library the build needs (find the set
  from S0's dependency graph in its verbose log). One untimed warm-up of each. Then **5 interleaved
  rounds** of no-change builds in the order legacy, S0, S1, S2 — foreground `build_project`,
  `environment: esp32dev`, `forceExecution: true`, one at a time. Before each build print a UTC
  timestamp and `uptime` load averages. Time = the build log's file-name start to the result's
  `observedAt` (EVIDENCE.md's "task time"). Report per variant: median and range, and S0 − legacy
  as today's reproduction of the +4.99 s.
- [ ] For S1 and S2 also confirm **the firmware is unchanged**: `firmware.bin` sha256 (or, if it
  embeds a timestamp, the `size_report` sections) equal to S0's. A build-system default that
  changes the image is not a free win.
- [ ] One N-edit (screen XML `uptime` row `y`, 30 ↔ 31, as in EVIDENCE.md) per stack variant, to show
  the generator hook still regenerates under S1/S2. Revert in the copy afterwards.
- [ ] State plainly: does S1 or S2 remove the regression, reduce it (by how much), or leave it —
  i.e. structural.

## Verification Requirement

- Every number in your report states its source log (file name) and method.
- `git status --short` in this worktree must be empty; nothing was written to foundation (`git -C
  ../esp32-app-foundation status --short` unchanged from before you started — record both).
- Before finishing, **stop and message the PA** with the headline results; the PA reviews before
  anything is committed.

## Issue Surfacing

Defects, upstream bugs or concerns outside your boundary box go in your Completion Report with a
reproduction. Do not file issues and do not fix them.

---

## Completion Report

### Status
complete (M4 and M5 done; two deviations from the checklist stated under Decisions: the MCP was switched off by the owner mid-task so Criterion 4 and the later builds are `pio` wall time, and S1/S2 are not byte-identical to S0).

All paths below are under `tmp/` of this worktree (git-ignored). Logs: `tmp/m4/.pio-mcp-workspace/logs/build/` (MCP builds), `tmp/m4/logs/pio-*.log`, `tmp/m5/logs/`.

### Changes Made
- Nothing tracked was edited. Created only under `tmp/m4/` and `tmp/m5/`, plus this report.
- `tmp/m4/PR06-SPEC.md` - input to PR-06's CI (steps, packages, flags, self-test, limits).
- `tmp/m5/EVIDENCE-499142f8.md` - read-only `git show` of foundation's EVIDENCE.md (baseline source).
- Worktree `git status --short`: empty before this report was written (HEAD moved to `da4b86a` during the run, PA's commit; `git diff 81e533f..HEAD -- src include library.json CMakeLists.txt cli` is empty, so the runtime under test is unchanged). Foundation `git status --short`: empty at start, empty at end (only `git archive`/`show` were run there).

### M4 - xtensa sweep

Setup (`tmp/m4/platformio.ini`, `src/main.cpp`): platform `espressif32` = pioarduino commit `5f39b6db`, platform.json 55.03.311 (PlatformIO prints `55.3.311+sha.5f39b6d`), arduino-esp32 3.3.11, ESP-IDF 5.5.5, `toolchain-xtensa-esp-elf` 14.2.0+20260121, U8g2 2.36.18, PlatformIO Core 6.1.19. Source = a COPY of the corpus (`tmp/m4/corpus/`, from `cli/test/generator/fixtures/emit-project/expected/`) selected with `build_src_filter`, plus `src/main.cpp`. Envs `esp32dev` (LX6) and `nano_esp32` (`arduino_nano_esp32`, LX7). Every flag and why is in PR06-SPEC.md section 3.

Headline results:
| Run | esp32dev | nano_esp32 |
|---|---|---|
| Corpus, runtime 0.8.0 (default flags) | SUCCESS 11.5 s; RAM 26604, Flash 318264; 0 errors, 0 warnings from generated/runtime/third-party | SUCCESS 12.4 s; RAM 27228, Flash 348202; 0 errors; only the framework `#warning` in `variants/arduino_nano_nora/io_pin_remap.cpp` |
| Same, `-std=gnu++17` made effective (`*_std17`) | SUCCESS, identical sizes | SUCCESS, identical sizes |
| **Positive control** (`git archive u8g2gl-05r/wo3-platformio`: runtime 0.7.0 + its fixture) | **FAILED** 7.8 s | **FAILED** 8.6 s |
| Foundation committed generated project (`fdn_*`, runtime 0.8.0) | SUCCESS; RAM 26452, Flash 317716; 0 warnings | SUCCESS; RAM 27060, Flash 348050; framework `#warning` only |
| WO1 `device-m1/ui/generated` (snapshot, `wo1_m1_*`, pio) | SUCCESS; RAM 26068, Flash 316572; 0 warnings | SUCCESS; RAM 26676, Flash 346806 |
| WO1 `device-m1c/ui/generated` (`wo1_m1c_*`, pio) | SUCCESS; RAM 25956, Flash 314136; 0 warnings | SUCCESS; RAM 26564, Flash 344730 |

- **Diagnostics found in the current state: none** of the host-clean/target-broken class (0 errors, 0 warnings from generated code or the runtime, both targets, both standards). Warnings by class in the default builds: generated 0, runtime 0, third-party/framework: the S3 `#warning` only.
- **Positive control: the check catches the known defect.** Both control envs fail with exactly `ui_screen_home.cpp:109:32: error: call of overloaded 'bind_flag_if_eq(u8g2gl_subject_bool_n<1>*, int, const uint8_t&)' is ambiguous`, candidates `u8g2gl_obj.h:369 (int32_t)` and `:370 (bool)`. (The line is 109 in the wo3-platformio fixture; PR-05R's note said :75 in a different committed copy.) Logs: `build-2026-10-12T21-22-36-696Z-44b085a5.log`, `...21-22-44-700Z-db23d395.log`.
- **Host contrast:** `c++ -std=gnu++17 -fsyntax-only -Wall -Wextra` (Apple clang 21) on the control's `ui_screen_home.cpp` with the same includes: accepted, no output. Probes (`tmp/m4/logs/probe*.cpp`): `int32_t` is `int` on host and not `int` on xtensa; plain `char` is signed on host and UNSIGNED on xtensa; `size_t` is 8 bytes on host and 4 on xtensa.
- **Stricter pass (informational, envs `*_strict`):** re-enabling the warnings the platform mutes (`-Wno-unused-parameter -Wno-sign-compare -Wno-missing-field-initializers` are in the platform's flags) plus `-Wconversion -Wshadow -Wformat=2`: esp32dev 1226 warnings, nano 1543; framework/platform 550/744, U8g2 224/224, runtime 1/1 (`src/u8g2gl_obj.cpp:690` `-Wformat-nonliteral`, `snprintf` with the binding's own format; not a host/target issue), generated 0/0. Logs `tmp/m4/logs/pio-*_strict.log`.
- **Finding for PR-06:** the platform's own flags end `-std=gnu++2b ... -std=gnu++2a`, and the last `-std` wins, so `-std=gnu++17` in `build_flags` (foundation's, and mine) is silently overridden: everything compiles as gnu++2a unless the platform's `-std` flags are `build_unflags`ed. `-Wall -Wextra` are already in the platform flags.
- Wall times: 7.8-12.4 s per env, warm package cache. Cold-cache time and network fetch were not measured (everything was already installed). Disk: framework-libs 2.0 GB, toolchain 1.2 GB, per-env build tree ~170 MB.

### M5 - Criterion 3 (esp32dev flash/RAM)

Method deviations: the MCP was switched off after the first fdn-07 builds, so all later builds and the `size_report` equivalent used `~/.platformio/penv/bin/pio run -d <dir> -e esp32dev -v` and `xtensa-esp32-elf-size -A` / `-nm -S -C --size-sort` on `firmware.elf` (`tmp/m5/logs/size-*.txt`, `nm-*.txt`). Every figure below is a `RAM:`/`Flash:` line.

| | RAM (B) | Flash (B) | Source |
|---|---:|---:|---|
| Recorded gate figure (EVIDENCE.md, 499142f8, runtime 0.7.0) | 57340 (17.5%) | 1344575 (85.5%) | EVIDENCE-499142f8.md line 620 |
| Same-session 0.7.0 (`fdn-07`, pin `82ec83f`, clean) | 57340 | 1344547 | `logs/fdn-07.clean2.pio.log` |
| 0.8.0 (`fdn-08`, symlink, clean) | 57340 | 1345115 | `logs/fdn-08.clean.pio.log` |
| Delta same-session 0.7.0 to 0.8.0 | **0** | **+568 (+0.04%)** | |
| Delta recorded to 0.8.0 | 0 | +540 | |
| Same-session vs recorded (toolchain drift) | 0 | -28 | |

- Flash 1345115 / 1572864 = 85.5%; headroom 227749 B (14.48%).
- **Attribution of +568 B (`.flash.text` +568, `.dram0.bss` 0, rodata 0; nm named net +537, all added, none removed):** `u8g2gl_repaint_object` +184, `u8g2gl_state_saver::~u8g2gl_state_saver` +146 (new, R7's font-mode guard), `u8g2gl_label::render_animation_update` +91, `u8g2gl_render_object` +40, `WebServerManager::tick` +32 (not a runtime symbol; moves with layout, not investigated), `u8g2_SetFontRefHeightExtendedText` +18, `u8g2_SetFontRefHeightText` +18 (linked because of R7), `u8g2_SetBitmapMode` +8.
- **Binding pool:** `nm` `s_binding_pool` = 0x60 = **96 B (4 bindings) in fdn-07 and fdn-08** (and S0/S1/S2). PR-05R's middleware-glob finding applies like this: the glob `*/u8g2gl/src/*.cpp` matches a symlinked library only if the library DIRECTORY is named `u8g2gl`. Reproduced: `tmp/m5/diag/fdn-08-othername` (same tree, symlink to a copy of the runtime named `U8G2GL-lib`) builds with RAM **63388** (+6048) and `s_binding_pool` 0x1800 = **6144 B**, while the script still prints "forced into the u8g2gl runtime sources only". Silent.
- **Two foundation build-system findings, with reproductions:**
  1. **A bare `symlink://` to this worktree's root does not build in foundation.** `tmp/m5/diag/fdn-08-rootlink` (pin replaced by `symlink://<this worktree, absolute>`): `fatal error: EventBus.hpp: No such file or directory` at `modules/Application/Application.hpp:69`. The dependency graph (`logs/fdn-08.pio.build.log`) stops after `u8g2gl`, `LittleFS`, `WiFi`: none of foundation's `modules/*` libraries are discovered. The same symlink works in the M4 rig (which includes only `ui.hpp`). A symlink to a library-only copy (library.json, include/, src/, LICENSE; byte-identical to the worktree's `src`/`include`, diffed) works. Cause inside PlatformIO not isolated (candidates: the repo root has `tmp/`, `test/`, `docs/` trees, or the `U8G2GL-device` name). **The "minimum change" I made in the fdn-08 copy: pin -> `symlink:///.../tmp/m5/rt/u8g2gl` (the library-only copy).** Nothing else needed for 0.8.0 (generated floor `(0, 7)` is satisfied).
  2. **A clean build's numbers depend on state.** fdn-07's first (MCP) build, with no `sdkconfig.esp32dev` ("will be created from defaults on first build"), gave RAM 57324 / Flash 1342679; a clean rebuild with the generated sdkconfig present gave 1342735 once and 1344547 the next time. The difference is `diag_log_add` (+1543 B) and friends (`esp_diag_log_write`, `esp_diag_timestamp_get`) from managed component `espressif__esp_diagnostics`, present in some clean builds and not others (same sdkconfig md5). All figures in the table use the "with diagnostics" state, which is the one the recorded 57340 / 1344575 corresponds to (nm of fdn-07b and fdn-08 both contain `diag_log_add`). Compare only builds in the same state.

### M5 - Criterion 4 (no-change builds)

**Method (changed): direct `pio` wall time, not the MCP task time of EVIDENCE.md.** Only the S0 minus legacy gap is comparable with the recorded +4.99 s; absolute seconds are not. `pio run -d <dir> -e esp32dev -v`, foreground, one at a time, 5 interleaved rounds legacy, S0, S1, S2 (script `tmp/m5/scripts/rounds.sh`, table `tmp/m5/logs/c4/obs.tsv`, logs `logs/c4/r<k>-<variant>.log`), UTC stamp and `uptime` before each, untimed warm-ups of each beforehand. Wall = Python `time.time()` around the call. No MCP-timed Criterion 4 builds exist, so nothing is mixed. Host load 1-min: 4.7 to 5.6 throughout (rounds ran 07:40:50-07:48:40 UTC 2026-10-13).
- legacy = `git archive 7396e43d` (`tmp/m5/legacy`). S0 = `fdn-08` as is. S1 = S0 + `lib_ldf_mode = chain`. S2 = S0 + `lib_ldf_mode = off` + explicit `lib_deps` for the 48 libraries in S0's dependency graph, **plus** `-I modules/<each>`, `-I lib/<each>`, `-I .../generated` in `build_flags`, and `WebServer` as `symlink://.../modules/WebServer`. Both extras were needed: with `off`, libraries do not get each other's include dirs (`fatal error: Application.hpp: No such file`), and the name `WebServer` also matches Arduino's framework library (multiple-definition link errors). So S2 needs ~45 lines of hand-maintained config.

| Variant | wall median (s) | range (s) | paired minus legacy, rounds 1-5 | median paired |
|---|---:|---|---|---:|
| legacy | 23.03 | 21.81-23.49 | - | - |
| S0 (deep, as is) | 29.27 | 28.36-29.58 | +5.90, +6.24, +6.52, +6.22, +7.01 | **+6.24** |
| S1 (`chain`) | 33.64 | 32.76-33.98 | +10.27, +10.95, +10.58, +10.62, +11.15 | +10.62 |
| S2 (`off` + explicit) | 8.66 | 8.36-8.98 | -14.83, -14.05, -14.35, -13.67, -13.45 | **-14.05** |

(PlatformIO's own `Took` medians: 22.86 / 29.06 / 33.44 / 8.48 s.) **S0 - legacy = +6.2 s today (5.9 to 7.0), against the recorded +4.99 s: the regression reproduces, a little larger, and it is present in a no-change build.** Graph size from the verbose logs: legacy 6265 lines / 78 libraries, S0 8934 / 81, S1 10648 / 81, S2 130 / 82 (no scan).
- **S1 makes it worse** (+4.4 s over S0): `chain` walks more.
- **S2 removes the regression and more** (S0 - S2 = 20.6 s, 12.6 s better than legacy): the dependency walk is essentially the entire no-change build time. But see below.
- **Firmware identity (same directory, same path, `tmp/m5/fdn-id`, `scripts/ident.sh`, `logs/ident-*.size/.nm`):** S0 RAM 57340 / Flash 1345115; **S1 57340 / 1345535 (+420)**; **S2 57348 / 1345543 (+428, bss +8)**. NOT unchanged. The differences are scattered (65 / 144 symbols, mostly ArduinoJson template instantiations and unrelated module code, e.g. `WifiManager::tick` +52); S1's compile flags for a sampled TU are identical to S0's (`logs/cc-*.txt`), S2's differ by the extra `-I` flags. Cause not isolated; run-to-run noise on S0 itself is ~70 B (1345115 clean vs 1345043 incremental), so +420 is real but small. Functional equivalence not tested.
- **N-edit (`tmp/m5/scripts/nedit.sh`, `uptime` row y 30 -> 31 with `custom_u8g2gl_cli` set to this worktree's `cli/dist/node/cli.js`, 0.12.0):** hook regenerates under S0, S1 and S2 (`[u8g2gl_generate] regenerating ... updated: ui_screen_diagnostics.cpp`, `ui_screen_diagnostics.cpp.o` recompiled): wall 31.0 s (S0), 35.3 s (S1), 12.5 s (S2), at host load 8 to 16 (another process was building; indicative only, not a comparison). Edit reverted in all three copies, platformio.ini and `generated/` restored from the originals. Note: the first hook run regenerates ALL generated files, because CLI 0.12.0 output differs from foundation's committed generated files (version stamp / runtime floor); it was an untimed warm-up.
- **Verdict:** S0's +6 s is structural in the sense that it is the deep LDF walk over a larger graph (U8G2GLDisplay, U8G2GLUI and u8g2gl add ~2.7k graph lines), not the hook, the generator or compiling. `lib_ldf_mode = chain` (S1) leaves it and increases it. `lib_ldf_mode = off` with an explicit dependency list (S2) removes it, at the price of a ~45-line hand-maintained list (including `-I` flags and a name-collision workaround) and a firmware that differs by ~430 B. It is a mitigation for foundation's maintainers to weigh, not a free default.

### Decisions Made
- Corpus compiled from a copy via `build_src_filter` (so PlatformIO applies the env's flags to it).
- Because the platform overrides `-std`, ran both the default build and `*_std17` (unflagged); results are identical.
- Platform left as `platform = espressif32` (what foundation uses; resolves to the installed pioarduino checkout) rather than a git-URL pin that would clone from the network; recorded the resolved commit/version instead. PR-06 must pin it (spec section 2).
- fdn-08 uses a library-only copy of the runtime named `u8g2gl` (see finding 1), not a symlink to the worktree root.
- Criterion 3 comparison uses the "diagnostics present" build state (finding 2) for both sides.
- After the owner switched the MCP off, `size_report` was replaced by toolchain `size -A`/`nm`; Criterion 4 by `pio` wall time with legacy timed the same way, as instructed by the coordinator.

### Dead Ends & Warnings
- `verbose: true` on the MCP `build_project` returns ~525k characters and exceeds the tool-result limit (it is saved to a file); use `rawLogPath` or `pio -v`.
- The MCP's non-verbose raw log omits compile command lines, so `-Wall`/`-std` cannot be checked from it.
- The first fdn-07 MCP `size_report` call failed (`ENOENT` for `firmware.elf`): the ELF had been removed from the build dir in the meantime; a rebuild restored it. Not investigated.
- S2 without the `-I` flags / with the plain name `WebServer`: see Criterion 4 (both fail to build).
- `lib_ldf_mode = chain` is slower, not faster.
- I wrote `tmp/m5_evidence.md` at `tmp/` root by mistake at first and moved it into `tmp/m5/` immediately (outside the box for a moment, nothing else touched).

### Out-of-Scope Findings
- Foundation: the u8g2gl middleware glob depends on the library directory's name (silent 6144 B pool); a `symlink://` to a repo root breaks foundation's LDF; clean-build numbers vary by ~1.8 KB with managed-component state; `-std=gnu++17` is overridden by the platform. Reproductions are the directories named above.
- PR-06: spec for the check is `tmp/m4/PR06-SPEC.md`; the control fixture should be frozen into the repo rather than read from an old branch.
- `cli/dist/node/cli.js` regenerates foundation's committed `generated/` differently (stamp/floor), as expected when the generator is newer; foundation's cut-over will need a regeneration commit.
- Plain `char` is unsigned on xtensa and signed on the host: no diagnostic today, but a class the sweep cannot see (spec section 6).

### Blockers
(none)
