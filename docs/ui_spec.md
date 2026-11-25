# U8G2GL Designer — UI Specification

**The visual designer for U8G2GL: functionality, architecture and layout.**

**Version**: 1.1
**Date**: September 2026
**Status**: Settled. All seven editor decisions are closed; two questions remain open (§16) after `[U-1]` closed in PR-03 (§16.1) and `[U-3]` in E-2k1. §15's schema requirements gate PR-04 — 'editor-target generation' is named there as PR-04 scope.
**Companion documents**: [design_spec.md](design_spec.md) (the framework) · [concept.md](concept.md) (why) · [implementation_plan.md](implementation_plan.md) (sequencing)

> **[UD-n]** marks a binding editor decision with its rationale. **[U-n]** marks an open question. Where this document and `design_spec.md` disagree on framework behaviour, the design spec wins; on editor behaviour, this document wins.

## Decision summary

Seven decisions, all settled. Full rationale in §3; this table is for orientation.

| | Decision | The reason it went this way |
|---|---|---|
| **[UD-1]** | Monaco + custom shell — TypeScript, React, Dockview, Vite. **Not Theia, not a VS Code fork** | Optionality. A Monaco surface can later be wrapped in Theia, Electron *or* a VS Code extension; starting in Theia forecloses the static path and the VS Code path permanently. Theia was evaluated properly and passes on licence — it is rejected on centre of gravity, not capability |
| **[UD-2]** | Static-first, served fallback, behind one `ProjectFileSystem` interface. *Sequencing amended 2026-10-26: served first, static deferred* | Static mode needs **no install at all** because the TypeScript CLI is isomorphic. The served mode costs nothing extra since Node is already required, and it covers Firefox and Safari |
| **[UD-3]** | Text is the single source of truth; the document is a **CST, not an AST** | A canvas nudge must produce a one-line diff. A parse-and-reserialise cycle that normalises the file is forbidden. Undo unifies for free as a consequence |
| **[UD-4]** | Two runtime build targets — `firmware` and `editor` | The editor must render arbitrary XML without a C++ compiler in the browser, so its Wasm build needs a class registry and property thunks. Both generate from the same `<api>` manifests; the registry compiles out under `#ifdef`, so firmware pays nothing |
| **[UD-5]** | Property panel generated entirely from `<api>` manifests | A custom widget gets a full panel — descriptions, validation, grouping — with no editor release. Same property that lets the generator handle it |
| **[UD-6]** | Sample data is design-time only, never compiled | Monochrome layout is **length-dependent**; an 8- and a 30-character string differ in whether text fits, scrolls or truncates. Designing against empty labels produces layouts that break on real data |
| **[UD-7]** | Screen-flow view is a projection, not a new capability | It reads and writes `<screen_load_event>` declarations §12 already supports. Carousel is excluded as a consumer's concern; modals are excluded because they are a *framework* capability that does not exist yet |

**The thesis underneath all of it** ([design_spec.md §1.2](design_spec.md)): the editor is the point of the programme, not a deferred extra. XML earns its place because an editor needs a document it can read back — generated C++ is write-only in practice. AI-assisted authoring is a beneficiary of a good schema, not the reason for one.

---

## 1. Purpose

The designer is the point of the U8G2GL programme ([design_spec.md §1.2](design_spec.md)). The schema, generator, runtime and Wasm renderer are infrastructure that exists to make it possible.

Monochrome UI work is **pixel work**. On a 128×64 panel an element one pixel out is visible and wrong, and fixing it is direct manipulation — nudge, align, compare — not description. The designer's job is to make that manipulation fast, exact and reversible.

**The specific gap this fills.** LVGL Pro has a visual editor whose weakness is the property and settings surface: no guidance for a non-coding user. Lopaka has a good canvas but no bindings, components, multi-screen or project format. SquareLine Studio is capable but over-complex for a domain this size. The opportunity is a lean canvas *with* a property surface that teaches.

---

## 2. Design Principles

1. **Lean in machinery, complete in reach.** A monochrome screen has 5–20 elements and the tool should feel proportionate to that: no machinery the job does not need. But nothing the schema can express is out of reach.
2. **Familiar layout, minimal machinery.** Adopt the VS Code *paradigm* — activity bar, sidebars, tabbed editor, bottom panel, status bar — because it is instantly legible. Do not adopt an IDE platform to get it ([UD-1]).
3. **Two views of one document.** Canvas and XML are the same thing seen differently. Selection, edits and errors are shared, live and bidirectional. This is the defining behaviour.
4. **Pixel-exact by default.** Every position is an integer, always visible, always nudgeable.
5. **The XML stays authored.** Round-trip preserves comments, ordering and formatting. The editor is a *co-author*, not the file's owner.
6. **The property panel teaches.** Every property carries its description, its consequence and its constraints where it is edited: its help one step away behind an ⓘ (§9.2), its reasons and problems inline. This is the gap in the incumbent tools and the main reason to build another.
7. **One editing surface, three contexts, four supporting panels.** Beyond that needs a case (§14).
8. **Everything is discoverable.** Every capability the schema offers has a visible, editable home in the UI. People learn a tool by looking at it, not by reading its manual, so a feature the UI does not show is a feature that does not exist for them. An incomplete editor is the incumbent tools' central failure; this one is complete by construction, and a test holds it there.

---

## 3. Editor Decisions

### [UD-1] Monaco plus a custom shell — not Theia, not a VS Code fork

**Stack:** TypeScript · React · Dockview (panel layout) · Monaco (text) · Wasm (canvas) · Vite.

*Evaluation.* Eclipse Theia was assessed against licence, serving and rendering (Appendix A). It passes on licence — EPL-2.0 permits closed-source commercial products — and its embedded-tooling pedigree is strong: Arduino IDE 2.0, Arm Mbed Studio, TI Code Composer Studio, STMicroelectronics STM32CubeMX2, Samsung Sokatoa. Custom-heavy UI inside Theia demonstrably works, so "Theia fights bespoke surfaces" is not supportable.

*Why not, nonetheless.* Two reasons, in order of weight:

1. **Optionality.** A Monaco-based design surface can later be wrapped in Theia, Electron, *or* a VS Code extension. Starting in Theia forecloses the static-hosting path and the VS Code path permanently. The VS Code path is not hypothetical — **PlatformIO IDE is a VS Code extension**, so target users are plausibly already there.
2. **Centre of gravity.** Theia optimises for text-editing IDEs. Our primary surface is a canvas; XML is secondary. Roughly 25–30% of this application is shell Theia would supply, and it is the least differentiated 25–30% — canvas, property panel, fonts, sample data and flow view are custom regardless.

*Cost accepted.* We build the shell. That is a real component — dockable panels, splitters, tabs — hence Dockview rather than hand-rolling. Migration to Theia or VS Code remains available, and is cheaper from this direction than the reverse.

### [UD-2] Static-first, with a served fallback — one filesystem interface

The editor programs against a single `ProjectFileSystem` interface; the implementation is chosen at runtime.

| Mode | Mechanism | Install | Browsers |
|---|---|---|---|
| **Static** | File System Access API | **None** — design work needs no toolchain | Chromium |
| **Served** | `npx u8g2gl design` over localhost | Node, already required by [D-10] | All |

*Why static is genuinely zero-install:* [D-10] made the CLI TypeScript, so schema, validator and generator are isomorphic and run unmodified in-browser. With the Wasm renderer and `bdfconv` via Wasm ([Q-2]), the entire design pipeline is client-side. Node is needed only for the *firmware* build, a separate step in the user's own toolchain.

Same frontend either way. Resolves the Chromium-only concern without imposing it on Firefox and Safari users.

*Amendment, 2026-10-05 (owner, CA-1).* The decision stands as written; what changes is sequencing. The designer is to be **browser-hosted with no server component**, so **static mode is built and served mode is deferred** — not withdrawn. `ProjectFileSystem` keeps both implementations possible behind one interface, which is what makes deferral safe, and §1.5's rule applies: build the served mode when a Firefox or Safari user actually asks, not before. Until then the designer is Chromium-only, and that is a stated limitation rather than an oversight.

*Amendment, 2026-10-26 (owner, E-D).* The decision stands as written. Its sequencing changes again: **served mode is built first, and static mode is deferred.** The premise is the owner's 2026-10-24 ruling that a designer has the full toolchain installed for building a U8G2 application, which is true of every user this release serves. Served mode is required because a real project's screens are custom widgets (G-PROBE-2), whose C++ must be compiled into the editor's Wasm, and a browser page cannot run a compiler. `npx u8g2gl design` builds that Wasm with a pinned Emscripten the CLI manages, and is never in the per-edit loop: rendering stays in-browser, per `[UD-4]`. One `ProjectFileSystem` keeps static mode possible. It is to be reassessed at the checkpoints E-D set ([EDITOR-DESIGN.md](../.agents/skills/principal-architect-workspace/e-d-editor-design/EDITOR-DESIGN.md) §10), and built when a user without a toolchain asks.

### [UD-3] Text is the single source of truth; the canvas produces text edits

The `.xml` file is the model. The canvas is a *view* that emits text edits against it.

*Consequence — this is what makes principle 5 achievable:* the document is held as a **CST (concrete syntax tree)**, not an AST. A CST preserves whitespace, comments, attribute order and quote style, and gives every attribute an exact source range. A canvas nudge rewrites one attribute's value in place, producing a **one-line diff**. A parse-and-reserialise cycle that normalises the document is forbidden.

*Second consequence:* undo is unified for free. Canvas edits, property-panel edits and typing all become text edits on one Monaco undo stack. There is no separate canvas undo to keep in sync.

### [UD-4] Two runtime build targets — the editor's Wasm constructs objects dynamically

The CLI builds the runtime twice, mirroring LVGL Pro's `compile --target editor|cli`:

| Target | Contains | Used by |
|---|---|---|
| `firmware` | Generated code with direct setter calls ([D-17]). No registry, no property table | The device |
| `editor` | The same runtime **plus** a class registry (construct-by-name), property thunks (set-by-name), and a **draw-by-name table** for elements that have no class, generated from the same `<api>` manifests | The editor's Wasm canvas |

*Why this is necessary.* The editor must render arbitrary XML without running a C++ compiler in the browser, so the runtime must build an object graph from a description at run time. That is exactly the dynamic-creation capability [PD-3] recorded the object model as *ready for* but not *capable of*, and exactly the runtime property mechanism [D-17] deliberately removed from firmware.

*The draw-by-name table.* Per [D-18] the drawing set (design_spec §6.2) has no classes — it is served by free functions such as `u8g2gl_draw_box()`. The editor cannot construct those by name, so its target adds a table mapping tag to draw function. **Both targets call the same free function**, which is what keeps [D-9]'s single-implementation guarantee: a per-primitive class would have needed this path anyway and given two code paths through it.

*Why it costs firmware nothing.* Both are generated from one manifest, and the registry compiles out under `#ifdef U8G2GL_EDITOR`. [D-17]'s build-time manifests serve both paths: setter emission for firmware, thunk generation for the editor. This retrospectively justifies [PD-3]'s virtual base — the editor build is the first real consumer of polymorphic dispatch.

### [UD-5] The property panel is generated entirely from `<api>` manifests

No hardcoded widget knowledge. A custom widget with a manifest gets a full property panel — descriptions, validation, grouping — without an editor release. The same property that lets the generator handle it ([D-17]).

### [UD-6] Sample data is design-time only and never compiled

Named value sets per subject, used to render the canvas realistically. Never reaches firmware.

### [UD-7] The screen-flow view is a projection, not a new capability

It reads and writes `<screen_load_event>` / `<screen_back_event>` declarations that §12 already supports, adding no framework surface. Carousel configuration and modals are excluded (§7.3, §14).

---

## 4. Application Architecture

How an edit becomes pixels. Every surface in this document sits over this pipeline.

```
                    ┌──────────────────────────────────────────┐
                    │  .xml on disk (ProjectFileSystem, UD-2)  │
                    └────────────┬───────────────┬─────────────┘
                          load   │               ▲  save (explicit)
                                 ▼               │
                    ┌──────────────────────────────────────────┐
                    │  CST — text + source ranges  [UD-3]      │
                    │  single source of truth, one undo stack  │
                    └───┬──────────────────┬───────────────────┘
             text edits │                  │ semantic view
                        ▼                  ▼
        ┌───────────────────────┐   ┌──────────────────────────┐
        │ Monaco (XML editor)   │   │ Validator (PR-02 TS)     │
        │ squiggles, completion │◄──┤ [D-16] diagnostics       │
        └───────────────────────┘   └────────┬─────────────────┘
                        ▲                    │ if structurally valid
             text edits │                    ▼
        ┌───────────────┴───────┐   ┌──────────────────────────┐
        │ Canvas + Properties   │   │ Resolver (PR-04 TS)      │
        │ (views, emit edits)   │   │ expand composites,       │
        └───────────────────────┘   │ evaluate anchors/consts  │
                        ▲            └────────┬─────────────────┘
                        │                     ▼
                        │            ┌──────────────────────────┐
                        │            │ Scene description (JSON) │
                        │            │  + active sample set     │
                        │            └────────┬─────────────────┘
                        │                     ▼
                        │            ┌──────────────────────────┐
                        └────────────┤ Wasm runtime [UD-4]      │
                          framebuffer│ construct → tick → render│
                                     └──────────────────────────┘
```

### 4.1 The edit cycle

1. An edit arrives — a keystroke in Monaco, a canvas drag, a property field.
2. Non-text edits are converted to **text edits at CST ranges** and applied. One undo stack.
3. Parse is incremental and debounced — roughly 50 ms while typing, immediate for canvas edits.
4. **Validate.** Diagnostics render as Monaco markers and Problems rows whether or not the document is valid.
5. If structurally valid, **resolve** — expand composites (§13.6), evaluate constant arithmetic, anchors and `#parent_*` ([D-7], [D-20]) to literal integers.
6. Emit a **scene description**: a flat object list with resolved coordinates and properties, plus the parent index table ([A-3]).
7. Hand it to the Wasm runtime with the active sample set. It constructs, ticks and renders to a framebuffer.
8. Blit the framebuffer to the canvas at the current zoom, nearest-neighbour.

**Target: under 16 ms** from canvas drag to repaint, so dragging feels direct. Achievable at this scale — 5–20 objects and a framebuffer of 2 KB or less.

**Degraded rendering.** If the document is structurally invalid mid-edit, the canvas keeps the last good frame, dimmed, rather than blanking. Losing the picture while typing an attribute is disorienting and unnecessary.

### 4.2 Animation in the canvas

Widgets animate ([D-15]). The canvas runs the same `ui_handler()` loop, so scrolling labels scroll and clocks blink while designing. A **freeze toggle** stops the clock and pins animations at t=0 for stable pixel comparison — essential when aligning against an animating element.

### 4.3 Selection synchronisation

The CST gives every element a source range and a stable identity.

- **Canvas → XML:** hit-test yields the object; its id maps to a CST node; Monaco reveals and highlights that range.
- **XML → canvas:** caret offset resolves to the innermost enclosing element; the canvas selects it.
- **Explorer ↔ canvas:** a row of the Explorer's element tree (§6) selects its element, opening its screen on the canvas when another is drawn, and the XML reveals it as for a canvas selection; a selection made on the canvas or in the XML lights its rows and scrolls the first into view, without taking the keyboard.
- **Neither direction rewrites the document.** Selection is never an edit.

Hit-testing respects draw order ([D-4]): the topmost element under the cursor wins; repeated clicks at the same point cycle downward through overlaps.

### 4.4 What runs where

| Concern | Static mode | Served mode |
|---|---|---|
| Parse, validate, resolve, generate | In-browser TypeScript | Same code, either side |
| Render | Wasm in-browser | Wasm in-browser |
| Font compilation | `bdfconv` via Wasm | CLI or Wasm |
| File access | File System Access API | Local server |
| Firmware build | User's own toolchain | User's own toolchain |

### 4.5 Element outlines

An **Outlines** toggle beside the freeze toggle (`⬚ Outlines`, *Show every element's box*) draws every drawn element's box on the canvas: a 1-pixel dashed amber border and a faint amber fill, under any placeholder outline and the selection, over the error hatching. It shows where each element is even when it lights no pixel, which the framework Wasm's placeholder hatch otherwise shows only for project widgets, and only until the project's own Wasm loads.

- **Overlay only.** The outlines are never part of the framebuffer, so parity, a test run's diff and the lit-pixel count are unchanged by them.
- **Live.** They follow each run's element boxes, through drags and edits. A stale frame keeps the last outlines, as it keeps the selection.
- **Remembered per browser.** Off by default. Where the browser's storage is unavailable (a private window), the toggle still works and is simply not remembered.

---

## 5. User Flows

Eight flows define the tool. **F2 runs dozens of times a session and must be the fastest thing in it.**

**F1 · Lay out a screen.** Open project → select screen → drag widgets from palette to canvas → position → set properties → save.

**F2 · Adjust precisely.** Select (canvas or XML) → nudge by pixel → read coordinates → align to a neighbour.

**F3 · Bind data.** Select element → choose subject → set format string → see it render against sample data.

**F4 · Build and fix.** Continuous validation; build on demand. Errors appear as squiggles and Problems rows with file, line, column and suggestion. Click a row → land on the fault.

**F5 · Design an element.** Open element → edit in isolation against `<previews>` → set prop defaults → see what a consumer gets.

**F6 · Check against real data.** Switch sample sets — typical, empty, longest plausible — and confirm the layout survives each.

**F7 · Wire navigation.** In the flow view, drag from a focusable element to a screen; the `<screen_load_event>` is written.

**F8 · Work with fonts.** Browse glyphs, check metrics, measure whether a string fits a width before a layout depends on it.

---

## 6. Layout

```
┌──┬───────────────────┬──────────────────────────────────┬─────────────────┐
│  │ PRIMARY SIDEBAR   │  EDITOR AREA (tabbed, splittable)│ PROPERTY PANEL  │
│A │  ▾ Project        │ ┌──────────────┬───────────────┐ │                 │
│C │      u8g2gl.xml   │ │              │               │ │ u8g2gl_clock    │
│T │      globals.xml  │ │   CANVAS     │  XML (Monaco) │ │ name: clock     │
│I │  ▾ Screens        │ │              │               │ │ ─── Geometry ───│
│V │      screen_home  │ │  ┌────────┐  │ <screen ...   │ │ x [216] y [  0] │
│I │  ▾ Widgets        │ │  │        │  │   <u8g2gl_cl..│ │ w [ 40] h [ 11] │
│T │      wd_list      │ │  │ 256×64 │  │     x="216"   │ │ ⓘ right="0" set │
│Y │  ▾ Assets         │ │  │        │  │     ...       │ │ ── Appearance ──│
│  │      fonts/x.bdf  │ │  └────────┘  │               │ │ font [clock_7 ▾]│
│B │  ▸ Other files    │ │              │               │ │ ⓘ 7px, 11 glyphs│
│A │                   │ │ ⊞grid ⊡tile  │               │ │ ─── Binding ────│
│R │                   │ │ 4× ▾  ▶ anim │               │ │ bind_time [sys▾]│
│  │                   │ │              │               │ │ blink [✓]       │
│  │                   │ └──────────────┴───────────────┘ │                 │
├──┴───────────────────┴──────────────────────────────────┴─────────────────┤
│ Problems (2) │ Output │ Budget                                     ▲ ─ □  │
│ ⛔ screens/home.xml:14:32 unknown font 'small_9' — did you mean 'small_09'?│
│ ⚠ screens/home.xml:22:5  wd_list capacity 2.3 KB — 48% of RAM budget      │
├───────────────────────────────────────────────────────────────────────────┤
│ ● Built 0.4s │ default · SSD1322 256×64 │ sel 216,0 40×11 │ 4× │ RAM 4.8KB│
└───────────────────────────────────────────────────────────────────────────┘
```

| Region | Contents |
|---|---|
| **Activity bar** | Explorer · Palette · Assets · Fonts · Sample data · Flow · Search |
| **Primary sidebar** | Context-dependent. Explorer shows the project grouped by what an author edits; Palette shows draggable elements as icon tiles, grouped and filed by category |
| **Editor area** | Tabs per document. Default split: canvas ∥ XML. Either pane collapsible; ratio draggable and remembered |
| **Property panel** | Selection properties, grouped. With nothing selected, shows screen-level properties |
| **Bottom panel** | Problems · Output · Budget. Collapsible; auto-opens to Problems on a failed build |
| **Status bar** | Build state and duration · active target (a switch between targets when there are several, §6.4) · selection geometry · zoom · RAM total · while anything is unsaved, **● N unsaved · Save** |

**The Explorer** is grouped by what an author edits, not by directory: **Project** (`u8g2gl.xml`, `globals.xml`), **Screens** (one entry per screen file), **Widgets** (one entry per widget, under its own name, opening its manifest; its `.cpp` and `.hpp` travel with the entry rather than being listed) and **Assets** (fonts and images). Anything else is listed under **Other files**, so nothing on disk goes missing; a widget directory with no manifest falls there too. Generated output — `generated/` and the editor target's `generated_editor/` — is not listed, watched or writable from the designer.

**Element rows.** Each Screens entry has a disclosure **▸** that lists the screen's elements under it as a tree: a container's or widget view's children nest under it, an unnamed wrapper (`<view>`, a binding's child tag) adds no row. The label still opens the screen; only the disclosure expands. A row shows the tag's Palette icon, the element's name and, quieter, its tag.

- **Rows are in document order, which is draw order:** a later row draws over an earlier one. The list is not reversed.
- **From the buffer.** Rows are built from the screen's current, unsaved text after every run, so a rename or an insert shows at once; text that does not parse keeps the last good rows, as the selection keeps its names. Widget manifests are not expanded.
- **Selecting.** A click selects the row's element through the same selection the canvas uses (§4.3); Shift-, Cmd- or Ctrl-click adds or removes it within one file. Selecting is never an edit.
- **Keys.** The rows are a WAI-ARIA tree (`tree`, `treeitem`, `aria-level`, `aria-expanded`, `aria-selected`) with one row in the tab order: Up and Down move, Home and End go to the ends, Right expands or enters, Left collapses or goes to the parent, Enter selects (Shift+Enter adds). The file rows' menu and keys are unchanged.
- **Remembered.** Which screens are expanded is remembered per browser and project; the screen the canvas shows expands the first time it is shown. Where storage is unavailable everything starts collapsed and still works.

**Section rows.** `u8g2gl.xml` and `globals.xml` have the same disclosure, which lists the parts of each file's form (§6.4): `u8g2gl.xml ▸ Project · Targets ▸ <each target, by name> · Output`, and `globals.xml ▸ Subjects (n) · Fonts (n) · Images (n) · Styles (n) · Consts (n)`. They are built from the current buffer after every run, as element rows are, so a count changes as an item is added, before any save; text that does not parse keeps the last rows. They use the element rows' tree roles and keys, Enter and a click opening the file with its form scrolled to that section, and their expansion is remembered with the screens'. Opening a section is never an edit.

Every Explorer entry has a **context menu**, opened by right-click, Shift+F10 or the context-menu key, driven by the arrow keys and closed by Escape or a click outside:

- **View source…** — a widget's files (manifest, `.cpp`, `.hpp`). C++ opens read-only (§10); the manifest opens in its ordinary editor tab.
- **Open in editor** — hands the file to the author's own editor: `u8g2gl design --editor <command>` or `U8G2GL_EDITOR`, otherwise the application the system associates with the file. `code`, `code-insiders` and `cursor` open at the line. Offered, and accepted by the server, only for source and asset types (`.xml`, `.cpp`, `.cc`, `.c`, `.hpp`, `.h`, `.json`, `.md`, `.txt`, `.bdf`, `.xbm`, `.png`): the system's opener *runs* an executable file type, and the session token can write a file of any name.
- **Reveal in Finder** (macOS) or **Reveal in file manager** (elsewhere, opening the containing folder).
- **Copy path** — the project-relative path.
- **Show all elements** (screens only) — shows every element of the screen hidden in the designer (§6.3); disabled while none is.

The server starts these programs itself, with an argument array and never a shell; the editor command is split once at start-up and never comes from a request.

**The activity bar** draws each view as a Lucide icon (§6, the Palette's own set): Explorer `files`, Palette `shapes`, Assets `image`, Fonts `type`, Sample data `database`, Flow `workflow`, Search `search`. The name is the button's tooltip and accessible label; a view not in this release is shown disabled. *2026-11-20 (E-2k2).* **Fonts** is enabled: the Fonts view (§12). *2026-11-24 (E-3b).* **Sample data** is enabled: the Sample data view (§11.2). Assets, Flow and Search are not yet.

**The Palette** is a grid of 56 px icon tiles, each its element's icon over its label (cut short with an ellipsis; the tag when there is no label), grouped Framework / Project / Drawing and filed by category. A tooltip on hover and on keyboard focus gives the label, the `<tag>` and the description. The filter matches all three; tiles are drag sources onto the canvas; they are in the tab order, and the arrow keys move between them. An element's icon is its own, else its category's, else a generic one. The icons are [Lucide](https://lucide.dev), vendored whole (THIRD-PARTY-NOTICES.md), so a project widget's icon is not limited to the ones the framework uses.

**Selection geometry lives permanently in the status bar.** F2 depends on knowing exact coordinates without opening anything.

**Responsive behaviour.** Below roughly 1200px the property panel collapses to an icon rail and expands on selection; below 900px the XML pane collapses by default, leaving the canvas. The tool assumes a desktop-class screen — this is not a mobile target.

### 6.1 Saving

Saving is **explicit**: nothing is written to disk until the author asks. There is no autosave, because the author's IDE may hold the same files, and a write they did not ask for makes a conflict out of nothing. So the ways to save are in sight:

- **The status bar** shows **● N unsaved · Save** while any file has unsaved changes, and nothing otherwise. A click saves every unsaved file; its tooltip lists them and the shortcuts.
- **The canvas toolbar** has **Save**, enabled while the screen the canvas draws has unsaved changes. It saves that file, so a layout with no editor tab can still save what was edited on the canvas.
- **The Explorer** shows a **●** after the name of every file with unsaved changes. An editor tab shows one on its own tab.
- **⌘S / Ctrl-S** saves the active editor tab's file, or, when no editor tab is active, the file of the screen the canvas draws. **⌘⌥S / Ctrl-Alt-S** saves every unsaved file. Neither opens the browser's own "Save page".

Every save is the same conditional write: a file changed on disk since it was read is never overwritten, and its conflict bar offers keep, take or compare. Saving several files saves each in turn, and Output logs each one's outcome; a failure behaves as §6.2 describes.

### 6.2 Session lifecycle (served mode)

A served designer tab belongs to one run of `u8g2gl design`. The link carries that run's session token, so it stops working when the command stops or restarts. The designer says so, rather than looking alive until a save fails:

- **The session banner.** When the server can no longer be reached (Ctrl-C, a closed terminal, a reboot), a bar across the top of the window says the design server has stopped. It names the files with unsaved changes, which are still in the tab, and says to run `npx u8g2gl design` in the project folder for a new session; until then, saving is not possible. Editing stays possible. If the same server comes back, the banner clears and the project is listed and read again, so changes made in the gap are seen.
- **A failed save is visible.** It brings Output forward, which holds the reason, and the status bar shows **✕ not saved: *file*** until that file saves or its buffer is clean again. A conflict, where the file changed on disk while its buffer was unsaved, keeps its own bar on the editor.
- **Unsaved changes are guarded.** While any buffer is unsaved, reloading or closing the tab gets the browser's own "Leave site?" prompt. With nothing unsaved it never asks.
- **A stale link explains itself.** A browser opening a link the server refuses — the bare address, an old bookmark, a tab from an earlier run — gets a short page, still a 403, saying the link needs a running session and to run `npx u8g2gl design` in the project folder. The page is the same for every refusal and names no project, path or token. The designer's own requests are still refused with JSON.

Running `npx u8g2gl design` again while a session is live reopens that session in the browser rather than starting a second one. A new session is a new port, so unsaved edits in an old tab do not carry into it. The old tab keeps them on screen, and the guard stops a reload from discarding them.

### 6.3 Hiding elements in the designer

Elements layered on top of each other are hard to see and to click. Each element row in the Explorer has an **eye** at its right — always visible, faint until the row is hovered or focused — that hides the element **in the designer only**. The canvas promises to draw what the device draws, and a test run checks exactly that; this hide breaks the promise on purpose, so the break is contained, visible and impossible to export.

There are two kinds of hidden, and they never mix:

| | **Hidden in the designer** (the eye) | **Hidden on the device** |
|---|---|---|
| Who sets it | The author, with the eye | A binding (`bind_flag_if_eq … flag="hidden"` and its variants) with the sample data, or `hidden="true"` |
| Where it lives | This browser only. Never in the XML, the buffer, undo, generated code, the scene on disk, a test run or a bug report | The XML; it is part of the exported UI |
| What the canvas does | Does not draw it, cannot click it | Does not draw it (the device would not either) |
| How it reads in the tree | Eye shut, row dimmed | A quiet "hidden by data" mark, not the eye: *Hidden on the device: its hidden attribute, or its bindings with the current sample data — the device would not draw it* |

- **Never an edit.** Toggling writes no text, adds no undo step and marks nothing unsaved; Save and `u8g2gl build` are unaffected by construction.
- **In the renderer, not over it.** The editor Wasm skips a hidden element at draw time, so where elements overlap the pixels beneath are exactly what the rest of the screen draws. It never sets the runtime `hidden` flag, which bindings own and which a shape, having no object, does not have.
- **A hidden element takes its contents with it.** A row nested in a hidden one is dimmed, hidden by its parent, its eye disabled. A composite instance hides everything it expands to.
- **The canvas ignores it.** A hidden element is not a hit target, a marquee does not take it and Outlines do not box it, so a click lands on what is beneath. Selected from the tree or the XML, it is outlined **dashed and without handles**, and the property panel edits it as usual.
- **The canvas says so.** While anything on the drawn screen is hidden, the canvas toolbar shows **N hidden · Show all**, where N counts the rows the author hid, not their contents. Show all, or the screen's **Show all elements**, brings them back.
- **A test run draws the exported view.** The hide is forgotten whenever a scene is applied afresh, which a test run always does, so a run with elements hidden still reports parity; the canvas re-applies the hide after each of its own runs.
- **Remembered** per browser, by project and file. A name no longer in the file is dropped, so renaming an element shows it again. Where storage is unavailable the eye still works and is simply not remembered.
- **Old project builds.** A project editor Wasm built before the CLI could hide cannot; its eyes are disabled with the reason *Hiding needs the project's editor Wasm to be rebuilt*. The build hash covers the framework sources, so upgrading the CLI rebuilds it.

### 6.4 The project-file editors

*2026-11-14 (E-2k1).* `u8g2gl.xml` and `globals.xml` are edited through forms as well as XML, because principle 8 asks that everything they can say be visible: a setting nobody knows is there does not exist for them.

**Form ∥ XML.** Opening either file shows its form in the canvas half of the editor area, beside the XML, in the split, ratio and collapse the canvas has. The XML stays live. Every form change is a text edit on that buffer through the CST, one edit and one undo stop of that file's own undo (§10's round-trip rules apply: comments, order and layout survive). Selecting a screen's tab again shows the canvas.

**Complete by construction.** The form is not written per file. It is generated from the **project-file vocabulary** (`cli/src/core/schema/project-vocabulary.ts`), one declarative entry per element and attribute: type, default, every spelling the parser accepts and **help**, which every field shows behind an ⓘ as the property panel does (§9.2). Repeating elements are lists with add, remove and reorder; attributes are fields of their type (text, number, toggle, choice, or a picker of what the project declares). Two tests hold it there: the CLI's fails when a parser reads an attribute the vocabulary lacks, or an entry has no help; the designer's fails when a vocabulary entry has no control. Later editors replace a section with a richer one; until then the generic section is shown, so nothing is XML-only.

**Reading and writing.** The form reads every spelling the parser accepts: `setup` and `rotation` on `<target>` or `<display>`, `max_len` or `maxLen`, and so on, in the parser's own order. An edit to an existing value is written where that value is. A new value is written canonically, as design_spec §5.1 shows it, `<target name>` holding `<display setup rotation …>`, except where the target already writes its display's values on itself, when the new one joins them so the parser keeps reading them together. A spelling written but not read, because another wins, is flagged on its field. Text that cannot be read keeps the last good form, read-only, under a banner naming the problem, as the canvas keeps its last frame.

**Problems where they are fixed.** A Problems row on a project file shows on the field it is about, with its code and the Problems panel's words: the field whose value it points at, else the attribute its message names.

**Selection, both ways.** Focusing a section, item or part highlights its element in the XML, scrolling it into view if need be; moving the XML caret into an element marks its form section and scrolls the form to it. Neither takes focus, and neither is an edit.

**`u8g2gl.xml`.** *Project:* `name` and `version` are edited; `schema` is shown, never edited, and its ⓘ says why (a schema change is a migration, §15.4). *Targets* are added (a new one starts with the first target's display, so it draws at once), renamed, reordered and removed, never the last. *Output:* `dir` and `prefix`, with a live example of the file names and symbols they produce.

**The display picker** replaces the bare `setup` field. It steps **controller**, then **size and variant**, then **bus wiring**, or searches the setup name (every word of the query in the name, falling back to `u8g2gl find`'s matching). Every option shows what the catalogue knows: pixels, framebuffer bytes, bus family and wiring, driver and tiles, and nothing it does not. *2026-11-14 (E-4a).* Pixels are the panel's own size, because that is the part being chosen; when the target's rotation turns it a quarter, the size it is shown at follows: `256×64 · shown 64×256 at R1`. The status bar's target names the panel the same way. The controller links to U8G2's setup reference. Choosing a setup shows it as a **candidate**; only *Use this display* writes it, as one edit.

- *2026-11-14 (E-4b).* **The constructor snippet, where the bus fields were.** Schema 0.7 removed the pin attributes and `<bus>` (design_spec §5.1, [D-22]), and their fields and the rules that hid them by bus family went with them. Each target ends instead with one line, "Pins and bus are configured by your firmware's board (e.g. `board.h`); U8G2GL describes the panel.", then the board-side code that constructs its display: the text of `constructorSnippet()` for the target's current setup and rotation, monospace and selectable, byte for byte what `u8g2gl display <setup> --snippet` prints (design_spec §16). It follows the display and the rotation as they change, and shows nothing when the setup is not catalogued (the setup field already says why). **Copy** writes it to the clipboard and says *Copied*, or says the clipboard refused, so a copy is never claimed that did not happen. It never writes to the project. A pin or `<bus>` still written in the file is reported in Problems as `U8G2GL_REMOVED_ATTRIBUTE` at its line, with the fix; the form has no field for it.
- `rotation` shows each value with its angle (`R1 · 90°`), and *2026-11-14 (E-4b)* the mirrors by their axis: `MIRROR · mirrored left–right` and `MIRROR_VERTICAL · mirrored top–bottom`. The mirrors are offered from schema 0.7 only, or shown when the file already writes one (the validator then says it needs 0.7). Choosing one applies at once, as `R0`↔`R2` does: no impact preview, and the canvas keeps its size. The field's help says when to use them (reflective or head-up-display glass), and that rotation is how the board constructs the display (`U8G2GL_TARGET_ROTATION`), not the controller's flip mode (`setFlipMode()`), which is the firmware's. `ram_budget` shows the display's framebuffer beside it, which the §18 budget counts.
- *2026-11-14 (E-4a).* **A rotation that resizes the layout is previewed.** `R1` and `R3` swap the panel's width and height (design_spec §5.1), which can push elements off it as a new display can. Choosing one from `R0` or `R2` (or the reverse) shows it as a candidate with the impact preview below, every screen at the turned size with what falls outside named; only *Use this rotation* writes it, as one edit and one undo stop, and *Cancel* writes nothing. A change that keeps the size, `R0`↔`R2`, `R1`↔`R3` or to or from a mirror without a quarter turn, applies at once with no preview.

**The impact preview.** A candidate display, or a candidate rotation that resizes the layout, is previewed before it is used: every screen drawn at the candidate's geometry, with each element that would fall outside it outlined and named. It renders the candidate in memory, through the same pipeline the canvas uses, in a second editor-module instance, so neither the document nor the canvas changes until the author confirms. It is measured: if drawing every screen would take more than about a second at the rate the active screen took, only the active screen is shown, and the preview says why. *Measured on the departures project:* one screen, 1–2 ms.

**The target switcher** ([U-3], closed below). One canvas, and a control in the status bar naming the active target with its controller and size; with more than one target it switches between them. The canvas, an insert from the Palette and the impact preview follow the active target. The choice is a view setting of this browser, kept by project: never written to the XML, never an undo step, never unsaved. A target no longer declared, as after a rename, falls back to the first, which stays the project's default (design_spec §5.1). A test run builds the first target, so Run says so while the canvas shows another.

**`globals.xml`: the font picker and the file chooser.** *2026-11-15 (E-6).* An element that names a font or a file is never added as an empty box to type into. Its kind's "+" opens a chooser first, inline below the list as the display picker is; choosing adds the element, with what was chosen, as one edit and one undo stop, and *Cancel* adds nothing. The same chooser stays behind the field that names it, beside a text box that is still typeable.

- **The font picker** serves `<builtin>`: on *+ Built-in font*, and behind *Change font…* on its `name`, which shows the current font's facts. It searches the name as the display picker does (every word in the name, shortest first) and filters by height (a range, in pixels), character set and glyph box (monospace, proportional, or one of U8G2's four). Every row shows the name, its height, its decoded set and box, and a **sample drawn by U8G2 itself**, 1-bit and scaled with crisp pixels. The set and box come from U8G2's naming scheme (`fontFacts()`, design_spec §14.1); a suffix that scheme does not explain is shown as *unknown*, never guessed. Fonts the project already declares are marked *declared*. U8G2's large fonts (design_spec §14.1) are marked **large (over 32 KB): needs U8G2_USE_LARGE_FONTS**, in their row and in the current font's facts, with a tooltip saying U8G2 enables the macro on unix, ARM and ESP targets (`u8g2.h`) and that a build without it stops with an error naming the font. They are listed by default, because the ESP and ARM boards U8G2 covers can use them, and a *Hide large fonts* filter, off by default, leaves them out. The picker links U8G2's own gallery (the wiki's `fntlistall`) for the full picture. The samples are one file, fetched the first time a picker opens in a session and never by the page load.
- **The file chooser** serves `<bdf>`, `<xbm>` and `<convert>`: on their "+" and behind *Choose file…* on their `src`. It lists the project's files of the kind (`.bdf`, `.xbm`, `.png`), the current one selected; sizes are not shown, because the project listing does not carry them. Choosing adds the element with its `src`, a `name` derived from the file (lower-cased, other characters made `_`, prefixed where it would start with a digit or be reserved, and unique among the list's names) and, for `<convert>`, the `width` and `height` read from the PNG's header; if the header cannot be read they are left empty, and the validator flags them for the author. *Import from your computer…* opens the browser's own file dialog, limited to the kind's extensions, and proposes `fonts/<file>` or `images/<file>`, which the author can change. **An import never replaces a file**: a path that exists is refused, before any write, with a request to rename, and the write itself asks the server for "must not exist". An import is a file write, not an edit of the document, and the chooser says so: undo removes the element that names the file, never the file.
- *2026-11-20 (E-2k2).* **"Browse fonts…" ends the property panel's font field.** The field's dropdown lists the project's fonts; *Browse fonts…* after it opens the Fonts view (§12) for that field, the view naming it (`plat_label.font`), and the font chosen there (*Use for plat_label.font*) returns to the field. A font the project has not declared is two edits in two documents: the `<builtin>` in `globals.xml`, then the field. Each is undone in its own document (§14 excludes cross-file undo), and the view says so before the choice. Choosing or cancelling returns the sidebar to the view it showed before.
- *2026-11-20 (E-2k2).* **Sizes, users and the remove guard.** Each item of `globals.xml`'s fonts and images shows its size in bytes — the array the firmware links — and how many elements and styles use it, listed when clicked. Remove is refused while an item is still used, naming its users in the form's refusal banner. `<bdf>` range presets and image previews are §12's.

**`globals.xml`: subjects, styles, constants, and renaming.** *2026-11-21 (E-2k3).* Who uses a name is answered once, by the CLI's **reference finder** (`cli/src/core/references/`), which every list, guard and rename below reads. It finds references structurally, never by searching text, in every file the project loads (`u8g2gl.xml`, `globals.xml`, every screen, every widget manifest wherever it lives), with the exact text of each: `bind_*` attributes and `<bind_flag_if_*> subject=`; props a manifest types `subject`, `style`, `font` or `image`, and their `default`s; `<style name>` children, `style=` and `focus_style=`; `style_font=` overrides and a style's `font`, global or a screen's own; and each `#name` the resolver's expression tokeniser reads in an attribute value, so `#margin` in `#margin_top + 1` is not one. A screen that declares a style of its own shadows a global style of the same name there, as the validator resolves it; a widget's template sees global styles only.

- **The subjects table** replaces the subjects list. Each row is one subject: its name; its type; **Initial value**, headed as the value the firmware boots with, its ⓘ saying it is compiled in until the application calls `ui_set_<name>()`; `max_len` for a string, with what its buffer costs (`max_len + 1` bytes, §18); and **Used by**, each binding by screen and element. A click on a user selects that element on its screen, as the Explorer does. Every field is the generic form's control, committing on Enter or blur as one undo stop, with its own problems beneath it. *2026-11-24 (E-3b).* Sample values join as columns, one per set (§11.5).
- **A style's card** keeps its §10 fields, driven by `STYLE_PROPERTIES`, and ends with a **preview**: a label and a button in the style, side by side, drawn by the real renderer on a one-screen project over the project's own `globals.xml`, as the Fonts view draws its ruler, and drawn again whenever that text changes. Each is captioned with what the runtime draws of a style on it: the label its font, draw colour, font mode, alignment, and `border` (a one-pixel outline, rounded by `radius`); the button those, plus `invert` (a filled box, when not disabled), `radius` (box and frame), `padding` beside a left or right alignment, and `border`, which its own `border_width` frame stands in for when `border_width` is above 0. *2026-11-22 (R-border).* The framework now draws a style's `border` on every element (design_spec §10), so the captions name it, and the note that said no element drew it is gone. The card lists **Used by**, by screen and element, names the screens whose own style shadows it, and gives the **radius bound**: the largest radius its users with a literal `width` and `height` allow (`min(width, height) / 2` of the smallest, named), which explains the validator's existing check before it fires and adds no rule. A user that sets its own `radius` is left out, since its own value wins (§10); with no literal-sized user, the card says the radius is checked where each user is placed.
- **A constant** lists every `#name` reference by file and attribute, one inside an expression included, each a link to it.
- **Every kind refuses Remove while it is used**, subjects, constants, styles, fonts and images alike, naming every user the finder reports, a widget template's element or a prop's default included, so Remove can never leave the project failing to validate. A global style's uses on a screen that shadows it do not hold it.
- **Rename…** is on every subject, constant, style, font and image. The dialog takes the new name and, before anything is written, lists each file it changes with its number of changes, and the **generated symbols** whose names change, old → new: a subject's `ui_set_<name>()` and `ui_subject_<name>`, a font's `ui_font_<name>` (and a `<bdf>`'s `ui_fontdata_<name>`), an image's `ui_image_<name>`, a style's `ui_style_<name>`; a constant has none. It says that application code calling the old symbols is not changed and will not compile until it is updated by hand (U8G2GL never edits application code), and that each file is undone on its own. A global style's rename leaves the screens that shadow it alone, and lists them. It is refused, naming why, before any write: a name §13.4 forbids (the validator's own rule), or for a `<builtin>` a font U8G2 does not bundle, since its name is the font; a name the same kind already declares, a screen's own styles included; or a file it would touch that is not well-formed. It is applied as **one edit per document**, each one undo stop in that document's own history (§14).
- **A name field asks.** Fields commit only on Enter or blur, so the question comes once per change. When a name with references is changed in its field (a `<builtin>`'s *Change font…* included), the same dialog opens, headed *You're renaming* **old***. Rename it in the files that reference it too?*, with the files and symbols, and three choices: **Rename everywhere**, the declaration and every reference; **Only here**, the one `globals.xml` edit, leaving the validator to flag the references; and **Cancel**, which writes nothing and shows the old name again. A name nothing references commits at once, with no question.

---

## 7. Document Contexts

One editing surface; three contexts. Switching changes *what* is edited, not *how*.

### 7.1 Screen context
A screen's `<view>` against the active target's display bounds. The default.

### 7.2 Element context
A user-authored element, rendered in isolation against its `<previews>` declaration rather than a full display — an element has no inherent screen position.

Per [D-18] there are no longer two kinds of user element, so the editor's split narrows to its real cause — **whether the element has a `<view>`**:

- **An element with a `<view>`** is fully editable: layout, properties, `<api>` props and defaults.
- **An element rendered by C++** exposes its `<api>` and a preview only. The editor shows whatever the Wasm runtime draws and cannot edit it. The panel says so rather than appearing broken.
- **An element with both** ([D-18]) edits its `<view>` and previews its C++ behaviour — the canvas is honest that it is showing a designed structure a class will drive.

Multiple `<preview>` declarations render as a small gallery, so an element can be checked in several configurations at once. Because a composite is a real container with its own bounds ([D-18], [D-20]), a preview at more than one size is the way to check that its anchors actually hold — a resizable element whose children are absolutely positioned looks correct at exactly one width.

### 7.3 Screen-flow context
A read-write graph. Nodes are screens; edges are `<screen_load_event>` and `<screen_back_event>` declarations already present in the XML. Dragging an edge writes the event; deleting removes it. Per [UD-7] this adds no framework capability.

**Excluded, deliberately:**

| Excluded | Reason |
|---|---|
| **Carousel configuration** | `CarouselEngine` and `BoardCatalog` are esp32-app-foundation concepts. Encoding one consumer's navigation policy into a general framework is the heritage anchoring [A-1] rejects — it belongs in `modules/U8G2GLDisplay` |
| **Modals / overlays** | Not a framework capability. Needs overlay rendering, z-order beyond document order ([D-4]), a focus stack and dismissal semantics — a `[D-n]` decision and runtime work must precede any editor surface |

**Related, but not excluded — a one-of-N container** ([design_spec.md](design_spec.md)
Q-15). Showing exactly one of several children, chosen by an integer subject, is
neither of the exclusions above. It is a *mechanism* that carousel policy in
`modules/U8G2GLDisplay` could drive, and it is not a modal: it draws in document
order, so it needs no overlay rendering or z-order. It is deferred until E-3's
navigation design needs it; this pointer is here so that design finds it.

---

## 8. The Canvas

The most important surface.

**Rendering.** The Wasm runtime draws the actual framebuffer. Scaled **nearest-neighbour** — never smoothed, because a blurred 1-bit pixel misrepresents the output. Presented on dark chrome so the display bounds read as a physical panel.

**Zoom.** 1× · 2× · 4× · 8× · fit. Ctrl/⌘+scroll zooms about the cursor; space-drag pans. A **pixel grid** appears at 4× and above; an **8-pixel tile grid** toggles independently, because tile boundaries are real — partial refresh works in tiles.

**Selection.** Click selects; repeated clicks cycle down through overlaps; marquee selects many; Esc clears. Selected elements show handles and a live `x, y, w, h` badge. A single selected line-shaped element shows end handles instead of box handles (below).

**Resizing.** Every element is selected by its drawn box: its own rectangle, the box around a line's or triangle's points, or, for a circle, an ellipse, an hline or a vline, the pixels it draws (one pixel thick across a line). A handle moves one edge of that box (two at a corner) and leaves the opposite edge where it is, written in the attributes that place the element:

- **A box** (`x`, `width`, or a far anchor) rewrites those attributes, as a move does.
- **A line or triangle** is placed by its points. Every point is scaled about the opposite edge of the box around them, rounded to a whole pixel; a line's box handles are shown only with several elements selected (below). Points that all share one `x` (or `y`) have no width (or height) to scale on that axis. A single selected triangle also shows a round handle on each vertex; dragging one moves that vertex alone, snapped as a move is. Vertex handles take precedence over the box's where they overlap, and are not shown with more than one element selected.
- **A circle or ellipse** is placed by a centre and radii. A circle's handles change `radius`, a side by its own axis and a corner by the larger of the two; an ellipse's change `rx` or `ry`, a corner both. The centre moves too where it must, so the opposite edge stays put: a whole circle reaches a radius on both sides of its centre, a quadrant (`segments`) on one.

**Lines have end handles, not a box's.** A line's box is redundant, and a horizontal or vertical one is flat, so its box handles would stack on the ends and win the grab. A **single** selected line-shaped element therefore shows one round handle at each end and **no box handles**; its outline and badge stay. Line-shaped is what the element is, never whether its box happens to be flat: an element placed by exactly two points (`u8g2gl_line`, diagonal or not), or one placed by `x`, `y` and a size on one axis only (`u8g2gl_hline`'s `width`, `u8g2gl_vline`'s `height`).

- **A line's** end handles are its vertex handles: dragging one moves that point alone.
- **An hline's** left end moves `x` and changes `width` so the right end stays put; its right end changes `width`. A **vline** is the same with `y` and `height`. Each end moves along the line's own axis only, is snapped as a resize edge is, and Shift has no ratio to keep. A line stays at least one pixel long, so an end cannot be dragged past the other.
- **Dragging the line's body** still moves the whole element.
- **With several elements selected**, a line keeps the box handles of its box, as every element does.

Every attribute a handle writes must be an integer literal. A binding or an expression refuses that axis with its reason, shown beside the pointer during the drag and, while the element is selected, as **Can't resize: …** in the property panel; the other axis still follows. A line is asked only about its ends, so the panel never reports an axis it has no handle on, while a real refusal on an end, such as a bound `width`, still shows. A box, radius or radii stay at least one pixel; a triangle may become degenerate, as the validator allows. Each drag is one undo step.

**Movement.**

| Input | Effect |
|---|---|
| Drag | Move, snapping to guides |
| Arrow | **1 px** |
| Shift + arrow | 8 px (one tile) |
| Alt + drag | Duplicate |
| Drag handle | Resize; Shift constrains ratio |
| Drag vertex | Move one vertex of a line or triangle |
| Drag end | Move one end of a line, hline or vline |
| Property field | Exact value; steppers ±1 |

**Alignment.** Edge and centre guides against siblings and display bounds appear during drag, with a snap threshold of 3 *screen* pixels — not device pixels, so it stays usable at 1×. Snapping is to integers only; there is no sub-pixel position. An align toolbar (left/centre/right, top/middle/bottom, distribute) acts on multi-selection.

**Overflow is an error.** An element extending past the display is drawn with a hatched indicator and raised in Problems, because §15 requires the generator to reject it.

**Composite instances render inline** but are not editable in place — selecting one selects the instance and offers *Open element*.

**Animation** runs live; the freeze toggle (§4.2) pins t=0.

**Hidden in the designer.** While any element of the drawn screen is hidden with the Explorer's eye (§6.3), the toolbar shows **N hidden · Show all**: the canvas is then not the exported view, and says so.

---

## 9. The Property Panel

**The differentiator.** LVGL Pro's weakness is here, and principle 6 exists because of it. Generated entirely from `<api>` manifests ([UD-5]).

### 9.1 Editors by type

| `<prop>` type | Control |
|---|---|
| `int` | Number field with steppers; coordinates grouped as x/y and w/h pairs |
| `bool` | Toggle |
| `string` | Text field; multiline where the manifest says so |
| `enum` | Segmented control for ≤3 options, dropdown above that |
| `font` | Dropdown, each option rendered in its own face |
| `image` | Picker with thumbnails at 1:1 |
| `subject` | Dropdown filtered to type-compatible subjects |
| `style` | Dropdown of styles in scope |

### 9.2 Guidance — what makes it teach

- **Descriptions on the field, one step away.** A property whose manifest gives `help` has a quiet ⓘ after its name. Hovering the name or the ⓘ, clicking the ⓘ, or focusing it from the keyboard, opens a tooltip beside the panel: the help, then one facts line — the type; an enum's values, or a binding's subject types, separated by ` | `; and the default, if there is one (`enum · clip | dots | scroll | scroll_circular · default clip`). Escape closes it and does nothing else; the selection stays. It is the Palette's tooltip (§6), so both look and behave alike. Opening one re-renders only its field. *2026-11-12 (E-2i), the owner's decision:* this replaces help rendered as text beneath every control, so a property is explained the way a Palette element is. The ⓘ marks every property that has help, so its meaning is still found without guessing where to hover.
- **What needs acting on stays inline.** Why a field is disabled, its problems, and the note on a computed value with Detach and Edit in XML are shown beneath the control, never only in a tooltip.
- **Live validation.** A value the compiler would reject is flagged as typed, with the reason.
- **Consequence shown where it is incurred.** The panel shows a memory cost only where the §18 budget model computes one, so a costly choice is felt when made rather than at build time. *2026-11-24 (PR-08, [Q-19] closed):* an element whose manifest declares `<data>` shows, in the header's notes, one RAM line per block with the bytes the build allocates and how they follow — `RAM 1520 bytes for rows: 10 rows × 152 bytes (cells: 6 × string, 25 bytes each, max_len 24 + 1, at 0; padded to 4)` (design_spec §6.5, §18). It is the instance's own figure, so editing `max_rows` from 10 to 1 changes it on the next run, and the capacity props' `help="Determines allocated RAM"` is now true. A block that cannot be sized says so instead, beside the problem that refuses it. A project widget without `<data>` keeps the muted line *RAM cost not reported for project widgets ([Q-19])*, and a framework element shows no RAM line.
- **Constraint awareness.** Setting `right` disables `x` with an explanation rather than silently conflicting (§7.2 forbids over-constraint). Setting `bind_text` disables `text`.
- **Binding assistance.** Choosing a subject offers a format string with the correct conversion for its type and rejects mismatches (§8.4).
- **Font feedback.** Selecting a font shows pixel height and glyph coverage, and warns when bound text may exceed the element width at that font.
- **Defaults are visible.** A property at its default renders greyed, gaining a *reset* affordance once overridden, so what has been deliberately set is obvious at a glance.

### 9.3 Grouping

Geometry · Appearance · Content · Binding · Advanced. Order and grouping come from the manifest, so widget authors control their own panel. Advanced collapses by default.

### 9.4 Multi-selection

Shared properties show a common value or a mixed indicator; editing applies to all. Geometry shows the bounding box, with align and distribute acting on the set.

### 9.5 Static children

An element whose manifest declares `<element>`s (design_spec §6.5) ends with a
table of its **static children**, one per `<element>` kind, headed *`<column>`
children*: a row per child in document order, a column per `<arg>`, each cell the
control its type gets in §9.1 (a width is a number field with steppers, a
three-value `align` a segmented control). Below each row's arguments, ↑ and ↓
move it and × removes it; *Add `<column>`* adds a copy of the last row after it,
or the first with each argument's plainest value (0, false, the first enum
value, empty text). Every change, a committed value included, is one undo stop
and the smallest text edit, computed from the current text with the element
found by name, as every field is (§10). A table shows for one selected element
only. A static child is never named, so opening a screen never writes a name
into one ([U-1]).

---

## 10. The XML Editor

Monaco, configured for this schema.

- **Schema-driven completion** — valid elements and attributes at the cursor from PR-02's schema, including enum values and declared font, image and subject names.
- **Inline diagnostics** — [D-16] JSON mapped to markers; hovers carry the suggestion.
- **Two-way selection sync** (§4.3).
- **Go to definition** on an element tag, font, image, style or subject name.
- **Format on demand only, never on save** — formatting belongs to the author (principle 5).
- **Breadcrumbs** showing the element path at the caret.

**View source.** A widget's C++ opens in a read-only tab, highlighted as C++ and marked *read-only* in its title, read through the server's ordinary file route and refreshed when the file changes on disk. A Problems row on a C++ file — a failed widget build, say — opens the same tab at its line. Editing C++ is the author's editor's job (§14): **Open in editor** (§6) is one click away.

**Round-trip is non-negotiable.** A canvas nudge must produce a one-line diff. Comments, blank lines, attribute order and indentation elsewhere survive untouched. This constrains implementation ([UD-3]) and is the requirement most likely to be quietly compromised under delivery pressure — hence its restatement here.

---

## 11. Sample Data

**Design-time values for bindings and collections.** Without them the canvas renders empty labels and blank tables, and a layout cannot be judged.

This matters more in monochrome than in colour UI because **layout is length-dependent**: an 8-character station name and a 30-character one differ in whether text fits, scrolls or truncates. Designing against empty strings produces layouts that break on real data.

**Three kinds of value, which the UI never blurs** (E-3, approved 2026-11-17):

| | **Initial value** | **Sample value** | **Collection sample rows** |
|---|---|---|---|
| Lives in | `globals.xml` `value=` | A sample set | A sample set |
| Compiled into the firmware | **Yes**: the boot frame | Never | Never |
| Scope | Per subject | Per subject, per set | Per collection widget instance (screen + element name), per set |
| Edited in | Subjects table, "Initial value" | Subjects table, one column per set; Sample data view | Sample data view, a typed grid per instance |

- A set may leave a subject out. Then the initial value applies, and the UI shows that it was inherited. With neither, the element shows the visible placeholder below.
- **Sample sets live in `samples/<set>.json`** in the project (S1, closing [U-6]): shared through source control, read by the designer and by test runs, **ignored by `generate` and `validate`**, outside the schema. The active set is per-browser view state (`u8g2gl.samples:<project>` in the browser's storage), never written to the project. No set active is the initial values alone.
- **Collection widgets take sample rows** ([D-8]: collections are not subjects). A widget declares the shape of its rows with `<data>` in its manifest (design_spec §6.5), and the editor fills it by name through the registry (design_spec §9.4): every field of every row is typed, and every collection's capacity is the instance's own.
- **Never compiled** ([UD-6]).

An element bound to a subject with no sample value renders a visible placeholder rather than blank, so the omission is obvious rather than silent.

### 11.1 The set file

*E-3b, 2026-11-24.* One JSON file per set, `samples/<set>.json`, one level deep:

```json
{
  "u8g2gl_samples": 1,
  "values": { "platform": "4", "box_fill": 3 },
  "rows": {
    "screens/screen_departures.xml": {
      "formation": [ { "number": 1, "class_type": "first", "wheelchair": false, "bike": false, "loading_pct": 40 } ],
      "services":  [ { "cells": ["10:15", "Reading", "3", "On time"] } ]
    }
  }
}
```

- `u8g2gl_samples` is the format version, 1.
- `values` is keyed by subject name: a string, an integer (int, and time in seconds), or a boolean, by the subject's type.
- `rows` is keyed by the screen's project-relative file, forward slashes, then the element's name. Each element's rows are an array of objects keyed by the manifest's `<field>` names; a `repeat` field is an array of strings. A set addresses an element's only `<data>`: an element whose manifest declares several is a problem.
- A set name is letters, digits, spaces, `_`, `.` and `-`, starting with a letter or digit, so the file name is portable.
- The designer writes two-space JSON with a final newline, in the document's own member order, so one edited value is one changed line.

**Checks.** Every set is checked against the project on every run of the live loop, and each problem is a row in Problems (and a marker in the set's editor tab) naming the set file, the line and column of the value at fault, and its JSON path, e.g. `rows["screens/screen_departures.xml"].services[3].cells[1]`:

| Problem | Code | Severity |
|---|---|---|
| Not JSON (with the line and column) | `U8G2GL_SAMPLE_JSON` | error |
| A missing or unknown `u8g2gl_samples` | `U8G2GL_SAMPLE_VERSION` | error |
| A member of the wrong shape, or one the format lacks | `U8G2GL_SAMPLE_SHAPE` | warning |
| An unknown subject | `U8G2GL_SAMPLE_UNKNOWN_SUBJECT` | warning |
| A screen file the project does not read | `U8G2GL_SAMPLE_UNKNOWN_SCREEN` | warning |
| An element the screen does not have | `U8G2GL_SAMPLE_UNKNOWN_ELEMENT` | warning |
| An element whose manifest declares no `<data>` (or several) | `U8G2GL_SAMPLE_NO_DATA` | warning |
| A field the `<data>` does not declare | `U8G2GL_SAMPLE_UNKNOWN_FIELD` | warning |
| A wrong type, a value outside `min`/`max` or not in `values`, a string over its `max_len` (resolved from the instance's props, counted in characters), an array longer than its `repeat`, a missing field | `U8G2GL_SAMPLE_VALUE` | warning |
| Rows beyond the instance's capacity | `U8G2GL_SAMPLE_CAPACITY` | warning |

A set that does not parse, or has an unknown version, applies nothing. Otherwise **the parts that check clean still apply**: a bad value is left out (its subject inherits), a bad row is left out, rows beyond the capacity are left out. What reaches the bridge has been checked as the bridge checks it, so the canvas never loses its frame to a bad set. A set's problems never block a build or hatch the canvas: a set is never compiled.

**Set files are project documents.** They open in an editor tab (as plain text) and are saved and undone through the same model as the XML: every edit the designer makes to a set is one undo step on its document, and the set is unsaved until the author saves it (⌘S in its tab, ⌘⌥S, or the view's Save). A set edit never touches project XML. An edit made outside the designer reaches it as an XML edit does (§16.1). Creating, duplicating, renaming and deleting a set are file operations the author asks for by name, and happen on disk at once; the design server removes only sample sets, and only at the version the designer read.

### 11.2 The Sample data view

The activity bar's **Sample data** view (§6). While it shows, the primary sidebar widens, so a service list's cells fit.

- **Sets.** Pick the active set, or *None* (the initial values). *New…*, *Duplicate…*, *Rename…* and *Delete…*; a delete asks first, in the view, naming the file and any unsaved changes it loses. *Save*, *Undo* and *Redo* act on the active set's file. A rename moves the active set with it.
- **Values.** One row per subject; the initial value, labelled as compiled in, and one column per set. A value a set leaves out shows the initial value, dimmed and marked *inherited*; editing it writes it into that set, and ↺ makes it inherited again.
- **Collections.** Every collection instance on every screen, with its rows in the active set as a typed grid: a checkbox for a bool, a dropdown for an enum, a number held to `min`/`max` (a typed 150 for a 0–100 field is written as 100), a string counted against `max_len` (`12 / 24`, flagged when over, never cut), and a `repeat` field as its cells. Rows are added (a row of defaults), removed and reordered; the capacity is shown (`8 / 12`) and *+ Row* stops at it. Text and number cells commit on Enter or blur, so one edit is one undo step.
- **Paste.** A grid's *Paste…* takes a JSON array of row objects, or CSV with a header row (RFC 4180: quoted commas, doubled quotes and line breaks in quotes). Fields are mapped by name, exactly or ignoring case; a repeated field takes `cells[0]`, `cells.0`, or the bare name repeated, left to right. A field no column gives takes its default and a column no field has is ignored, each said once. **Every refused value is reported by row and field** (`row 2, cells[1]: 25 characters, over the max_len of 24`), a row with one is left out, rows beyond the capacity are refused, and **the accepted rows still land**. This is the route from a real departures feed into the designer.
- **Canvas link.** Selecting a collection element on the canvas opens its grid in the view and scrolls to it.

### 11.3 Generated and conventional sets

The view generates sets from the declarations, on request, as ordinary set files the author can edit afterwards (ruling 8):

- **Empty:** every collection with no rows, every string subject empty, numbers 0, bools false.
- **One row:** a single row per collection, each string its field's name so the row can be seen; subjects inherited.
- **Full, longest:** every collection at its capacity, every repeated field at its `repeat`, every string at its `max_len`, made of the printable ASCII glyph (`!` to `~`) with the largest advance in the font that draws it. The advance is measured by the real renderer (the bridge's `measureText(font, text)`, editor target only): `width("cc") − width("c")`, because U8G2 counts a string's last glyph by its ink. A tie goes to `W` when it is among the widest, as in every monospaced font. A string with no measurable font (one set only through a style, say) uses `W`, and Output says so.

In every generated row a number takes its `min` (else 0 within its bounds), an enum its first value, a bool false.

**Conventional sets** (Q3a). There is no project-creation flow, so while `samples/` is empty the view offers one action, *Create the conventional sets*, which writes:

- **typical:** the initial values written out, and one row per collection;
- **empty:** the *empty* set;
- **longest-plausible:** a copy of *typical*, for the author to lengthen to the longest real data the product must survive;
- **worst-case:** the *full, longest* set.

The names are file names a shell needs no quoting for.

### 11.4 The set switcher

The canvas toolbar's **Data** dropdown chooses the set the canvas shows: *no sample set*, then each set by name. **⌥] / Alt+]** and **⌥[ / Alt+[** cycle through them from anywhere in the designer, the XML editor included, with *no sample set* the stop before the first; the dropdown's tooltip names both keys. Switching only changes what is handed to the editor Wasm after the scene, so it is as quick as any frame, and one layout is swept against every set in seconds.

**Test runs check every set** (design_spec §9.6). Run compares every screen with the initial values and with each set, and reports parity per set and per screen: *✓ parity · 5 cases* with one chip per case, or the first mismatch with its case (*≠ 1 px differ at 0 ms with worst-case*), and the bug report records the case's screen and set.

### 11.5 The subjects table's set columns

The subjects table (§6.4) has one **sample** column per set beside **Initial value**, which stays labelled as what the firmware boots with. Each is the Sample data view's own value cell: a value a set leaves out is shown inherited, and an edit writes the set's file, never `globals.xml`.

---

## 12. Fonts and Assets

**Font browser** (F8). Glyph grid for a selected font; metrics for a chosen glyph — width, ascent, descent, bounding box. A **string ruler**: type a string, see its rendered width in pixels against a target width.

*2026-11-20 (E-2k2).* **The Fonts view** is the activity bar's *Fonts*, and is this browser's first release. It lists the project's fonts, then every U8G2 built-in through the font picker (§6.4) — its search, filters and samples — with all 2,039 rows listed and each sample drawn only as its row nears the view. Selecting a font shows:

- **its glyph grid**, every glyph its table carries in a cell of its largest glyph box (the first 192 of a larger font, saying how many it has);
- **the string ruler**: type a string and read its width and height in device pixels, as drawn — the lit box, which is the width the canvas draws the same text at.

Both are drawn by the real renderer: each is a one-screen project of its own run through the canvas's text pipeline and drawn by the editor Wasm with the font injected (design_spec §9.5). A built-in the project has not declared has **Add to project**, which writes its `<builtin>` into `globals.xml` as one undo stop. Opened by a field's *Browse fonts…*, the view returns its choice to that field (§6.4). Per-glyph metrics are not shown yet.

**Range presets.** *2026-11-20 (E-2k2).* A `<bdf>`'s `range` field offers **All** (no `range`), **Printable ASCII**, **Latin-1**, **Digits and time** and **Only what this project uses**, each with the size the in-page `bdfconv` compiles it to, the current one marked. The last is derived from the project's static text and formats in that font, and is flagged unsafe, naming them, when an element bound to a string subject draws in it. Choosing one writes `range` as one undo stop. Static text using a glyph outside a `<bdf>` range is a Problems warning, `U8G2GL_GLYPH_OUTSIDE_RANGE` (design_spec §14.1). Answers "does this fit in 40 pixels?" before a layout depends on it. Read-only in v1.

**Glyph / BDF pixel editor.** Draw and edit glyphs — genuinely useful for the icon fonts monochrome projects rely on. **Scoped after the first editor release** ([design_spec.md §20](design_spec.md) Phase 4): the browser answers the common question, and authoring glyphs is a separate tool with its own surface.

**Assets.** Import PNG/XBM; preview at 1:1 with the threshold/dither choice (§14.2) shown beside its result, since that choice is visual and belongs next to its outcome. *2026-11-20 (E-2k2).* Each image in `globals.xml`'s form is drawn at 1:1 beside its size and users, and a `<convert>` shows its threshold, or that it is dithered, beside it. The Assets view itself is not yet.

---

## 13. Build, Problems and Budget

**Continuous validation** as you type; **build** on demand.

- **Problems** — severity, file, line, column, message, suggestion. Click to navigate. Sorted by severity then position; filterable by severity and file.
  - *Each fault once.* The project's editor build and a test run both run `generate`, so their failure repeats errors the live pipeline already shows. A build or test-run problem (`U8G2GL_EDITOR_BUILD`, `U8G2GL_TEST_RUN_BUILD`) with the same file, line, column and message as a live one is dropped; one with no live twin, a compiler error in a widget's C++ say, is shown.
  - *A failed test run's problems are about the text it ran.* They clear at the next edit, as its mismatch overlay does, and a run that fails after an edit made while it ran adds none. The verdict line keeps the result, with its "n edits since".
- **Output** — the CLI's raw output, for when something goes genuinely wrong.
- **Budget** — the §18 memory report per target, over-budget items highlighted. Visible during design rather than after.

The status bar carries build state, duration and RAM total, so the cost of a design is ambient rather than something to go looking for.

---

## 14. Deliberately Not In Scope

Per [design_spec.md §1.5](design_spec.md), omission is the default.

| Excluded | Reason |
|---|---|
| Plugin / extension system | An application, not a platform ([UD-1]) |
| Integrated terminal, git UI | The user has an IDE; not competing with it |
| Multi-user collaboration | No demand established; large cost |
| Animation timeline | Animation is widget-internal ([D-5]); nothing to sequence |
| Flex/grid layout tooling | No layout engine exists ([D-7]) |
| `<row>`/`<col>` UI | Not in schema 0.3 (§7.2). Arrives with the schema feature, if it does |
| Theme / skin editor | Monochrome. The whole style set is ten properties (§10) |
| Carousel configuration | Belongs to the consuming application (§7.3) |
| Modals / overlays | Not a framework capability yet (§7.3) |
| Cross-file undo | Per-document undo only. Large problem, narrow benefit. An edit that spans files, such as a rename (§6.4), is one undo step in each document it changes, and says so |
| Firmware build / flashing | The user's toolchain does this |
| Editing C++ | A widget's C++ is shown read-only (View source, §10) and handed to the author's own editor (Open in editor, §6). The designer edits the XML it understands, not code it cannot check |

---

## 15. Schema Requirements — gates PR-02

*Status, 2026-10-26 (E-D).* PR-02's deadline passed without most of this table. Schema 0.4 has `help=` and nothing else here that is schema surface; whether the rest was deferred or missed is not recorded. The status notes below say where each now stands. Adding schema surface is the owner's decision ([.agents/rules/03-versioning.md](../.agents/rules/03-versioning.md)), and E-D recommends taking it once, at checkpoint C4, with E-2's panel in front of the decision.

*Status, 2026-10-31 (S-1).* The C4 decision is taken. Schema 0.5 adds palette metadata, without icons; `<previews>` is deferred to E-3; property grouping and `visible_when` are declined.

*Status, 2026-11-10 (S-2).* Schema 0.6 adds the icon: `icon` on `<api>`, a name from the vendored Lucide set. Palette metadata is complete.

**This section has a deadline.** PR-02 freezes schema 0.3. The schema must be an editor's document model first and a compiler input second ([design_spec.md §1.2](design_spec.md)): a compiler can ignore what it does not need, but an editor cannot invent what was never stored. Risk R-8 tracks this.

| Requirement | Detail | Status |
|---|---|---|
| **`<previews>`** | Named preview configurations per element — size and context for isolated rendering (§7.2) and palette thumbnails. Present in LVGL Pro; dropped from ours as "editor-only" | **Deferred to E-3** — *2026-10-31: decided at C4 ([EDITOR-DESIGN.md](../.agents/skills/principal-architect-workspace/e-d-editor-design/EDITOR-DESIGN.md) §8); not in schema 0.5* |
| **`help` on every `<prop>`** | Description text, shown in a tooltip behind an ⓘ (§9.2). The core of principle 6 | **Must formalise** — *2026-10-26: done, schema 0.4* |
| **Property grouping and order** | `group="geometry\|appearance\|content\|binding\|advanced"`; declaration order drives panel order | **Declined at C4** — *2026-10-31 ([EDITOR-DESIGN.md](../.agents/skills/principal-architect-workspace/e-d-editor-design/EDITOR-DESIGN.md) §8): the panel keeps declaration order, geometry first* |
| **Palette metadata** | Display name, category, icon per element | **Done (0.5; icons done, 0.6)** — *2026-10-31: `label`, `category` and `description` on `<api>` ([design_spec.md §13.1](design_spec.md)); the Palette files by category and shows the label and description. 2026-11-10: `icon` on `<api>`, which every framework manifest declares; a tile shows its element's icon, else its category's* |
| **Conditional property visibility** | `visible_when` — `scroll_px_per_sec` is meaningless unless `long_mode` scrolls ([D-19]). Tracked as [Q-7] | **Declined at C4** — *2026-10-31 ([EDITOR-DESIGN.md](../.agents/skills/principal-architect-workspace/e-d-editor-design/EDITOR-DESIGN.md) §8): every prop shows* |
| **Editor-target generation** | Manifests must generate a registry and property thunks for the `editor` target as well as setters for `firmware` ([UD-4]) | **Must add to PR-04 scope** — *2026-10-26: done, fixture-bound; E-1d makes it project-driven* |
| **Sample data** | Named sets of design-time subject values, including collection rows. Never compiled | **Must add** ([U-6]) — *2026-10-26: not in schema 0.4; E-3's, outside the schema (E-D's leaning: `samples/*.json`). 2026-11-17: [U-6] closed by S1, `samples/<set>.json` outside the schema (§11); a collection's row shape is schema 0.7's `<data>` (design_spec §6.5). 2026-11-24: settled; E-3b specified the format, its checks and the view (§11)* |
| **Stable element identity** | The editor must address elements across edits | **Settled** ([U-1], PR-03). `name` is required. The CLI errors on a missing name; the editor generates one and persists it on save |
| **Round-trip fidelity** | Comments, attribute order and whitespace preserved. Not a schema feature but a parser contract ([UD-3]) | **Must state** — *2026-10-26: no CST exists yet; E-1a delivers it* |
| **Editor view state** | Zoom, selection, panel sizes, active sample set | **Sidecar** `.u8g2gl-editor.json`, *not* project XML — per-user, and would otherwise make every pan a source-control change |

---

## 16. Open Questions

| ID | Question | Blocks |
|---|---|---|
| **U-7** | Does the palette support user-authored categories, or is the taxonomy fixed? | Phase 3 |

*(**U-1** closed in PR-03 — see §16.1. **U-3** closed 2026-11-14, E-2k1: a switcher on one canvas, see below. **U-6** closed 2026-11-17, E-3: see below.)*

**`[U-6]` Where sample data lives — closed 2026-11-17 (E-3, the owner's decision S1).** In `samples/<set>.json` in the project: shared through source control, read by the designer and by test runs, ignored by `generate`, and outside the schema (§11). JSON, because it is data, never compiled, and what a live feed produces. The active set is per-browser view state. The format, specified by E-3b, is in §11.1, and `validate` ignores `samples/` as `generate` does. Collection rows no longer wait on PR-08: E-3a delivered the editor's fill path (design_spec §9.4).

**`[U-3]` Multi-target — closed 2026-11-14 (E-2k1, the owner's decision D1).** One canvas with a target switcher in the status bar (§6.4). The canvas, inserts, the impact preview and any budget figure follow the active target, which is per-browser view state and never written to the XML; a missing or renamed target falls back to the first. [Q-1], per-target overrides in the screen files, is unaffected: the switcher shows each target as its display resolves it.

### 16.1 `[U-1]` Element identity — closed, PR-03

**`name` is required on every element. The CLI errors when one is missing; the
editor generates one and writes it into the document.**

The split is by *journey*, not by command, and the reason is that **auto-correction
requires a human who can see it and undo it**. The editor has a canvas, a property
panel, an undo stack and a save cycle. A build pipeline has none of those — if the
build invents identity it does so silently, into generated code, in CI, with nobody
looking.

**Why not synthetic ids.** Any identity derived from document position is unstable
under insertion. Generated code binds to the name, so a name that renumbers when an
element is inserted above it silently rebinds the user's application code to a
different widget, with no diagnostic. Auto-generation is therefore only safe where it
is *persisted* — which is what the editor does and the build refuses to.

**Mechanism.** The policy is a parameter on the parser (`'error' | 'generate'`,
defaulting to `'error'`) rather than a branch, because `src/core/` is isomorphic and
serves both journeys; branching would let them drift into two implementations.
Write-back inserts a `name="…"` attribute at the element's recorded source location,
so it needs no serializer and preserves comments, attribute order and whitespace —
which is also how `[UD-3]` round-trip fidelity is satisfied for this case. `u8g2gl
validate --fix-names` exposes the same mechanism to the CLI as an explicit opt-in:
the build never *silently* invents identity, but the user may ask it to.

**Requirement on the editor.** Generate names on load so a hand-authored file opens,
but persist them on **save**, not on open — opening a file to look at it must not
rewrite it.

---

## Appendix A — Platform Research

**Eclipse Theia**
- LVGL Pro Editor is built on it — `.theia/launch.json` appears in its generated project directories. Its preview uses `preview-bin/lved-runtime.wasm`, the LVGL runtime compiled to WebAssembly, independently validating [D-9].
- Not a VS Code fork: an independent TypeScript framework embedding Monaco, with a compile-time extension API.
- **EPL-2.0.** Closed-source commercial products permitted; the obligation is upstreaming changes to Theia *core* only.
- Embedded-tooling adopters: Arduino IDE 2.0, Arm Mbed Studio, TI Code Composer Studio, STMicroelectronics STM32CubeMX2 (2026), Samsung Sokatoa (2026).
- **Browser-only mode** merged January 2024 (v1.46); still **MVP as of the 2026-05 community release**. Syntax highlighting explicitly not planned — *"just as much work as adding real support for VS Code extensions."* Plugins are backend-only.

**Monaco** — VS Code's editor standalone; built-in XML tokenisation without VS Code extensions; positioned for embedding a DSL editor or a focused browser IDE "without the overhead".

**LVGL Pro, other** — the CLI splits `compile --target editor|cli`, the editor consuming a runtime the CLI builds. Adopted as [UD-4]. `<previews>` and `help=` are the two editor-facing schema features it carries that ours lacks (§15).

Sources: [Theia FAQ](https://theia-ide.org/docs/faq/) · [Theia Platform](https://theia-ide.org/theia-platform/) · [Eclipse Theia project](https://projects.eclipse.org/projects/ecd.theia) · [Browser-only Theia PR #12853](https://github.com/eclipse-theia/theia/pull/12853) · [Running Theia without a backend](https://eclipsesource.com/blogs/2024/01/29/running-eclipse-theia-without-a-backend/) · [Theia Community Release 2026-05](https://eclipsesource.com/blogs/2026/06/19/the-eclipse-theia-community-release-2026-05/) · [TypeFox — Custom IDEs](https://www.typefox.io/cloud-and-desktop-ides/)
