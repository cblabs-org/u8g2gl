/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/runtime-version-header.ts
 * Purpose: Reads the runtime's own version out of
 *          include/u8g2gl/u8g2gl_version.h, the one place it is stated for the
 *          compiler. Shared by the build script that stamps it into the CLI and
 *          by the drift test that checks the stamp, so the two cannot disagree
 *          about how the header is read.
 * Description: Parses the three `#define U8G2GL_VERSION_*` macros the same way
 *              CMakeLists.txt does at configure time, and refuses loudly when
 *              one is missing rather than guessing.
 *
 * Exports:
 * - RuntimeVersion:           Major, minor and patch of the runtime
 * - parseRuntimeVersion():    Extract them from the header's text
 */

/** The runtime's version, as `u8g2gl_version.h` defines it. */
export interface RuntimeVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/**
 * @brief Extracts `U8G2GL_VERSION_MAJOR/_MINOR/_PATCH` from the header text.
 *
 * @param headerText Contents of `include/u8g2gl/u8g2gl_version.h`.
 * @return The runtime version.
 * @throws Error if any of the three macros is missing, as CMake's configure
 *         step does: a stamp built from a partial read would assert a floor
 *         nobody chose.
 */
export function parseRuntimeVersion(headerText: string): RuntimeVersion {
  const read = (part: 'MAJOR' | 'MINOR' | 'PATCH'): number => {
    const match = new RegExp(`^#define U8G2GL_VERSION_${part} +(\\d+)`, 'm').exec(headerText);
    if (match === null) {
      throw new Error(`u8g2gl_version.h does not define U8G2GL_VERSION_${part}`);
    }
    return Number(match[1]);
  };
  return { major: read('MAJOR'), minor: read('MINOR'), patch: read('PATCH') };
}
