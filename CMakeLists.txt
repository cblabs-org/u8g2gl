cmake_minimum_required(VERSION 3.16)
project(u8g2gl VERSION 0.4.0 LANGUAGES CXX)

# --- Runtime version agreement (§16, .agents/rules/03-versioning.md) ---
# The runtime version is stated twice: here, for packaging, and in
# u8g2gl_version.h, for the compile-time guard generated code relies on. Read
# the header and refuse to configure if they differ, so a bump to one cannot
# ship without the other. Re-configure whenever the header changes.
set(_u8g2gl_version_header "${CMAKE_CURRENT_SOURCE_DIR}/include/u8g2gl/u8g2gl_version.h")
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${_u8g2gl_version_header}")
file(STRINGS "${_u8g2gl_version_header}" _u8g2gl_version_lines
    REGEX "^#define U8G2GL_VERSION_(MAJOR|MINOR|PATCH) +[0-9]+")
foreach(_part MAJOR MINOR PATCH)
    if(NOT _u8g2gl_version_lines MATCHES "#define U8G2GL_VERSION_${_part} +([0-9]+)")
        message(FATAL_ERROR "u8g2gl_version.h does not define U8G2GL_VERSION_${_part}")
    endif()
    set(_u8g2gl_header_${_part} "${CMAKE_MATCH_1}")
endforeach()
set(_u8g2gl_header_version
    "${_u8g2gl_header_MAJOR}.${_u8g2gl_header_MINOR}.${_u8g2gl_header_PATCH}")
if(NOT _u8g2gl_header_version VERSION_EQUAL PROJECT_VERSION)
    message(FATAL_ERROR
        "Runtime version mismatch: CMakeLists.txt says ${PROJECT_VERSION}, "
        "include/u8g2gl/u8g2gl_version.h says ${_u8g2gl_header_version}. "
        "Bump both together.")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(U8G2GL_BUILD_TESTS "Build U8G2GL tests" ON)

# One list of runtime sources, absolute so test/ can reuse it: the real-U8G2
# acceptance target (test/CMakeLists.txt) must compile exactly what the library
# compiles, or a source added here would escape the check.
set(U8G2GL_RUNTIME_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_obj.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_label.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_xbm.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_glyph.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_progress_bar.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_clock.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_switch.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_button.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_tree.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_subject.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_style.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_core.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/src/u8g2gl_draw.cpp
)

add_library(u8g2gl STATIC ${U8G2GL_RUNTIME_SOURCES})

target_include_directories(u8g2gl PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

target_compile_options(u8g2gl PRIVATE
    -Wall -Wextra -Wpedantic
)

if(U8G2GL_BUILD_TESTS)
    target_include_directories(u8g2gl PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/test/stubs
    )
    enable_testing()

    # The real-U8G2 acceptance target (test/CMakeLists.txt) compiles against the
    # pinned submodule. Check for it before anything else — including the
    # googletest download — so a fresh clone gets one clear instruction rather
    # than an opaque missing-header error part-way through the build.
    set(U8G2GL_U8G2_DIR ${CMAKE_CURRENT_SOURCE_DIR}/extern/u8g2)
    if(NOT EXISTS ${U8G2GL_U8G2_DIR}/cppsrc/U8g2lib.h)
        message(FATAL_ERROR
            "The U8G2 submodule is not initialised (${U8G2GL_U8G2_DIR} has no "
            "cppsrc/U8g2lib.h). The host tests compile the runtime against it. "
            "Run:\n  git submodule update --init extern/u8g2\n"
            "or configure with -DU8G2GL_BUILD_TESTS=OFF to build the library only.")
    endif()

    include(FetchContent)
    FetchContent_Declare(
        googletest
        GIT_REPOSITORY https://github.com/google/googletest.git
        GIT_TAG v1.14.0
    )
    # For Windows: Prevent overriding the parent project's compiler/linker settings
    set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
    FetchContent_MakeAvailable(googletest)

    add_subdirectory(test)
endif()
