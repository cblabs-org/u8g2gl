# EDITOR-DESIGN: The U8G2GL Designer

**E-D WO2.** 2026-10-26, against `main` @ `fdf75ed`.
**Builds on:** [ui_spec.md](../../../../docs/ui_spec.md) `[UD-1]`–`[UD-7]`, which are settled
and unchanged. Sequencing is amended by the owner's served-first ruling (PROJECT.md,
2026-10-26). Measurements are in [LOOP-BUDGET.md](LOOP-BUDGET.md).
**Companion:** [E1-DECOMPOSITION.md](E1-DECOMPOSITION.md) (WO3): E-1 as PRs with
acceptance criteria, and the proposed Tier-1 amendment text.

> ui_spec says what the designer *is*. This document says what a person *does* in it and
> what it does back, and settles the five things the bridge left to E-D.

---

## Summary

| | Decision | Basis |
|---|---|---|
| **1. The edit loop** | Monaco owns the text and the one undo stack. A CST, parsed fresh from the text on every edit, gives the canvas its ranges. A canvas gesture emits text edits against those ranges. Every edit takes the full path from text to pixels, at most once per animation frame. **There is no fast path.** | Measured: 1.1 ms median and 1.9 ms worst for the departures screen in Chromium with Monaco. 3.3 ms worst at 100 elements. **16 ms stands** |
| **2. The two modes** | **Live** is always on. The **test run** compiles the firmware target and is **user-initiated** (Run, ⌘↵), with an opt-in to run after a pause. It reports parity with the live frame, not a second canvas | The owner's two-mode direction (ED-INPUT-EDIT-LOOP.md). With a server, Run can actually build |
| **3. Custom widgets** | `u8g2gl design` builds a **per-project editor Wasm** with a CLI-managed, pinned Emscripten. It rebuilds when widget sources change: about 1 s with a development link. The canvas shows an **honest placeholder** for anything it cannot render | The owner's served-first ruling. WO1's 1.1 s rebuild |
| **4. E-1** | Five PRs: **E-1a** CST and round-trip · **E-1b** the parser on the CST, closing [Q-17] · **E-1c** the design server · **E-1d** the project editor Wasm · **E-1e** the shell. Only E-1a → E-1b → E-2 is a critical path. The shell does not wait on the CST | E1-DECOMPOSITION.md |
| **5. Questions** | E-1 settles **[Q-17]**. E-D rules **[Q-10]** now and E-2 inherits it. E-2 inherits a rule for **[Q-19]**. **[Q-7]** waits for a schema decision. **[U-6]** is E-3's | §7 |

**The biggest risk** is not 16 ms. It is that **the canvas cannot show a real project's main
content**. In the departures board, both service lists render **blank**, because their rows
arrive through C++ methods that nothing in the editor can call (LOOP-BUDGET F7). The fix
belongs to PR-08 on the firmware track, which is sequenced without the editor in mind. See §9.

---

## 1. Premises

1. **The user is a developer with a toolchain** (owner, 2026-10-23 and 2026-10-24). They build
   ESP32 or Arduino firmware, write widget C++, and have an IDE open on the same files. ui_spec
   §1's non-coding designer is not this release's user. Nothing below forecloses that user,
   because `ProjectFileSystem` keeps static mode possible (§5.5).
2. **Served-first** (owner, 2026-10-26). `npx u8g2gl design` is how the designer starts.
   Static mode is deferred, not dropped. **The server is never in the 16 ms loop**: rendering is
   in-browser Wasm, as `[UD-4]` designed.
3. **Text is the truth** (`[UD-3]`). Nothing in this document gives the canvas state of its own.
   Every change the canvas makes is a text edit, made before the canvas shows its result.
4. **Schema 0.4 is fixed.** The owner decides any bump. §8 lists what the designer does without
   the schema features ui_spec §15 asked for, and when to bring that decision back.
5. **Deferred stays deferred.** No repeaters ([Q-8]), no cards ([Q-15]), no modals, no `<row>`/`<col>`.

---

## 2. The session: what a person does, end to end

### 2.1 Starting

```
$ npx u8g2gl design            # in the project directory
  u8g2gl design · project 'probe' · schema 0.4
  ✓ toolchain  emscripten 5.0.3 (managed)
  ✓ editor Wasm  built 3.8 s · 2 project widgets
  → http://127.0.0.1:5199/#t=8f3c…        (opened in your browser)
```

- **The first run on a machine** installs the pinned Emscripten into the user's cache, with
  consent: `Install Emscripten 5.0.3 (about 1.6 GB on disk)? [Y/n]`. That is the size
  of this machine's emsdk `upstream/` directory, measured; it is not small, and the
  prompt says so. If the user declines, the editor
  still opens. Framework elements render, and project widgets show placeholders (§5.4). The
  status bar says why, and how to fix it.
- **The URL carries a random token.** A localhost server is reachable from every page in every
  browser on the machine, so a request without the token is refused. This is security, not
  polish. E-1c's acceptance criteria test it.
- **One server per project.** A second `u8g2gl design` in the same project attaches to the
  first, rather than starting two watchers that race.

### 2.2 The screen

ui_spec §6's layout stands: activity bar, sidebar, editor area with canvas and XML split,
property panel, bottom panel, status bar. Served-first changes three things:

| Region | Addition |
|---|---|
| **Status bar** | An **editor Wasm** indicator: `● current` · `◐ rebuilding` · `✕ build failed` · `○ no toolchain`. Click it to open Output |
| **Bottom panel** | **Problems** gains widget compiler diagnostics, located at file, line and column in the widget's `.cpp` |
| **Canvas toolbar** | **Run** (⌘↵) and the last test run's result: `✓ parity · 2 s ago`, or `≠ 14 px differ` |

### 2.3 Saving, and the IDE beside it

The user has the same files open in VS Code or PlatformIO. The designer is a **co-author**
(ui_spec principle 5), so the following rules apply:

- **Save is explicit** (⌘S), with a dirty marker on the tab. There is no autosave: a write
  the author did not ask for, landing in a file their IDE also holds, makes a conflict out of
  nothing.
- **An external change to a clean buffer reloads silently**, preserving selection where the
  element's `name` still exists.
- **An external change to a dirty buffer asks:** keep mine, take theirs, or open a diff. The
  designer never silently overwrites.
- **Generated names** (`[U-1]`) are written into the buffer when the file opens, so they
  appear in Monaco at once. They reach disk only on save, as §16.1 requires. A file opened
  only to look at it is never rewritten.
- **Generate** (⇧⌘B) runs `u8g2gl generate` through the server into the project's `generated/`.
  Building the firmware stays in the user's own toolchain (ui_spec §14).

---

## 3. Decision 1: The Edit Loop

### 3.1 Who owns what

| Component | Owns | Does not own |
|---|---|---|
| **Monaco model** | The text of each open document, and **the one undo stack** (`[UD-3]`) | Any notion of elements |
| **CST** (`cli/src/core/cst/`, E-1a) | The structure of the current text: elements, attributes, comments and whitespace, each with an **exact offset range**. Edit functions that turn an intent into `TextEdit[]` | State. It is rebuilt from the text, never edited in place |
| **Semantic pipeline** (today's parser, validator, resolver and realiser, fed from the CST by E-1b) | Diagnostics, the resolved scene | The text |
| **Editor Wasm** | Objects, ticking, the framebuffer | Anything persistent. It is rebuilt from a scene on every edit |
| **Canvas** | Selection, hover, an in-progress gesture | Element positions. **It never draws a position the text does not hold** |
| **Design server** | Files on disk, the watcher, editor-Wasm builds, test runs | Anything in the per-edit loop |

**The CST lives in `cli/src/core`, not in the designer.** It is isomorphic and has no
dependencies, so it can be tested without a browser. And there is then one parser for the
generator and the designer ([D-10]'s point, and `[U-1]`'s mechanism note). E-1b replaces the
tokeniser under the existing parser with the CST. A second parser beside the old one would
drift from it, the way the editor's and the generator's views of a file must never drift.

**Fresh parse, not incremental.** WO1 measured a full re-parse of a 100-element screen at
0.2 ms (LOOP-BUDGET §5.3). An incremental CST would add a class of bug to save time that
nothing needs. E-1a parses the whole document on every edit. If that ever measures slow, the
design permits incremental parsing later, because nothing outside the CST would notice.

### 3.2 The loop, step by step

```
input event ──► intent ──► CST edit fn ──► TextEdit[] ──► Monaco model (one undo stop per gesture)
 (drag, key,     "move row0     replaceAttr     { range, text }      │
  field)          by −1, 0")    Value(row0.x)                         ▼ onDidChangeContent
                                                       schedule ONE pipeline run on the next frame
                                                                      │
                 requestAnimationFrame ◄──────────────────────────────┘
                   │  text → CST → semantic pipeline → diagnostics + scene JSON
                   │  scene → Wasm applyScene → applySampleData → renderFrame → paint
                   ▼
                 canvas, markers, Problems, panel fields that changed, status bar geometry
```

- **At most one pipeline run per frame.** A mouse delivers events at 120–1000 Hz. The canvas
  converts each into an edit, but the pipeline runs once per frame on the latest text.
  Intermediate texts are never rendered. This is the only scheduling rule the loop needs.
- **Keystrokes in Monaco take the same path.** There is no separate typing debounce: ui_spec
  §4.1's "about 50 ms while typing" is unnecessary at 1–2 ms per run, and a debounce would make
  the canvas lag behind the text it shows.
- **Main thread, no worker.** A worker would add a copy and an asynchronous hop to save
  roughly 1 ms. Revisit only if E-2's shell measurement says so (§10, C3).
- **`applySampleData` runs after every `applyScene`**, because a rebuild clears subject values.
  The cost is negligible. It means sample data is part of the scene's input, never state the
  Wasm remembers.

### 3.3 Where the 16 ms goes

From LOOP-BUDGET §3: Chromium, M5 Pro, p95 in milliseconds.

| | Departures (9 elements) | 20 elements | 100 elements |
|---|---:|---:|---:|
| Monaco edit and text read | 0.3 | 0.3 | 0.2 |
| Parse | 0.2 | 0.2 | 0.3 |
| Resolve and realise | 0.1 | 0.1 | 0.2 |
| **Validate** | **0.6** | **0.8** | **0.9** |
| Scene JSON | 0.2 | 0.2 | 0.3 |
| **Wasm rebuild** (`applyScene`) | 0.3 | 0.4 | **0.7** |
| Render and paint | 0.3 | 0.3 | 0.3 |
| **Pipeline total** | **1.5** | **1.8** | **2.5** |

**The budget E-2 is held to,** on a reference machine (§3.4):

| Slice | Budget, p95 |
|---|---:|
| Pipeline: text to pixels | 4 ms |
| Shell: React, the panel, the status bar, Monaco's decorations | 8 ms |
| Headroom: GC, the compositor | 4 ms |
| **Edit to pixels** | **16 ms** |

**The shell is now the risk** (LOOP-BUDGET F2), so E-2 is held to one rule:

> **No React render on the per-frame path except the components whose data changed.** A drag
> changes one element's geometry. The status bar's geometry readout, that element's four
> panel fields and the canvas repaint; nothing else re-renders. The Problems list updates only
> when the diagnostic set changes, which a nudge almost never does.

### 3.4 How E-2 proves it

**E-2's acceptance test:** Chromium with DevTools CPU throttling at **4×**, as a stand-in for
a modest laptop. A scripted drag of 300 frames on the departures screen and on a 20-element
screen, measured from input event to paint with the whole shell running. **p95 under 16 ms,
no frame dropped at 60 Hz.** A test that runs only on the author's machine at full speed
would prove nothing about the user's.

### 3.5 What a gesture writes

The canvas rewrites **the attribute that places the element**, not "the x attribute". The
interaction design starts here.

| How the element is placed, on the dragged axis | What a drag does | What the user sees |
|---|---|---|
| Integer literal `x="32"` | Rewrites the literal | The value ticks in Monaco as they drag |
| Anchor `right="0"` (§7.2) | Rewrites the anchor, inverted: dragging left raises `right` | The same, and the panel's ⓘ says "anchored right" |
| Expression or constant `x="#margin + 4"` | **Refuses on that axis.** The element moves on the other axis only | A tooltip at the cursor: *x is computed from `#margin + 4`.* The panel offers **Detach** (replace with the literal) and **Edit in XML** |
| Bound `bind_x="knob_x"` | **Refuses on that axis.** The value is live data | *x is bound to `knob_x`.* Sample data moves it, not the mouse |
| `#parent_*` or a composite's child | Not draggable; the composite instance is selected instead (ui_spec §8) | *Open element* is offered |

**Never rewrite an expression into a literal silently.** An author's `#margin + 4` is a
decision the canvas cannot see the reason for. Detach is one click, explicit and undoable.

- **Resize** follows the same rule for `width`/`height`, and for `right`/`bottom` when an
  element is stretched between anchors.
- **Snapping** rounds to integers before the edit is made, so the text never holds a value
  the canvas did not show.
- **Overflow during a drag is shown, not prevented.** The element hatches (ui_spec §8) and
  Problems shows the error live. Stopping the drag at the edge would hide the validator's
  verdict behind the canvas's own.

### 3.6 Undo

Every source of edits lands on one Monaco stack (`[UD-3]`). E-D adds the granularity:

| Gesture | Undo stops |
|---|---|
| A drag or resize, from mouse-down to mouse-up | **One**, however many frames it edited |
| Arrow-key nudges on the same selection, within 750 ms of each other | **One**, as Monaco groups typing |
| A property field: each committed value (Enter, blur, or a stepper click) | One |
| Align or distribute on a multi-selection | One, covering every element it moved |
| Insert from the palette, delete, duplicate (Alt-drag) | One |
| Detach | One |

**Mechanism:** `pushStackElement()` at the start and the end of a gesture, with every frame's
edit going through `pushEditOperations` in between. Undo restores the text, and the next frame
renders it. There is nothing else to restore.

### 3.7 Selection

- **Canvas to XML:** a hit gives the scene element. Its CST node gives a range. Monaco
  **reveals and decorates** the range **without taking focus**, so the next arrow key still
  nudges on the canvas. A hit is mapped by the element's **`name`**, which `[U-1]` makes
  stable, not by the scene's line and column, which shift as the text changes.
- **XML to canvas:** moving the caret selects the innermost element whose CST range contains
  it. Typing never changes the selection unless the caret leaves the element.
- **Selection survives edits** by name. A rename is an edit like any other, so selection
  follows the new name.
- **Neither direction edits the document** (ui_spec §4.3).

### 3.8 When the document is broken

| State | Canvas | Canvas editing |
|---|---|---|
| Valid | Live | On |
| **Well-formed XML, invalid schema** (an unknown font, an overflow) | Live, with problem elements hatched where the scene can still be built; otherwise **the last good frame, dimmed** (ui_spec §4.1) | **On.** The CST has ranges and the edit cannot make well-formedness worse |
| **Not well-formed** (mid-typing `<u8g2gl_lab`) | The last good frame, dimmed, with a banner: *XML not well-formed at 7:14* | **Off.** A canvas edit against text that does not parse could land anywhere. Off until the text parses again, typically one keystroke later |

---

## 4. Decision 2: The Two Modes

### 4.1 What each is for

| | **Live** | **Test run** |
|---|---|---|
| **Question it answers** | *What does this look like?* | *Will the real build look the same?* |
| Input | Text → scene → **editor-target** Wasm ([UD-4]) | Text → `generate` (**firmware target**) → Emscripten → a test harness |
| Code under test | The registry, thunks, and the widget C++ in the project editor Wasm | **The generated C++ the device will run**, the widget C++, and the same runtime |
| Speed | 1–2 ms per edit | Seconds: a generate plus a compile and link |
| When | Always | **On request** |
| Output | The canvas | **A parity verdict**: the test-run frame against the live frame for the same text and the same sample set, pixel for pixel |

**The test run is a check, not a second view.** It does not get a canvas of its own. It shows
a verdict in the canvas toolbar. On a mismatch it shows a **diff overlay** on the live canvas,
the differing pixels highlighted, with both SHA-256 hashes. **A mismatch is a framework bug,**
because [D-9]'s single implementation says the editor and firmware targets draw the same.
The verdict says so, and offers to save both frames and the scene for a bug report.

### 4.2 User-initiated, with an opt-in for "after a pause"

The owner asked which it should be. **User-initiated by default**, with **Run after a pause
in editing** as a setting, off by default:

- A test run costs a few seconds of CPU while the user is mid-thought. Running it on every
  pause means a fan spinning for checks nobody asked for. A parity check that almost always
  passes earns its place by being cheap to ask for, not by being constant.
- The moments it matters are known to the user: after changing widget C++, before generating
  for a flash, after upgrading U8G2GL. Those are where Run belongs.
- The setting exists because some authors working on widget code will want it on, and it
  costs nothing to offer once a server exists.

**A stale verdict is marked stale.** The toolbar shows `✓ parity · 2 min ago · 4 edits since`,
so a green tick never vouches for text it did not check.

### 4.3 Moving between modes

There is no mode switch. Live is always on, and Run is an action. The only visible state is
the verdict, and the status bar's editor-Wasm indicator. That is deliberate: a modal designer
asks the user to remember which mode they are in, and a monochrome layout tool has no need
for that.

### 4.4 What the test run needs that does not exist

A harness that runs the generated `ui_init()`/`ui_handler()` loop against a virtual U8G2
display in Wasm, and takes sample data through the generated subject setters. **This
harness is new.** PR-06's snapshot test (`wasm/test/snapshot.test.mjs`) renders through the
*editor* bridge, so it checks the editor target against the host build, not the generated
firmware code. Its hashing and frame comparison can be reused, but its build cannot.
**This is not E-1's work.** It is proposed as its own PR after E-2's canvas (E1-DECOMPOSITION §3): live editing is
the product, and the test run checks it.

---

## 5. Decision 3: Custom Widgets

### 5.1 The decision

The owner ruled served-first on 2026-10-26 (PROJECT.md). This section designs it.

**The project editor Wasm** is a build artefact the design server produces and the browser
loads. It contains:

| Part | From | Why it must be per-project |
|---|---|---|
| The runtime and U8G2 | This repository, prebuilt and cached per U8G2GL version | It need not be per-project. It is linked, not recompiled |
| **The registry** | `generate --target-kind editor` on **this** project's manifests | Today's links the test fixture's (PROJECT.md finding 1) |
| **Project widget C++** | `widgets/*/*.cpp` | The point of the exercise |
| **Project fonts and images** | `generated/ui_fonts.cpp`, `ui_images.cpp` | Today's bridge hardcodes the fixture's names |
| **Capacities** | The project's `u8g2gl_generated_config.h` ([D-21]) | Today's are constants. A 256-byte subject is refused, and a display over 2 KB of buffer cannot render (LOOP-BUDGET F6) |
| **A build hash** | A hash of every input above, compiled in and exported (`getBuildHash()`) | So the editor knows, without asking the server, whether the Wasm it holds is current |

### 5.2 When it rebuilds, and what the user sees

| Trigger | Rebuild | User sees |
|---|---|---|
| A widget's `.cpp` or `.hpp` saved | Widget and registry recompile, `-O1` link: **about 1 s** (LOOP-BUDGET §4) | `◐ rebuilding`. The canvas keeps the last good frame, and widgets of that class get a thin animated outline. Then it swaps |
| A widget's manifest saved | The same, since the registry changes | The same, and the property panel refreshes from the new manifest at once (that comes from the CST, not the Wasm) |
| A font or image added or changed | The font and image units recompile | The same |
| A capacity that the config header derives changes | Full relink | The same |
| A screen or `globals.xml` edited | **No rebuild.** That is live mode's job | Nothing |
| A compile error | Nothing is swapped. The last good Wasm stays loaded | `✕ build failed`. Compiler diagnostics appear in **Problems at file, line and column**, and clicking one opens the `.cpp` in **the user's IDE** (`vscode://`, or the `$EDITOR` the server was started with), because the designer does not edit C++ (ui_spec §14) |

**`-O1` while designing, `-O3` for a test run.** The link dominates a widget rebuild, and `-O3`'s
optimiser is most of the link (2.2 s against 0.6 s). Optimisation level changes no pixel, and
the test run exists to catch it if it ever does.

### 5.3 The rule a widget author must follow

**A widget's C++ must not include platform headers** (`Arduino.h`, ESP-IDF, FreeRTOS) to work
in the designer. It may depend on U8G2 and U8G2GL only. This holds under every option the owner
weighed, because the editor Wasm is not a device. A widget that breaks it gets **one specific
diagnostic**, naming the header and this rule, not a page of Emscripten errors. The rule belongs
in the widget author's documentation (design_spec §6.5) and in the house standards.

### 5.4 What the canvas shows for a widget it cannot render

| Situation | Canvas | Property panel |
|---|---|---|
| **Class unknown to the loaded Wasm** (no toolchain, a first build still running, a build failed before this widget ever compiled) | **A placeholder at its real rectangle**: 1-pixel border, 45° hatch at 25% density, the tag name in the smallest built-in font where it fits, and an ⓘ badge. Drawn *by the Wasm*, in draw order, so overlap and clipping stay true | **Complete.** It comes from the manifest ([UD-5]), not the Wasm. Headed: *Preview unavailable: no toolchain* (or the reason) |
| **Out of date** (the source changed and the rebuild has not finished) | The old rendering, with an outline | Current |
| **Renders, but has no data** (a collection widget, F7) | Whatever the widget draws with no rows, which for `wd_service_list` is **nothing** | Current. See §9 |

**The bridge must stop refusing the whole scene for one unknown class.** Today
`applyScene()` fails outright (`no class 'wd_service_list' in registry`). E-1d changes it to
build what it can, record a placeholder for each unknown element, and return the list. One
missing widget should cost one rectangle, not the whole canvas.

### 5.5 What this leaves open

- **Static mode** remains possible behind `ProjectFileSystem`. If built, it would load a
  project editor Wasm that the user built once (`u8g2gl design --build-only`) or that CI
  publishes, and show placeholders otherwise. Not built until someone asks (C5).
- **In-browser compilation** (option B) produces the same artefact by a different route.
  Nothing here would need to change to use it. It was set aside as a long shot (owner,
  2026-10-24), not designed out.

---

## 6. Decision 4: What E-1 Contains

In full, with acceptance criteria, in [E1-DECOMPOSITION.md](E1-DECOMPOSITION.md). In outline:

| PR | Contents | Depends on | Kind of work |
|---|---|---|---|
| **E-1a** | CST, round-trip, edit functions | — | Pure TypeScript, no UI |
| **E-1b** | The existing parser fed from the CST. Attribute ranges reach every diagnostic, closing **[Q-17]**. **Output byte-identical** | E-1a | A refactor of the CLI's core |
| **E-1c** | `u8g2gl design`: the server, served `ProjectFileSystem`, the file watcher, the token | — | Node |
| **E-1d** | The project editor Wasm: the managed Emscripten, the build, a project-driven bridge, placeholders, the build hash, a CI job | E-1c | C++, CMake, Node |
| **E-1e** | The shell: Vite, React, Dockview, Monaco; explorer, live diagnostics, Problems, save and conflict handling, a **read-only** canvas | E-1c, E-1d | The application |

**The critical path is E-1a → E-1b → E-2, not "the serializer, then everything".** The shell
(E-1e) edits text in Monaco and renders it through today's parser, so it does not wait for the
CST. Only canvas *editing* does, and that is E-2. E-1a/b and E-1c/d/e can run as two parallel
streams.

---

## 7. Decision 5: The Tagged Questions

| | Ruling | Lands in |
|---|---|---|
| **[Q-17]** Manifest diagnostics locate at the element | **E-1 settles it.** E-1b gives every attribute a name range and a value range from the CST, and passes them to the manifest parser's diagnostics. It is a consequence of E-1b, not extra work, which is the strongest argument for E-1b's design. Acceptance: every diagnostic Q-17 lists reports the attribute's column | **E-1b** |
| **[Q-10]** Text properties on the base object | **Ruled here; E-2 inherits it.** (1) **Q-10's text is partly out of date.** Since [D-18], `u8g2gl_box`, `u8g2gl_line` and the rest of the drawing set do not extend `u8g2gl_obj`, so the panel never offers them `font` or `align`. The question remains for the obj-derived classes that draw no text (`u8g2gl_switch`, `u8g2gl_progress_bar`'s `align`) and for **every project widget**, which inherits `font`, `align`, `font_mode` and `bind_text`. (2) **E-2's panel shows a widget's own props first, then inherited ones in a collapsed group headed *From u8g2gl_obj*,** with their help text. This is honest about the C++, which does have the setters, and it needs no C++ change and no schema change. (3) **An intermediate text class is rejected for now.** It is a runtime refactor touching every widget and all generated code, to fix a panel's presentation. (4) A manifest-level way to *hide* an inherited prop is schema surface, so it joins the schema decision in §8 | **E-2** |
| **[Q-7]** Conditional visibility | **Later.** `visible_when` is schema surface. E-2's panel shows every prop, and **must not** hardcode a rule like "hide `scroll_px_per_sec` unless `long_mode` scrolls", because that would be the hardcoded widget knowledge `[UD-5]` forbids. G-PROBE-2 shows the panel is usable without it. The schema decision in §8 decides | **§8 decision** |
| **[Q-19]** `max_rows` does not determine RAM | **E-2 inherits a rule. Q-19 itself stays Phase 2,** under the gate's condition 2. The rule: **the panel shows a memory cost only where §18 can compute one.** Framework capacities get the cost (ui_spec §9.2's `max_rows 16 → 2.3 KB`). **Project widgets' capacity props get none,** and a muted line reads *RAM cost not reported for project widgets ([Q-19])*. The false `help="Determines allocated RAM"` is in the widget author's manifest, not the framework's, so the panel renders it as written. It is the author's text. The panel's own cost line must never imply the claim is true | **E-2**, and Q-19 in Phase 2 |
| **[U-6]** Where sample data lives | **E-3's.** Leaning only: a project file outside the schema (`samples/*.json`), read by the designer and **ignored by `generate`**. JSON, because it is not XML authors write against, so it adds no schema surface (§1.5), and in the project, because a team shares realistic data. But see §9: sample data for **collections** cannot be designed until PR-08 decides how rows reach a widget | **E-3** |

**Two documents disagree, found while ruling:**
1. **ui_spec §11 says "collection subjects (§9) take sample rows".** design_spec [D-8] says
   collections are **not** subjects (§9 opens with it). design_spec wins on framework behaviour
   (ui_spec's own rule), so ui_spec §11 is out of date. This matters to §9 below.
2. **ui_spec §15's header says its requirements "gate PR-02"**, and lists seven "must add"
   items. Schema 0.4 has one of them (`help=`). Either they were deferred and §15 was never
   updated, or they were missed. I have not found the decision either way. **Reported, not
   resolved:** it is Tier 1's document.

---

## 8. The Schema Features the Designer Lacks

ui_spec §15 asked for these, and schema 0.4 does not have them:

| Feature | What E-2 does without it |
|---|---|
| Grouping and order (`group=`) | One list per widget, in **declaration order**: the manifest's order already says something about importance. Geometry (`x`, `y`, `width`, `height`) is pinned first and paired, because every element has it |
| Palette metadata (name, category, icon) | The palette shows **tag names**, grouped **Framework** / **Project** / **Drawing**, from the manifest registry's own split. Usable, but plain. *Now delivered without icons — see below* |
| `<previews>` | Element context (ui_spec §7.2, flow F5) renders the element **once, at its manifest's default size**, with no gallery |
| `visible_when` ([Q-7]) | Every prop shows |
| Hiding inherited props ([Q-10]) | The collapsed *From u8g2gl_obj* group |

**Recommendation: decide these together, once, with E-2's panel in front of you.** Not before
E-2: §1.5 makes schema surface the permanent kind, and the right moment to judge "does the
panel need grouping?" is when you can see the ungrouped one. Not one at a time: five small
bumps is five migrations for authors, and one is one. **This is checkpoint C4** (§10).

**Decided at C4 (2026-10-31, S-1).** Palette metadata is added in **schema 0.5**:
`label`, `category` and `description` on `<api>`, not inherited, reaching no
generated file (design_spec §13.1, §15.4). The Palette keeps its three groups,
files each group's entries by category in registry first-appearance order with
the uncategorised last, and shows each entry's label, its tag muted, and its
description; the filter matches all three. **Icons** are held back.
**`<previews>`** is deferred to E-3. **Grouping** and **`visible_when`** are
declined: the panel's declaration order and every-prop-shows stand.

---

## 9. The Biggest Risk: A Canvas That Is Blank Where It Matters

**What WO1 found** (LOOP-BUDGET F7). With G-PROBE-2's widget C++ running for real in the
editor's Wasm, for the first time (F5), **both `wd_service_list` instances light 0 pixels.**
The service list *is* the departures board. A designer that lays it out as two blank rectangles
cannot answer the question it exists for: does this layout work on real data ([UD-6])?

**Why.** A collection widget's rows arrive through C++ methods (`begin()`, `add_row()`,
`commit()`), because [D-8] keeps collections out of the subject system. Sample data sets
subjects. The bridge can construct, set and draw by name ([UD-4]), but it **cannot fill a
collection by name**. Nothing designed so far can.

**Why it is the biggest risk, ahead of 16 ms:**
- 16 ms is measured with eight times headroom. This is measured as **zero pixels**.
- G-PROBE-2 proved that real screens are custom widgets, and the screens that matter most to
  this programme's users (departures, dashboards, lists) are **collection** widgets.
- **The fix is not on the editor track.** §9.2's typed collection API is PR-08 (firmware
  track, after PR-07). It is also [Q-19]'s subject, and **PR-08 is not being designed with an
  editor in mind.** If PR-08 lands an API that only C++ can call, E-3 delivers sample data for
  everything except the content that matters, and nobody finds out until a designer opens a
  real project.

**What would remove it:**
1. **A requirement on PR-08, set now:** a declared-capacity collection must be **fillable by
   name** through the editor registry. That means a generated thunk, as `[UD-4]` already does
   for construction and properties: `fill(object, rows[][])`, generated from the same manifest
   capacity declarations. It is cheap if designed in, and expensive to add afterwards.
2. **Sample data for collections in E-3** is then rows in a sample set, delivered through that
   thunk, rebuilt on every edit like everything else (§3.2).
3. **Until both exist**, E-2's canvas marks a widget that drew nothing inside its rectangle,
   but has capacity props in its manifest, with an *empty: no sample rows* tag. That says why
   it is blank instead of looking broken.

**I recommend the Chief Architect carries (1) to PR-08's bridge.** It crosses tracks, so it
is not E-D's to decide. It is recorded here so the requirement exists before PR-08's design
begins rather than after.

**The other risks, in order:**

| Risk | Where it bites | Mitigation |
|---|---|---|
| **The shell spends the 16 ms** (LOOP-BUDGET F2) | E-2 | §3.3's render rule; §3.4's throttled acceptance test |
| **E-1b touches the core of a CLI with 1353 tests** | E-1b | Output byte-identical is its acceptance criterion. It ships before any designer code depends on it |
| **The managed Emscripten is fragile across platforms** (1.6 GB installed, per-OS binaries) | E-1d | Pinned version, checksum, a CI job on Linux and macOS. Checkpoint C2 |
| **Round-trip fidelity is quietly compromised under delivery pressure** (ui_spec §10's own warning) | E-1a, E-2 | Round-trip identity over every XML file in the repository is an E-1a test. A one-line-diff assertion goes on every canvas gesture in E-2 |
| **A collision between the IDE and the designer loses work** | E-1e | §2.3's rules; a dirty buffer is never overwritten |

---

## 10. Reassessment Checkpoints

The owner asked to "come back and reassess at stages" (2026-10-26). Each checkpoint ends with
a short note to the owner: the evidence, and a recommendation to continue or to reopen.

| | When | Evidence | Reopens if |
|---|---|---|---|
| **C1** | ✅ After E-D WO1 | LOOP-BUDGET.md | Rebuilds in tens of seconds, or 16 ms out of reach. **Neither: continue** |
| **C2** | After E-1d | The managed Emscripten installed and run on macOS (arm64) and Linux (x64) at least, from a clean user account; widget rebuild times on each | The install fails or proves fragile, or a rebuild exceeds 3 s on the reference machine. Then reopen: a native renderer, or option B |
| **C3** | After E-1e | The keystroke-to-canvas p95 under 4× CPU throttling, with the real shell | Over 16 ms. Then reopen §3's main-thread choice (a worker) before E-2 builds on it |
| **C4** | After E-2's property panel exists | The panel on the departures project, shown to the owner | **This is the schema decision** (§8), not a reopening: grouping, palette, previews, `visible_when`, hiding inherited props. Decided together |
| **C5** | After E-2's first use on a real project (not a fixture) | Friction with the server, day to day; whether any user without a toolchain has asked | Friction. Or real demand from users without a toolchain, which reopens static mode and committed Wasm (option D) |
| **C6** | When PR-08's design begins | Whether §9's requirement (fill a collection by name) is in its bridge | It is not. Then E-3 cannot do its job for real projects, and the owner should know before E-3 starts |

---

## 11. Defects and Corrections Reported

E-D changes no source and no other workstream's documents. These are reported for their owners:

| | Where | What | Owner |
|---|---|---|---|
| 1 | `g-probe2-widgets/WIDGET-PATH.md` §1.2, executive summary | "Rendered the complete departures display to pixel-accurate completion" describes a **JavaScript imitation** of the widgets. Their C++ was only syntax-checked. §1.3 item 3 admits the harness gap, but the headline does not (LOOP-BUDGET F5) | Chief Architect |
| 2 | `g-probe2-widgets/evidence/probe-project/generated_editor/` | Stale: no registry entry for `wd_train_formation` (F9) | Chief Architect |
| 3 | `wasm/bridge.cpp`, `wasm/editor_config.h`, `wasm/CMakeLists.txt` | Fixture-bound registry, fonts and images; a 128-byte string cap; a 2 KB buffer cap; fixed capacities (F6) | **E-1d fixes them** |
| 4 | `.github/workflows/ci.yml` | No job builds the Wasm (F10) | **E-1d adds one** |
| 5 | `design_spec.md` §21 [Q-10] | Names "a box or a line", which no longer inherit text props since [D-18] (§7) | Chief Architect |
| 6 | `ui_spec.md` §11 | "Collection subjects" contradicts [D-8] (§7) | Chief Architect |
| 7 | `ui_spec.md` §15 | The header says these "gate PR-02"; six of the seven are absent from schema 0.4 (§7) | Chief Architect |
| 8 | `cli/test/architecture/layering.test.ts` | Nothing enforces that `cli/src/core/` is isomorphic. The layering test explicitly ignores `node:` specifiers, so [D-10]'s property, which the designer depends on, rests on review alone. (It holds today: `cli/dist/core` has no `node:` import, checked in WO1) | **E-1a adds the test** |
| 9 | This PA, to the owner, 2026-10-24 | "PR-06 already builds Wasm in CI" was **wrong**. It builds none (F10). It did not change the owner's decision, which rested on option D being dropped for user 2, but it was said and is corrected here | — |
