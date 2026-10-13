/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/version_guard/pre_macro/include_generated_config.cpp
 *
 * Purpose: Compiles the generated config header the CLI emits, unmodified.
 *          Built against the frozen 0.6.0 header in pre_macro/ it must be
 *          refused by name, because that runtime has no
 *          U8G2GL_REQUIRE_RUNTIME_VERSION and would otherwise report a syntax
 *          error (§16). Built against the real runtime it must compile, which
 *          is the control showing the refusal comes from the version and not
 *          from a broken fixture.
 *
 * Description: Built by the CTests VersionGuard.PreMacroRuntimeFailsByName and
 *              VersionGuard.GeneratedConfigCompiles, which differ in
 *              which runtime headers they compile against. The real-runtime
 *              build defines U8G2GL_GENERATED_CONFIG and reaches the header
 *              through u8g2gl_config.h, the delivery the header advises (§16);
 *              the frozen 0.6.0 runtime has no such hook, so that build
 *              includes the header directly, as a generated unit does. Either
 *              way the text under test is the committed golden header, not a
 *              hand copy of it.
 */
#ifdef U8G2GL_GENERATED_CONFIG
// The advised delivery (§16): the runtime's own config header includes it.
#include "u8g2gl/u8g2gl_config.h"
#else
// A runtime without that hook: included directly, as a generated unit does.
#include "u8g2gl_generated_config.h"
#endif

int main() {
    return 0;
}
