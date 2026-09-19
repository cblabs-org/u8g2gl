# U8G2GL — declarative UI for U8G2 monochrome displays
# Copyright (c) 2026 Matt McNeill (CB Labs)
# SPDX-License-Identifier: MIT
#
# File: test/check_editor_symbols.cmake
# Purpose: Proves "firmware pays nothing" for the editor target ([UD-4], PR-04
#          WO11) on a linked artefact, not by reading the source: every symbol
#          nm lists is searched for the editor's names.
# Description: Run with cmake -P. Inputs: NM (the toolchain's nm), FILE (a
#              library or executable), PATTERN (a regex over nm's output) and
#              EXPECT ("absent" or "present"). Fails, printing the offending
#              symbols, when the expectation does not hold; fails too when nm
#              lists nothing at all, so an unreadable file cannot pass "absent".

foreach(_required NM FILE PATTERN EXPECT)
    if(NOT DEFINED ${_required})
        message(FATAL_ERROR "check_editor_symbols.cmake needs -D${_required}=...")
    endif()
endforeach()

execute_process(
    COMMAND ${NM} ${FILE}
    OUTPUT_VARIABLE _symbols
    ERROR_VARIABLE _nm_errors
    RESULT_VARIABLE _nm_result
)
if(NOT _nm_result EQUAL 0 OR _symbols STREQUAL "")
    message(FATAL_ERROR "nm could not list ${FILE}: ${_nm_errors}")
endif()

# Symbol lines only — "<address or blanks> <type letter> <name>". An archive's
# listing also names its members ("libu8g2gl.a(u8g2gl_editor.cpp.o):"), and the
# firmware library legitimately contains that object, compiled to nothing.
string(REGEX MATCHALL "\n[0-9a-fA-F ]* [A-Za-z] [^\n]*(${PATTERN})[^\n]*" _matches "\n${_symbols}")
list(LENGTH _matches _count)

if(EXPECT STREQUAL "absent")
    if(_count GREATER 0)
        list(JOIN _matches "\n  " _shown)
        message(FATAL_ERROR "${FILE} carries ${_count} editor symbol(s); firmware must pay nothing:\n  ${_shown}")
    endif()
    message(STATUS "${FILE}: no symbol matches '${PATTERN}'")
elseif(EXPECT STREQUAL "present")
    if(_count EQUAL 0)
        message(FATAL_ERROR "${FILE} has no symbol matching '${PATTERN}'; the check itself would prove nothing")
    endif()
    message(STATUS "${FILE}: ${_count} symbol(s) match '${PATTERN}'")
else()
    message(FATAL_ERROR "EXPECT must be absent or present, not '${EXPECT}'")
endif()
