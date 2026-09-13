/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/validator/schema.test.ts
 * Purpose: Verification tests for Pass 1 schema structure validation (§15.4).
 * Description: Asserts the `setter`/`draw` mutual-exclusion rule on widget props
 *              (WO6, closing the gap WO4 left behind): `setter` alone passes,
 *              `draw` alone passes, neither is an error, and both is an error.
 */

import { describe, expect, it } from 'vitest';
import { validateSchema } from '../../src/core/validator/index.js';
import type { ValidateInput } from '../../src/core/validator/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';

describe('validateSchema — setter/draw mutual exclusion', () => {
  const baseInput: ValidateInput = {
    project: { schema: '0.3', name: 'schema_test', version: '1.0.0', targets: [] },
    globals: { consts: [], subjects: [], styles: [], fonts: [], images: [] },
    screens: [],
    components: [],
    widgetManifests: [],
    catalogue: [],
  };

  function manifestWithProp(prop: {
    setter?: string;
    draw?: string;
  }): WidgetManifest {
    return {
      name: 'u8g2gl_widget',
      extends: 'u8g2gl_obj',
      api: {
        props: [{ name: 'value', type: 'int', ...prop }],
        bindings: [],
        elements: [],
      },
    };
  }

  it('passes when only setter is present', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      widgetManifests: [manifestWithProp({ setter: 'set_value' })],
    });
    expect(diagnostics).toHaveLength(0);
  });

  it('passes when only draw is present', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      widgetManifests: [manifestWithProp({ draw: 'u8g2gl_draw_value' })],
    });
    expect(diagnostics).toHaveLength(0);
  });

  it('is an error when neither setter nor draw is present', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      widgetManifests: [manifestWithProp({})],
    });
    const diag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED);
    expect(diag).toBeDefined();
    expect(diag?.message).toContain("must declare exactly one of 'setter' or 'draw'");
  });

  it('is an error when both setter and draw are present', () => {
    const diagnostics = validateSchema({
      ...baseInput,
      widgetManifests: [
        manifestWithProp({ setter: 'set_value', draw: 'u8g2gl_draw_value' }),
      ],
    });
    const diag = diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.OVERCONSTRAINED);
    expect(diag).toBeDefined();
    expect(diag?.message).toContain("must declare exactly one of 'setter' or 'draw'");
  });
});
