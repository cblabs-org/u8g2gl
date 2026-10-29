/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/drag-stamp.test.ts
 * Purpose: Which pointer move a drawn frame of a drag is measured from: the
 *          latest the gesture processed before the run, whether it wrote an
 *          edit or snapped to where the element already was. A run of moves
 *          held at one position by snapping must not date the frame from the
 *          first of them, and a move handled after the run began belongs to
 *          the next frame.
 * Description: `DragStamper` driven by hand, times in milliseconds.
 */

import { expect, test } from '@playwright/test';
import { DragStamper } from '../../src/perf/drag-stamp';

test('a frame whose edit is followed by moves snapped in place is measured from the latest of them', () => {
  const stamper = new DragStamper();
  stamper.moveProcessed({ input: 1, handled: 1.5 }); // wrote the edit
  stamper.editLanded();
  stamper.moveProcessed({ input: 5, handled: 5.2 }); // snapped to the same place
  stamper.moveProcessed({ input: 9, handled: 9.1 }); // and again
  stamper.moveProcessed({ input: 13, handled: 13.1 }); // and again
  expect(stamper.take(16)).toEqual({ input: 13, handled: 13.1 });
});

test('moves that only snap in place draw no frame of their own, and the next edit’s frame is measured from the latest move', () => {
  const stamper = new DragStamper();
  stamper.moveProcessed({ input: 1, handled: 1.2 });
  stamper.editLanded();
  expect(stamper.take(4)).toEqual({ input: 1, handled: 1.2 });
  stamper.moveProcessed({ input: 6, handled: 6.1 });
  stamper.moveProcessed({ input: 10, handled: 10.1 });
  // A run with nothing new to draw for the drag measures no move.
  expect(stamper.take(20)).toBeUndefined();
  stamper.moveProcessed({ input: 22, handled: 22.3 });
  stamper.editLanded();
  expect(stamper.take(30)).toEqual({ input: 22, handled: 22.3 });
});

test('a move handled after the run began is not the run’s; it waits for the next', () => {
  const stamper = new DragStamper();
  stamper.moveProcessed({ input: 2, handled: 2.1 });
  stamper.editLanded();
  stamper.moveProcessed({ input: 17, handled: 17.2 });
  expect(stamper.take(16)).toEqual({ input: 2, handled: 2.1 });
  stamper.editLanded();
  expect(stamper.take(33)).toEqual({ input: 17, handled: 17.2 });
});

test('reset forgets moves and edits', () => {
  const stamper = new DragStamper();
  stamper.moveProcessed({ input: 1, handled: 1 });
  stamper.editLanded();
  stamper.reset();
  expect(stamper.take(10)).toBeUndefined();
});
