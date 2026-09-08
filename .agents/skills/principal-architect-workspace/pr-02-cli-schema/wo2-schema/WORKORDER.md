---
name: pr-02-cli-schema-wo2
description: Handoff instructions for Work Order 2 — Schema Types
complexity: standard
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not create additional branches, and do not plan beyond this
> checklist. Your task is strictly limited to executing the checklist below.

# Objective

Define the complete TypeScript type system for U8G2GL schema version 0.3 in
`cli/src/core/schema/`. These types are the document model that every downstream
consumer — validator, generator, editor — works against. They cover all XML file
types defined in design_spec §5, the `<api>` manifest model from §13.1, display
catalogue records from §5.2, diagnostics from §15/[D-16], and source location
tracking.

# Parent PR & Authorization

This work order belongs to **PR-02: CLI Foundation, Schema, Validator, Display
Catalogue**. Human approval recorded in:
`.agents/skills/principal-architect-workspace/pr-02-cli-schema/PROJECT.md`
(status log, 2026-09-08T23:08:28Z).

# Context You Must Read

Before writing any code, read these files in order:

1. `.agents/skills/u8g2gl-standards/SKILL.md` — §2 TypeScript naming
2. `.agents/skills/u8g2gl-standards/references/typescript.md` — full TS rules
3. `docs/design_spec.md` — the following sections:
   - §5 (Core XML Files, lines ~260-430) — project structure, file types
   - §5.1 (u8g2gl.xml) — project file, targets, display setup
   - §5.2 (Display Catalogue, lines ~330-430) — record schema, query modes
   - §5.3 (globals.xml) — constants, subjects, styles, fonts, images
   - §5.4 (Screen files) — screen structure, view
   - §6 (Widget Tiers, lines ~430-600) — Tier 1-4, `<api>` blocks
   - §6.3 (Components) — component files, api props, view
   - §6.4 (Custom widgets) — widget manifests with `<api>` examples
   - §7 (Layout helpers) — anchors, constants, arithmetic
   - §8 (Subjects) — subject types (int/string/bool/time)
   - §9 (Collections) — declared-capacity collections
   - §10 (Styling) — style properties for monochrome
   - §12 (Input/Focus) — focus_ring, events, triggers
   - §13.1-§13.2 (Property manifests, Type mapping) — the `<api>` block model
   - §13.4 (Identifier mangling) — naming rules
   - §15.1-§15.3 (Diagnostics) — diagnostic format and codes

# Strict Boundary Box

**DO NOT:**
- Create or modify any C++ files
- Create or modify files outside `cli/src/core/schema/`, `cli/src/core/index.ts`,
  and `cli/test/`
- Implement any parsing, validation, or CLI logic
- Create additional git branches
- Modify anything in `.agents/` except appending your Completion Report

**YOU MAY:**
- Create all files under `cli/src/core/schema/`
- Create test files under `cli/test/schema/`
- Update `cli/src/core/index.ts` to re-export schema types

# Coding Standards

- PascalCase types/interfaces, camelCase functions, kebab-case files
- `readonly` on all interface properties — these are immutable data
- No classes — plain `interface` and `type` aliases (serialisation-friendly)
- Prefer union string types over `enum`
- No `any` — use `unknown` and narrow
- SPDX MIT header on every source file

# Line-Item Instructions

## Schema Types — Core Files

- [ ] **`cli/src/core/schema/source-location.ts`** — Source tracking types:
  ```ts
  interface SourceLocation {
    readonly file: string;
    readonly line: number;    // 1-based
    readonly column: number;  // 1-based
  }

  interface SourceRange {
    readonly start: SourceLocation;
    readonly end: SourceLocation;
  }

  // Wrapper that attaches a source location to any value
  interface Located<T> {
    readonly value: T;
    readonly loc: SourceLocation;
  }
  ```

- [ ] **`cli/src/core/schema/diagnostic.ts`** — Diagnostic types per §15/[D-16]:
  ```ts
  type Severity = 'error' | 'warning' | 'info';

  interface Diagnostic {
    readonly code: string;              // STABLE, e.g. 'U8G2GL_UNKNOWN_FONT'
    readonly severity: Severity;
    readonly file: string;
    readonly line: number;              // 1-based
    readonly column: number;            // 1-based
    readonly endLine?: number;
    readonly endColumn?: number;
    readonly message: string;           // human prose — may be reworded freely
    readonly offendingText?: string;    // the token/value that caused the error
    readonly suggestions?: readonly string[];  // structured, machine-applicable
  }
  ```

  Also define all known diagnostic codes as a union type and as a const
  object for runtime access:
  ```ts
  const DIAGNOSTIC_CODES = {
    UNKNOWN_FONT: 'U8G2GL_UNKNOWN_FONT',
    UNKNOWN_IMAGE: 'U8G2GL_UNKNOWN_IMAGE',
    UNKNOWN_SUBJECT: 'U8G2GL_UNKNOWN_SUBJECT',
    UNKNOWN_STYLE: 'U8G2GL_UNKNOWN_STYLE',
    UNKNOWN_COMPONENT: 'U8G2GL_UNKNOWN_COMPONENT',
    UNKNOWN_WIDGET: 'U8G2GL_UNKNOWN_WIDGET',
    UNKNOWN_DISPLAY: 'U8G2GL_UNKNOWN_DISPLAY',
    PAGE_MODE_DISPLAY: 'U8G2GL_PAGE_MODE_DISPLAY',
    UNKNOWN_ATTRIBUTE: 'U8G2GL_UNKNOWN_ATTRIBUTE',
    MISSING_REQUIRED: 'U8G2GL_MISSING_REQUIRED',
    TYPE_MISMATCH: 'U8G2GL_TYPE_MISMATCH',
    OVERCONSTRAINED: 'U8G2GL_OVERCONSTRAINED',
    OUT_OF_BOUNDS: 'U8G2GL_OUT_OF_BOUNDS',
    NAME_COLLISION: 'U8G2GL_NAME_COLLISION',
    INVALID_NAME: 'U8G2GL_INVALID_NAME',
    UNKNOWN_SCHEMA_VERSION: 'U8G2GL_UNKNOWN_SCHEMA_VERSION',
    DUPLICATE_NAME: 'U8G2GL_DUPLICATE_NAME',
    INVALID_ENUM_VALUE: 'U8G2GL_INVALID_ENUM_VALUE',
    FORMAT_MISMATCH: 'U8G2GL_FORMAT_MISMATCH',
    MALFORMED_XML: 'U8G2GL_MALFORMED_XML',
    MISSING_FILE: 'U8G2GL_MISSING_FILE',
    CIRCULAR_REFERENCE: 'U8G2GL_CIRCULAR_REFERENCE',
  } as const;
  ```

- [ ] **`cli/src/core/schema/project.ts`** — u8g2gl.xml types:
  ```ts
  // §5.1: The project file
  interface U8g2glProject {
    readonly schema: string;          // "0.3"
    readonly name: string;
    readonly version: string;
    readonly targets: readonly Target[];
    readonly output?: OutputConfig;
    readonly loc?: SourceLocation;
  }

  interface Target {
    readonly name: string;            // e.g. "default"
    readonly setup: string;           // U8G2 constructor, e.g. "U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI"
    readonly rotation?: string;       // "R0" | "R1" | "R2" | "R3"
    readonly bus?: BusConfig;
    readonly ramBudget?: number;      // --ram-budget equivalent, in bytes
    readonly loc?: SourceLocation;
  }

  interface BusConfig {
    readonly cs?: string;
    readonly dc?: string;
    readonly reset?: string;
    readonly loc?: SourceLocation;
  }

  interface OutputConfig {
    readonly dir?: string;            // default "generated/"
    readonly prefix?: string;         // default "ui_"
    readonly loc?: SourceLocation;
  }
  ```

- [ ] **`cli/src/core/schema/globals.ts`** — globals.xml types (§5.3, §8, §10):
  ```ts
  interface Globals {
    readonly consts: readonly ConstDecl[];
    readonly subjects: readonly SubjectDecl[];
    readonly styles: readonly StyleDecl[];
    readonly fonts: readonly FontDecl[];
    readonly images: readonly ImageDecl[];
    readonly loc?: SourceLocation;
  }

  // Constants (§7.2)
  interface ConstDecl {
    readonly name: string;
    readonly type: 'int' | 'string';
    readonly value: string;
    readonly loc?: SourceLocation;
  }

  // Subjects (§8)
  type SubjectType = 'int' | 'string' | 'bool' | 'time';

  interface SubjectDecl {
    readonly name: string;
    readonly type: SubjectType;
    readonly default?: string;
    readonly maxLen?: number;         // string subjects: max buffer length
    readonly loc?: SourceLocation;
  }

  // Styles (§10)
  type DrawColor = '0' | '1' | 'xor';
  type TextAlign = 'left' | 'center' | 'right';
  type FontMode = 'solid' | 'transparent';
  type BitmapMode = 'solid' | 'transparent';

  interface StyleDecl {
    readonly name: string;
    readonly font?: string;
    readonly drawColor?: DrawColor;
    readonly invert?: boolean;
    readonly padding?: number;
    readonly border?: boolean;
    readonly radius?: number;
    readonly align?: TextAlign;
    readonly truncate?: boolean;
    readonly fontMode?: FontMode;
    readonly bitmapMode?: BitmapMode;
    readonly loc?: SourceLocation;
  }

  // Fonts (§14.1)
  type FontDecl = BdfFontDecl | BuiltinFontDecl;

  interface BdfFontDecl {
    readonly kind: 'bdf';
    readonly name: string;
    readonly src: string;
    readonly range?: string;          // Unicode range filter
    readonly loc?: SourceLocation;
  }

  interface BuiltinFontDecl {
    readonly kind: 'builtin';
    readonly name: string;            // e.g. "u8g2_font_6x10_mr"
    readonly loc?: SourceLocation;
  }

  // Images (§14.2)
  type ImageDecl = XbmImageDecl | ConvertImageDecl;

  interface XbmImageDecl {
    readonly kind: 'xbm';
    readonly name: string;
    readonly src: string;
    readonly loc?: SourceLocation;
  }

  interface ConvertImageDecl {
    readonly kind: 'convert';
    readonly name: string;
    readonly src: string;
    readonly width: number;
    readonly height: number;
    readonly mode?: 'threshold' | 'dither';
    readonly threshold?: number;
    readonly loc?: SourceLocation;
  }
  ```

- [ ] **`cli/src/core/schema/screen.ts`** — Screen file types (§5.4, §12):
  ```ts
  interface Screen {
    readonly name: string;
    readonly styles?: readonly StyleDecl[];  // local styles
    readonly view: View;
    readonly loc?: SourceLocation;
  }

  interface View {
    readonly children: readonly WidgetNode[];
    readonly focusRing?: FocusRing;
    readonly loc?: SourceLocation;
  }

  // The focus ring (§12.2)
  interface FocusRing {
    readonly wrap: boolean;
    readonly entries: readonly FocusEntry[];
    readonly loc?: SourceLocation;
  }

  interface FocusEntry {
    readonly name: string;            // references a named, focusable element
    readonly loc?: SourceLocation;
  }
  ```

- [ ] **`cli/src/core/schema/widget-node.ts`** — Widget instance types
  (the elements that appear in a screen's `<view>`):
  ```ts
  // Common attributes on any element in a view
  interface CommonAttributes {
    readonly name?: string;
    readonly x?: string;              // int or expression (#const, arithmetic)
    readonly y?: string;
    readonly width?: string;
    readonly height?: string;
    readonly right?: string;          // anchor: right edge offset
    readonly bottom?: string;         // anchor: bottom edge offset
    readonly hcenter?: string;        // horizontal center
    readonly vcenter?: string;        // vertical center
    readonly hidden?: boolean;
    readonly style?: string;          // named style reference
    readonly focusStyle?: string;     // style applied while focused
  }

  // Inline style overrides use style_* prefix — captured as a map
  // e.g. style_invert="true", style_font="small_9"

  // A widget instance node in the tree
  interface WidgetNode {
    readonly tag: string;             // e.g. "u8g2gl_label", "wd_service_list"
    readonly attributes: CommonAttributes & {
      readonly [key: string]: string | boolean | undefined;
    };
    readonly styleOverrides: Readonly<Record<string, string>>;
    readonly children: readonly WidgetNodeChild[];
    readonly loc?: SourceLocation;
    readonly attributeLocs?: Readonly<Record<string, SourceLocation>>;
  }

  // Children can be: nested widgets, binding children, event children
  type WidgetNodeChild = WidgetNode | BindingChild | EventChild | StyleChild;

  // Binding children (§13.8)
  interface BindingChild {
    readonly kind: 'binding';
    readonly type: string;            // e.g. "bind_flag_if_eq"
    readonly subject: string;
    readonly value?: string;
    readonly flag?: string;
    readonly loc?: SourceLocation;
  }

  // Event children (§12.3)
  type EventTrigger = 'press' | 'long_press' | 'value_changed';

  interface EventChild {
    readonly kind: 'event';
    readonly type: 'screen_load_event' | 'screen_back_event' | 'event_cb';
    readonly trigger: EventTrigger;
    readonly screen?: string;         // for screen_load_event
    readonly callback?: string;       // for event_cb
    readonly loc?: SourceLocation;
  }

  // Style child (inline named style application)
  interface StyleChild {
    readonly kind: 'style';
    readonly name: string;
    readonly loc?: SourceLocation;
  }
  ```

- [ ] **`cli/src/core/schema/component.ts`** — Component types (§6.3):
  ```ts
  interface Component {
    readonly name: string;            // directory name
    readonly api: readonly ComponentProp[];
    readonly view: View;
    readonly loc?: SourceLocation;
  }

  interface ComponentProp {
    readonly name: string;
    readonly type: PropType;          // reuse from widget-manifest.ts
    readonly default?: string;
    readonly required?: boolean;
    readonly loc?: SourceLocation;
  }
  ```

- [ ] **`cli/src/core/schema/widget-manifest.ts`** — Widget manifest types
  (§6.4, §13.1):
  ```ts
  // The <widget> root element of a widget manifest XML
  interface WidgetManifest {
    readonly name: string;            // e.g. "u8g2gl_label"
    readonly extends: string;         // e.g. "u8g2gl_obj"
    readonly animated: boolean;       // licenses static demotion when false (§13.5)
    readonly api: ApiBlock;
    readonly loc?: SourceLocation;
  }

  interface ApiBlock {
    readonly props: readonly PropDef[];
    readonly bindings: readonly BindDef[];
    readonly elements: readonly ElementDef[];
    readonly loc?: SourceLocation;
  }

  // Property types from §13.2
  type PropType = 'int' | 'bool' | 'string' | 'enum' | 'font' | 'image'
    | 'subject' | 'style' | 'color';

  // <prop> — a widget property definition
  interface PropDef {
    readonly name: string;
    readonly type: PropType;
    readonly setter: string;          // C++ setter method name
    readonly default?: string;
    readonly required?: boolean;
    readonly animated?: boolean;
    readonly emit?: string;           // enumerator pattern, e.g. "U8G2GL_ALIGN_{VALUE^^}"
    readonly values?: string;         // comma-separated for enum type
    readonly loc?: SourceLocation;
  }

  // <bind> — a binding slot definition
  interface BindDef {
    readonly name: string;
    readonly type: string;            // subject type it accepts
    readonly setter: string;
    readonly fmt?: string;            // format setter, e.g. "bind_text_fmt"
    readonly loc?: SourceLocation;
  }

  // <element> — a child element definition (for collections, §9)
  interface ElementDef {
    readonly name: string;
    readonly access: string;          // e.g. "add"
    readonly args: readonly ElementArgDef[];
    readonly loc?: SourceLocation;
  }

  interface ElementArgDef {
    readonly name: string;
    readonly type: PropType;
    readonly maxLen?: number;         // for string columns
    readonly loc?: SourceLocation;
  }
  ```

## Schema Types — Display Catalogue

- [ ] **`cli/src/core/schema/display-record.ts`** — Display catalogue record (§5.2):
  ```ts
  type BusFamily = 'spi' | 'i2c' | 'parallel';

  interface DisplayBus {
    readonly family: BusFamily;
    readonly wiring: string;          // e.g. "4W_HW_SPI", "I2C"
    readonly raw: string;             // full suffix from constructor
  }

  interface DisplayTiles {
    readonly width: number;           // in 8-pixel tiles
    readonly height: number;
  }

  interface DisplayXOffset {
    readonly default: number;
    readonly flipmode: number;
  }

  interface DisplayRecord {
    readonly setup: string;           // full constructor name, e.g. "U8G2_SSD1306_128X64_NONAME_F_HW_I2C"
    readonly controller: string;      // e.g. "SSD1306"
    readonly variant: readonly string[];  // e.g. ["128X64", "NONAME"]
    readonly width: number;           // pixels
    readonly height: number;          // pixels
    readonly tiles: DisplayTiles;
    readonly framebufferBytes: number; // tiles.width * tiles.height * 8
    readonly bus: DisplayBus;
    readonly xOffset: DisplayXOffset;
    readonly driver: string;          // driver function name from u8x8_d_*.c
  }
  ```

## Barrel Export

- [ ] **`cli/src/core/schema/index.ts`** — Re-export all types from this directory
  with SPDX header.

- [ ] **Update `cli/src/core/index.ts`** — Re-export `./schema/index.js`

## Tests

- [ ] **`cli/test/schema/types.test.ts`** — Type-level tests:
  - Import every exported type and verify it compiles
  - Create sample instances of key types (U8g2glProject, Globals, Screen,
    Component, WidgetManifest, DisplayRecord, Diagnostic) with realistic data
    matching design_spec examples
  - Verify `DIAGNOSTIC_CODES` object has expected values
  - Assert types are readonly (compile-time, not runtime)

# Verification Requirement

1. `npm run build` — zero errors (types must compile cleanly)
2. `npm test` — all tests pass (existing smoke + new type tests)
3. `npm run lint` — zero errors (all new files in `src/core/`, boundary enforced)

**Commit on green build.** Do not wait for approval.
Branch: `u8g2gl-cli/wo2-schema`. Push to origin after committing.

**CRITICAL:** Before committing, verify branch with `git branch --show-current`.

# Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly. The
Principal Architect will triage and file them under the correct author identity.

---

## Completion Report

### Summary
Work Order 2 (Schema Types) completed in full. The complete TypeScript type system for U8G2GL schema version 0.3 has been defined under `cli/src/core/schema/`, re-exported via `cli/src/core/index.ts`, and verified with type and unit tests.

### Deliverables
1. **`cli/src/core/schema/source-location.ts`**:
   - `SourceLocation`: 1-based line and column coordinates.
   - `SourceRange`: Contiguous range between two source locations.
   - `Located<T>`: Generic container wrapping arbitrary values with source locations.

2. **`cli/src/core/schema/diagnostic.ts`**:
   - `Severity`: `'error' | 'warning' | 'info'`.
   - `Diagnostic`: Structured diagnostic interface carrying code, location, message, offendingText, and suggestions.
   - `DIAGNOSTIC_CODES`: 22 stable `U8G2GL_*` diagnostic code constants.
   - `DiagnosticCode`: Union type of diagnostic codes.

3. **`cli/src/core/schema/project.ts`**:
   - `U8g2glProject`: Root project configuration model (`u8g2gl.xml`).
   - `Target`: Hardware target and display constructor specification.
   - `BusConfig`: Pin assignment and device address parameters.
   - `OutputConfig`: Emitted C++ directory and prefix settings.

4. **`cli/src/core/schema/globals.ts`**:
   - `Globals`: Root container for `globals.xml`.
   - `ConstDecl`: Named compile-time constant integer or string.
   - `SubjectType`: `'int' | 'string' | 'bool' | 'time'`.
   - `SubjectDecl`: Reactive subject declaration with `maxLen` support for strings.
   - `DrawColor`, `TextAlign`, `FontMode`, `BitmapMode`, `StyleDecl`: Monochrome style models per §10.
   - `FontDecl`, `BdfFontDecl`, `BuiltinFontDecl`: Custom BDF and built-in U8G2 fonts.
   - `ImageDecl`, `XbmImageDecl`, `ConvertImageDecl`: XBM and converted graphics assets.

5. **`cli/src/core/schema/screen.ts`**:
   - `Screen`: Top-level screen descriptor (`screens/screen_*.xml`).
   - `View`: Root visual container sized by the active target.
   - `FocusRing`, `FocusEntry`: Explicit cyclic focus navigation ring per §12.2.

6. **`cli/src/core/schema/widget-node.ts`**:
   - `CommonAttributes`: Coordinate, anchor, sizing, visibility, and style attributes.
   - `WidgetNode`: AST element node with attributes, style overrides, children, and attribute source locations.
   - `WidgetNodeChild`: Union of widgets, bindings, events, and style children.
   - `BindingChild`: Reactive subject binding slot and flag directives.
   - `EventTrigger`, `EventChild`: Interaction events and action triggers.
   - `StyleChild`: Inline style tag elements.

7. **`cli/src/core/schema/component.ts`**:
   - `Component`: Reusable pure-XML component descriptor (`components/*/*.xml`).
   - `ComponentProp`: Component parameter declaration.

8. **`cli/src/core/schema/widget-manifest.ts`**:
   - `WidgetManifest`: Root `<widget>` API manifest descriptor (§6.4, §13.1).
   - `ApiBlock`: Public API declaration block.
   - `PropType`, `PropDef`: Property types, C++ setter mappings, defaults, and enums.
   - `BindDef`: Reactive subject binding slot descriptor.
   - `ElementDef`, `ElementArgDef`: Child collection element descriptor for declared-capacity collections (§9).

9. **`cli/src/core/schema/display-record.ts`**:
   - `BusFamily`: `'spi' | 'i2c' | 'parallel'`.
   - `DisplayBus`, `DisplayTiles`, `DisplayXOffset`: Physical display hardware parameters.
   - `DisplayRecord`: Complete catalogue record derived from U8G2 tables per §5.2.

10. **`cli/src/core/schema/index.ts` & `cli/src/core/index.ts`**:
    - Central barrel export of all types, interfaces, and runtime constants with full documentation headers.

11. **`cli/test/schema/types.test.ts`**:
    - 10 test suites covering all exported types, compile-time readonly constraints, 22 diagnostic code constants, and realistic AST models matching design_spec §5.1, §5.2, §5.3, §5.4, §6.3, §6.4, §12.2, and §15.1.

### Verification
- `npm run build`: Zero errors (TypeScript compiles cleanly with strict and noUncheckedIndexedAccess).
- `npm test`: 12/12 tests passing across all test files (smoke + schema types).
- `npm run lint`: Zero errors, zero warnings. Isomorphic boundary strictly enforced (zero Node imports in `src/core/`).

### Issues Surfaced
None. All types in design_spec §5, §6, §7, §8, §9, §10, §12, §13, and §15 map cleanly to immutable TypeScript interfaces.
