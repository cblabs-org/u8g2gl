/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/generated_fixture/support/u8g2_case/U8g2lib.h
 *
 * Purpose: Lets generated code that includes U8G2 by its real name compile
 *          against the host stub. Real U8G2's header is `U8g2lib.h`
 *          (extern/u8g2/cppsrc/), and that is what the generated fonts unit
 *          includes — correctly, for firmware. The host stub is spelled
 *          `U8G2lib.h` (test/stubs/). On a case-sensitive filesystem the
 *          generated include would not find the stub at all; on a
 *          case-insensitive one it finds it with -Wnonportable-include-path,
 *          which the zero-warning rule forbids.
 *
 *          Placed first on the include path of the fixture's fonts unit only
 *          (test/CMakeLists.txt), which is the one generated unit that names
 *          U8G2's header itself. The stub's own misspelling is recorded in the
 *          PR-04 WO10 Completion Report; renaming it touches every test target
 *          and the runtime's include ladders, so it is not done here.
 *
 * Description: Forwards to the one authoritative stub by a relative path, so it
 *              can never resolve to itself on a case-insensitive filesystem.
 */
#ifndef U8G2GL_FIXTURE_U8G2_CASE_SHIM_H
#define U8G2GL_FIXTURE_U8G2_CASE_SHIM_H

#include "../../../stubs/U8G2lib.h"

#endif // U8G2GL_FIXTURE_U8G2_CASE_SHIM_H
