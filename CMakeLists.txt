cmake_minimum_required(VERSION 3.16)
project(u8g2gl VERSION 0.3.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(U8G2GL_BUILD_TESTS "Build U8G2GL tests" ON)

add_library(u8g2gl STATIC
    src/u8g2gl.cpp
    src/u8g2gl_obj.cpp
    src/u8g2gl_tree.cpp
    src/u8g2gl_subject.cpp
)

target_include_directories(u8g2gl PUBLIC
    $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
    $<INSTALL_INTERFACE:include>
)

target_compile_options(u8g2gl PRIVATE
    -Wall -Wextra -Wpedantic
)

if(U8G2GL_BUILD_TESTS)
    enable_testing()

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
