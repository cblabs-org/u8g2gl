/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/node/design/design-command.test.ts
 * Purpose: The command around the server: argument parsing; one
 *          server per project — a second instance attaches and prints the
 *          running URL; a stale lock (dead pid, a live pid that is not the
 *          server, or a corrupt file) is replaced; and the built CLI end to end,
 *          including Ctrl-C removing the lock.
 * Description: `startOrAttach` is tested in-process. The end-to-end tests spawn
 *              the built `dist/node/cli.js` (built by the global setup) with
 *              `--no-open --json`, so no browser opens and the URL is read as
 *              one JSON line. Every spawned server is signalled and awaited.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { parseDesignArgs, startOrAttach, type DesignSession } from '../../../src/node/design/design-command.js';
import { startDesignServer } from '../../../src/node/design/design-server.js';
import { LOCK_FILE_NAME } from '../../../src/node/design/ignored-paths.js';
import { readLock } from '../../../src/node/design/lock-file.js';
import { MINIMAL_PROJECT, makeTempDir, removeTempDirs, writeFiles } from './temp-project.js';

const CLI = resolve(__dirname, '../../../dist/node/cli.js');
const sessions: DesignSession[] = [];
const children: ChildProcess[] = [];

// project
// A fresh temporary project directory.
function project(): string {
  const root = makeTempDir('design-command');
  writeFiles(root, MINIMAL_PROJECT);
  return root;
}

// track
// Remembers a session so afterEach stops it.
function track(session: DesignSession): DesignSession {
  sessions.push(session);
  return session;
}

afterEach(async () => {
  for (const session of sessions.splice(0)) {
    if (session.kind === 'started') await session.stop();
  }
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await new Promise((r) => child.once('exit', r));
    }
  }
});
afterAll(removeTempDirs);

describe('parseDesignArgs()', () => {
  it.each([
    [[], { projectDir: '.', port: 0, open: true }],
    [['proj', '--no-open'], { projectDir: 'proj', port: 0, open: false }],
    [['--port', '5199', 'proj'], { projectDir: 'proj', port: 5199, open: true }],
  ])('parses %j', (args, expected) => {
    expect(parseDesignArgs(args)).toEqual(expected);
  });

  it.each([[['--port']], [['--port', 'x']], [['--port', '70000']], [['--port', '-1']], [['--nope']], [['a', 'b']]])(
    'refuses %j',
    (args) => {
      expect(parseDesignArgs(args)).toHaveProperty('error');
    },
  );
});

describe('one server per project', () => {
  it('writes a lock holding pid, port and token, and removes it on stop', async () => {
    const root = project();
    const session = await startOrAttach(root, 0);
    expect(session.kind).toBe('started');
    if (session.kind !== 'started') return;
    expect(readLock(root)).toEqual({
      pid: process.pid,
      port: session.server.port,
      token: session.server.token,
      url: session.server.url,
    });
    await session.stop();
    expect(existsSync(join(root, LOCK_FILE_NAME))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('writes the lock readable by its owner only (0600), since it holds the token', async () => {
    const root = project();
    track(await startOrAttach(root, 0));
    expect(statSync(join(root, LOCK_FILE_NAME)).mode & 0o777).toBe(0o600);
  });

  it('a second instance attaches to the live server and gets its URL', async () => {
    const root = project();
    const first = track(await startOrAttach(root, 0));
    const second = track(await startOrAttach(root, 0));
    expect(second.kind).toBe('attached');
    expect(second.kind === 'attached' && first.kind === 'started' && second.lock.url).toBe(
      first.kind === 'started' ? first.server.url : 'x',
    );
  });

  it('replaces a lock whose pid is dead', async () => {
    const root = project();
    const deadPid = await exitedPid();
    writeFileSync(join(root, LOCK_FILE_NAME), JSON.stringify({ pid: deadPid, port: 1, token: 'a'.repeat(64), url: 'http://127.0.0.1:1/' }));
    const session = track(await startOrAttach(root, 0));
    expect(session.kind).toBe('started');
    expect(readLock(root)?.pid).toBe(process.pid);
  });

  it('replaces a lock whose pid is alive but is not the server (a reused pid)', async () => {
    const root = project();
    const gone = await startDesignServer({ projectRoot: makeTempDir('design-command-gone') });
    const port = gone.port;
    await gone.close();
    writeFileSync(join(root, LOCK_FILE_NAME), JSON.stringify({ pid: process.pid, port, token: 'b'.repeat(64), url: `http://127.0.0.1:${port}/` }));
    const session = track(await startOrAttach(root, 0));
    expect(session.kind).toBe('started');
    expect(readLock(root)?.token).not.toBe('b'.repeat(64));
  });

  it('replaces a corrupt lock', async () => {
    const root = project();
    writeFileSync(join(root, LOCK_FILE_NAME), 'not json');
    expect(track(await startOrAttach(root, 0)).kind).toBe('started');
  });

  it('does not remove a lock another server now owns', async () => {
    const root = project();
    const session = await startOrAttach(root, 0);
    if (session.kind !== 'started') throw new Error('expected to start');
    const foreign = { pid: process.pid, port: 2, token: 'c'.repeat(64), url: 'http://127.0.0.1:2/' };
    writeFileSync(join(root, LOCK_FILE_NAME), JSON.stringify(foreign));
    await session.stop();
    expect(readLock(root)).toEqual(foreign);
  });
});

describe('u8g2gl design — the built CLI', () => {
  it('starts, serves with its token, lets a second instance attach, and removes the lock on SIGINT', async () => {
    const root = project();
    const first = spawnCli(['design', root, '--no-open', '--json']);
    const started = JSON.parse(await firstLine(first)) as { url: string; port: number; pid: number; attached: boolean };
    expect(started).toMatchObject({ attached: false, pid: first.pid });
    expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{64}$/);
    expect((await fetch(started.url)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${started.port}/`)).status).toBe(403);

    const second = spawnCli(['design', root, '--no-open', '--json']);
    const attached = JSON.parse(await firstLine(second)) as { url: string; attached: boolean };
    expect(attached).toEqual({ url: started.url, port: started.port, pid: first.pid, attached: true });
    expect(await exitCode(second)).toBe(0);

    first.kill('SIGINT');
    expect(await exitCode(first)).toBe(0);
    expect(existsSync(join(root, LOCK_FILE_NAME))).toBe(false);
  });

  it('prints the URL in human form without --json', async () => {
    const root = project();
    const child = spawnCli(['design', root, '--no-open']);
    const output = await linesUntil(child, /→ http/);
    expect(output).toMatch(/u8g2gl design · /);
    expect(output).toMatch(/→ http:\/\/127\.0\.0\.1:\d+\/\?token=[0-9a-f]{64}/);
    child.kill('SIGTERM');
    expect(await exitCode(child)).toBe(0);
  });

  it('exits 1 for a directory that is not a project, and 2 for a bad option', async () => {
    const empty = makeTempDir('design-command-empty');
    expect(await exitCode(spawnCli(['design', empty, '--no-open']))).toBe(1);
    expect(await exitCode(spawnCli(['design', '--port', 'x', '--no-open']))).toBe(2);
  });
});

// spawnCli
// Runs the built CLI; the child is killed after the test if still running.
function spawnCli(args: readonly string[]): ChildProcess {
  const child = spawn(process.execPath, [CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  return child;
}

// linesUntil
// Stdout accumulated until it matches `pattern`; rejects after 10 s or on exit.
function linesUntil(child: ChildProcess, pattern: RegExp): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`timed out; got ${JSON.stringify(output)}`)), 10_000);
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (pattern.test(output)) {
        clearTimeout(timer);
        resolve(output);
      }
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error(`exited before matching; got ${JSON.stringify(output)}`));
    });
  });
}

// firstLine
// The first complete line of stdout.
async function firstLine(child: ChildProcess): Promise<string> {
  const output = await linesUntil(child, /\n/);
  return output.slice(0, output.indexOf('\n'));
}

// exitCode
// Resolves with the child's exit code once it exits.
function exitCode(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => child.once('exit', (code) => resolve(code)));
}

// exitedPid
// The pid of a process that has already exited — a lock's "dead pid".
async function exitedPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  const pid = child.pid ?? 0;
  await new Promise((r) => child.once('exit', r));
  return pid;
}
