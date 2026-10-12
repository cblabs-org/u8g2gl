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

- **Work only in this worktree** (`/Users/mcneillm/Documents/Projects/U8G2GL-device`), only under
  `tmp/m4/` and `tmp/m5/` (git-ignored), plus your Completion Report in this file.
- **Read-only:** `tmp/fdn/` and `tmp/device*/` belong to another worker running in parallel. You may
  read `tmp/fdn/`; copy it if you need to edit, never edit it in place.
- **Do not edit** anything under `src/`, `include/`, `cli/`, `docs/`, tests or any tracked file.
  No runtime, CLI or generator change, no fix. A defect is a finding with a reproduction.
- **Do not touch** `../U8G2GL-05r` (PR #13's worktree).
- **Foundation is read-only.** The only operation allowed on
  `/Users/mcneillm/Documents/Projects/esp32-app-foundation` is `git archive <commit> | tar -x -C
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
<!-- Written by the worker at task completion -->

### Status
complete | partial | blocked

### Changes Made
- `path/to/file` — what changed and why

### Decisions Made
- Decision description and rationale

### Dead Ends & Warnings
- What was attempted, why it failed, and what to avoid

### Out-of-Scope Findings
- Finding description and suggested action

### Blockers
(none)
