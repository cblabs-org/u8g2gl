/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/session.test.ts
 * Purpose: The page finds its server and token in its own URL, and only there.
 * Description: Literal URLs.
 */

import { expect, test } from '@playwright/test';
import { readSession } from '../../src/session';
import { classifyProjectFile } from '../../src/project/project-model';

const TOKEN = 'ab'.repeat(32);

test('reads the origin and token from /app/<token>/', () => {
  expect(readSession(`http://127.0.0.1:5199/app/${TOKEN}/`)).toEqual({ origin: 'http://127.0.0.1:5199', token: TOKEN });
  expect(readSession(`http://localhost:5199/app/${TOKEN}/index.html?x=1`)).toEqual({ origin: 'http://localhost:5199', token: TOKEN });
});

test('a page not served under a token path has no session', () => {
  for (const href of ['file:///tmp/index.html', `http://127.0.0.1:1/?token=${TOKEN}`, 'http://127.0.0.1:1/app/short/', `http://127.0.0.1:1/app/${TOKEN}`]) {
    expect(readSession(href), href).toBeUndefined();
  }
});

test('classifies files as the CLI project layout reads them', () => {
  expect(classifyProjectFile('u8g2gl.xml')).toBe('project');
  expect(classifyProjectFile('globals.xml')).toBe('globals');
  expect(classifyProjectFile('screens/screen_home.xml')).toBe('screen');
  expect(classifyProjectFile('screens/home.xml')).toBeUndefined();
  expect(classifyProjectFile('screens/sub/screen_x.xml')).toBeUndefined();
  expect(classifyProjectFile('widgets/wd_a/wd_a.xml')).toBe('widget');
  expect(classifyProjectFile('widgets/wd_a/wd_a.cpp')).toBeUndefined();
  expect(classifyProjectFile('fonts/a.bdf')).toBeUndefined();
});
