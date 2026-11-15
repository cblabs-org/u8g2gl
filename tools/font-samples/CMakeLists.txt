# U8G2GL — declarative UI for U8G2 monochrome displays
# Copyright (c) 2026 Matt McNeill (CB Labs)
#
# https://github.com/cblabs-org/u8g2gl
#
# SPDX-License-Identifier: MIT
#
# File: tools/font-samples/CMakeLists.txt
# Purpose: Builds `font_samples`, the host program that renders one sample line
#          per built-in U8G2 font for the designer's font picker. It is a
#          project of its own, not a subdirectory of the root build, so neither
#          the library build nor ctest ever compiles it: it runs only when the
#          catalogue's samples are rebuilt (`npm run build:font-samples` in
#          cli/, which configures and builds it under build/font-samples/).
# Description: Compiles the vendored U8G2 C sources it needs, including
#              `u8g2_fonts.c`, and the font table the node script generates
#              from `u8g2-fonts.json` (FONT_SAMPLES_TABLE). U8G2 is compiled
#              with -w, as the Wasm build does, to keep upstream warnings out;
#              this tool's own source builds with -Wall -Wextra -Wpedantic.
cmake_minimum_required(VERSION 3.16)
project(u8g2gl_font_samples LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT DEFINED FONT_SAMPLES_TABLE)
    message(FATAL_ERROR
        "FONT_SAMPLES_TABLE is not set. This tool is built by "
        "'npm run build:font-samples' in cli/, which generates the table.")
endif()

set(U8G2_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../../extern/u8g2)
if(NOT EXISTS ${U8G2_DIR}/csrc/u8g2_fonts.c)
    message(FATAL_ERROR "The U8G2 submodule is not checked out at ${U8G2_DIR}.")
endif()

# Only what a memory-backed full buffer and the font engine need: no display
# driver, because nothing is ever sent to hardware.
add_library(font_samples_u8g2 STATIC
    ${U8G2_DIR}/csrc/u8g2_buffer.c
    ${U8G2_DIR}/csrc/u8g2_font.c
    ${U8G2_DIR}/csrc/u8g2_fonts.c
    ${U8G2_DIR}/csrc/u8g2_hvline.c
    ${U8G2_DIR}/csrc/u8g2_intersection.c
    ${U8G2_DIR}/csrc/u8g2_kerning.c
    ${U8G2_DIR}/csrc/u8g2_ll_hvline.c
    ${U8G2_DIR}/csrc/u8g2_setup.c
    ${U8G2_DIR}/csrc/u8x8_8x8.c
    ${U8G2_DIR}/csrc/u8x8_byte.c
    ${U8G2_DIR}/csrc/u8x8_cad.c
    # u8g2_buffer.c's PBM/XBM writers reference these, so the link needs them.
    ${U8G2_DIR}/csrc/u8x8_capture.c
    ${U8G2_DIR}/csrc/u8x8_u16toa.c
    ${U8G2_DIR}/csrc/u8x8_display.c
    ${U8G2_DIR}/csrc/u8x8_gpio.c
    ${U8G2_DIR}/csrc/u8x8_setup.c
)
target_include_directories(font_samples_u8g2 SYSTEM PUBLIC ${U8G2_DIR}/csrc)
target_compile_options(font_samples_u8g2 PRIVATE -w)
# u8g2_fonts.c compiles its fonts over 32 KB only under U8G2_USE_LARGE_FONTS,
# which u8g2.h turns on for unix, ARM, ESP and similar targets but not for a
# macOS host. Every font in u8g2-fonts.json must have a sample, so turn it on.
target_compile_definitions(font_samples_u8g2 PUBLIC U8G2_USE_LARGE_FONTS)

add_executable(font_samples
    font_samples.cpp
    ${FONT_SAMPLES_TABLE}
)
target_include_directories(font_samples PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(font_samples PRIVATE font_samples_u8g2)
# The generated table is C: one entry per font, so a name U8G2 does not
# declare fails to compile with that name in the error.
set_source_files_properties(${FONT_SAMPLES_TABLE} PROPERTIES LANGUAGE C)
target_compile_options(font_samples PRIVATE -Wall -Wextra -Wpedantic)
