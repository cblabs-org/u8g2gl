# U8G2GL — Concept & Positioning

**A build-time XML-to-C++ UI framework for U8G2 monochrome displays.**

**Version**: 0.2
**Date**: September 2026
**Companion document**: [design_spec.md](design_spec.md) — the technical specification

> This is a living document covering *why* the project exists, who it is for, and what would make it worth stopping. The technical *how* lives in the design spec. Point-in-time research that fed both is frozen in [docs/research/](research/).

---

## 1. The Idea

Take LVGL Pro's architecture — XML screen definitions compiled ahead-of-time to C, with reactive data binding and a component system — and build a version sized for monochrome U8G2 displays.

Concretely:

1. XML files describing screens, components, and reusable widgets
2. A subject/observer system for controller↔display data flow
3. A CLI that validates and compiles XML to C++
4. A font and asset pipeline (BDF, XBM, PNG→XBM)
5. A pixel-exact browser preview
6. **A visual editor** — the destination the rest of it exists to enable

---

## 2. The Thesis

### 2.1 The point is the editor

Monochrome UI design is pixel work. On a 128×64 panel a widget one pixel out of place is visible and wrong, and correcting it is direct manipulation — nudge, align, compare — not description. **U8G2GL exists to make a visual designer possible for these displays.** The schema, generator, runtime and preview are infrastructure serving that.

The alternative deserves stating because it is genuinely strong: if the goal were only "produce U8G2 UI code", a language model could emit C++ directly against a widget library. No XML, no schema, no generator. The declarative format would be a pointless round trip.

**XML earns its place because an editor needs a document it can read back.** Generated C++ is write-only — nothing reliably parses it, changes one coordinate, and rewrites it preserving intent. A declarative project format round-trips losslessly, which is what makes visual editing possible at all. That is the format's justification, and it is the reason [design_spec.md §1.2](design_spec.md) makes the schema an editor's document model first and a compiler input second.

AI-assisted authoring is a welcome second-order effect — a schema good enough to drive an editor is also good enough for a model to target — but it is a beneficiary, not the purpose.

### 2.2 The market reading, honestly

Nobody has built a declarative-to-codegen pipeline with a visual designer for U8G2. Two readings of that:

- **Lopaka** (~1700 stars) is the most successful tool in the space and is a *drawing tool* — it generates flat procedural code with no bindings, components, multi-screen support or reuse, and no project format to round-trip. Its popularity shows appetite for visual U8G2 tooling; its limits show what is missing.
- **PixelUI** paused development and **UiUiUi** remains niche. Both offered structure without visual tooling; neither found an audience. That is at least consistent with the reading that *structure alone* is not what people want — visual tooling is.

The addressable audience is still genuinely small: people who need monochrome specifically and have UI complex enough to justify a framework. Industrial HMI, e-paper dashboards, departure boards. This should be treated as a project built primarily for its author, with wider use as upside — but the thing being built for the author is the editor, not the pipeline underneath it.

---

## 3. Prior Art: departures-board

The [departures-board](file:///Users/mcneillm/Documents/Projects/departures-board) project contains a working prototype of parts of this concept, and it is the source of most of the design's grounding.

### 3.1 What exists and works

| Asset | What it proves |
|---|---|
| JSON → C++ layout codegen (`layoutDefault.json` → `layoutDefault.cpp`) | The codegen pipeline shape is sound |
| `layout.schema.json` with conditional validation | Schema-driven validation of widget properties works |
| `iGfxWidget` base class with `tick`/`render`/`renderAnimationUpdate` | The lifecycle model, including the escape hatch |
| `DisplayManager::render()` — `clearBuffer` → board → `sendBuffer` | The full-frame render model ([D-4]) |
| `drawingPrimitives.hpp` — `U8g2StateSaver`, `blankArea`, aligned `drawText` | The RAII state-guard pattern |
| Nine real widgets, including a paginated table and an animated formation diagram | The widget tier boundaries are drawn in the right places |
| `@designer_prop` annotations | An early attempt at editor metadata, superseded by the XML `<api>` block |
| `tools/layoutsim` — vendored `emsdk`, `build_wasm.py`, browser harness | **The Wasm preview approach ([D-9]) already works.** Real widget code compiled to Wasm, watched and rebuilt as a PlatformIO pre-build step |

### 3.2 Honest de-risking assessment

Earlier research described this as significantly de-risking the concept. That overstates it. The prototype de-risks the parts that were never in doubt and leaves the hard parts untouched:

| Area | De-risked? |
|---|---|
| Codegen pipeline | ✅ Proven |
| Widget lifecycle and render model | ✅ Proven in production |
| Drawing primitives and state management | ✅ Proven |
| **Component system (pure-XML composition)** | ❌ Does not exist |
| **Subject/observer binding** | ❌ Does not exist — all data is pushed imperatively |
| **Extensible widget registry** | ❌ Widget types are a hardcoded schema enum |
| **Multi-target portability** | ❌ Single display, single layout |
| **Diagnostics** | ❌ No meaningful error reporting |
| Wasm preview / test harness | ✅ Proven — `tools/layoutsim` compiles real widget code via a vendored `emsdk` |

Call it a third de-risked, and the third that *is* proven includes the piece that looked riskiest on paper. The Wasm renderer was the largest technical unknown in the v0.1 plan (which proposed reimplementing every widget in JavaScript instead); finding a working Emscripten pipeline already in the prototype removes that risk entirely and turns Phase 1's test harness into a port.

The three unproven items — components, subjects, extensible widget registry — are precisely the three that distinguish U8G2GL from "the departures-board codegen, extracted". They are also, notably, all *design* problems rather than *toolchain* problems.

### 3.3 It is also the only committed user

departures-board is the acceptance test. [design_spec.md §20](design_spec.md) makes retargeting one of its screens the Phase 1 exit criterion, with an explicit provision to stop if the result is not better than the JSON pipeline it replaces. That is a real option, not a formality.

---

## 4. Landscape

### 4.1 Visual editors

| Tool | Type | Strengths | Gaps |
|---|---|---|---|
| **[Lopaka](https://lopaka.app/)** | Web visual editor | Drag-and-drop, generates U8G2 code, image→XBM, also targets Flipper Zero | Static layout only — no bindings, components, multi-screen, or reuse |
| **[DisplayKit](https://cifertech.github.io/DisplayKit/)** | Web designer | Multi-screen, JSON export, U8G2 + TFT_eSPI, image and animation tools | Early; no composition, no binding, flat Arduino output |
| **[tcMenu Designer](https://www.thecoderscorner.com/products/arduino-libraries/tc-menu/)** | Desktop/web designer | Industrial-grade menu system, native U8G2 plugin, remote control | Menu/form only — no freeform layout or custom visual widgets |
| **[GUIslice Builder](https://github.com/ImpulseAdventure/GUIslice)** | Java desktop builder | Proves desktop builders can target MCUs | Optimised for colour touchscreens, imperative callbacks |

**Relationship to Lopaka: complementary, not competitive.** Lopaka is a drawing tool; U8G2GL is a framework. A Lopaka→U8G2GL XML importer would be a genuinely useful bridge and a cheap way to reach an existing audience.

### 4.2 U8G2 widget frameworks

| Library | Approach | Strengths | Gaps |
|---|---|---|---|
| **[MUI](https://github.com/olikraus/u8g2/wiki/muiref)** (official) | Menu/form system in U8G2 | <0.5 KB RAM, PROGMEM menus, official | Menus only, no general layout, no tooling |
| **[UiUiUi](https://github.com/dirkhillbrecht/UiUiUi)** | Static widget framework | Zero heap, automatic layout, partial redraws | C++ only, no declarative layer or editor |
| **[PixelUI](https://github.com/Lawrence-Link/PixelUI)** | Component framework | View stack, animation, fixed-point math | **Development paused** |
| **[GEM](https://github.com/Spirik/GEM)** | Menu library | Multi-level graphic menus | Menu only |
| **[AtomUI](https://github.com/liux-pro/AtomUI)** | Console UI | SDL2 desktop simulator | Hardcoded, not general-purpose |

### 4.3 Architectural references worth borrowing from

| Project | Relevance |
|---|---|
| **[Flipper Zero](https://github.com/flipperdevices/flipperzero-firmware)** | The most mature 128×64 monochrome navigation architecture in production: `Canvas`→`Viewport`→`View`→`ViewDispatcher`→`SceneManager`. Directly informs the focus/navigation model in [design_spec.md §12](design_spec.md) |
| **[Slint](https://slint.dev)** | Compiled declarative DSL → bare-metal C++/Rust in <300 KB. Proof that compiled declarative UI works on MCUs |
| **[Qt for MCUs](https://doc.qt.io/QtForMCUs/)** | QML property bindings compiled away at build time |
| **[ZLG AWTK](https://github.com/zlgopen/awtk)** | XML → C/C++ with MVVM binding; the closest open-source analogue to this concept |
| **[LGFXScreenBuilder](https://github.com/tanakamasayuki/LGFXScreenBuilder)** | Exports structured data rather than drawing code; applications update by assigning to generated structs |
| **[ComposeUI](https://github.com/QWERTivore/ComposeUI)** | Declarative C++ on LVGL using static data structures, zero heap |

### 4.4 Font and asset tooling

| Tool | Purpose |
|---|---|
| **bdfconv** (in the U8G2 tree) | BDF → U8G2 C array. The canonical path; distribution is [Q-2] |
| **[gbdfed](https://github.com/mtenberge/gbdfed)** / **[bited](https://github.com/skelliam/bited)** | BDF font editors |
| **[FontForge](https://fontforge.org/)** | Full font editor with BDF export |
| **[image2cpp](https://javl.github.io/image2cpp/)** | Image → C array for OLED |
| U8G2 built-ins | Hundreds of pre-compiled fonts, usable with no pipeline at all |

**Scope discipline:** building a BDF editor is a substantial standalone project and the ecosystem is already served. U8G2GL integrates with `bdfconv` and stops there.

---

## 5. Where the Monochrome Constraint Helps

The 1-bit target is a simplifying force and the design should lean on it:

- **No colour, gradients, alpha, or anti-aliasing.** The styling domain collapses to ten properties.
- **Small resolutions.** A full framebuffer is 1–2 KB, so full-frame redraw is affordable and the render model stays simple.
- **A handful of primitives.** Text, lines, boxes, circles, XBM. The whole drawing API fits on one page.
- **XOR mode is a superpower.** `setDrawColor(2)` gives selection highlighting, blinking, and overlay compositing with no second render path.
- **Pixel-exact preview is tractable.** A 256×64 1-bit framebuffer is trivial to render in a browser.

The counterpart: because there is no anti-aliasing to hide error, **fractional layout is actively harmful**. This is why the design uses absolute positioning with build-time integer arithmetic rather than a flex engine — see [design_spec.md §7](design_spec.md).

---

## 6. Risks

### 6.1 Adoption — *high, accepted*

Per §2.1, the addressable audience is small and the modal U8G2 user wants a drawing tool. Mitigation is not marketing; it is scoping. Build for departures-board first, keep the surface small, and let the AI-authoring angle do the differentiating.

### 6.2 Scope creep — *high, structurally mitigated*

The failure mode is replicating LVGL Pro's sophistication for a domain that does not need it. Three structural defences:

1. A Phase 1 exit criterion with an explicit stop condition ([design_spec.md §20](design_spec.md))
2. `<row>`/`<col>` and other unproven features deferred with explicit triggers ([design_spec.md §1.5](design_spec.md)) — a rule that governs features *within* the product, never its purpose
3. A *Deferred* label used explicitly, so omissions are recorded decisions rather than oversights

A screen should be 15 lines of XML. If a typical screen approaches 100, the design has failed.

This is now a stated design principle rather than an aspiration — [design_spec.md §1.5](design_spec.md) makes omission the default, requires a feature to earn inclusion by demonstrated rather than anticipated need, and records that schema surface is the expensive kind of complexity because it is permanent once authors write against it. Deferred features carry an explicit trigger, so deferral is revisited on evidence instead of becoming permanent by inattention.

### 6.3 Single-maintainer upstream dependency — *medium, accepted*

U8G2 is maintained by one developer. Earlier research suggested hedging with an Adafruit_GFX backend; the design spec rejects this ([§2.3](design_spec.md)) because the abstraction would cost the tight primitive mapping that makes the codegen simple, in exchange for portability nobody has requested. U8G2 is stable, widely deployed, and forkable. The risk is accepted.

### 6.4 Two diverging renderers — *eliminated by design*

The original plan for a JavaScript preview renderer would have created a second implementation of every widget. Two versions of the clock's dual-font baseline alignment *will* diverge, and "the preview lies" is what discredits a design tool. Resolved by [D-9] — compile the real runtime to Wasm.

### 6.5 Runtime cost exceeding its budget — *low*

U8G2GL ships a runtime that did not previously exist, and v0.1's "zero runtime overhead" claim has been withdrawn as false. But the scale is favourable: the reference baseline is `esp32dev` — a classic ESP32 with 520 KB SRAM and no PSRAM — and departures-board already runs a 256×64 board with nine widgets there, alongside WiFi, TLS, an async web server, and a streaming JSON parser. A framework costing tens of KB of flash and a few KB of RAM is not what makes that build tight.

The static, declared-capacity approach ([design_spec.md §9](design_spec.md)) is a positive on this target rather than a compromise: on a part where the WiFi and TLS stacks are the real consumers, taking a fixed slice at link time and never touching the heap is easier to reason about than dynamic allocation that fragments the pool they depend on.

The baseline is a floor rather than a target. Nothing in the design caps what a better-equipped board can do — capacities are declared, not limited, so a project on an S3 with PSRAM simply declares larger numbers against a larger budget. Same XML, same runtime, more headroom.

Measurement remains a Phase 1 deliverable and budget reporting a permanent CLI feature — but their purpose is catching project-level mistakes (an over-declared table capacity, a font range pulling in a whole CJK block) rather than policing a framework that is near a limit.

### 6.6 Toolchain packaging — *medium*

`bdfconv` has no published binaries, and a broken font pipeline on Windows would end adoption before it starts. Tracked as [Q-2]; Wasm is the recommended answer.

### 6.7 Licensing — *resolved: MIT*

The concern was that departures-board is CC BY-NC-SA, and a non-commercial restriction inherited into U8G2GL would block industrial users — plausibly the most motivated segment of an already small audience. Since the owner holds copyright on both projects there is nothing to inherit: **U8G2GL is MIT**, and any code ported from departures-board into the runtime is relicensed by the owner for that purpose.

Fonts follow U8G2's own model — code under a permissive licence, fonts under their own terms with a pointer to the per-font reference. U8G2 is a hard prerequisite, so its bundled fonts are already in the user's firmware under U8G2's terms before U8G2GL is involved; a `<builtin>` declaration emits a *reference*, not a copy. User-supplied BDFs are the user's asset on the user's terms. This is a non-issue rather than a risk. See [design_spec.md §22.1](design_spec.md).

---

## 7. Non-Negotiables

Constraints that constitute the concept. Violating one means building something else.

1. **No XML on the MCU.** XML is a development-time format compiled to C++. A device running U8G2 cannot afford a DOM parser, and shipping one would forfeit the entire premise.
2. **Pixel-exact positioning.** No fractional layout, no distributed remainders. Layout helpers resolve to integers at build time or do not exist.
3. **Honest cost reporting.** Every build states its flash and RAM. No unmeasured claims.
4. **The framework does not own the hardware.** No GPIO, no debounce, no display construction. The application owns its board; U8G2GL owns the pixels.
5. **Diagnostics are a feature.** Every error carries file, line, column, and where possible a suggestion.

---

## 8. Success Criteria and Stop Conditions

### Phase 1 succeeds if

- A departures-board screen renders pixel-identically from XML, verified by diff against current firmware output
- The XML is meaningfully shorter and clearer than the JSON it replaces
- The measured memory budget is acceptable on the reference ESP32 target
- Regenerating after an XML edit is faster than hand-editing C++ was

### Stop if

- The generated code is harder to debug than the hand-written code it replaced
- The runtime cost is disproportionate to the benefit on real hardware
- The XML for a real screen is not clearly better than the JSON — at which point the honest conclusion is that departures-board needed a better JSON schema, not a framework
- Six months in with no second user and no personal need for the remaining phases

### The project is a success at a smaller scale if

Phases 1–2 ship, departures-board runs on it, and nobody else ever uses it. That is a good outcome: a maintainable declarative layer over the author's own display code, with a preview and a test harness. Everything beyond that is upside.

---

## 9. Related Documents

| Document | Status |
|---|---|
| [design_spec.md](design_spec.md) | **Living** — the technical specification |
| [research/lvgl_pro_gap_analysis.md](research/lvgl_pro_gap_analysis.md) | Frozen — dimension-by-dimension LVGL Pro comparison |
| [research/u8g2_primitives_audit.md](research/u8g2_primitives_audit.md) | Frozen — complete U8G2 drawing API inventory. Still the best reference for primitive→widget mapping |
| [research/widget_design_assessment.md](research/widget_design_assessment.md) | Frozen — widget-by-widget tier analysis of departures-board |

Research documents are point-in-time inputs. Where they conflict with the design spec, **the spec wins** — notably on the render model, the custom-widget composition model, and collection binding, all of which changed in v0.2.
