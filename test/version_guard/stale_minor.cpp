/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/version_guard/stale_minor.cpp
 *
 * Purpose: Stands in for a project generated for schema 0.3 and built against
 *          this 0.4 runtime. It MUST NOT compile. Both are major 0, so a
 *          major-only guard let exactly this through; §16 requires the minor to
 *          match too while the major is 0, because pre-1.0 breaking changes land
 *          in minor bumps (§15.4).
 *
 * Description: Built only by the CTest
 *              VersionGuard.StaleSchemaMinorFailsToCompile, which passes only if
 *              the build output contains the guard's message naming both 0.3
 *              and 0.4. The literal (0, 3) is deliberate: it is the case the
 *              owner checkpoint named, written the way generated code writes it.
 */
#include "u8g2gl/u8g2gl_version.h"

U8G2GL_REQUIRE_SCHEMA_VERSION(0, 3);

int main() {
    return 0;
}
