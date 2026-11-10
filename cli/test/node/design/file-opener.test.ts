/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/file-opener.test.ts
 * Purpose: What "Open in editor" and "Reveal" start, on each platform and
 *          with each kind of editor, and how an editor command line is split:
 *          once, into an argument array, with no shell syntax honoured; and
 *          which file types may be opened at all.
 * Description: A fake spawner records each launch, so nothing is opened on the
 *              desktop. The real spawner is exercised only on Node itself, with
 *              an empty script, and on a program that does not exist.
 */

import { describe, expect, it } from 'vitest';
import { isOpenablePath } from '../../../src/core/project-fs/openable-files.js';
import { FileOpener, parseEditorCommand, spawnDetached, type Launch } from '../../../src/node/design/file-opener.js';

const FILE = '/work/proj/widgets/wd_a/wd_a.cpp';

// recorder
// A fake spawner and the launches it was asked for.
function recorder(): { readonly launches: Launch[]; readonly spawn: (command: string, args: readonly string[]) => Promise<void> } {
  const launches: Launch[] = [];
  return {
    launches,
    spawn: (command, args) => {
      launches.push({ command, args: [...args] });
      return Promise.resolve();
    },
  };
}

describe('parseEditorCommand()', () => {
  it.each([
    ['code', { command: 'code', args: [] }],
    ['  subl   --wait ', { command: 'subl', args: ['--wait'] }],
    ['"/Applications/My Editor.app/bin/edit" -n', { command: '/Applications/My Editor.app/bin/edit', args: ['-n'] }],
    ["vim '+set ro'", { command: 'vim', args: ['+set ro'] }],
    ['code ""', { command: 'code', args: [''] }],
  ])('splits %j', (text, expected) => {
    expect(parseEditorCommand(text)).toEqual(expected);
  });

  it('honours no shell syntax: a ; or $ is part of a word', () => {
    expect(parseEditorCommand('code; rm -rf $HOME')).toEqual({ command: 'code;', args: ['rm', '-rf', '$HOME'] });
  });

  it('is undefined for a blank line, and an error for an unterminated quote', () => {
    expect(parseEditorCommand('   ')).toBeUndefined();
    expect(parseEditorCommand('"code')).toHaveProperty('error');
  });
});

describe('FileOpener.openArgs()', () => {
  it.each(['code', 'code-insiders', 'cursor', '/usr/local/bin/code', 'C:/Tools/Code.cmd'])('gives %s -g path:line', (command) => {
    const opener = new FileOpener({ editor: { command, args: ['--reuse-window'] } });
    expect(opener.openArgs(FILE, 12)).toEqual({ command, args: ['--reuse-window', '-g', `${FILE}:12`] });
    expect(opener.openArgs(FILE)).toEqual({ command, args: ['--reuse-window', FILE] });
  });

  it('gives any other editor the absolute path only, line or not', () => {
    const opener = new FileOpener({ editor: { command: 'subl', args: ['--wait'] } });
    expect(opener.openArgs(FILE, 12)).toEqual({ command: 'subl', args: ['--wait', FILE] });
  });

  it.each([
    ['darwin', { command: 'open', args: [FILE] }],
    ['win32', { command: 'explorer.exe', args: [FILE] }],
    ['linux', { command: 'xdg-open', args: [FILE] }],
  ] as const)('with no editor, uses the platform opener on %s', (platform, expected) => {
    expect(new FileOpener({ platform }).openArgs(FILE, 3)).toEqual(expected);
  });
});

describe('FileOpener.revealArgs()', () => {
  it.each([
    ['darwin', { command: 'open', args: ['-R', FILE] }],
    ['win32', { command: 'explorer.exe', args: ['/work/proj/widgets/wd_a'] }],
    ['linux', { command: 'xdg-open', args: ['/work/proj/widgets/wd_a'] }],
  ] as const)('on %s', (platform, expected) => {
    expect(new FileOpener({ platform, editor: { command: 'code', args: [] } }).revealArgs(FILE)).toEqual(expected);
  });
});

describe('FileOpener.open() and reveal()', () => {
  it('hand the launch to the spawner as an argument array', async () => {
    const fake = recorder();
    const opener = new FileOpener({ platform: 'darwin', editor: { command: 'code', args: [] }, spawn: fake.spawn });
    await opener.open(FILE, 7);
    await opener.reveal(FILE);
    expect(fake.launches).toEqual([
      { command: 'code', args: ['-g', `${FILE}:7`] },
      { command: 'open', args: ['-R', FILE] },
    ]);
  });

  it('reject when the program cannot be started', async () => {
    const opener = new FileOpener({ spawn: () => Promise.reject(new Error('spawn nope ENOENT')) });
    await expect(opener.open(FILE)).rejects.toThrow('ENOENT');
  });
});

describe('spawnDetached()', () => {
  it('resolves once a program has started', async () => {
    await expect(spawnDetached(process.execPath, ['-e', ''])).resolves.toBeUndefined();
  });

  it('rejects for a program that does not exist, rather than through a shell', async () => {
    await expect(spawnDetached('u8g2gl-no-such-program', ['x'])).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('isOpenablePath()', () => {
  it.each(['u8g2gl.xml', 'widgets/wd_a/wd_a.CPP', 'a.c', 'a.cc', 'a.h', 'a.hpp', 'notes.md', 'x.json', 'x.txt', 'fonts/a.bdf', 'i.xbm', 'i.png', '/abs/p/a.xml'])(
    'opens %s',
    (path) => {
      expect(isOpenablePath(path)).toBe(true);
    },
  );

  it.each(['run.command', 'run.sh', 'run', 'Tool.app', 'x.bat', 'x.desktop', 'x.exe', '.profile', 'a.cpp/run', 'C:\\p\\x.bat', 'x.xml.command'])(
    'refuses %s',
    (path) => {
      expect(isOpenablePath(path)).toBe(false);
    },
  );
});
