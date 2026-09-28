/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/cpp-keywords.ts
 * Purpose: The C++ keywords §13.4 forbids as identifiers, held once. Two layers
 *          apply the same rule to different names: Pass 7
 *          (`validator/validate-identifiers.ts`) checks the names an author
 *          writes, and the mangler (`resolver/mangle.ts`) checks the
 *          identifiers that only exist after prefixing. Until PR-4R WO1 each
 *          kept its own copy of this list — identical then, and free to drift.
 *          It sits in `schema/` because it is part of the naming contract every
 *          layer obeys, and owned by either layer the other would have to
 *          import across it (u8g2gl-standards §4).
 * Description: One immutable set, C++20's keywords plus the alternative
 *              operator spellings (`and`, `xor`, ...), in the order both former
 *              copies listed them. Data only; no Node imports.
 *
 * Exports:
 * - CPP_KEYWORDS: §13.4's reserved C++ keywords, the one list
 */

/**
 * C++ keywords (§13.4) — **the one list**. Pass 7 checks author-written names
 * against it; the mangler checks the identifiers that only exist after
 * prefixing. A name in this set is refused as an identifier.
 */
export const CPP_KEYWORDS: ReadonlySet<string> = new Set([
  'alignas', 'alignof', 'and', 'and_eq', 'asm', 'auto', 'bitand', 'bitor', 'bool', 'break',
  'case', 'catch', 'char', 'char8_t', 'char16_t', 'char32_t', 'class', 'compl', 'concept',
  'const', 'consteval', 'constexpr', 'constinit', 'const_cast', 'continue', 'co_await',
  'co_return', 'co_yield', 'decltype', 'default', 'delete', 'do', 'double', 'dynamic_cast',
  'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto',
  'if', 'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq',
  'nullptr', 'operator', 'or', 'or_eq', 'private', 'protected', 'public', 'reflexpr',
  'register', 'reinterpret_cast', 'requires', 'return', 'short', 'signed', 'sizeof', 'static',
  'static_assert', 'static_cast', 'struct', 'switch', 'template', 'this', 'thread_local',
  'throw', 'true', 'try', 'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using',
  'virtual', 'void', 'volatile', 'wchar_t', 'while', 'xor', 'xor_eq',
]);
