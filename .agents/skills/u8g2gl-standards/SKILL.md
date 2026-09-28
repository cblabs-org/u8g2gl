---
name: u8g2gl-standards
description: The single authority on U8G2GL coding standards — naming, memory discipline, documentation, encapsulation and file layout — for the C++ runtime, the TypeScript CLI and the designer. Load this before writing or reviewing ANY U8G2GL source code, whenever a worker agent needs house style, and whenever auditing a contribution. Used by both coding agents and the readability-reviewer agent so author and reviewer work from the same rules. Documentation standards — file headers with SPDX, Doxygen on public APIs, in-routine step breakdowns, why-comments — carry equal weight to the code rules. Note the naming scheme differs between C++ and TypeScript, so check §2 before judging any identifier.
---

# U8G2GL Coding Standards

The standards for every line of code in this repository. Naming, documentation,
memory discipline, structure.

**Documentation is not decoration here.** A monochrome UI framework is read far
more often than it is written — by the next contributor, by a code generator
author working against §13's contract, and by agents that were not present when a
decision was made. §4 and [documentation.md](references/documentation.md) carry
the same weight as the memory rules.

## Two audiences, one authority

This skill is loaded by **both** the agents that write U8G2GL code and the agent
that reviews it. That is deliberate: an author and a reviewer working from
different copies of the rules will disagree, and the disagreement will surface as
churn rather than as a defect. One source, two modes.

**If you are writing code** — read §2 (naming) and the reference for your
language before you start. §4 lists the things that will get a change rejected;
they are short and worth knowing by heart.

**If you are reviewing code** — you are probably the `readability-reviewer`
agent, which carries the review *procedure*, severity model and report format.
This skill tells you what the rules *are*; that agent tells you how to conduct
the audit. Cite sections of this skill in your findings so an author can go
straight to the rule.

**When the two conflict**, this skill wins on *what the standard is*. If you
think a standard is wrong, say so as an observation — do not quietly deviate.
The standards are changeable; silent divergence is not, because it produces a
codebase where nobody can tell intent from accident.

## When to use this skill

- Writing or reviewing any C++ in the runtime library
- Writing or reviewing the TypeScript CLI or designer
- Briefing a worker agent that will touch source
- Auditing a contribution for consistency

## 1. What kind of code this is

U8G2GL is a **library**, not an application framework. It has no `Application`
hub, no module registry, no event bus, and no boot sequence. Rules that exist to
constrain modules inside a framework — orchestration, hub references, registration
order — do not apply. What does apply is **memory, encapsulation, documentation
and clarity on a constrained target**.

Three distinct bodies of code, with different rules:

| Code | Language | Runs on | Standard |
|---|---|---|---|
| Runtime library (`include/`, `src/`) | C++17 | ESP32/RP2040/STM32 **and** Wasm | [cpp.md](references/cpp.md) |
| CLI and generator | TypeScript | Node **and** browser | [typescript.md](references/typescript.md) |
| Designer | TypeScript + React | Browser | [typescript.md](references/typescript.md) |

## 2. Naming

The scheme differs **by language**. Check which you are in before judging any
identifier — this is the most common source of both real defects and false
positives inside this repo.

### C++ runtime — LVGL-style, flat prefixes

| Category | Convention | Example |
|---|---|---|
| Classes / structs | `u8g2gl_` + lowercase_snake | `u8g2gl_obj`, `u8g2gl_style` |
| Base classes | No `I` prefix | `u8g2gl_obj`, not `IObject` |
| Methods | snake_case | `set_coords()`, `get_x()` |
| Member variables | trailing underscore | `observer_count_`, `style_` |
| Enum types | `u8g2gl_*_t`, **explicit base type** | `u8g2gl_align_t : uint8_t` |
| Enum values | `U8G2GL_` + SCREAMING_SNAKE | `U8G2GL_ALIGN_LEFT` |
| Constants / macros | `U8G2GL_` + SCREAMING_SNAKE | `U8G2GL_DEFAULT_OBSERVERS` |
| Files | lowercase, matching the class | `u8g2gl_obj.h` / `.cpp` |

**Why flat prefixes and not namespaces** — [D-13]. Symbols stay readable in linker
maps and debugger backtraces, Arduino sketches use `using namespace` freely enough
that namespaces protect nothing, and a prefixed header remains usable from C.

**Why lowercase_snake class names**, which is unconventional C++ — [D-12] and
design_spec §13.4. An XML tag maps **1:1** onto a class name: `<u8g2gl_label>`
instantiates `u8g2gl_label`. That buys a generator with no name-mapping table and
generated code a user can read against their own XML line by line. Renaming these
to PascalCase would break the generator's contract.

**Always give an enum an explicit base type.** An untyped `enum` is `int` — four
bytes where one will do. This cost 16 bytes per object before it was caught.

### TypeScript CLI and designer — ordinary TypeScript

| Category | Convention | Example |
|---|---|---|
| Classes, types, interfaces | PascalCase, **no `I` prefix** | `ProjectFileSystem` |
| Functions, variables | camelCase | `resolveAnchors()` |
| Constants | SCREAMING_SNAKE | `SCHEMA_VERSION` |
| Files | kebab-case | `display-catalogue.ts` |
| Enums | prefer union string types | `type Severity = 'error' \| 'warning'` |

There is no reason to carry the C++ scheme into TypeScript, and doing so would
fight every tool in that ecosystem. Judging TypeScript against the C++ table is a
false positive.

## 3. Architectural principles

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
- **Every mutator that changes what is drawn calls `mark_dirty()`.** §11.2 gates
  `sendBuffer()` on the frame dirty flag, so a setter that mutates state and
  returns leaves the display stale until something unrelated forces a frame. This
  has already shipped once — `set_hidden()` and `set_disabled()` had it — and it
  is the worst kind of defect, because it works on any screen with an animation
  running and fails silently on a static one.
- **Element knowledge is data, never code** ([D-17]). No hardcoded list of element
  names anywhere in the CLI. The manifests are the source. A hardcoded set drifts
  from them, and one already did: `TIER1_PRIMITIVES` named three elements that do
  not exist and omitted four that do, so three phantom tags validated cleanly.
- **Static capacities are generated, never guessed** ([D-21]). The generator
  counts objects and bindings from the document and emits the constants.
  `u8g2gl_config.h`'s defaults exist for hand-written use only. Do not respond to
  a capacity problem by raising a default in generated-code paths.
- **A lookup table two layers share lives in neither of them.** `validator/` and
  `generator/` both need the same tables — style properties, colour values, the
  realisation rule. Copying one is worse, because [D-17] makes this knowledge
  data and two copies drift apart. Importing across the two layers is also wrong:
  it makes them mutually dependent, and the direction someone picks first becomes
  permanent by accident. Put the table in a neutral module both import, such as
  `core/schema/`.

## 4.1 Current design baseline — read before writing any element code

Four decisions taken on 2026-09-11/12 changed the element model. Code written
against the older shape will look plausible and be wrong:

- **[D-18]** — there is **one element vocabulary**. No Tier 1 / Tier 2 split, no
  `components/`, no `<component>`. Whether an instance becomes a C++ object or
  draw calls is a generator outcome, never an authoring category. Primitives that
  need no object compile to `u8g2gl_draw_*` **free functions**, not classes — if
  you find yourself tidying those into a class, you are reintroducing the split.
- **[D-19]** — overflow is `long_mode` on `u8g2gl_label`. `truncate` and
  `u8g2gl_scrolling_label` are gone. `wrap` is deliberately not offered.
- **[D-20]** — `x`, `y`, `width`, `height` are bindable. Per-axis setters exist
  because a `bind_width` observer has one value and nothing to pass for the other
  three. There is no runtime layout pass.
- **[D-21]** — capacities are generated from the document.

Full records under `docs/decisions/`. `docs/design_spec.md` is normative; where
this skill and the spec disagree, the spec wins and the skill is stale — say so
rather than following it.

## 5. Reference

- **[references/documentation.md](references/documentation.md) — file headers, Doxygen, in-routine breakdowns. Read this one; it is the most frequently violated.**
- [references/cpp.md](references/cpp.md) — C++ style, memory discipline, file layout, testing
- [references/typescript.md](references/typescript.md) — CLI and designer standards

## Attribution

Documentation conventions and memory discipline derive from the author's
`esp32-app-foundation` house standards (Apache-2.0, © CB Labs), relicensed here
under this repository's MIT terms. Naming and structure are U8G2GL's own.
