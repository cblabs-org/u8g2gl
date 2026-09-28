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
 *     - U8G2GL_SCHEMA_VERSION_MINOR: the schema minor; must also match while the major is 0
 *
 * Exported Macros:
 * - U8G2GL_REQUIRE_SCHEMA_VERSION(): compile-time refusal of a mismatched schema version
 */
#ifndef U8G2GL_VERSION_H
#define U8G2GL_VERSION_H

// Plain integer macros rather than constexpr: CMakeLists.txt parses them with a
// regex at configure time, and a preprocessor #if can test them.

#define U8G2GL_VERSION_MAJOR 0  ///< Runtime major version
#define U8G2GL_VERSION_MINOR 5  ///< Runtime minor version
#define U8G2GL_VERSION_PATCH 0  ///< Runtime patch version

#define U8G2GL_SCHEMA_VERSION_MAJOR 0  ///< Schema major this runtime implements
#define U8G2GL_SCHEMA_VERSION_MINOR 4  ///< Schema minor this runtime implements

/// @cond INTERNAL
// Two-level stringification so a macro argument is expanded before # applies:
// the refusal message then shows "0.3", not "major.minor".
#define U8G2GL_VERSION_STR_(x) #x
#define U8G2GL_VERSION_STR(x) U8G2GL_VERSION_STR_(x)
/// @endcond

/**
 * @brief Refuse to compile if generated code targets a different schema version.
 *
 * A generated header invokes this once, at namespace scope, with the schema
 * version recorded in its own header comment (§13.9):
 *
 * @code
 * #include "u8g2gl/u8g2gl_version.h"
 * U8G2GL_REQUIRE_SCHEMA_VERSION(0, 4);
 * @endcode
 *
 * As §16 specifies, the runtime refuses to compile against a mismatched
 * **schema** version: the major version, and **also the minor version while
 * the major is 0**. Before 1.0, breaking changes land in minor bumps (§15.4), so
 * checking only the major would let a project generated for 0.3 compile against
 * a 0.4 runtime without any error. From 1.0 on, only the major is compared.
 *
 * Schema version rather than generator or runtime version: the schema and §13
 * are the contract generated code is written against, and the CLI and runtime
 * are versioned independently (.agents/rules/03-versioning.md).
 *
 * The refusal message names both versions — the one the code was generated for
 * and the one this runtime implements.
 *
 * @param major Schema major version the generated code was produced for.
 * @param minor Schema minor version the generated code was produced for.
 *              Compared only while the major is 0.
 */
#define U8G2GL_REQUIRE_SCHEMA_VERSION(major, minor)                               \
    static_assert((major) == U8G2GL_SCHEMA_VERSION_MAJOR &&                       \
                  ((major) != 0 || (minor) == U8G2GL_SCHEMA_VERSION_MINOR),       \
        "U8G2GL schema version mismatch: this code was generated for schema "     \
        U8G2GL_VERSION_STR(major) "." U8G2GL_VERSION_STR(minor)                   \
        ", but this runtime implements schema "                                   \
        U8G2GL_VERSION_STR(U8G2GL_SCHEMA_VERSION_MAJOR) "."                       \
        U8G2GL_VERSION_STR(U8G2GL_SCHEMA_VERSION_MINOR)                           \
        ". Regenerate with a u8g2gl CLI matching the runtime, or use a matching " \
        "runtime.")

#endif // U8G2GL_VERSION_H
