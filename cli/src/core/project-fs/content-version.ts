/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/project-fs/content-version.ts
 * Purpose: The version a `ProjectFileSystem` attaches to every read, so a save
 *          can refuse to overwrite a file that changed underneath the editor
 *          — the designer never silently overwrites. It is
 *          derived from the content, not from a clock or a counter, so the
 *          server and the browser compute the same version for the same bytes
 *          without sharing any state, and a file rewritten with identical
 *          content is — correctly — not a conflict.
 * Description: 64-bit FNV-1a over the bytes, plus the length, as hex. Pure and
 *              synchronous, because `src/core/` may not import `node:crypto`
 *              and Web Crypto's digest is asynchronous and absent from some
 *              hosts. The threat is accidental collision between two versions
 *              of one file, not an adversary, which 64 bits and the length
 *              cover; the server is token-gated and loopback-only.
 *
 * Exports:
 * - contentVersion():  The opaque version string for a file's bytes
 */

/**
 * @brief Computes the opaque version string for a file's content.
 *
 * Equal bytes always give an equal version, on every host. Callers must treat
 * the string as opaque — compare it for equality, never parse it.
 *
 * @param bytes The file's content.
 * @return A short ASCII string identifying the content.
 */
export function contentVersion(bytes: Uint8Array): string {
  // 64-bit FNV-1a held as four 16-bit limbs, low limb first, so every
  // intermediate stays an exact integer in a double. Offset basis
  // 0xcbf29ce484222325; the prime is 2^40 + 0x1b3, so multiplying is
  // `h * 0x1b3 + (h << 40)`, and the shift lands limbs 0 and 1 eight bits
  // into limbs 2 and 3.
  let h0 = 0x2325;
  let h1 = 0x8422;
  let h2 = 0x9ce4;
  let h3 = 0xcbf2;
  for (const byte of bytes) {
    h0 ^= byte;
    const t0 = h0 * 0x1b3;
    const t1 = h1 * 0x1b3 + (t0 >>> 16);
    const t2 = h2 * 0x1b3 + (h0 << 8) + Math.floor(t1 / 0x10000);
    const t3 = h3 * 0x1b3 + (h1 << 8) + Math.floor(t2 / 0x10000);
    h0 = t0 & 0xffff;
    h1 = t1 % 0x10000;
    h2 = t2 % 0x10000;
    h3 = t3 % 0x10000;
  }
  const hex = [h3, h2, h1, h0].map((limb) => limb.toString(16).padStart(4, '0')).join('');
  return `${hex}-${bytes.length.toString(16)}`;
}
