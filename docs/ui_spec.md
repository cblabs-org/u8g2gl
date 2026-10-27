# U8G2GL Designer — UI Specification

**The visual designer for U8G2GL: functionality, architecture and layout.**

**Version**: 1.1
**Date**: September 2026
**Status**: Settled. All seven editor decisions are closed; three questions remain open (§16) after `[U-1]` closed in PR-03 (§16.1). §15's schema requirements gate PR-04 — 'editor-target generation' is named there as PR-04 scope.
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

1. **Lean, not comprehensive.** A monochrome screen has 5–20 elements. The tool should feel proportionate to that.
2. **Familiar layout, minimal machinery.** Adopt the VS Code *paradigm* — activity bar, sidebars, tabbed editor, bottom panel, status bar — because it is instantly legible. Do not adopt an IDE platform to get it ([UD-1]).
3. **Two views of one document.** Canvas and XML are the same thing seen differently. Selection, edits and errors are shared, live and bidirectional. This is the defining behaviour.
4. **Pixel-exact by default.** Every position is an integer, always visible, always nudgeable.
5. **The XML stays authored.** Round-trip preserves comments, ordering and formatting. The editor is a *co-author*, not the file's owner.
6. **The property panel teaches.** Every property carries its description, its consequence and its constraints inline. This is the gap in the incumbent tools and the main reason to build another.
7. **One editing surface, three contexts, four supporting panels.** Beyond that needs a case (§14).

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
                          load   │               ▲  save (debounced)
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
│A │                   │ ┌──────────────┬───────────────┐ │                 │
│C │  ▾ Screens        │ │              │               │ │ u8g2gl_clock    │
│T │    ▸ home         │ │   CANVAS     │  XML (Monaco) │ │ name: clock     │
│I │      settings     │ │              │               │ │ ─── Geometry ───│
│V │  ▾ Elements       │ │  ┌────────┐  │ <screen ...   │ │ x [216] y [  0] │
│I │      status_bar   │ │  │        │  │   <u8g2gl_cl..│ │ w [ 40] h [ 11] │
│T │  ▾ Widgets        │ │  │ 256×64 │  │     x="216"   │ │ ⓘ right="0" set │
│Y │      wd_list      │ │  │        │  │     ...       │ │ ── Appearance ──│
│  │  ▾ Assets         │ │  └────────┘  │               │ │ font [clock_7 ▾]│
│B │      fonts        │ │              │               │ │ ⓘ 7px, 11 glyphs│
│A │      images       │ │ ⊞grid ⊡tile  │               │ │ ─── Binding ────│
│R │  ▾ Subjects       │ │ 4× ▾  ▶ anim │               │ │ bind_time [sys▾]│
│  │  ▾ Sample data    │ │              │               │ │ blink [✓]       │
│  │      ● typical    │ └──────────────┴───────────────┘ │                 │
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
| **Primary sidebar** | Context-dependent. Explorer shows the project tree; Palette shows draggable widgets grouped by category |
| **Editor area** | Tabs per document. Default split: canvas ∥ XML. Either pane collapsible; ratio draggable and remembered |
| **Property panel** | Selection properties, grouped. With nothing selected, shows screen-level properties |
| **Bottom panel** | Problems · Output · Budget. Collapsible; auto-opens to Problems on a failed build |
| **Status bar** | Build state and duration · active target · selection geometry · zoom · RAM total |

**Selection geometry lives permanently in the status bar.** F2 depends on knowing exact coordinates without opening anything.

**Responsive behaviour.** Below roughly 1200px the property panel collapses to an icon rail and expands on selection; below 900px the XML pane collapses by default, leaving the canvas. The tool assumes a desktop-class screen — this is not a mobile target.

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

**Selection.** Click selects; repeated clicks cycle down through overlaps; marquee selects many; Esc clears. Selected elements show handles and a live `x, y, w, h` badge.

**Movement.**

| Input | Effect |
|---|---|
| Drag | Move, snapping to guides |
| Arrow | **1 px** |
| Shift + arrow | 8 px (one tile) |
| Alt + drag | Duplicate |
| Drag handle | Resize; Shift constrains ratio |
| Property field | Exact value; steppers ±1 |

**Alignment.** Edge and centre guides against siblings and display bounds appear during drag, with a snap threshold of 3 *screen* pixels — not device pixels, so it stays usable at 1×. Snapping is to integers only; there is no sub-pixel position. An align toolbar (left/centre/right, top/middle/bottom, distribute) acts on multi-selection.

**Overflow is an error.** An element extending past the display is drawn with a hatched indicator and raised in Problems, because §15 requires the generator to reject it.

**Composite instances render inline** but are not editable in place — selecting one selects the instance and offers *Open element*.

**Animation** runs live; the freeze toggle (§4.2) pins t=0.

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

- **Descriptions inline, not on hover.** The manifest's `help` renders as secondary text beneath the control. A non-coding user should never have to hover to discover meaning.
- **Live validation.** A value the compiler would reject is flagged as typed, with the reason.
- **Consequence shown where it is incurred.** Capacity fields display their memory cost (`max_rows 16 → 2.3 KB`) from the §18 budget model, so a costly choice is felt when made rather than at build time.
- **Constraint awareness.** Setting `right` disables `x` with an explanation rather than silently conflicting (§7.2 forbids over-constraint). Setting `bind_text` disables `text`.
- **Binding assistance.** Choosing a subject offers a format string with the correct conversion for its type and rejects mismatches (§8.4).
- **Font feedback.** Selecting a font shows pixel height and glyph coverage, and warns when bound text may exceed the element width at that font.
- **Defaults are visible.** A property at its default renders greyed, gaining a *reset* affordance once overridden, so what has been deliberately set is obvious at a glance.

### 9.3 Grouping

Geometry · Appearance · Content · Binding · Advanced. Order and grouping come from the manifest, so widget authors control their own panel. Advanced collapses by default.

### 9.4 Multi-selection

Shared properties show a common value or a mixed indicator; editing applies to all. Geometry shows the bounding box, with align and distribute acting on the set.

---

## 10. The XML Editor

Monaco, configured for this schema.

- **Schema-driven completion** — valid elements and attributes at the cursor from PR-02's schema, including enum values and declared font, image and subject names.
- **Inline diagnostics** — [D-16] JSON mapped to markers; hovers carry the suggestion.
- **Two-way selection sync** (§4.3).
- **Go to definition** on an element tag, font, image, style or subject name.
- **Format on demand only, never on save** — formatting belongs to the author (principle 5).
- **Breadcrumbs** showing the element path at the caret.

**Round-trip is non-negotiable.** A canvas nudge must produce a one-line diff. Comments, blank lines, attribute order and indentation elsewhere survive untouched. This constrains implementation ([UD-3]) and is the requirement most likely to be quietly compromised under delivery pressure — hence its restatement here.

---

## 11. Sample Data

**Design-time values for bindings.** Without them the canvas renders empty labels and a layout cannot be judged.

This matters more in monochrome than in colour UI because **layout is length-dependent**: an 8-character station name and a 30-character one differ in whether text fits, scrolls or truncates. Designing against empty strings produces layouts that break on real data.

- A **sample set** supplies a value per subject. Multiple named sets per project.
- Conventional sets, offered on project creation: **typical**, **empty**, **longest plausible**, **worst case**.
- Collection widgets (§9) take sample rows, so tables and lists render realistically. *Corrected 2026-10-26 (E-D):* this said "collection subjects", but [D-8] makes collections **not** subjects. How rows reach a widget at design time is PR-08's to decide; E-D requires that a declared-capacity collection be fillable by name through the editor registry ([implementation_plan.md](implementation_plan.md) §5, PR-08).
- Switchable from the canvas toolbar and cycleable by keyboard, so a layout can be swept against every set in seconds.
- **Never compiled** ([UD-6]).

An element bound to a subject with no sample value renders a visible placeholder rather than blank, so the omission is obvious rather than silent.

---

## 12. Fonts and Assets

**Font browser** (F8). Glyph grid for a selected font; metrics for a chosen glyph — width, ascent, descent, bounding box. A **string ruler**: type a string, see its rendered width in pixels against a target width. Answers "does this fit in 40 pixels?" before a layout depends on it. Read-only in v1.

**Glyph / BDF pixel editor.** Draw and edit glyphs — genuinely useful for the icon fonts monochrome projects rely on. **Scoped after the first editor release** ([design_spec.md §20](design_spec.md) Phase 4): the browser answers the common question, and authoring glyphs is a separate tool with its own surface.

**Assets.** Import PNG/XBM; preview at 1:1 with the threshold/dither choice (§14.2) shown beside its result, since that choice is visual and belongs next to its outcome.

---

## 13. Build, Problems and Budget

**Continuous validation** as you type; **build** on demand.

- **Problems** — severity, file, line, column, message, suggestion. Click to navigate. Sorted by severity then position; filterable by severity and file.
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
| Cross-file undo | Per-document undo only. Large problem, narrow benefit |
| Firmware build / flashing | The user's toolchain does this |

---

## 15. Schema Requirements — gates PR-02

*Status, 2026-10-26 (E-D).* PR-02's deadline passed without most of this table. Schema 0.4 has `help=` and nothing else here that is schema surface; whether the rest was deferred or missed is not recorded. The status notes below say where each now stands. Adding schema surface is the owner's decision ([.agents/rules/03-versioning.md](../.agents/rules/03-versioning.md)), and E-D recommends taking it once, at checkpoint C4, with E-2's panel in front of the decision.

**This section has a deadline.** PR-02 freezes schema 0.3. The schema must be an editor's document model first and a compiler input second ([design_spec.md §1.2](design_spec.md)): a compiler can ignore what it does not need, but an editor cannot invent what was never stored. Risk R-8 tracks this.

| Requirement | Detail | Status |
|---|---|---|
| **`<previews>`** | Named preview configurations per element — size and context for isolated rendering (§7.2) and palette thumbnails. Present in LVGL Pro; dropped from ours as "editor-only" | **Must add** — *2026-10-26: not in schema 0.4; to be decided together at checkpoint C4 ([EDITOR-DESIGN.md](../.agents/skills/principal-architect-workspace/e-d-editor-design/EDITOR-DESIGN.md) §8)* |
| **`help` on every `<prop>`** | Inline description text. The core of principle 6 | **Must formalise** — *2026-10-26: done, schema 0.4* |
| **Property grouping and order** | `group="geometry\|appearance\|content\|binding\|advanced"`; declaration order drives panel order | **Must add** — *2026-10-26: not in schema 0.4; to be decided together at checkpoint C4 ([EDITOR-DESIGN.md](../.agents/skills/principal-architect-workspace/e-d-editor-design/EDITOR-DESIGN.md) §8)* |
| **Palette metadata** | Display name, category, icon per element | **Must add** — *2026-10-26: not in schema 0.4; to be decided together at checkpoint C4 ([EDITOR-DESIGN.md](../.agents/skills/principal-architect-workspace/e-d-editor-design/EDITOR-DESIGN.md) §8)* |
| **Conditional property visibility** | `visible_when` — `scroll_px_per_sec` is meaningless unless `long_mode` scrolls ([D-19]). Tracked as [Q-7] | **Must add** — *2026-10-26: not in schema 0.4; to be decided together at checkpoint C4 ([EDITOR-DESIGN.md](../.agents/skills/principal-architect-workspace/e-d-editor-design/EDITOR-DESIGN.md) §8)* |
| **Editor-target generation** | Manifests must generate a registry and property thunks for the `editor` target as well as setters for `firmware` ([UD-4]) | **Must add to PR-04 scope** — *2026-10-26: done, fixture-bound; E-1d makes it project-driven* |
| **Sample data** | Named sets of design-time subject values, including collection rows. Never compiled | **Must add** ([U-6]) — *2026-10-26: not in schema 0.4; E-3's, outside the schema (E-D's leaning: `samples/*.json`)* |
| **Stable element identity** | The editor must address elements across edits | **Settled** ([U-1], PR-03). `name` is required. The CLI errors on a missing name; the editor generates one and persists it on save |
| **Round-trip fidelity** | Comments, attribute order and whitespace preserved. Not a schema feature but a parser contract ([UD-3]) | **Must state** — *2026-10-26: no CST exists yet; E-1a delivers it* |
| **Editor view state** | Zoom, selection, panel sizes, active sample set | **Sidecar** `.u8g2gl-editor.json`, *not* project XML — per-user, and would otherwise make every pan a source-control change |

---

## 16. Open Questions

| ID | Question | Blocks |
|---|---|---|
| **U-3** | Multi-target — one canvas per target, or a switcher on one canvas? Depends on [Q-1] | Phase 3 |
| **U-6** | Where does sample data live — a `samples/` document in the project, or a sidecar? Project-shared argues for the former; never-compiled argues for separation *E-D, 2026-10-26 ([EDITOR-DESIGN.md](../.agents/skills/principal-architect-workspace/e-d-editor-design/EDITOR-DESIGN.md) §7):* E-3's to decide. Leaning only: a project file outside the schema (`samples/*.json`), read by the designer and ignored by `generate`. Sample data for collections waits on PR-08 (EDITOR-DESIGN §9). | PR-02 |
| **U-7** | Does the palette support user-authored categories, or is the taxonomy fixed? | Phase 3 |

*(**U-1** closed in PR-03 — see §16.1.)*

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
