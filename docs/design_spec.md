# U8G2GL Design Specification

**U8G2GL** — A build-time XML-to-C++ UI framework for monochrome U8G2 displays.

> *"Same paradigm as LVGL Pro, simplified for monochrome, honest about the cost."*

**Version**: 0.3 Draft
**Author**: Matt McNeill, CB Labs
**Date**: September 2026
**Status**: Design — no implementation started

---

## Document Conventions

- **[D-n]** marks a binding architectural decision with its rationale. These are the load-bearing choices; changing one invalidates downstream sections.
- **[Q-n]** marks an open question that must be resolved before the affected phase starts.
- Sections marked *Deferred* are deliberately out of scope for v1 and are recorded so the omission is a decision rather than an oversight.

---

## 1. Vision & Positioning

### What U8G2GL Is

A **build-time XML-to-C++ code generation framework** for designing, composing, and generating embedded UI code targeting monochrome displays driven by [U8G2](https://github.com/olikraus/u8g2).

It brings the declarative, component-based workflow of [LVGL Pro](https://lvgl.io/tools/pro-editor) to 128×64 OLEDs, 256×64 dot-matrix panels, and similar small monochrome screens.

### What U8G2GL Is Not

- **Not a runtime XML system.** There is no XML parser on the MCU. XML is compiled to C++ at build time.
- **Not a replacement for U8G2.** Generated code calls U8G2's drawing API. U8G2 remains the hardware abstraction layer.
- **Not a general-purpose GUI toolkit.** It targets 1-bit displays where every pixel is deliberate.
- **Not zero-overhead.** See §1.3 — this claim was made in v0.1 and was false.

### 1.1 Why It Exists

| Problem | U8G2GL Solution |
|---|---|
| U8G2 screen layouts are hand-coded pixel coordinates in C++ | Declare layouts in XML; generate the C++ |
| No way to preview a screen without flashing firmware | Wasm preview running the real runtime (§17) |
| Reusable widgets require copy-pasting C++ classes | Elements declared in XML, shared as folders |
| Data flows controller→display via imperative push calls | Reactive subject binding for scalars |
| Layouts cannot be authored or reviewed by tooling | Schema-validated XML — machine-readable, diffable, LLM-authorable |

### 1.2 The Primary Thesis — the editor is the point

**U8G2GL exists to make a visual designer possible for monochrome U8G2 displays.** Everything else — the schema, the generator, the runtime, the preview — is infrastructure serving that end.

This needs stating plainly because the obvious alternative is genuinely strong: *if the goal were simply "produce U8G2 UI code", a language model could emit C++ against the widget library directly.* No XML, no schema, no generator. The declarative format would be a pointless round trip.

XML earns its place for one reason a model cannot supply: **an editor needs a document it can read back.** Generated C++ is write-only in practice — nothing can reliably parse it, modify one coordinate, and rewrite it preserving intent. A declarative project format is round-trippable: load → present → manipulate → save, losslessly, repeatedly. That property is the whole justification for the format's existence.

**Why an editor rather than natural language.** These are pixel-exact designs on 128×64 panels where a widget being one pixel out is visible and wrong. That work is direct manipulation — nudge, align, compare, adjust — and describing it in prose is slower and less precise than doing it. Language is good at *what goes on the screen*; it is poor at *exactly where*. The editor is not a convenience layer over an AI workflow; it is the correct interface for the task.

**What AI authoring actually is here:** a beneficiary, not the purpose. A schema good enough to drive an editor is also good enough for a model to target, and the diagnostics that help a human help a model too. That is a welcome second-order effect of building the format properly — not the reason to build it.

**Consequence for priorities.** The schema must be an *editor's document model* first and a compiler input second. Where those pull apart — round-trip fidelity, preserving authored order and comments, carrying presentation metadata the compiler ignores — the editor's needs win, because the compiler can always discard what it does not need and an editor cannot invent what was never stored.

### 1.3 Honest Cost Statement

v0.1 claimed "zero runtime overhead". That is false and the claim is withdrawn. What is true:

- **No XML parsing on the MCU.** Layout is resolved entirely at build time.
- **No layout engine on the MCU.** All coordinates are literal integers in generated code (§7).
- **There is a runtime**, and it is new code that did not previously exist: a widget base class, the subject/observer system, dirty tracking, and the built-in widget implementations.

LVGL Pro can claim near-zero overhead because it generates calls into a runtime the user already links. U8G2GL ships its runtime. The CLI must therefore **report a flash and RAM budget on every build** (§18) so that cost is visible rather than asserted away.

### 1.4 Design Principles

1. **Familiar to LVGL Pro users.** Same project structure and naming. U8G2GL departs on one point — it has a single element vocabulary rather than a component/widget distinction ([D-18]) — because LVGL's split exists to serve runtime XML loading, which U8G2GL does not have.
2. **Pixel-exact positioning.** No fractional layout. Where layout helpers exist they resolve to integers at build time (§7).
3. **Build-time compilation.** XML → C++. No runtime interpretation.
4. **Monochrome-native.** No colour, gradients, or opacity. XOR mode and inversion are first-class.
5. **Honest about boundaries.** Where the framework cannot help (GPIO, debounce, data lifetimes), it says so and hands off cleanly rather than pretending.
6. **Lite by design.** U8G2GL implements a deliberate *subset* of LVGL Pro's surface. Simple is the target, not a compromise on the way to complete — see §1.5.

### 1.5 Lite by Design — the deferral rule

The domain is 5–20 elements on a 128×64 panel, not 100+ on a colour TFT. A framework sized for the latter would be wrong here, so **omission is the default and a feature earns inclusion by demonstrated need, never anticipated need.**

Three operating rules follow.

**Schema complexity is expensive; generator complexity is cheap.** A generator pass can be rewritten in an afternoon and nobody outside the project notices. A schema element, once authors have written XML against it, is permanent — changing it breaks their files and any tooling that reads them. When weighing a feature, weigh its *schema* cost, not its implementation cost. `<row>`/`<col>` was deferred on exactly this basis (§7.2): trivial to build, permanent once shipped.

**Unsettled semantics defer, they do not get guessed.** If a feature's edge cases cannot be answered from the design — `<row>`'s behaviour with a hidden child could only be answered by either violating [D-7] or surprising the author — the honest move is to wait for real usage rather than freeze a guess into the schema.

**Deferral needs a trigger, not a vibe.** A deferred feature records what evidence would justify building it, so the decision is revisited on fact. The pattern: *build it when the friction it removes appears across three or more real screens.* Without a trigger, deferral becomes permanent by inattention, which is a different failure from deciding not to build something.

This principle is descriptive of decisions already taken — page mode ([D-2]), the fractal composition model ([D-6]), a layout engine ([D-7]), zero-copy collections (§9.3) and the reduced style set (§10) were all cut or deferred on these grounds. It governs *features within* the product; it does not license cutting the product's purpose (§1.2). Stating it makes those coherent rather than incidental, and lets future contributors apply the same test without asking.

**The measure:** a typical screen should be 15 lines of XML. If typical screens approach 100, the design has failed regardless of what the feature list says.

---

## 2. Scope & Targets

### 2.1 Supported Hardware

**[D-1] Target MCUs: ESP32 (all variants), RP2040, STM32F1 and above. Minimum 16 KB usable RAM. PSRAM is never required.**

**Reference baseline: `esp32dev` (classic ESP32, 520 KB SRAM, no PSRAM) and the ESP32-C series.** If it does not run comfortably on a plain ESP32 without external RAM, it is too heavy.

**The baseline is a floor, not a ceiling.** Where PSRAM is available — an S3, say — nothing in U8G2GL caps what a designer can build. There are no framework-imposed limits on row counts, screen counts, widget counts, or font counts. Capacities are *declared* (§9) and the declared numbers can simply be larger when the hardware allows. The framework does not change shape with more RAM; only the budget does.

The two ideas coexist because the budget is per-target (§18): a modest `--ram-budget` on `esp32dev` catches overreach, a large one on an S3 gets out of the way. The same XML, the same runtime, different headroom.

*Rationale:* The runtime allocates a widget instance struct plus observer registration per element, and full-buffer rendering requires the entire framebuffer in RAM (1 KB for 128×64, 2 KB for 256×64). That is affordable on the baseline with room to spare — departures-board already runs a 256×64 board with nine widgets on `esp32dev` alongside WiFi, TLS, an async web server, and a streaming JSON parser, on a 4 MB flash part with dual 1.92 MB OTA partitions. The display layer is not what makes that build tight.

An 8-bit AVR with 2 KB total RAM cannot host this, and supporting it would compromise every other decision. v0.1 research materials referenced AVR; that is withdrawn.

*Consequence for the design:* static, declared-capacity allocation (§9) is not merely acceptable on this baseline, it is preferable. On a part where WiFi and TLS are the real RAM consumers, a framework that takes a fixed, known slice at link time and never touches the heap is easier to reason about than one that allocates dynamically and fragments the pool those stacks depend on. It also scales upward without modification — a bigger machine just declares bigger numbers.

> [!WARNING]
> **PSRAM is not uniformly faster, and the framebuffer must stay in internal SRAM.** External PSRAM is reached over SPI or OPI and is markedly slower than on-chip SRAM. The framebuffer is written across on every frame and then streamed to the display; placing it in PSRAM is a performance regression, not an upgrade. Bulk, infrequently-touched data — a large table's row and string storage — is a reasonable PSRAM candidate, because it is written once per data refresh and read once per frame.
>
> If PSRAM placement is ever offered it must therefore be **opt-in per collection**, never a global "use PSRAM" switch. Not in v1; recorded so the door stays open and the obvious mistake is written down.

**[D-2] Full-buffer mode only. Page mode (`firstPage`/`nextPage`) is not supported.**

*Rationale:* Page mode calls `render()` eight times per frame, which breaks any widget that mutates state during render — including measurement-on-first-render, which the reference `scrollingTextWidget` relies on. It is also incompatible with `updateDisplayArea` (§11.4). Supporting it would make every widget's contract conditional.

*This costs no device coverage.* All 221 display definitions in U8G2 2.36.18 offer a full-buffer (`_F_`) constructor, so the restriction excludes no hardware — it only requires that the framebuffer fits in RAM, which [D-1] already assumes.

### 2.2 Supported Displays

Any U8G2 controller in full-buffer (`_F_`) configuration — 1631 constructors across 76 controllers, enumerated automatically per [D-14] rather than maintained by hand. Reference targets:

| Controller | Resolution | Bus | Notes |
|---|---|---|---|
| SSD1306 | 128×64 | I²C / SPI | Most common hobby OLED |
| SSD1322 | 256×64 | SPI | Reference target (departures-board) |
| SH1106 | 128×64 | I²C | SSD1306-compatible |
| ST7920 | 128×64 | SPI | Monochrome LCD |

### 2.3 Explicitly Out of Scope

- Colour or greyscale rendering
- Touch input (§12 covers buttons and encoders only)
- Runtime layout reflow
- Alternative rendering backends (Adafruit_GFX and similar). *Rationale:* An abstraction layer over both would cost the tight U8G2 primitive mapping that makes the codegen simple, in exchange for a portability nobody has asked for. The U8G2 dependency risk is accepted and recorded in [docs/concept.md](concept.md).

---

## 3. Architecture Decisions

These are the decisions v0.1 left open or answered inconsistently. Everything downstream depends on them.

### [D-3] Generated code is C++, not C

Generated screen files are C++. The runtime is C++.

*Rationale:* v0.1 was incoherent — it used C naming (`u8g2gl_label_t`, `u8g2gl_label_init`) while passing `U8G2*` (a C++ class) and promising `U8g2StateSaver` (an RAII guard that only exists in C++). LVGL Pro generates C because LVGL is C; that reason does not transfer. U8G2's buffer API is idiomatically the `U8G2` class, the working prototype is C++, and the widget model needs inheritance (`extends`) and RAII. Choosing C would mean hand-rolling vtables and scope guards to reimplement what the language provides.

*Consequence:* C++ classes and inheritance, but **flat `u8g2gl_` / `ui_` symbol prefixes rather than namespaces** — see §19. This follows LVGL's convention (`lv_label_t`, `lv_subject_set_int`) rather than idiomatic modern C++, deliberately: embedded users read linker maps and debugger backtraces, Arduino sketches use `using namespace` freely, and a prefix survives both.

### [D-14] Display targets are derived from U8G2's own tables, never hand-maintained

The CLI ingests U8G2's source at build time and generates its display catalogue from it. U8G2GL maintains no list of controllers, geometries, or bus types of its own.

*Rationale:* U8G2 already carries this data, in machine-readable form, as the authoritative definition. Verified against U8G2 2.36.18:

| Source | Yields |
|---|---|
| `U8g2lib.h` | 4913 constructor classes — 76 controllers, 13 bus variants. **1631 are full-buffer (`_F_`)**, which is exactly the set [D-2] admits |
| `u8x8_d_*.c` | 206 `u8x8_display_info_t` structs across 90 drivers, each with authoritative `pixel_width` / `pixel_height` |
| `u8g2_d_setup.c` | Links constructor → driver → buffer allocator, e.g. `u8g2_Setup_ssd1306_128x64_noname_f` → `u8x8_d_ssd1306_128x64_noname` + `u8g2_m_16_8_f` |

**Parse the structs, not the names.** Constructor names look parseable — `U8G2_SSD1306_128X64_NONAME_F_HW_I2C` — but only 66% of full-buffer names yield a geometry by regex; the rest use forms like `U8G2_SSD0323_OS128064_F_4W_SW_SPI`. More importantly `u8x8.h` states outright that pixel dimensions cannot always be computed from tile dimensions. The `display_info` structs are the ground truth and cover 100% of displays.

*Consequences:*

- **Validation is free and exhaustive.** An unknown or misspelled display is caught at generate time against the real catalogue, with near-miss suggestions (§15.1).
- **Hardware discovery becomes possible.** The catalogue is the index behind the query modes in §5.2 — identifying a device in hand, selecting one to source against constraints, comparing variants — and it ships as queryable JSON so a skill or agent can use it directly, not only through the CLI.
- **Geometry is never entered by hand.** `#screen_width` / `#screen_height` come from the display definition, so they cannot disagree with the hardware.
- **Page-mode constructors are filtered automatically.** Restricting to `_F_` enforces [D-2] mechanically rather than by documentation — and costs nothing, since all 221 displays have a full-buffer variant.
- **Framebuffer RAM becomes exact.** The buffer allocator name encodes tile dimensions — `u8g2_m_16_8_f` is 16×8 tiles = 1024 bytes — so §18 reports a derived figure, not an estimate.
- **It tracks upstream for free.** New displays appear when U8G2 is updated; the catalogue is regenerated, not edited.

*Cost:* the generator needs U8G2's source available at catalogue-build time. It is a dependency of every U8G2GL project already, and the catalogue is generated once per U8G2 release and shipped with the CLI — not parsed on every user build.

### [D-4] Rendering is a full-frame redraw

Every frame: `clearBuffer()` → every visible element renders → `sendBuffer()`. No per-widget skipping.

*Rationale:* This is what the reference implementation does and it is the only model consistent with `clearBuffer()`. v0.1 §9 promised the framework would "skip unchanged widgets", which is impossible after a buffer clear — the pixels are gone. Skipping would require never clearing, which in turn requires every widget to erase its own bounding box, which makes overlapping elements illegal and z-order load-bearing. The cost of a full redraw on the target hardware (§2.1) is a few hundred microseconds of buffer writes; the SPI/I²C transfer dominates and happens either way.

*Consequence:* Dirty tracking still exists, but it gates **the frame**, not individual widgets — see §11.2. Widgets may overlap freely. Draw order is document order.

### [D-5] `renderAnimationUpdate()` is an escape hatch, not a lifecycle phase

It exists solely for the case where the main loop is blocked (a firmware download, a long HTTP fetch) and the display must still move. It is not the normal animation path.

*Rationale:* The reference `iGfxWidget` documents this explicitly: *"USE tick() 99% of the time for standard animations... This is called by the main loop and safely precedes a synchronized full-screen render."* v0.1 and the research documents elevated it to a co-equal third phase, which would have made every widget author implement partial-refresh tile math for no reason. Normal animation is `tick()` mutating state, picked up by the next full frame.

### [D-6] Sub-element access is resolved at build time, never by runtime string lookup

A widget that composes children reaches them through **typed member pointers emitted by the generator**. There is no name-based lookup at runtime.

*Rationale:* v0.1 §5's "fractal architecture" had C++ retrieving internal elements by string name — `get_element(self, "fill")` — which is a runtime string lookup inside a framework whose premise is build-time resolution. It is slow, untyped, and unvalidated.

*Amended by [D-18].* This decision originally concluded that custom widgets may not compose named sub-elements *at all*, and pushed all composition to a separate component tier. That conclusion was too broad: it rejected a mechanism (string lookup) by banning a capability (composition). A widget may compose children; the generator resolves them to typed pointers at build time, so nothing is looked up, dispatched, or left unvalidated. The rejection of runtime string lookup stands in full.

*What remains true:* the progress bar is still a C++ widget, because its stipple rendering is pixel arithmetic rather than a composition of sub-elements. v0.1's error was using that same widget as its flagship example of sub-element composition.

### [D-7] Layout sugar is a code-generator feature, never a runtime one

Anchors and stacking helpers (§7.2) are resolved to literal integers during generation. No layout code ships to the device.

*Rationale:* v0.1's blanket rejection of layout was over-applied. The anti-flex argument — rounding artefacts, coarse font metrics, precious pixels — is an argument against *fractional distribution*, not against arithmetic. `right="0"` and "stack these three widths left to right" are exact integer operations. Rejecting them forced v0.1 into "maintain a separate screen file per display size", which makes the `<targets>` mechanism nearly worthless and hands users N hand-synchronised copies of every screen.

### [D-8] Collections are not subjects

Scalar subjects are `int`, `string`, `bool`, `time`. Structured/tabular data uses a generated typed API on the widget instance, with framework-owned storage. See §9.

*Rationale:* v0.1 §6.3's example took the address of a caller stack local and stored it in the widget — a use-after-free. The cell pointers had no defined lifetime either. It also failed to decouple anything: the controller still had to include the widget's private header and know its struct layout, which is *tighter* coupling than the imperative API it replaced. And it made `globals.xml` depend on a widget folder's C header, inverting the dependency.

### [D-9] The preview renders via WebAssembly, not a reimplementation

The browser preview compiles the actual U8G2GL runtime and U8G2 to Wasm via Emscripten.

*Rationale:* A JavaScript renderer is a second implementation of every widget in a different language. Two versions of the clock's dual-font baseline alignment will diverge, and "the preview shows something different from the device" is the failure mode that discredits a design tool. It also requires reimplementing U8G2's BDF glyph decoder pixel-exactly in JS, which is not the low-risk task v0.1 assumed. U8G2 already builds against SDL for its own development, so a desktop/Wasm target is a well-trodden path.

*Already proven in the prototype.* departures-board vendors `emsdk` under `tools/layoutsim/`, compiles the real widget and board code to Wasm via `scripts/build_wasm.py`, watches `widgets/` and `boards/` for changes, and wires the whole thing into PlatformIO as a pre-build hook. This is not a decision that needs de-risking — it is an existing, working pipeline to port. It also means the Emscripten toolchain is already a proven part of this author's build environment, which is what makes the Wasm answer to [Q-2] cheap.

*Consequence:* The same Wasm build is the snapshot-test harness (§17). Fidelity and testability come from one investment.

### [D-17] Widget properties are declared as build-time manifests, not runtime tables

Each widget class ships an `<api>` manifest the generator reads at build time; generated code contains direct setter calls. There is no runtime property table.

*Rationale and full contract:* §13.1. In short — LVGL needs `lv_obj_property` at runtime because its editor loads XML on-device; U8G2GL has no runtime XML, so it needs the property *descriptor* without the property *dispatch*. This keeps custom elements (§6.5) first-class without a generator release, at zero runtime cost.

### [D-18] There is one element vocabulary; the widget tiers are collapsed

**Every element — a line, a label, a composite, a custom C++ widget — is declared by an `<api>` manifest and instantiated by its tag. Whether an instance becomes a C++ object or a sequence of draw calls is a generator outcome, never an authoring category.**

*Full record:* [decisions/d18-unified-element-model.md](decisions/d18-unified-element-model.md).

*Rationale:* the four tiers of §6 described the generator's *output*, and that leaked into the author's vocabulary. Three separate problems shared one cause — components produce no runtime construct and so have no box, no clipping and nowhere to hang behaviour; primitives cannot be bound at all, so hiding a separator on a flag was impossible; and static demotion (§13.5) could no longer fire at all, because its first condition is "the element has no `name`" and [U-1] made `name` mandatory.

**The realisation rule**, which replaces the Tier 1 / Tier 2 split, §13.5's six conditions, and `animated="false"`:

> An element gets an **object** if and only if it must remember something between frames, or something must hold a reference to it — a focus ring, an event, or a parent composite's child pointer. Otherwise it compiles to draw calls.

*Consequences:* composites become real container objects (≈40 bytes on a 32-bit target, against [D-1]'s 16 KB floor); bindable primitives are served by **free draw functions** shared by the firmware and editor targets rather than by per-primitive classes; `components/` and `<component>` are removed; §13.6's inlining survives only as an unobservable optimisation. Schema 0.4.

### [D-19] Text overflow is a label property, not a widget type

**`u8g2gl_label` carries `long_mode="clip|dots|scroll|scroll_circular"`, default `clip`. `truncate` is deleted and `u8g2gl_scrolling_label` is removed.**

*Full record:* [decisions/d19-label-long-mode.md](decisions/d19-label-long-mode.md).

*Rationale:* the two manifests were identical but for three properties, so six declarations were maintained in two places. Overflow was already expressed twice and inconsistently — as a boolean on one widget, and as an entire second widget for the third behaviour. LVGL's single `lv_label` with a `long_mode` enum is both the familiar model (§1.4) and the correct one.

*Cost:* roughly 16 bytes per label instance, since every label now carries scroll state. `wrap` is deliberately **not** offered — U8G2GL labels are single-line.

### [D-20] Geometry is bindable; runtime layout belongs to the application

**`x`, `y`, `width` and `height` are bindable like any other property. Anchors resolve at build time against the containing element. There is no runtime layout pass.**

*Full record:* [decisions/d20-bindable-geometry.md](decisions/d20-bindable-geometry.md).

*Rationale:* [D-18] makes composites real containers, which raised two questions [D-7] never had to answer — what `right="0"` means inside a resizable widget, and what happens when something must resize while the firmware runs. The first is answered by the container existing, plus `#parent_width` / `#parent_height` as ordinary constants in the existing arithmetic (§7.2). The second is answered imperatively: the application sets a subject, or a custom widget moves its own children.

A generated per-container `layout()` function was considered and rejected — it would have required amending [D-7], a third phase in §11.3's lifecycle, a forward-reference rule to keep one pass deterministic, and the editor running the identical function to stay pixel-exact. **[D-7] is therefore untouched.**

*Trigger to revisit:* hand-written relayout appearing as friction across three or more real screens — the same trigger [D-7] sets for `<row>`/`<col>`.

### [D-21] Static capacities are generated from the document, not configured by hand

**The generator computes every static capacity — objects per screen, bindings per object, total bindings, styles — from the document it is compiling, and emits them as a generated header. Exceeding a capacity is an arithmetic fact at build time, never a silent failure on the device.**

*Full record:* [decisions/d21-generated-capacities.md](decisions/d21-generated-capacities.md).

*Rationale:* [D-20] makes `U8G2GL_MAX_BINDINGS_PER_OBJ = 4` insufficient by construction — binding `x`, `y`, `width` and `height` exhausts the budget with nothing left for `text`. [D-18] makes object counts rise structurally, because composites are now real objects. Neither ceiling was validated, and `add_binding()` fails by returning `false` — a value generated code can ignore, producing a screen that compiles, boots, and silently fails to update one widget. The generator holds the whole document and can count exactly, so it emits the numbers instead of inheriting a guess.

*Consequences:* a generated config header included ahead of `u8g2gl_config.h`, whose `#ifndef` defaults survive for hand-written use; a hard validator error at **254** objects per screen, which is where `uint8_t` parent indices run out ([A-3]); capacities reported in the §18 budget. Generated code need not check binding returns, because the pool was sized from the very bindings being added — the failure stops existing rather than moving earlier.

### [D-10] The CLI is TypeScript on Node, distributed via npm

*Rationale:* `npx u8g2gl generate` is the lowest-friction install for the target audience and works identically on macOS, Linux, and Windows. It shares the schema, the XML parser, and the Wasm host with the browser preview — one codebase, not two. The alternative (Python) has a worse Windows story and cannot share code with the preview.

---

## 4. Project Structure

```
my_project/
├── u8g2gl.xml               ← Project config: display targets, schema version
├── globals.xml              ← Subjects, constants, styles, fonts, images
├── screens/                 ← One XML file per screen
│   ├── screen_home.xml
│   └── screen_settings.xml
├── widgets/                 ← User-authored elements (optional), one folder each
│   ├── status_bar/          ← a composite: XML only
│   │   └── status_bar.xml
│   └── wd_service_list/     ← a custom element: XML + C++
│       ├── wd_service_list.xml    ← API declaration
│       ├── wd_service_list.hpp
│       └── wd_service_list.cpp
├── fonts/                   ← BDF font sources
├── assets/                  ← XBM/PNG image sources
└── generated/               ← Auto-generated C++ (DO NOT EDIT, DO COMMIT)
    ├── ui.hpp               ← Umbrella header, screen registry
    ├── ui_screen_home.cpp
    ├── ui_screen_settings.cpp
    ├── ui_subjects.hpp/.cpp
    ├── ui_fonts.hpp/.cpp
    └── ui_images.hpp/.cpp
```

`generated/` **is committed to version control.** See §16 — the Arduino IDE cannot run a pre-build step, so committed output is the only way that audience can use the framework at all. It also makes codegen changes visible in review.

The project file is named `u8g2gl.xml` rather than `project.xml` so it is unambiguous in a repository that may contain other tooling.

---

## 5. Core XML Files

### 5.1 `u8g2gl.xml`

```xml
<u8g2gl schema="0.4" name="departures-board" version="1.0">
    <targets>
        <!-- setup names a U8G2 full-buffer constructor; geometry is derived -->
        <target name="default" default="true">
            <display setup="U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI" rotation="0" />
        </target>
        <target name="compact">
            <display setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" address="0x3C" />
        </target>
    </targets>

    <!-- Optional: generation settings -->
    <output dir="generated" prefix="ui_" />
</u8g2gl>
```

Per **[D-14]** `setup` is the U8G2 constructor name and is the single source of truth for the target. `width`, `height`, controller, and bus are all *derived* from U8G2's own tables, never typed by hand — so they cannot drift from the hardware. `rotation` and bus parameters such as `address` remain the user's to set, since U8G2 cannot know them.

### 5.2 The Display Catalogue

Per **[D-14]** the catalogue is generated from U8G2's source. It is shipped as a **machine-readable data file, not merely a CLI feature** — the CLI is one consumer, a skill is another, an agent is a third. Anything that can read JSON can query it without going through a command line.

*Rationale:* §1.2 makes AI-assisted authoring the primary thesis. A tool whose knowledge is reachable only through fixed CLI flags forces every consumer to shell out and scrape text, and limits them to the questions the flags anticipated. Publishing the catalogue as data means a consumer can ask questions the CLI author never thought of.

#### Record schema

Every field is derived from U8G2's own tables — nothing is hand-entered:

```json
{
  "setup": "U8G2_SSD1306_128X64_NONAME_F_HW_I2C",
  "controller": "SSD1306",
  "variant": ["NONAME"],
  "width": 128, "height": 64,
  "tiles": { "w": 16, "h": 8 },
  "framebuffer_bytes": 1024,
  "bus": { "family": "i2c", "wiring": "hardware", "raw": "HW_I2C" },
  "x_offset": { "default": 0, "flipmode": 0 },
  "driver": "u8x8_d_ssd1306_128x64_noname"
}
```

`framebuffer_bytes` is exact, taken from the buffer allocator (`u8g2_m_16_8_f` → 16×8 tiles × 8 = 1024), not estimated. Across the catalogue these range from **8 bytes to 25,600 bytes** (80×40 tiles, a 640×320 panel) over 73 distinct sizes — a 3200× spread, which is why the figure has to be reported rather than assumed.

The 13 bus variants normalise to three families:

| Family | Raw suffixes |
|---|---|
| `spi` | `4W_HW_SPI`, `4W_SW_SPI`, `2ND_4W_HW_SPI`, `3W_HW_SPI`, `3W_SW_SPI`, `HW_SPI`, `SW_SPI`, `2ND_HW_SPI` |
| `i2c` | `HW_I2C`, `SW_I2C`, `2ND_HW_I2C` |
| `parallel` | `6800`, `8080` |

#### Query modes

The catalogue supports several distinct questions. These are modes of one index, not separate tools, and each accepts `--json`:

**(a) Identify — "I have this device."**

```bash
u8g2gl find "1.3 inch SH1106 128x64 i2c"
u8g2gl find ERC12864
```

Free text matched across controller, geometry, vendor and part-number tokens. Answers *is it supported*, *what do I write*, and *what does it cost me*.

**(b) Source — "What should I buy?"**

Constraint-driven selection, ranked. This is a different question from (a): the user has requirements, not a device.

```bash
u8g2gl find --min-width 128 --height 64 --bus i2c --fits esp32dev
u8g2gl find --max-framebuffer 2048 --controller-family ssd13xx
```

`--fits <target>` is the load-bearing one, and it encodes the judgement in §18 rather than making the user do arithmetic:

```
$ u8g2gl find --min-width 240 --fits esp32dev

  U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI     256x64    2.0 KB   comfortable
  U8G2_ST7586S_S028HN118A_F_8080          240x160   4.8 KB   comfortable
  U8G2_SSD1329_128X96_NONAME_F_4W_HW_SPI  128x96    1.5 KB   comfortable
  U8G2_LS027B7DH01_400X240_F_4W_HW_SPI    400x240  12.0 KB   significant
  U8G2_ST75640_640X320_F_8080             640x320  25.0 KB   check headroom

  Classification is framebuffer vs. what a bare ESP32 can spare alongside
  WiFi and TLS. Note that PSRAM does not help here — the framebuffer must
  stay in internal SRAM ([D-1]).
```

**(c) Compare — "which of these variants?"** Tabulates candidates with only the differing fields, which is the useful view when disambiguating `NONAME` vs `VCOMH0` vs a vendor variant.

**(d) Enumerate — the whole catalogue**, for a skill or agent to index locally: `u8g2gl catalogue --json`.

#### Mode (a) in detail — variant disambiguation and useful failure


Nobody knows 1631 constructor names. The real task is the opposite of browsing a list: **the user is holding a physical module, or looking at a product listing, and needs to know whether it is supported and what to write.** `u8g2gl find` is built for that direction.

```bash
u8g2gl find "1.3 inch SH1106 128x64 i2c"    # from a product listing
u8g2gl find ERC12864                        # from a part number
u8g2gl find "adafruit 128x32 oled"          # from a vendor name
u8g2gl find --controller SSD1309 --width 128 --bus spi   # structured, when known
```

Free text is matched across every token U8G2's own vocabulary provides, which is richer than it first appears. Of 95 distinct variant tokens in the constructor names, most are exactly what a listing gives you:

| Token kind | Examples |
|---|---|
| Vendor | `ADAFRUIT`, `WINSTAR`, `NHD` (Newhaven), `SEEED`, `PIMORONI`, `MIDAS`, `VISIONOX`, `UNIVISION` |
| Part number | `ERC12864`, `JLX12864`, `EA W128128`, `OS128064`, `TK078F288`, `HJR OEL1M0201` |
| Electrical variant | `NONAME`, `VCOMH0`, `ALT0`, `NONAME0`, `1F` |

A result reports what the user actually needs to act:

```
$ u8g2gl find "1.3 oled sh1106 128x64 i2c"

  U8G2_SH1106_128X64_NONAME_F_HW_I2C        128x64   I2C (hardware)
  U8G2_SH1106_128X64_NONAME_F_SW_I2C        128x64   I2C (software/bitbang)
  U8G2_SH1106_128X64_VCOMH0_F_HW_I2C        128x64   I2C (hardware)
  U8G2_SH1106_128X64_WINSTAR_F_HW_I2C       128x64   I2C (hardware)

  framebuffer: 1024 bytes (16x8 tiles)

  note: SH1106 128x64 has 4 electrical variants. NONAME suits most generic
        modules. If the display is shifted horizontally by 2px, try VCOMH0.
```

**Variant disambiguation is the point.** Choosing between `NONAME`, `VCOMH0`, `ALT0` and a vendor variant is the single hardest step for someone wiring up a generic module — they differ in initialisation sequence and column offset, and the symptom of getting it wrong (a display shifted by two pixels, or blank) is not obviously a *variant* problem. Naming the symptom in the output is worth more than listing the options.

**Saying "no" usefully matters as much as saying "yes."** Three distinct negative answers, each actionable:

| Situation | Response |
|---|---|
| Controller supported, that geometry is not | `SSD1309 is supported at 128x64, but not at 128x32. Supported: ...` |
| Controller not in U8G2 at all | `No driver for ST7567A. Closest family: ST7567 (5 variants). Check the controller marking on the module.` |
| Ambiguous free text | Ranked candidates with the discriminating attribute highlighted |

> [!NOTE]
> **[D-2] costs no hardware coverage.** All 221 display definitions in U8G2 2.36.18 have a full-buffer (`_F_`) variant — the full-buffer restriction excludes *zero* devices. It constrains RAM (the buffer must fit, §18), not which displays are supported. A page-mode constructor in `setup=` is still a generate-time error, but it is a typo to correct rather than an unsupported device, and the diagnostic names the `_F_` equivalent directly.

An unrecognised `setup` at generate time produces the same near-match suggestions (§15.1), so the user is never left holding a name that does not work with no route forward.

The catalogue behind all of this, and its query modes, are specified in §5.2.

The `schema` attribute is mandatory. The CLI refuses to generate against a schema version it does not recognise and emits a migration hint (§15.3).

The resolved `width` and `height` of the active target are exposed to XML as the built-in constants `#screen_width` and `#screen_height`, which is what makes a single screen file portable across targets (§7). Because they come from U8G2's `display_info` rather than from the project file, they are correct by construction.

#### The PSRAM interaction is a real trap for mode (b)

A reasonable-sounding plan — *"I'll buy a big display and use an S3 with PSRAM"* — does not work as expected. The framebuffer is rewritten every frame and streamed to the display, so it must live in internal SRAM; PSRAM is markedly slower over SPI/OPI and putting it there is a performance regression ([D-1]). A 25 KB framebuffer is 25 KB of *internal* RAM whether or not PSRAM is fitted.

PSRAM buys headroom for bulk data — large tables, string storage — not for the display. Any tool answering mode (b) must say this, because the assumption is natural and the disappointment is expensive.

### 5.3 `globals.xml`

```xml
<globals>
    <consts>
        <int name="header_height" value="11" />
        <int name="row_height" value="13" />
        <string name="app_name" value="Departures Board" />
    </consts>

    <subjects>
        <int name="temperature" value="0" />
        <string name="station_name" value="" max_len="48" />
        <bool name="wifi_connected" value="true" />
        <time name="system_time" />
    </subjects>

    <styles>
        <style name="header" font="small_9" draw_color="1" />
        <style name="body" font="tall_12" />
        <style name="selected" invert="true" />
    </styles>

    <fonts>
        <bdf name="small_9" src="fonts/custom_9px.bdf" range="0x20-0x7F" />
        <bdf name="tall_12" src="fonts/custom_12px.bdf" range="0x20-0x7F" />
        <bdf name="clock_small_7" src="fonts/clock_7px.bdf" range="0x30-0x3A" />
        <bdf name="weather_icons_11" src="fonts/weather_11px.bdf" range="0xE000-0xE01F" />
        <builtin name="u8g2_font_6x10_mr" />
    </fonts>

    <images>
        <xbm name="icon_wifi" src="assets/wifi.xbm" />
        <xbm name="icon_battery" src="assets/battery.xbm" />
        <convert name="logo" src="assets/logo.png"
                 width="32" height="32" mode="threshold" threshold="128" />
    </images>
</globals>
```

Note `max_len` on string subjects: the framework owns the storage (§8.2), so the capacity must be declared. It defaults to 32 and is reported in the memory budget.

### 5.4 Screen Files

```xml
<!-- screens/screen_home.xml -->
<screen name="home">
    <styles>
        <style name="footer" font="small_9" />
    </styles>

    <view>
        <status_bar x="0" y="0" width="#screen_width" />

        <u8g2gl_hline x="0" y="11" width="#screen_width" />

        <wd_service_list name="departures"
            x="0" y="13" width="#screen_width" height="38"
            font="tall_12" max_rows="16" max_cell_chars="24"
            scroll_dwell_ms="5000" scroll_duration_ms="1000">
            <column width="24" align="left" />
            <column width="40" align="left" />
            <column width="120" align="left" />
            <column width="16" align="center" />
            <column width="55" align="right" />
        </wd_service_list>

        <u8g2gl_hline x="0" y="51" width="#screen_width" />

        <u8g2gl_scrolling_label name="messages"
            x="0" y="53" width="#screen_width" height="12"
            bind_text="service_message" font="small_9" />
    </view>
</screen>
```

`<view>` takes no explicit dimensions — it is the display, sized by the active target.

---

## 6. The Element Model

Per **[D-18]** there is one kind of thing in a U8G2GL document: an **element**.
Every element — a horizontal line, a label, a composite, a custom C++ widget —
is declared by an `<api>` manifest (§13.1) and instantiated by its tag. The
generator handles all of them the same way.

The four-tier model of earlier drafts is withdrawn. It described the generator's
*output* and leaked that into the author's vocabulary; see [D-18] for the full
reasoning.

### 6.1 How an element is realised

> An element gets an **object** if and only if it must remember something
> between frames, or something must hold a reference to it — a focus ring, an
> event, or a parent composite's child pointer. Otherwise it compiles to draw
> calls.

That is the whole rule. It replaces the old primitive/widget split, the six
demotion conditions, and the `animated` manifest attribute.

**The author never chooses.** A `<u8g2gl_box>` nobody binds to compiles to one
`u8g2gl_draw_box()` call and costs no RAM. The same tag with a bound `hidden`
flag compiles to a guarded call — still no object. Bind its `width` to a subject
and it stays a guarded call with an expression in it. It becomes an object only
when something must hold on to it.

**The outcome is reported, never hidden.** §18's budget and `--json` ([D-16])
state, per element, whether it became an object and why — so an author who
expects one and gets a draw call can see the reason rather than guess.

### 6.2 The drawing set

Elements that map directly onto a U8G2 call. These have no state of their own
and, in the ordinary case, no object.

| XML Tag | Attributes | Draw function |
|---|---|---|
| `<u8g2gl_hline>` | `x`, `y`, `width` | `u8g2gl_draw_hline` |
| `<u8g2gl_vline>` | `x`, `y`, `height` | `u8g2gl_draw_vline` |
| `<u8g2gl_line>` | `x1`, `y1`, `x2`, `y2` | `u8g2gl_draw_line` |
| `<u8g2gl_box>` | `x`, `y`, `width`, `height`, `filled`, `radius` | `u8g2gl_draw_box` |
| `<u8g2gl_circle>` | `x`, `y`, `radius`, `filled`, `segments` | `u8g2gl_draw_circle` |
| `<u8g2gl_ellipse>` | `x`, `y`, `rx`, `ry`, `filled`, `segments` | `u8g2gl_draw_ellipse` |
| `<u8g2gl_triangle>` | `x0`,`y0`,`x1`,`y1`,`x2`,`y2`, `filled` | `u8g2gl_draw_triangle` |
| `<u8g2gl_pixel>` | `x`, `y` | `u8g2gl_draw_pixel` |

**These are free functions in the runtime, not classes** ([D-18]). Generated
firmware calls them directly; the editor target's draw-by-name table calls the
same functions. One implementation serves both, which is what [D-9] requires —
a per-primitive class would have needed the editor path anyway and given two
code paths through it.

Adding a drawing element is therefore a manifest entry plus a small free
function. No class, no release, no runtime cost.

**They are bindable like anything else.** Hiding a separator on a flag, or
driving a box's width from a subject, needs no widget:

```xml
<u8g2gl_box name="level_bar" x="4" y="20" height="6" bind_width="level" />
<u8g2gl_hline name="sep" x="0" y="11" width="#screen_width">
    <bind_flag_if_eq subject="compact_mode" ref_value="1" flag="hidden" />
</u8g2gl_hline>
```

**Coordinate convention.** All rectangular elements use `x`, `y`, `width`,
`height` where `x`/`y` is the top-left pixel and the element occupies
`x .. x+width-1` inclusive. v0.1's `<u8g2gl_line x1="0" x2="256">` on a 256-wide
display was off by one and mixed two coordinate conventions in one schema;
splitting axis-aligned lines into `<u8g2gl_hline>`/`<u8g2gl_vline>` fixes both,
and matches the U8G2 API those cases actually compile to. Only genuinely
diagonal lines use the two-point form.

**`<u8g2gl_text>` does not exist.** It duplicated `<u8g2gl_label>` with a
literal `text` attribute. A label that nothing refers to compiles to `setFont` +
`drawStr` under §6.1's rule, so the optimisation happens without a second tag
for authors to choose between. Under the old §13.5 this promise was unkept —
see §13.5 for why.

### 6.3 Framework elements with state

These ship with the framework, hold state between frames, and therefore always
become objects. The user configures them in XML; the framework implements the
C++.

| XML Tag | Description | Key Properties |
|---|---|---|
| `<u8g2gl_label>` | Text with alignment and overflow handling | `text`, `bind_text`, `bind_text_fmt`, `font`, `align`, `long_mode`, `scroll_px_per_sec`, `initial_delay_ms`, `static_dwell_ms` |
| `<u8g2gl_xbm>` | Monochrome bitmap | `src`, `bind_src`, `bitmap_mode` |
| `<u8g2gl_glyph>` | Single glyph from an icon font | `glyph`, `bind_glyph`, `font` |
| `<u8g2gl_progress_bar>` | Animated progress indicator | `bind_value`, `bind_text`, `fill_style`, `animate_duration_ms` |
| `<u8g2gl_clock>` | Time display with blinking colon | `format`, `font`, `secondary_font`, `blink`, `bind_time` |
| `<u8g2gl_switch>` | Toggle indicator | `bind_value` |
| `<u8g2gl_button>` | Focusable text item | `text`, `bind_text`, `font`, `border_width`, `focus_style` |

**`<u8g2gl_scrolling_label>` is removed** ([D-19]). Overflow is a property of
the label, not a second widget:

| `long_mode` | Behaviour |
|---|---|
| `clip` | Hard clip at the widget bounds. **Default** |
| `dots` | Truncate with an ellipsis |
| `scroll` | Marquee, reversing at each end |
| `scroll_circular` | Marquee, wrapping continuously |

`wrap` is deliberately **not** offered — U8G2GL labels are single-line. A user
arriving from LVGL will try it, so the omission is documented rather than
silent. `truncate` is deleted; `long_mode="clip"` is its replacement and says
what it does.

**All time-valued properties carry a `_ms` suffix and are milliseconds. All rate
properties name their unit.** v0.1 had `scroll_speed="25"` documented as
frames-per-second in one document, unitless in another, and implemented as
pixels-per-40ms in the prototype. `scroll_px_per_sec` cannot be misread.

**Framework elements are declared exactly as user ones are.** Each ships a
`<widget>` manifest with an `<api>` block ([D-17], §13.1) alongside its
implementation — `u8g2gl_label.xml` beside `u8g2gl_label.h`. The table above is
documentation of those manifests, not a separate hardcoded list inside the
generator.

### 6.4 Composites — an element with a `<view>`

A user-authored element whose body is a `<view>` of other elements. No C++.

```xml
<!-- widgets/status_bar/status_bar.xml -->
<widget name="status_bar">
    <api>
        <prop name="title_subject" type="subject" default="station_name" />
        <prop name="wifi_subject"  type="subject" default="wifi_connected" />
        <prop name="font"          type="font"    default="small_9" />
    </api>

    <view>
        <u8g2gl_label name="location"
            x="0" y="0" right="52" height="#parent_height"
            bind_text="$title_subject" font="$font" long_mode="scroll" />

        <u8g2gl_xbm name="wifi_icon"
            right="40" y="0" width="12" height="#parent_height"
            src="icon_wifi">
            <bind_flag_if_eq subject="$wifi_subject" ref_value="0" flag="hidden" />
        </u8g2gl_xbm>

        <u8g2gl_clock name="clock"
            right="0" y="0" width="40" height="#parent_height"
            format="HH:MM" font="clock_small_7" blink="true"
            bind_time="system_time" />
    </view>
</widget>
```

A composite **is a real container object** ([D-18]). It has bounds, so
`right="0"` and `#parent_height` inside it mean what they appear to mean; it
gets a framework clip window like any other object (§11.3); and its size is set
where it is placed:

```xml
<status_bar name="bar" x="0" y="0" width="#screen_width" height="11" />
```

Instantiating it twice yields two independent containers with distinct
identifiers (§13.4). Its children are reachable from C++ through generated typed
member pointers ([D-6]), never by name lookup.

**On `type="subject"` props.** A prop declared `type="subject"` receives the
*name* of a subject, so `bind_text="$title_subject"` means "bind to whichever
subject the caller named". This is a two-level indirection resolved statically
during generation — the emitted code binds directly to the concrete subject —
but it must be documented, and the validator must report a clear error when a
caller passes a name that is not a declared subject.

### 6.5 Custom elements — an element with C++

For custom rendering algorithms, state machines, or data structures that a
`<view>` cannot express.

```
widgets/wd_service_list/
├── wd_service_list.xml          ← API declaration (props, child elements, capacity)
├── wd_service_list.hpp          ← Public class
└── wd_service_list.cpp          ← tick/render implementation
```

```xml
<widget name="wd_service_list" extends="u8g2gl_obj">
    <api>
        <prop name="font"               type="font" />
        <prop name="max_rows"           type="int" default="16"
              help="Row capacity. Determines allocated RAM." />
        <prop name="max_cols"           type="int" default="6" />
        <prop name="max_cell_chars"     type="int" default="24"
              help="Per-cell string capacity including terminator." />
        <prop name="scroll_dwell_ms"    type="int" default="5000" />
        <prop name="scroll_duration_ms" type="int" default="1000" />

        <element name="column" access="add" help="Column definition">
            <arg name="width" type="int" />
            <arg name="align" type="enum" values="left,center,right" />
        </element>
    </api>
</widget>
```

**An element may have a `<view>`, C++, or both.** A widget that declares both
gets its children built from the `<view>` and its behaviour from its class,
which is how a designed static assembly can be driven by hand-written
repetition — the case §6.5's predecessor could not express.

**Where the line actually falls.** A `<view>` is a *static* structure: the
generator resolves it at build time, so it can express "three carriages" but not
"N carriages". Reach for C++ when the structure itself depends on runtime data —
a variable row count, a mode machine, content-dependent sizing — or when the
drawing is pixel arithmetic rather than composition. That is a sharper line than
"custom pixel math", and it is testable.

**The `<api>` block is also the generator's manifest** ([D-17], §13.1). It is
the single declaration of what the element accepts: the schema validates against
it, the generator emits setter calls from it, and diagnostics quote it. A custom
element is therefore a first-class citizen — adding one requires no generator
change and no framework release.

There is no `_parser.c` bridge file. v0.1 carried one over from LVGL Pro, which
needs it because LVGL Pro supports *runtime* XML loading in its editor. U8G2GL
has no runtime XML path, so the generator emits the setter calls directly and
the bridge is dead weight.

The `extends` attribute is real C++ inheritance, which is what makes
`wd_scrolling_message_pool extends u8g2gl_label` work without reimplementing
marquee rendering.

**`extends` must name an element that has a manifest** — a built-in such as
`u8g2gl_obj` or `u8g2gl_label`, or another custom element. This matters
because the parent's `<api>` declares the properties a child inherits. It is
`u8g2gl_obj`'s manifest that tells the generator a custom element accepts `x`,
`hidden` and `font`, and that gives the editor's property panel something to show
([D-17]). A C++ class with no manifest declares no API to inherit, so the
generator could not emit its setters and the editor could not display them.
Naming such a class in `extends` is a validation error. To extend one, give it a
manifest — an `<api>` with no new props is enough.

### 6.6 Naming

Framework element tags carry the `u8g2gl_` prefix ([D-12]). User element tags
are unprefixed or carry `wd_` by convention; `u8g2gl_` and `ui_` remain
reserved (§13.4). All user elements live under `widgets/`, one folder each,
whether or not they contain C++.

---

## 7. Layout & Coordinates

### 7.1 Pixel Positioning Is Primary

On a 480×320 colour TFT a 1px rounding error is invisible. On a 128×64 monochrome panel:

- Every pixel is deliberate — no anti-aliasing or sub-pixel rendering to hide error.
- Fractional distribution rounds visibly. `gap: 3` across 5 items in 64px does not divide evenly.
- Font metrics are coarse — 6px, 8px, 10px. There is no 12.5px.
- 2px of unwanted padding on an 80px-tall display is 2.5% of the screen.

Absolute positioning is therefore the model. What v0.1 got wrong was concluding that *no* positional arithmetic is acceptable.

### 7.2 Build-Time Layout Helpers

Per **[D-7]**, these resolve to literal integers during generation. Nothing ships to the device.

**Anchors are measured against the containing element** — the screen, or the composite an element sits inside ([D-20]). Before [D-18] a composite left no container behind, so "the parent's edge" had no referent inside one; it does now.

**Anchors.** Any element may use `right` / `bottom` instead of `x` / `y`, measured from the container's opposite edge:

```xml
<u8g2gl_clock right="0" y="0" width="40" height="11" />
<!-- On a 256-wide target the generator emits x=216; on 128-wide, x=88 -->
```

Supplying two of `{x, width, right}` determines the third. Supplying all three is a validation error.

**Centring.** `hcenter="true"` / `vcenter="true"` centre within the parent. Odd remainders round down, deterministically and identically in preview and firmware.

**Container size.** `#parent_width` and `#parent_height` give the containing element's size, so a composite can lay out relative to whatever size it is given:

```xml
<!-- inside widgets/status_bar/status_bar.xml -->
<u8g2gl_label name="location" x="0" y="0" right="52" height="#parent_height" />
```

These are ordinary constants inside the arithmetic below, **not** a percentage syntax. `width="#parent_width / 2"` needs no new grammar and is strictly more expressive than `50%` would be — `#parent_width - 52` has no percentage equivalent. Per §1.5 percentages wait for demonstrated need.

At screen level the container is the display, so `#parent_width` and `#screen_width` coincide.

**Constant arithmetic.** Coordinate attributes accept integer expressions over constants and literals: `+ - * /` with parentheses, evaluated as integers at build time.

```xml
<u8g2gl_label y="#header_height + 2" width="#screen_width - 8" />
```

**Stacking sugar — *Deferred to Phase 2*.** `<row>` and `<col>` would place children adjacently by summing explicit sizes — pure integer accumulation, no growth, no distributed remainders.

```xml
<row y="0" height="11" gap="2">          <!-- NOT in schema 0.4 -->
    <u8g2gl_scrolling_label width="192" ... />
    <u8g2gl_xbm            width="12"  ... />
</row>
```

*Why deferred:* per the deferral rule (§1.5), the cost is not generator complexity — summing widths is trivial. It is **schema surface**. Once `<row>` ships, XML in the wild depends on it and changing it is a breaking change. The design is also not settled: it is unclear how `gap` should interact with an anchored child, or what `right="0"` means inside a row. Anchors, centring and constant arithmetic already solve the multi-target problem that motivated adding layout helpers at all (§7.3); stacking is convenience on top. Real usage should inform its design rather than the reverse.

Anchors, centring, container constants and constant arithmetic are **in schema 0.4**. Stacking is not.

*Trigger to build it:* hand-maintained accumulation appearing as friction across three or more real screens during PR-07 or PR-10. Until then, `<consts>` arithmetic supplies the single-point-of-change property that motivated it — `x="#bar_title_w + #bar_icon_w"` — without new schema.

### 7.3 Multi-Target Portability

Together with `#screen_width` / `#screen_height`, the above means **one screen file can usually serve several display sizes**. Where a layout genuinely cannot scale — a 256×64 board versus a 128×32 — a screen may declare per-target overrides rather than duplicating the file:

```xml
<screen name="home">
    <view>
        <status_bar x="0" y="0" width="#screen_width" />
        <wd_service_list x="0" y="13" width="#screen_width" height="38">
            <target_override target="compact" height="18" />
        </wd_service_list>
    </view>
</screen>
```

*[Q-1] Is `<target_override>` sufficient, or do sufficiently different displays need whole alternative `<view>` blocks selected by target? Defer until two real targets exist to test against.*

---

## 8. Data Binding — Scalars

### 8.1 Subject Types

| Type | Declaration | Generated Setter | Notes |
|---|---|---|---|
| `int` | `<int name="temperature" value="0" />` | `ui_set_temperature(22)` | 32-bit signed |
| `string` | `<string name="station" max_len="48" />` | `ui_set_station("Euston")` | Framework-owned buffer, see §8.2 |
| `bool` | `<bool name="wifi" value="true" />` | `ui_set_wifi(false)` | |
| `time` | `<time name="system_time" />` | `ui_set_system_time(epoch_secs)` | Unix seconds; consumed by `<u8g2gl_clock>` |

The `time` type is new in 0.2. v0.1 used `bind_time="system_time"` in examples without ever declaring the type it referred to.

### 8.2 String Subject Storage

Setting a string subject **copies** into a framework-owned fixed buffer sized by `max_len`. The caller's buffer may be freed or reused immediately.

**`max_len` is usable characters, excluding the terminator.** The framework allocates `max_len + 1` bytes. A subject declared `max_len="16"` therefore stores up to 16 visible characters and costs 17 bytes. This was ambiguous in v0.2 and produced a real off-by-one in the first implementation, which read it as total buffer bytes; the wording is now explicit because the value appears in the §18 budget report and in generated storage declarations, where an off-by-one is silent.

**The declared value sizes the allocation, not merely the truncation point.** A generator emitting storage for a string subject must emit exactly `max_len + 1` bytes; a runtime that allocates a fixed maximum regardless of the declaration makes the §18 budget report untrue, which §1.3 forbids.

*Rationale:* The alternative — storing the caller's pointer — creates exactly the lifetime hazard §9 exists to eliminate. Copy cost is trivial for scalars; the RAM is declared, bounded, and reported (§18). Truncation at `max_len` is silent at runtime but produces a build-time warning if a `bind_text_fmt` format string can provably exceed it.

### 8.3 Sigils

| Sigil | Meaning | Where valid |
|---|---|---|
| `#name` | Constant reference | Any attribute value |
| `$name` | Element prop reference | Inside a `<widget>` body |
| bare | Subject name | Only inside `bind_*` attributes and `subject=` |

Bare subject references are unambiguous because they are only legal in positions that accept nothing else. The validator enforces this.

**Naming.** v0.1 stated a `subject_*` prefix convention that none of its own examples followed. The convention is withdrawn: subjects are named plainly (`temperature`), and the generator prefixes the emitted C++ symbol (`ui_subject_temperature`). The convention lives in the generated code, not in the author's XML.

### 8.4 Binding Forms

**Value binding:**
```xml
<u8g2gl_label bind_text="station_name" />
<u8g2gl_label bind_text="temperature" bind_text_fmt="%d°C" />
<u8g2gl_progress_bar bind_value="loading_percent" />
```

`bind_text_fmt` uses `printf` syntax. The generator type-checks the conversion against the subject's type and rejects mismatches at build time.

**Geometry binding.** Per **[D-20]** `x`, `y`, `width` and `height` bind like any other property:

```xml
<u8g2gl_label name="title" x="0" y="0" height="11" bind_width="title_width" />
<u8g2gl_box   name="bar"   x="4" y="20" height="6"  bind_width="level" />
```

This is the whole of runtime layout. There is no layout pass and no reflow: an element that must move or resize is driven by a subject the application sets, or by a custom element that owns it and calls `set_w()` directly. [D-7] is untouched.

Note the asymmetry this creates with the drawing set — a bound `<u8g2gl_box>` needs no object, because a full-frame redraw ([D-4]) reads the subject at draw time (§13.5). A bound `<u8g2gl_label>` does, because it carries state regardless.

**A container whose own geometry is bound may not have anchor-positioned children.** Its children would need re-resolving whenever the binding changed, which is reflow. Absolute coordinates only, enforced as a diagnostic.

**Conditional flags:**
```xml
<u8g2gl_xbm src="icon_wifi">
    <bind_flag_if_eq subject="wifi_connected" ref_value="0" flag="hidden" />
</u8g2gl_xbm>
```

Variants: `bind_flag_if_eq`, `_if_not_eq`, `_if_gt`, `_if_lt`. Flags: `hidden`, `disabled`.

**C++ callback escape hatch:**
```xml
<u8g2gl_label name="status">
    <event_cb trigger="value_changed" callback="on_status_changed" />
</u8g2gl_label>
```

The generator emits an `extern` declaration; the user provides the definition. A missing definition is a link error with a comment in the generated header explaining the expected signature.

---

## 9. Collection Data

Per **[D-8]**, collections are not subjects. This is the most substantially redesigned section.

### 9.1 The Problem With v0.1

```c
wd_service_list_data_t data;      // stack local
data.rows[0].cells[0] = "1";      // pointers to ... what, exactly?
u8g2gl_set_departures(&data);     // widget stores &data
```

The widget retained a pointer into a stack frame that died on return, and the cell pointers had no defined lifetime. It also required the controller to include the widget's private header and know its struct layout — tighter coupling than the imperative API it was replacing.

### 9.2 The v0.2 Model — Declared Capacity, Framework Storage

The widget declares its capacity in XML. The generator allocates the storage statically, emits a typed API, and reports the RAM cost.

```xml
<wd_service_list name="departures"
    max_rows="16" max_cols="6" max_cell_chars="24" ... />
```

```cpp
// generated/ui.hpp — emitted from the XML above
class ui_departures_rows {
public:
    void begin();                                  // clear, start a batch
    bool add_row(std::initializer_list<const char*> cells);
    bool add_row(const char* const* cells, size_t n);
    void commit();                                 // publish; marks dirty
    size_t capacity() const { return 16; }
};
extern ui_departures_rows ui_departures;
```

```cpp
// user controller
ui_departures.begin();
for (const auto& svc : services) {
    ui_departures.add_row({ svc.platform, svc.time, svc.dest, svc.coaches, svc.status });
}
ui_departures.commit();
```

**Properties of this design:**

- **No lifetime hazard.** `add_row` copies each cell into the framework's buffer. The caller's strings may be transient.
- **Bounded and visible.** `16 × 6 × 24 = 2304 bytes`, declared in XML, reported by the build (§18). No hidden allocation, no heap.
- **Declared, not capped.** The defaults suit the baseline; they are not limits. A project on a part with room to spare may declare `max_rows="500"` and the framework neither knows nor cares — it allocates what was asked for and reports the cost ([D-1]).
- **Overflow is explicit.** `add_row` returns `false` past capacity rather than corrupting memory; the CLI can also warn when a screen's declared capacity exceeds a configured RAM budget.
- **No inverted dependency.** `globals.xml` knows nothing about widget internals. v0.1's `<data name="departures" type="wd_service_list_data" />` made the global subject registry depend on a widget's private header.
- **Atomic.** `begin`/`commit` bracketing means the widget never renders a half-populated table.

### 9.3 Zero-Copy Escape Hatch — *Deferred*

For very large datasets where 2 KB of copies is unacceptable, a pull model (the widget calls back for cell `(row, col)` at render time) avoids the copy entirely at the cost of a lifetime contract the user must honour. Not in v1. Recorded so the door stays open.

---

## 10. Styling

Monochrome collapses the styling domain to a small set:

| Property | Values | Description |
|---|---|---|
| `font` | Font name | Typography |
| `draw_color` | `0`, `1`, `xor` | Pixel value |
| `invert` | `true` / `false` | XOR region (selection highlighting) |
| `padding` | int px | Internal spacing |
| `border` | `true` / `false` | 1px outline |
| `radius` | int px | Rounded corners |
| `align` | `left` / `center` / `right` | Text alignment |
| `truncate` | `true` / `false` | Ellipsis on overflow |
| `font_mode` | `solid` / `transparent` | Text background |
| `bitmap_mode` | `solid` / `transparent` | XBM background |

```xml
<styles>
    <style name="header" font="small_9" draw_color="1" />
    <style name="selected" invert="true" />
</styles>

<u8g2gl_label text="Title"><style name="header" /></u8g2gl_label>
```

Inline overrides use the `style_` prefix: `style_invert="true"`.

**Omitted from LVGL Pro** (no monochrome meaning): `bg_color`, `bg_opa`, `bg_grad_*`, `shadow_*`, `transform_scale`, `text_color`, `<bind_style>`.

**Part+state selectors are omitted, with one exception.** §12 introduces a `focused` state, and focusable widgets accept a `focus_style` attribute naming a style applied while focused. This is deliberately not a general part+state system — it is one state, one hook, because focus rendering is the single case where monochrome UI genuinely needs conditional styling.

---

## 11. Rendering Model & Widget Lifecycle

This section is authoritative and supersedes the treatment in `docs/research/`.

### 11.1 The Frame — [D-15]

**The application owns the loop; U8G2GL owns the scheduling and reports when it next needs attention.** This follows LVGL 9's model directly.

```cpp
void setup() {
    u8g2gl_set_tick_cb(millis);      // pull time source; millis is the Arduino default
    ui_init();
}

void loop() {
    uint32_t idle_ms = ui_handler(u8g2);   // tick, and render if anything changed
    read_my_buttons();
    do_my_other_work();
    delay_or_sleep(idle_ms);               // app decides what to do with the hint
}
```

`ui_handler()` ticks every widget, renders if the frame is dirty (§11.2), and **returns the number of milliseconds until it next has work to do** — the next colon blink, scroll step, or animation frame. `UINT32_MAX` means nothing is animating and only a subject change will require a redraw.

```cpp
// generated ui_render(), called by ui_handler() when dirty
u8g2.clearBuffer();
ui_screen_home_render(u8g2);   // every visible element, in document order
u8g2.sendBuffer();
```

Per **[D-4]** every visible element draws every frame. Elements may overlap; document order is draw order.

#### How LVGL does it, and what to copy

Verified against LVGL 9.5.0:

| Concern | LVGL 9 | U8G2GL |
|---|---|---|
| Time source | `lv_tick_set_cb(cb)` — LVGL *pulls* the app's clock. `lv_tick_inc()` remains for ISR-driven *push* | `u8g2gl_set_tick_cb(cb)`, defaulting to `millis()`. Pull only |
| Pump | `uint32_t lv_timer_handler(void)` — *"Call it periodically... @return time till it needs to be run next (in ms)"* | `uint32_t ui_handler(U8G2&)`, same contract |
| Convenience | Three tiers: `lv_timer_handler()`, `lv_timer_handler_run_in_period(period)`, `lv_timer_periodic_handler()` | One: `ui_handler_run_in_period(u8g2, period_ms)` |
| Output | App supplies `flush_cb`; LVGL never touches hardware | App owns the `U8G2` instance and its constructor |

**The decisive borrowing is the return value.** v0.1 and earlier drafts of this spec had a boolean `ui_needs_render()`, which tells the application *that* something changed but not *when* the next thing will. Returning a deadline is strictly more useful and costs nothing to compute — every animating widget already knows its own next deadline, so the framework returns the minimum across them.

This matters more here than it does for LVGL. Monochrome projects skew towards battery and low-power work — e-paper dashboards, sensor displays, handhelds — where the ability to sleep precisely until the next visible change is worth more than it is on a mains-powered colour TFT.

**Two deliberate divergences from LVGL:**

1. **Pull-only time.** LVGL keeps `lv_tick_inc()` for ISR-driven ticking because it must support platforms with no cheap monotonic clock. Every target in [D-1] has `millis()` or equivalent. Supporting both doubles the porting surface for no benefit here.
2. **One convenience wrapper, not three.** LVGL's three tiers exist because it is ported to an enormous range of OS and bare-metal environments. U8G2GL's audience is narrower, and each extra entry point is another contract to document, test, and keep consistent.

### 11.2 Dirty Tracking Gates the Frame, Not the Widget

A frame is rendered only if a widget reported a visual state change during its tick. Subject observers, animation state, and visibility changes all set the flag.

This saves the **`sendBuffer()`** — the expensive part, since it is the full SPI/I²C transfer — not the buffer drawing. An idle screen costs one tick pass and nothing else. This is the correct and achievable form of the optimisation v0.1 mis-specified as per-widget skipping.

Applications wanting a fixed frame rate can bypass the gate and call `ui_render()` directly, ignoring `ui_handler()` entirely.

### 11.3 Widget Lifecycle

```
uint32_t tick(now_ms)          → ms until this widget next needs a tick
├── Update animation state (scroll position, blink phase, lerp progress)
├── Consume any pending subject notifications
├── Call mark_dirty() if visual state changed
└── Return own next deadline (UINT32_MAX if idle)

render(display)
├── Framework constructs u8g2gl_state_saver (RAII: font, draw colour, clip window)
├── Framework calls setClipWindow(x, y, x+w-1, y+h-1)
├── Widget draws
└── StateSaver destructor restores previous state
```

Two phases, not three. Widgets do not clear their own background — `clearBuffer()` already did (**[D-4]**).

`tick()` returns its own next deadline, and `ui_handler()` returns the minimum across all widgets ([D-15]). A widget knows this cheaply: a clock blinking at 500 ms returns the remainder to the next toggle, a scrolling label returns its step interval, a static label returns `UINT32_MAX`. Widget authors who do not care may return `UINT32_MAX` and lose nothing but the sleep hint.

The clip window is set by the framework, not the widget. It is containment insurance: a widget that miscalculates a text width cannot corrupt its neighbours. It costs two comparisons per drawn pixel and is worth it.

### 11.4 The Escape Hatch

```cpp
virtual void render_animation_update(U8G2& display, uint32_t now_ms) {}
```

Per **[D-5]**, this exists only for when the main loop is blocked and the display must still move — a firmware download, a long synchronous fetch. The application calls it explicitly from inside its blocking operation. It is not part of the normal frame.

An implementation must:
1. Call `tick(now_ms)` and check whether state actually changed (deduplication — otherwise it saturates the bus).
2. Redraw only its own region into the buffer, **clearing its bounding box first** — the buffer was not cleared on this path, which is the one place `blankArea()` semantics are genuinely required.
3. Call `u8g2gl_partial_refresh(display, x, y, w, h)`.

**Tile arithmetic.** `updateDisplayArea` takes 8-pixel tile units. The framework provides the helper because the obvious formula is wrong:

```cpp
inline void partial_refresh(U8G2& d, int x, int y, int w, int h) {
    int tx = x / 8, ty = y / 8;
    int tw = ((x % 8) + w + 7) / 8;   // NOT (w + 7) / 8
    int th = ((y % 8) + h + 7) / 8;
    d.updateDisplayArea(tx, ty, tw, th);
}
```

Every widget in the reference implementation uses `(w + 7) / 8`, which under-covers whenever `x` is not tile-aligned. A widget at `x=6, w=12` refreshes pixels 0–15 but occupies 6–17, leaving two columns stale. Centralising the helper fixes this once.

**Tiles are shared.** A widget at `y=0..10` and a separator at `y=11` occupy overlapping tile rows, so a partial refresh of one re-blits the other's pixels. That is harmless — the buffer is coherent — but it means partial refresh is never truly isolated, and two widgets animating in the same tile row will each push the other's pixels. Documented so nobody debugs it twice.

---

## 12. Input, Focus & Navigation

v0.1 listed trigger events (`button_press`, `encoder_cw`, …) and a `<screen_load_event>` tag, but had no focus model — so "a button press on this label" had no defined meaning, because nothing determined which label received it. This section supplies the missing model.

### 12.1 Boundary

**The framework does not own GPIO, interrupts, or debounce.** The application reads its own hardware and injects semantic events:

```cpp
ui_dispatch(U8G2GL_EVENT_ENCODER_CW);
ui_dispatch(U8G2GL_EVENT_ENCODER_CLICK);
ui_dispatch(U8G2GL_EVENT_BUTTON_LONG_PRESS);
```

*Rationale:* Button wiring, active-high versus active-low, debounce timing, and encoder decoding are all board-specific and already solved by libraries the user has chosen. A framework that tried to own them would be wrong on most boards.

### 12.2 Focus Ring

A screen declares an explicit, ordered focus ring. Only named, focusable elements may appear in it.

```xml
<screen name="settings">
    <view>
        <u8g2gl_button name="btn_wifi"     x="0" y="0"  width="128" height="12"
                     text="Wi-Fi"     focus_style="selected" />
        <u8g2gl_button name="btn_display"  x="0" y="14" width="128" height="12"
                     text="Display"   focus_style="selected" />
        <u8g2gl_button name="btn_back"     x="0" y="28" width="128" height="12"
                     text="Back"      focus_style="selected" />

        <focus_ring wrap="true">
            <focus name="btn_wifi" />
            <focus name="btn_display" />
            <focus name="btn_back" />
        </focus_ring>
    </view>
</screen>
```

- `EncoderCW` / `EncoderCCW` (and `ButtonNext` / `ButtonPrev`) move focus, skipping hidden and disabled elements.
- `EncoderClick` / `ButtonPress` dispatches to the focused element.
- Exactly one element holds focus. A screen with no `<focus_ring>` is non-interactive and ignores input.

*Rationale for an explicit ring rather than inferred tab order:* with absolute positioning there is no reliable reading order to infer from, and an explicit list is both readable and diffable.

### 12.3 Actions

```xml
<u8g2gl_button name="btn_wifi" text="Wi-Fi">
    <screen_load_event screen="screen_wifi" trigger="press" />
</u8g2gl_button>

<u8g2gl_button name="btn_back" text="Back">
    <screen_back_event trigger="press" />
</u8g2gl_button>

<u8g2gl_button name="btn_reset" text="Reset">
    <event_cb trigger="press" callback="on_reset_pressed" />
</u8g2gl_button>
```

Triggers on focusable elements: `press`, `long_press`. Triggers on any element: `value_changed`.

`<screen_back_event>` pops a small fixed-depth screen stack (default 4, configurable). Deeper navigation is the application's responsibility.

### 12.4 Screen Lifecycle

```cpp
void ui_screen_home_init();       // once, at boot
void ui_screen_home_activate();   // on becoming active
void ui_screen_home_deactivate(); // on switching away
uint32_t ui_screen_home_tick(uint32_t ms);   // returns next deadline ([D-15])
void ui_screen_home_render(U8G2& d);
```

No transition animations. A full-screen transition on a monochrome SPI panel is slow enough to look worse than an instant cut.

---

## 13. The XML-to-Code Contract

This section is **normative**. It is the interface between the generator and the runtime — the two are built by separate work packages, and everything either side may assume about the other is stated here. Where earlier sections describe *what* an XML construct means, this one defines *exactly what code it becomes*.

### 13.1 How the generator knows what an attribute means — [D-17]

Every other decision in this section depends on this one. Given `<u8g2gl_label font="small_9">`, how does the generator know that `font` is valid on a label, what type it takes, and what to emit?

Three models were considered:

| Model | Mechanism | Verdict |
|---|---|---|
| **Direct setters, hardcoded** | Generator holds a built-in table of widget → setter signatures, emits `lbl.set_font(...)` | Readable output, zero runtime cost — but adding a widget means editing the generator, so custom elements (§6.5) become second-class |
| **Runtime property table** | Emit `u8g2gl_obj_set_property(&lbl, U8G2GL_PROP_FONT, v)`; classes register descriptors, as `lv_obj_property` does | Uniform and extensible, but pays runtime dispatch and type erasure for a lookup we can do at build time |
| **Build-time manifest, direct setters** ✅ | Each class *declares* its properties as data the generator reads; the generator emits direct setter calls | Extensible like the property table, emits code like the hardcoded model, costs nothing at runtime |

**Decision: the third.** Widget classes ship a declarative property manifest that the generator consumes at build time; the generated code contains direct, type-checked setter calls.

*Rationale:* LVGL needs `lv_obj_property` at *runtime* because LVGL Pro can load XML on-device in its editor. U8G2GL has no runtime XML — §6.5 already deleted the parser-bridge file for exactly this reason. We need the property *descriptor*, not the property *dispatch*. Paying for runtime lookup would buy nothing, and hardcoding the generator would make the custom-widget tier a fiction.

**The manifest is the `<api>` block that §6.5 already defines.**

**Two generation targets.** The same manifest drives both, mirroring LVGL Pro's `compile --target editor|cli`:

| Target | Emitted from the manifest | Cost |
|---|---|---|
| `firmware` | Direct setter calls (§13.7) | None beyond the calls themselves |
| `editor` | A class registry (construct-by-name) and property thunks (set-by-name), compiled under `#ifdef U8G2GL_EDITOR` | Zero in firmware — compiled out |

The editor target exists because the designer must render arbitrary XML without running a C++ compiler in the browser ([ui_spec.md §UD-4](ui_spec.md)). It is the first real consumer of [PD-3]'s virtual base, and it is why the object model was specified as *ready for* dynamic construction even though firmware never uses it. Built-in widgets ship the same `<api>` declaration as custom ones — `u8g2gl_label.xml` sits beside `u8g2gl_label.hpp`. This unifies Tier 2 and Tier 4: they differ in *who wrote them*, not in how the generator handles them. The generator's knowledge of widgets is data, not code, and adding a widget requires no generator release.

```xml
<!-- runtime/widgets/u8g2gl_label.xml — ships with the framework -->
<widget name="u8g2gl_label" extends="u8g2gl_obj">
    <api>
        <prop name="text"      type="string" setter="set_text" default="" />
        <prop name="font"      type="font"   setter="set_font" required="true" />
        <prop name="align"     type="enum"   setter="set_align"
              values="left,center,right" default="left"
              emit="U8G2GL_ALIGN_{VALUE^^}" />
        <prop name="long_mode" type="enum"   setter="set_long_mode"
              values="clip,dots,scroll,scroll_circular" default="clip"
              emit="U8G2GL_LONG_{VALUE^^}" />
        <bind name="bind_text" type="string" setter="bind_text" fmt="bind_text_fmt" />
    </api>
</widget>
```

`emit` gives the enumerator spelling. `required` drives a §15 diagnostic rather than a silent default.

**`animated` is gone.** It existed solely to license static demotion, which §13.5 now replaces with the realisation rule ([D-18]). A manifest no longer declares whether its element animates; the generator determines per instance whether an object is needed.

#### `setter=` and `draw=` — the two emission targets

Per [D-18] an element may be realised as an object or as draw calls, so a manifest declares how each property reaches the display:

| Attribute | Meaning | Emitted as |
|---|---|---|
| `setter="set_font"` | A method on the element's class | `lbl.set_font(ui_font_small_9);` |
| `draw="u8g2gl_draw_box"` | A free function taking the element's geometry and properties | `u8g2gl_draw_box(d, 4, 20, 96, 8, true, 0);` |

A manifest declaring `draw=` and no class is a drawing element (§6.2); it can still be bound, in which case the generated call carries an expression or a guard rather than a literal. A manifest declaring `setter=` has a class and produces an object when §6.1's rule calls for one.

**This resolves a real ambiguity.** The shipped manifests currently spell both as `setter=` — `u8g2gl_box.xml` uses `setter="drawBox"`, naming a U8G2 method, while `u8g2gl_label.xml` uses `setter="set_text"`, naming a runtime method. The same attribute meant two different things.

### 13.2 Type mapping

| `<prop>` type | XML value | Emitted C++ | Validation |
|---|---|---|---|
| `int` | `12`, `#const`, expression | `int32_t` literal | Resolved to a literal at build time (§7.2); range-checked against the display |
| `bool` | `true` / `false` | `true` / `false` | — |
| `string` | text | `"..."` escaped, `PROGMEM` where the setter takes a `__FlashStringHelper` | Escaped for C++ string literals |
| `enum` | one of `values` | enumerator via `emit` pattern | Must be a member of `values` |
| `font` | font name | `ui_font_<name>` | Must exist in `globals.xml` `<fonts>` |
| `image` | image name | `ui_image_<name>` | Must exist in `<images>` |
| `subject` | subject name | `&ui_subject_<name>` | Must exist in `<subjects>`; type must match the binding |
| `style` | style name | `ui_style_<name>` | Must exist in a `<styles>` block in scope |
| `color` | `0`/`1`/`xor` | `U8G2GL_COLOR_*` | Monochrome set only (§10) |

All numeric coordinate attributes resolve to literal integers before emission ([D-7]) — no expression survives into generated code.

### 13.3 The object tree — flat array with parent index

Per [A-3], XML nesting is a build-time construct. The generator flattens it.

1. **Expand composites first** (§13.6). The tree the flattener sees contains only concrete elements.
2. **Walk depth-first in document order.** Each object receives its index in emission order — which is therefore also draw order ([D-4]).
3. **Record the parent index**: the index of the enclosing object, or `U8G2GL_NO_PARENT` for objects directly under `<view>`.
4. **Emit the parent table** as a static array beside the object array.

```cpp
// Objects, in document order — index is draw order
static u8g2gl_label            statusbar_title;   // 0
static u8g2gl_clock            statusbar_clock;   // 1
static u8g2gl_label            body_message;      // 2

static u8g2gl_obj* const ui_screen_home_objs[] = {
    &statusbar_title, &statusbar_clock, &body_message,
};
static const uint8_t ui_screen_home_parents[] = {
    U8G2GL_NO_PARENT, U8G2GL_NO_PARENT, U8G2GL_NO_PARENT,
};
```

The parent index is `uint8_t`, and `U8G2GL_NO_PARENT` takes one of its values, so a screen holds at most **254** objects. Exceeding that is a hard validator error; the index does not widen. [D-21] considered `uint16_t` and rejected it: it would cost a byte on every object to serve screens nobody authors for a 128×64 display. Effective visibility and clipping are computed by walking *up* the parent chain at render time — depth is 2–4 in practice, so the walk is a handful of comparisons and no child lists are stored.

### 13.4 Identifier mangling

XML names are author-facing; C++ identifiers are generated. The mapping is total, deterministic, and collision-checked.

| Kind | XML | Emitted |
|---|---|---|
| Screen function | `<screen name="home">` | `ui_screen_home_init()` etc. |
| Screen-level object | `name="title"` | `title` (static, screen's TU) |
| Composite child | `title` inside instance `statusbar` | `statusbar_title` |
| Nested composite | instance `bar` → instance `clk` → `digits` | `bar_clk_digits` |
| Subject | `<int name="temperature">` | `ui_subject_temperature`, `ui_set_temperature()` |
| Font | `<bdf name="small_9">` | `ui_font_small_9` |
| Image | `<xbm name="icon_wifi">` | `ui_image_icon_wifi` |
| Style | `<style name="header">` | `ui_style_header` |

**Rules.** Names match `[a-z][a-z0-9_]*` — lowercase, no leading digit, no double underscore. Reserved: anything beginning `u8g2gl_`, `ui_`, `wd_`, or matching a C++ keyword. Composite instance names prefix their children with `_`. **A collision after mangling is a hard generate-time error naming both sources** — never silently renamed, because a silent rename would make the generated code stop matching the XML the author is reading.

### 13.5 Realisation — when an object is emitted

Per **[D-18]** this is one rule, applied per instance:

> An element gets an **object** if and only if it must remember something
> between frames, or something must hold a reference to it. Otherwise it
> compiles to draw calls.

Concretely, an object is emitted when *any* of the following holds:

- the element's class carries state between frames — a scroll offset, a blink
  phase, an animation lerp, collection storage;
- it has a `bind_*` attribute or binding child **and** its class is the thing
  that must observe the subject (a drawing element instead compiles the binding
  into its call — see below);
- it has an `<event_cb>` or event child;
- it is a member of a `<focus_ring>`;
- it is a composite, or has children;
- a parent composite's generated code holds a typed pointer to it.

Otherwise the generator emits draw calls. **Nothing about the element's tag
decides this** — a `<u8g2gl_label>` may be either, and so may a `<u8g2gl_box>`.

#### Bindings without an object

Because rendering is a full-frame redraw ([D-4]), a stateless element does not
need to *store* a bound value — the generated `render()` reads it at draw time:

```cpp
u8g2gl_draw_hline(d, 0, 11, 256);                              // static
if (ui_subject_wifi.value)                                      // bound hidden
    u8g2gl_draw_disc(d, 250, 4, 2);
u8g2gl_draw_box(d, 4, 20, ui_subject_level.value, 6, true, 0);  // bound width
```

Two consequences:

1. **Frame-dirty tracking moves to the subject.** With no object observing, the
   generator registers one frame-dirty observer per subject, not one per subject per screen. `u8g2gl_mark_dirty()` marks whichever screen is active, and activating a screen marks it dirty anyway; the only cost is an occasional extra frame when a subject changes that only an inactive screen uses
   — which is *fewer* observers than one per binding whenever two elements share
   a subject, and is what §11.2 already describes ("dirty tracking gates the
   frame, not the widget").
2. **Ancestor visibility folds into the expression.** §13.3 computes effective
   visibility by walking up the parent chain at render time. For an element with
   no object the generator walks it at *build* time and emits a single
   conjunction — `if (!bar.is_hidden() && ui_subject_wifi.value)` — which is
   strictly cheaper than the runtime walk it replaces.

The generator may hoist adjacent siblings sharing an identical condition into
one guarded block. It must **never reorder** to create that opportunity: draw
order is document order ([D-4]).

#### Font state on inline text

A text element with no object still needs `setFont` before `drawStr`, and it has
no `u8g2gl_state_saver` around it (§11.3 wraps object renders only). The
generator emits the `setFont` inline and tracks font state across consecutive
inline draws, so that neither redundant calls nor a label inheriting the
previous element's font can occur.

#### Why the old rule could not fire

The predecessor to this section demoted an element only if, first condition, *it
had no `name` attribute*. `[U-1]` subsequently made `name` **mandatory** — the
CLI errors on a missing name and the editor synthesises one and writes it into
the document — so no unnamed element could ever reach the generator and
**demotion was unreachable**. §6.2's deletion of `<u8g2gl_text>` rested on it,
and was therefore a promise the generated code did not keep.

The repair is not to special-case synthesised names. "Has no name" was only ever
a *proxy* for "nothing refers to this", and now that every element is named the
generator tests the real property directly. It can do so with certainty:
generated objects are `static` and file-local (§13.12), so nothing outside the
generated translation unit can refer to one, and every reference that exists —
bindings, focus rings, events, composite child pointers — is declared in the
project's own XML.

Realisation is **observable in the budget** (§18) and reported by `--json`
([D-16]), stating per element whether an object was emitted and which condition
caused it.

### 13.6 Composite expansion

A composite (§6.4) produces a **container object** plus its children. Expansion
runs in four steps:

1. **Bind arguments to `<api>` props** — supplied attributes, then declared
   defaults. A missing required prop is an error.
2. **Substitute `$prop`** throughout the `<view>` subtree. A `type="subject"`
   prop substitutes the *subject name*, which the enclosing `bind_*` then
   resolves (§6.4) — a two-step resolution completing entirely at build time.
3. **Prefix every `name`** in the subtree with the instance name (§13.4).
4. **Emit the container**, then its children with `parent_index` pointing at it.
   Anchors and `#parent_width` / `#parent_height` inside the subtree resolve
   against the container's declared geometry ([D-20]), not the display.

Instantiating a composite twice yields two independent containers with distinct
identifiers. The generator holds typed member pointers to any child its own code
must reach ([D-6]); children reachable only from XML are ordinary tree members.

**Inlining survives only as an optimisation.** Where a composite carries no
state, no bindings, no events and no focus members, its container adds nothing
observable and the generator may elide it, emitting the children directly. That
is a realisation decision under §13.5 and is reported in the budget — it is not
a separate authoring concept, and §6.4's semantics do not change when it
happens.

**Expansion runs first**, before flattening (§13.3), so the flattener sees only
concrete elements.

### 13.7 Emitted files and functions

**`u8g2gl_generated_config.h` is emitted alongside the screens** ([D-21]). It carries the static capacities computed from this document — objects per screen, bindings per object, total bindings, styles — and is included ahead of `u8g2gl_config.h`, whose `#ifndef` defaults then apply only to anything the generator did not set. `U8G2GL_MAX_TOTAL_BINDINGS` is the true sum across objects, not `objects × bindings`, which over-allocates whenever the worst-case object is not the typical one.


Per screen, one `.cpp`. Plus one `ui.hpp` umbrella, and one unit each for subjects, fonts, and images.

```cpp
void ui_screen_home_init();        // once at boot: construct, configure, bind
void ui_screen_home_activate();    // becoming active
void ui_screen_home_deactivate();  // leaving
uint32_t ui_screen_home_tick(uint32_t ms);   // returns next deadline ([D-15])
void ui_screen_home_render(U8G2& d);         // draw, document order
```

`init` is ordered: construct → set properties → apply styles → register bindings → wire events → build the focus ring. Bindings are registered last so no observer fires against a partly configured object.

**Every widget class is default-constructible, and is configured exclusively through setters.** The generator emits a default construction followed by setter calls; it never emits constructor arguments. This is a binding requirement on the runtime, and it exists to sever a dependency: without it the generator would need to know each class's constructor signature, which would couple the generator's development to the runtime's and defeat the purpose of this contract.

**What the generator may not assume about the runtime:** the size or field layout of any class, base-class member offsets, allocation strategy, or anything about widget internals. It knows only class names, that they are default-constructible, their `<api>` manifests (§13.1), and that `u8g2gl_obj*` is a valid pointer to any of them. Everything else is the runtime's business and may change without regenerating.

### 13.8 Binding emission

```xml
<u8g2gl_label name="temp" bind_text="temperature" bind_text_fmt="%d°C" />
```

```cpp
temp.bind_text(&ui_subject_temperature, "%d°C");
```

The generator type-checks the format string against the subject's declared type and rejects a mismatch at build time (§8.4). Conditional flags emit similarly:

```cpp
wifi_icon.bind_flag_if_eq(&ui_subject_wifi_connected, 0, U8G2GL_FLAG_HIDDEN);
```

Event callbacks emit an `extern` declaration only; the definition is the user's, and its absence is a link error whose expected signature is stated in the generated header (§8.4).

### 13.9 Determinism

Generated output is a committed artefact ([D-11]) and appears in review diffs. It must therefore be **byte-identical for identical input**:

- objects and calls emitted in document order — never hash or set order;
- includes sorted lexicographically;
- **no timestamps** — the header carries source path, schema version, and generator version only, so regenerating an unchanged project produces an empty diff;
- floating point never appears in output (all arithmetic is integer, §7.2);
- diagnostics ordered by file, then line, then column.

A generator change that alters output without an input change is a breaking change and requires a generator version bump.

### 13.10 What is never generated

The boundary matters as much as the contract:

- **The `U8G2` instance and display construction** — the application owns its hardware (§12.1).
- **Event callback bodies** — declarations only.
- **Custom widget implementations** — the generator emits calls into `wd_*` classes, never their internals ([D-6]).
- **The main loop** — the application drives `ui_handler()` ([D-15]).
- **Anything under `modules/` or the app's own sources** — generation writes only to the configured output directory ([D-11]).

### 13.11 Pipeline

```
XML → parse → validate → resolve → flatten → compile assets → emit → report
```

1. **Parse** all XML, retaining file/line/column for diagnostics.
2. **Validate** against the schema, then cross-file references — fonts, images, subjects, and element properties against their manifests (§13.1). Composite instantiation is validated on the same path as any other element, inside composites as well as screens, and a composite that instantiates itself directly or transitively is a hard error.
3. **Resolve** — expand composites (§13.6), evaluate constant arithmetic, resolve anchors and `#parent_*` to literals ([D-7], [D-20]), resolve `type="subject"` indirection.
4. **Flatten** to the object array and parent table (§13.3); apply demotion (§13.5); mangle and collision-check identifiers (§13.4).
5. **Compile assets** — BDF via `bdfconv`, PNG→XBM (§14).
6. **Emit** per §13.7, deterministically per §13.9.
7. **Report** the budget (§18), including which elements were demoted.

### 13.12 Worked example

```xml
<!-- screens/screen_home.xml -->
<screen name="home">
    <view>
        <status_bar name="bar" x="0" y="0" width="#screen_width" height="11"
                    title_subject="station_name" />
        <u8g2gl_hline name="rule" x="0" y="11" width="#screen_width" />
        <u8g2gl_label name="msg" x="0" y="16" right="0" height="12"
                      bind_text="service_message" font="small_9" align="center" />
    </view>
</screen>
```

```cpp
// generated/ui_screen_home.cpp — GENERATED, DO NOT EDIT
// Source: screens/screen_home.xml
// Schema: 0.4   Generator: u8g2gl 0.5.0   Target: default (SSD1322 256x64)

#include "ui.hpp"

static u8g2gl_obj      bar;              // 0  composite container
static u8g2gl_label    bar_location;     // 1  child of bar
static u8g2gl_xbm      bar_wifi_icon;    // 2  child of bar
static u8g2gl_clock    bar_clock;        // 3  child of bar
static u8g2gl_label    msg;              // 4
// "rule" is not here — no object required (§13.5)

static u8g2gl_obj* const ui_screen_home_objs[] = {
    &bar, &bar_location, &bar_wifi_icon, &bar_clock, &msg,
};
static const uint8_t ui_screen_home_parents[] = {
    U8G2GL_NO_PARENT, 0, 0, 0, U8G2GL_NO_PARENT,
};

void ui_screen_home_init() {
    bar.set_coords(0, 0, 256, 11);

    bar_location.set_coords(0, 0, 204, 11);       // right="52" → 256-52
    bar_location.set_font(ui_font_small_9);
    bar_location.set_long_mode(U8G2GL_LONG_SCROLL);

    bar_wifi_icon.set_coords(204, 0, 12, 11);     // right="40", width=12
    bar_wifi_icon.set_src(ui_image_icon_wifi);

    bar_clock.set_coords(216, 0, 40, 11);         // right="0" → 256-40
    bar_clock.set_font(ui_font_clock_small_7);
    bar_clock.set_blink(true);

    msg.set_coords(0, 16, 256, 12);               // right="0" → width 256
    msg.set_font(ui_font_small_9);
    msg.set_align(U8G2GL_ALIGN_CENTER);

    // bindings registered last — §13.7
    bar_location.bind_text(&ui_subject_station_name);
    bar_wifi_icon.bind_flag_if_eq(&ui_subject_wifi_connected, 0, U8G2GL_FLAG_HIDDEN);
    bar_clock.bind_time(&ui_subject_system_time);
    msg.bind_text(&ui_subject_service_message);
}

uint32_t ui_screen_home_tick(uint32_t ms) {
    uint32_t next = U8G2GL_IDLE;
    next = u8g2gl_min(next, bar_location.tick(ms));
    next = u8g2gl_min(next, bar_clock.tick(ms));
    next = u8g2gl_min(next, msg.tick(ms));
    return next;
}

void ui_screen_home_render(U8G2& d) {
    bar.render(d);                        // container: clip window, no pixels
    bar_location.render(d);
    bar_wifi_icon.render(d);              // hidden flag checked by the object
    bar_clock.render(d);
    u8g2gl_draw_hline(d, 0, 11, 256);     // no object — §13.5
    msg.render(d);
}
```

Every mechanism appears here: composite expansion with prefixed names and a real
container ([D-18]), anchor resolution against the target width, `rule` realised
as a bare draw call while every other element earned an object (§13.5), deadline
aggregation ([D-15]), bindings registered last, and a header carrying versions
but no timestamp.

**Note what changed from the previous draft of this example.** `rule` carries a
`name`, as [U-1] requires, and is *still* emitted as a draw call — because
realisation now tests whether anything refers to the element rather than whether
it was named. `bar` exists as an object where it previously vanished, which is
what gives `#parent_height` and `right="52"` inside the composite something to
measure against.

## 14. Assets & Fonts

### 14.1 Fonts

`<bdf>` declarations are compiled by **`bdfconv`**, U8G2's own tool.

**[Q-2] `bdfconv` distribution is an unsolved packaging problem and a genuine adoption risk.** It is a C program in the U8G2 source tree with no published binaries. Options:

| Option | Pros | Cons |
|---|---|---|
| Ship prebuilt binaries per platform in the npm package | Zero user setup | Three build targets to maintain; macOS notarisation |
| Compile `bdfconv` to Wasm, run under Node | One artefact, all platforms, no signing | Some build work up front |
| Require a user-installed `bdfconv` on `PATH` | No packaging work | Will defeat a large share of Windows users |

**Recommendation: Wasm.** It reuses the Emscripten toolchain already required by **[D-9]**, works identically everywhere, needs no code signing, and makes font compilation available in the browser preview for free.

`<builtin name="u8g2_font_6x10_mr" />` references U8G2's bundled fonts with no compilation step — it emits a reference to a symbol U8G2 already provides, so it needs no `bdfconv`, no packaging, and no licensing consideration beyond what the user accepted by linking U8G2 (§22.1). **This is the default path** and covers several hundred fonts; `<bdf>` exists for when a project genuinely needs its own typeface.

**Provenance.** For `<bdf>` fonts the CLI records the source path and any adjacent licence file in the generated header. This is a convenience so the user can audit what ended up in their firmware — not an obligation U8G2GL incurs. A user-supplied font is the user's asset on the user's terms; see §22.1.

### 14.2 Images

```xml
<xbm name="icon_wifi" src="assets/wifi.xbm" />
<convert name="logo" src="assets/logo.png" width="32" height="32"
         mode="threshold" threshold="128" />
```

`mode` is `threshold` (default) or `dither`. v0.1 made Floyd–Steinberg dithering the headline example; that is the wrong default for UI iconography at 16×16, where dithering produces visual noise and a hand-tuned threshold is almost always better. Dithering remains available for photographic content.

All bitmap data is emitted `PROGMEM` and drawn with `drawXBMP`.

---

## 15. Diagnostics & Developer Experience

Per §1.2 this is a primary feature, not polish.

### 15.1 Requirements

Every diagnostic must carry **file, line, column**, the offending text, and where possible a suggestion:

```
error: screens/screen_home.xml:14:32
   unknown font 'small_9'
   |
14 |     <u8g2gl_label font="small_9" ... />
   |                       ^^^^^^^
   = 3 fonts are declared in globals.xml: small_09, tall_12, clock_small_7
   = did you mean 'small_09'?
```

- Unknown identifiers (fonts, images, subjects, elements, styles) suggest the nearest declared name by edit distance.
- An unknown `setup=` display suggests near matches from the display catalogue (§5.2); a page-mode constructor is rejected with its `_F_` equivalent named.
- Geometry errors report computed values: `element extends to x=264, display is 256px wide (0..255)`.
- Over-constrained anchors name all three conflicting attributes.
- `bind_text_fmt` conversion mismatches report both the format specifier and the subject's declared type.
- Capacity declarations that exceed a configured RAM budget produce a warning naming the widget and the byte count.

### 15.2 Validation Without Generation

`u8g2gl validate` runs the full check and emits no files — suitable for CI and for editor integration.

### 15.3 Every Command Is Machine-Readable — [D-16]

**`--json` is supported on every command that produces output, and the JSON is a specified contract, not a debug dump.**

*Rationale:* §1.2 makes AI-assisted authoring the primary value, and §5.2 demonstrates the shape of the problem — a tool whose knowledge is reachable only as formatted text forces every non-human consumer to scrape it, and confines them to the questions the flag set anticipated. An agent iterating on a screen needs to read a validation failure and act on it; a skill needs to enumerate displays or fonts; CI needs to compare budgets between builds.

| Command | JSON contains |
|---|---|
| `validate` | Diagnostics with file, line, column, severity, code, message, suggestions |
| `generate` | Files written, plus the §18 budget as structured figures |
| `find` / `catalogue` | Display records per §5.2 |
| `fonts` | Declared and built-in fonts with ranges and sizes |

Two properties make this useful rather than decorative:

1. **Diagnostics carry a stable machine code** (`U8G2GL_UNKNOWN_FONT`) alongside the human message, so a consumer can branch on the failure kind without parsing prose that will be reworded.
2. **Suggestions are structured** — the near-miss candidates behind "did you mean 'small_09'?" appear as a list, so a caller can apply a fix programmatically rather than regex the sentence.

This is the mechanism by which "diagnostics are the product" (§1.2) actually pays off. A model that receives `{"code":"U8G2GL_UNKNOWN_FONT","suggestions":["small_09"],"line":14}` converges in one iteration. One that receives `Error: invalid XML` does not converge at all.

*Skills consume this surface, they do not duplicate it.* A U8G2GL skill's job is the guidance a schema cannot carry — when a `<view>` suffices and when the structure really needs C++, how to lay out a status bar that reads well at 128px, which display suits a battery build. The factual substrate (what displays exist, what fonts are declared, what failed and where) stays in the tool, where it is generated from source and cannot drift.

### 15.4 Schema Versioning

`u8g2gl.xml` declares `schema="0.4"`. The CLI refuses unknown versions and, for known-older ones, prints the specific changes required. Pre-1.0 breaking changes are expected; the requirement is that they are *diagnosable*, never silent.

**0.3 → 0.4 is breaking**, and the CLI must refuse 0.3 naming each change rather than failing obscurely:

| Change | Migration | Source |
|---|---|---|
| `<component>` removed | Becomes `<widget>` with a `<view>`; move `components/x/` to `widgets/x/` | [D-18] |
| `components/` directory removed | One `widgets/` directory for all user elements | [D-18] |
| `truncate` removed | `long_mode="clip"` | [D-19] |
| `<u8g2gl_scrolling_label>` removed | `<u8g2gl_label long_mode="scroll_circular">` — the old widget wrapped continuously, which is `scroll_circular`. `scroll` reverses at each end and is **not** what that widget did | [D-19] |
| `animated` removed from manifests | Delete the attribute; realisation is per instance | [D-18] |
| Manifest `setter=` naming a U8G2 call | Becomes `draw=` naming a runtime free function | [D-18] |

No `u8g2gl.xml` in the wild declares 0.3 outside this repository's own fixtures, which is why the break is taken now rather than carried.

---

## 16. Build Integration

**[D-11] `generated/` is committed to the repository.**

*Rationale:* The Arduino IDE cannot run a pre-build step. Committing generated output is the only way that audience can use the framework at all, and it makes codegen changes visible in code review. The cost — merge conflicts in generated files — is real but manageable when one screen maps to one file.

| Environment | Integration |
|---|---|
| **PlatformIO** | `extra_scripts` pre-build hook running `npx u8g2gl generate` |
| **CMake / ESP-IDF** | Custom command with XML inputs and generated outputs as dependencies |
| **Arduino IDE** | Run the CLI manually; commit `generated/`. Documented as the supported flow. |
| **CI** | `u8g2gl validate` plus a check that `generated/` is current (regenerate, fail on diff) |

The runtime library ships as a PlatformIO library and an Arduino library, versioned in lockstep with the CLI. A generated file records the generator version and the runtime refuses to compile against a mismatched major version.

---

## 17. Testing & Verification

Absent from v0.1 entirely. It is what makes the project maintainable.

### 17.1 Layers

| Layer | Method |
|---|---|
| **Schema** | Fixture XML files, valid and invalid, asserting exact diagnostic text |
| **Resolution** | Unit tests on anchor/arithmetic/composite-expansion, asserting resolved integers |
| **Codegen** | Golden-file tests — generated C++ compared byte-for-byte against a checked-in expectation |
| **Compilation** | Every example project compiled for each target in CI |
| **Rendering** | Snapshot tests — render to the Wasm framebuffer, compare PNG against a golden image |
| **Runtime logic** | Native unit tests on animation state machines and the subject system |

### 17.2 The Wasm Build Pays For Itself Twice

Per **[D-9]** the same Emscripten build of the runtime plus U8G2 serves as the browser preview *and* the snapshot-test harness — and departures-board's `tools/layoutsim` is a working precedent to port rather than a green-field build. A rendering regression in `u8g2gl_clock`'s dual-font alignment fails CI as a pixel diff. This is the single highest-leverage piece of infrastructure in the project and should be built early — during Phase 1, not Phase 3.

---

## 18. Memory Budget Reporting

Every `generate` run prints a budget, so §1.3's honesty is enforced by the tooling:

```
u8g2gl 0.2.0 — target 'default' (SSD1322 256x64)

  FLASH
    runtime core                      3.2 KB
    built-in widgets (4 used)         2.8 KB
    custom widgets (1)                1.9 KB
    fonts (4)                        11.4 KB
    images (2)                        0.3 KB
                                    --------
                                     19.6 KB

  RAM (static)
    framebuffer (256x64)              2.0 KB   <- derived from u8g2_m_32_8_f
    widget instances (9)              0.4 KB
    subjects (6, incl. 2 strings)     0.1 KB
    wd_service_list capacity          2.3 KB   ← 16 rows x 6 cols x 24 chars
                                    --------
                                      4.8 KB

  warning: screens/screen_home.xml:12 — wd_service_list capacity is 2.3 KB,
           48% of this target's declared RAM budget (--ram-budget=4800)
```

Figures come from the linker map for a reference build, the statically declared capacities, and — for the framebuffer — the exact tile dimensions in U8G2's buffer allocator ([D-14]). **They are indicative until measured**, and establishing real numbers is a Phase 1 deliverable.

**What this report is actually for.** Against the `esp32dev` baseline ([D-1]) — 520 KB SRAM, 4 MB flash — a ~20 KB flash and ~5 KB RAM framework is noise. departures-board already carries this exact workload there while also running WiFi, TLS, an async web server, and a streaming JSON parser. The budget report does not exist because the framework is near a limit.

**The budget is per target, and it is the user's number, not the framework's.** A `--ram-budget` set per `<target>` reflects what that board can spare after WiFi, TLS, and the application's own needs — tight on `esp32dev`, generous on an S3 with PSRAM. U8G2GL imposes no ceiling of its own ([D-1]); it reports against the ceiling you set.

Within that, the report exists to catch cases where a *project* wanders into trouble, which are almost always declarative mistakes rather than framework cost:

- A collection capacity declared far larger than the data needs — `max_rows="256"` on a table that shows eight.
- A font `range` that pulls in a full CJK or symbol block instead of the 96 characters actually used, which is by far the largest flash line in a typical build.
- Enough screens or widget instances accumulating that per-instance cost stops being negligible.

Each of those is invisible in XML and obvious in a budget table, which is the point. Reporting also keeps §1.3's honesty enforced by tooling rather than by good intentions.

---

### 18.1 Capacity reporting — [D-21]

The budget also reports how much of each static pool the project uses, because a
capacity is the same class of fact as a size and is discovered too late if it is
only discovered on hardware:

```
  CAPACITY (generated — see u8g2gl_generated_config.h)
    objects, busiest screen              47 / 254   screen_departures
    bindings, busiest object              6         lbl_next_service
    bindings, total                      91
    styles                                5
```

The object ceiling of 254 is structural — `parent_index_` is a `uint8_t` and one
value is the root sentinel ([A-3]) — so the validator rejects a screen that
exceeds it, naming the screen and its count. The other figures have no fixed
ceiling: they are what the generator emitted, and they exist in the report so a
project can see itself approaching a limit rather than meeting one.

## 19. Naming Conventions

| Convention | U8G2GL | LVGL Pro |
|---|---|---|
| Built-in widget tags | `u8g2gl_label`, `u8g2gl_box` | `lv_label`, `lv_obj` |
| Custom widget prefix | `wd_` | `wd_` |
| Constants | `#const_name` | `#const_name` |
| Element props | `$prop_name` | `$prop_name` |
| Subjects (XML) | plain (`temperature`) | `subject_*` |
| Subjects (generated) | `ui_subject_temperature` | — |
| Screen files | `screen_*.xml` | `screen_*.xml` |
| Element dirs | `widgets/name/name.xml` | `components/`, `widgets/` |
| Generated files | `ui_screen_*.cpp` | similar |

### 19.1 The `u8g2gl_` Prefix — [D-12]

**Every XML tag supplied by the framework carries the `u8g2gl_` prefix, not `u8g2_`.**

*Rationale:* `u8g2_label` implies the tag belongs to olikraus's U8G2 library. It does not. Even though a `u8g2_*` XML tag creates no *technical* collision on its own — XML tags and C symbols occupy different spaces — the tag maps 1:1 onto a generated C++ class name (§19.2), where the collision would be real, and the vocabulary should not borrow another project's identity in any case. A user reading `<u8g2_label>` reasonably assumes U8G2 defines it, and will search U8G2's documentation for it. `<u8g2gl_label>` is two characters longer and unambiguous about what owns it.

This is settled now rather than after release, because the prefix appears in every screen file every user will ever write.

### 19.2 Symbol Prefixes, Not Namespaces — [D-13]

**All exported C++ symbols carry a flat prefix. No namespaces.**

*Rationale:* This follows LVGL's convention — `lv_obj_t`, `lv_label_create()`, `lv_subject_set_int()` — rather than idiomatic modern C++. The reasons are specific to embedded work: symbols appear unmangled-in-spirit in linker maps and `nm` output, debugger backtraces and compiler diagnostics stay readable, Arduino sketches use `using namespace` freely enough that a namespace provides no real protection, and a prefixed header remains usable from a C translation unit if that is ever needed. A namespace *plus* a prefix would be redundant and produce `u8g2gl::u8g2gl_label`.

| Prefix | Owner | Contents | Configurable |
|---|---|---|---|
| `u8g2gl_` | Framework | Runtime classes, helpers, types — `u8g2gl_label`, `u8g2gl_clock`, `u8g2gl_obj`, `u8g2gl_state_saver`, `u8g2gl_partial_refresh()`, `u8g2gl_column_def` | No |
| `U8G2GL_` | Framework | Enumerators and macros — `U8G2GL_ALIGN_LEFT`, `U8G2GL_EVENT_ENCODER_CW`, `U8G2GL_FLAG_HIDDEN` | No |
| `ui_` | Generated | Screens, subjects, setters, fonts, images, collection accessors — `ui_screen_home_init()`, `ui_set_temperature()`, `ui_subject_temperature`, `ui_font_small_9` | Yes, via `<output prefix="...">` |
| `wd_` | User | Custom widget classes — `wd_service_list` | By the user |

**Runtime class names match their XML tags exactly.** `<u8g2gl_label>` instantiates `u8g2gl_label`; `<wd_service_list>` instantiates `wd_service_list`. This costs a lowercase_snake class name, which is unconventional C++, and buys a generator with no name-mapping table and generated code a user can read against their own XML line by line. The trade is worth it.

---

## 20. Phased Delivery

Re-scoped from v0.1. The largest change: the Wasm renderer moves from Phase 3 to Phase 1, because it is both the test harness (§17.2) and the editor's rendering engine — building it early serves two committed purposes.

### Phase 1 — Prove the Loop

**Goal: retarget one real screen of departures-board onto U8G2GL and decide whether it is better.**

- XML schema (`u8g2gl.xml`, `globals.xml`, `screens/`) and validator with §15-quality diagnostics
- `u8g2gl validate` and `u8g2gl generate`
- Runtime core: widget base, `u8g2gl_state_saver`, clip management, `ui_handler()` frame gate and tick scheduling ([D-15]), subject system (`int`/`string`/`bool`/`time`)
- Built-in widgets: `u8g2gl_label`, `u8g2gl_xbm`, and the static primitives
- Simple binding: `bind_text`, `bind_text_fmt`, `bind_value`, `bind_flag_if_*`
- Build-time layout: anchors, constant arithmetic, `#screen_width`/`#screen_height`
- Font pipeline: `bdfconv` via Wasm
- Display catalogue generated from U8G2, with `find` query modes and `--json` (§5.2, [D-16])
- **Wasm render target + snapshot tests**
- **Measured memory budget** (§18)

**Exit criterion:** the departures-board status bar renders identically from XML, verified by pixel-diff against the current firmware output, and the measured budget is comfortable on `esp32dev` ([D-1]) — the same part the hand-written version already runs on. If it is not better than the existing JSON pipeline, stop here — that is a legitimate outcome and the work to that point still improves departures-board.

### Phase 2 — Composition & Animation

- Composite elements: `<widget>` with a `<view>`, `<api>`, `<prop>`, expansion ([D-18])
- Custom widget system: `<widget>` + C++ inheritance
- Animated built-ins: `u8g2gl_clock`, `u8g2gl_progress_bar`. Scrolling text is `long_mode` on `u8g2gl_label`, not a separate widget ([D-19])
- Collection API (§9)
- `<row>` / `<col>` stacking sugar
- Image pipeline: XBM and PNG→XBM
- The full departures-board screen set retargeted

### Phase 3 — Interaction & the Editor

**The editor is the programme's destination (§1.2), not an optional extra.** It is third in sequence only because it cannot be built before the schema (Phase 1) and the pixel-exact renderer (Phase 1, §17.2) exist — not because it is discretionary.

- Focus groups, input dispatch, screen navigation (§12)
- `u8g2gl_button`, `u8g2gl_switch`, `focus_style`
- **Visual designer** — a web application: canvas with pixel-exact Wasm rendering, direct manipulation (select, drag, nudge by keyboard, align, snap), a property panel driven by `<api>` manifests ([D-17]), an element palette, and lossless XML round-trip. Specified separately in [ui_spec.md](ui_spec.md).
- Hot reload for text-editor workflows, sharing the editor's renderer
- Font and glyph browser

### Phase 4 — Beyond the first editor release

- BDF pixel editor
- Additional built-in widgets driven by demonstrated demand
- `<row>` / `<col>` stacking sugar (§7.2), if usage has shown the need

---

## 21. Open Questions

| ID | Question | Blocks |
|---|---|---|
| **Q-1** | *Narrowed by [D-14].* Target **declaration** is settled — displays come from U8G2's catalogue. What remains open is only the **layout** half: is `<target_override>` enough to retarget a screen across very different geometries (256×64 vs 128×32), or are alternative `<view>` blocks needed? Defer until two real targets exist to test against. | Phase 2 |
| **Q-2** | `bdfconv` distribution — Wasm recommended; Emscripten is already proven in departures-board's `layoutsim`, so this is packaging work rather than unknown risk | Phase 1 |
| ~~Q-3~~ | ~~Project and XML-vocabulary naming~~ | **Resolved** — name kept; `u8g2gl_` prefix adopted throughout, see [D-12]/[D-13] |
| **Q-4** | Confirm the measured runtime budget against the `esp32dev` baseline — the floor, not the target ([D-1]). Expected comfortable, since departures-board already runs this workload there, so this is verification rather than open risk. | Phase 1 exit |
| ~~Q-5~~ | ~~Frame-timing ownership~~ | **Resolved** — app owns the loop, framework owns scheduling and returns a sleep hint, per LVGL 9's model. See [D-15] |
| ~~Q-6~~ | ~~Framework licence~~ | **Resolved** — MIT, see §22 |
| **Q-7** | The property panel needs conditional visibility (`visible_when`) — `scroll_px_per_sec` and friends are meaningless unless `long_mode` is a scrolling value ([D-19]). Additive schema; LVGL Pro has the identical problem and does not solve it | Phase 3 |
| **Q-8** | **Repeaters.** A `<view>` is a static structure, so it can express "three carriages" but not "N carriages" (§6.5). A composite instantiated N times against a declared-capacity collection (§9) would let list rows and similar repeating structures be *designed* rather than hand-written in C++ — it is the difference between the designer reaching `wd_service_list`-shaped problems and not. Schema surface, so §1.5 applies: defer until a real screen demonstrates the need | Phase 2 |

---

## 22. Licensing

**U8G2GL is MIT licensed** — the CLI, the runtime library, and the generated code.

*Rationale:* The runtime is linked into user firmware and the generator emits code into user projects, so the licence has to permit commercial and closed-source use without conditions. Anything copyleft or non-commercial would exclude industrial HMI users — plausibly the most motivated segment of an already small audience (see [concept.md §2.1](concept.md)) — and would make the generated code legally awkward to ship.

MIT also **matches the ecosystem U8G2GL sits in**: U8G2 itself is BSD-2-Clause and LVGL is MIT, so U8G2GL adopts the same permissive posture as both the layer below it and its closest analogue.

**Consumption by more restrictive projects is unaffected.** MIT is the more permissive licence, so it flows downstream without friction — an Apache-2.0 project may consume U8G2GL by adding a dependency and a notice entry. `esp32-app-foundation` is precisely this case: Apache-2.0, already consuming LVGL and six other MIT components listed in its `THIRD-PARTY-NOTICES.md`. The only obligation MIT imposes is that the copyright and permission notice travel with distributions, which such a notices file already discharges.

This resolves [Q-6]. The concern was that departures-board is CC BY-NC-SA and U8G2GL derives design ideas from it; since the owner holds the copyright on both, there is no conflict to manage. Where code is genuinely ported from departures-board into the runtime, the owner relicenses it MIT for that purpose.

**Compatibility of dependencies:**

| Dependency | Licence | Compatible with MIT distribution |
|---|---|---|
| U8G2 (linked by user firmware) | BSD 2-clause | Yes |
| `bdfconv` (build-time tool only) | BSD 2-clause | Yes — build tool, not linked |
| Emscripten toolchain (build-time) | MIT / NCSA | Yes |

### 22.1 Fonts — Follow U8G2's Model

U8G2's own `LICENSE` sets the pattern to copy: the code is 2-clause BSD, followed by *"Fonts are licensed under different conditions"*, a pointer to the [per-font-group reference](https://github.com/olikraus/u8g2/wiki/fntgrp), and the terms for each derived group (X11/Adobe/DEC and others) enumerated in the same file. U8G2GL does the same thing, one layer up.

**`<builtin>` fonts create no new obligation whatsoever.** U8G2 is a hard prerequisite (§2.2) — its fonts are already compiled into the user's firmware under U8G2's own terms before U8G2GL is involved. A `<builtin name="u8g2_font_6x10_mr" />` declaration emits a *reference to an existing symbol*, not a copy of glyph data. U8G2GL redistributes nothing and changes nothing about the user's position.

This is a reason to make `<builtin>` the documented default path. Several hundred fonts are available with zero pipeline, zero packaging ([Q-2] does not apply to them), and zero licensing thought required beyond what the user already accepted by linking U8G2.

**`<bdf>` fonts are the user's asset and the user's call.** When a user supplies their own BDF — hand-drawn, exported from FontForge, or produced by the Phase 4 pixel editor — the pipeline compiles it into their firmware. That is exactly the workflow `bdfconv` already supports, and the licensing position is unchanged by U8G2GL doing the invoking. Provenance recording (§14.1) exists to make the user's own compliance checkable, not because U8G2GL incurs an obligation.

Summarised in the shipped `LICENSE`:

> U8G2GL is MIT licensed. Fonts are not part of U8G2GL. Fonts bundled with U8G2 remain under U8G2's terms — see https://github.com/olikraus/u8g2/wiki/fntgrp. Fonts you supply remain yours, under whatever terms they carry.

---

## Appendix A — U8G2 Primitives Foundation

Every visual element compiles to calls from this API. The full audit is in [docs/research/u8g2_primitives_audit.md](research/u8g2_primitives_audit.md).

**Geometry** — `drawBox`, `drawFrame`, `drawRBox`, `drawRFrame`, `drawLine`, `drawHLine`, `drawVLine`, `drawCircle`, `drawDisc`, `drawEllipse`, `drawFilledEllipse`, `drawTriangle`, `drawPixel`

**Text** — `drawStr`, `drawUTF8`, `drawGlyph`, `drawButtonUTF8`

**Bitmaps** — `drawXBMP` (PROGMEM, preferred), `drawXBM` (RAM)

**State** — `setDrawColor`, `setFont`, `setFontMode`, `setBitmapMode`, `setClipWindow`, `setMaxClipWindow`, `setFontPosTop`

**Metrics** — `getStrWidth`, `getUTF8Width`, `getMaxCharWidth`, `getMaxCharHeight`, `getAscent`, `getDescent`

**Display** — `clearBuffer`, `sendBuffer`, `updateDisplayArea`

### Key Implementation Notes

- **`setFontPosTop()`** is the framework default — widget `y` is top-left, not baseline.
- **`setDrawColor(2)` (XOR)** enables selection highlighting and blink without a second render path. Exposed as `draw_color="xor"` / `invert="true"`.
- **`drawXBMP`** always; the generator emits `PROGMEM` arrays.
- **`drawButtonUTF8`** handles border, padding, centring, and inversion in one call — the intended implementation of `u8g2gl_button`.
- **`updateDisplayArea`** uses 8-pixel tiles; use `u8g2gl_partial_refresh` (§11.4), never hand-rolled tile maths.
- **`u8g2gl_state_saver`** wraps every widget render (framework-applied, not per-widget).

---

## Appendix B — Changes from v0.1

| Area | v0.1 | v0.2 | Why |
|---|---|---|---|
| Language | Ambiguous C/C++ | C++ **[D-3]** | v0.1 mixed C naming with `U8G2*` and RAII |
| Render model | "Framework skips unchanged widgets" | Full redraw; frame-level gate **[D-4]** | Skipping is impossible after `clearBuffer()` |
| `renderAnimationUpdate` | Third lifecycle phase | Escape hatch only **[D-5]** | Matches the reference implementation's own contract |
| Fractal architecture | Custom widgets compose named sub-elements | Removed **[D-6]** | Runtime string lookup; contradicted the widget assessment |
| Collections | `data` subject holding a raw pointer | Declared-capacity API with copy **[D-8]** | v0.1's example was a use-after-free |
| Layout | Pixels only; a screen file per target | Pixels + build-time anchors/arithmetic **[D-7]** | v0.1 conflated fractional layout with all arithmetic |
| Preview | JS reimplementation | Wasm **[D-9]** | Avoids two diverging renderers; doubles as test harness |
| Overhead claim | "Zero runtime overhead" | Withdrawn; budget reported §18 | It was false |
| Lines | `x1,y1,x2,y2` (off-by-one in examples) | `<u8g2gl_hline>`/`<u8g2gl_vline>` with `x,y,width` | Consistent convention; matches the API |
| `<u8g2gl_text>` | Separate static tag | Removed | Duplicated `<u8g2gl_label>`; realisation handles it automatically |
| Widget tiers | Four tiers, author-visible | One element vocabulary **[D-18]** | The tiers described the generator's output, not the author's vocabulary |
| Components | A separate pure-XML tier, inlined to nothing | A widget with a `<view>`, realised as a container **[D-18]** | Having no runtime object left them with no box, no clipping and nowhere to hang behaviour |
| Primitives | Always inlined, never bindable | Free draw functions, bindable **[D-18]** | Hiding a separator on a flag was impossible; classes would have cost RAM for no state |
| Static demotion | Six conditions, first being "no `name`" | One realisation rule **[D-18]** | `[U-1]` made `name` mandatory, so the old rule could never fire |
| Scrolling text | A second widget class | `long_mode` on the label **[D-19]** | Two manifests identical but for three properties |
| Geometry | Build-time literals only | Bindable; no layout pass **[D-20]** | Composites need to resize; a layout engine is still refused |
| `bind_time` | Used, never declared | `time` subject type added | Undeclared type |
| Subject naming | `subject_*` convention, never followed | Plain in XML, prefixed in generated code | Convention nobody obeyed |
| Units | `scroll_speed="25"` | `scroll_px_per_sec`, `*_ms` | Three contradictory readings existed |
| Parser bridge | `wd_*_parser.c` required | Removed | Only needed for runtime XML, which does not exist here |
| Input/focus | Trigger table, no focus model | Explicit `<focus_ring>` §12 | v0.1's triggers had no defined target |
| Targets | AVR mentioned; page mode "optional" | ESP32/RP2040/STM32, full-buffer only **[D-1][D-2]** | Page mode breaks the widget contract |
| PNG conversion | Dithering as default | Threshold default | Dithering is wrong for small UI icons |
| XML tag prefix | `u8g2_label` | `u8g2gl_label` **[D-12]** | `u8g2_` implied the tag belongs to olikraus's library |
| C++ symbols | Unspecified / mixed | Flat `u8g2gl_` / `U8G2GL_` / `ui_` prefixes, no namespaces **[D-13]** | Follows LVGL's `lv_` convention; survives linker maps and `using namespace` |
| Licence | Open question | MIT §22 | Runtime links into user firmware; must permit commercial use |
| Display targets | Hand-typed `controller`/`width`/`height` | `setup=` constructor, catalogue generated from U8G2 **[D-14]** | Geometry cannot drift from hardware; validation and `_F_` filtering come free |
| Frame timing | `bool ui_needs_render()` | `uint32_t ui_handler()` returning ms-until-next-work **[D-15]** | Copies LVGL 9's `lv_timer_handler` contract; a deadline lets the app sleep precisely, a bool does not |
| Display discovery | Hand-typed target; no discovery | Queryable catalogue with identify / source / compare modes §5.2 | Real question is "I have this module" or "what should I buy", not "filter a list" |
| Tool output | Human text only | `--json` contract on every command **[D-16]** | Agents and skills are first-class consumers, per §1.2 |
| XML→code mapping | Pipeline sketch + one example | Normative contract §13 | It is the interface between generator and runtime, built by separate work packages |
| Widget property knowledge | Undefined | Build-time `<api>` manifests **[D-17]** | Custom widgets stay first-class without a generator release, at no runtime cost |
| Diagnostics, build, testing, budget | Absent | §15–§18 | These determine adoption and maintainability |
