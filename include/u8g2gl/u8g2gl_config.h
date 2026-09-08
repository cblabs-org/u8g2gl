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

// Override at compile time via -D flag
#ifndef U8G2GL_MAX_BINDINGS_PER_OBJ
#define U8G2GL_MAX_BINDINGS_PER_OBJ 4
#endif

// Override at compile time via -D flag
#ifndef U8G2GL_MAX_TOTAL_BINDINGS
#define U8G2GL_MAX_TOTAL_BINDINGS (U8G2GL_MAX_OBJECTS_PER_SCREEN * U8G2GL_MAX_BINDINGS_PER_OBJ)
#endif

#endif // U8G2GL_CONFIG_H
