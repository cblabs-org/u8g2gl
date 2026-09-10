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

add_executable(test_scrolling_label
    test_scrolling_label.cpp
)

target_include_directories(test_scrolling_label PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/stubs
)

target_link_libraries(test_scrolling_label PRIVATE
    u8g2gl
    GTest::gtest_main
)

target_compile_options(test_scrolling_label PRIVATE
    -Wall -Wextra -Wpedantic
)

gtest_discover_tests(test_scrolling_label)

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
