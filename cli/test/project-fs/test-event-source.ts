/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/project-fs/test-event-source.ts
 * Purpose: Lets `ServedProjectFileSystem` run under Node, which has `fetch` but
 *          no global `EventSource` (Node 22 and later alike). A polyfill
 *          dependency would ship to nobody — the browser has the real thing —
 *          so the tests use this instead, injected through the
 *          `createEventSource` option.
 * Description: A minimal server-sent-events reader over a streaming `fetch`:
 *              `event:`, `data:` and comment lines, frames split on a blank
 *              line, `ready` dispatched to its listeners and everything else to
 *              `onmessage`. A non-2xx response or a dropped stream calls
 *              `onerror`. No reconnection, no `Last-Event-ID`: enough to test
 *              the contract, not a general client.
 *
 * Exports:
 * - createTestEventSource():  An EventSourceLike for one URL
 */

import type { EventSourceLike } from '../../src/core/project-fs/index.js';

/**
 * @brief Opens a server-sent-event stream with `fetch`.
 *
 * @param url The stream URL, token included.
 * @return An EventSourceLike; `close()` aborts the request.
 */
export function createTestEventSource(url: string): EventSourceLike {
  const controller = new AbortController();
  const readyListeners: Array<() => void> = [];
  const source: EventSourceLike = {
    onmessage: null,
    onerror: null,
    addEventListener: (_type, listener) => {
      readyListeners.push(listener);
    },
    close: () => controller.abort(),
  };

  // dispatch
  // One complete frame: its event type and its data lines joined.
  const dispatch = (frame: string): void => {
    let type = 'message';
    const data: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) {
        type = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        data.push(line.slice('data:'.length).replace(/^ /, ''));
      }
    }
    if (type === 'ready') {
      for (const listener of readyListeners) listener();
    } else if (data.length > 0) {
      source.onmessage?.({ data: data.join('\n') });
    }
  };

  void (async () => {
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok || response.body === null) {
        await response.body?.cancel();
        source.onerror?.({ status: response.status });
        return;
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
          dispatch(buffer.slice(0, end));
          buffer = buffer.slice(end + 2);
        }
      }
      source.onerror?.({ closed: true });
    } catch (error) {
      if (!controller.signal.aborted) {
        source.onerror?.(error);
      }
    }
  })();
  return source;
}
