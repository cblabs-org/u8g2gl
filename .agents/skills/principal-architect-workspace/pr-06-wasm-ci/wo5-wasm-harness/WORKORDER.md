---
name: pr-06-wo5
description: Handoff instructions for Work Order 5 — Wasm harness
complexity: architect
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not branch, and do not plan. Your task is strictly limited to
> executing the checklist below.

# Objective

Build the Emscripten editor-target Wasm module, the JS bridge, and the snapshot-
test harness. Port from departures-board's `layoutsim` model. Prove D-9 parity:
the Wasm render must reproduce criterion 1's frame byte-identical.

**Parent project:** `pr-06-wasm-ci` — owner approved decomposition 2026-10-15.

# Strict Boundary Box

- Create new files under `wasm/` for the Emscripten build and JS bridge.
- Create snapshot test infrastructure (can be under `test/wasm/` or `wasm/test/`).
- Modify `CMakeLists.txt` (root) only to add the Emscripten target (conditional).
- Do **not** modify runtime source under `src/` or `include/u8g2gl/`.
- Do **not** modify the CLI.
- Do **not** modify `.github/workflows/ci.yml` (CI integration is WO3's job).
- The branch will be `u8g2gl-06/wo5-wasm-harness`, branched from WO4's tip.

# Tooling Constraints

- Build with Emscripten (`emcmake cmake`). Emscripten 5.0.3 is already available
  on this machine (it regenerates `bdfconv` for the font pipeline).
- Test with Node.js — the snapshot tests should be runnable via `node` or `vitest`.
- PlatformIO is **not** needed for this WO.

# Context

## The two-mode architecture (ED-INPUT-EDIT-LOOP.md)

| Mode | Speed target | Compiler in the loop? |
|---|---|---|
| Live editing | <16 ms from edit to pixels | No — prebuilt Wasm |
| Test run / snapshot | Seconds | Yes (but not in this PR) |

PR-06 builds the **prebuilt Wasm module** and the snapshot test infrastructure.
The browser shell (E-1/E-2) and the test-run compiler-in-the-loop mode are out
of scope.

## What already exists

- **Editor registry** (`generate --target-kind editor`): construct, set, bind,
  draw by name. Generated `ui_editor_registry.cpp`.
- **Editor host** (`test/editor_host/`): a C++ host that reads `ui_scene.json`
  and builds/renders screens through the registry. This is the pattern to follow.
- **Scene JSON format** (`ui_scene.json`): the flat scene description the CLI
  produces, read by the host.
- **Editor parity test** (`test/test_editor_parity.cpp`): proves the editor
  host produces the same U8G2 stub calls as the firmware path.

## The departures-board layoutsim model

- One Wasm module holds every widget class, with a generated registry mapping
  names to constructors.
- `applyLayout(json)` loads a scene into the running Wasm.
- `applyMockData(json)` sets sample data.
- `renderFrame(ms)` renders and returns an RGBA buffer.
- The Wasm is rebuilt only when widget C++ changes.

## D-9 parity requirement (CA ruling)

The Wasm render must reproduce criterion 1's `connected` frame byte-identical:
`lit=1405`, sha256 `b9042618dac87853d16f56f103b19352b3683428b15a9699b303583878d0f62d`.

This means the Wasm build must produce the same pixel output as the host (CMake)
build and the device (PlatformIO) build. Three renderers, one byte string.

The frame is 256x64 (SSD1322 panel), and the sha256 is of the raw buffer as U8G2
stores it (vertical_top_lsb for SSD1306, but the SSD1322 uses a different driver
— check which). **Important:** The Wasm build uses a virtual display (the
capture buffer), not a real U8G2 display driver. The buffer contents must match.

# Line-Item Instructions

## 1. Create the Emscripten CMake target

- [ ] Create `wasm/CMakeLists.txt` with an Emscripten build target:
  - Compile all runtime sources (`U8G2GL_RUNTIME_SOURCES` from root CMakeLists)
    with `U8G2GL_EDITOR` defined.
  - Compile the generated editor registry fixture
    (`test/generated_fixture/generated/ui_editor_registry.cpp`) — or create a
    standalone Wasm that includes the registry.
  - Compile the U8G2 C sources needed (the same set as
    `u8g2gl_u8g2_csrc_arduino` in `test/CMakeLists.txt`, with ARDUINO defined).
  - Compile a C++ bridge file (`wasm/bridge.cpp`) that exports functions to JS.
  - Link settings: `-sEXPORTED_FUNCTIONS`, `-sEXPORTED_RUNTIME_METHODS`,
    `MODULARIZE=1`, `EXPORT_ES6=1` (or CommonJS for Node.js testing).
  - Output: `u8g2gl_editor.wasm` + `u8g2gl_editor.js`.

- [ ] Conditionally include from root `CMakeLists.txt`:
  ```cmake
  if(EMSCRIPTEN)
      add_subdirectory(wasm)
  endif()
  ```

## 2. Write the C++ bridge (`wasm/bridge.cpp`)

The bridge adapts the editor host's C++ API to Emscripten's exported functions.
Base it on the `editor_host` pattern in `test/editor_host/`:

- [ ] `applyScene(const char* json)` — Parse the scene JSON and build the
  described screen through the registry. Uses the same `scene_json` parser and
  `editor_host` logic. Returns a success/failure status.

- [ ] `applySampleData(const char* json)` — Set subject values from a JSON
  object like `{"subject_name": value, ...}`. Each key maps to a subject by
  name; the value is set according to the subject's type.

- [ ] `renderFrame(uint32_t ms)` — Tick all subjects that need it (time),
  render the screen into a virtual U8G2 display buffer, and return a pointer
  to the pixel buffer. The caller (JS) reads the buffer as a `Uint8Array`.

- [ ] `getDisplayWidth()` / `getDisplayHeight()` — Return the virtual display's
  dimensions.

- [ ] `teardown()` — Destroy all objects and free resources, so the Wasm can be
  reused for a different scene.

- [ ] The bridge must initialise a U8G2 "virtual display" — use `u8g2_SetupBuffer`
  with a full buffer and `u8x8_dummy_cb` (no hardware), same as
  `test_bound_child_clip.cpp` does.

## 3. Create the JS wrapper (`wasm/u8g2gl_editor.mjs`)

- [ ] A thin JS module that:
  1. Loads and instantiates the Wasm module.
  2. Exposes `applyScene(json)`, `applySampleData(json)`, `renderFrame(ms)`,
     `getDisplaySize()`, `teardown()`.
  3. Handles string marshalling (allocate/free on the Wasm heap for JSON strings).
  4. Returns the pixel buffer as a `Uint8Array` (copy from Wasm memory).

## 4. Write the snapshot test runner

- [ ] Create `wasm/test/snapshot.test.mjs` (or `.ts`):
  1. Load the Wasm module.
  2. Apply the emit-project fixture's scene JSON.
  3. Provide the fixture's fonts and images (or stubs if the Wasm doesn't need
     real font data for the pixel hash).
  4. Set sample data matching criterion 1's `connected` scenario.
  5. Render a frame.
  6. Compare the pixel buffer against a committed baseline (or compute sha256).

- [ ] For the D-9 parity proof specifically: this may require the foundation
  display setup (SSD1322 256x64). If reproducing criterion 1's exact frame is
  not feasible without foundation's scene, **create a simpler parity proof**:
  render the emit-project fixture through both the host test (CMake) and the
  Wasm, and compare the pixel buffers. Document which approach was taken.

## 5. Size the editor-target capacities

The bridge says "the editor runtime uses default capacities, which the Wasm
build must size." The editor host in `test/editor_host/` uses subjects with
capacity 8 (line ~111-114). The Wasm module must define appropriate capacities.

- [ ] In the Wasm bridge or a config header, define the capacities for the editor
  build: `U8G2GL_MAX_OBJECTS_PER_SCREEN`, `U8G2GL_MAX_TOTAL_BINDINGS`,
  `U8G2GL_MAX_STYLES`, etc. The editor host is more generous than firmware
  (it rebuilds scenes, so it needs headroom). Document the chosen values.

## 6. Verify

- [ ] `emcmake cmake -B build-wasm && cmake --build build-wasm` — compiles.
- [ ] `node wasm/test/snapshot.test.mjs` (or equivalent) — snapshot test passes.
- [ ] The parity proof produces evidence (sha256 match or pixel buffer identity).
- [ ] `git branch --show-current` — `u8g2gl-06/wo5-wasm-harness`.

# Verification Requirement

Conventional commits: `feat(wasm): Emscripten editor-target build`,
`feat(wasm): JS bridge and snapshot test harness`,
`test(wasm): D-9 parity proof`.

# Issue Surfacing

Surface out-of-scope findings in the Completion Report.

---

## Completion Report (written by the worker at task completion)

### Status

### Changes Made

### Decisions Made

### Dead Ends & Warnings

### Out-of-Scope Findings

### Blockers
