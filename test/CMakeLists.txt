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
