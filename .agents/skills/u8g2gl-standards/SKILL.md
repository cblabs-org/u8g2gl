---
name: u8g2gl-standards
description: Coding standards, naming conventions and architectural discipline for the U8G2GL codebase — the C++ runtime library, the TypeScript CLI, and the designer. Use when writing or reviewing any U8G2GL source code, when a worker agent needs house style, or when auditing a contribution for consistency. Covers naming (which deliberately differs from esp32-app-foundation), memory discipline for embedded targets, encapsulation rules, and file layout.
---

# U8G2GL Coding Standards

Adapted from `esp32-app-foundation`'s `framework-expert` skill, which is the house
standard for the author's embedded work. **Where U8G2GL diverges, it does so
deliberately and the reason is recorded here** — see §2, which is the section most
likely to trip up anyone arriving from the foundation codebase.

## When to use this skill

- Writing or reviewing any C++ in the runtime library
- Writing or reviewing the TypeScript CLI or designer
- Briefing a worker agent that will touch source
- Auditing a contribution for consistency

## 1. What kind of code this is

U8G2GL is a **library**, not an application framework. It has no `Application`
hub, no module registry, no event bus, and no boot sequence. That distinction
matters because much of foundation's discipline exists to constrain *modules
inside a framework* — the Orchestrator Anti-Pattern, hub references, late
registration — and **none of it applies here**. Do not import those rules.

What does apply is everything about **memory, encapsulation and clarity on a
constrained target**. See [references/cpp.md](references/cpp.md).

Three distinct bodies of code, with different rules:

| Code | Language | Runs on | Standard |
|---|---|---|---|
| Runtime library (`include/`, `src/`) | C++17 | ESP32/RP2040/STM32 **and** Wasm | [cpp.md](references/cpp.md) |
| CLI and generator | TypeScript | Node **and** browser | [typescript.md](references/typescript.md) |
| Designer | TypeScript + React | Browser | [typescript.md](references/typescript.md) |

## 2. Naming — where we deliberately differ from foundation

**This is the most important section for anyone coming from `esp32-app-foundation`.**

| Category | esp32-app-foundation | **U8G2GL** |
|---|---|---|
| Classes / structs | `ConfigManager` | `u8g2gl_obj`, `u8g2gl_style` |
| Interfaces | `ITickable` | *(no `I` prefix — plain base classes)* |
| Methods | `getData()` | `set_coords()`, `get_x()` |
| Member variables | `_retryCount` | `observer_count_` *(trailing)* |
| Enum types | `enum class AppState` | `u8g2gl_align_t : uint8_t` |
| Enum values | `AppState::Running` | `U8G2GL_ALIGN_LEFT` |
| Files | `ConfigManager.hpp` | `u8g2gl_obj.h` / `.cpp` |
| Constants / macros | `MAX_RETRY_COUNT` | `U8G2GL_DEFAULT_OBSERVERS` |

**Why the divergence** — three reasons, all recorded as decisions:

1. **[D-13]** — flat `u8g2gl_` / `U8G2GL_` prefixes rather than namespaces, following
   LVGL's convention. Symbols stay readable in linker maps and debugger
   backtraces, Arduino sketches use `using namespace` freely enough that
   namespaces protect nothing, and a prefixed header stays usable from C.
2. **[D-12] and design_spec §13.4** — an XML tag maps **1:1** onto a class name.
   `<u8g2gl_label>` instantiates `u8g2gl_label`. This costs a lowercase_snake
   class name, unconventional in C++, and buys a generator with no name-mapping
   table plus generated code a user can read against their own XML line by line.
3. **We are a peer of U8G2 and LVGL, not a module inside a framework.** Consumers
   read our headers next to `u8g2.h` and `lvgl.h`; matching their idiom lowers the
   cost of reading ours.

**Do not "fix" this to match foundation.** It is a ratified decision, and the 1:1
XML↔class property depends on it.

## 3. Architectural principles

Imported from foundation, minus the framework-module rules that do not apply.

**SOLID, as it lands here**
- **SRP** — one reason to change. A widget renders itself; it does not own layout
  policy, which is resolved at build time ([D-7]).
- **OCP** — extend by adding a widget with an `<api>` manifest, never by editing
  the generator ([D-17]). If a change requires a generator release to add a
  widget, the design has regressed.
- **LSP** — anything holding a `u8g2gl_obj*` must work with any widget.
- **ISP** — small base classes. Do not grow `u8g2gl_obj` to serve one widget.
- **DIP** — depend on `u8g2gl_obj`, not concrete widgets.
- **Deferred DIP** — **do not abstract when only one implementation exists.** Skip
  the interface until a second implementation actually appears. This is the rule
  most often violated by well-intentioned refactoring.

**Encapsulation**
- Members are `private` or `protected`; state changes go through methods.
- **No `extern` global state.** Deterministic tests and explicit dependencies.
- No hidden singletons. Screens and subjects are declared by generated code,
  which the user can read.

**Law of Demeter** — talk to immediate dependencies. Reaching through one object
to find a service is a smell; navigating a genuine domain hierarchy
(`screen.objects[i]`) is not.

**Hierarchical Object Model** — expose a sub-object when it has meaningful
identity independent of its parent. Hide rendering primitives behind the widget's
own API; a caller should not reach into a widget's internal drawing.

## 4. Non-negotiables

These come from the design spec and are enforced in review:

- **No heap allocation, anywhere in the runtime.** Not just in `tick()` — the
  whole library is heap-free by design ([D-1], §9.2). Capacities are declared and
  static.
- **No `std::function` stored as a member.** Hidden SBO heap allocation. Use a
  function pointer plus `void* ctx` — the pattern already used by
  `u8g2gl_observer`.
- **Determinism in generated output** — no timestamps, document order preserved,
  sorted includes (§13.9). An unchanged project must regenerate to an empty diff.
- **Honest cost reporting** — §1.3 forbids claims the budget cannot substantiate.
  If a change makes the §18 report inaccurate, the change is wrong.
- **Zero warnings** under `-Wall -Wextra -Wpedantic`. Not "few". Zero.

## 5. Reference

- [references/cpp.md](references/cpp.md) — C++ style, memory discipline, file layout, testing
- [references/typescript.md](references/typescript.md) — CLI and designer standards

## Attribution

Adapted from `esp32-app-foundation/.agents/skills/framework-expert` (Apache-2.0,
© CB Labs), by the same owner, relicensed here under this repository's MIT terms.
Material specific to the foundation's module framework has been deliberately
excluded rather than adapted.
