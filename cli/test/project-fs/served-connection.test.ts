/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/project-fs/served-connection.test.ts
 * Purpose: `ServedProjectFileSystem`'s connection state, which the designer's
 *          "session ended" banner depends on. A real server cannot be made to
 *          drop and recover a stream on cue, and `EventSource`'s retry exists
 *          only in a browser, so these tests drive a fake stream directly:
 *          each `ready` and each error happens exactly when the test says.
 * Description: The fake records the handlers the file system installs and
 *              exposes `ready()` and `fail()` to fire them. No request is
 *              made: connection state comes from the stream alone.
 */

import { describe, expect, it } from 'vitest';
import { ServedProjectFileSystem, type ConnectionState, type EventSourceLike } from '../../src/core/project-fs/index.js';

/** A stream the test fires by hand. */
interface FakeStream extends EventSourceLike {
  /** Dispatches `event: ready`, as the server does on attach. */
  ready(): void;
  /** Calls `onerror`, as a dropped stream or a refused retry does. */
  fail(): void;
  /** Whether `close()` was called. */
  readonly closed: boolean;
}

// fakeStream
// A FakeStream with nothing fired yet.
function fakeStream(): FakeStream {
  const readyListeners: Array<() => void> = [];
  let closed = false;
  const stream: FakeStream = {
    onmessage: null,
    onerror: null,
    addEventListener: (_type, listener) => {
      readyListeners.push(listener);
    },
    close: () => {
      closed = true;
    },
    ready: () => {
      for (const listener of readyListeners) listener();
    },
    fail: () => stream.onerror?.({}),
    get closed() {
      return closed;
    },
  };
  return stream;
}

// setup
// A file system over one fake stream, and every state change it reports.
function setup(): { fs: ServedProjectFileSystem; stream: FakeStream; changes: ConnectionState[] } {
  const stream = fakeStream();
  const fs = new ServedProjectFileSystem({ origin: 'http://127.0.0.1:1', token: 'token', createEventSource: () => stream });
  const changes: ConnectionState[] = [];
  fs.onConnectionChange((state) => changes.push(state));
  return { fs, stream, changes };
}

describe('ServedProjectFileSystem — connection state', () => {
  it('rejects connect() for an error before ready, closing the stream and reporting no change', async () => {
    const { fs, stream, changes } = setup();
    const connecting = fs.connect();
    stream.fail();
    await expect(connecting).rejects.toThrow(/event stream/);
    expect(stream.closed).toBe(true);
    expect(fs.connection).toBe('connected');
    expect(changes).toEqual([]);
  });

  it('is connected once ready, and lost after an error that follows it', async () => {
    const { fs, stream, changes } = setup();
    const connecting = fs.connect();
    stream.ready();
    await connecting;
    expect(fs.connection).toBe('connected');
    stream.fail();
    expect(fs.connection).toBe('lost');
    expect(changes).toEqual(['lost']);
  });

  it('reports each retry failure once, and a second ready as connected again', async () => {
    const { fs, stream, changes } = setup();
    const connecting = fs.connect();
    stream.ready();
    await connecting;
    stream.fail();
    stream.fail();
    stream.fail();
    stream.ready();
    expect(fs.connection).toBe('connected');
    expect(changes).toEqual(['lost', 'connected']);
  });

  it('reports neither state when the caller closes the stream', async () => {
    const { fs, stream, changes } = setup();
    const connecting = fs.connect();
    stream.ready();
    await connecting;
    fs.close();
    expect(stream.closed).toBe(true);
    // A closed stream says nothing about the server, even if it fires.
    stream.fail();
    stream.ready();
    expect(fs.connection).toBe('connected');
    expect(changes).toEqual([]);
  });

  it('stops notifying after unsubscribe, and a throwing listener does not stop the others', async () => {
    const { fs, stream, changes } = setup();
    fs.onConnectionChange(() => {
      throw new Error('a broken listener');
    });
    const later: ConnectionState[] = [];
    const off = fs.onConnectionChange((state) => later.push(state));
    const connecting = fs.connect();
    stream.ready();
    await connecting;
    stream.fail();
    off();
    off();
    stream.ready();
    expect(changes).toEqual(['lost', 'connected']);
    expect(later).toEqual(['lost']);
  });
});
