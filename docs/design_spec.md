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
| Reusable widgets require copy-pasting C++ classes | Components and widgets declared in XML, shared as folders |
| Data flows controller→display via imperative push calls | Reactive subject binding for scalars |
| Layouts cannot be authored or reviewed by tooling | Schema-validated XML — machine-readable, diffable, LLM-authorable |

### 1.2 The Primary Thesis

The strongest argument for this project is not the market gap. It is that **a schema-validated declarative format is a dramatically better authoring target than hand-written pixel math** — for humans reviewing diffs, for tooling, and especially for LLM-assisted authoring. A model can be handed a schema, asked to produce a screen, and the result can be validated and rendered without flashing hardware. That loop does not exist today for monochrome UI.

Design consequence: **schema quality and diagnostic quality are the product.** They outrank the visual editor and are prioritised accordingly in §20.

### 1.3 Honest Cost Statement

v0.1 claimed "zero runtime overhead". That is false and the claim is withdrawn. What is true:

- **No XML parsing on the MCU.** Layout is resolved entirely at build time.
- **No layout engine on the MCU.** All coordinates are literal integers in generated code (§7).
- **There is a runtime**, and it is new code that did not previously exist: a widget base class, the subject/observer system, dirty tracking, and the built-in widget implementations.

LVGL Pro can claim near-zero overhead because it generates calls into a runtime the user already links. U8G2GL ships its runtime. The CLI must therefore **report a flash and RAM budget on every build** (§18) so that cost is visible rather than asserted away.

### 1.4 Design Principles

1. **Familiar to LVGL Pro users.** Same project structure, naming, and component/widget distinction.
2. **Pixel-exact positioning.** No fractional layout. Where layout helpers exist they resolve to integers at build time (§7).
3. **Build-time compilation.** XML → C++. No runtime interpretation.
4. **Monochrome-native.** No colour, gradients, or opacity. XOR mode and inversion are first-class.
5. **Honest about boundaries.** Where the framework cannot help (GPIO, debounce, data lifetimes), it says so and hands off cleanly rather than pretending.

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

### [D-6] Custom widgets do not compose named sub-elements

A custom widget's `<view>` is a declaration of what it extends, not an internal layout tree. Its rendering is C++.

*Rationale:* v0.1 §5's "fractal architecture" had C++ retrieving internal elements by string name — `get_element(self, "fill")` — which is a runtime string lookup inside a framework whose premise is build-time resolution. It is slow, untyped, and unvalidated. It also directly contradicted the widget design assessment, which argued (correctly) that the progress bar must be a C++ widget *because* its stipple rendering cannot be expressed as sub-element composition — while v0.1 used that same progress bar as the flagship example of sub-element composition.

*Consequence:* Composition happens at the **component** tier, in XML, inlined by the generator (§6.3). That is the correct place for it, and it is free. The "fractal" framing is withdrawn.

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

*Rationale and full contract:* §13.1. In short — LVGL needs `lv_obj_property` at runtime because its editor loads XML on-device; U8G2GL has no runtime XML, so it needs the property *descriptor* without the property *dispatch*. This keeps custom widgets (§6.4) first-class without a generator release, at zero runtime cost.

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
├── components/              ← Reusable pure-XML compositions (optional)
│   └── status_bar/
│       └── status_bar.xml
├── widgets/                 ← Custom C++-backed widgets (optional)
│   └── wd_service_list/
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
<u8g2gl schema="0.3" name="departures-board" version="1.0">
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

## 6. Widget Tiers

Four tiers, distinguished by *who writes the code*.

### 6.1 Tier 1 — Static Primitives

Direct U8G2 draw calls. No instance, no tick, no state. The generator emits them inline into `render()`.

| XML Tag | Attributes | U8G2 Call |
|---|---|---|
| `<u8g2gl_hline>` | `x`, `y`, `width` | `drawHLine` |
| `<u8g2gl_vline>` | `x`, `y`, `height` | `drawVLine` |
| `<u8g2gl_line>` | `x1`, `y1`, `x2`, `y2` | `drawLine` |
| `<u8g2gl_box>` | `x`, `y`, `width`, `height`, `filled`, `radius` | `drawBox`/`drawFrame`/`drawRBox`/`drawRFrame` |
| `<u8g2gl_circle>` | `x`, `y`, `radius`, `filled`, `segments` | `drawCircle`/`drawDisc` |
| `<u8g2gl_ellipse>` | `x`, `y`, `rx`, `ry`, `filled`, `segments` | `drawEllipse`/`drawFilledEllipse` |
| `<u8g2gl_triangle>` | `x0`,`y0`,`x1`,`y1`,`x2`,`y2`, `filled` | `drawTriangle` / 3× `drawLine` |
| `<u8g2gl_pixel>` | `x`, `y` | `drawPixel` |

**Coordinate convention.** All rectangular elements use `x`, `y`, `width`, `height` where `x`/`y` is the top-left pixel and the element occupies `x .. x+width-1` inclusive. v0.1's `<u8g2gl_line x1="0" x2="256">` on a 256-wide display was off by one and mixed two coordinate conventions in one schema; splitting axis-aligned lines into `<u8g2gl_hline>`/`<u8g2gl_vline>` fixes both, and matches the U8G2 API those cases actually compile to. Only genuinely diagonal lines use the two-point form.

**`<u8g2gl_text>` is removed.** It duplicated `<u8g2gl_label>` with a literal `text` attribute. The generator automatically demotes any `<u8g2gl_label>` with no bindings, no animation, and no name to inline draw calls — the optimisation happens without a second tag for users to choose between.

### 6.2 Tier 2 — Built-in Widgets

Ship with the framework. The user configures via XML; the framework implements the C++.

**Built-in widgets are declared exactly as custom ones are.** Each ships a `<widget>` manifest with an `<api>` block ([D-17], §13.1) alongside its implementation — `u8g2gl_label.xml` beside `u8g2gl_label.hpp`. Tier 2 and Tier 4 differ in *who wrote the widget*, not in how the generator handles it. The table below is therefore documentation of those manifests, not a separate hardcoded list inside the generator.

| XML Tag | Description | Key Properties |
|---|---|---|
| `<u8g2gl_label>` | Text with alignment and truncation | `text`, `bind_text`, `bind_text_fmt`, `font`, `align`, `truncate` |
| `<u8g2gl_scrolling_label>` | Marquee horizontal scroll | label properties + `scroll_px_per_sec`, `initial_delay_ms`, `static_dwell_ms` |
| `<u8g2gl_xbm>` | Monochrome bitmap | `src`, `bind_src`, `bitmap_mode` |
| `<u8g2gl_glyph>` | Single glyph from an icon font | `glyph`, `bind_glyph`, `font` |
| `<u8g2gl_progress_bar>` | Animated progress indicator | `bind_value`, `bind_text`, `fill_style`, `animate_duration_ms` |
| `<u8g2gl_clock>` | Time display with blinking colon | `format`, `font`, `secondary_font`, `blink`, `bind_time` |
| `<u8g2gl_switch>` | Toggle indicator | `bind_value` |
| `<u8g2gl_button>` | Focusable text item | `text`, `bind_text`, `font`, `border_width`, `focus_style` |

**All time-valued properties carry a `_ms` suffix and are milliseconds. All rate properties name their unit.** v0.1 had `scroll_speed="25"` documented as frames-per-second in one document, unitless in another, and implemented as pixels-per-40ms in the prototype. `scroll_px_per_sec` cannot be misread.

### 6.3 Tier 3 — Components (Pure XML)

User-created reusable compositions. No C++. Inlined by the generator, so they cost nothing at runtime.

```xml
<!-- components/status_bar/status_bar.xml -->
<component>
    <api>
        <prop name="title_subject" type="subject" default="station_name" />
        <prop name="wifi_subject"  type="subject" default="wifi_connected" />
        <prop name="width"         type="int"     default="#screen_width" />
        <prop name="height"        type="int"     default="11" />
        <prop name="font"          type="font"    default="small_9" />
    </api>

    <view width="$width" height="$height">
        <u8g2gl_scrolling_label name="location"
            x="0" y="0" right="52" height="$height"
            bind_text="$title_subject" font="$font" />

        <u8g2gl_xbm name="wifi_icon"
            right="40" y="0" width="12" height="$height"
            src="icon_wifi">
            <bind_flag_if_eq subject="$wifi_subject" ref_value="0" flag="hidden" />
        </u8g2gl_xbm>

        <u8g2gl_clock name="clock"
            right="0" y="0" width="40" height="$height"
            format="HH:MM" font="clock_small_7" blink="true"
            bind_time="system_time" />
    </view>
</component>
```

**On `type="subject"` props.** A prop declared `type="subject"` receives the *name* of a subject, and `bind_text="$title_subject"` therefore means "bind to whichever subject the caller named". This is a two-level indirection and v0.1 left it entirely implicit. It is resolved statically during generation — the emitted code binds directly to the concrete subject — but it must be documented, and the validator must report a clear error when a caller passes a name that is not a declared subject.

### 6.4 Tier 4 — Custom Widgets (XML + C++)

For custom rendering algorithms, state machines, or data structures. Per **[D-6]**, the XML declares the API only; all rendering is C++.

```
widgets/wd_service_list/
├── wd_service_list.xml          ← API declaration (props, child elements, capacity)
├── wd_service_list.hpp          ← Public class
└── wd_service_list.cpp          ← tick/render implementation
```

```xml
<widget name="wd_service_list" extends="u8g2gl_widget">
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

**The `<api>` block is also the generator's manifest** ([D-17], §13.1). It is the single declaration of what the widget accepts: the schema validates against it, the generator emits setter calls from it, and diagnostics quote it. A custom widget is therefore a first-class citizen — adding one requires no generator change and no framework release.

There is no `_parser.c` bridge file. v0.1 carried one over from LVGL Pro, which needs it because LVGL Pro supports *runtime* XML loading in its editor. U8G2GL has no runtime XML path, so the generator emits the setter calls directly and the bridge is dead weight.

The `extends` attribute is real C++ inheritance, which is what makes `wd_scrolling_message_pool extends u8g2gl_scrolling_label` work without reimplementing marquee rendering.

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

**Anchors.** Any element may use `right` / `bottom` instead of `x` / `y`, measured from the parent's opposite edge:

```xml
<u8g2gl_clock right="0" y="0" width="40" height="11" />
<!-- On a 256-wide target the generator emits x=216; on 128-wide, x=88 -->
```

Supplying two of `{x, width, right}` determines the third. Supplying all three is a validation error.

**Centring.** `hcenter="true"` / `vcenter="true"` centre within the parent. Odd remainders round down, deterministically and identically in preview and firmware.

**Constant arithmetic.** Coordinate attributes accept integer expressions over constants and literals: `+ - * /` with parentheses, evaluated as integers at build time.

```xml
<u8g2gl_label y="#header_height + 2" width="#screen_width - 8" />
```

**Stacking sugar.** `<row>` and `<col>` place children adjacently by summing explicit sizes. No growth, no gaps-by-distribution — pure integer accumulation.

```xml
<row y="0" height="11" gap="0">
    <u8g2gl_scrolling_label width="192" ... />
    <u8g2gl_xbm            width="12"  ... />
    <u8g2gl_clock          width="40"  ... />
</row>
<!-- generator emits x=0, x=192, x=204 -->
```

`gap` is a literal pixel count inserted between children, not a distributed remainder. There is no `grow`, no `justify`, no `space-between`.

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

*Rationale:* The alternative — storing the caller's pointer — creates exactly the lifetime hazard §9 exists to eliminate. Copy cost is trivial for scalars; the RAM is declared, bounded, and reported (§18). Truncation at `max_len` is silent at runtime but produces a build-time warning if a `bind_text_fmt` format string can provably exceed it.

### 8.3 Sigils

| Sigil | Meaning | Where valid |
|---|---|---|
| `#name` | Constant reference | Any attribute value |
| `$name` | Component prop reference | Inside a `<component>` or `<widget>` body |
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
void ui_screen_home_tick(uint32_t ms);
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
| **Direct setters, hardcoded** | Generator holds a built-in table of widget → setter signatures, emits `lbl.set_font(...)` | Readable output, zero runtime cost — but adding a widget means editing the generator, so custom widgets (§6.4) become second-class |
| **Runtime property table** | Emit `u8g2gl_obj_set_property(&lbl, U8G2GL_PROP_FONT, v)`; classes register descriptors, as `lv_obj_property` does | Uniform and extensible, but pays runtime dispatch and type erasure for a lookup we can do at build time |
| **Build-time manifest, direct setters** ✅ | Each class *declares* its properties as data the generator reads; the generator emits direct setter calls | Extensible like the property table, emits code like the hardcoded model, costs nothing at runtime |

**Decision: the third.** Widget classes ship a declarative property manifest that the generator consumes at build time; the generated code contains direct, type-checked setter calls.

*Rationale:* LVGL needs `lv_obj_property` at *runtime* because LVGL Pro can load XML on-device in its editor. U8G2GL has no runtime XML — §6.4 already deleted the parser-bridge file for exactly this reason. We need the property *descriptor*, not the property *dispatch*. Paying for runtime lookup would buy nothing, and hardcoding the generator would make the custom-widget tier a fiction.

**The manifest is the `<api>` block that §6.4 already defines.** Built-in widgets ship the same `<api>` declaration as custom ones — `u8g2gl_label.xml` sits beside `u8g2gl_label.hpp`. This unifies Tier 2 and Tier 4: they differ in *who wrote them*, not in how the generator handles them. The generator's knowledge of widgets is data, not code, and adding a widget requires no generator release.

```xml
<!-- runtime/widgets/u8g2gl_label.xml — ships with the framework -->
<widget name="u8g2gl_label" extends="u8g2gl_obj" animated="false">
    <api>
        <prop name="text"      type="string" setter="set_text" default="" />
        <prop name="font"      type="font"   setter="set_font" required="true" />
        <prop name="align"     type="enum"   setter="set_align"
              values="left,center,right" default="left"
              emit="U8G2GL_ALIGN_{VALUE^^}" />
        <prop name="truncate"  type="bool"   setter="set_truncate" default="false" />
        <bind name="bind_text" type="string" setter="bind_text" fmt="bind_text_fmt" />
    </api>
</widget>
```

`animated="false"` is what licenses static demotion (§13.5). `emit` gives the enumerator spelling. `required` drives a §15 diagnostic rather than a silent default.

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

1. **Inline components first** (§13.6). The tree the flattener sees contains no `<component>` instances, only concrete objects.
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

The parent index is `uint8_t` while a screen holds ≤ 255 objects and widens to `uint16_t` above that; the generator picks the narrower type and the runtime reads it through a typedef. Effective visibility and clipping are computed by walking *up* the parent chain at render time — depth is 2–4 in practice, so the walk is a handful of comparisons and no child lists are stored.

### 13.4 Identifier mangling

XML names are author-facing; C++ identifiers are generated. The mapping is total, deterministic, and collision-checked.

| Kind | XML | Emitted |
|---|---|---|
| Screen function | `<screen name="home">` | `ui_screen_home_init()` etc. |
| Screen-level object | `name="title"` | `title` (static, screen's TU) |
| Component-inlined object | `title` inside instance `statusbar` | `statusbar_title` |
| Nested component | instance `bar` → instance `clk` → `digits` | `bar_clk_digits` |
| Subject | `<int name="temperature">` | `ui_subject_temperature`, `ui_set_temperature()` |
| Font | `<bdf name="small_9">` | `ui_font_small_9` |
| Image | `<xbm name="icon_wifi">` | `ui_image_icon_wifi` |
| Style | `<style name="header">` | `ui_style_header` |

**Rules.** Names match `[a-z][a-z0-9_]*` — lowercase, no leading digit, no double underscore. Reserved: anything beginning `u8g2gl_`, `ui_`, `wd_`, or matching a C++ keyword. Component instance names prefix their children with `_`. **A collision after mangling is a hard generate-time error naming both sources** — never silently renamed, because a silent rename would make the generated code stop matching the XML the author is reading.

### 13.5 Static demotion — when an object is not emitted

Tier 1 primitives always inline. A Tier 2 widget is **demoted to inline draw calls** if and only if *all* hold:

- it has no `name` attribute — nothing can reference it;
- it has no `bind_*` attribute or binding child;
- it has no `<event_cb>` or event child;
- it is not a member of a `<focus_ring>`;
- its class manifest declares `animated="false"`;
- it has no children.

Otherwise an object is instantiated. This is why §6.1 could delete `<u8g2gl_text>`: a `<u8g2gl_label>` meeting these conditions compiles to the same `drawStr` a dedicated static tag would have produced, with no second tag for authors to choose between.

Demotion is **observable in the budget** (§18) and reported by `--json` ([D-16]), so an author who expects an object and gets an inline call can see why.

### 13.6 Component inlining

Components (§6.3) produce no runtime construct. Inlining is textual substitution over a parsed tree, in four steps:

1. **Bind arguments to `<api>` props** — supplied attributes, then declared defaults. A missing required prop is an error.
2. **Substitute `$prop`** throughout the component's `<view>` subtree. A `type="subject"` prop substitutes the *subject name*, which the enclosing `bind_*` then resolves (§6.3) — a two-step resolution that completes entirely at build time.
3. **Prefix every `name`** in the subtree with the instance name (§13.4).
4. **Splice** the resulting objects into the parent tree at the instance's position, inheriting its coordinate origin.

Instantiating a component twice therefore yields two independent object sets with distinct identifiers, and no runtime component representation exists.

### 13.7 Emitted files and functions

Per screen, one `.cpp`. Plus one `ui.hpp` umbrella, and one unit each for subjects, fonts, and images.

```cpp
void ui_screen_home_init();        // once at boot: construct, configure, bind
void ui_screen_home_activate();    // becoming active
void ui_screen_home_deactivate();  // leaving
uint32_t ui_screen_home_tick(uint32_t ms);   // returns next deadline ([D-15])
void ui_screen_home_render(U8G2& d);         // draw, document order
```

`init` is ordered: construct → set properties → apply styles → register bindings → wire events → build the focus ring. Bindings are registered last so no observer fires against a partly configured object.

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
2. **Validate** against the schema, then cross-file references — fonts, images, subjects, components, and widget properties against their manifests (§13.1).
3. **Resolve** — inline components (§13.6), evaluate constant arithmetic, resolve anchors to literals ([D-7]), resolve `type="subject"` indirection.
4. **Flatten** to the object array and parent table (§13.3); apply demotion (§13.5); mangle and collision-check identifiers (§13.4).
5. **Compile assets** — BDF via `bdfconv`, PNG→XBM (§14).
6. **Emit** per §13.7, deterministically per §13.9.
7. **Report** the budget (§18), including which elements were demoted.

### 13.12 Worked example

```xml
<!-- screens/screen_home.xml -->
<screen name="home">
    <view>
        <status_bar name="bar" title_subject="station_name" />
        <u8g2gl_hline x="0" y="11" width="#screen_width" />
        <u8g2gl_label name="msg" x="0" y="16" right="0" height="12"
                      bind_text="service_message" font="small_9" align="center" />
    </view>
</screen>
```

```cpp
// generated/ui_screen_home.cpp — GENERATED, DO NOT EDIT
// Source: screens/screen_home.xml
// Schema: 0.3   Generator: u8g2gl 0.3.0   Target: default (SSD1322 256x64)

#include "ui.hpp"

static u8g2gl_scrolling_label  bar_title;    // 0  from component "status_bar"
static u8g2gl_clock            bar_clock;    // 1  from component "status_bar"
static u8g2gl_label            msg;          // 2

static u8g2gl_obj* const ui_screen_home_objs[] = { &bar_title, &bar_clock, &msg };
static const uint8_t ui_screen_home_parents[] = {
    U8G2GL_NO_PARENT, U8G2GL_NO_PARENT, U8G2GL_NO_PARENT,
};

void ui_screen_home_init() {
    bar_title.set_coords(0, 0, 204, 11);
    bar_title.set_font(ui_font_small_9);

    bar_clock.set_coords(216, 0, 40, 11);        // right="0" → 256-40
    bar_clock.set_font(ui_font_clock_small_7);
    bar_clock.set_blink(true);

    msg.set_coords(0, 16, 256, 12);              // right="0" → width 256
    msg.set_font(ui_font_small_9);
    msg.set_align(U8G2GL_ALIGN_CENTER);

    // bindings registered last — §13.7
    bar_title.bind_text(&ui_subject_station_name);
    bar_clock.bind_time(&ui_subject_system_time);
    msg.bind_text(&ui_subject_service_message);
}

uint32_t ui_screen_home_tick(uint32_t ms) {
    uint32_t next = U8G2GL_IDLE;
    next = u8g2gl_min(next, bar_title.tick(ms));
    next = u8g2gl_min(next, bar_clock.tick(ms));
    next = u8g2gl_min(next, msg.tick(ms));
    return next;
}

void ui_screen_home_render(U8G2& d) {
    bar_title.render(d);
    bar_clock.render(d);
    d.drawHLine(0, 11, 256);      // demoted — unnamed, unbound, static (§13.5)
    msg.render(d);
}
```

Every mechanism appears here: component inlining with prefixed names, anchor resolution against the target width, static demotion of the separator, deadline aggregation ([D-15]), bindings registered last, and a header carrying versions but no timestamp.

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

- Unknown identifiers (fonts, images, subjects, components, styles) suggest the nearest declared name by edit distance.
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

*Skills consume this surface, they do not duplicate it.* A U8G2GL skill's job is the guidance a schema cannot carry — when to reach for a component over a custom widget, how to lay out a status bar that reads well at 128px, which display suits a battery build. The factual substrate (what displays exist, what fonts are declared, what failed and where) stays in the tool, where it is generated from source and cannot drift.

### 15.4 Schema Versioning

`u8g2gl.xml` declares `schema="0.3"`. The CLI refuses unknown versions and, for known-older ones, prints the specific changes required. Pre-1.0 breaking changes are expected; the requirement is that they are *diagnosable*, never silent.

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
| **Resolution** | Unit tests on anchor/arithmetic/component-inlining, asserting resolved integers |
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

## 19. Naming Conventions

| Convention | U8G2GL | LVGL Pro |
|---|---|---|
| Built-in widget tags | `u8g2gl_label`, `u8g2gl_box` | `lv_label`, `lv_obj` |
| Custom widget prefix | `wd_` | `wd_` |
| Constants | `#const_name` | `#const_name` |
| Component props | `$prop_name` | `$prop_name` |
| Subjects (XML) | plain (`temperature`) | `subject_*` |
| Subjects (generated) | `ui_subject_temperature` | — |
| Screen files | `screen_*.xml` | `screen_*.xml` |
| Component dirs | `components/name/name.xml` | same |
| Widget dirs | `widgets/wd_name/wd_name.xml` | same |
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
| `u8g2gl_` | Framework | Runtime classes, helpers, types — `u8g2gl_label`, `u8g2gl_clock`, `u8g2gl_widget`, `u8g2gl_state_saver`, `u8g2gl_partial_refresh()`, `u8g2gl_column_def` | No |
| `U8G2GL_` | Framework | Enumerators and macros — `U8G2GL_ALIGN_LEFT`, `U8G2GL_EVENT_ENCODER_CW`, `U8G2GL_FLAG_HIDDEN` | No |
| `ui_` | Generated | Screens, subjects, setters, fonts, images, collection accessors — `ui_screen_home_init()`, `ui_set_temperature()`, `ui_subject_temperature`, `ui_font_small_9` | Yes, via `<output prefix="...">` |
| `wd_` | User | Custom widget classes — `wd_service_list` | By the user |

**Runtime class names match their XML tags exactly.** `<u8g2gl_label>` instantiates `u8g2gl_label`; `<wd_service_list>` instantiates `wd_service_list`. This costs a lowercase_snake class name, which is unconventional C++, and buys a generator with no name-mapping table and generated code a user can read against their own XML line by line. The trade is worth it.

---

## 20. Phased Delivery

Re-scoped from v0.1. The largest change: the Wasm renderer moves from Phase 3 to Phase 1, because it is the test harness (§17.2), and the visual editor moves out of the committed plan entirely.

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

- Component system: `<component>`, `<api>`, `<prop>`, inlining
- Custom widget system: `<widget>` + C++ inheritance
- Animated built-ins: `u8g2gl_scrolling_label`, `u8g2gl_clock`, `u8g2gl_progress_bar`
- Collection API (§9)
- `<row>` / `<col>` stacking sugar
- Image pipeline: XBM and PNG→XBM
- The full departures-board screen set retargeted

### Phase 3 — Interaction & Preview

- Focus ring, input dispatch, screen navigation (§12)
- `u8g2gl_button`, `u8g2gl_switch`, `focus_style`
- Browser preview: file watcher, hot reload, the Phase 1 Wasm renderer in a page
- Font and glyph browser

### Phase 4 — *Speculative, not committed*

- Drag-and-drop visual editor
- BDF pixel editor
- Additional built-in widgets driven by demonstrated demand

*Rationale for demoting the editor:* it is a multi-month effort serving an audience that may not exist (see [docs/concept.md](concept.md) §Market Reality). The Phase 3 hot-reload preview delivers most of the practical benefit — see the layout without flashing — for a small fraction of the cost. Building the editor should require evidence of demand, not enthusiasm.

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

**`<bdf>` fonts are the user's asset and the user's call.** When a user supplies their own BDF — hand-drawn, exported from FontForge, or produced by the speculative Phase 4 pixel editor — the pipeline compiles it into their firmware. That is exactly the workflow `bdfconv` already supports, and the licensing position is unchanged by U8G2GL doing the invoking. Provenance recording (§14.1) exists to make the user's own compliance checkable, not because U8G2GL incurs an obligation.

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
| `<u8g2gl_text>` | Separate static tag | Removed | Duplicated `<u8g2gl_label>`; generator demotes automatically |
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
