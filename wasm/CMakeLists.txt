# U8G2GL — declarative UI for U8G2 monochrome displays
# Copyright (c) 2026 Matt McNeill (CB Labs)
#
# https://github.com/cblabs-org/u8g2gl
#
# SPDX-License-Identifier: MIT
#
# File: wasm/CMakeLists.txt
# Purpose: Emscripten build target for the U8G2GL editor WebAssembly module.
#          Compiles the runtime, editor registry, real U8G2 graphics engine,
#          and C++ bridge into u8g2gl_editor.js and u8g2gl_editor.wasm.
#          This is the framework editor Wasm, built from the test fixture's
#          registry, fonts, images and generated capacities (editor_config.h
#          includes the fixture's u8g2gl_generated_config.h). A project's own
#          editor Wasm is built by the design server's build job instead.
enable_language(C)

set(U8G2GL_U8G2_DIR ${PROJECT_SOURCE_DIR}/extern/u8g2)
set(U8G2GL_FIXTURE_DIR ${PROJECT_SOURCE_DIR}/test/generated_fixture)

# U8G2 C sources compiled with -w to isolate upstream third-party warnings
set(WASM_U8G2_C_SOURCES
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_box.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_buffer.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_circle.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_d_memory.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_font.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_hvline.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_intersection.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_kerning.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_ll_hvline.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_setup.c
    ${U8G2GL_U8G2_DIR}/csrc/u8x8_8x8.c
    ${U8G2GL_U8G2_DIR}/csrc/u8x8_byte.c
    ${U8G2GL_U8G2_DIR}/csrc/u8x8_cad.c
    ${U8G2GL_U8G2_DIR}/csrc/u8x8_capture.c
    ${U8G2GL_U8G2_DIR}/csrc/u8x8_d_ssd1306_128x64_noname.c
    ${U8G2GL_U8G2_DIR}/csrc/u8x8_d_ssd1322.c
    ${U8G2GL_U8G2_DIR}/csrc/u8x8_display.c
    ${U8G2GL_U8G2_DIR}/csrc/u8x8_gpio.c
    ${U8G2GL_U8G2_DIR}/csrc/u8x8_setup.c
    ${U8G2GL_U8G2_DIR}/csrc/u8x8_u16toa.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_bitmap.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_line.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_polygon.c
    ${U8G2GL_U8G2_DIR}/csrc/u8g2_fonts.c
)

add_library(u8g2_wasm_csrc STATIC ${WASM_U8G2_C_SOURCES})
target_include_directories(u8g2_wasm_csrc PRIVATE
    ${PROJECT_SOURCE_DIR}/test/real_u8g2
)
target_include_directories(u8g2_wasm_csrc SYSTEM PUBLIC
    ${U8G2GL_U8G2_DIR}/csrc
)
target_compile_definitions(u8g2_wasm_csrc PUBLIC ARDUINO=10819)
target_compile_options(u8g2_wasm_csrc PRIVATE -w)

add_executable(u8g2gl_editor
    ${U8G2GL_RUNTIME_SOURCES}
    ${PROJECT_SOURCE_DIR}/test/editor_host/scene_json.cpp
    ${U8G2GL_FIXTURE_DIR}/generated_editor/ui_editor_registry.cpp
    ${U8G2GL_FIXTURE_DIR}/generated/ui_fonts.cpp
    ${U8G2GL_FIXTURE_DIR}/generated/ui_images.cpp
    memory_display.cpp
    bridge.cpp
)

target_include_directories(u8g2gl_editor PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${PROJECT_SOURCE_DIR}/include
    ${PROJECT_SOURCE_DIR}/test/real_u8g2
    ${PROJECT_SOURCE_DIR}/test/editor_host
    ${U8G2GL_FIXTURE_DIR}/generated
)

target_include_directories(u8g2gl_editor SYSTEM PRIVATE
    ${U8G2GL_U8G2_DIR}/cppsrc
    ${U8G2GL_U8G2_DIR}/csrc
)

target_compile_definitions(u8g2gl_editor PRIVATE
    ARDUINO=10819
    U8G2GL_EDITOR
    U8G2GL_GENERATED_CONFIG="editor_config.h"
)

target_compile_options(u8g2gl_editor PRIVATE
    -Wall -Wextra -Wpedantic -Wno-macro-redefined
)

target_link_libraries(u8g2gl_editor PRIVATE
    u8g2_wasm_csrc
)

set(EMSCRIPTEN_LINK_FLAGS
    "-O3"
    "-sMODULARIZE=1"
    "-sEXPORT_NAME='createU8g2glEditor'"
    "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','stringToUTF8','UTF8ToString','HEAPU8','lengthBytesUTF8']"
    "-sEXPORTED_FUNCTIONS=['_malloc','_free','_applyScene','_applySampleData','_applyCollectionData','_renderFrame','_getDisplayWidth','_getDisplayHeight','_getBufferPtr','_getBufferSize','_teardown','_selectScreen','_getLastError','_getPlaceholders','_setDesignHidden','_getRuntimeHidden','_setPreview','_dispatchEvent','_previewBack','_getInputState']"
    "-sALLOW_MEMORY_GROWTH=1"
)
string(JOIN " " EMSCRIPTEN_LINK_FLAGS_STR ${EMSCRIPTEN_LINK_FLAGS})

set_target_properties(u8g2gl_editor PROPERTIES
    OUTPUT_NAME "u8g2gl_editor"
    SUFFIX ".js"
    LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS_STR}"
)

# --- The collection-data test Wasm (schema 0.7 <data>, design_spec §9.2) ---
# The same bridge, built from test/collection_data/'s registry with the
# departures fixture's own wd_train_formation and wd_service_list, plus a
# hand-written reference (test/collection_reference.cpp) that builds and fills
# the same widgets through their own methods. wasm/test/collection-data.test.mjs
# compares the two frames, so the editor's fill path is proved against a
# controller's calls. Test-only: its own output directory, never the framework
# editor Wasm the designer ships.
set(U8G2GL_COLLECTION_DIR ${PROJECT_SOURCE_DIR}/test/collection_data)
set(U8G2GL_DEPARTURES_WIDGETS ${PROJECT_SOURCE_DIR}/cli/test/fixtures/departures-project/widgets)

add_executable(u8g2gl_editor_collections
    ${U8G2GL_RUNTIME_SOURCES}
    ${PROJECT_SOURCE_DIR}/test/editor_host/scene_json.cpp
    ${U8G2GL_COLLECTION_DIR}/generated_editor/ui_editor_registry.cpp
    ${U8G2GL_COLLECTION_DIR}/generated/ui_fonts.cpp
    ${U8G2GL_COLLECTION_DIR}/generated/ui_images.cpp
    ${U8G2GL_DEPARTURES_WIDGETS}/wd_service_list/wd_service_list.cpp
    ${U8G2GL_DEPARTURES_WIDGETS}/wd_train_formation/wd_train_formation.cpp
    memory_display.cpp
    bridge.cpp
    test/collection_reference.cpp
)
target_include_directories(u8g2gl_editor_collections PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${PROJECT_SOURCE_DIR}/include
    ${PROJECT_SOURCE_DIR}/test/real_u8g2
    ${PROJECT_SOURCE_DIR}/test/editor_host
    ${U8G2GL_COLLECTION_DIR}/generated
    ${U8G2GL_DEPARTURES_WIDGETS}/wd_service_list
    ${U8G2GL_DEPARTURES_WIDGETS}/wd_train_formation
)
target_include_directories(u8g2gl_editor_collections SYSTEM PRIVATE
    ${U8G2GL_U8G2_DIR}/cppsrc
    ${U8G2GL_U8G2_DIR}/csrc
)
target_compile_definitions(u8g2gl_editor_collections PRIVATE
    ARDUINO=10819
    U8G2GL_EDITOR
    U8G2GL_GENERATED_CONFIG="editor_config.h"
)
target_compile_options(u8g2gl_editor_collections PRIVATE
    -Wall -Wextra -Wpedantic -Wno-macro-redefined
)
target_link_libraries(u8g2gl_editor_collections PRIVATE
    u8g2_wasm_csrc
)
string(REPLACE "'_getInputState']" "'_getInputState','_renderReference']"
    U8G2GL_COLLECTION_LINK_FLAGS_STR "${EMSCRIPTEN_LINK_FLAGS_STR}")
set_target_properties(u8g2gl_editor_collections PROPERTIES
    OUTPUT_NAME "u8g2gl_editor"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/collections"
    LINK_FLAGS "${U8G2GL_COLLECTION_LINK_FLAGS_STR}"
)

# --- The asset-injection reference Wasm (design_spec §9) ---
# The framework editor Wasm compiles in no project font or image: the designer
# injects them. This one is the same bridge over the same fixture, with the
# fixture's fonts and images compiled in through a hand-written lookup
# (wasm/test/compiled_assets_registry.cpp), as every editor Wasm had them before.
# wasm/test/asset-injection.test.mjs renders the fixture's screens with both,
# injecting into the framework Wasm, and requires identical frames. Test-only:
# its own output directory, never the framework editor Wasm the designer ships.
add_executable(u8g2gl_editor_compiled_assets
    ${U8G2GL_RUNTIME_SOURCES}
    ${PROJECT_SOURCE_DIR}/test/editor_host/scene_json.cpp
    test/compiled_assets_registry.cpp
    ${U8G2GL_FIXTURE_DIR}/generated/ui_fonts.cpp
    ${U8G2GL_FIXTURE_DIR}/generated/ui_images.cpp
    memory_display.cpp
    bridge.cpp
)
target_include_directories(u8g2gl_editor_compiled_assets PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${PROJECT_SOURCE_DIR}/include
    ${PROJECT_SOURCE_DIR}/test/real_u8g2
    ${PROJECT_SOURCE_DIR}/test/editor_host
    ${U8G2GL_FIXTURE_DIR}/generated
    ${U8G2GL_FIXTURE_DIR}/generated_editor
)
target_include_directories(u8g2gl_editor_compiled_assets SYSTEM PRIVATE
    ${U8G2GL_U8G2_DIR}/cppsrc
    ${U8G2GL_U8G2_DIR}/csrc
)
target_compile_definitions(u8g2gl_editor_compiled_assets PRIVATE
    ARDUINO=10819
    U8G2GL_EDITOR
    U8G2GL_GENERATED_CONFIG="editor_config.h"
)
target_compile_options(u8g2gl_editor_compiled_assets PRIVATE
    -Wall -Wextra -Wpedantic -Wno-macro-redefined
)
target_link_libraries(u8g2gl_editor_compiled_assets PRIVATE
    u8g2_wasm_csrc
)
set_target_properties(u8g2gl_editor_compiled_assets PROPERTIES
    OUTPUT_NAME "u8g2gl_editor"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/compiled_assets"
    LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS_STR}"
)

# --- Input parity (§12, ruling 7): the editor and the firmware, in Wasm ---
# test/input_menu/'s scene through the bridge, and its generated firmware
# through the test-run harness, each driven by test/input_menu/script.json in
# wasm/test/input-parity.test.mjs, which compares their frames after every
# step. The harness's screen table and sample-set units are the ones the design
# server generates for a test run, committed under support/ and checked against
# their generators by cli/test/node/design/test-run/input-support.test.ts.
set(U8G2GL_INPUT_DIR ${PROJECT_SOURCE_DIR}/test/input_menu)

add_executable(u8g2gl_editor_input
    ${U8G2GL_RUNTIME_SOURCES}
    ${PROJECT_SOURCE_DIR}/test/editor_host/scene_json.cpp
    ${U8G2GL_INPUT_DIR}/generated_editor/ui_editor_registry.cpp
    memory_display.cpp
    bridge.cpp
)
target_include_directories(u8g2gl_editor_input PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${PROJECT_SOURCE_DIR}/include
    ${PROJECT_SOURCE_DIR}/test/real_u8g2
    ${PROJECT_SOURCE_DIR}/test/editor_host
    ${U8G2GL_INPUT_DIR}/generated
)
target_include_directories(u8g2gl_editor_input SYSTEM PRIVATE
    ${U8G2GL_U8G2_DIR}/cppsrc
    ${U8G2GL_U8G2_DIR}/csrc
)
target_compile_definitions(u8g2gl_editor_input PRIVATE
    ARDUINO=10819
    U8G2GL_EDITOR
    U8G2GL_GENERATED_CONFIG="editor_config.h"
)
target_compile_options(u8g2gl_editor_input PRIVATE
    -Wall -Wextra -Wpedantic -Wno-macro-redefined
)
target_link_libraries(u8g2gl_editor_input PRIVATE
    u8g2_wasm_csrc
)
set_target_properties(u8g2gl_editor_input PROPERTIES
    OUTPUT_NAME "u8g2gl_editor"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/input"
    LINK_FLAGS "${EMSCRIPTEN_LINK_FLAGS_STR}"
)

# The harness with the link settings test-run-build.ts names, so this module
# is the one a design server's test run links for the same project.
add_executable(u8g2gl_harness_input
    ${U8G2GL_RUNTIME_SOURCES}
    ${U8G2GL_INPUT_DIR}/generated/ui.cpp
    ${U8G2GL_INPUT_DIR}/generated/ui_fonts.cpp
    ${U8G2GL_INPUT_DIR}/generated/ui_images.cpp
    ${U8G2GL_INPUT_DIR}/generated/ui_screen_display.cpp
    ${U8G2GL_INPUT_DIR}/generated/ui_screen_settings.cpp
    ${U8G2GL_INPUT_DIR}/generated/ui_styles.cpp
    ${U8G2GL_INPUT_DIR}/generated/ui_subjects.cpp
    ${U8G2GL_INPUT_DIR}/support/u8g2gl_harness_screens.cpp
    ${U8G2GL_INPUT_DIR}/support/u8g2gl_harness_samples.cpp
    memory_display.cpp
    harness.cpp
)
target_include_directories(u8g2gl_harness_input PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${PROJECT_SOURCE_DIR}/include
    ${PROJECT_SOURCE_DIR}/test/real_u8g2
    ${U8G2GL_INPUT_DIR}/generated
)
target_include_directories(u8g2gl_harness_input SYSTEM PRIVATE
    ${U8G2GL_U8G2_DIR}/cppsrc
    ${U8G2GL_U8G2_DIR}/csrc
)
target_compile_definitions(u8g2gl_harness_input PRIVATE
    ARDUINO=10819
    U8G2GL_GENERATED_CONFIG="u8g2gl_generated_config.h"
)
target_compile_options(u8g2gl_harness_input PRIVATE
    -Wall -Wextra -Wpedantic -Wno-macro-redefined
)
target_link_libraries(u8g2gl_harness_input PRIVATE
    u8g2_wasm_csrc
)
set_target_properties(u8g2gl_harness_input PROPERTIES
    OUTPUT_NAME "u8g2gl_harness"
    SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/input"
    LINK_FLAGS "-O3 -sMODULARIZE=1 -sEXPORT_NAME=createU8g2glHarness -sEXPORTED_RUNTIME_METHODS=[HEAPU8,HEAPU32,UTF8ToString] -sEXPORTED_FUNCTIONS=[_malloc,_free,_getScreenCount,_getScreenName,_getDisplayWidth,_getDisplayHeight,_runScreen,_runEvents,_getStepScreen,_getStepCallbacks,_getFrameCount,_getFramePtr,_getBufferSize,_getLastError,_getSampleSetCount,_getSampleSetName,_selectSampleSet] -sALLOW_MEMORY_GROWTH=1"
)
