/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/project-path.ts
 * Purpose: The real-path half of the project boundary ([D-11], §13.10), as one
 *          function every Node caller shares: `loadProject()` uses it so an
 *          asset `src` cannot read outside the project, and the design server
 *          uses it so a write cannot land outside it. Two copies of this rule
 *          would drift, and the first to drift would be the one nobody tested.
 *          The lexical half — `..`, absolute paths, backslashes — is the pure
 *          `checkProjectPath` in `src/core/project-fs/`, which needs no
 *          filesystem and so also runs in the browser.
 * Description: Resolves both paths through `realpathSync`, so a symlink is
 *              judged by where it points.
 *
 * Exports:
 * - isInsideProject():  Whether an absolute path lies inside a project directory
 */

import { realpathSync } from 'node:fs';
import { sep } from 'node:path';

/**
 * @brief Whether an absolute path lies inside the project directory.
 *
 * Applies [D-11] and §13.10's write-boundary in the other direction: an author
 * who needs a file from elsewhere can copy it in. Both paths are compared by
 * their real (symlink-free) location, so a symlink inside the project that
 * points outside it does not pass, and a project root reached through a symlink
 * (macOS `/tmp` -> `/private/tmp`) still works.
 *
 * **A target that does not exist cannot be resolved**, so it falls back to the
 * lexical comparison of the two paths as given, and the caller's missing-file
 * handling takes over. A caller about to *create* a file must therefore check
 * the nearest ancestor that does exist, not the new file's own path, or a new
 * file under a symlinked directory pointing outside would pass.
 *
 * @param projectRoot Absolute project directory.
 * @param absolute    Absolute path to test.
 * @return True if `absolute` is the project root or lies beneath it.
 */
export function isInsideProject(projectRoot: string, absolute: string): boolean {
  let root = projectRoot;
  let target = absolute;
  try {
    target = realpathSync(absolute);
    root = realpathSync(projectRoot);
  } catch {
    // Not resolvable (absent): compare lexically, as for any missing file.
  }
  return target === root || target.startsWith(root + sep);
}
