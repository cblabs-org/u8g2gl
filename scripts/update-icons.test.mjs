/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: scripts/update-icons.test.mjs
 * Purpose: Proves scripts/update-icons.mjs keeps Lucide's aliases, refuses an
 *          update that would drop a name authors may have written, and writes
 *          the same bytes for the same input. The refusal is the reason the
 *          script exists, so it has its own cases: a rename Lucide covered
 *          with an alias passes, a removal does not.
 * Description: Each case builds a miniature `lucide-static` package — the
 *              three things the script reads — under tmp/update-icons-test/,
 *              and calls the script's exported functions. Nothing is written
 *              to the repository's data files.
 *              Usage: node --test scripts/update-icons.test.mjs
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { droppedNames, pascalCase, readLucide, renderIconsJson, renderSprite } from './update-icons.mjs';

const WORK = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'tmp', 'update-icons-test');
after(() => rmSync(WORK, { recursive: true, force: true }));

// fakePackage
// A miniature lucide-static: canonical icons, and aliases as name → canonical.
//   label   — the case's directory
//   icons   — canonical name → elements
//   aliases — alias → canonical
function fakePackage(label, icons, aliases = {}) {
  const dir = join(WORK, label);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'icons'), { recursive: true });
  mkdirSync(join(dir, 'dist', 'esm'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'lucide-static', version: '9.9.9' }));
  writeFileSync(join(dir, 'icon-nodes.json'), JSON.stringify(icons));
  const exports = [];
  for (const name of Object.keys(icons)) {
    const bound = [name, ...Object.keys(aliases).filter((alias) => aliases[alias] === name)];
    for (const each of bound) writeFileSync(join(dir, 'icons', `${each}.svg`), '<svg/>');
    exports.push(`export { ${bound.map((each) => `default as ${pascalCase(each)}`).join(', ')} } from './icons/${name}.mjs';`);
  }
  writeFileSync(join(dir, 'dist', 'esm', 'lucide-static.mjs'), `${exports.join('\n')}\n`);
  return dir;
}

const BOX = [['rect', { x: '3', y: '3', width: '18', height: '18' }]];
const DOT = [['circle', { cx: '12', cy: '12', r: '1' }]];

describe('pascalCase()', () => {
  test('matches Lucide export names, digits included', () => {
    assert.equal(pascalCase('link-2'), 'Link2');
    assert.equal(pascalCase('a-arrow-down'), 'AArrowDown');
    assert.equal(pascalCase('square'), 'Square');
  });
});

describe('readLucide()', () => {
  test('reads the canonical icons and binds each alias to its icon', () => {
    const set = readLucide(fakePackage('aliases', { 'square-activity': BOX, dot: DOT }, { 'activity-square': 'square-activity' }));
    assert.equal(set.version, '9.9.9');
    assert.deepEqual([...set.icons.keys()], ['dot', 'square-activity']);
    assert.deepEqual([...set.aliases], [['activity-square', 'square-activity']]);
  });

  test('refuses an element it does not know, rather than drawing it wrong', () => {
    assert.throws(() => readLucide(fakePackage('unknown', { odd: [['text', {}]] })), /<text>/);
  });
});

describe('droppedNames()', () => {
  const current = { names: ['dot', 'square-activity'], aliases: { 'activity-square': 'square-activity' } };

  test('a rename Lucide covers with an alias drops nothing', () => {
    const next = readLucide(fakePackage('renamed', { dot: DOT, 'activity-box': BOX }, { 'square-activity': 'activity-box', 'activity-square': 'activity-box' }));
    assert.deepEqual(droppedNames(current, next), []);
  });

  test('a removed icon or a removed alias is reported', () => {
    const next = readLucide(fakePackage('removed', { 'square-activity': BOX }));
    assert.deepEqual(droppedNames(current, next), ['activity-square', 'dot']);
  });

  test('with no current list there is nothing to drop', () => {
    assert.deepEqual(droppedNames(undefined, readLucide(fakePackage('first', { dot: DOT }))), []);
  });
});

describe('rendering', () => {
  test('is deterministic, sorted, and keeps element order', () => {
    const dir = fakePackage('render', { zed: [...DOT, ...BOX], alpha: BOX }, { omega: 'zed' });
    const once = [renderIconsJson(readLucide(dir)), renderSprite(readLucide(dir))];
    const twice = [renderIconsJson(readLucide(dir)), renderSprite(readLucide(dir))];
    assert.deepEqual(once, twice);
    assert.deepEqual(JSON.parse(once[0]), { source: 'lucide-static', version: '9.9.9', names: ['alpha', 'zed'], aliases: { omega: 'zed' } });
    assert.match(once[1], /<symbol id="alpha" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18"\/><\/symbol>\n<symbol id="zed"[^\n]*><circle[^\n]*\/><rect/);
  });
});
