/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/state/setting-storage.ts
 * Purpose: Where the designer's per-browser view settings are kept — the
 *          Explorer's expanded screens, the elements hidden in the designer —
 *          and the one guarded way to reach it. A setting is a convenience:
 *          storage can be missing or throw (a private window, a sandboxed
 *          frame), and every caller must still work without it.
 * Description: The storage type is the two methods a setting uses, so a unit
 *              test passes an in-memory or a throwing one. Each caller wraps
 *              its own reads and writes in try/catch.
 *
 * Exports:
 * - SettingStorage:    The storage a setting is kept in, or null
 * - browserStorage():  The page's localStorage, or null
 */

/** The storage a setting is kept in; null where there is none. */
export type SettingStorage = Pick<Storage, 'getItem' | 'setItem'> | null;

/**
 * @brief The page's localStorage, or null where there is none. Reading the
 *        property itself can throw (a sandboxed frame), so it is guarded.
 */
export function browserStorage(): SettingStorage {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
