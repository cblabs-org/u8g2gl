# U8G2 Drawing Primitives Audit

> [!WARNING]
> **Frozen research input.** Written before design spec v0.2. The API inventory and primitive→widget mapping remain accurate and are still the best reference for both. Two conclusions are superseded by [design_spec.md](../design_spec.md): page mode (`firstPage`/`nextPage`) is **not** supported — it breaks the widget contract, see [D-2] — and the `updateDisplayArea` tile formula shown in §6 under-covers when the widget is not tile-aligned; use the corrected helper in spec §11.4.

A complete inventory of every U8G2 drawing API, categorised by function, with analysis of how each primitive maps to widget construction in U8G2GL.

> [!TIP]
> **Widgets = Primitives + State + Animation + Data Binding.** This audit defines the "primitives" layer — the atomic U8G2 calls that every widget is ultimately built from.

---

## 1. Geometry Primitives

The shapes U8G2 can draw. These are the building blocks of all visual output.

### Rectangles

| U8G2 API | Description | Filled | U8G2GL Usage |
|---|---|---|---|
| `drawBox(x, y, w, h)` | Filled rectangle | ✅ | Widget backgrounds, selection highlights, progress bar fill |
| `drawFrame(x, y, w, h)` | Rectangle outline | ❌ | Widget borders, input field outlines, panel frames |
| `drawRBox(x, y, w, h, r)` | Rounded filled rectangle | ✅ | Button backgrounds, tag/badge fills |
| `drawRFrame(x, y, w, h, r)` | Rounded rectangle outline | ❌ | Button outlines, card borders |

### Lines

| U8G2 API | Description | U8G2GL Usage |
|---|---|---|
| `drawLine(x1, y1, x2, y2)` | Arbitrary line between two points | Separators (diagonal), custom shapes |
| `drawHLine(x, y, w)` | Horizontal line (optimised) | Section separators, underlines — **most common** |
| `drawVLine(x, y, h)` | Vertical line (optimised) | Column dividers, sidebar borders |

> [!NOTE]
> `drawHLine` and `drawVLine` are faster than `drawLine` for axis-aligned lines — the code generator should prefer them for horizontal/vertical separators.

### Circles & Ellipses

| U8G2 API | Description | Filled | Segments | U8G2GL Usage |
|---|---|---|---|---|
| `drawCircle(x, y, r, opt)` | Circle outline | ❌ | ✅ | Gauges, indicators, clock faces |
| `drawDisc(x, y, r, opt)` | Filled circle | ✅ | ✅ | Status dots, filled indicators |
| `drawEllipse(x, y, rx, ry, opt)` | Ellipse outline | ❌ | ✅ | Decorative elements |
| `drawFilledEllipse(x, y, rx, ry, opt)` | Filled ellipse | ✅ | ✅ | Decorative elements |

**Segment options** (`opt`): `U8G2_DRAW_ALL`, `U8G2_DRAW_UPPER_RIGHT`, `U8G2_DRAW_UPPER_LEFT`, `U8G2_DRAW_LOWER_LEFT`, `U8G2_DRAW_LOWER_RIGHT`. These allow drawing quarter-circles — useful for arc gauges and pie indicators.

### Triangles & Pixels

| U8G2 API | Description | U8G2GL Usage |
|---|---|---|
| `drawTriangle(x0,y0, x1,y1, x2,y2)` | Filled triangle | Arrows, direction indicators, dropdown carets |
| `drawPixel(x, y)` | Single pixel | Custom dot patterns, sparse indicators |

---

## 2. Text Primitives

The core of most monochrome UI — text rendering is the dominant primitive.

### String Drawing

| U8G2 API | Description | U8G2GL Usage |
|---|---|---|
| `drawStr(x, y, str)` | Draw ASCII string at baseline position | Basic labels — **most common primitive overall** |
| `drawUTF8(x, y, str)` | Draw UTF-8 string (multilingual) | Labels with special chars (°, £, ü, etc.) |
| `drawGlyph(x, y, encoding)` | Draw single glyph by codepoint | Icon fonts (weather icons, symbols) |
| `drawButtonUTF8(x, y, flags, w, padding_h, padding_v, str)` | Draw text with button frame/shadow | Built-in button rendering — selectable items |

### `drawButtonUTF8` Flags (Built-in Button Primitive)

This is actually a **compound primitive** — U8G2 combines text + box + optional shadow + optional inversion:

| Flag | Effect |
|---|---|
| `U8G2_BTN_BW0` – `U8G2_BTN_BW3` | Border width (0–3 pixels) |
| `U8G2_BTN_SHADOW0` – `U8G2_BTN_SHADOW2` | Drop shadow depth |
| `U8G2_BTN_INV` | Invert text (white-on-black) |
| `U8G2_BTN_HCENTER` | Horizontally center within width |
| `U8G2_BTN_XFRAME` | Draw frame with XOR mode |

> [!IMPORTANT]
> `drawButtonUTF8` is worth considering as the foundation for U8G2GL's button/selectable-item widget — it handles border, padding, inversion, and centering in a single call.

---

## 3. Bitmap Primitives

For displaying pre-rendered images, icons, and custom graphics.

| U8G2 API | Description | Data Location | U8G2GL Usage |
|---|---|---|---|
| `drawXBM(x, y, w, h, bits)` | Draw XBM bitmap from RAM | RAM | Icons, logos, custom graphics |
| `drawXBMP(x, y, w, h, bits)` | Draw XBM bitmap from PROGMEM | Flash | **Preferred** — icons stored in flash |

> [!NOTE]
> `drawXBMP` is the standard for embedded — bitmaps live in flash (`PROGMEM`), not RAM. The code generator should emit `PROGMEM` arrays and use `drawXBMP`.

---

## 4. Display State Management

These configure *how* subsequent drawing calls behave.

### Color & Draw Mode

| U8G2 API | Description | Values | U8G2GL Usage |
|---|---|---|---|
| `setDrawColor(c)` | Set pixel value for drawing | `0` = clear, `1` = set, `2` = XOR | **Critical.** XOR mode (2) enables selection highlighting, blinking, animation overlays |
| `setFontMode(m)` | Text background transparency | `0` = solid bg, `1` = transparent bg | Determines whether text overwrites background |
| `setBitmapMode(m)` | Bitmap background transparency | `0` = solid bg, `1` = transparent bg | Whether XBM icons are opaque or transparent |

> [!IMPORTANT]
> **XOR mode (`setDrawColor(2)`)** is one of the most powerful tools in monochrome UI — it enables:
> - **Selection highlighting** without needing a "selected" render path
> - **Blinking** by XOR-drawing the same region repeatedly
> - **Overlay compositing** without destroying the background
>
> U8G2GL should expose this as a first-class style property: `draw_color="xor"` or `invert="true"`.

### Clipping

| U8G2 API | Description | U8G2GL Usage |
|---|---|---|
| `setClipWindow(x0, y0, x1, y1)` | Restrict all drawing to a rectangle | **Essential.** Every widget must clip to its bounding box to prevent overdraw |
| `setMaxClipWindow()` | Reset clip to full display | Called between widgets or at frame start |

> [!NOTE]
> Your departures-board's `U8g2StateSaver` RAII guard (save/restore font + color + clip window) is the correct pattern. The U8G2GL runtime should include this as a standard utility — every widget render should be wrapped in a state saver.

---

## 5. Font Configuration & Metrics

Critical for text layout calculations within widgets.

### Font Selection

| U8G2 API | Description | U8G2GL Usage |
|---|---|---|
| `setFont(font)` | Set active font | **Called before every text draw.** State saver must restore it. |
| `setFontDirection(dir)` | Rotation: 0°, 90°, 180°, 270° | Vertical labels (rarely used on small displays) |
| `setFontPosTop()` | Text y-coordinate = top of glyph | Simplifies bounding box calculations |
| `setFontPosBaseline()` | Text y-coordinate = baseline (default) | Default U8G2 behaviour |
| `setFontPosCenter()` | Text y-coordinate = vertical center | Centering text in a box |
| `setFontRefHeightAll()` | Height = max glyph in entire font | Consistent row heights |
| `setFontRefHeightText()` | Height = max of "A" height range | Tighter row heights |

> [!TIP]
> **`setFontPosTop()`** is the right default for U8G2GL — widgets position from top-left corners, and baseline positioning requires knowing ascent offsets per font. Top-position mode makes `drawStr(x, y)` place text where `y` = the top of the glyph box, matching the widget's `y` coordinate directly.

### Font Metrics (Measurement)

| U8G2 API | Description | U8G2GL Usage |
|---|---|---|
| `getStrWidth(str)` | Pixel width of a string | Text alignment (center, right), truncation decision |
| `getUTF8Width(str)` | Pixel width of a UTF-8 string | Same as above, for multilingual text |
| `getMaxCharWidth()` | Widest glyph in current font | Monospace column width estimation |
| `getMaxCharHeight()` | Tallest glyph in current font | Row height calculation |
| `getAscent()` | Height above baseline | Precise vertical positioning |
| `getDescent()` | Depth below baseline (negative) | Precise vertical positioning |

---

## 6. Display Control

How frames get to the physical display.

### Rendering Modes

| U8G2 API | Description | RAM Cost | U8G2GL Target |
|---|---|---|---|
| `clearBuffer()` + `sendBuffer()` | Full buffer mode — draw to RAM, then blast to display | Full display buffer (e.g., 1024 bytes for 128×64) | **Primary target.** Simplest model, best for widgets. |
| `firstPage()` / `nextPage()` | Page buffer mode — draw in chunks | ~256 bytes (partial buffer) | **Optional support.** Needed for AVR with <2KB RAM. |
| `updateDisplayArea(tx, ty, tw, th)` | Partial refresh — update only a tile region | None extra | **Animation escape hatch.** Used by `renderAnimationUpdate()`. |

> [!IMPORTANT]
> `updateDisplayArea` coordinates are in **8-pixel tile units**, not pixels. `tx` and `ty` are tile positions; `tw` and `th` are tile counts. This is critical for the partial-refresh system your departures-board uses for non-blocking animation.

### Display Configuration

| U8G2 API | Description |
|---|---|
| `setContrast(value)` | Set display contrast/brightness (0–255) |
| `setPowerSave(mode)` | Power down display (1 = off, 0 = on) |
| `setFlipMode(mode)` | Flip display 180° (for upside-down mounting) |
| `setDisplayRotation(rotation)` | Rotate display (U8G2_R0 – U8G2_R3) |

---

## 7. Built-in UI Functions (Blocking)

U8G2 includes simple blocking UI dialogs. These are **not suitable for U8G2GL widgets** (they block the main loop), but they show what U8G2 considers essential UI patterns:

| U8G2 API | Description | U8G2GL Equivalent |
|---|---|---|
| `userInterfaceMessage(t1, t2, t3, buttons)` | Blocking message dialog | `u8g2_dialog` component |
| `userInterfaceSelectionList(title, start, items)` | Blocking scrollable list | `u8g2_list` widget (non-blocking) |
| `userInterfaceInputValue(title, pre, val, lo, hi, digits, post)` | Blocking numeric input | `u8g2_number_input` component |

---

## 8. Primitive → Widget Mapping

How each U8G2GL widget is built from primitives:

```
u8g2_label
├── setFont()
├── setClipWindow()        ← clip to bounding box
├── setFontPosTop()        ← consistent positioning
├── getStrWidth()          ← for alignment calculation
├── drawStr() / drawUTF8() ← the actual text
└── [truncation]: getUTF8Width() + drawStr("...")

u8g2_scrolling_label (extends u8g2_label)
├── all of u8g2_label primitives
├── tick(): scrollX += pixelsPerMs  ← animation state
└── render(): drawUTF8(x - scrollX, y, text) with setClipWindow()

u8g2_xbm
├── setClipWindow()
├── setBitmapMode()        ← transparent or opaque
└── drawXBMP()             ← from PROGMEM

u8g2_box
├── drawBox() or drawFrame()       ← filled or outline
└── drawRBox() or drawRFrame()     ← if radius > 0

u8g2_line
├── drawHLine()            ← horizontal separator (optimised)
├── drawVLine()            ← vertical separator (optimised)
└── drawLine()             ← arbitrary angle

u8g2_circle
├── drawCircle() or drawDisc()     ← outline or filled
└── opt segments for partial arcs

u8g2_triangle
├── drawTriangle()         ← filled
└── drawLine() × 3         ← outline (no native outline triangle)

u8g2_progress_bar
├── drawFrame()            ← outer border
├── drawBox()              ← filled portion (width = percent * total)
├── tick(): lerp(current, target, dt)  ← smooth animation
└── drawStr()              ← optional percentage text

u8g2_clock
├── setFont() × 2          ← primary + optional secondary font
├── drawStr()              ← hours, colon, minutes
├── tick(): blink colon every 500ms
└── renderAnimationUpdate(): updateDisplayArea() for colon blink

u8g2_list (paginated table)
├── setFont()
├── setClipWindow()        ← clip to list bounds
├── drawStr() × columns    ← per-cell text rendering
├── drawHLine()            ← optional row separators
├── tick(): page timer, scroll lerp
└── renderAnimationUpdate(): updateDisplayArea() for smooth scroll

u8g2_glyph (icon from font)
├── setFont()              ← icon font
└── drawGlyph()            ← single codepoint

u8g2_switch (toggle indicator)
├── drawRBox() / drawRFrame() ← track
├── drawDisc()                ← knob position
└── bind_value: subject_bool  ← on/off state

u8g2_button (selectable item)
├── drawButtonUTF8()       ← compound: text + frame + inversion
└── OR: drawRBox() + drawStr() for custom styling
```

---

## 9. Primitive Categories for XML Schema

Based on the audit, the U8G2GL XML schema should support these **static primitives** (drawn directly, no widget state) at the screen level — matching what your departures-board `layout.schema.json` already had in its `"primitives"` array:

```xml
<!-- Static drawing primitives (no state, no animation, no binding) -->
<u8g2_line x1="0" y1="11" x2="256" y2="11" />
<u8g2_box x="0" y="0" width="256" height="12" filled="true" />
<u8g2_box x="0" y="0" width="256" height="12" filled="false" radius="3" />
<u8g2_circle x="64" y="32" radius="10" filled="true" />
<u8g2_triangle x0="5" y0="10" x1="10" y1="0" x2="0" y2="0" filled="true" />
<u8g2_pixel x="127" y="63" />
<u8g2_text x="10" y="5" text="Static Label" font="small_6" align="center" />
```

These compile to direct `drawHLine()`, `drawBox()`, etc. calls in the generated code — no widget struct, no tick, no state.

**Widgets** are the step up: they wrap primitives with `tick()`/`render()`/`renderAnimationUpdate()`, subject bindings, and animation state.

---

## 10. Key Architectural Decisions from the Audit

### 1. `setFontPosTop()` should be the U8G2GL default
Widget positioning is top-left origin. Baseline positioning requires per-font ascent calculations. Top-position mode eliminates this.

### 2. `U8g2StateSaver` (RAII state guard) is essential infrastructure
Every widget render must save/restore font, draw color, and clip window. Your existing implementation is exactly right.

### 3. XOR mode (`setDrawColor(2)`) is a first-class feature
It's the only efficient way to do selection highlighting on monochrome. The XML schema should expose it.

### 4. `drawButtonUTF8` is an underused U8G2 feature
It handles borders, padding, centering, and inversion in one call. Consider using it as the internal implementation for `u8g2_button` and selectable list items.

### 5. `updateDisplayArea` enables non-blocking animation
Your `renderAnimationUpdate()` pattern using tile-based partial refresh is a genuine innovation. This should be a core part of U8G2GL's widget lifecycle.

### 6. `drawXBMP` (PROGMEM), not `drawXBM` (RAM)
The code generator must emit bitmap data with `PROGMEM` and use `drawXBMP`. RAM is too scarce.
