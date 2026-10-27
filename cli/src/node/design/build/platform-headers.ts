/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/build/platform-headers.ts
 * Purpose: The widget author's one rule for the designer: a widget's C++ may
 *          depend on U8G2 and U8G2GL only, never on a platform header
 *          (Arduino, ESP-IDF, FreeRTOS), because the designer compiles it to
 *          WebAssembly, which is not a device. Broken, the rule would surface
 *          as a page of Emscripten errors about a missing `esp_log.h` deep in
 *          an include chain; this check runs before compiling and says it
 *          once, at the `#include` line, naming the header and the rule.
 * Description: Scans each widget source with comments blanked (so a header
 *              named in a comment is not an include), matches every
 *              `#include`, and classifies the header by name.
 *
 * Exports:
 * - PLATFORM_HEADER_CODE:     The diagnostic's stable code
 * - platformOf():             The platform a header belongs to, if any
 * - checkPlatformHeaders():   One diagnostic per platform `#include`
 */

import type { Diagnostic } from '../../../core/schema/diagnostic.js';

/** The diagnostic code. Public and stable, like every code (§15.4). */
export const PLATFORM_HEADER_CODE = 'U8G2GL_WIDGET_PLATFORM_HEADER';

/** The platforms the rule names, each by the header spellings that betray it. */
const PLATFORMS: ReadonlyArray<{ readonly platform: string; readonly matches: (header: string) => boolean }> = [
  { platform: 'Arduino', matches: (h) => /^arduino\.h$/i.test(h) },
  { platform: 'FreeRTOS', matches: (h) => /^freertos\.h$/i.test(h) || /^freertos\//i.test(h) },
  {
    platform: 'ESP-IDF',
    matches: (h) =>
      /^esp_[\w]+\.h$/.test(h) ||
      /^(esp32\w*|driver|soc|hal|esp_private|rom)\//.test(h) ||
      /^(sdkconfig|nvs|nvs_flash)\.h$/.test(h),
  },
];

/**
 * @brief The platform a header belongs to, or undefined for one a widget may use.
 *
 * @param header The included path, without quotes or angle brackets.
 */
export function platformOf(header: string): string | undefined {
  return PLATFORMS.find((entry) => entry.matches(header))?.platform;
}

/**
 * @brief One diagnostic per `#include` of a platform header in the given sources.
 *
 * @param sources Project-relative path → file text, for every widget source
 *                and header.
 * @return Errors, in path then line order, located at each `#include`.
 */
export function checkPlatformHeaders(sources: ReadonlyMap<string, string>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [file, text] of [...sources].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const lines = blankComments(text).split('\n');
    for (const [index, line] of lines.entries()) {
      const match = /^(\s*)#\s*include\s*[<"]([^>"]+)[>"]/.exec(line);
      const header = match?.[2];
      const platform = header === undefined ? undefined : platformOf(header);
      if (match === null || header === undefined || platform === undefined) {
        continue;
      }
      diagnostics.push({
        code: PLATFORM_HEADER_CODE,
        severity: 'error',
        file,
        line: index + 1,
        column: (match[1]?.length ?? 0) + 1,
        message:
          `'${header}' is a ${platform} header. A widget's C++ may depend only on U8G2 and U8G2GL, ` +
          'because the designer compiles it to WebAssembly, which is not a device: move the platform ' +
          'code out of the widget, behind a subject or a call the application makes.',
      });
    }
  }
  return diagnostics;
}

// blankComments
// The text with every comment replaced by spaces, newlines kept, so line and
// column numbers still point into the original. String literals are skipped,
// so "//" inside one is not a comment.
function blankComments(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    const char = text[i] ?? '';
    if (two === '//') {
      while (i < text.length && text[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (char === '"' || char === "'") {
      // A literal runs to its unescaped closing quote, or the end of the line.
      let j = i + 1;
      while (j < text.length && text[j] !== char && text[j] !== '\n') {
        j += text[j] === '\\' ? 2 : 1;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else {
      out += char;
      i++;
    }
  }
  return out;
}
