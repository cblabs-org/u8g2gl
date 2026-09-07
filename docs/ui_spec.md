# U8G2GL Designer — UI Specification

**The visual designer for U8G2GL. Functionality and layout requirements.**

**Version**: 0.1 Draft
**Date**: September 2026
**Status**: Design input — this document briefs visual design work; it is not an implementation spec
**Companion documents**: [design_spec.md](design_spec.md) (the framework) · [concept.md](concept.md) (why) · [implementation_plan.md](implementation_plan.md) (sequencing)

---

## 1. Purpose

The designer is the point of the U8G2GL programme ([design_spec.md §1.2](design_spec.md)). The schema, generator, runtime and Wasm renderer are infrastructure that exists to make it possible.

Monochrome UI work is **pixel work**. On a 128×64 panel an element one pixel out is visible and wrong, and fixing it is direct manipulation — nudge, align, compare — not description. The designer's job is to make that manipulation fast, exact, and reversible.

This document defines *what the tool does* and *how it is laid out*. It does not specify visual styling; that is the design work this briefs.

---

## 2. Design Principles

1. **Lean, not comprehensive.** SquareLine Studio is the cautionary reference — capable but over-complex for this domain. A monochrome screen has 5–20 elements. The tool should feel proportionate to that.
2. **Familiar layout, minimal machinery.** Adopt the VS Code *paradigm* — activity bar, sidebars, tabbed editor area, bottom panel, status bar — because it is instantly legible to the target user. Do not adopt a full IDE platform to get it (§4).
3. **Two views of one document.** The canvas and the XML are the same thing seen differently. Selection, edits and errors are shared between them, live and bidirectionally. This is the tool's defining behaviour.
4. **Pixel-exact by default.** Every position is an integer, always visible, always nudgeable. Nothing is approximate.
5. **The XML stays authored, not generated.** Round-trip must preserve what a human wrote — comments, ordering, formatting. The editor is a *co-author* of the file, not its owner.
6. **Five surfaces, no more.** XML editor, visual canvas, property panel, compiler output, font/glyph tools. Anything else needs a case (§10).

---

## 3. What the User Does With It

Five flows define the tool. If these are fluent, it works.

**F1 · Lay out a screen.** Open a project, pick a screen, drag widgets from the palette onto the canvas, position them exactly, set properties. Save. The XML on disk is what the compiler consumes.

**F2 · Adjust an existing screen precisely.** Select an element — on canvas or in XML — and move it a pixel at a time. Watch the coordinate readout. Align it to a neighbour. This is the most-repeated action in the tool and must be the fastest.

**F3 · Bind data.** Pick an element, choose a subject to bind a property to, set a format string. See the preview render with placeholder or live values.

**F4 · Build and fix.** Compile. Errors appear as inline squiggles in the XML and as rows in a Problems panel, each carrying file, line, column and a suggestion. Click a row, land on the fault.

**F5 · Work with fonts and glyphs.** Browse what a font contains, check a glyph's metrics, confirm a string fits a width before committing to a layout.

---

## 4. Platform

**A web application. Monaco for text editing. A custom lightweight shell for layout. Not a VS Code fork, and not Eclipse Theia.**

*Research basis.* LVGL Pro Editor is built on **Eclipse Theia** — confirmed by the `.theia/launch.json` in its generated project directories. Theia is not a VS Code fork; it is an independent TypeScript framework that embeds Monaco and offers a compile-time extension API for building full IDEs. Its preview runs the real LVGL runtime compiled to WebAssembly (`preview-bin/lved-runtime.wasm`), which independently validates the [D-9] architecture already chosen for U8G2GL.

Theia is nonetheless the wrong choice here, for the same reason forking VS Code is: it is an *IDE platform*, and we need an *application*. The value being borrowed is the layout paradigm and the editing experience, not extensibility, plugin hosting or a workspace model. Monaco supplies the editing experience directly and, per its own positioning, lets a product "build focused, browser-based IDEs without the overhead" with fine-grained control over UX.

| Concern | Choice | Why |
|---|---|---|
| Text editing | **Monaco** | VS Code's editor as a standalone component. Brings XML syntax highlighting, completion, inline diagnostics, find/replace, multi-cursor — all expected, none worth rebuilding |
| Layout shell | **Custom, lightweight** | Panels, splitters, tabs. A few hundred lines against a full IDE framework |
| Canvas rendering | **Wasm renderer from PR-06** | The real runtime, pixel-exact. Same binary as the snapshot tests, so preview and firmware cannot diverge |
| Compilation | **The CLI**, invoked by the app | One implementation, already specified ([D-10], [D-16]) |

Monaco's completion and diagnostics are schema-driven: the XSD/JSON-Schema from PR-02 supplies autocomplete, and [D-16]'s structured `--json` diagnostics become squiggles and Problems rows without a second diagnostic format.

---

## 5. Layout

VS Code's regions, adapted. Nothing here is novel, which is the point.

```
┌──┬───────────────────┬──────────────────────────────────┬─────────────────┐
│  │ PRIMARY SIDEBAR   │  EDITOR AREA (tabbed, splittable)│ PROPERTY PANEL  │
│A │                   │ ┌──────────────┬───────────────┐ │                 │
│C │  ▸ Screens        │ │              │               │ │  Element: clock │
│T │    home.xml       │ │   CANVAS     │  XML (Monaco) │ │ ─────────────── │
│I │    settings.xml   │ │              │               │ │  Geometry       │
│V │  ▸ Components     │ │  ┌────────┐  │  <screen ...  │ │   x [216] y [0] │
│I │    status_bar     │ │  │        │  │    <u8g2gl_.. │ │   w [ 40] h [11]│
│T │  ▸ Widgets        │ │  │ 256×64 │  │      x="216"  │ │  ─────────────  │
│Y │  ▸ Assets         │ │  │        │  │      ...      │ │  Appearance     │
│  │    fonts          │ │  └────────┘  │               │ │   font [clock_7]│
│B │    images         │ │              │               │ │   align [left ▾]│
│A │  ▸ Subjects       │ │   ⊞ grid  4× │               │ │  ─────────────  │
│R │                   │ │              │               │ │  Binding        │
│  │                   │ └──────────────┴───────────────┘ │   bind_time [▾] │
│  │                   │                                  │                 │
├──┴───────────────────┴──────────────────────────────────┴─────────────────┤
│ PANEL:  Problems (3)  │  Build Output  │  Budget                          │
│  ⛔ screens/home.xml:14:32  unknown font 'small_9' — did you mean 'small_09'│
├───────────────────────────────────────────────────────────────────────────┤
│ STATUS BAR:  ● Built  │ default (SSD1322 256×64) │ x:216 y:0 │ 4× │ 1.2 KB │
└───────────────────────────────────────────────────────────────────────────┘
```

### Regions

| Region | Contents | Notes |
|---|---|---|
| **Activity bar** | Explorer, Palette, Assets, Fonts, Search | Icon strip; switches the primary sidebar |
| **Primary sidebar** | Project tree — screens, components, widgets, assets, subjects | Also the widget **palette** when that activity is selected; drag from here to canvas |
| **Editor area** | Tabbed. Each screen opens as a tab, split canvas ∥ XML by default | Split is user-adjustable; either pane can be collapsed |
| **Property panel** | Properties of the current selection, grouped | Right-hand side. Hidden when nothing is selected |
| **Bottom panel** | Problems · Build Output · Budget | Collapsible. Problems is the default tab after a failed build |
| **Status bar** | Build state, active target, cursor/selection coordinates, zoom, RAM figure | Coordinates are always visible — this matters for F2 |

### The split editor is the core

Canvas and XML side by side is the default because F2 depends on it. Selecting on the canvas highlights and scrolls to the corresponding XML element; placing the caret in an element selects it on the canvas. Edits in either propagate immediately.

---

## 6. The Canvas — pixel-exact manipulation

The most important surface. F2 runs through it dozens of times per session.

**Rendering.** The PR-06 Wasm runtime draws the actual framebuffer. Scaled with **nearest-neighbour** — never smoothed, since a blurred 1-bit pixel is a lie about the output.

**Zoom.** 1×, 2×, 4×, 8×, fit. A **pixel grid** appears at 4× and above. An **8-pixel tile grid** is separately toggleable, because tile boundaries are real ([D-14] framebuffer geometry, and partial refresh works in tiles).

**Selection.** Click to select; marquee for multiple. Selected elements show handles and a live `x, y, w, h` readout. Overlapping elements cycle on repeated clicks at the same point, since document order is draw order ([D-4]) and overlap is legal.

**Movement — the precision path.**

| Input | Effect |
|---|---|
| Drag | Move, snapping to guides |
| Arrow key | **1 pixel** |
| Shift + arrow | 8 pixels (one tile) |
| Alt + drag | Duplicate |
| Property panel field | Type an exact value; steppers increment by 1 |

**Alignment aids.** Edge and centre guides against siblings and the display bounds, appearing on drag. Snapping is to integers only — there is no sub-pixel position to snap to. An explicit align toolbar (left/centre/right, top/middle/bottom, distribute) operates on multi-selection.

**Out-of-bounds is an error, not a clip.** An element extending past the display is flagged in Problems, because §15 already requires the generator to reject it.

**Component instances render inline** but are not editable in place — selecting one selects the instance and offers "open component". Consistent with §13.6, where components are inlined at generation time.

---

## 7. The Property Panel

Driven entirely by the `<api>` manifests of [D-17]. The panel has no hardcoded knowledge of widgets — a custom widget with a manifest gets a full property panel for free, which is the same property that lets the generator handle it without a release.

**Editor per type**, from the manifest's `type`:

| Type | Control |
|---|---|
| `int` | Number field with steppers; coordinate fields grouped as x/y/w/h |
| `bool` | Toggle |
| `string` | Text field; multiline where appropriate |
| `enum` | Dropdown, options from `values` |
| `font` | Dropdown of declared fonts, each rendered in its own face |
| `image` | Picker with thumbnails |
| `subject` | Dropdown of declared subjects, filtered to type-compatible ones |
| `style` | Dropdown of styles in scope |

**Helpers are the differentiator.** The `help` attribute already present on `<prop>` becomes inline description text, not a hover-only tooltip. Beyond that:

- **Live validation** — a value that would fail the compiler is flagged as it is typed, not at build
- **Contextual consequence** — capacity properties show their memory cost inline (`max_rows: 16 → 2.3 KB`), from the §18 budget model
- **Binding assist** — choosing a subject offers a format string with the correct conversion for its type, and rejects mismatches (§8.4)
- **Anchor awareness** — setting `right` disables `x` with an explanation, rather than silently conflicting (§7.2 forbids over-constraint)

**Grouping.** Geometry, Appearance, Content, Binding, Advanced. Order comes from the manifest, so widget authors control their own panel.

---

## 8. The XML Editor

Monaco, with:

- **Schema-driven completion** — valid elements and attributes at the cursor, from PR-02's schema
- **Inline diagnostics** — [D-16] JSON mapped to squiggles with hovers carrying the suggestion
- **Two-way selection sync** with the canvas
- **Format on demand**, never on save — formatting is the author's, per principle 5
- **Go to definition** on a component tag, font name or subject name

**Round-trip is a hard requirement.** Editing on the canvas rewrites only the attributes that changed. Comments, blank lines, attribute order and indentation elsewhere in the file survive untouched. A canvas nudge must produce a one-line diff. This constrains the implementation — a parse/serialise cycle that normalises the document is unacceptable — and it is the requirement most likely to be compromised under delivery pressure, so it is stated as non-negotiable here.

---

## 9. Compiler, Fonts and Assets

**Build surface.** A build action, plus automatic validation as you type. Three bottom-panel tabs:

- **Problems** — structured diagnostics: severity, file, line, column, message, suggestion. Click to navigate. Sorted by severity then position.
- **Build Output** — the CLI's raw output, for when something goes genuinely wrong
- **Budget** — the §18 memory report, per target, with over-budget items highlighted. Visible during design rather than after, so a costly choice is felt when it is made

**Font browser** (F5). Grid of glyphs in a selected font; metrics for a chosen glyph (width, ascent, descent); a string-width ruler answering "does this fit in 40 pixels?" before a layout depends on it. Read-only.

**Glyph/BDF pixel editor.** Draw and edit glyphs directly. Genuinely useful for icon fonts, which monochrome projects rely on heavily. **Scoped after the first editor release** ([design_spec.md §20](design_spec.md) Phase 4) — the browser answers the common question; authoring glyphs is a different tool with its own surface.

**Asset management.** Import PNG/XBM, preview at 1:1 with the threshold/dither choice visible (§14.2), since that choice is visual and belongs beside its result.

---

## 10. Deliberately Not In Scope

Per [design_spec.md §1.5](design_spec.md), omission is the default. The following are excluded from the first release, each for a reason:

| Excluded | Why |
|---|---|
| Plugin/extension system | This is an application, not a platform (§4) |
| Integrated terminal, git UI, file manager | The user has an IDE; this is not competing with it |
| Multi-user / real-time collaboration | No demand established; large cost |
| Animation timeline | Animation is widget-internal ([D-5]); nothing to sequence |
| Flex/grid layout tooling | No layout engine exists ([D-7]) |
| `<row>`/`<col>` UI | Not in schema 0.3 (§7.2). Add with the schema feature, if it lands |
| Theme/skin editor | Monochrome. The entire style set is ten properties (§10) |
| Undo across files | Per-document undo only. Cross-file transactional undo is a large problem for narrow benefit |

---

## 11. Schema Requirements — gates PR-02

**This is the section with a deadline.** PR-02 freezes schema 0.3. The schema must be an editor's document model first and a compiler input second ([design_spec.md §1.2](design_spec.md)); a compiler can ignore what it does not need, but an editor cannot invent what was never stored. Risk R-8 in the implementation plan tracks this.

| Requirement | Detail | Status in 0.3 |
|---|---|---|
| **`<previews>`** | Named preview configurations per component/widget — dimensions and context for rendering in isolation in the palette and component editor. Present in LVGL Pro; explicitly skipped in our gap analysis as "editor-only" | **Missing — must add** |
| **`help` on every `<prop>`** | Inline description text in the property panel | Partially present in examples; **must be formalised** |
| **Property grouping and order** | `group="geometry\|appearance\|content\|binding\|advanced"` and declaration order drives panel layout | **Missing — must add** |
| **Palette metadata** | Display name, category, and an icon per widget for the palette | **Missing — must add** |
| **Stable element identity** | The editor must address elements across edits. `name` is optional today; unnamed elements need a stable synthetic identity, or `name` becomes required for editable elements | **Must decide** |
| **Round-trip fidelity** | Comments, attribute order and whitespace preserved through an edit cycle | Not a schema feature, but a **stated contract** the parser must honour |
| **Editor state** | Zoom, last selection, panel sizes, collapsed nodes | **Sidecar file** (`.u8g2gl-editor.json`), *not* in the XML — it is per-user, not per-project, and would otherwise pollute diffs |

The sidecar decision matters: putting view state in the project XML would make every pan and zoom a source-control change. Authored, shared, semantic data (`<previews>`, `help`, grouping) belongs in the XML; per-user view state does not.

---

## 12. Open Questions

| ID | Question | Blocks |
|---|---|---|
| **U-1** | Element identity — require `name` on editable elements, or generate stable synthetic ids? Naming everything is noisy; synthetic ids are fragile across hand-edits | PR-02 schema |
| **U-2** | Does the editor run wholly client-side (Wasm in the browser, File System Access API) or with a local server process invoking the CLI? Affects deployment, and whether it works offline from a static host | Editor architecture |
| **U-3** | Multi-target editing — one canvas per target, or a target switcher on one canvas? Depends on Q-1's resolution | Phase 3 |
| **U-4** | Is component editing in-place, or a separate document context? In-place is nicer and much harder | Phase 3 |

---

## Appendix — Research Notes

- **LVGL Pro Editor is built on Eclipse Theia** — evidenced by `.theia/launch.json` in generated project directories. Its preview uses `preview-bin/lved-runtime.wasm`, the LVGL runtime compiled to WebAssembly, independently validating [D-9].
- **Theia is not a VS Code fork** — an independent TypeScript framework embedding Monaco, with a compile-time extension API for building IDEs.
- **Monaco is the lighter path** for an application that wants VS Code's editing experience without an IDE platform.
- **LVGL Pro's CLI has `compile --target editor|cli`** — the editor consumes a runtime the CLI builds. U8G2GL's CLI needs the same split, which is worth recording against PR-02/PR-06.
- **`<previews>` and `help=`** are the two editor-facing schema features LVGL Pro carries that our schema currently lacks.

Sources: [Theia Platform](https://theia-ide.org/theia-platform/) · [Eclipse Theia project](https://projects.eclipse.org/projects/ecd.theia) · [TypeFox — Custom IDEs](https://www.typefox.io/cloud-and-desktop-ides/)
