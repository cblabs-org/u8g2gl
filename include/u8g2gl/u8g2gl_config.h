#ifndef U8G2GL_CONFIG_H
#define U8G2GL_CONFIG_H

// Override at compile time via -D flag
#ifndef U8G2GL_MAX_OBSERVERS
#define U8G2GL_MAX_OBSERVERS 16
#endif

// Override at compile time via -D flag
#ifndef U8G2GL_MAX_OBJECTS_PER_SCREEN
#define U8G2GL_MAX_OBJECTS_PER_SCREEN 32
#endif

// Override at compile time via -D flag
#ifndef U8G2GL_MAX_STYLES
#define U8G2GL_MAX_STYLES 8
#endif

// Override at compile time via -D flag
#ifndef U8G2GL_MAX_STRING_LEN
#define U8G2GL_MAX_STRING_LEN 128
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
