/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_config.h
 * Purpose: Every compile-time capacity in the runtime, in one place, each
 *          overridable with -D. These exist because the library never allocates
 *          ([D-1]) — capacity that cannot grow at runtime must be decided at
 *          build time, and a project that needs more should be able to say so
 *          without editing the library.
 *
 *          Defaults are chosen for a typical screen rather than a worst case:
 *          over-allocating by default costs every project RAM to serve a few.
 *          Where the generator knows the real number it should emit a
 *          right-sized type instead of relying on these (§13).
 *
 *          Generated-config inclusion order ([D-21], §13.7): `u8g2gl generate`
 *          emits `u8g2gl_generated_config.h`, holding the capacities counted
 *          from the document. That header must be seen BEFORE this one. Every
 *          value below is wrapped in #ifndef, so whatever the generated header
 *          defined wins and these defaults fill only the gaps. Include it the
 *          other way round and the defaults are defined first, so the generated
 *          values are ignored or redefined.
 *
 *          The order must hold in every translation unit that reads a
 *          capacity, including the runtime library's own sources — not only
 *          the generated files. `U8G2GL_MAX_TOTAL_BINDINGS` and
 *          `U8G2GL_MAX_BINDINGS_PER_OBJ` are read only inside
 *          src/u8g2gl_obj.cpp, where they size the static binding pool, so a
 *          library compiled without the generated header keeps the defaults
 *          however the generated code includes it. This file does not include
 *          the generated header itself, because the runtime cannot know where a
 *          project's `generated/` directory lives.
 *
 * Description: Observer, object, style, string, and binding capacities, each
 *              guarded by #ifndef so a project can override it
 *
 * Exported Constants:
 * - U8G2GL_MAX_TOTAL_BINDINGS: Maximum number of active bindings in the static pool
 * - U8G2GL_NO_PARENT: Sentinel for root objects
 */
#ifndef U8G2GL_CONFIG_H
#define U8G2GL_CONFIG_H

// Default observer-pool capacity for a subject that does not specify its own
// (WO6 Finding B). Per §13 the generator knows exactly how many objects bind
// to each subject at build time and can size the pool exactly via the
// `u8g2gl_subject_*_n<N>` templates; this default only covers hand-written
// subjects and generic code. Override at compile time via -D flag.
#ifndef U8G2GL_DEFAULT_OBSERVERS
#define U8G2GL_DEFAULT_OBSERVERS 4
#endif

// Override at compile time via -D flag
#ifndef U8G2GL_MAX_OBJECTS_PER_SCREEN
#define U8G2GL_MAX_OBJECTS_PER_SCREEN 32
#endif

// Override at compile time via -D flag
#ifndef U8G2GL_MAX_STYLES
#define U8G2GL_MAX_STYLES 8
#endif

// Default declared character capacity for a string subject that does not
// specify its own `max_len` (WO6 Finding A). Matches design_spec.md §8.2's
// stated default of 32. This is also the default `MaxLen` template argument
// for `u8g2gl_subject_string_n`; the buffer allocated is MaxLen+1 bytes
// (room for the null terminator). Override at compile time via -D flag.
#ifndef U8G2GL_MAX_STRING_LEN
#define U8G2GL_MAX_STRING_LEN 32
#endif

// [D-20] made `x`, `y`, `width` and `height` bindable, so an element binding
// all four geometry properties now needs a fifth slot free for `text` or
// `hidden` — four geometry bindings are ordinary, not a worst case. Raised
// from 4 to 8 (PR-3R WO7, [D-21]) so a hand-written element does not exhaust
// its budget on geometry alone. The generator emits an exact per-project
// value once it exists (PR-04); this default only covers hand-written use.
// Override at compile time via -D flag.
#ifndef U8G2GL_MAX_BINDINGS_PER_OBJ
#define U8G2GL_MAX_BINDINGS_PER_OBJ 8
#endif

// Override at compile time via -D flag
#ifndef U8G2GL_MAX_TOTAL_BINDINGS
#define U8G2GL_MAX_TOTAL_BINDINGS (U8G2GL_MAX_OBJECTS_PER_SCREEN * U8G2GL_MAX_BINDINGS_PER_OBJ)
#endif

#endif // U8G2GL_CONFIG_H
