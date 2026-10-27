/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/project-fs/index.ts
 * Purpose: The public surface of the project filesystem layer ([UD-2]), so
 *          callers import one module rather than reaching into its files.
 * Description: Re-exports the interface and its types, the shared lexical path
 *              rule, the content version, and the in-memory implementation.
 *
 * Exports:
 * - ProjectFileSystem and its result, event and option types
 * - GuardedProjectFileSystem:   Base class for implementations
 * - InMemoryProjectFileSystem:  In-memory implementation (tests, static mode)
 * - checkProjectPath():         The lexical write-boundary rule
 * - contentVersion():           The version a read carries
 */

export * from './project-file-system.js';
export { InMemoryProjectFileSystem, type InitialFiles } from './in-memory-project-file-system.js';
export { checkProjectPath, type ProjectPathCheck } from './project-path-rule.js';
export { contentVersion } from './content-version.js';
