# [D-21] Static capacities are generated from the document, not configured by hand

**Status**: Decided
**Date**: 2026-09-12
**Decision**: The generator computes every static capacity — objects per screen,
bindings per object, total bindings, styles — from the document it is compiling
and emits them as a generated header. `u8g2gl_config.h`'s defaults survive only
as fallbacks for hand-written use. Exceeding a capacity becomes an arithmetic
fact at build time, never a silent failure on the device.

## Context

The runtime's pools are fixed at compile time by `include/u8g2gl/u8g2gl_config.h`:

| Constant | Default |
|---|---|
| `U8G2GL_MAX_OBJECTS_PER_SCREEN` | 32 |
| `U8G2GL_MAX_BINDINGS_PER_OBJ` | 4 |
| `U8G2GL_MAX_TOTAL_BINDINGS` | objects × bindings |
| `U8G2GL_MAX_STYLES` | 8 |

Those numbers were reasonable when they were written. Two decisions taken on
2026-09-11 invalidated them, and a third property of the system makes the
invalidation dangerous rather than merely inconvenient.

**[D-20] makes `U8G2GL_MAX_BINDINGS_PER_OBJ = 4` insufficient by construction.**
`x`, `y`, `width` and `height` are now bindable. An element that binds all four
geometry properties has consumed its entire budget and has nothing left for
`text` or `hidden`. This is not a tight fit that a bigger default would relieve —
it is a ceiling that the design's own worked examples cross.

**[D-18] makes object counts rise structurally.** Composites are real container
objects, so a screen assembled from composites reaches 32 objects far sooner
than the flat screens the default was sized against.

**Neither ceiling is validated, and the runtime failure is quiet.** The validator
has no guard on object or binding counts. `add_binding()` returns `false` on
exhaustion — a return value generated code can ignore, and which no author sees.
The result is a screen that compiles, links, boots, and silently fails to update
one widget.

## Decision

### 1. The generator emits the capacities

The generator has the whole document. It can count objects per screen, bindings
per object and styles exactly, so it emits them rather than inheriting a guess:

```c
/* generated/u8g2gl_generated_config.h — do not edit */
#define U8G2GL_MAX_OBJECTS_PER_SCREEN 47
#define U8G2GL_MAX_BINDINGS_PER_OBJ    6
#define U8G2GL_MAX_TOTAL_BINDINGS     91
#define U8G2GL_MAX_STYLES              5
```

Values are the measured maxima across all screens in the project, not per-screen,
because the pools are shared. `U8G2GL_MAX_TOTAL_BINDINGS` is the true sum rather
than `objects × bindings`, which over-allocates whenever the worst-case object is
not the typical one — on a representative screen that product is several times
the actual need.

`u8g2gl_config.h` keeps its `#ifndef` guards and its defaults, so hand-written
(non-generated) use is unaffected and the generated header simply wins by being
included first.

### 2. The absolute ceiling is a hard validator error

`parent_index_` is a `uint8_t` and `U8G2GL_NO_PARENT` consumes one value, so a
screen may hold at most **254** objects. That is a property of the object model
([A-3]), not a tunable. The validator gains a hard error naming the screen, its
object count and the ceiling.

Raising `parent_index_` to `uint16_t` was considered and rejected: it costs a
byte on every object to serve a screen nobody will author on a 128×64 display,
and the trigger to revisit is a real screen approaching 200 objects.

### 3. Capacities are reported in the budget

§18 already reports what the project costs. Capacity is the same class of fact
and belongs in the same place — a project at 47 of 254 objects is healthy, and a
project at 240 should know before it discovers the ceiling by hitting it.

### 4. Generated code need not check binding returns

Once capacities are derived from the document, `add_binding()` cannot fail in
generated code — the pool was sized from the very bindings being added. The
`false` return remains for hand-written callers, where it is a real condition.

This is the point of the decision: the failure does not move from runtime to
build time, it stops existing for generated projects.

## Alternatives rejected

**Raise the defaults.** Replaces one guess with a larger guess, and the pools are
static — every project then pays the worst case's RAM. On [D-1]'s 16 KB floor
that is not free.

**Allocate dynamically.** Violates the heap-free rule ([D-1], §9.2), which is not
negotiable for this class of target.

**Assert at runtime.** Converts a silent failure into a device reboot. Better,
but still discovered on hardware by whoever runs the firmware rather than on the
machine that generated the code.

**Validate against the defaults without generating them.** Would catch the
overflow, but leaves authors editing a config header to match a document the
generator already understands — busywork the tool can do exactly.

## Consequences

- A new generated header, included ahead of `u8g2gl_config.h`
- `U8G2GL_MAX_BINDINGS_PER_OBJ`'s default rises to **8** for hand-written use,
  since [D-20] makes four geometry bindings ordinary
- The validator gains the 254-object hard error
- §18 gains a capacity section
- §13.7's emitted-file list grows by one entry
- Determinism (§13.9) applies: the header is derived from the document, so an
  unchanged project regenerates it byte-identically

## Measured cost of the interim default — PR-3R WO7

Raising `U8G2GL_MAX_BINDINGS_PER_OBJ` from 4 to 8 costs **+5,120 bytes of static
RAM on a 64-bit host**, measured: 32 objects × 4 additional slots × a 40-byte
`u8g2gl_binding_desc`. No 32-bit figure exists — this host cannot produce an
ILP32 build — so the target number is still unmeasured, and §1.3 forbids quoting
an estimate as though it were one.

**That cost is the argument for this decision, not against it.** The whole pool
is `MAX_OBJECTS_PER_SCREEN × MAX_BINDINGS_PER_OBJ`, so a project with three bound
objects pays for 256 binding slots exactly as one with two hundred does. Every
project now carries the worst case, which is precisely what a static default
sized by guesswork does — and precisely what the generator emitting exact
capacities removes.

The raised default is therefore **interim**, correct only for hand-written use.
Once PR-04 emits the real numbers, a generated project should pay for the
bindings it actually declares and no more.

## Trigger to revisit

A real screen approaching 200 objects, which would make `uint8_t` parent indices
the constraint rather than a comfortable margin.
