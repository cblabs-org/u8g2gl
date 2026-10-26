# LOOP-BUDGET: Where the 16 ms Goes

**E-D WO1.** Measured 2026-10-26 on `main` @ `fdf75ed`, branch `u8g2gl-ed/wo1-measure`.
**Question:** can E-2 meet the owner's **under 16 ms from edit to pixels**, and where is the
time spent? Also: how long does the widget author wait when widget C++ changes, now that
the owner has ruled served-first (PROJECT.md, 2026-10-26)?

**Answer:** yes, with room to spare. On the live path as it exists today, a canvas nudge
on the departures screen costs **1.1 ms median and 1.9 ms worst** in Chromium, Monaco
included. A 100-element screen, five times ui_spec's upper bound, costs 2.1 ms median and
3.3 ms worst. **The 16 ms risk is not in the pipeline.** What these runs cannot see is
covered under "What this does not measure".

A widget rebuild takes **2.7 s** with today's `-O3` link, or about **1.1 s** with a
development link.

---

## 1. Method

Each run is one **canvas nudge**: an integer attribute rewritten in the screen's text, then
every stage of ui_spec §4.1 through to pixels. Every iteration changes the value, so no
stage can cache its way past the work.

| Stage | What runs | Code on `main` |
|---|---|---|
| monaco | Rewrite the attribute's range in Monaco's model (`pushEditOperations`), read the text back. *Chromium only* | Monaco 0.52.2 |
| parse | `parseScreenFile()` on the edited screen. A full re-parse of that file, not an incremental one | `cli/src/core/parser/` |
| pipeline, realise | `createScreenPipeline()` (expand, resolve) and `realiseScreens()`. *Merged as "resolve" in Chromium* | `resolver/`, `realise/` |
| check | `checkProject()`: every validator pass, under the `'error'` policy | `generator/check-project.ts` |
| capacity, scene | `computeCapacities()`, then `emitSceneFile()`, the scene as JSON text. *Merged as "scene" in Chromium* | `emit/scene.ts` |
| apply | Wasm `applyScene()`: parse the JSON in C++, tear down every object, rebuild every object | `wasm/bridge.cpp` |
| render | Wasm `renderFrame()`: tick, then draw into the U8G2 buffer | `wasm/bridge.cpp` |
| blit / paint | U8G2's tiled 1-bit buffer to RGBA. In Chromium also `putImageData` and a 4× nearest-neighbour `drawImage` | — |

**Projects:**

| | Elements | Display | What it is |
|---|---:|---|---|
| **probe** | 9 | 256×64 | G-PROBE-2's departures screen, its two custom widgets' **real C++** linked in (§4) |
| **fixture** | 3 screens, 20 | 128×64 | `test/generated_fixture`: composites, styles, bound positions, an image |
| **stress20** | 20 | 256×64 | Synthetic: alternating labels and boxes. ui_spec §2's upper bound |
| **stress100** | 100 | 256×64 | The same pattern, five times over that bound |

**Host:** Apple M5 Pro, Node 26.8.1, and Chromium 152 (the desktop app's browser pane) on
a 120 Hz display. Iterations follow 30 warm-up runs: 200 in Node, 300 frames in Chromium.
**Chromium's timer reads in 0.1 ms steps** in a page that is not cross-origin isolated, so
Chromium's sub-0.1 ms stages read 0.0 or 0.1.

**Reproduce:** see §6. Raw output is in [`evidence/wo1/`](evidence/wo1/).

## 2. The live path, in Node

Median / p95 / max, in milliseconds. From `bench-probe.txt`, `bench-fixture.txt`,
`bench-stress20.txt` and `bench-stress100.txt`.

| Stage | probe | fixture | stress20 | stress100 |
|---|---|---|---|---|
| parse | 0.02 / 0.03 / 0.12 | 0.03 / 0.05 / 0.20 | 0.04 / 0.05 / 0.26 | 0.17 / 0.23 / 0.51 |
| pipeline | 0.00 / 0.00 / 0.01 | 0.00 / 0.00 / 0.01 | 0.00 / 0.00 / 0.10 | 0.00 / 0.00 / 0.00 |
| realise | 0.01 / 0.02 / 0.11 | 0.04 / 0.06 / 0.23 | 0.02 / 0.03 / 0.25 | 0.06 / 0.11 / 0.44 |
| **check** | **0.12** / 0.26 / 0.54 | **0.22** / 0.43 / 1.08 | **0.17** / 0.32 / 0.45 | **0.40** / 0.78 / 3.15 |
| capacity | 0.00 / 0.00 / 0.00 | 0.00 / 0.01 / 0.01 | 0.00 / 0.00 / 0.01 | 0.00 / 0.01 / 0.02 |
| scene | 0.03 / 0.04 / 0.14 | 0.06 / 0.09 / 0.42 | 0.04 / 0.06 / 0.07 | 0.18 / 0.34 / 0.63 |
| **apply** | 0.06 / 0.07 / 0.17 | 0.12 / 0.16 / 0.17 | 0.09 / 0.12 / 0.14 | **0.40** / 0.48 / 0.81 |
| render | 0.01 / 0.01 / 0.02 | 0.01 / 0.01 / 0.03 | 0.01 / 0.02 / 0.03 | 0.05 / 0.06 / 0.07 |
| blit | 0.01 / 0.02 / 0.02 | 0.01 / 0.01 / 0.01 | 0.01 / 0.02 / 0.02 | 0.02 / 0.02 / 0.03 |
| **total** | **0.26** / 0.42 / 0.67 | **0.50** / 0.78 / 1.40 | **0.40** / 0.60 / 0.73 | **1.29** / 1.88 / 3.97 |
| *generate(), for reference* | 0.18 / 0.29 / 0.42 | 0.40 / 0.73 / 1.43 | 0.26 / 0.46 / 0.59 | 0.64 / 1.08 / 5.20 |
| Scene JSON | 8.8 KB | 20.6 KB | 16.4 KB | 77.2 KB |

`pipeline` reads near zero because the pipeline object computes lazily. Its work is paid
inside `realise` and `check`, and the total includes it.

## 3. The live path, in Chromium with Monaco

From `bench-chromium.txt`, produced by [`evidence/wo1/browser/bench.html`](evidence/wo1/browser/bench.html).
The project loads from strings, as a served editor would. Each frame runs inside
`requestAnimationFrame`.

| Stage | probe | stress20 | stress100 |
|---|---|---|---|
| monaco | 0.2 / 0.3 / 0.4 | 0.2 / 0.3 / 0.4 | 0.1 / 0.2 / 0.4 |
| parse | 0.1 / 0.2 / 0.2 | 0.1 / 0.2 / 0.3 | 0.2 / 0.3 / 0.4 |
| resolve | 0.0 / 0.1 / 0.2 | 0.1 / 0.1 / 0.2 | 0.1 / 0.2 / 0.3 |
| **check** | **0.4** / 0.6 / 0.8 | **0.5** / 0.8 / 1.0 | **0.7** / 0.9 / 1.2 |
| scene | 0.1 / 0.2 / 0.3 | 0.1 / 0.2 / 0.3 | 0.2 / 0.3 / 0.4 |
| apply | 0.2 / 0.3 / 0.4 | 0.2 / 0.4 / 0.4 | 0.6 / 0.7 / 0.9 |
| render | 0.0 / 0.1 / 0.2 | 0.0 / 0.1 / 0.1 | 0.1 / 0.2 / 0.2 |
| paint | 0.1 / 0.2 / 0.3 | 0.1 / 0.2 / 0.2 | 0.0 / 0.1 / 0.2 |
| **total** | **1.1** / 1.5 / 1.9 | **1.3** / 1.8 / 2.3 | **2.1** / 2.5 / 3.3 |
| Frame interval | 8.3 / 9.9 / 10.4 | 8.3 / 9.8 / 10.3 | 8.3 / 9.5 / 10.2 |

**No frame was dropped at 120 Hz** in any run: the worst interval was 10.4 ms, against an
8.3 ms frame.

## 4. The widget author's loop: rebuilding the project editor Wasm

From `build-probe-wasm.txt`, `link-variants.txt` and `build-fixture-wasm.txt`.

This is the first time G-PROBE-2's widget C++ has been **linked and run** in the editor's
Wasm (see Finding F5). The build mirrors `wasm/CMakeLists.txt`'s flags and swaps in the probe
project's registry, as generated by the current CLI, plus its widget sources. U8G2's C
library comes from the fixture build, because it is project-independent.

| Build | Compile | Link | Total |
|---|---:|---:|---:|
| Fixture editor Wasm, `cmake --build`, cold, U8G2 C library included | — | — | 7.5 s |
| Probe editor Wasm, clean (22 translation units, U8G2 library cached), median of 3 | 1.6 s | 2.2 s | **3.8 s** |
| One widget edited (the widget and the registry recompile), `-O3` link, median of 3 | 0.5 s | 2.2 s | **2.7 s** |
| The same edit with an `-O1` link | 0.5 s | 0.6 s | **≈1.1 s** |
| The same edit with an `-O0` link | 0.5 s | 0.6 s | ≈1.1 s |

Sizes: `-O3` 111 KB, `-O1` 143 KB, `-O0` 148 KB.

**The link dominates a widget rebuild, and `-O3`'s optimiser is most of the link.** A
development link at `-O1` takes a widget edit from 2.7 s to about 1.1 s, with no change
to the C++. The design server should link at `-O1` while editing, and keep `-O3` for a test
run or a release.

## 5. What this does not measure

1. **A slower machine.** These runs are on an M5 Pro. Headroom is 8× (stress100, p95, against
   16 ms) to 14× (probe). A machine six times slower would hold for realistic screens and
   become tight only past ui_spec's bound. **E-2's acceptance test must run on a modest
   machine, not the author's.**
2. **The React shell.** Dockview, the property panel, the status bar's live geometry and
   the Problems list all re-render around an edit. None of them exists, so none is measured.
   **This is now the 16 ms risk.** A panel that re-renders every field on every drag frame
   can easily cost more than the whole pipeline. EDITOR-DESIGN.md names the rule that
   prevents it.
3. **The CST.** None exists. The parse stage here is today's tokeniser over the whole
   screen. A CST parser has more to record (offsets, ranges, trivia) but no harder a job, and
   re-parsing a whole file costs 0.2 ms even at 100 elements. **So an incremental CST parser
   is not needed for speed**, which simplifies E-1.
4. **Multi-screen projects at scale.** The validator checks every screen on each edit. The
   fixture's three screens cost 0.22 ms. A 20-screen project is unmeasured; it would scale
   roughly linearly, and checking only the edited screen is the obvious fallback.
5. **Fonts, images and assets.** The probe uses built-in fonts only. Compiling a `<bdf>`
   (`bdfconv` in Wasm) is a load-time cost, not a per-edit one, and was not timed.
6. **Animation.** Every frame here is one edit. The canvas's own animation loop (ui_spec §4.2)
   calls only `render`, which is already measured, at 0.01–0.05 ms.
7. **Widgets with data.** Without data, the custom widgets draw little (F7), so `render`
   understates a busy departures board. Even ten times the stress100 render time is 0.5 ms.

## 6. Findings for the design

**F1. 16 ms is reachable, and the owner's number stands.** It need not be challenged, and E-2
can be held to it, measured on a modest machine with the shell in the loop.

**F2. The 16 ms risk has moved from the pipeline to the shell.** Every stage measured here is
a fraction of a millisecond. The part nobody has built is the part that will spend the time.

**F3. The pipeline needs no fast path.** The "predict geometry during a drag" fallback that
the bridge discussion considered is not needed. Every edit can take the honest route through
the text, as `[UD-3]` requires. That is the simplest design, and it is now also a measured one.

**F4. A widget rebuild takes about 1 s with a development link.** The served-first ruling's
cost to the widget author is a one-second wait after saving widget C++. That is comparable to
a web dev server's hot reload, not a firmware build.

**F5. Until WO1, G-PROBE-2's widget C++ had never run.** WIDGET-PATH.md §1.2 reports a "full
screen" render at SHA-256 `0b0e554a…`. That render is a scene of labels and boxes written in
JavaScript to imitate the widgets (`render-full.mjs` lines 113–508). The widgets' own C++
was only syntax-checked (`-fsyntax-only`). Its §1.3 item 3 says as much ("the Wasm harness
maps widget draw calls directly"), but its summary and its §1.2 do not. **The "pixel-accurate"
claim describes the imitation, not the widgets.** Reported here as a defect in that document,
not corrected, because it is G-PROBE-2's.

**F6. The editor Wasm is limited by a fixed configuration, not the project's.** Beyond F1 in
PROJECT.md (the fixture's registry, fonts and images are linked in):
- `bridge.cpp` caps string subjects at **128 bytes** (`u8g2gl_subject_string_n<128, 16>`).
  The departures project declares `message_text max_len="256"`, and `applyScene` refuses the
  whole project. G-PROBE-2's harness worked around it by truncating to 128.
- It caps the display buffer at **2,048 bytes**, which is 256×64, so a larger panel cannot
  render.
- `editor_config.h` fixes object, style and binding ceilings.

A per-project editor Wasm must take these from the project's own generated capacities
(`u8g2gl_generated_config.h`, [D-21]), not from constants. This measurement edited one value
in a copy of the project (`build/probe/project`) to get past the 128-byte cap.

**F7. A collection widget draws nothing in the editor, and no sample data can reach it.** With
the widgets' real C++ running, **both `wd_service_list` instances light 0 pixels**: the main
content of a departures board is blank (`widget-pixels.txt`). Their rows arrive through C++
methods (`begin()`/`add_row()`/`commit()`, WIDGET-PATH.md §1.3). Neither the bridge nor
`[UD-6]` sample data, which sets **subjects**, can call them. `wd_train_formation` draws its
empty carriage frames. **This is the most important finding for the designer's usefulness on
real projects**, and it connects to [Q-19] and PR-08's declared-capacity collections.
EDITOR-DESIGN.md takes it up.

**F8. The scene already carries what selection sync needs.** Each scene element has
`source: { file, line, column }` (`ui_scene.json`), so a canvas hit maps to text without a
lookup. With a CST it should carry a **range**, not a point (E-1).

**F9. The fixture's committed probe registry was stale.** `g-probe2-widgets/evidence/probe-project/generated_editor/ui_editor_registry.cpp`
has no entry for `wd_train_formation`. The current CLI emits one. These are evidence files,
so this is recorded rather than corrected.

**F10. The toolchain the served mode will manage is not managed today.** The only Emscripten
on this machine is `departures-board/tools/layoutsim/emsdk`, inside another repository. CI
does not build the Wasm: `.github/workflows/ci.yml` has no Emscripten job. **I said otherwise
to the owner on 2026-10-24** ("PR-06 already builds Wasm in CI"), and that was wrong. A pinned,
CLI-managed Emscripten (E-1) would be the first one the programme owns.

## 7. Reproduce

From the repository root, in a worktree with `cli/` built (`npm ci && npm run build`) and
`emsdk_env.sh` sourced:

```bash
emcmake cmake -B build/wasm -DCMAKE_BUILD_TYPE=Release && cmake --build build/wasm -j8 --target u8g2gl_editor
P=.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/probe-project
E=.agents/skills/principal-architect-workspace/e-d-editor-design/evidence/wo1
cp -R $P build/probe/project
sed -i '' 's/max_len="256"/max_len="128"/' build/probe/project/globals.xml   # F6
node cli/dist/node/cli.js generate $P --target-kind editor --out build/probe/generated_editor
node cli/dist/node/cli.js generate build/probe/project --target-kind editor --out build/probe/project_editor
bash $E/build-probe-wasm.sh
node $E/bench-edit-loop.mjs build/probe/project build/probe/wasm screen_departures.xml row0 x 200
node $E/bench-edit-loop.mjs test/generated_fixture build/wasm/wasm screen_bounds.xml logo x 200
for N in 20 100; do cp -R build/probe/project build/stress$N; python3 $E/make-stress.py build/stress$N $N
  node $E/bench-edit-loop.mjs build/stress$N build/probe/wasm screen_departures.xml l10 x 200; done
node $E/widget-pixels.mjs build/probe/project_editor/ui_scene.json build/probe/wasm
python3 -m http.server 8765   # then open evidence/wo1/browser/bench.html?project=build/stress100&element=l10
```
