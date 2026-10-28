/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/state/observable.ts
 * Purpose: The one way designer state outside the document reaches React.
 *          The document itself lives in Monaco's models ([UD-3]); what is left —
 *          diagnostics, the Wasm status, the selection, the zoom — is held in
 *          small observables that each panel subscribes to separately, so a
 *          keystroke re-renders only the components whose data changed and
 *          never the whole shell: the edit loop's 16 ms frame has no room for
 *          a full render.
 * Description: A value, a setter that notifies only on change (by `Object.is`,
 *              or a supplied equality), and a subscription. No dependency;
 *              `useObservable` in `ui/` adapts it to React's
 *              `useSyncExternalStore`.
 *
 * Exports:
 * - Observable:   A value that tells its subscribers when it changes
 *
 *     Reading and writing:
 *     - get():        The current value
 *     - set():        Replace it, notifying if it differs
 *
 *     Subscribing:
 *     - subscribe():  Call a listener on every change; returns the unsubscribe
 */

/** A value that tells its subscribers when it changes. */
export class Observable<T> {
  private value: T;
  private readonly listeners = new Set<() => void>();
  private readonly equals: (a: T, b: T) => boolean;

  /**
   * @param initial The starting value.
   * @param equals  When two values count as the same, so `set` stays silent;
   *                `Object.is` by default.
   */
  constructor(initial: T, equals: (a: T, b: T) => boolean = Object.is) {
    this.value = initial;
    this.equals = equals;
  }

  /** @brief The current value. */
  get(): T {
    return this.value;
  }

  /**
   * @brief Replaces the value, and notifies subscribers only if it changed.
   *
   * A listener that throws does not stop the others: the value has already
   * changed, and every other view should still see it.
   */
  set(next: T): void {
    if (this.equals(this.value, next)) {
      return;
    }
    this.value = next;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error(error);
      }
    }
  }

  /**
   * @brief Calls `listener` after every change.
   *
   * @return A function that unsubscribes; calling it twice is harmless.
   */
  subscribe(listener: () => void): () => void {
    const entry = (): void => listener();
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  }
}
