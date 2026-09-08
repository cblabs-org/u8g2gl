# U8G2GL Designer — UI Specification

**The visual designer for U8G2GL. Functionality and layout requirements.**

**Version**: 0.3 Draft
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
6. **One editing surface, three contexts, three supporting panels.** The canvas/XML/properties trio is a single surface used for screens, components and the screen-flow graph. Problems-and-budget, fonts, and sample data support it. Anything beyond that needs a case (§12).

---

## 3. What the User Does With It

Eight flows define the tool. If these are fluent, it works. F2 is the one that runs dozens of times a session.

**F1 · Lay out a screen.** Open a project, pick a screen, drag widgets from the palette onto the canvas, position them exactly, set properties. Save. The XML on disk is what the compiler consumes.

**F2 · Adjust an existing screen precisely.** Select an element — on canvas or in XML — and move it a pixel at a time. Watch the coordinate readout. Align it to a neighbour. This is the most-repeated action in the tool and must be the fastest.

**F3 · Bind data.** Pick an element, choose a subject to bind a property to, set a format string. See the preview render with placeholder or live values.

**F4 · Build and fix.** Compile. Errors appear as inline squiggles in the XML and as rows in a Problems panel, each carrying file, line, column and a suggestion. Click a row, land on the fault.

**F5 · Design a component.** Open a component, edit it in isolation against its `<previews>` declaration, set prop defaults, and see what a consumer will get.

**F6 · Check a layout against real data.** Switch sample sets — typical, empty, longest plausible — and confirm the layout survives each. Length-dependent breakage is the most common monochrome layout failure.

**F7 · Wire up navigation.** In the flow view, drag from a button to a screen; the corresponding `<screen_load_event>` is written.

**F8 · Work with fonts and glyphs.** Browse what a font contains, check a glyph's metrics, confirm a string fits a width before committing to a layout.

---

## 4. Platform — Theia evaluated

An earlier draft dismissed Eclipse Theia on the grounds that LVGL Pro uses it and LVGL Pro's editor is weak. **That was guilt by association and it was wrong.** LVGL Pro's deficiency is its property and settings surface — no guidance for a non-coding user — which is an implementation gap, not a platform one. §9 of this document fixes exactly that via [D-17] manifests, and that fix would work on any platform. Theia deserved evaluation on its merits; this section is that evaluation.

### 4.1 Licence — **passes cleanly**

EPL-2.0. Adopters may "use and distribute Theia in your own products, including closed-source commercial offerings." The only obligation is upstreaming modifications **to Theia core**; product-specific code and extensions kept distinct from the platform layer stay yours.

The adopter list is directly relevant to this domain: **Arduino IDE 2.0**, **Arm Mbed Studio**, **TI Code Composer Studio**, and — announced 2026 — **STMicroelectronics STM32CubeMX2** and Samsung's Sokatoa. Embedded-tooling vendors have repeatedly chosen it and shipped.

No conflict with U8G2GL's MIT licence: the runtime and CLI are separate artefacts and stay MIT regardless of what the editor is built on.

### 4.2 Serving — **this is where it fails, and specifically**

Requirement: browser-based, ideally a static client-side app. Theia offers two modes.

| Mode | Backend | Verdict |
|---|---|---|
| **Standard browser** | Node.js server required | Works, but not static hosting |
| **Browser-only** | None — compiles to a static site | Meets the preference on paper; see below |

Browser-only Theia was merged in January 2024 (milestone 1.46) and, as of the **2026-05 community release, remains in MVP state**. Its documented limitations are decisive for us rather than incidental:

- **Syntax highlighting is not supported, and is not planned.** The maintainers' position: *"dedicated syntax highlighting won't be supported for the browser-only mode, as it's just as much work as adding real support for VS Code extensions."*
- **Plugins are exclusively backend-handled** — metadata collection and deployment both — so the extension mechanism is unavailable.
- Any Theia or VS Code API routed through the backend does not work.

Syntax highlighting in an XML editor is not a nice-to-have here; it is the surface the user spends most of their time in (§3 F1, F4). A static Theia deployment cannot provide it, and the project has said it will not.

**So the choice is not "Theia vs Monaco" — it is "Theia with a Node backend" vs "static client-side app".**

And a static client-side app turns out to be genuinely achievable, for a reason that falls out of an earlier decision. **[D-10] made the CLI TypeScript.** The schema, validator and generator are therefore isomorphic — the same code runs in Node and in a browser, unmodified. Combined with the Wasm renderer (PR-06) and `bdfconv` compiled to Wasm ([Q-2]), the entire pipeline runs client-side:

| Need | Client-side solution |
|---|---|
| Parse, validate, generate | The PR-02/PR-04 TypeScript, run in-browser |
| Render pixel-exactly | PR-06 Wasm runtime |
| Compile fonts | `bdfconv` via Wasm ([Q-2]) |
| Read/write project files | File System Access API |
| Edit XML with highlighting | Monaco standalone |

This is a benefit of [D-10] that was not articulated when it was taken.

### 4.3 Rapid rendering pipeline — **roughly a wash**

Both can host a canvas driven by the Wasm renderer at interactive rates. Theia's Lumino widget system accommodates a custom canvas view; a custom shell has less between the app and the canvas. No fundamental barrier either way, a slight edge to the custom shell for control over the render loop.

### 4.4 Decision

**Monaco plus a custom shell, served as a static client-side application.**

Not because Theia is unsuitable — it is production-grade and its embedded-tooling pedigree is a genuine point in its favour — but because the specific mode that meets the static-hosting requirement is the one mode that cannot give us a syntax-highlighted XML editor.

**The stack:**

| Layer | Choice | Note |
|---|---|---|
| Language | TypeScript | Matches [D-10]; the CLI's schema, validator and generator run unmodified in-browser |
| UI framework | React | First-class bindings for Monaco and the layout libraries |
| Panel layout | **Dockview** | TS-native, zero-dependency, VS Code-style docking. Confirm during implementation; `golden-layout` and `react-mosaic` are the fallbacks |
| Text editor | Monaco | |
| Canvas | PR-06 Wasm runtime | |
| Build | Vite | |

**Correcting an overstatement in the previous draft:** I described the shell as "a few hundred lines". That is wrong. An IDE-style layout with dockable panels, splitters and tabs is a real component, and the sane route is an existing layout library — **Dockview**, **golden-layout** or **react-mosaic** — rather than hand-rolling. Budget it as a meaningful piece of work, not a trivial one. It remains far smaller than adopting an IDE platform.

**This is not a one-way door.** If a desktop application is wanted later, Theia plus Electron is the natural path and the domain logic — schema, generator, renderer — is platform-independent by construction. Revisit if the static constraint relaxes, or if browser-only Theia gains highlighting.

### 4.5 Filesystem — one interface, two implementations

A project is a folder of many files and the editor must write back in place, so a filesystem capability is required rather than optional.

It should not be a binary choice. **[D-10] already requires Node for the CLI**, so a local server costs no additional install — `npx u8g2gl design` is the same pattern as Vite or Storybook, and is familiar to embedded developers.

| Mode | Mechanism | Trade |
|---|---|---|
| **Static** | File System Access API — `showDirectoryPicker()`, persistent handles | Zero install, runs from a URL. Chromium only |
| **Served** | `npx u8g2gl design` over localhost | Every browser; trivial file access; CLI invocation built in |

The editor programs against a single `ProjectFileSystem` interface and selects an implementation at runtime. Same frontend either way. This dissolves [U-5] rather than forcing a browser-support decision, and it preserves the static-hosting goal without making it a constraint that breaks Firefox and Safari users.

*Consequence:* the generated-output question also resolves. In served mode the CLI writes `generated/`; in static mode the in-browser generator does, through the same interface.

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

## 6. Document Contexts

The canvas/XML/properties surface operates in three contexts. Switching context changes what is edited, not how.

### 6.1 Screen context
The default. A screen's `<view>`, its elements positioned against the active target's display bounds.

### 6.2 Component context
Editing a `<component>` or a Tier-4 widget's `<api>`. Rendered in isolation against its `<previews>` declaration rather than a full display, since a component has no inherent screen position.

- **Components (Tier 3)** are fully editable — layout, properties, `<api>` props, and defaults.
- **Custom widgets (Tier 4)** expose their `<api>` manifest and a preview only. Their rendering is C++ ([D-6]) and the editor cannot show or edit it — it renders whatever the compiled Wasm runtime draws. The panel states this rather than appearing broken.

Prop defaults drive the preview, so a component author sees what a consumer will get.

### 6.3 Screen-flow context
A read-write graph view of navigation. Nodes are screens; edges are `<screen_load_event>` and `<screen_back_event>` declarations that already exist in the XML (§12.3).

Dragging an edge from a focusable element to a screen writes the corresponding event; deleting one removes it. **This adds no framework capability** — it is a projection of declarations §12 already supports, which is what keeps it cheap.

Explicitly *not* in this view:

| Excluded | Reason |
|---|---|
| **Carousel configuration** | `CarouselEngine` and `BoardCatalog` are esp32-app-foundation concepts. Encoding one consumer's navigation policy into a general framework is the heritage anchoring [A-1] rejects. Belongs in `modules/U8G2GLDisplay` |
| **Modals / overlays** | Not a framework feature yet. Requires overlay rendering, z-order beyond document order ([D-4]), a focus stack and dismissal semantics — a `[D-n]` decision and runtime work in PR-01/PR-03 before an editor could expose it. Recorded as a future request, not designed for now |

---

## 7. Sample Data

**Design-time values for bindings.** Without them the canvas renders empty labels, and a layout cannot be judged.

This matters more in monochrome than in colour UI because **layout is length-dependent**: an 8-character station name and a 30-character one differ in whether the text fits, scrolls or truncates. Designing against empty strings produces layouts that break on real data.

- A named **sample set** supplies a value per subject; the canvas renders against the active set.
- Multiple sets per project — *typical*, *empty*, *longest plausible*, *worst case* — switchable from the canvas toolbar so a layout can be checked against each.
- Collection subjects (§9) take sample rows, so tables and lists render realistically.
- **Never compiled.** Sample data is design-time only and must not reach firmware.

*Schema consequence in §13.*

---

## 8. The Canvas — pixel-exact manipulation

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

## 9. The Property Panel

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

## 10. The XML Editor

Monaco, with:

- **Schema-driven completion** — valid elements and attributes at the cursor, from PR-02's schema
- **Inline diagnostics** — [D-16] JSON mapped to squiggles with hovers carrying the suggestion
- **Two-way selection sync** with the canvas
- **Format on demand**, never on save — formatting is the author's, per principle 5
- **Go to definition** on a component tag, font name or subject name

**Round-trip is a hard requirement.** Editing on the canvas rewrites only the attributes that changed. Comments, blank lines, attribute order and indentation elsewhere in the file survive untouched. A canvas nudge must produce a one-line diff. This constrains the implementation — a parse/serialise cycle that normalises the document is unacceptable — and it is the requirement most likely to be compromised under delivery pressure, so it is stated as non-negotiable here.

---

## 11. Compiler, Fonts and Assets

**Build surface.** A build action, plus automatic validation as you type. Three bottom-panel tabs:

- **Problems** — structured diagnostics: severity, file, line, column, message, suggestion. Click to navigate. Sorted by severity then position.
- **Build Output** — the CLI's raw output, for when something goes genuinely wrong
- **Budget** — the §18 memory report, per target, with over-budget items highlighted. Visible during design rather than after, so a costly choice is felt when it is made

**Font browser** (F5). Grid of glyphs in a selected font; metrics for a chosen glyph (width, ascent, descent); a string-width ruler answering "does this fit in 40 pixels?" before a layout depends on it. Read-only.

**Glyph/BDF pixel editor.** Draw and edit glyphs directly. Genuinely useful for icon fonts, which monochrome projects rely on heavily. **Scoped after the first editor release** ([design_spec.md §20](design_spec.md) Phase 4) — the browser answers the common question; authoring glyphs is a different tool with its own surface.

**Asset management.** Import PNG/XBM, preview at 1:1 with the threshold/dither choice visible (§14.2), since that choice is visual and belongs beside its result.

---

## 12. Deliberately Not In Scope

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
| Carousel configuration | An esp32-app-foundation concept, not a framework one (§6.3) |
| Modals / overlays | Not a framework capability yet — needs a `[D-n]` decision and runtime work first (§6.3) |
| Undo across files | Per-document undo only. Cross-file transactional undo is a large problem for narrow benefit |

---

## 13. Schema Requirements — gates PR-02

**This is the section with a deadline.** PR-02 freezes schema 0.3. The schema must be an editor's document model first and a compiler input second ([design_spec.md §1.2](design_spec.md)); a compiler can ignore what it does not need, but an editor cannot invent what was never stored. Risk R-8 in the implementation plan tracks this.

| Requirement | Detail | Status in 0.3 |
|---|---|---|
| **`<previews>`** | Named preview configurations per component/widget — dimensions and context for rendering in isolation in the palette and component editor. Present in LVGL Pro; explicitly skipped in our gap analysis as "editor-only" | **Missing — must add** |
| **`help` on every `<prop>`** | Inline description text in the property panel | Partially present in examples; **must be formalised** |
| **Property grouping and order** | `group="geometry\|appearance\|content\|binding\|advanced"` and declaration order drives panel layout | **Missing — must add** |
| **Palette metadata** | Display name, category, and an icon per widget for the palette | **Missing — must add** |
| **Stable element identity** | The editor must address elements across edits. `name` is optional today; unnamed elements need a stable synthetic identity, or `name` becomes required for editable elements | **Must decide** |
| **Round-trip fidelity** | Comments, attribute order and whitespace preserved through an edit cycle | Not a schema feature, but a **stated contract** the parser must honour |
| **Sample data** | Named sets of design-time subject values, including rows for collections. Design-time only — never compiled. Best as a separate `samples/` document or sidecar, since it is project-shared but not firmware-bound | **Missing — must add** |
| **Editor state** | Zoom, last selection, panel sizes, collapsed nodes | **Sidecar file** (`.u8g2gl-editor.json`), *not* in the XML — it is per-user, not per-project, and would otherwise pollute diffs |

The sidecar decision matters: putting view state in the project XML would make every pan and zoom a source-control change. Authored, shared, semantic data (`<previews>`, `help`, grouping) belongs in the XML; per-user view state does not.

---

## 14. Open Questions

| ID | Question | Blocks |
|---|---|---|
| **U-1** | Element identity — require `name` on editable elements, or generate stable synthetic ids? Naming everything is noisy; synthetic ids are fragile across hand-edits | PR-02 schema |
| ~~U-2~~ | Client-side vs local server | **Resolved** — one `ProjectFileSystem` interface, two implementations (§4.5). Static via File System Access API, served via `npx u8g2gl design` |
| **U-3** | Multi-target editing — one canvas per target, or a target switcher on one canvas? Depends on Q-1's resolution | Phase 3 |
| ~~U-4~~ | Component editing in-place vs separate context | **Resolved** — a separate document context (§6.2), rendered against `<previews>` |
| ~~U-5~~ | Chromium-only File System Access API | **Resolved by §4.5** — the served mode covers Firefox and Safari at no extra install cost, since [D-10] already requires Node |
| **U-6** | Where does sample data live — a `samples/` document in the project, or a sidecar? Project-shared argues for the former; never-compiled argues for clear separation | PR-02 schema |

---

## Appendix — Research Notes

**Eclipse Theia**
- LVGL Pro Editor is built on it — evidenced by `.theia/launch.json` in generated project directories. Its preview uses `preview-bin/lved-runtime.wasm`, the LVGL runtime compiled to WebAssembly, independently validating [D-9].
- Not a VS Code fork: an independent TypeScript framework embedding Monaco, with a compile-time extension API.
- **EPL-2.0.** Closed-source and commercial products permitted; obligation is upstreaming changes to Theia *core* only.
- Production adopters in embedded tooling: Arduino IDE 2.0, Arm Mbed Studio, TI Code Composer Studio, STMicroelectronics STM32CubeMX2 (2026), Samsung Sokatoa (2026).
- **Browser-only mode** merged January 2024 (v1.46); still **MVP as of the 2026-05 community release**. Syntax highlighting explicitly not planned — *"just as much work as adding real support for VS Code extensions."* Plugins are backend-only.

**Monaco**
- VS Code's editor as a standalone component; built-in tokenisation for XML without requiring VS Code extensions.
- Positioned for embedding a DSL editor or building a focused browser IDE "without the overhead".

**LVGL Pro, other**
- CLI splits `compile --target editor|cli` — the editor consumes a runtime the CLI builds. U8G2GL's CLI needs the same split; recorded against PR-02/PR-06.
- `<previews>` and `help=` are the two editor-facing schema features LVGL Pro carries that our schema currently lacks (§11).

Sources: [Theia FAQ](https://theia-ide.org/docs/faq/) · [Theia Platform](https://theia-ide.org/theia-platform/) · [Eclipse Theia project](https://projects.eclipse.org/projects/ecd.theia) · [Browser-only Theia PR #12853](https://github.com/eclipse-theia/theia/pull/12853) · [Running Theia without a backend](https://eclipsesource.com/blogs/2024/01/29/running-eclipse-theia-without-a-backend/) · [Theia Community Release 2026-05](https://eclipsesource.com/blogs/2026/06/19/the-eclipse-theia-community-release-2026-05/) · [TypeFox — Custom IDEs](https://www.typefox.io/cloud-and-desktop-ides/)
