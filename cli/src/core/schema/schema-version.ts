/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/schema-version.ts
 * Purpose: The one spelling of the schema version this CLI writes for. Two
 *          layers need it and must agree: the validator, which tells an
 *          unknown or superseded version what to declare, and the generator,
 *          whose version guard asserts it (rules/03-versioning.md: the guard is
 *          pinned to "the schema the generator wrote for"). It lives here, in
 *          neither, so neither imports the other.
 * Description: The version as written in `u8g2gl.xml` and as the guard's
 *              major and minor. The guard asserts this for every version the
 *              validator accepts, never the one a project declares: an accepted
 *              older minor is a subset of this one, and code generated from it
 *              is code for this schema. The project's own version is still
 *              recorded, in each file's `// schema` provenance stamp.
 *
 * Exports:
 * - CURRENT_SCHEMA_VERSION: The schema version this CLI writes for, e.g. "0.5"
 * - CURRENT_SCHEMA:         Its major and minor, as the version guard emits them
 */

/**
 * The schema version this CLI writes for, as `U8G2GL_REQUIRE_SCHEMA_VERSION`
 * takes it. Must equal the runtime's `U8G2GL_SCHEMA_VERSION_MAJOR` / `_MINOR`
 * in the tree this CLI ships from; the C++ suite compiles the guard against them.
 */
export const CURRENT_SCHEMA: { readonly major: number; readonly minor: number } = { major: 0, minor: 5 };

/** {@link CURRENT_SCHEMA} as `u8g2gl.xml` spells it, e.g. "0.5". Derived, so the two cannot disagree. */
export const CURRENT_SCHEMA_VERSION = `${CURRENT_SCHEMA.major}.${CURRENT_SCHEMA.minor}`;
