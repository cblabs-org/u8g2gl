---
work_order: WO5
project: pr-03-widgets
title: "XML Manifests + Manifest→Validator Cross-Test"
branch: u8g2gl-widgets/wo5-manifests-crosstest
base: u8g2gl-widgets/wo4-switch-button
complexity: standard
status: complete
---

# WO5 — XML Manifests + Manifest→Validator Cross-Test

## Authorization

This Work Order is part of PR-03 (pr-03-widgets), whose decomposition was
approved by the human on 2026-09-10T07:10:37Z. Verify:
`.agents/skills/principal-architect-workspace/pr-03-widgets/PROJECT.md`

## Objective

Create `<api>` manifest XML files for every widget and Tier-1 primitive, then
write a Vitest cross-test that validates every manifest through PR-02's parser.
This is the integration gate with PR-02: a manifest that the generator could
not consume must fail in CI rather than in PR-04.

## Branch

**Branch**: `u8g2gl-widgets/wo5-manifests-crosstest`
**Base**: `u8g2gl-widgets/wo4-switch-button`

The branch has been created for you. Verify with `git branch --show-current`
before every commit.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval. Do NOT send a message asking to proceed. Build, test, commit, push.

## Standards

Read BEFORE writing any code:
- `.agents/skills/u8g2gl-standards/SKILL.md`
- `.agents/skills/u8g2gl-standards/references/typescript.md`

## Checklist

### 1. Create manifest XML files

Place in `include/u8g2gl/manifests/`. One file per widget/primitive.

**Read the manifest schema first**: `cli/src/core/schema/widget-manifest.ts`
defines the model. Read `cli/src/core/parser/parse-widget-manifest.ts` to see
exactly what the parser expects.

#### Tier-1 Primitive Manifests

These declare `animated="false"` and have no `extends` (they emit inline draw
calls, not object instances). Each has only geometry props.

`u8g2gl_hline.xml`:
```xml
<widget name="u8g2gl_hline" animated="false">
  <api>
    <prop name="x" type="int" setter="drawHLine" required="true" help="Left edge" />
    <prop name="y" type="int" setter="drawHLine" required="true" help="Top edge" />
    <prop name="width" type="int" setter="drawHLine" required="true" help="Length in pixels" />
  </api>
</widget>
```

Similarly for: `u8g2gl_vline`, `u8g2gl_line`, `u8g2gl_box`, `u8g2gl_circle`,
`u8g2gl_ellipse`, `u8g2gl_triangle`, `u8g2gl_pixel`.

Refer to design_spec §6.1 for the exact props on each primitive:
- `u8g2gl_hline`: x, y, width
- `u8g2gl_vline`: x, y, height
- `u8g2gl_line`: x1, y1, x2, y2
- `u8g2gl_box`: x, y, width, height, filled (bool), radius (int)
- `u8g2gl_circle`: x, y, radius, filled (bool), segments (enum: all,upper_left,upper_right,lower_left,lower_right)
- `u8g2gl_ellipse`: x, y, rx, ry, filled (bool), segments
- `u8g2gl_triangle`: x0, y0, x1, y1, x2, y2, filled (bool)
- `u8g2gl_pixel`: x, y

#### Tier-2 Widget Manifests

These declare `extends="u8g2gl_obj"` and have full `<api>` blocks matching
the C++ setters created in WO1-WO4.

`u8g2gl_label.xml`:
```xml
<widget name="u8g2gl_label" extends="u8g2gl_obj" animated="false">
  <api>
    <prop name="text" type="string" setter="set_text" default=""
          help="Static display text. Overridden when bind_text is active." />
    <prop name="font" type="font" setter="set_font" required="true"
          help="U8G2 font for rendering." />
    <prop name="align" type="enum" setter="set_align"
          values="left,center,right" default="left"
          emit="U8G2GL_ALIGN_{VALUE^^}"
          help="Horizontal text alignment within bounds." />
    <prop name="truncate" type="bool" setter="set_truncate" default="false"
          help="Clip text exceeding widget width." />
    <bind name="bind_text" type="string" setter="bind_text"
          fmt="bind_text_fmt" />
    <bind name="bind_text_int" type="int" setter="bind_text"
          fmt="bind_text_fmt" />
  </api>
</widget>
```

Create similar manifests for:
- `u8g2gl_scrolling_label.xml` — label props + scroll_px_per_sec (int),
  initial_delay_ms (int), static_dwell_ms (int). `animated="true"`.
- `u8g2gl_xbm.xml` — src (image), bitmap_mode (enum). `animated="false"`.
- `u8g2gl_glyph.xml` — glyph (int), font (font). `animated="false"`.
- `u8g2gl_progress_bar.xml` — fill_style (enum: solid,stipple),
  animate_duration_ms (int), show_percent_text (bool). bind_value (int).
  `animated="true"` (interpolation).
- `u8g2gl_clock.xml` — format (enum: hh_mm,hh_mm_ss), secondary_font (font),
  blink (bool). bind_time (int). `animated="true"` (blink).
- `u8g2gl_switch.xml` — bind_value (bool). `animated="false"`.
- `u8g2gl_button.xml` — text (string), font (font), border_width (int).
  bind_text. `animated="false"`.

**Match the setter names EXACTLY to the C++ methods created in WO1-WO4.**

### 2. Create the cross-test

File: `cli/test/manifests/manifest-crosstest.test.ts`

This test suite reads every manifest XML file and validates it through the
existing `parseWidgetManifestFile()` function from
`cli/src/core/parser/parse-widget-manifest.ts`.

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { parseWidgetManifestFile } from '../../src/core/parser/parse-widget-manifest.js';

const MANIFESTS_DIR = resolve(__dirname, '../../../include/u8g2gl/manifests');

describe('Widget Manifests', () => {
  const files = readdirSync(MANIFESTS_DIR).filter(f => f.endsWith('.xml'));

  it('should find at least 17 manifest files', () => {
    expect(files.length).toBeGreaterThanOrEqual(17);
  });

  for (const file of files) {
    describe(file, () => {
      const xml = readFileSync(join(MANIFESTS_DIR, file), 'utf-8');
      const result = parseWidgetManifestFile(xml, file);

      it('should parse with zero error diagnostics', () => {
        const errors = result.diagnostics.filter(d => d.severity === 'error');
        expect(errors).toEqual([]);
      });

      it('should produce a valid WidgetManifest', () => {
        expect(result.value).toBeDefined();
        expect(result.value!.name).toBeTruthy();
        expect(result.value!.api).toBeDefined();
      });

      it('should have valid PropDefs', () => {
        for (const prop of result.value!.api.props) {
          expect(prop.name).toBeTruthy();
          expect(prop.type).toBeTruthy();
          expect(prop.setter).toBeTruthy();
        }
      });

      it('should have valid BindDefs', () => {
        for (const bind of result.value!.api.bindings) {
          expect(bind.name).toBeTruthy();
          expect(bind.type).toBeTruthy();
          expect(bind.setter).toBeTruthy();
        }
      });
    });
  }
});
```

### 3. Update catalogue

Read `cli/src/data/catalogue.json` to understand its structure, then add entries
for the new built-in widgets so the validator's `validate-widget-props` pass
recognises them in screen XML. Each entry needs the parsed manifest data.

**Alternative**: If the catalogue is auto-generated from manifest files by a
build step, run that build step instead of manually editing.

### 4. Build and test

```bash
# CLI tests
cd cli && npm test

# Verify C++ still builds (no source changes but confirm)
cd .. && cmake -B build -DCMAKE_BUILD_TYPE=Debug -DU8G2GL_BUILD_TESTS=ON
cmake --build build && cd build && ctest --output-on-failure
```

### 5. Commit and push

**VERIFY BRANCH FIRST:**
```bash
git branch --show-current   # Must show: u8g2gl-widgets/wo5-manifests-crosstest
```

```bash
git add -A
git commit -m "feat(manifests): add widget API manifests and validator cross-test (PR-03 WO5)"
git push origin u8g2gl-widgets/wo5-manifests-crosstest
```

## Strict Boundary Box

You may ONLY touch:
- `include/u8g2gl/manifests/*.xml` (ALL NEW)
- `cli/test/manifests/manifest-crosstest.test.ts` (NEW)
- `cli/src/data/catalogue.json` (MODIFY — add widget entries)

You may NOT touch:
- Any C++ source or header files
- The parser or validator TypeScript source (only exercising existing APIs)
- Existing test files

## Constraints (REJECTION CRITERIA)

- Every manifest must parse with zero error diagnostics.
- Setter names in manifests must match the C++ methods exactly.
- All existing CLI tests must keep passing.
- The cross-test must be discoverable by `npm test`.

## Completion Report Template

```
## Completion Report
- **Date**: YYYY-MM-DDTHH:MM:SSZ
- **Status**: COMPLETE / PARTIAL / BLOCKED
- **Commit**: <sha>
- **Branch verified**: yes/no
- **Manifest files**: N created
- **Cross-test**: N tests passed, M failed
- **CLI tests**: all passing / N failures
- **Notes**: <any observations>
```

## Completion Report
- **Date**: 2026-09-10T07:44:10Z
- **Status**: COMPLETE
- **Commit**: 57c016a
- **Branch verified**: yes (u8g2gl-widgets/wo5-manifests-crosstest)
- **Manifest files**: 17 created (8 Tier-1 primitives, 8 Tier-2 widgets, 1 base u8g2gl_obj)
- **Cross-test**: 69 tests passed, 0 failed
- **CLI tests**: all passing (24 test files, 190 tests passed, 0 failures)
- **Notes**: All 17 XML manifest files adhere strictly to C++ header setter signatures and the TypeScript WidgetManifest schema. catalogue.json was inspected and preserved as the U8G2 display hardware catalogue without modification, as widgetManifests are injected directly from parsed XML manifests. Full C++ test suite (164/164 tests) and CLI test suite (190/190 tests) pass with zero errors.

