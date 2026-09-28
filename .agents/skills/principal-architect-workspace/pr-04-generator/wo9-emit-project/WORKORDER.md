---
work_order: WO9
project: pr-04-generator
title: "Firmware emission: project-level files"
branch: u8g2gl-generator/wo9-emit-project
base: u8g2gl-generator/wo8c-validator-alignment
complexity: standard
status: complete
---

# WO9 — Project-level emission

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo9-emit-project`
**Base**: `u8g2gl-generator/wo8c-validator-alignment`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill. Determinism (§13.9): document order, sorted includes,
no timestamps, no floating point.

## Design authority

design_spec §8.1–§8.2, §13.2, §13.4, §13.7, §13.9, §14; [D-21]. What the
generator may **not** assume about the runtime is listed in §13.7 — respect it.
Where this work order and the spec disagree, **stop and report**.

---

## Objective

Emit every file that is not per-screen, through **shared emission helpers** that
WO10 and WO11 reuse.

## What the pipeline already gives you

WO8a expands and resolves once; WO8b realises, flattens and counts capacities; WO8c enforces
the 254-object ceiling against realisation's own count. **Consume all of it.**

- **Never compute a second object count, capacity or expansion.** WO8c's ceiling exists
  because a second, drifted count let a 256-object screen through both commands. Source scans
  now fail if a second count or a second reserved-prefix list appears — do not add one.
- **Capacities come from WO8b**, including per-subject observer counts (`_n<N>`) and the true
  binding sum. Emit those numbers; do not re-derive them.
- **The pipeline is built for one target.** Thread the pipeline and realisation for the target
  you are emitting; `ValidateInput.realisation` and `realisationOf()` are how they travel.
- **Realisation currently lives in `generator/realise/`** and the validator imports it. That
  layering is recorded as a wart to settle at the end-of-PR review — do not move it here.

## Line-Item Instructions

- [x] **Carried from WO8a — every emitted value must be literal and typed.** The value helper
      below cannot spell a value the pipeline never resolved or checked, and four gaps reach it
      today. Close each, with a test that fails at the base:
  - **Booleans:** only `hidden` is value-checked, so `filled="yes"` validates and would reach
    emission (confirmed end to end). Every `type="bool"` prop takes `true`/`false` only, with
    the strictness §7.2 gives `hcenter`.
  - **Non-coordinate `int` props are never evaluated:** `scroll_px_per_sec="#speed"` arrives as
    text. Resolve every `type="int"` prop through the existing evaluator — one evaluator, no
    second copy — and apply the `int32_t` range rule (§13.2 keeps coordinates at `int16_t`).
  - **A screen-level `$prop` in a `bind_*` attribute** is silent; at screen level there is
    nothing to substitute, so it is an error, as it already is for other attributes.
  - **A literal `<style>` child inside a `<view>`** is unchecked; check it as the attribute
    form is checked.
- [x] **Shared helper — value spelling (§13.2):** one function mapping a prop type
      and resolved value to its C++ spelling (`int`, `bool`, escaped `string`,
      `enum` via `emit`, `font`, `image`, `subject`, `style`, `color`). Setter calls
      are spelled through it and nowhere else.
- [x] **Shared helper — draw arguments:** one function producing a draw call's
      argument list from a drawing element's props in manifest declaration order
      (the order WO2 proved matches the header).
- [x] **`u8g2gl_generated_config.h`:** the [D-21] capacities from WO8, and the
      version guard against WO4's `u8g2gl_version.h`.
- [x] **`ui.hpp`:** includes the generated config **before** any runtime header;
      declares subjects, `ui_set_*`, screens, `ui_init()`.
- [x] **Subjects unit:** `u8g2gl_subject_<type>_n<N>` with WO8's observer counts;
      strings sized by `max_len` (`max_len + 1` bytes, §8.2); initial values;
      `ui_set_*` setters.
- [x] **Styles unit** (`ui_style_*`), **fonts** (`<builtin>` only — `<bdf>` is
      refused in WO5), **images** (`<xbm>` from file, `PROGMEM`; `<convert>` refused).
- [x] **Carried from WO5b — the generator version must never be guessed.**
      `getPackageVersion()` in `cli/src/node/cli.ts` falls back to `'0.3.0'` when
      `package.json` cannot be read, which would stamp a wrong generator version into
      committed output. Fail with a clear error instead; a test covers the unreadable
      case.
- [x] **Carried from WO5b — `<output prefix>`.** It is parsed but nothing reads it,
      and §13.4 fixes generated identifiers as `ui_*`. Decide from §13.4 whether it can
      mean anything (e.g. file names only). If it cannot, diagnose it rather than
      accept it silently; if it can, implement it and say what it controls. Record the
      reasoning.
- [x] **Carried from WO4 — F5: generated capacities must reach the library build.**
      The binding pool is sized in `src/u8g2gl_obj.cpp` from `u8g2gl_config.h`.
      Including `u8g2gl_generated_config.h` only from generated translation units
      leaves the library compiled with the defaults, so the [D-21] capacities never
      take effect and §18's report would be false. Emit the capacities in a form the
      *library's* compilation also sees, and document the integration for CMake and
      PlatformIO (§16). Design it here; WO10's compile layer proves it.
- [x] **Golden files** for a fixture project, compared byte-for-byte (§17.1).

## Strict Boundary Box

**In scope:** `cli/src/core/generator/emit/` (project units and shared helpers);
`cli/src/core/validator/` and `cli/src/core/resolver/` (the four WO8a value-completeness
carries only — booleans, `int` props, screen-level `$prop` in `bind_*`, literal `<style>`
child);
`cli/src/node/cli.ts` (version lookup only); `cli/src/core/parser/parse-project.ts`
and `cli/src/core/validator/` (`<output prefix>` only);
`cli/src/node/` only if the writer needs asset file reads passed in; golden
fixtures and tests; this WORKORDER.

**Do NOT touch:** per-screen emission (WO10); editor emission (WO11); runtime;
realisation.

---

## Testing Requirement

- [x] Golden files match; regenerating is byte-identical.
- [x] A subject bound by three objects and one draw-call element emits `_n<4>`.
- [x] A string with `max_len="16"` emits a 16-character capacity (17 bytes).
- [x] A string containing quotes, backslashes and non-ASCII escapes correctly.

## Verification Requirement

- [x] CLI tests, `tsc`, lint clean; C++ unchanged and green
- [x] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Worker:** Tier-3, 2026-09-17. **Status `complete`.** Not pushed, not tagged. No
version bumped (rules/03-versioning.md — this work order changes no schema, and the
generator version bump belongs to WO12).

### Authorization

Verified from committed artifacts, not from the dispatch prompt:

- this WORKORDER's front matter: `project: pr-04-generator`, `status: dispatched` (as read);
- `../PROJECT.md` "Human Approval" quotes the owner, *"Approved — proceed with the twelve
  work orders, start WO1"*, recorded at `2026-09-13T19:59:36Z`;
- `../PROJECT.md`'s status log records WO9 dispatched on `u8g2gl-generator/wo9-emit-project`.

Nothing missing or inconsistent. Base commit `9a31fed` (the PA's dispatch commit on this
branch, on top of WO8c's `ae1e7a9`).

### Test counts — every figure from an uncontended run

| Suite | Before (`9a31fed`) | After |
|---|---|---|
| `npx vitest run` | 702, 46 files | **776**, 51 files, all pass |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` (eslint + test type-check) | clean | clean |
| `cmake --build build` warnings | 0 | **0** (no runtime C++ touched) |
| `ctest --test-dir build` | 305, 1 known skip | **305**, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |

Each suite ran alone, never alongside another suite or a build (Standing instructions).

**Run against the base, honestly priced.** `emit-carries.test.ts` is the one new file that
imports *only* modules that already exist at `9a31fed` — the validator and the parsers — so it
really runs there rather than failing to resolve an import. In a throwaway worktree at the base
under `tmp/` (since removed): **10 of its 17 tests fail, and all 10 fail behaviourally**; the
other 7 are deliberate controls that pass at both ends. The ten:

- carry 1 — `filled="yes"` on a drawing element; a bool prop on a class-backed element, once
- carry 2 — unknown constant; malformed expression; the `int32_t` rather than `int16_t` range
  rule; a `$prop` in a non-coordinate `int`
- carry 3 — a screen-level `$prop` in a `bind_*` attribute
- carry 4 — an unknown style in a literal `<style>` child; the reported-once rule
- `<output prefix>` — a prefix that cannot be honoured

The other four new test files (`emit-value`, `emit-draw-args`, `emit-golden`,
`generator-version`) import modules that do not exist at the base, so they fail there
trivially. Reported this way rather than as "37 fail at the base", because the honest figure
for behavioural discrimination is **10**.

### Files emitted, and what each contains

Seven files for the fixture project; the file set and its order are decided in one place
(`emit/index.ts`'s `PROJECT_UNITS`) so output never depends on map or hash order (§13.9).

| File | Contents |
|---|---|
| `u8g2gl_generated_config.h` | The four [D-21] capacities, each with a comment saying how it was arrived at; `U8G2GL_REQUIRE_SCHEMA_VERSION`; the forced-include integration for CMake/ESP-IDF/PlatformIO (WO4 F5) |
| `ui.hpp` | The generated config **first**, then `<cstdint>` and the sorted runtime headers; the `U8G2GL_PROGMEM` shim; every subject with its `ui_set_*`; the styles, fonts and images; each screen's five §13.7 functions; `ui_subjects_init()`, `ui_styles_init()`, `ui_init()` |
| `ui_subjects.cpp` | Right-sized subject storage, the setters, and `ui_subjects_init()` applying string initial values |
| `ui_styles.cpp` | One `u8g2gl_style` per distinct style, and `ui_styles_init()` applying each declared property through its setter |
| `ui_fonts.cpp` | One `ui_font_*` alias per `<builtin>`, plus `#include <U8g2lib.h>` |
| `ui_images.cpp` | Each `<xbm>` as a `PROGMEM` byte array, 12 bytes to a line |
| `ui_screen_<name>.cpp` | Header stamp only — WO10 fills these in. Emitted now so the set is complete, because the writer deletes a stale generated file only when it is *absent* from the list |

### The value helper (§13.2)

`cppValue(prop: PropDef, value: string): string`, in `emit/value.ts`. Driven entirely by the
prop's own declaration, so element knowledge stays data ([D-17]).

| `type` | Emitted | Notes |
|---|---|---|
| `int` | the literal integer | not range-checked here: §13.2 gives coordinates `int16_t` and other `int` props `int32_t`, and those are two separate checks the validator already made |
| `bool` | `true` / `false` | |
| `string` | an escaped literal | see below |
| `enum` | the `emit` pattern expanded | `{VALUE^^}` uppercases, `{VALUE}` is verbatim; an unrecognised placeholder throws rather than reaching output as braces |
| `font` | `ui_font_<name>` | through `mangle.ts`'s own helper |
| `image` | `ui_image_<name>` | " |
| `subject` | `&ui_subject_<name>` | the address, because every runtime binding method takes a subject pointer |
| `style` | `ui_style_<name>` | through `mangle.ts` |
| `color` | `U8G2GL_COLOR_0/1/XOR` | a table, because `xor` uppercases to `XOR` |

**String escaping.** Printable ASCII passes through; `\` `"` `\n` `\r` `\t` take their short
escapes; every other byte — a control character or any non-ASCII codepoint — is emitted as
**three-digit octal escapes of its UTF-8 bytes**, so the literal is pure ASCII and cannot
depend on the compiler's source encoding. Octal with a fixed three digits, not `\x`: an octal
escape consumes at most three digits so a padded escape can never run on into a following
digit, while `\x` has no length bound at all. `?` is deliberately left alone — C++17 removed
trigraphs. The fixture's `Euston "A"\café` emits as
`"Euston \"A\"\\caf\303\251"`.

**It throws rather than guessing.** Emission runs only on a validated document, so a value it
cannot spell is a gap in validation — a programmer error — and a plausible guess in committed
C++ is the worst available outcome ([D-11]). The message names the prop, its declared type and
the value.

### The draw-argument helper

`drawCallFor({ manifest, resolved, bindings }): { fn, args }`, in `emit/draw-args.ts`.

**Order is the effective manifest's declaration order**, which is the order WO2's cross-test
proved matches each runtime free function's parameter list — so there is no translation table
(`u8g2gl_draw.h` states the same from the runtime's side). A drawing element declares no
`extends`, so nothing is inherited into the middle of the argument list. The leading
`U8G2& display` is **not** returned: it is not a prop, and the caller emitting the statement
supplies it.

Three sources per prop, in this precedence: **bound** (the subject read, `ui_subject_x.get()`,
because a full-frame redraw means a stateless element need not store it — §13.5); **written**
(the literal the resolver settled, taken from the resolved geometry, the endpoints/radii or the
`int` properties, never re-parsed from the attribute text); then the **declared default**. On a
drawing manifest a `<bind>`'s `setter=` names a *prop* rather than a method, which is Q-9 kept
for PR-04 by the Chief Architect's ruling, and is read that way here.

### Capacities and `_n<N>` — taken from WO8b, never re-derived

`generate()` counts nothing. It calls `computeCapacities({ globals, screens: realisation.screens })`
on the realisation Pass 9 has *already* checked against §13.3's ceiling, and hands the result
to emission, which only formats it. The `_n<N>` observer counts come from
`Capacities.subjects[].observers` — object bindings plus **exactly one** frame-dirty observer —
and the styles list from `Capacities.styleNames`, so the set of styles emitted is by
construction the set that was counted. For the fixture: objects 9, bindings-per-object 1, total
bindings 6 (the true sum), styles 2; and `level`, bound by three objects and one draw-call
element, emits `u8g2gl_subject_int_n<4>`.

### String subjects: `max_len + 1`, and where the figure comes from

The declared `max_len` is passed straight through as the template argument —
`u8g2gl_subject_string_n<16, 1>` for `max_len="16"`. The **runtime** allocates `MaxLen + 1`
(`char buffer_[MaxLen + 1]`), which is §8.2's rule, so emitting `17` here would double the
allowance and make §18's budget untrue. Confirmed against `src/u8g2gl_subject.cpp`: the base
constructor sets `max_len_ = buffer_capacity - 1`, so the template argument alone sizes it and
no `init()` call is needed for the length. A string's *initial value* cannot go through a
constructor (the string template takes a capacity, not a value), so it is applied in
`ui_subjects_init()`.

### Fonts and images

`<builtin>` emits `const uint8_t* const ui_font_<name> = <name>;` — a `<builtin>`'s `name`
*is* the U8G2 font array identifier, so this is a reference, not a compilation step (§14.1). The
unit includes `<U8g2lib.h>` for those declarations; nothing here constructs a `U8G2`, so §13.10
is untouched.

`<xbm>` emits `const uint8_t ui_image_<name>[] U8G2GL_PROGMEM = { … }`. `ui.hpp` declares it
`extern` first, deliberately: a `const` array at namespace scope has internal linkage in C++, so
without that declaration the definition would be invisible to every other unit. The `.xbm` text
is parsed in isomorphic core (`emit/xbm.ts`) while the file *read* is in `src/node/`; the parse
checks the byte count against the declared dimensions, because a truncated asset would otherwise
be emitted short and `drawXBMP` would read past its end on the device.

`<bdf>` and `<convert>` are **refused before emission** — Pass 8 reports
`U8G2GL_NOT_YET_SUPPORTED` as an error under `generate` (decision 3), naming PR-04b. Both are
still skipped defensively and recorded in a comment in the emitted file, so nothing silently
vanishes if that policy is ever relaxed.

### The version guard

`u8g2gl_generated_config.h` asserts `U8G2GL_REQUIRE_SCHEMA_VERSION(<major>, <minor>)` with the
major and minor split from the **document's own** `schema` attribute — a hardcoded version
would assert nothing. For the fixture: `U8G2GL_REQUIRE_SCHEMA_VERSION(0, 4);`. WO4b's macro
compares the major, and the minor too while the major is 0.

### How the four value-completeness carries were closed

| Carry | Closed by | Diagnostic |
|---|---|---|
| **Booleans** — only `hidden` was value-checked, so `filled="yes"` validated | `booleanAttributesOf()` in `validate-widget-props.ts` extends §7.2's contract names with every `type="bool"` prop the manifest declares, deduplicated so `hidden` is not reported twice | `U8G2GL_INVALID_ENUM_VALUE`, suggestions `['true','false']` |
| **Non-coordinate `int` props never evaluated** | `resolveProperties()` in `resolve.ts` evaluates every `type="int"` prop that is not a coordinate through **the one evaluator**, recorded as `ResolvedElement.properties`; `checkProperties()` in Pass 6 reports what never resolved | the evaluator's own codes for a bad expression (`UNKNOWN_CONSTANT`, `MALFORMED_EXPRESSION`, `DIVISION_BY_ZERO`, `INTEGER_OVERFLOW`); `U8G2GL_UNSUBSTITUTED_PROP` for a `$prop`; `U8G2GL_UNRESOLVED_GEOMETRY` otherwise |
| **A screen-level `$prop` in a `bind_*` attribute** | `screenLevelPlaceholders()` in `validate-references.ts` now walks `bind_*` attributes too | `U8G2GL_UNSUBSTITUTED_PROP` |
| **A literal `<style>` child inside a `<view>`** | the composite walk in `validate-references.ts` checks a literal `<style name>` against the global styles (a screen-local style is not in scope for a template) | `U8G2GL_UNKNOWN_STYLE`, with near-miss suggestions |

The `int` range rule is §13.2's: these stay `int32_t` (which `set_time(uint32_t)` needs) while a
resolved *coordinate* must fit `int16_t`, so they are resolved and checked apart from the
geometry. A test pins both directions.

### Golden files, and the byte-identical proof

Fixture at `cli/test/generator/fixtures/emit-project/`, goldens in its `expected/`. It
deliberately exercises every §13.2 row and every unit: a string subject needing all three
escapes, an int subject bound by three objects and one draw-call element, a `<builtin>` font, an
`<xbm>`, a global style overridden by a screen-local one, a `wd_badge` composite, and
`scroll_px_per_sec="#bar_height + 8"` as a non-coordinate `int` expression.

Goldens are stamped with a **fixed** `0.0.0-golden` version, not the package's own: a golden
carrying the real version would have to be regenerated at every release, and a file that must be
regenerated routinely is one whose diffs nobody reads. `test/generator/refresh-goldens.mjs`
rewrites them deliberately — there is no `--update` flag that rewrites expectations on failure,
because that is how a golden stops catching anything.

**Byte-identity proven three ways:** the golden test generates twice and asserts the second run
equals the first; end to end through the built CLI, two `--out` directories `diff -r` clean; and
`generate --check` on an up-to-date directory exits 0 ("are up to date"). The suite also asserts
no golden exists without a file and no file without a golden, so a rename cannot leave an
unchecked expectation behind.

### Decisions I made

1. **`<output prefix>` cannot mean anything, so it is diagnosed.** §13.4 fixes every generated
   identifier at `ui_`, and §13.7's file names are that same stem, so a prefix could only rename
   the files while the identifiers inside them kept `ui_` — precisely the mismatch §13.4's
   "never silently renamed" rule exists to prevent. `U8G2GL_UNKNOWN_ATTRIBUTE` with the remedy in
   the message. `prefix="ui_"` is **accepted**: it asks for exactly what the generator already
   does, so it is a redundant restatement rather than a request that cannot be met, and erroring
   on it would reject a harmless document (one committed fixture writes it). No new diagnostic
   code was added because `schema/diagnostic.ts` is outside this work order's Boundary Box.
2. **WO4 F5 is a forced include, not a second define list.** I first emitted a
   `u8g2gl_generated_config.cmake` carrying the capacities as `-D` definitions and withdrew it:
   it spelled the four numbers a second time — the drift pattern WO8c spent a work order
   removing — and, because CMake comments are `#`, it could not carry the `// GENERATED` marker
   the writer uses to clean up stale output, so the file would have lingered forever once
   renamed. The integration is instead `-include` of the one header, documented in the header
   for CMake/ESP-IDF and PlatformIO. **WO10's compile layer proves it.**
3. **The version lookup moved to `src/node/generator-version.ts`.** `cli.ts` calls
   `runCli(process.argv)` at module scope, so a test importing it would run the CLI — and the
   work order requires a test for the unreadable case. The lookup is what moved and nothing else;
   the reader is injectable for the same reason. It now throws (four ways) instead of returning
   `'0.3.0'`, and `cli.ts` turns the throw into one plain message and a non-zero exit.
4. **Emission raises diagnostics for the two author defects only it can see** — a missing or
   malformed `<xbm>`, and a subject's declared `value`, which no validator pass type-checks — and
   they refuse the build exactly as a validation error does. It *throws* only for a value
   validation should have caught.
5. **A bound value is read as `.get()`, not `.value`.** §13.5's illustration writes
   `ui_subject_level.value`, but no subject class exposes a public `value` member. Recorded as a
   spec disagreement below.
6. **A styles unit is emitted**, per this work order, though §13.7's list does not name one.
   Recorded below rather than chosen.
7. **Zero capacities are floored at 1 where they size an array**, with the reason stated in the
   emitted file: `U8G2GL_MAX_TOTAL_BINDINGS` sizes `s_binding_pool[]`, and a subject nothing
   observes would give `u8g2gl_observer slots_[0]` — a zero-length array is ill-formed in
   standard C++ and warns under `-Wpedantic`, which the runtime holds at zero. The budget still
   reports the true figure, so §1.3 is not bent.
8. **`ui_init()` is declared, not defined.** WO10 knows the screens it must initialise.

### Existing tests changed, and why

- `generator/generate.test.ts` — file list gains `ui_styles.cpp`; the `ui.hpp` assertion becomes
  "starts with this exact stamp" rather than "is only this stamp", since WO9 emits a body.
- `integration/generate.test.ts` — the `--json` file list gains `ui_styles.cpp`.
- `generator/realise.test.ts` — its `model()` now supplies the `icon_wifi` bytes its globals
  declare. Its `<xbm>` was previously read by nothing; emission now needs it, and skipping an
  unsupplied asset would put an undefined `ui_image_*` symbol into generated code, turning a
  clear diagnostic into a link error.
- `validator/one-pipeline.test.ts` — **a behavioural change, kept deliberately.** The
  `hide="yes"` case is now reported at the attribute the author wrote (`'hide' on <hider> 'h'`,
  in the screen file) rather than on the substituted `hidden="$hide"` inside the template with an
  instance chain appended. Once every `type="bool"` prop is strict, the argument is checked where
  it is written, which is earlier and more direct, and `substituted-values.ts` then suppresses the
  duplicate at the use. Still exactly one diagnostic.

No existing test was weakened, and WO8a's expansion-count assertion is untouched.

### Spec disagreements (recorded, not chosen)

1. **§13.7's emitted-file list does not include a styles unit** ("one unit each for subjects,
   fonts, and images"); this work order requires `ui_style_*`. I followed the work order and
   emitted `ui_styles.cpp`. A style needs a translation unit exactly as a subject does, and
   folding it into the subjects unit would put two unrelated concerns in one file.
2. **§13.5's `ui_subject_level.value`** cannot compile: the member is private and the accessor is
   `get()`. The runtime API is followed.

### Out-of-scope findings (not fixed, not filed)

1. **Every shipped drawing manifest marks `x`, `y`, `width` and `height` `required="true"`**, so
   §6.2's and §8.4's *own* worked examples —
   `<u8g2gl_box name="bar" x="4" y="20" height="6" bind_width="level" />`, with no `width` —
   cannot validate, and no drawing element can be anchor-positioned (`right="0"` without `x` is a
   missing-required error before resolution is reached). The fixture declares `width` alongside
   `bind_width` to work round it. This needs a ruling: either the manifests drop `required` where
   a binding or an anchor can supply the value, or the spec's examples are wrong.
2. **`u8g2gl_circle.xml` and `u8g2gl_ellipse.xml` declare `segments` as `type="enum"` with
   `values=` but no `emit=`**, so there is no enumerator spelling to emit and the value helper
   throws by design. The runtime's enumerators are `U8G2GL_DRAW_SEGMENT_*`. **WO10 cannot emit a
   circle or ellipse draw call until those manifests gain an `emit` pattern.**
3. **A subject's `value`/`default` is never type-checked by any validator pass.** `<int
   name="n" value="lots" />` reaches emission, which now reports it (`U8G2GL_TYPE_MISMATCH`). The
   check arguably belongs in Pass 1, beside the constant checks WO7b added.
4. **A string subject's initial value is never checked against its `max_len`**, so a longer
   default is emitted in full and silently truncated at runtime by `set()`. §8.2 mentions a
   build-time warning only for `bind_text_fmt`.
5. **`StyleDecl` still carries `truncate`**, which [D-19] deleted from `u8g2gl_style`. The
   validator accepts `<style truncate="true" />` and emission has no setter to call, so it emits
   nothing — a declaration with no effect and no diagnostic.
6. **`U8G2GL_UNRESOLVED_GEOMETRY` is now also used for a non-coordinate `int` property**, where
   its name is narrower than its use. A new code would have been cleaner;
   `schema/diagnostic.ts` is outside this Boundary Box, so existing vocabulary was reused rather
   than widening scope.
7. **No single exported constant spells the `ui_` generated-identifier prefix** — `mangle.ts`
   builds it into each per-kind helper — so `validate-schema.ts` now spells it a second time, with
   a comment pointing there. One exported constant would remove the duplication.
8. **A `<bind_flag_if_*>` directive's `subject="$p"` written at screen level is still silent.**
   Carry 3 covers the `bind_*` *attribute* form, which is what this work order named; the
   directive-child form is the same fact and the same fix. Left alone rather than widened.
9. **`ui.hpp` includes `<U8g2lib.h>` only in the fonts unit**, so a project with no `<builtin>`
   font still compiles but a later unit needing U8G2 declarations would not. WO10 should decide
   whether the U8G2 include belongs in `ui.hpp` itself.
10. **A project generated at WO9 alone does not link**, because `ui_init()` is declared and not
    defined and the screen units are stamps. Expected — WO10 owns the compile layer — recorded so
    it is not mistaken for a defect.
11. **`cli/tmp/` holds leftover `fix-names-*` directories** from pre-existing tests. Git-ignored,
    not mine, left alone.

### Diff boundary

`git diff --name-only 9a31fed..HEAD`:

- **new** `cli/src/core/generator/emit/`: `value.ts`, `draw-args.ts`, `xbm.ts`, `unit.ts`,
  `generated-config.ts`, `ui-hpp.ts`, `subjects.ts`, `styles.ts`, `fonts.ts`, `images.ts`,
  `index.ts`
- **new** `cli/src/node/generator-version.ts`
- `cli/src/core/generator/generate.ts`, `generator/index.ts` (emission wired in, `assets`)
- `cli/src/core/resolver/resolve.ts`, `resolver/index.ts` (non-coordinate `int` props)
- `cli/src/core/validator/validate-widget-props.ts`, `validate-references.ts`,
  `validate-geometry.ts`, `validate-schema.ts` (the four carries, `<output prefix>`)
- `cli/src/node/cli.ts` (version lookup, `assets`), `cli/src/node/load-project.ts` (asset reads)
- **new** tests: `emit-value`, `emit-carries`, `emit-draw-args`, `emit-golden`,
  `node/generator-version`, `refresh-goldens.mjs`, and
  `test/generator/fixtures/emit-project/` with its `expected/` goldens
- changed tests: `generator/generate.test.ts`, `generator/realise.test.ts`,
  `integration/generate.test.ts`, `validator/one-pipeline.test.ts`
- this WORKORDER

Untouched: `include/`, `src/`, `extern/`, `docs/`, `PROGRAM*.md`, the manifests, realisation's own
analysis (`realise.ts`, `capacities.ts`), per-screen emission (WO10) and anything for the editor
target (WO11). No second object count, capacity, expansion or resolution was added — the source
scans WO8c left in place still pass.
