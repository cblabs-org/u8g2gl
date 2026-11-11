/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/use-unsaved-guard.ts
 * Purpose: Stops a reload or a closed tab from silently discarding unsaved
 *          edits. Once the design server has stopped, the tab is the only
 *          place those edits exist, and the browser does not ask on its own.
 * Description: A hook owning one `beforeunload` listener, which gets the
 *              browser's own "Leave site?" prompt. It is armed exactly while
 *              the dirty set is non-empty, so with nothing unsaved it never
 *              nags, and it is removed when the component unmounts.
 *
 * Exports:
 * - useUnsavedGuard():  Arm the prompt while anything is unsaved
 */

import { useEffect } from 'react';
import type { Observable } from '../state/observable';

/** @brief Arms the browser's leave-page prompt while `dirty` is non-empty. */
export function useUnsavedGuard(dirty: Observable<ReadonlySet<string>>): void {
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent): void => event.preventDefault();
    let armed = false;
    // update
    // Adds or removes the listener when the dirty set crosses empty.
    const update = (): void => {
      const wanted = dirty.get().size > 0;
      if (wanted === armed) return;
      armed = wanted;
      if (armed) window.addEventListener('beforeunload', guard);
      else window.removeEventListener('beforeunload', guard);
    };
    update();
    const off = dirty.subscribe(update);
    return () => {
      off();
      window.removeEventListener('beforeunload', guard);
    };
  }, [dirty]);
}
