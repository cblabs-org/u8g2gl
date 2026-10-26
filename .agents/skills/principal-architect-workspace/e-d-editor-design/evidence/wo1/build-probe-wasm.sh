#!/usr/bin/env bash
# E-D WO1: build an editor Wasm for the G-PROBE-2 departures project, with its
# custom widgets' real C++ linked in, and time a clean build against a
# widget-only rebuild.
#
# This is a measurement, not a proposed build. It mirrors wasm/CMakeLists.txt's
# flags, swaps the test fixture's registry for the probe project's, and adds the
# probe's widget sources. wasm/bridge.cpp hardcodes the fixture's fonts and
# images (an E-D finding), so the fixture's ui_fonts.cpp and ui_images.cpp are
# linked to satisfy those symbols. The probe uses only built-in U8G2 fonts.
#
# Usage, from the repository root, with emsdk_env.sh sourced and
# build/wasm already built (libu8g2_wasm_csrc.a), plus
#   cli generate <probe> --target-kind editor --out build/probe/generated_editor
set -euo pipefail

ROOT=$(pwd)
PROBE=.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/probe-project
OUT=build/probe/wasm
OBJ=$OUT/obj
mkdir -p "$OBJ"

FLAGS=(-std=c++17 -O3 -DARDUINO=10819 -DU8G2GL_EDITOR '-DU8G2GL_GENERATED_CONFIG="editor_config.h"'
  -Wall -Wextra -Wpedantic -Wno-macro-redefined
  -I wasm -I include -I test/real_u8g2 -I test/editor_host -I test/generated_fixture/generated
  -I "$PROBE/widgets/wd_service_list" -I "$PROBE/widgets/wd_train_formation" -I "$PROBE/widgets/wd_probe_box"
  -isystem extern/u8g2/cppsrc -isystem extern/u8g2/csrc)

FRAMEWORK=(src/*.cpp test/editor_host/scene_json.cpp
  test/generated_fixture/generated/ui_fonts.cpp test/generated_fixture/generated/ui_images.cpp
  wasm/bridge.cpp)
PROJECT=(build/probe/generated_editor/ui_editor_registry.cpp
  "$PROBE/widgets/wd_service_list/wd_service_list.cpp"
  "$PROBE/widgets/wd_train_formation/wd_train_formation.cpp"
  "$PROBE/widgets/wd_probe_box/wd_probe_box.cpp")

compile() {  # compile <sources...> in parallel, one object per source
  local src
  for src in "$@"; do
    em++ "${FLAGS[@]}" -c "$src" -o "$OBJ/o_$(echo "$src" | tr / _).o" &
  done
  wait
}

link() {
  em++ -O3 "$OBJ"/*.o build/wasm/wasm/libu8g2_wasm_csrc.a -o "$OUT/u8g2gl_editor.js" \
    -sMODULARIZE=1 "-sEXPORT_NAME=createU8g2glEditor" \
    "-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','stringToUTF8','UTF8ToString','HEAPU8','lengthBytesUTF8']" \
    "-sEXPORTED_FUNCTIONS=['_malloc','_free','_applyScene','_applySampleData','_renderFrame','_getDisplayWidth','_getDisplayHeight','_getBufferPtr','_getBufferSize','_teardown','_selectScreen','_getLastError']" \
    -sALLOW_MEMORY_GROWTH=1
}

now() { python3 -c 'import time; print(time.time())'; }
secs() { python3 -c "print(f'{$2-$1:.2f}')"; }

echo "emcc: $(emcc --version | head -1)"
echo "host: $(uname -sm), $(sysctl -n machdep.cpu.brand_string 2>/dev/null || true)"

for run in 1 2 3; do
  rm -f "$OBJ"/*.o
  t0=$(now); compile "${FRAMEWORK[@]}" "${PROJECT[@]}"; t1=$(now); link; t2=$(now)
  echo "clean   run $run: compile $(secs $t0 $t1) s, link $(secs $t1 $t2) s, total $(secs $t0 $t2) s"
done

for run in 1 2 3; do
  # A widget edit: the widget's object and the registry recompile, nothing else.
  touch "$PROBE/widgets/wd_train_formation/wd_train_formation.cpp"
  t0=$(now); compile "$PROBE/widgets/wd_train_formation/wd_train_formation.cpp" build/probe/generated_editor/ui_editor_registry.cpp
  t1=$(now); link; t2=$(now)
  echo "widget  run $run: compile $(secs $t0 $t1) s, link $(secs $t1 $t2) s, total $(secs $t0 $t2) s"
done

ls -l "$OUT/u8g2gl_editor.wasm" | awk '{print "wasm bytes: " $5}'
