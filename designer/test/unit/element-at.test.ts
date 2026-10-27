/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/element-at.test.ts
 * Purpose: XML-to-canvas selection finds the innermost named element at the
 *          caret, never the document root, and says when the text does not
 *          parse; generated names land in the buffer exactly as the CLI's
 *          `--fix-names` would write them.
 * Description: Literal documents and offsets.
 */

import { expect, test } from '@playwright/test';
import { elementAt, namedElements } from '../../src/documents/element-at';
import { withGeneratedNames } from '../../src/documents/generated-names';

const SCREEN = [
  '<screen name="home">',
  '  <view>',
  '    <u8g2gl_box name="outer" x="0" y="0" width="40" height="20">',
  '      <u8g2gl_label name="inner" x="2" y="2" width="10" height="8" text="a" />',
  '    </u8g2gl_box>',
  '    <u8g2gl_line name="rule" x1="0" y1="30" x2="10" y2="30" />',
  '  </view>',
  '</screen>',
  '',
].join('\n');

test('finds the innermost named element containing the caret', () => {
  expect(elementAt(SCREEN, SCREEN.indexOf('text="a"'))).toMatchObject({ name: 'inner', tag: 'u8g2gl_label' });
  expect(elementAt(SCREEN, SCREEN.indexOf('width="40"'))).toMatchObject({ name: 'outer' });
  // Inside the closing tag still belongs to the element it closes.
  expect(elementAt(SCREEN, SCREEN.indexOf('</u8g2gl_box>') + 3)).toMatchObject({ name: 'outer' });
  expect(elementAt(SCREEN, SCREEN.indexOf('x2='))).toMatchObject({ name: 'rule' });
});

test('the root and the space between elements select nothing', () => {
  expect(elementAt(SCREEN, 3)).toBeUndefined();
  expect(elementAt(SCREEN, SCREEN.indexOf('<view>') + 2)).toBeUndefined();
  expect(namedElements(SCREEN)?.map((s) => s.name)).toEqual(['outer', 'inner', 'rule']);
});

test('text that does not tokenise has no answer, so the caller keeps its selection', () => {
  const broken = SCREEN.replace('<u8g2gl_line', '<u8g2gl_li ne=');
  expect(elementAt(broken, broken.indexOf('outer'))).toBe('unparsed');
});

test('missing names are inserted in the buffer; a named document is returned unchanged', () => {
  const unnamed = '<screen name="home">\n  <view>\n    <u8g2gl_box x="0" y="0" width="4" height="4" />\n  </view>\n</screen>\n';
  const named = withGeneratedNames('screens/screen_home.xml', unnamed);
  expect(named).toMatch(/<u8g2gl_box name="[a-z0-9_]+" x="0"/);
  expect(named.replace(/ name="[a-z0-9_]+"(?= x=)/, '')).toBe(unnamed);
  expect(withGeneratedNames('screens/screen_home.xml', SCREEN)).toBe(SCREEN);
  expect(withGeneratedNames('globals.xml', unnamed)).toBe(unnamed);
});
