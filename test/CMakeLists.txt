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

# --- Schema major-version guard: proven by real compiles ---
# A refusal to compile cannot be tested from inside a program that compiled. So
# two throwaway targets, excluded from the normal build, are built by CTest:
# one with a matching major must build, one with a mismatched major must fail
# *with the guard's own message*. Matching the message rather than just a
# non-zero exit means an unrelated break (a bad include path, a typo) fails the
# test instead of passing it. The match target is the control that proves the
# harness itself can build.

foreach(_guard_case match mismatch)
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
add_test(NAME VersionGuard.MismatchedSchemaMajorFailsToCompile
    COMMAND ${CMAKE_COMMAND} --build ${CMAKE_BINARY_DIR} --target version_guard_mismatch
)
set_tests_properties(VersionGuard.MismatchedSchemaMajorFailsToCompile PROPERTIES
    PASS_REGULAR_EXPRESSION "U8G2GL schema major version mismatch"
)
# Both invoke the build system on the same tree; never run them concurrently.
set_tests_properties(
    VersionGuard.MatchingSchemaMajorCompiles
    VersionGuard.MismatchedSchemaMajorFailsToCompile
    PROPERTIES RESOURCE_LOCK u8g2gl_build_tree
)
