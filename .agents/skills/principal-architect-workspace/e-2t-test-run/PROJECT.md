# E-2T: The Test Run

**Parent:** the editor track, `docs/implementation_plan.md` §5 row E-2T ("Test run:
firmware-target harness in Wasm, parity verdict against the live frame"; depends on E-2, which
is merged). **Design:** `e-d-editor-design/EDITOR-DESIGN.md` §2.2 (toolbar), §4 (the two modes),
§5.2 (`-O3` for a test run). **Base:** `main` @ `07f59a0` (E-2 and S-1 merged). **Worktree:** `../U8G2GL-e2t`.

## Purpose

Live mode draws with the **editor** target: a scene, the editor registry and the bridge. The
device runs the **firmware** target: generated C++ calling the same runtime through
`ui_init()` and `ui_handler()`. [D-9] says the two draw the same pixels. Nothing checks it.
The test run builds the generated firmware code with the project's widgets into a harness, runs
its real frame loop on a virtual display, and compares the frames with the live module's, pixel
for pixel. The answer is a verdict in the canvas toolbar, not a second canvas.

## Decomposition

| WO | Topic | Branch |
|---|---|---|
| WO1 | The harness: generated firmware code + widgets + runtime on a memory display, `-O3`, built on the server | `u8g2gl-e2t/wo1-harness` |
| WO2 | The `test-run` job (unsaved text, frames, hashes) and the parity corpus over every fixture project | `u8g2gl-e2t/wo2-job-corpus` |
| WO3 | The designer: Run (⌘↵), the verdict, staleness, the diff overlay, the bug-report save | `u8g2gl-e2t/wo3-verdict` |
| WO4 | Run after a pause (opt-in), queued runs, the e2e suite and self-test, the live gates during a run | `u8g2gl-e2t/wo4-pause-gates` |
| WO5 | Readability review, screenshots, docs, CLI 0.15.0, PA verification | `u8g2gl-e2t/wo5-readability` |

One worker, in order, one PR.

## PA rulings

1. **The code under test is the firmware target, unmodified.** The harness compiles what
   `generate` writes (`ui.cpp`, `ui_screen_*.cpp`, `ui_subjects.cpp`, `ui_styles.cpp`,
   `ui_fonts.cpp`, `ui_images.cpp`, the config header), the project's widget units, and the
   runtime, and drives them as an application would: `u8g2gl_set_tick_cb()`, `ui_init()`,
   `u8g2gl_set_active_screen(&ui_screen_<name>)`, then `ui_handler(display)` at each frame time.
   The frame is whatever the display buffer holds after the call, so a frame `ui_handler()`
   declined to redraw shows its last frame, as the panel would. **No generator change**: the
   harness's screen table (name → `&ui_screen_<name>`) is emitted by the test-run code in
   `cli/src/node/design/test-run/`, not by `core/generator`. No golden moves.
2. **One memory display.** The bridge's memory display (`memory_display_cb`,
   `setup_virtual_display`) moves to `wasm/memory_display.{h,cpp}` and both the bridge and the
   harness use it, so the display is shared plumbing rather than code under test. The bridge's
   behaviour is unchanged: `snapshot`, `placeholder` and `last-error` tests pass with
   byte-identical frames.
3. **Built on the server, run in Node.** A `test-run` job on the design server's build queue
   (serial with editor-Wasm builds, never in the edit loop) generates into the build cache,
   compiles, links the harness at `-O3` (§5.2) and runs it in Node. It reuses the editor
   build's U8G2 object cache. The runtime cache is split so the harness links the runtime
   without the bridge and scene parser, at the same flags and configuration hash. Generation
   never writes into the project.
4. **The text the canvas showed.** The designer posts the content of every open document whose
   buffer differs from disk, with the content versions it rendered. The server stages a copy of
   the project in the build cache with those documents replaced and generates from that. Widget
   C++ is always read from disk, because the designer does not edit it. Nothing is saved for
   the user (EDITOR-DESIGN §2.3). *(The owner approved this as drafted, 2026-11-01.)*
5. **The frame times are fixed:** t = 0, 16, 100, 250, 500, 1000, 2000 and 5000 ms, on the
   active screen, with no sample data (E-3's). The live frames are rendered **when Run is
   pressed**: the designer applies the scene it rendered from that text to its loaded module,
   renders the same times from a fresh apply, then schedules a normal pipeline run. The canvas
   is restored within one frame. The harness renders the same times from a fresh `ui_init()`.
   Animation freeze does not change the times.
6. **The verdict** (EDITOR-DESIGN §2.2, §4.1–4.3), in the canvas toolbar:
   - `✓ parity · 2 s ago` when every frame matches;
   - `≠ 14 px differ` (the first differing frame's count, and its time) when one doesn't;
   - `· 4 edits since` once the text moves on, so a tick never vouches for text it did not check;
   - `running…` while a run is in flight;
   - `✕ test run failed` with its diagnostics in Problems, located at file, line and column as
     an editor build's are.

   **On a mismatch:** a diff overlay on the live canvas highlights the differing pixels of the
   first differing frame, and shows both frames' SHA-256 hashes. The overlay clears at the next
   edit. The verdict says a mismatch is a framework bug, and offers to save a bug report: the
   server writes both frames (PBM), the scene, the staged text and the versions to a
   `test-runs/<stamp>/` directory in the build cache, and the designer shows its path.
7. **When Run is unavailable,** the button is disabled and gives the reason:
   - no toolchain;
   - no source tree (an npm install);
   - the editor Wasm is not current: Run waits for the rebuild instead;
   - the canvas shows placeholders: the frames are not comparable;
   - the document is not well-formed.
8. **The shortcut:** ⌘↵ (Ctrl+Enter elsewhere) runs from anywhere in the designer, Monaco
   included. It overrides Monaco's *insert line below*, and the shortcut list says so.
9. **Run after a pause** (§4.2): a setting beside Run, **off by default**, stored per browser.
   When on, a run starts 2 s after the last edit. A Run requested while one is in flight is
   queued, at most one, with the latest text.
10. **The parity corpus.** A CLI test that needs Emscripten, under
    `test/node/design/test-run/`, skips with the same message as the existing ones, and CI's
    `wasm-tests` job runs it with the skip treated as a failure. For every fixture project
    (departures, `valid-project`, `emit-project`, `test/generated_fixture`, G-PROBE-2's probe
    project) and every screen, the harness frames must equal the project editor Wasm's frames
    at every time in ruling 5. **A mismatch is a finding, not a test to fix:** the worker
    stops, diagnoses and reports to the PA before changing anything in the runtime, the bridge
    or the generator.
11. **Gates:**
    - Run on the departures fixture shows `✓ parity` in e2e, with the real toolchain.
    - A test-only hook that flips one harness pixel shows `≠ 1 px differ` and the overlay. It
      is absent from the production build, which the no-hook grep checks.
    - The existing keystroke, drag and panel gates are re-measured on the finished tree with
      thresholds unchanged. The keystroke gate is also run once **while a test run compiles**
      and reported: if it exceeds 16 ms, the PA rules on build parallelism.
    - Run time, cold and warm, is reported on departures. It is a target of 5 s warm, not a
      gate.
12. **Boundary:**
    - `wasm/` (the harness, the memory-display extraction, its CMake target);
    - `cli/src/node/design/` (the test-run build, the job, the bug-report writer);
    - `designer/` (toolbar, overlay, settings, e2e, tests);
    - CI's `wasm-tests` vitest path;
    - docs (EDITOR-DESIGN status, `implementation_plan.md`: E-2 done, E-2T).

    **Excluded:** nothing in `include/` or `src/` (the runtime), nothing in `core/generator`, no
    schema change, no new dependency. CLI 0.15.0, a minor bump for the new job. Runtime
    unchanged.

## Owner decision

**Ruling 4, what text Run tests,** was offered as (a) the unsaved buffers, staged in the cache
(recommended), or (b) the saved project only, with Run disabled while a buffer is dirty. The
owner approved the decomposition with ruling 4 as drafted, that is (a).

## Status log

- **2026-11-01. Owner approval** of this decomposition and its rulings, verbatim: **"Approved,
  proceed"**. Worktree `../U8G2GL-e2t` created from `main` @ `07f59a0`, `extern/u8g2` checked
  out. WO1–WO5 issued to one worker in order.
