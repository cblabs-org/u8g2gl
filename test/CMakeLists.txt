include(GoogleTest)

add_executable(test_smoke
    test_smoke.cpp
)

target_include_directories(test_smoke PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_smoke PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_smoke PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_smoke)

add_executable(test_obj
    test_obj.cpp
)

target_include_directories(test_obj PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_obj PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_obj PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_obj)

add_executable(test_subject
    test_subject.cpp
)

target_include_directories(test_subject PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_subject PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_subject PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_subject)

add_executable(test_style
    test_style.cpp
)

target_include_directories(test_style PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_style PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_style PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_style)

add_executable(test_core
    test_core.cpp
)

target_include_directories(test_core PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_core PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_core PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_core)

add_executable(test_label
    test_label.cpp
)

target_include_directories(test_label PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_label PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_label PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_label)

add_executable(test_xbm
    test_xbm.cpp
)

target_include_directories(test_xbm PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_xbm PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_xbm PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_xbm)

add_executable(test_glyph
    test_glyph.cpp
)

target_include_directories(test_glyph PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_glyph PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_glyph PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_glyph)

add_executable(test_progress_bar
    test_progress_bar.cpp
)

target_include_directories(test_progress_bar PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_progress_bar PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_progress_bar PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_progress_bar)

add_executable(test_clock
    test_clock.cpp
)

target_include_directories(test_clock PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_clock PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_clock PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_clock)

add_executable(test_switch
    test_switch.cpp
)

target_include_directories(test_switch PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_switch PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_switch PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_switch)

add_executable(test_button
    test_button.cpp
)

target_include_directories(test_button PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_button PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_button PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_button)

add_executable(test_sizeof_report
    test_sizeof_report.cpp
)

target_include_directories(test_sizeof_report PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_sizeof_report PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_sizeof_report PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_sizeof_report)

add_executable(test_draw
    test_draw.cpp
)

target_include_directories(test_draw PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_draw PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_draw PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_draw)


add_executable(test_binding
    test_binding.cpp
)

target_include_directories(test_binding PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_binding PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_binding PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_binding)

# --- Runtime version (u8g2gl_version.h, §16) ---

add_executable(test_version
    test_version.cpp
)

target_include_directories(test_version PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_version PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_version PRIVATE
    -Wall -Wextra -Wpedantic
)

# Hand the test CMake's own idea of the version, so it can compare the header
# against it at run time as well as the configure-time check in the root file.
target_compile_definitions(test_version PRIVATE
    U8G2GL_CMAKE_VERSION_MAJOR=${PROJECT_VERSION_MAJOR}
    U8G2GL_CMAKE_VERSION_MINOR=${PROJECT_VERSION_MINOR}
    U8G2GL_CMAKE_VERSION_PATCH=${PROJECT_VERSION_PATCH}
)

gtest_discover_tests(test_version)

# --- Schema version guard: proven by real compiles ---
# A refusal to compile cannot be tested from inside a program that compiled. So
# throwaway targets, excluded from the normal build, are built by CTest. Those
# that must be refused pass only if the build fails *with the guard's own
# message*, naming the versions involved. Matching the message rather than just
# a non-zero exit means an unrelated break (a bad include path, a typo) fails the
# test instead of passing it. The compiling cases are the controls that prove the
# harness itself can build.
#
#   match          — the runtime's own schema macros; must compile
#   schema_0_4     — literal (0, 4), today's schema; must compile
#   mismatch       — schema major + 1; must be refused
#   stale_minor    — literal (0, 3) against 0.4: the pre-1.0 minor rule (§16)

foreach(_guard_case match schema_0_4 mismatch stale_minor)
    add_executable(version_guard_${_guard_case} EXCLUDE_FROM_ALL
        version_guard/${_guard_case}.cpp
    )
    target_include_directories(version_guard_${_guard_case} PRIVATE
        ${PROJECT_SOURCE_DIR}/include
    )
    target_compile_options(version_guard_${_guard_case} PRIVATE
        -Wall -Wextra -Wpedantic
    )
endforeach()

add_test(NAME VersionGuard.MatchingSchemaMajorCompiles
    COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target version_guard_match
)
add_test(NAME VersionGuard.SchemaZeroFourCompiles
    COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target version_guard_schema_0_4
)
add_test(NAME VersionGuard.MismatchedSchemaMajorFailsToCompile
    COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target version_guard_mismatch
)
set_tests_properties(VersionGuard.MismatchedSchemaMajorFailsToCompile PROPERTIES
    # mismatch.cpp passes an expression (major + 1), which the message spells
    # as written, so match the shape of the message rather than the number.
    PASS_REGULAR_EXPRESSION "U8G2GL schema version mismatch: this code was generated for schema [^,]+, but this runtime implements schema [0-9]+\\.[0-9]+"
)
add_test(NAME VersionGuard.StaleSchemaMinorFailsToCompile
    COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target version_guard_stale_minor
)
set_tests_properties(VersionGuard.StaleSchemaMinorFailsToCompile PROPERTIES
    PASS_REGULAR_EXPRESSION "U8G2GL schema version mismatch: this code was generated for schema 0\\.3, but this runtime implements schema 0\\.4"
)
# --- Real U8G2 acceptance target (WO4c) ---
# Every other target compiles the runtime against test/stubs/U8g2lib.h, and a
# stub can offer an API real U8G2 lacks: getFont() did, and nothing noticed. This
# target compiles the runtime's own sources against U8G2's real headers from the
# pinned submodule (extern/u8g2, tag 2.36.18) instead, so an API or type mismatch
# is a build failure here rather than on someone's hardware.
#
#   - ARDUINO is defined because every firmware build defines it, and it changes
#     the U8G2 class (it derives from Print). test/real_u8g2/ supplies the Arduino
#     platform headers that implies — never a U8G2 declaration.
#   - U8G2's include paths are SYSTEM so its own warnings do not count; our
#     sources are still compiled with -Wall -Wextra -Wpedantic and must be clean.
#   - It is an OBJECT library: compile-only, never linked, because linking would
#     need U8G2's C sources and a hardware HAL.
#   - It is part of the normal build, so a break fails `cmake --build` outright,
#     and it is registered with CTest so the check is visible in every test run.
# U8G2GL_U8G2_DIR is set, and checked to exist, by the root CMakeLists.txt.
add_library(u8g2gl_real_u8g2 OBJECT ${U8G2GL_RUNTIME_SOURCES})
target_include_directories(u8g2gl_real_u8g2 PRIVATE
    ${PROJECT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/real_u8g2
)
target_include_directories(u8g2gl_real_u8g2 SYSTEM PRIVATE
    ${U8G2GL_U8G2_DIR}/cppsrc
    ${U8G2GL_U8G2_DIR}/csrc
)
target_compile_definitions(u8g2gl_real_u8g2 PRIVATE ARDUINO=10819)
target_compile_options(u8g2gl_real_u8g2 PRIVATE
    -Wall -Wextra -Wpedantic
)

add_test(NAME RealU8g2.RuntimeCompilesAgainstRealHeaders
    COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target u8g2gl_real_u8g2
)

# --- Real U8G2: the rounded-box radius bound, measured (PR-4R WO3) ---
# u8g2gl_coord_corner_radius() clamps to 2r <= min(w, h) because that is where
# U8G2's own drawRBox/drawRFrame stop drawing outside the box. This executable
# keeps that measurement: it links U8G2's real C sources and draws into a full
# buffer, asserting the helper's radii stay inside and one more does not.
#
#   - Its own executable, never linking `u8g2gl` or test/stubs: the stub
#     declares U8G2 too, and the two must not meet in one link. It uses only the
#     header-only u8g2gl_coord.h.
#   - The C sources are listed, not globbed: exactly what drawing into a
#     full buffer needs. u8g2_d_setup.c is left out on purpose — it holds every
#     display's setup function and would pull in every driver — so the test
#     inlines the one setup it uses. A U8G2 bump that adds a dependency fails
#     the link here, visibly.
#   - U8G2's warnings are not ours: its include path is SYSTEM and its sources
#     are built with -w, as a separate library. The test source itself is held
#     to -Wall -Wextra -Wpedantic.
enable_language(C)
set(U8G2GL_U8G2_BOUND_SOURCES
    u8g2_box.c u8g2_buffer.c u8g2_circle.c u8g2_d_memory.c u8g2_font.c
    u8g2_hvline.c u8g2_intersection.c u8g2_kerning.c u8g2_ll_hvline.c
    u8g2_setup.c u8x8_8x8.c u8x8_byte.c u8x8_cad.c u8x8_capture.c
    u8x8_d_ssd1306_128x64_noname.c u8x8_display.c u8x8_gpio.c u8x8_setup.c
    u8x8_u16toa.c
)
list(TRANSFORM U8G2GL_U8G2_BOUND_SOURCES PREPEND ${U8G2GL_U8G2_DIR}/csrc/)
add_library(u8g2gl_u8g2_csrc STATIC ${U8G2GL_U8G2_BOUND_SOURCES})
target_include_directories(u8g2gl_u8g2_csrc SYSTEM PUBLIC ${U8G2GL_U8G2_DIR}/csrc)
target_compile_options(u8g2gl_u8g2_csrc PRIVATE -w)

add_executable(test_rbox_bound
    test_rbox_bound.cpp
)
target_include_directories(test_rbox_bound PRIVATE
    ${PROJECT_SOURCE_DIR}/include
)
target_link_libraries(test_rbox_bound PRIVATE
    u8g2gl_u8g2_csrc
    GTest::gtest_main
)
target_compile_options(test_rbox_bound PRIVATE
    -Wall -Wextra -Wpedantic
)
gtest_discover_tests(test_rbox_bound)

# --- Real U8G2: a bound draw-call child is clipped to its container (§13.5) ---
# A drawing element inside a container is drawn inside the container's
# effective clip, as an object child is, so realisation cannot be seen
# ([D-18]). The stub only records setClipWindow(); whether a pixel is really
# kept inside is U8G2's to decide, so this executable runs the runtime against
# real U8G2: its objects come from u8g2gl_real_u8g2 (the runtime compiled
# against the real headers, above) and U8G2's C sources from
# u8g2gl_u8g2_csrc_arduino, below. Like test_rbox_bound it never links `u8g2gl` or test/stubs.
#
# U8G2's C sources are compiled a second time for it, with ARDUINO defined as
# the C++ wrapper requires: u8x8.h adds a pins[] array to u8x8_t under ARDUINO,
# so linking u8g2gl_u8g2_csrc (built without it) against the wrapper splits one
# struct into two layouts and crashes on the first call. The list is
# u8g2gl_u8g2_csrc's plus what the runtime's other draw functions call, since
# the whole runtime is linked.
set(U8G2GL_U8G2_RUNTIME_SOURCES u8g2_bitmap.c u8g2_line.c u8g2_polygon.c)
list(TRANSFORM U8G2GL_U8G2_RUNTIME_SOURCES PREPEND ${U8G2GL_U8G2_DIR}/csrc/)
add_library(u8g2gl_u8g2_csrc_arduino STATIC
    ${U8G2GL_U8G2_BOUND_SOURCES}
    ${U8G2GL_U8G2_RUNTIME_SOURCES}
)
target_include_directories(u8g2gl_u8g2_csrc_arduino PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/real_u8g2)
target_include_directories(u8g2gl_u8g2_csrc_arduino SYSTEM PUBLIC ${U8G2GL_U8G2_DIR}/csrc)
target_compile_definitions(u8g2gl_u8g2_csrc_arduino PUBLIC ARDUINO=10819)
target_compile_options(u8g2gl_u8g2_csrc_arduino PRIVATE -w)

add_executable(test_bound_child_clip
    test_bound_child_clip.cpp
    $<TARGET_OBJECTS:u8g2gl_real_u8g2>
)
target_include_directories(test_bound_child_clip PRIVATE
    ${PROJECT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/real_u8g2
)
target_include_directories(test_bound_child_clip SYSTEM PRIVATE
    ${U8G2GL_U8G2_DIR}/cppsrc
)
target_link_libraries(test_bound_child_clip PRIVATE
    u8g2gl_u8g2_csrc_arduino
    GTest::gtest_main
)
target_compile_options(test_bound_child_clip PRIVATE
    -Wall -Wextra -Wpedantic
)
gtest_discover_tests(test_bound_child_clip)

# --- Generated fixture: the compile layer (design_spec §17.1, PR-04 WO10) ---
# test/generated_fixture/ is a small project whose generated/ directory is
# committed output of `u8g2gl generate` (cli/test/generator/compile-fixture.test.ts
# fails if regenerating it changes a byte). Building and running it here makes a
# defect in emission a failing test rather than a surprise in the first real
# firmware build.
#
# The runtime is compiled a second time for it, as u8g2gl_fixture_runtime, with
# the generated capacities forced into every translation unit — the integration
# the generated header documents for CMake ([D-21], PR-04 WO4 F5). The pools are
# sized inside src/u8g2gl_obj.cpp, so including the header only from generated
# code would leave the library on u8g2gl_config.h's defaults. PUBLIC, so the
# generated units and the test itself see the same values the library does.
# support/capacity_probe.cpp is compiled into the library target beside
# u8g2gl_obj.cpp, and static_asserts the counted total from inside that build.
#
# The test links this library and not `u8g2gl`: the two define the same symbols,
# and the point is to run the fixture on the pool it generated.
set(U8G2GL_FIXTURE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/generated_fixture)
set(U8G2GL_FIXTURE_GENERATED ${U8G2GL_FIXTURE_DIR}/generated)

add_library(u8g2gl_fixture_runtime STATIC
    ${U8G2GL_RUNTIME_SOURCES}
    ${U8G2GL_FIXTURE_DIR}/support/capacity_probe.cpp
)
target_include_directories(u8g2gl_fixture_runtime PUBLIC
    ${PROJECT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
    ${U8G2GL_FIXTURE_DIR}/support
)
target_compile_options(u8g2gl_fixture_runtime PUBLIC
    "SHELL:-include ${U8G2GL_FIXTURE_GENERATED}/u8g2gl_generated_config.h"
)
target_compile_options(u8g2gl_fixture_runtime PRIVATE
    -Wall -Wextra -Wpedantic
)

# Every generated unit, listed rather than globbed: a unit the generator stops
# emitting must fail this build, not silently drop out of it.
add_executable(test_generated_fixture
    test_generated_fixture.cpp
    ${U8G2GL_FIXTURE_DIR}/support/fixture_u8g2_fonts.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui_images.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui_screen_bounds.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui_screen_gauges.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui_screen_home.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui_styles.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui_subjects.cpp
)
target_include_directories(test_generated_fixture PRIVATE
    ${U8G2GL_FIXTURE_GENERATED}
)

# The fonts unit is the one generated unit that includes U8G2 by name, and it
# spells it as real U8G2 does, <U8g2lib.h> — which is also how the host stub is
# spelled, so the stub directory satisfies it directly. (Before PR-04 WO13 the
# stub was mis-cased `U8G2lib.h` and this target needed a forwarding shim under
# support/u8g2_case/ to be found at all on a case-sensitive filesystem; the
# rename removed both the shim and the hazard.) It is still built on its own
# because it does not link the runtime target.
#
# A <builtin> font also names U8G2's own table, which real U8G2 declares and
# the stub does not, so the fixture's two are declared by a forced include.
add_library(u8g2gl_fixture_fonts OBJECT
    ${U8G2GL_FIXTURE_GENERATED}/ui_fonts.cpp
)
target_include_directories(u8g2gl_fixture_fonts PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
    ${U8G2GL_FIXTURE_GENERATED}
    ${PROJECT_SOURCE_DIR}/include
)
target_compile_options(u8g2gl_fixture_fonts PRIVATE
    # SHELL: keeps each flag with its argument; CMake would otherwise
    # de-duplicate the second -include and pass the header as an input file.
    "SHELL:-include ${U8G2GL_FIXTURE_GENERATED}/u8g2gl_generated_config.h"
    "SHELL:-include ${U8G2GL_FIXTURE_DIR}/support/fixture_u8g2_fonts.h"
    -Wall -Wextra -Wpedantic
)

target_link_libraries(test_generated_fixture PRIVATE
    u8g2gl_fixture_fonts
    u8g2gl_fixture_runtime
    GTest::gtest_main
)
target_compile_options(test_generated_fixture PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_generated_fixture)

# --- <bdf> against real U8G2 ---
# Every other build of ui_fonts.cpp compiles against test/stubs/U8g2lib.h. This
# one compiles it a third time against real U8G2's own headers (extern/u8g2,
# tag 2.36.18) and real U8G2's own C sources (u8g2gl_u8g2_csrc, the same static
# library test_rbox_bound links) — the same pattern u8g2gl_real_u8g2 uses for
# the runtime itself, applied to the generated fonts unit, so a compiled <bdf>
# is proved against the library that will actually decode it on hardware, not
# only against the stub's recording of setFont()'s argument.
#
#   - <U8g2lib.h> is the C++ wrapper (cppsrc), which needs Arduino's Print
#     class; test/real_u8g2/ supplies that, exactly as u8g2gl_real_u8g2 does.
#   - No forced include of u8g2gl_generated_config.h or fixture_u8g2_fonts.h:
#     ui_fonts.cpp needs neither against real U8G2 — real U8G2's own u8g2.h
#     already declares every <builtin> font by name, and a compiled <bdf>'s
#     array carries no capacity dependency.
#   - Real U8G2's own u8g2.h defines U8G2_FONT_SECTION (forwarding to
#     u8x8.h's U8X8_FONT_SECTION), so nothing here defines it — unlike the stub, which must (test/stubs/U8g2lib.h).
add_library(u8g2gl_fixture_fonts_real_u8g2 OBJECT
    ${U8G2GL_FIXTURE_GENERATED}/ui_fonts.cpp
)
target_include_directories(u8g2gl_fixture_fonts_real_u8g2 PRIVATE
    ${PROJECT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/real_u8g2
    ${U8G2GL_FIXTURE_GENERATED}
)
target_include_directories(u8g2gl_fixture_fonts_real_u8g2 SYSTEM PRIVATE
    ${U8G2GL_U8G2_DIR}/cppsrc
    ${U8G2GL_U8G2_DIR}/csrc
)
target_compile_definitions(u8g2gl_fixture_fonts_real_u8g2 PRIVATE ARDUINO=10819)
target_compile_options(u8g2gl_fixture_fonts_real_u8g2 PRIVATE
    -Wall -Wextra -Wpedantic
)

# ui_fonts.cpp's <builtin> aliases (u8g2_font_6x10_mr and friends) are only
# *declared* by u8g2.h; their bytes live in u8g2_fonts.c, U8G2's own font data
# file — and the oracle check needs u8g2_font_4x6_tr's bytes too. Its own
# static library, not folded into u8g2gl_u8g2_csrc above: nothing else here
# needs several hundred font arrays, and keeping them apart keeps the other
# real-U8G2 targets' link (and rebuild) fast.
add_library(u8g2gl_u8g2_fonts_csrc STATIC ${U8G2GL_U8G2_DIR}/csrc/u8g2_fonts.c)
target_include_directories(u8g2gl_u8g2_fonts_csrc SYSTEM PUBLIC ${U8G2GL_U8G2_DIR}/csrc)
target_compile_options(u8g2gl_u8g2_fonts_csrc PRIVATE -w)

add_executable(test_bdf_real_u8g2
    test_bdf_real_u8g2.cpp
)
target_include_directories(test_bdf_real_u8g2 PRIVATE
    ${PROJECT_SOURCE_DIR}/include
    ${U8G2GL_FIXTURE_GENERATED}
)
target_include_directories(test_bdf_real_u8g2 SYSTEM PRIVATE
    ${U8G2GL_U8G2_DIR}/csrc
)
target_link_libraries(test_bdf_real_u8g2 PRIVATE
    u8g2gl_fixture_fonts_real_u8g2
    u8g2gl_u8g2_csrc
    u8g2gl_u8g2_fonts_csrc
    GTest::gtest_main
)
target_compile_options(test_bdf_real_u8g2 PRIVATE
    -Wall -Wextra -Wpedantic
)
gtest_discover_tests(test_bdf_real_u8g2)

# --- The editor target ([UD-4], PR-04 WO11) ---
# The runtime compiled a third time, with U8G2GL_EDITOR defined: the build the
# designer's Wasm canvas uses. Default capacities, not the fixture's counted
# ones, because an editor constructs scenes the document's pool was never sized
# for. The registry comes from test/generated_fixture/generated_editor/, the
# committed output of `u8g2gl generate --target-kind editor`; the CLI suite
# (compile-fixture.test.ts) fails if regenerating it changes a byte.
set(U8G2GL_FIXTURE_EDITOR ${U8G2GL_FIXTURE_DIR}/generated_editor)

add_library(u8g2gl_editor_runtime STATIC ${U8G2GL_RUNTIME_SOURCES})
target_include_directories(u8g2gl_editor_runtime PUBLIC
    ${PROJECT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)
target_compile_definitions(u8g2gl_editor_runtime PUBLIC U8G2GL_EDITOR)
target_compile_options(u8g2gl_editor_runtime PRIVATE
    -Wall -Wextra -Wpedantic
)

# One program renders the fixture both ways: the generated firmware screen
# functions and the editor host building the same screens from the scene
# description through the registry (test_editor_parity.cpp), plus the registry's
# entry-by-entry tests (test_editor.cpp). The firmware units compile against
# their own generated capacities; the library does not. Those macros are read in
# one runtime file only — the binding pool in src/u8g2gl_obj.cpp — which no
# generated unit compiles, so the two views never meet in one definition.
add_executable(test_editor
    test_editor.cpp
    test_editor_parity.cpp
    editor_host/editor_host.cpp
    editor_host/scene_json.cpp
    ${U8G2GL_FIXTURE_EDITOR}/ui_editor_registry.cpp
    ${U8G2GL_FIXTURE_DIR}/support/fixture_u8g2_fonts.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui_images.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui_screen_bounds.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui_screen_gauges.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui_screen_home.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui_styles.cpp
    ${U8G2GL_FIXTURE_GENERATED}/ui_subjects.cpp
)
target_include_directories(test_editor PRIVATE
    ${U8G2GL_FIXTURE_GENERATED}
    ${U8G2GL_FIXTURE_DIR}/support
    ${CMAKE_CURRENT_SOURCE_DIR}/editor_host
)
target_compile_definitions(test_editor PRIVATE
    U8G2GL_EDITOR_SCENE_PATH="${U8G2GL_FIXTURE_EDITOR}/ui_scene.json"
)
target_link_libraries(test_editor PRIVATE
    u8g2gl_fixture_fonts
    u8g2gl_editor_runtime
    GTest::gtest_main
)
target_compile_options(test_editor PRIVATE
    -Wall -Wextra -Wpedantic
)
gtest_discover_tests(test_editor)

# --- Firmware pays nothing for the editor ([UD-4]) ---
# The registry and src/u8g2gl_editor.cpp compile to nothing without
# U8G2GL_EDITOR. Proven on the linked artefacts rather than assumed: nm must find
# no editor symbol — u8g2gl_editor_* or the generated ui_editor_* — in the
# firmware library or the firmware fixture binary, and the same check must find
# them in the editor binary, so a pattern that matched nothing could not pass.
set(U8G2GL_EDITOR_SYMBOL_PATTERN "u8g2gl_editor|ui_editor")
function(u8g2gl_check_editor_symbols name file expect)
    add_test(NAME EditorSymbols.${name}
        COMMAND ${CMAKE_COMMAND}
            -DNM=${CMAKE_NM}
            -DFILE=${file}
            -DPATTERN=${U8G2GL_EDITOR_SYMBOL_PATTERN}
            -DEXPECT=${expect}
            -P ${CMAKE_CURRENT_SOURCE_DIR}/check_editor_symbols.cmake
    )
endfunction()
u8g2gl_check_editor_symbols(FirmwareLibraryHasNoEditorSymbols $<TARGET_FILE:u8g2gl> absent)
u8g2gl_check_editor_symbols(FirmwareFixtureBinaryHasNoEditorSymbols $<TARGET_FILE:test_generated_fixture> absent)
u8g2gl_check_editor_symbols(EditorBinaryHasEditorSymbols $<TARGET_FILE:test_editor> present)

# All invoke the build system on the same tree; never run them concurrently.
set_tests_properties(
    VersionGuard.MatchingSchemaMajorCompiles
    VersionGuard.SchemaZeroFourCompiles
    VersionGuard.MismatchedSchemaMajorFailsToCompile
    VersionGuard.StaleSchemaMinorFailsToCompile
    RealU8g2.RuntimeCompilesAgainstRealHeaders
    PROPERTIES RESOURCE_LOCK u8g2gl_build_tree
)
