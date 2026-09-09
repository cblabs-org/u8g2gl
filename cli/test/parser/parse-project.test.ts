/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/parse-project.test.ts
 * Purpose: Verification tests for parsing root u8g2gl.xml project descriptors.
 * Description: Asserts that valid-project.xml is transformed into a typed U8g2glProject
 *              with populated schema, identity, hardware targets, bus pin configurations,
 *              output parameters, and accurate source coordinate positions.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProjectFile } from '../../src/core/parser/index.js';

describe('parseProjectFile', () => {
  const fixturePath = resolve(
    __dirname,
    'fixtures',
    'valid-project.xml',
  );
  const fixtureXml = readFileSync(fixturePath, 'utf-8');

  it('parses valid-project.xml into a typed U8g2glProject model with correct fields', () => {
    const result = parseProjectFile(fixtureXml, 'u8g2gl.xml');

    expect(result.diagnostics).toHaveLength(0);
    expect(result.value).toBeDefined();

    const project = result.value!;
    expect(project.schema).toBe('0.3');
    expect(project.name).toBe('departures-board');
    expect(project.version).toBe('1.0');

    // Targets verification
    expect(project.targets).toHaveLength(2);

    const defaultTarget = project.targets[0]!;
    expect(defaultTarget.name).toBe('default');
    expect(defaultTarget.setup).toBe('U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI');
    expect(defaultTarget.rotation).toBe('0');
    expect(defaultTarget.ramBudget).toBe(4800);
    expect(defaultTarget.bus).toBeDefined();
    expect(defaultTarget.bus?.cs).toBe('10');
    expect(defaultTarget.bus?.dc).toBe('9');
    expect(defaultTarget.bus?.reset).toBe('8');

    const compactTarget = project.targets[1]!;
    expect(compactTarget.name).toBe('compact');
    expect(compactTarget.setup).toBe('U8G2_SSD1306_128X64_NONAME_F_HW_I2C');
    expect(compactTarget.bus?.address).toBe('0x3C');

    // Output config verification
    expect(project.output).toBeDefined();
    expect(project.output?.dir).toBe('generated');
    expect(project.output?.prefix).toBe('ui_');
  });

  it('preserves accurate source locations on project and targets', () => {
    const result = parseProjectFile(fixtureXml, 'u8g2gl.xml');
    expect(result.value).toBeDefined();

    const project = result.value!;
    expect(project.loc).toBeDefined();
    expect(project.loc?.file).toBe('u8g2gl.xml');
    expect(project.loc?.line).toBe(3);
    expect(project.loc?.column).toBe(1);

    const defaultTarget = project.targets[0]!;
    expect(defaultTarget.loc).toBeDefined();
    expect(defaultTarget.loc?.file).toBe('u8g2gl.xml');
    expect(defaultTarget.loc?.line).toBe(6);

    const compactTarget = project.targets[1]!;
    expect(compactTarget.loc).toBeDefined();
    expect(compactTarget.loc?.file).toBe('u8g2gl.xml');
    expect(compactTarget.loc?.line).toBe(10);
  });
});
