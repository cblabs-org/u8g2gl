---
name: e-1d-wo5-readability-audit
description: Readability, documentation and workspace-pointer defects in the E-1d diff (toolchain installer, project editor Wasm build, bridge, CI job)
complexity: standard   # A2/A3 need the author's judgement on wording; the rest is mechanical
---

# AUDIT — E-1d readability & documentation

**Scope reviewed:** worktree `/Users/mcneillm/Documents/Projects/U8G2GL-e1d`, branch `u8g2gl-e1d/wo4-ci`, `git diff a95c1fb..HEAD -- cli/ wasm/ test/CMakeLists.txt .github/`
**Reviewed:** 2026-10-27
**Standards:** `u8g2gl-standards` (SKILL.md, documentation.md, cpp.md, typescript.md). TypeScript judged against the TS naming table, `bridge.cpp` against the C++ one.

## Objective

Make the E-1d code readable to someone who was never in the workspace: drop the workspace pointers, put the why-comment beside each security-relevant line, and finish the documentation layers the new C++ and TS files skip. No behaviour changes. No P1 (correctness or cost) defect was found.

## Strict Boundary Box

**Do NOT touch:** any behaviour. Documentation, comments, test titles, local names and temp-dir prefixes only. Items marked "needs approval" are not to be started without a decision. Observations at the bottom are for the architect, not the worker.
**Do NOT:** create branches, open PRs, rebase, or merge.

Per documentation.md §4.1 this audit raises workspace citations on **added lines only**. Older `WO8b` / `WO9` / `WO10` / `WO11` / `PR-04 WO11` citations in `emit/index.ts`, `emit/editor-registry.ts`, `emit-editor.test.ts` and `ci.yml:114` (`WO4 checklist`) are pre-existing and are deliberately not listed.

## Line-Item Instructions

### P2 — Convention violation with consequence

- [ ] **A1 (needs approval): tests depend on a workspace directory.** `cli/test/node/design/build/probe-project.ts:19-22` resolves `PROBE_PROJECT` to `../../../../../.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/probe-project`. Three suites (`editor-wasm-build.test.ts`, `prepare-build.test.ts`, and the CI `wasm-tests` job that runs them) now fail if that workspace folder is pruned. It is a pointer the reader cannot follow, and a dependency. **Fix:** relocate the project to a test fixture directory (for example `cli/test/node/design/build/fixtures/departures/`) and point `PROJECT` there, or have the architect rule that it stays. Either way, rename the doc text per B1. Moving committed files is outside "comments only", so do not do it unprompted.

- [ ] **A2: the toolchain installer's trust steps have no why-comment at the line.** `cli/src/node/toolchain/install-toolchain.ts`:
  - `:106-116` Step 4 is headed "The tag must resolve to the pinned commit" and the failure message gives the reason, but the check reads as pedantry. The reason (a tag can be force-moved, so a clone is only trusted if HEAD equals the commit that was reviewed; the pin is `EMSDK_COMMIT`) lives only in `toolchain-paths.ts:38-42`. **Fix:** add 2-3 lines above `:107`: why HEAD is compared and not the tag, and that this is the only integrity check on emsdk's own scripts (emsdk then verifies archive checksums itself, `:118`).
  - `:84-87` Step 2 consent: add one line saying why it is asked before anything is written (a ~1.6 GB network download into the user's cache must never happen implicitly) and why `--yes` is the only bypass and a non-TTY answers no (`toolchain-command.ts:152-156`).
  - `:118-125` the install/activate loop: add a line that archive checksum verification is emsdk's job and is not re-implemented here, so nobody "adds" a second one or removes the commit check as redundant.
  - `:126` the `emxx` existence check: say it guards a "successful" emsdk run that produced nothing.
  - `:92` `host.remove(layout.root)`: the existing comment justifies it; add that this is the only recursive delete in the installer and that it is confined to the versioned directory under the cache root.

- [ ] **A3: environment stripping has no stated reason per variable, and the two lists disagree.** `install-toolchain.ts:146-156` `childEnv()` deletes `EMSDK, EM_CONFIG, EMSDK_NODE, EMSDK_PYTHON, EM_CACHE`. `detect-toolchain.ts:172-184` `managedEnv()` sets `EMSDK` and deletes `EM_CONFIG, EMSDK_NODE, EMSDK_PYTHON` but **not** `EM_CACHE`. **Fix (docs):** give each variable a half-line reason in both comments (what it redirects emsdk or the drivers to) and make the two comments cross-reference each other. Whether `managedEnv` should also strip `EM_CACHE` is a behaviour question: see Observation O2, do not change it here.

### P3 — Consistency and documentation gaps

- [ ] **B1: workspace pointers in test titles, doc comments, console output and temp names (new lines).** Keep the fact, drop the pointer:
  - `cli/test/node/design/build/editor-wasm-build.test.ts:7` "G-PROBE-2's departures project" -> "the departures project (a fixture with custom widgets)". `:9` "(d1)" and "(d2, reported, not gated)" -> drop the tags, keep "reported, not gated".
  - `:84` title `'d1: builds the …'` -> `'builds the departures project unmodified and renders it with its real widgets'`. `:100` `console.log('d1: …')` -> drop the `d1:` prefix. `:109` title `'d2: a widget edit …'` -> drop `d2:`. `:112` the file suffix `// d2 edit` -> `// edited`. `:119` log prefix `d2:` and the "against a 2000 ms target" -> state what the 2000 ms is (the edit-loop budget) without a doc pointer, or drop it.
  - `cli/test/node/design/build/prepare-build.test.ts:12` "G-PROBE-2's departures project" -> as above. `:107` `describe('the build hash (d4)'` -> `'the build hash'`.
  - `cli/test/node/design/build/probe-project.ts:7` and `:18` "G-PROBE-2's departures project" -> "the departures project".
  - Temp-dir prefixes `'e1d-…'` (an "E-1d" tag): `editor-wasm-build.test.ts:78,79,132,162`; `prepare-build.test.ts:35,93,110,172`. Use `'wasm-cache'`, `'wasm-probe'`, `'wasm-broken'`, `'no-toolchain'`, `'build-cache'`.
  - Verified clean on added lines: no `E-1d`/`E-1e`, `PA ruling`, `LOOP-BUDGET`, `EDITOR-DESIGN` or `WO<n>` in `cli/src/node/toolchain/`, `cli/src/node/design/build/`, `wasm/`, `ci.yml`, or the CI step names (`D-9` in "Wasm snapshot test (D-9 parity golden)" is a published decision and stays).

- [ ] **B2: platform-header rule table has no why-comment.** `cli/src/node/design/build/platform-headers.ts:29-40`. The patterns are a heuristic list, not the rule: `driver/`, `soc/`, `hal/`, `rom/` are generic enough to match a widget's own sub-folder include, and common Arduino-core headers (`Wire.h`, `SPI.h`, `WiFi.h`, `pgmspace.h`) are not matched. Say above `PLATFORMS` that (a) the list is deliberately the commonest offenders, not exhaustive, and the compiler remains the backstop for the rest, and (b) why the directory-prefix patterns are accepted. The Purpose block states the rule well; the line that enforces it should say it is best-effort.

- [ ] **B3: new/changed `bridge.cpp` functions without a banner** (documentation.md §2, "Function banners"). Add the short `// name / what / param` block to: `arena_allocate` (`:254`, new), `destroy_objects` (`:335`, changed), `configure_object` (`:383`, placeholder branch added), `apply_styles` (`:421`), `bind_object` (`:465`), `build_screen` (`:504`, now sizes an arena). `fail` (`:240`) needs one line: only the **first** error is kept (see O1).

- [ ] **B4: `bridge.cpp` header does not say the heap-free rule does not apply here.** The file now uses `std::vector` for observer slots/string buffers/arena (`:96-104, :206`), `std::string`, and `std::unique_ptr`. That is defensible: `wasm/` is the editor host compiled only to Wasm, never into firmware, and the runtime objects themselves are arena-placed. But nothing in the file says so, and cpp.md §2 says "no heap, anywhere" without scoping. **Fix:** add 2-3 lines to the Purpose/Description: this is the editor host, outside the heap-free runtime; the *objects* are constructed into a sized arena so their addresses and sizes match firmware's. Also group the "Exported Functions" list (`:38-49`) by concern (scene lifecycle / frame / buffer / diagnostics) and add a line that `getBuildHash()` is not defined here: a project build adds it from a generated unit and the link step exports it (`editor-wasm-build.ts:230`).

- [ ] **B5: lifetimes and failure modes undocumented in `bridge.cpp`.**
  - `:969-971` `getBufferPtr()`: the pointer is invalidated by the next `applyScene()` / `teardown()` (`s_display_buffer` is reassigned); say so. `:985` `getLastError()`: valid until the next call that sets an error. Both are a JS caller's use-after-free if misread.
  - `:140-142, :195` `editor_placeholder` stores `tag_` as a raw `const char*` into `s_scene`'s string; it must not outlive `s_scene`. `teardown()` order (objects destroyed before `s_scene` is reset) is what makes this safe: write that precondition on the constructor and keep the order commented in `teardown()` (`:727-735`).
  - `:256` `align > alignof(std::max_align_t)` returns `nullptr`: say it is an over-aligned class the arena cannot honour (surfaces as "arena allocation failed" at `:359`, which hides the real cause).
  - `:336` reverse destruction order: one-line why (children before parents / reverse of construction).
  - `:759` the literal `3` scene version: name it (`kSceneVersion`) or comment where it is defined, so a bump has one place to change.

- [ ] **B6: unexplained flags and the export patch in the build.** `cli/src/node/design/build/editor-wasm-build.ts`: `:152` `-DARDUINO=10819` (what reads it, why that value), `:158` `-Wno-macro-redefined` (which macro, from where), `:167` `-w` on U8G2's C sources (U8G2's warnings are not ours; mirrors the `-isystem` decision), `:151` `-O3` on every object while the link is `-O1` (the header explains the link; say objects are compiled once and shared across levels). `:230` the `replace(/^(-sEXPORTED_FUNCTIONS=…)\]$/, "$1,'_getBuildHash']")` is the most surprising line in the file: say it appends the build-hash export to the framework's list because `wasm/CMakeLists.txt` cannot export a symbol only project builds define. These are the "discovered painfully" items documentation.md §4 asks for.

- [ ] **B7: the emsdk pin is duplicated with no cross-reference.** `.github/workflows/ci.yml:49-50` (`EMSDK_VERSION`, `EMSDK_COMMIT`) and `cli/src/node/toolchain/toolchain-paths.ts:33,43`. If they drift, CI builds with a compiler the toolchain code refuses. Add a comment on each side naming the other. Also `ci.yml:46` ("the first job to do so") is narrated history that goes stale; drop it.

- [ ] **B8: the size is called a download in one place and an installed size in others.** `install-toolchain.ts:9` and `toolchain-host.ts:10` say "1.6 GB download"; `INSTALLED_SIZE` (`toolchain-paths.ts:45`) and the consent question (`install-toolchain.ts:64`) say "installed". The consent text is what the user relies on. Verify the figure and use one word consistently (§1.3, honest cost).

- [ ] **B9: the `toolchain` dispatch block in `cli.ts` has no step label.** `cli/src/node/cli.ts:1014-1026` sits between numbered steps (the next is `Step 5`). Add `// --- Step N: Handle the toolchain subcommand ---` and renumber only if the neighbours need it.

- [ ] **B10: the `shell:` flag needs its consequence stated.** `cli/src/node/toolchain/toolchain-host.ts:85-86` explains why (`.bat` needs a shell) but not that on Windows every argument, including the cache path, is then interpreted by `cmd.exe` unescaped. Add one line saying all arguments here are constants or paths under the cache root. See O3.

### P4 — Optional, only if the architect approves

- [ ] `toolchain-command.ts:108-110` nested ternary building the JSON outcome: a small `outcomeJson()` helper would read better.
- [ ] `editor-wasm-build.ts` `buildEditorWasm` is ~145 lines. Its five step comments hold it together; extracting "flags" (Step 2) would shorten it. Not required.
- [ ] Rename `PROBE_PROJECT` / `probeCopy` / `wd_probe_box` references if the fixture is relocated (A1); "probe" is workspace vocabulary.
- [ ] `bridge.cpp:192-194` `kHatchPeriod` / `kBadgeW` / `kBadgeH` use `kCamel`; the C++ table says `U8G2GL_` SCREAMING. There is precedent (`u8g2gl_coord.h:109 kBeyondAnyOrigin`, `editor_host.h:134`), so leave unless the architect wants it unified.

## Verification Requirement

- [ ] `cd cli && npm run build && npm test` — zero warnings, all pass, none weakened (test titles change; assertions do not).
- [ ] `cd cli && npx vitest run test/node/design/build test/node/toolchain` — the Emscripten-dependent cases run, not skip, where a toolchain exists.
- [ ] If any `wasm/` C++ comment changes: the native build (`cmake -S . -B build -DU8G2GL_BUILD_TESTS=ON && cmake --build build`) is warning-free and `test_editor` / the parity test still pass.
- [ ] No behavioural change: `git diff` shows only comments, test titles/log text, local names and temp-dir prefixes (and, only if A1 is approved, the fixture move).
- [ ] `grep -rnE "\bd[1-8]\b|E-1[a-e]|G-PROBE|e1d-|principal-architect-workspace" cli/src cli/test/node wasm .github` returns nothing new (the `ci.yml:114` WO4 line is pre-existing).

## Issue Surfacing

Defects outside this checklist go in your Completion Report. Do not fix them.

## Review Notes

**Severity counts:** P1 0 · P2 3 · P3 10 · P4 4

**What is good (pattern-match against these):** every new TS file has a SPDX header, a `Purpose:` that says why the module exists, and an accurate grouped `Exports:` list. `File:` paths are all true. Header descriptions match the code (checked the three object caches, the build-hash inputs and the `PATH`-wins rule). `toolchain-paths.ts` (the pin and the tag-vs-commit reason), `framework-sources.ts` (why CMake is parsed, and why quotes are stripped), `prepare-build.ts` (length-prefixed hash) and the `childEnv`/`managedEnv` blocks have real why-comments. Step breakdowns are present wherever there are stages. The `bridge.cpp` placeholder, host-subject (base-from-member) and `subject_slot::base` comments are exactly the kind the standard asks for. No stale documentation was found on the changed lines.

**Checked and found fine:** no `node:` import in `cli/src/core/` in this diff; no stored `std::function` anywhere in `bridge.cpp`; enums in the diff are typed (`u8g2gl_subject_type_t : uint8_t`); header guard `U8G2GL_WASM_EDITOR_CONFIG_H` matches; `editor_config.h` header rewritten truthfully after its constants were removed; `editor-registry.ts` / `emit/index.ts` changes carry correct exports lists and why-comments (`assetLookup` explains the linear scan and the fonts/images split).

**Memory discipline in `bridge.cpp` (as asked):** nothing here breaks a non-negotiable, because the runtime (`include/`, `src/`) is untouched and heap-free. The bridge itself allocates (`std::vector`, `std::string`, `std::unique_ptr`, `std::make_unique`) and also did before this diff (the pre-diff file used all of these). New in this diff: `observer_storage`/`string_storage` vectors, the `s_arena` vector, and `s_placeholders_json`. Pre-existing and unchanged: `std::vector<u8g2gl_editor_value> args(...)` at `:599` allocates on every draw call every frame; that is a performance remark, not a firmware cost, and not a finding on changed lines. No size or layout claim is made in this audit, so nothing was measured; if the architect wants `subject_slot` member order tidied (largest alignment first), measure `sizeof` on wasm32 first.

**Observations (behaviour or standards gaps; not for the doc worker):**
- **O1:** `bridge.cpp:240-245` `fail()` keeps only the first error, and `selectScreen()` (`:846-856`) does not clear `s_last_error`. After one failed `renderFrame()` or `selectScreen()`, a later, different failure in the same scene reports the stale first message. `applyScene()` is safe because `teardown()` clears it. Suggest the architect confirm and decide.
- **O2:** `EM_CACHE` is stripped by `childEnv` (install) but not by `managedEnv` (builds); a user's exported `EM_CACHE` would send a managed build's Emscripten cache into their own install, against the "never touched" promise. Verify against emsdk behaviour before changing.
- **O3:** `toolchain-host.ts:85-86` `shell: true` on win32 with unescaped arguments (cache path from `LOCALAPPDATA`) is a command-injection surface if the path contains `&` or similar. Low likelihood; worth a decision.
- **O4:** the standards' heap-free rule is scoped to "the runtime"; `wasm/` editor-host code is not mentioned in cpp.md. B4 asks for a note in the file; the architect may prefer a line in cpp.md §7.
- **O5:** `ci.yml` uses actions by tag (`actions/checkout@v4`, `actions/cache@v4`), while the job takes care to pin emsdk by commit. Pinning by SHA would match that care; the standards are silent.
- **O6:** `bridge.cpp:699` `observers_wanted` saturates at 255 silently; the overflow would later surface as "binding refused" without the cause.

**Files reviewed:** `cli/src/node/toolchain/{detect-toolchain,install-toolchain,toolchain-command,toolchain-host,toolchain-paths}.ts`; `cli/src/node/design/build/{editor-wasm-build,editor-wasm-job,framework-sources,platform-headers,prepare-build}.ts`; `cli/src/core/generator/emit/{editor-registry,index}.ts` (diff); `cli/src/node/cli.ts` (diff); `wasm/{bridge.cpp,editor_config.h,CMakeLists.txt,u8g2gl_editor.mjs}`; `wasm/test/{placeholder,snapshot}.test.mjs`; `test/CMakeLists.txt` (diff); `.github/workflows/ci.yml` (diff); `cli/test/node/toolchain/{toolchain.test.ts,fake-host.ts}`; `cli/test/node/design/build/{editor-wasm-build.test.ts,prepare-build.test.ts,probe-project.ts}`; `cli/test/generator/emit-editor.test.ts` (diff). `fake-host.ts` and the middle of `toolchain.test.ts` were skimmed for pointers by grep, not read line by line.

## Completion Report

<!-- Written by the remediation worker at task completion -->
