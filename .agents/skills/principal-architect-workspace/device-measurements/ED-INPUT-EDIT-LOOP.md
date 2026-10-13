# Input to E-D: the editor's edit loop, and where Criterion 4 goes

**For:** E-D, the editor design item that comes first after the PR-07 gate (PROGRAM-PLAN.md).
**From:** the device-measurements session, 2026-10-13. Owner direction and approval are recorded in
[PROJECT.md](PROJECT.md). This note records a direction; E-D decides the design.

## Owner direction

> "the editor needs to take the XML - run it through the CLI and compile a WASM with a minimal
> harness … with some sample data. I think this is a test run. For the actual editing, I think we may
> need to build a WASM that reads the XML directly and renders it in 'framework' mode"

This is two modes with two different jobs. Both are already in the spec; this note connects them to
the precedent and to Criterion 4.

| Mode | Input path | Compiler in the loop? | Speed | What it proves |
|---|---|---|---|---|
| **Live editing ("framework mode")** | XML → CLI validator and resolver (TypeScript, in the browser) → scene description → **prebuilt** editor-target Wasm | No | Target **< 16 ms** from edit to pixels (`ui_spec.md` §4.1) | What the screen looks like, while designing |
| **Test run** | XML → CLI generate (firmware target) → Emscripten compile with a small harness and sample data → Wasm | Yes | Seconds; an explicit "Run" action | That the real generated C++ behaves the same, custom widget code included. The same build is §17.2's snapshot-test harness |

"The library" here means the U8G2GL runtime plus U8G2. LVGL is the model for the API, not a dependency.

## The precedent: departures-board `tools/layoutsim`

The original departures-board repository has a working version of the live-editing mode.
departures-board-v3's PR-13 planned to port it and was never built.

- **One Wasm module holds every widget class,** with a generated registry that maps a type name to a
  constructor (`gen_sim_registry.py` → `generated_registry.hpp`).
- **Layouts load into the running Wasm with no recompile:** `applyLayout(json)` is parsed in C++
  (`layoutParser.hpp`).
- **Sample data** comes in through `applyMockData(json)`, plus setters for system state (WiFi,
  weather, OTA).
- **The page draws frames** by calling `renderFrame(ms)` on each animation frame; it returns an RGBA
  buffer for the canvas.
- **The Wasm is rebuilt only when widget C++ changes:** the dev server hashes the widget headers
  against a hash embedded in the generated registry, and runs `build_wasm.py` on a mismatch.
- **Firmware takes a separate path:** `gen_layout_cpp.py` turns the same JSON into C++.

**What U8G2GL does differently, by design:** the layout is not parsed in C++. The CLI's own TypeScript
validator and resolver (the same code `generate` uses) produce a flat, fully resolved scene
description, and the Wasm only builds objects from it ([UD-4]). There is one parser, in one language,
for both the editor and the generator.

## What already exists in U8G2GL (branch `u8g2gl-05r/wo6-readability`, `81e533f`)

| Piece | Where | Status |
|---|---|---|
| Editor registry: construct, set and draw by name | `generate --target-kind editor` → `ui_editor_registry.cpp`; `cli/src/core/generator/emit/` | Built (PR-04), tested |
| Scene description, format version 2 | `ui_scene.json`; `cli/src/core/generator/emit/scene.ts` | Built |
| Runtime side | `include/u8g2gl/u8g2gl_editor.h`, `src/u8g2gl_editor.cpp` | Built |
| Host editor harness and scene parser | `test/editor_host/` | Built (host only) |
| Parity between the editor and firmware targets (same draw calls) | `test/test_editor_parity.cpp` | Built, in CI-able tests |
| Emscripten build of the editor host | none | **Missing.** Emscripten 5.0.3 is already in the toolchain (it regenerates `bdfconv`) |
| JS bridge: the `applyScene`, `applySampleData`, `renderFrame` equivalents | none | **Missing** |
| Browser shell, canvas, property panel | E-1, E-2 | After the gate |
| Sample data ([UD-6], open question U-6) | E-3 | After the gate |
| Rebuild trigger for **custom** widgets (their C++ must be in the editor Wasm) | none | **Missing.** departures-board's header hash is the model |

## Criterion 4, reframed (owner approved, 2026-10-13)

Criterion 4 ("the edit loop is faster") was measured as **edit the XML, then rebuild in PlatformIO**.
That loop is +6.2 s slower than legacy (EVIDENCE.md M5). All of the difference is PlatformIO's library
dependency scan; none of it is the generator (0.05 s) or compiling.

- **The firmware build loop, at PR-07:** record the +6.2 s as a cost of PlatformIO's default library
  finder, not of U8G2GL. `lib_ldf_mode = off` with explicit `lib_deps` is the known way out (14 s
  faster than legacy, but about 45 hand-kept lines and about 430 B of firmware difference). It is not
  adopted now.
- **The design loop, on the editor track:** it does not go through PlatformIO at all. It becomes an
  acceptance criterion for E-2: **under 16 ms from edit to pixels** in live-editing mode, with the
  test-run Wasm as a separate, slower check of fidelity.

## Related ruling (Q-C): time and binding updates belong to the framework

Approved 2026-10-13 and recorded in PROJECT.md. It bears on the editor's canvas, which runs the same
`ui_handler()` loop (`ui_spec.md` §4.2):

1. **Widgets that depend on time own their schedule.** The clock returns a deadline for its next
   visible change, the next second, from a wall-clock source the framework provides (a callback the
   app registers once, beside the tick callback). A widget author gets this by returning a deadline
   from `tick()`.
2. **A subject write is work.** Updating a binding ends the loop's sleep, either because
   `ui_handler()` returns 0 or through a wake hook given to the app, so binding-driven content never
   waits for an unrelated deadline.

In the editor, the same mechanism drives the canvas's animation and freeze toggle. A sample-data
change is simply a subject write.

## Questions for E-D

- How the browser gets a custom widget's C++ into the editor Wasm. Options: compile in the browser,
  a local build step watched by a dev server (as departures-board does), or prebuilt per project.
- Whether a test run is user-initiated or runs automatically after a pause in editing.
- The JS bridge's API surface, and whether it shares the `--json` contract ([D-16]).
- Where sample data lives (U-6).
