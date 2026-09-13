/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/parser/name-policy.test.ts
 * Purpose: Verification tests for the WO9 missing-name policy and write-back.
 * Description: Asserts that the default policy is 'error' and synthesises nothing,
 *              that 'generate' reproduces the WO8 behaviour and additionally emits
 *              one insertion per synthesised name, that applying those insertions
 *              preserves comments, attribute order and indentation, and — the
 *              round-trip proof — that the rewritten document reparses under the
 *              'error' policy with zero U8G2GL_MISSING_NAME diagnostics.
 */

import { describe, expect, it } from 'vitest';
import {
  applyTextEdits,
  parseScreenFile,
  parseWidgetManifestFile,
  parseWidgetTree,
  tokenizeXml,
  type ParseOptions,
} from '../../src/core/parser/index.js';
import { DIAGNOSTIC_CODES, type Diagnostic } from '../../src/core/schema/diagnostic.js';

const GENERATE: ParseOptions = { missingNamePolicy: 'generate' };
const ERROR: ParseOptions = { missingNamePolicy: 'error' };

const SCREEN_FILE = 'screens/screen_home.xml';

/** Counts U8G2GL_MISSING_NAME diagnostics of any severity. */
function missingNameDiagnostics(diagnostics: readonly Diagnostic[]) {
  return diagnostics.filter((d) => d.code === DIAGNOSTIC_CODES.MISSING_NAME);
}

describe('WO9: missing-name policy', () => {
  const unnamedScreen = `<screen name="home">
    <view>
        <u8g2gl_box x="0" y="0" width="10" height="10" />
    </view>
</screen>`;

  it('defaults to error: no policy given means no name is invented', () => {
    const result = parseScreenFile(unnamedScreen, SCREEN_FILE);

    const missing = missingNameDiagnostics(result.diagnostics);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.severity).toBe('error');
    expect(missing[0]!.offendingText).toBe('u8g2gl_box');
    expect(missing[0]!.message).toContain('--fix-names');

    // No synthesis happened, and the erroring document yields no value.
    expect(result.value).toBeUndefined();
    expect(result.nameEdits).toEqual([]);
  });

  it("an explicit 'error' policy behaves identically to the default", () => {
    const explicit = parseScreenFile(unnamedScreen, SCREEN_FILE, ERROR);
    const implicit = parseScreenFile(unnamedScreen, SCREEN_FILE);

    expect(explicit.diagnostics).toEqual(implicit.diagnostics);
    expect(explicit.value).toBeUndefined();
  });

  it("parseWidgetTree also defaults to 'error' when given no options", () => {
    const doc = tokenizeXml(`<view><u8g2gl_box x="0" y="0" /></view>`, SCREEN_FILE);
    const diagnostics: Parameters<typeof parseWidgetTree>[2] = [];

    const nodes = parseWidgetTree(doc.root!.children, SCREEN_FILE, diagnostics);

    expect(missingNameDiagnostics(diagnostics)[0]?.severity).toBe('error');
    expect(nodes[0]!.attributes.name).toBeUndefined();
  });

  it("'generate' warns, synthesises, and reports no error", () => {
    const result = parseScreenFile(unnamedScreen, SCREEN_FILE, GENERATE);

    const missing = missingNameDiagnostics(result.diagnostics);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.severity).toBe('warning');
    expect(result.value!.view.children[0]!.attributes.name).toBe('box_0');
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('composite widget manifests (a <widget> with a <view>) honour the policy too', () => {
    const xml = `<widget name="badge">
    <api></api>
    <view>
        <u8g2gl_label text="badge" />
    </view>
</widget>`;

    const errored = parseWidgetManifestFile(xml, 'widgets/badge/badge.xml');
    expect(missingNameDiagnostics(errored.diagnostics)[0]!.severity).toBe('error');
    expect(errored.value).toBeUndefined();

    const generated = parseWidgetManifestFile(xml, 'widgets/badge/badge.xml', GENERATE);
    expect(missingNameDiagnostics(generated.diagnostics)[0]!.severity).toBe('warning');
    expect(generated.nameEdits).toHaveLength(1);
  });
});

describe('WO9: write-back edit computation', () => {
  it('produces one well-formed insertion per unnamed element', () => {
    const result = parseScreenFile(
      `<screen name="home">
    <view>
        <u8g2gl_box x="0" y="0" width="10" height="10" />
    </view>
</screen>`,
      SCREEN_FILE,
      GENERATE,
    );

    expect(result.nameEdits).toHaveLength(1);
    const edit = result.nameEdits![0]!;
    expect(edit.text).toBe(' name="box_0"');
    expect(edit.loc.file).toBe(SCREEN_FILE);
    expect(edit.loc.line).toBe(3);
    // '<' sits at column 9, so the insertion point is one past '<u8g2gl_box'.
    expect(edit.loc.column).toBe(9 + 1 + 'u8g2gl_box'.length);
  });

  it('emits nothing for a document whose elements are all named', () => {
    const result = parseScreenFile(
      `<screen name="home">
    <view>
        <u8g2gl_box name="my_box" x="0" y="0" width="10" height="10" />
    </view>
</screen>`,
      SCREEN_FILE,
      GENERATE,
    );

    expect(result.nameEdits).toEqual([]);
  });

  it("emits nothing under the 'error' policy", () => {
    const result = parseScreenFile(
      `<screen name="home"><view><u8g2gl_box x="0" y="0" /></view></screen>`,
      SCREEN_FILE,
    );
    expect(result.nameEdits).toEqual([]);
  });
});

describe('WO9: applying edits to source', () => {
  // Comments, an unusual attribute order and mixed indentation are all present
  // deliberately: this input is the assertion that nothing is re-serialised.
  const messyScreen = `<screen name="home">
    <!-- The status row. Do not reorder these attributes. -->
    <view>
        <u8g2gl_box height="10" y="0" x="0" width="10">
            <!-- nested comment -->
              <u8g2gl_label text="a" />
        </u8g2gl_box>
        <u8g2gl_label text="b" x="0" y="20" width="50" height="10" />
    </view>
</screen>`;

  it('preserves comments, attribute order and indentation', () => {
    const result = parseScreenFile(messyScreen, SCREEN_FILE, GENERATE);
    const rewritten = applyTextEdits(messyScreen, result.nameEdits!);

    expect(rewritten).toContain('<!-- The status row. Do not reorder these attributes. -->');
    expect(rewritten).toContain('<!-- nested comment -->');
    expect(rewritten).toContain('<u8g2gl_box name="box_0" height="10" y="0" x="0" width="10">');
    expect(rewritten).toContain('              <u8g2gl_label name="label_0" text="a" />');

    // Every original line survives, with only the three names added.
    expect(rewritten.split('\n')).toHaveLength(messyScreen.split('\n').length);
  });

  it('lands multiple insertions in one file correctly', () => {
    const result = parseScreenFile(messyScreen, SCREEN_FILE, GENERATE);
    expect(result.nameEdits).toHaveLength(3);

    const rewritten = applyTextEdits(messyScreen, result.nameEdits!);
    expect(rewritten).toContain('name="box_0"');
    expect(rewritten).toContain('name="label_0"');
    expect(rewritten).toContain('name="label_1"');
    // A front-to-back application would corrupt this line, since two of the
    // three insertions precede it.
    expect(rewritten).toContain('<u8g2gl_label name="label_1" text="b" x="0" y="20"');
  });

  it('applies correctly when two insertions share a line', () => {
    const oneLine = `<screen name="home"><view><u8g2gl_box x="0" y="0" /><u8g2gl_label text="a" /></view></screen>`;
    const result = parseScreenFile(oneLine, SCREEN_FILE, GENERATE);

    expect(applyTextEdits(oneLine, result.nameEdits!)).toBe(
      `<screen name="home"><view><u8g2gl_box name="box_0" x="0" y="0" /><u8g2gl_label name="label_0" text="a" /></view></screen>`,
    );
  });

  it('handles CRLF line endings', () => {
    const crlf = messyScreen.replace(/\n/g, '\r\n');
    const result = parseScreenFile(crlf, SCREEN_FILE, GENERATE);
    const rewritten = applyTextEdits(crlf, result.nameEdits!);

    expect(rewritten).toContain('<u8g2gl_box name="box_0" height="10"');
    expect(rewritten).toContain('\r\n');
  });

  it('ROUND TRIP: the rewritten document reparses with zero MISSING_NAME under error policy', () => {
    // The proof that write-back actually closes the defect: generate, apply,
    // reparse on the safe journey, and the build has nothing left to complain
    // about. If this ever fails, --fix-names does not fix anything.
    const generated = parseScreenFile(messyScreen, SCREEN_FILE, GENERATE);
    const rewritten = applyTextEdits(messyScreen, generated.nameEdits!);

    const reparsed = parseScreenFile(rewritten, SCREEN_FILE);

    expect(missingNameDiagnostics(reparsed.diagnostics)).toHaveLength(0);
    expect(reparsed.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(reparsed.value).toBeDefined();

    // And the names the author now sees are exactly the ones that were reported.
    const box = reparsed.value!.view.children[0]!;
    expect(box.attributes.name).toBe('box_0');
    expect(reparsed.value!.view.children[1]!.attributes.name).toBe('label_1');
  });

  it('ROUND TRIP: a second fix pass is a no-op', () => {
    const generated = parseScreenFile(messyScreen, SCREEN_FILE, GENERATE);
    const rewritten = applyTextEdits(messyScreen, generated.nameEdits!);

    const second = parseScreenFile(rewritten, SCREEN_FILE, GENERATE);
    expect(second.nameEdits).toEqual([]);
    expect(applyTextEdits(rewritten, second.nameEdits!)).toBe(rewritten);
  });

  it('skips an edit whose location lies outside the source rather than throwing', () => {
    const source = '<screen name="home"/>';
    expect(
      applyTextEdits(source, [
        { loc: { file: SCREEN_FILE, line: 99, column: 1 }, text: ' name="x"' },
      ]),
    ).toBe(source);
  });
});
