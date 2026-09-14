/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_version.h
 *
 * Purpose: Lets a generated file refuse to compile against a runtime it was not
 *          generated for (§16). The generator and the runtime are built and
 *          shipped separately but consumed together, so a stale `generated/`
 *          directory would otherwise fail mysteriously — as a missing symbol, a
 *          wrong argument, or worse, not at all. This header turns that into
 *          one named compile error at the top of the generated file.
 *
 *          Also the single source of the runtime's own version. CMakeLists.txt
 *          reads these macros at configure time and refuses to configure if its
 *          `project(... VERSION)` disagrees, so the two cannot drift silently
 *          (.agents/rules/03-versioning.md).
 *
 * Description: Runtime version, the schema version this runtime implements, and
 *              the static_assert hook a generated header invokes.
 *
 * Exported Constants:
 *
 *     Runtime version:
 *     - U8G2GL_VERSION_MAJOR / _MINOR / _PATCH
 *
 *     Supported schema:
 *     - U8G2GL_SCHEMA_VERSION_MAJOR: the schema major generated code must match
 *     - U8G2GL_SCHEMA_VERSION_MINOR: the schema minor implemented; recorded, not enforced
 *
 * Exported Macros:
 * - U8G2GL_REQUIRE_SCHEMA_VERSION(): compile-time refusal of a mismatched schema major
 */
#ifndef U8G2GL_VERSION_H
#define U8G2GL_VERSION_H

// Plain integer macros rather than constexpr: CMakeLists.txt parses them with a
// regex at configure time, and a preprocessor #if can test them.

#define U8G2GL_VERSION_MAJOR 0  ///< Runtime major version
#define U8G2GL_VERSION_MINOR 4  ///< Runtime minor version
#define U8G2GL_VERSION_PATCH 0  ///< Runtime patch version

#define U8G2GL_SCHEMA_VERSION_MAJOR 0  ///< Schema major this runtime implements
#define U8G2GL_SCHEMA_VERSION_MINOR 4  ///< Schema minor this runtime implements

/**
 * @brief Refuse to compile if generated code targets a different schema major.
 *
 * A generated header invokes this once, at namespace scope, with the schema
 * version recorded in its own header comment (§13.9):
 *
 * @code
 * #include "u8g2gl/u8g2gl_version.h"
 * U8G2GL_REQUIRE_SCHEMA_VERSION(0, 4);
 * @endcode
 *
 * Only the major is compared, as §16 specifies. The minor is accepted so that
 * generated code states its full version once and the runtime's policy can
 * tighten later without the generator changing what it emits.
 *
 * Schema major rather than generator or runtime major: the schema and §13 are
 * the contract generated code is written against, and the CLI and runtime carry
 * different version numbers.
 *
 * @param major Schema major version the generated code was produced for.
 * @param minor Schema minor version; currently not compared.
 */
#define U8G2GL_REQUIRE_SCHEMA_VERSION(major, minor)                              \
    static_assert((major) == U8G2GL_SCHEMA_VERSION_MAJOR,                        \
        "U8G2GL schema major version mismatch: this generated code was produced "\
        "for a schema major version this runtime does not implement. Regenerate "\
        "with a u8g2gl CLI matching the runtime, or use a matching runtime.")

#endif // U8G2GL_VERSION_H
