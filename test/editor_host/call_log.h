/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: test/editor_host/call_log.h
 * Purpose: The comparison the editor target's parity claim rests on (PR-04
 *          WO11): two U8G2 stubs received the same calls, in the same order,
 *          with the same arguments. Written as a GoogleTest assertion so a
 *          mismatch names the first differing call on both sides rather than
 *          reporting "false".
 *
 * Description: Header-only. `same_call_log()` refuses an overflowed log (it
 *              would compare a truncated prefix) and an empty one (two empty logs
 *              are trivially equal, and a vacuous pass is what this must never
 *              give), then compares entry by entry: method, integer arguments,
 *              pointer argument and copied text.
 *
 * Exported Functions:
 * - describe_call():  One log entry as text, for failure messages
 * - same_call_log():  Assert two stubs' logs are identical and non-empty
 */
#ifndef U8G2GL_TEST_CALL_LOG_H
#define U8G2GL_TEST_CALL_LOG_H

#include <gtest/gtest.h>

#include <cstring>
#include <sstream>
#include <string>

#include "U8g2lib.h"

/** @brief One call-log entry as `op(a, b, …)[pointer]"text"`. */
inline std::string describe_call(const u8g2_stub_call& call) {
    std::ostringstream out;
    out << (call.op != nullptr ? call.op : "?") << "(";
    for (int i = 0; i < 6; ++i) {
        out << (i == 0 ? "" : ", ") << call.args[i];
    }
    out << ")";
    if (call.pointer != nullptr) {
        out << "[" << call.pointer << "]";
    }
    if (call.text[0] != '\0') {
        out << " \"" << call.text << "\"";
    }
    return out.str();
}

/**
 * @brief Whether two stubs received identical, non-empty call sequences.
 * @param expected The reference path (firmware).
 * @param actual   The path under test (editor).
 */
inline ::testing::AssertionResult same_call_log(const U8G2& expected, const U8G2& actual) {
    if (expected.call_log_overflowed() || actual.call_log_overflowed()) {
        return ::testing::AssertionFailure() << "a call log overflowed its " << U8G2::kCallLogCapacity
                                             << " entries; the comparison would see only a prefix";
    }
    if (expected.call_log_count == 0) {
        return ::testing::AssertionFailure() << "the reference drew nothing; comparing two empty logs proves nothing";
    }
    const int shared = expected.call_log_count < actual.call_log_count ? expected.call_log_count : actual.call_log_count;
    for (int i = 0; i < shared; ++i) {
        const u8g2_stub_call& e = expected.call_log[i];
        const u8g2_stub_call& a = actual.call_log[i];
        bool same = std::strcmp(e.op, a.op) == 0 && e.pointer == a.pointer && std::strcmp(e.text, a.text) == 0;
        for (int k = 0; k < 6 && same; ++k) {
            same = e.args[k] == a.args[k];
        }
        if (!same) {
            return ::testing::AssertionFailure() << "call " << i << " differs:\n  firmware: " << describe_call(e)
                                                 << "\n  editor:   " << describe_call(a);
        }
    }
    if (expected.call_log_count != actual.call_log_count) {
        const U8G2& longer = expected.call_log_count > actual.call_log_count ? expected : actual;
        return ::testing::AssertionFailure()
               << "firmware made " << expected.call_log_count << " calls, editor " << actual.call_log_count
               << "; first extra: " << describe_call(longer.call_log[shared]);
    }
    return ::testing::AssertionSuccess() << expected.call_log_count << " identical calls";
}

#endif  // U8G2GL_TEST_CALL_LOG_H
