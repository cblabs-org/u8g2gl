/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/emit-golden.test.ts
 * Purpose: §17.1's codegen layer: generated C++ compared **byte for byte**
 *          against a checked-in expectation. This is the primary defence for
 *          §13.9 — generated output is committed and appears in review diffs
 *          ([D-11]), so an unexplained change to a single byte is a defect, and
 *          a golden file is the only thing that notices.
 * Description: Generates the `emit-project` fixture through the core API with a
 *              **fixed** generator version, so the goldens do not churn at every
 *              release, and compares each file against `fixtures/emit-project/
 *              expected/`. Also regenerates and asserts the second run is
 *              identical to the first, which is the determinism claim itself.
 *
 *              To refresh the goldens after an intended change, run:
 *                node --input-type=module -e "$(cat test/generator/refresh-goldens.mjs)"
 *              and review every line of the resulting diff.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../../src/core/generator/index.js';
import { loadProject } from '../../src/node/load-project.js';

/**
 * The version stamped into the goldens.
 *
 * Fixed, not the package's own: a golden carrying the real version would have to
 * be regenerated at every release, and a file that must be regenerated routinely
 * is a file whose diffs nobody reads.
 */
const GOLDEN_GENERATOR_VERSION = '0.0.0-golden';

const fixtureDir = resolve(__dirname, 'fixtures/emit-project');
const expectedDir = join(fixtureDir, 'expected');

/** Generates the fixture through the core API, exactly as the goldens were made. */
function generateFixture(): ReturnType<typeof generate> {
  const loaded = loadProject(fixtureDir);
  return generate({
    ...loaded.model,
    generatorVersion: GOLDEN_GENERATOR_VERSION,
    assets: loaded.assets,
  });
}

describe('golden files — the emitted project (§17.1, §13.9)', () => {
  const result = generateFixture();

  it('generates the fixture without a diagnostic', () => {
    expect(result.diagnostics).toEqual([]);
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
  });

  it('emits exactly the expected file set, in emission order', () => {
    expect(result.files.map((file) => file.path)).toEqual([
      'u8g2gl_generated_config.h',
      'ui.hpp',
      'ui_subjects.cpp',
      'ui_styles.cpp',
      'ui_fonts.cpp',
      'ui_images.cpp',
      'ui.cpp',
      'ui_screen_home.cpp',
    ]);
  });

  it('has a golden for every emitted file, and no golden without a file', () => {
    // A golden left behind after a file was renamed would otherwise be checked
    // by nothing and quietly rot.
    const golden = readdirSync(expectedDir).sort();
    expect(golden).toEqual(result.files.map((file) => file.path).sort());
  });

  for (const path of [
    'u8g2gl_generated_config.h',
    'ui.hpp',
    'ui_subjects.cpp',
    'ui_styles.cpp',
    'ui_fonts.cpp',
    'ui_images.cpp',
    'ui.cpp',
    'ui_screen_home.cpp',
  ]) {
    it(`matches the golden byte for byte: ${path}`, () => {
      const emitted = result.files.find((file) => file.path === path);
      expect(emitted).toBeDefined();
      expect(emitted?.content).toBe(readFileSync(join(expectedDir, path), 'utf-8'));
    });
  }

  it('regenerates byte-identically — the §13.9 claim', () => {
    const again = generateFixture();
    expect(again.files).toEqual(result.files);
  });

  it('carries no timestamp and no absolute path in any file', () => {
    for (const file of result.files) {
      expect(file.content).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(file.content).not.toMatch(/source: \//);
    }
  });
});

describe('what the golden fixture is there to pin', () => {
  const result = generateFixture();
  const content = (path: string): string => result.files.find((file) => file.path === path)?.content ?? '';

  it('sizes a subject bound by three objects and one draw-call element as _n<4>', () => {
    // 3 object bindings + exactly one frame-dirty observer, however many
    // draw-call elements bind it (§13.5) — the PR-01 constraint.
    expect(content('ui_subjects.cpp')).toContain('u8g2gl_subject_int_n<4> ui_subject_level(3);');
    expect(content('ui.hpp')).toContain('extern u8g2gl_subject_int_n<4> ui_subject_level;');
  });

  it('sizes a max_len="16" string by 16, leaving the runtime to allocate 17 bytes (§8.2)', () => {
    // The template allocates MaxLen + 1, so emitting 17 here would double the
    // allowance and make §18's budget untrue.
    expect(content('ui_subjects.cpp')).toContain('u8g2gl_subject_string_n<16, 1> ui_subject_station_name;');
    expect(content('ui_subjects.cpp')).toContain('16 usable characters, so max_len + 1 bytes (§8.2)');
  });

  it('escapes a string holding a quote, a backslash and non-ASCII', () => {
    expect(content('ui_subjects.cpp')).toContain('ui_subject_station_name.set("Euston \\"A\\"\\\\caf\\303\\251");');
  });

  it('emits the [D-21] capacities and the §16 version guard', () => {
    const config = content('u8g2gl_generated_config.h');
    expect(config).toContain('U8G2GL_REQUIRE_SCHEMA_VERSION(0, 4);');
    expect(config).toContain('#define U8G2GL_MAX_OBJECTS_PER_SCREEN 9');
    expect(config).toContain('#define U8G2GL_MAX_BINDINGS_PER_OBJ 1');
    expect(config).toContain('#define U8G2GL_MAX_TOTAL_BINDINGS 6');
    expect(config).toContain('#define U8G2GL_MAX_STYLES 2');
  });

  it('includes the generated capacities before any runtime header ([D-21], §13.7)', () => {
    const header = content('ui.hpp');
    expect(header.indexOf('#include "u8g2gl_generated_config.h"')).toBeLessThan(
      header.indexOf('#include "u8g2gl/u8g2gl_core.h"'),
    );
  });

  it('sorts its runtime includes (§13.9)', () => {
    const header = content('ui.hpp');
    expect(header.indexOf('u8g2gl/u8g2gl_core.h')).toBeLessThan(header.indexOf('u8g2gl/u8g2gl_style.h'));
    expect(header.indexOf('u8g2gl/u8g2gl_style.h')).toBeLessThan(header.indexOf('u8g2gl/u8g2gl_subject.h'));
  });

  it('documents how the capacities reach the library build itself (WO4 F5)', () => {
    // The binding pool is sized inside the library, which never includes this
    // header, so without the forced include [D-21] silently does not happen.
    // One header, one spelling of the numbers — not a second define list.
    const config = content('u8g2gl_generated_config.h');
    expect(config).toContain('-include');
    expect(config).toContain('target_compile_options(u8g2gl PUBLIC');
    expect(config).toContain('build_flags = -include generated/u8g2gl_generated_config.h');
    expect(config).toContain('src/u8g2gl_obj.cpp');
  });

  it('marks every emitted file as generated, so the writer can clean up stale ones', () => {
    // The writer deletes a stale file only if it carries the marker, so a file
    // that could not carry it would linger forever once renamed (header.ts).
    for (const file of result.files) {
      expect(file.content.startsWith('// GENERATED by u8g2gl.')).toBe(true);
    }
  });

  it('emits a builtin font as a reference, never a compiled array (§14.1)', () => {
    expect(content('ui_fonts.cpp')).toContain(
      'const uint8_t* const ui_font_u8g2_font_6x10_mr = u8g2_font_6x10_mr;',
    );
  });

  it('emits an xbm image PROGMEM, with the byte count the dimensions imply (§14.2)', () => {
    const images = content('ui_images.cpp');
    expect(images).toContain('const uint8_t ui_image_icon_wifi[] U8G2GL_PROGMEM = {');
    expect(images).toContain('16x16, 32 bytes');
  });

  it('applies style properties through the setters that maintain set_mask (§10)', () => {
    const styles = content('ui_styles.cpp');
    expect(styles).toContain('ui_style_header.set_align(U8G2GL_ALIGN_CENTER);');
    expect(styles).toContain('ui_style_header.set_draw_color(U8G2GL_COLOR_1);');
    // A screen style of a global name is one identifier and one slot, so `body`
    // appears once and carries the screen's override.
    expect(styles.match(/u8g2gl_style ui_style_body;/g)).toHaveLength(1);
    expect(styles).toContain('ui_style_body.set_align(U8G2GL_ALIGN_RIGHT);');
  });
});
