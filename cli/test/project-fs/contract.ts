/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/project-fs/contract.ts
 * Purpose: The one behavioural definition of `ProjectFileSystem`, run against
 *          every implementation, so the in-memory and served implementations
 *          cannot quietly mean different things by "read", "conflict" or
 *          "changed". An implementation passes by calling
 *          `runProjectFsContract` with a factory; nothing here knows which
 *          implementation it is testing.
 * Description: The factory seeds a project and returns the filesystem under
 *              test plus two hooks that change files *behind its back* — for
 *              the in-memory implementation its simulate* hooks, for the served
 *              one a write to the real directory — which is how the case of an
 *              IDE editing the same files beside the editor is exercised. Events may
 *              arrive synchronously or later; every event assertion waits up
 *              to `eventTimeoutMs`, and "no event" assertions wait `quietMs`.
 *
 * Exports:
 * - ProjectFsFixture:        The filesystem under test, external-change hooks, disposal
 * - ProjectFsFactory:        Builds a fixture seeded with files
 * - ProjectFsContractOptions: Event timing for slower implementations
 * - INVALID_PATHS:           The lexical write-boundary cases, shared with the server's tests
 * - runProjectFsContract():  Register the suite
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectFileSystem, ProjectFsEvent } from '../../src/core/project-fs/index.js';

/** A filesystem under test, and the means to change its files from outside. */
export interface ProjectFsFixture {
  readonly fs: ProjectFileSystem;
  /** Create or replace a file as another author would. */
  externalWrite(path: string, content: string | Uint8Array): Promise<void>;
  /** Delete a file as another author would. */
  externalRemove(path: string): Promise<void>;
  /** Release everything the fixture holds — servers, connections, directories. */
  dispose(): Promise<void>;
}

/** Builds a fresh fixture whose project holds exactly `files`. */
export type ProjectFsFactory = (files: Readonly<Record<string, string>>) => Promise<ProjectFsFixture>;

/** Timing for implementations whose events are not synchronous. */
export interface ProjectFsContractOptions {
  /** How long to wait for an expected event. Default 1000 ms. */
  readonly eventTimeoutMs?: number;
  /** How long to wait before concluding no (further) event is coming. Default 150 ms. */
  readonly quietMs?: number;
}

/**
 * Paths every implementation must refuse with `invalid-path`, and the design
 * server must refuse on every route: traversal, absolute, Windows drive and
 * backslash forms, empty and dot segments, and control characters.
 */
export const INVALID_PATHS: readonly string[] = [
  '',
  '/etc/passwd',
  '../outside.xml',
  'screens/../../outside.xml',
  'screens/..',
  './u8g2gl.xml',
  'screens/./screen_a.xml',
  'screens//screen_a.xml',
  'screens/',
  '...',
  '..\\outside.xml',
  'screens\\screen_a.xml',
  'C:/Windows/win.ini',
  'C:outside.xml',
  'u8g2gl.xml:stream',
  'nul\u0000byte.xml',
];

const SEED: Readonly<Record<string, string>> = {
  'u8g2gl.xml': '<u8g2gl schema="0.5" name="contract" version="1.0.0" />\n',
  'globals.xml': '<globals />\n',
  'screens/screen_a.xml': '<screen name="a" />\n',
};

// EventRecorder
// Records every event from one subscription, and waits for one that matches.
class EventRecorder {
  readonly events: ProjectFsEvent[] = [];
  private readonly waiters: Array<{ match: (e: ProjectFsEvent) => boolean; resolve: (e: ProjectFsEvent) => void }> = [];
  readonly unsubscribe: () => void;

  constructor(fs: ProjectFileSystem) {
    this.unsubscribe = fs.watch((event) => {
      this.events.push(event);
      for (const waiter of [...this.waiters]) {
        if (waiter.match(event)) {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          waiter.resolve(event);
        }
      }
    });
  }

  // waitFor
  // The first recorded or future event matching `kind` and `path`; rejects
  // after `timeoutMs`, naming what it saw instead.
  waitFor(kind: ProjectFsEvent['kind'], path: string, timeoutMs: number): Promise<ProjectFsEvent> {
    const match = (e: ProjectFsEvent): boolean => e.kind === kind && e.path === path;
    const seen = this.events.find(match);
    if (seen) {
      return Promise.resolve(seen);
    }
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve };
      this.waiters.push(waiter);
      setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
          reject(new Error(`no '${kind}' event for '${path}' within ${timeoutMs} ms; saw ${JSON.stringify(this.events)}`));
        }
      }, timeoutMs);
    });
  }
}

// delay
// Resolves after `ms` milliseconds.
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @brief Registers the `ProjectFileSystem` contract suite for one implementation.
 *
 * @param name    Names the implementation in the suite title.
 * @param factory Builds a seeded fixture; called once per test, and the fixture
 *                is disposed after it.
 * @param options Event timing.
 */
export function runProjectFsContract(name: string, factory: ProjectFsFactory, options: ProjectFsContractOptions = {}): void {
  const eventTimeoutMs = options.eventTimeoutMs ?? 1000;
  const quietMs = options.quietMs ?? 150;

  describe(`ProjectFileSystem contract — ${name}`, () => {
    let fixture: ProjectFsFixture | undefined;
    const recorders: EventRecorder[] = [];

    // setup
    // A fresh fixture for this test, seeded with SEED plus `extra`.
    async function setup(extra: Readonly<Record<string, string>> = {}): Promise<ProjectFsFixture> {
      fixture = await factory({ ...SEED, ...extra });
      return fixture;
    }

    // record
    // Subscribes a recorder that is unsubscribed after the test.
    function record(fs: ProjectFileSystem): EventRecorder {
      const recorder = new EventRecorder(fs);
      recorders.push(recorder);
      return recorder;
    }

    afterEach(async () => {
      for (const recorder of recorders.splice(0)) {
        recorder.unsubscribe();
      }
      await fixture?.dispose();
      fixture = undefined;
    });

    describe('list', () => {
      it('lists every seeded file, sorted by code unit', async () => {
        const { fs } = await setup({ 'screens/screen_a_1.xml': '<screen />\n', 'screens/screen_a1.xml': '<screen />\n' });
        const listing = await fs.list();
        expect(listing).toEqual({
          ok: true,
          files: [
            'globals.xml',
            'screens/screen_a.xml',
            'screens/screen_a1.xml',
            'screens/screen_a_1.xml',
            'u8g2gl.xml',
          ],
        });
      });

      it('includes a file written into a directory that did not exist', async () => {
        const { fs } = await setup();
        expect((await fs.write('widgets/gauge/gauge.xml', '<widget />\n')).ok).toBe(true);
        const listing = await fs.list();
        expect(listing.ok && listing.files).toContain('widgets/gauge/gauge.xml');
      });
    });

    describe('read', () => {
      it('returns the text and a version', async () => {
        const { fs } = await setup();
        const result = await fs.read('screens/screen_a.xml');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.path).toBe('screens/screen_a.xml');
        expect(result.text).toBe('<screen name="a" />\n');
        expect(typeof result.version).toBe('string');
        expect(result.version.length).toBeGreaterThan(0);
      });

      it('returns the same version for two reads of an unchanged file', async () => {
        const { fs } = await setup();
        const a = await fs.read('u8g2gl.xml');
        const b = await fs.read('u8g2gl.xml');
        expect(a.ok && b.ok && a.version === b.version).toBe(true);
      });

      it('round-trips non-ASCII text as UTF-8', async () => {
        const { fs } = await setup();
        const text = '<label text="café — ✓ 温度" />\n';
        expect((await fs.write('screens/screen_u.xml', text)).ok).toBe(true);
        const result = await fs.read('screens/screen_u.xml');
        expect(result.ok && result.text).toBe(text);
      });

      it('reports a byte-order mark as bom, without it in the text; a file without one has bom false', async () => {
        const { fs, externalWrite } = await setup();
        const body = new TextEncoder().encode('<screen name="m" />\n');
        await externalWrite('screens/screen_m.xml', new Uint8Array([0xef, 0xbb, 0xbf, ...body]));
        expect(await fs.read('screens/screen_m.xml')).toMatchObject({ ok: true, text: '<screen name="m" />\n', bom: true });
        expect(await fs.read('screens/screen_a.xml')).toMatchObject({ ok: true, bom: false });
      });

      it('reports a missing file as not-found', async () => {
        const { fs } = await setup();
        const result = await fs.read('screens/screen_missing.xml');
        expect(result).toMatchObject({ ok: false, code: 'not-found' });
      });

      it('reads bytes exactly, with the version a text read gives', async () => {
        const { fs, externalWrite } = await setup();
        const bytes = new Uint8Array([0x00, 0xff, 0x80, 0x0a, 0x7f, 0xfe]);
        await externalWrite('images/logo.xbm', bytes);
        const result = await fs.readBytes('images/logo.xbm');
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect([...result.bytes]).toEqual([...bytes]);

        const text = await fs.read('u8g2gl.xml');
        const raw = await fs.readBytes('u8g2gl.xml');
        expect(text.ok && raw.ok && text.version === raw.version).toBe(true);
      });
    });

    describe('write', () => {
      it('creates a file and reports it as created, with the version a read then returns', async () => {
        const { fs } = await setup();
        const written = await fs.write('screens/screen_b.xml', '<screen name="b" />\n');
        expect(written).toMatchObject({ ok: true, path: 'screens/screen_b.xml', created: true });
        const read = await fs.read('screens/screen_b.xml');
        expect(read.ok && read.text).toBe('<screen name="b" />\n');
        expect(written.ok && read.ok && written.version === read.version).toBe(true);
      });

      it('replaces a file unconditionally when no version is expected', async () => {
        const { fs } = await setup();
        const written = await fs.write('globals.xml', '<globals><consts /></globals>\n');
        expect(written).toMatchObject({ ok: true, created: false });
        expect(await fs.read('globals.xml')).toMatchObject({ ok: true, text: '<globals><consts /></globals>\n' });
      });

      it('changes the version when the content changes', async () => {
        const { fs } = await setup();
        const before = await fs.read('globals.xml');
        const written = await fs.write('globals.xml', '<globals><consts /></globals>\n');
        expect(before.ok && written.ok && before.version !== written.version).toBe(true);
      });

      it('writes when the expected version is current', async () => {
        const { fs } = await setup();
        const read = await fs.read('globals.xml');
        if (!read.ok) throw new Error('seed missing');
        const written = await fs.write('globals.xml', '<globals><styles /></globals>\n', { expectedVersion: read.version });
        expect(written).toMatchObject({ ok: true, created: false });
      });

      it('refuses a stale expected version as a conflict, naming the current version, and leaves the file alone', async () => {
        const { fs } = await setup();
        const first = await fs.read('globals.xml');
        if (!first.ok) throw new Error('seed missing');
        const second = await fs.write('globals.xml', '<globals><consts /></globals>\n');
        if (!second.ok) throw new Error('write failed');

        const stale = await fs.write('globals.xml', '<globals><styles /></globals>\n', { expectedVersion: first.version });
        expect(stale).toMatchObject({ ok: false, code: 'conflict', currentVersion: second.version });
        expect(await fs.read('globals.xml')).toMatchObject({ ok: true, text: '<globals><consts /></globals>\n' });
      });

      it('refuses a save over an external change made since the read', async () => {
        const { fs, externalWrite } = await setup();
        const read = await fs.read('screens/screen_a.xml');
        if (!read.ok) throw new Error('seed missing');
        await externalWrite('screens/screen_a.xml', '<screen name="a" from="ide" />\n');

        const save = await fs.write('screens/screen_a.xml', '<screen name="a" from="editor" />\n', {
          expectedVersion: read.version,
        });
        expect(save).toMatchObject({ ok: false, code: 'conflict' });
        expect(await fs.read('screens/screen_a.xml')).toMatchObject({ ok: true, text: '<screen name="a" from="ide" />\n' });
      });

      it('keeps a byte-order mark when the write passes the bom it read, and writes none otherwise', async () => {
        const { fs, externalWrite } = await setup();
        const BOM = [0xef, 0xbb, 0xbf];
        await externalWrite('screens/screen_m.xml', new Uint8Array([...BOM, ...new TextEncoder().encode('<screen />\n')]));
        const read = await fs.read('screens/screen_m.xml');
        if (!read.ok) throw new Error('seed missing');

        const kept = await fs.write('screens/screen_m.xml', '<screen name="m" />\n', { expectedVersion: read.version, bom: read.bom });
        expect(kept.ok).toBe(true);
        const keptBytes = await fs.readBytes('screens/screen_m.xml');
        expect(keptBytes.ok && [...keptBytes.bytes.slice(0, 4)]).toEqual([...BOM, 0x3c]);
        expect(await fs.read('screens/screen_m.xml')).toMatchObject({ ok: true, text: '<screen name="m" />\n', bom: true });

        expect((await fs.write('screens/screen_m.xml', '<screen />\n')).ok).toBe(true);
        expect(await fs.read('screens/screen_m.xml')).toMatchObject({ ok: true, text: '<screen />\n', bom: false });
      });

      it('with expectedVersion null, creates an absent file but refuses to replace an existing one', async () => {
        const { fs } = await setup();
        expect(await fs.write('screens/screen_new.xml', '<screen />\n', { expectedVersion: null })).toMatchObject({
          ok: true,
          created: true,
        });
        const existing = await fs.read('globals.xml');
        const refused = await fs.write('globals.xml', '<globals />\n<!-- no -->\n', { expectedVersion: null });
        expect(refused).toMatchObject({ ok: false, code: 'conflict', currentVersion: existing.ok ? existing.version : 'x' });
      });

      it('refuses an expected version for a file that does not exist, with currentVersion null', async () => {
        const { fs } = await setup();
        const read = await fs.read('globals.xml');
        if (!read.ok) throw new Error('seed missing');
        const result = await fs.write('screens/screen_gone.xml', '<screen />\n', { expectedVersion: read.version });
        expect(result).toMatchObject({ ok: false, code: 'conflict', currentVersion: null });
        expect(await fs.read('screens/screen_gone.xml')).toMatchObject({ ok: false, code: 'not-found' });
      });
    });

    describe('the lexical path rule, applied before storage is touched', () => {
      it.each(INVALID_PATHS.map((path) => [JSON.stringify(path), path]))(
        'refuses %s on read, readBytes and write',
        async (_label, path) => {
          const { fs } = await setup();
          const before = await fs.list();
          expect(await fs.read(path)).toMatchObject({ ok: false, code: 'invalid-path' });
          expect(await fs.readBytes(path)).toMatchObject({ ok: false, code: 'invalid-path' });
          expect(await fs.write(path, 'escaped\n')).toMatchObject({ ok: false, code: 'invalid-path' });
          expect(await fs.list()).toEqual(before);
        },
      );
    });

    describe('watch', () => {
      it('reports an external edit to an existing file as changed', async () => {
        const { fs, externalWrite } = await setup();
        const recorder = record(fs);
        await externalWrite('screens/screen_a.xml', '<screen name="a" edited="1" />\n');
        await expect(recorder.waitFor('changed', 'screens/screen_a.xml', eventTimeoutMs)).resolves.toBeDefined();
      });

      it('reports an external new file as added', async () => {
        const { fs, externalWrite } = await setup();
        const recorder = record(fs);
        await externalWrite('screens/screen_c.xml', '<screen name="c" />\n');
        await expect(recorder.waitFor('added', 'screens/screen_c.xml', eventTimeoutMs)).resolves.toBeDefined();
      });

      it('reports an external deletion as removed', async () => {
        const { fs, externalRemove } = await setup();
        const recorder = record(fs);
        await externalRemove('screens/screen_a.xml');
        await expect(recorder.waitFor('removed', 'screens/screen_a.xml', eventTimeoutMs)).resolves.toBeDefined();
        expect(await fs.read('screens/screen_a.xml')).toMatchObject({ ok: false, code: 'not-found' });
      });

      it("reports this instance's own writes — added for a new file, changed for an existing one", async () => {
        const { fs } = await setup();
        const recorder = record(fs);
        await fs.write('screens/screen_d.xml', '<screen name="d" />\n');
        await fs.write('globals.xml', '<globals><consts /></globals>\n');
        await expect(recorder.waitFor('added', 'screens/screen_d.xml', eventTimeoutMs)).resolves.toBeDefined();
        await expect(recorder.waitFor('changed', 'globals.xml', eventTimeoutMs)).resolves.toBeDefined();
      });

      it('reports one external save as exactly one event', async () => {
        const { fs, externalWrite } = await setup();
        const recorder = record(fs);
        await externalWrite('screens/screen_a.xml', '<screen name="a" once="1" />\n');
        await recorder.waitFor('changed', 'screens/screen_a.xml', eventTimeoutMs);
        await delay(quietMs);
        expect(recorder.events.filter((e) => e.path === 'screens/screen_a.xml')).toHaveLength(1);
      });

      it('delivers to every listener, and stops delivering once unsubscribed', async () => {
        const { fs, externalWrite } = await setup();
        const kept = record(fs);
        const dropped = record(fs);
        dropped.unsubscribe();
        dropped.unsubscribe(); // twice is harmless
        await externalWrite('globals.xml', '<globals><fonts /></globals>\n');
        await kept.waitFor('changed', 'globals.xml', eventTimeoutMs);
        await delay(quietMs);
        expect(dropped.events).toEqual([]);
      });
    });
  });
}
