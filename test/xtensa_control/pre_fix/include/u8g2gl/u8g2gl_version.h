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
 *              the two static_assert hooks a generated header invokes: one for
 *              the schema (an equality) and one for the runtime (a floor).
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
 * - U8G2GL_REQUIRE_RUNTIME_VERSION(): compile-time refusal of a runtime older than the
 *                                     floor the code was generated for
 */
#ifndef U8G2GL_VERSION_H
#define U8G2GL_VERSION_H

// Plain integer macros rather than constexpr: CMakeLists.txt parses them with a
// regex at configure time, and a preprocessor #if can test them.

#define U8G2GL_VERSION_MAJOR 0  ///< Runtime major version
#define U8G2GL_VERSION_MINOR 7  ///< Runtime minor version
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
 * This guard answers "does this runtime implement the vocabulary the code was
 * written for?", which only equality can. The separate question "does this
 * runtime have the API the code calls?" is U8G2GL_REQUIRE_RUNTIME_VERSION().
 * The CLI and runtime are versioned independently
 * (.agents/rules/03-versioning.md).
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

/**
 * @brief Refuse to compile unless the runtime has the major, and at least the minor, the code was generated for.
 *
 * A generated header invokes this once, at namespace scope, with the runtime
 * version the generator was built beside (§16):
 *
 * @code
 * #include "u8g2gl/u8g2gl_version.h"
 * U8G2GL_REQUIRE_RUNTIME_VERSION(0, 7);
 * @endcode
 *
 * Unlike the schema guard this is a **floor**, not an equality: the major must
 * be equal and this runtime's minor must be at least @p minor, at every version
 * (§16). API accretes, so a newer runtime minor still has everything the code
 * calls, and comparing the minor only while the major is 0 would ignore it from
 * 1.0 on, where new API arrives in minor releases. The patch is not compared.
 *
 * The refusal message names both versions: the floor the code was generated for
 * and the version of this runtime.
 *
 * A runtime that predates this macro cannot refuse by itself, so generated code
 * guards the call with `#ifndef U8G2GL_REQUIRE_RUNTIME_VERSION`, an `#error`
 * naming the floor, and an `#else` holding the call (§16).
 *
 * @param major Runtime major version the generated code requires; must equal this runtime's.
 * @param minor Lowest runtime minor version the generated code requires.
 */
#define U8G2GL_REQUIRE_RUNTIME_VERSION(major, minor)                              \
    static_assert((major) == U8G2GL_VERSION_MAJOR &&                              \
                  (minor) <= U8G2GL_VERSION_MINOR,                                \
        "U8G2GL runtime too old or mismatched: this code was generated for "      \
        "runtime major " U8G2GL_VERSION_STR(major) ", minor "                     \
        U8G2GL_VERSION_STR(minor)                                                 \
        " or later, but this runtime is "                                         \
        U8G2GL_VERSION_STR(U8G2GL_VERSION_MAJOR) "."                              \
        U8G2GL_VERSION_STR(U8G2GL_VERSION_MINOR) "."                              \
        U8G2GL_VERSION_STR(U8G2GL_VERSION_PATCH)                                  \
        ". Update the u8g2gl runtime library, or regenerate with a u8g2gl CLI "   \
        "matching the runtime.")

#endif // U8G2GL_VERSION_H
