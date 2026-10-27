/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/use-observable.ts
 * Purpose: Lets a React component read one `Observable` and re-render when,
 *          and only when, that value changes.
 * Description: `useSyncExternalStore`, which React provides for exactly this:
 *              state owned outside React, read consistently during a render.
 *
 * Exports:
 * - useObservable():  The observable's current value, subscribed
 */

import { useSyncExternalStore } from 'react';
import type { Observable } from '../state/observable';

/** @brief The current value of `source`; the component re-renders when it changes. */
export function useObservable<T>(source: Observable<T>): T {
  return useSyncExternalStore(
    (onChange) => source.subscribe(onChange),
    () => source.get(),
  );
}
