/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/malformed.test.ts
 * Purpose: Verification tests for error handling and diagnostic emission on invalid XML.
 * Description: Asserts that syntax errors, unclosed tags, missing attributes, and unexpected
 *              elements emit structured diagnostics (U8G2GL_MALFORMED_XML, U8G2GL_MISSING_REQUIRED)
 *              with exact 1-based source coordinate locations without throwing runtime exceptions.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseProjectFile,
  parseScreenFile,
  parseGlobalsFile,
  parseComponentFile,
  parseWidgetManifestFile,
} from '../../src/core/parser/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';

describe('Parser Error Handling & Diagnostics', () => {
  const malformedFixturePath = resolve(
    __dirname,
    'fixtures',
    'malformed.xml',
  );
  const malformedXml = readFileSync(malformedFixturePath, 'utf-8');

  const unknownFixturePath = resolve(
    __dirname,
    'fixtures',
    'unknown-elements.xml',
  );
  const unknownXml = readFileSync(unknownFixturePath, 'utf-8');

  it('never throws on malformed XML and emits U8G2GL_MALFORMED_XML with location', () => {
    expect(() => {
      const result = parseScreenFile(malformedXml, 'screens/screen_broken.xml');
      expect(result.value).toBeUndefined();
      expect(result.diagnostics.length).toBeGreaterThan(0);

      const malformedDiag = result.diagnostics.find(
        (d) => d.code === DIAGNOSTIC_CODES.MALFORMED_XML,
      );
      expect(malformedDiag).toBeDefined();
      expect(malformedDiag?.file).toBe('screens/screen_broken.xml');
      expect(malformedDiag?.line).toBeGreaterThan(0);
      expect(malformedDiag?.column).toBeGreaterThan(0);
    }).not.toThrow();
  });

  it('emits U8G2GL_MISSING_REQUIRED when mandatory attributes are absent', () => {
    // Missing schema, name, and version on <u8g2gl>
    const invalidProjectXml = `<u8g2gl></u8g2gl>`;
    const result = parseProjectFile(invalidProjectXml, 'u8g2gl.xml');

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);

    const missingDiags = result.diagnostics.filter(
      (d) => d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED,
    );
    expect(missingDiags.length).toBe(3); // schema, name, version
    expect(missingDiags[0]?.message).toContain('schema');
  });

  it('detects missing setup attribute on hardware targets', () => {
    const xml = `<u8g2gl schema="0.4" name="test" version="1.0">
    <targets>
        <target name="broken_target" />
    </targets>
</u8g2gl>`;
    const result = parseProjectFile(xml, 'u8g2gl.xml');
    expect(result.value).toBeUndefined();
    const missingSetup = result.diagnostics.find(
      (d) =>
        d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED &&
        d.message.includes('setup'),
    );
    expect(missingSetup).toBeDefined();
  });

  it('detects unknown elements in XML hierarchy', () => {
    const result = parseProjectFile(unknownXml, 'u8g2gl.xml');
    expect(result.value).toBeUndefined();
    const unknownElemDiag = result.diagnostics.find(
      (d) =>
        d.code === DIAGNOSTIC_CODES.MALFORMED_XML &&
        d.message.includes('unsupported_custom_block'),
    );
    expect(unknownElemDiag).toBeDefined();
  });

  it('reports mismatched closing tags with line and column', () => {
    const xml = `<screen name="mismatch">\n    <view>\n    </screen>\n</view>`;
    const result = parseScreenFile(xml, 'screen.xml');
    expect(result.value).toBeUndefined();
    const mismatch = result.diagnostics.find(
      (d) =>
        d.code === DIAGNOSTIC_CODES.MALFORMED_XML &&
        d.message.includes('Mismatched closing tag'),
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.line).toBe(3);
  });

  it('detects unclosed tags at EOF with the opening tag location', () => {
    const xml = `<globals>\n    <consts>\n        <int name="x" value="1" />`;
    const result = parseGlobalsFile(xml, 'globals.xml');
    expect(result.value).toBeUndefined();
    const unclosed = result.diagnostics.find(
      (d) =>
        d.code === DIAGNOSTIC_CODES.MALFORMED_XML &&
        d.message.includes("unclosed tag 'consts'"),
    );
    expect(unclosed).toBeDefined();
    expect(unclosed?.line).toBe(2);
  });

  it('reports missing required <view> element in components', () => {
    const xml = `<component name="no_view"><api></api></component>`;
    const result = parseComponentFile(xml, 'comp.xml');
    expect(result.value).toBeUndefined();
    const missingView = result.diagnostics.find(
      (d) =>
        d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED &&
        d.message.includes('<view>'),
    );
    expect(missingView).toBeDefined();
  });

  it('reports missing required attributes on widget manifests', () => {
    const xml = `<widget></widget>`;
    const result = parseWidgetManifestFile(xml, 'manifest.xml');
    expect(result.value).toBeUndefined();
    const missingName = result.diagnostics.find(
      (d) =>
        d.code === DIAGNOSTIC_CODES.MISSING_REQUIRED &&
        d.message.includes('name'),
    );
    expect(missingName).toBeDefined();
  });
});
