# Bridge — PR-4R3 PA → Chief Architect: implementation complete

From the PR-4R3 Principal Architect. Stack tip `u8g2gl-4r3/wo4-readability`, opened as one PR
against `main` @ `783e189`. Full record: [PROJECT.md](PROJECT.md).

## Counts against the baselines

| | Baseline | Tip |
|---|---|---|
| C++ ctest | 395, one skip | **401**, one skip (`SizeOfReport.ThirtyTwoBitTarget`) |
| CLI vitest | 1319 | **1338** |
| Warnings (`-Wall -Wextra -Wpedantic`) | 0 | **0** |
| Schema / CLI / runtime / scene | 0.4 / 0.10.0 / 0.6.0 / 3 | 0.4 / **0.11.0** / **0.7.0** / 3 |

Verified by the PA at the tip, from a clean configure, each suite alone.

## The three items

**1. Runtime floor (§16, R1).** Every generated config now emits:

```cpp
#ifndef U8G2GL_REQUIRE_RUNTIME_VERSION
#error "This code requires u8g2gl runtime 0.7 or newer, but the runtime in use predates the runtime version check. …"
#else
U8G2GL_REQUIRE_RUNTIME_VERSION(0, 7);
#endif
```

The macro is a floor: the major must be equal, and the runtime minor must be at least the floor's,
at every version. The floor comes from `cli/src/data/runtime-version.json`, which
`npm run build:runtime-version` stamps from `u8g2gl_version.h`. A drift test, in the shape of
`manifest-bundle.test.ts`, was shown failing against a stale 0.6.0 stamp and has a
doctored-header case. Evidence:
- `VersionGuard.OlderRuntimeFailsToCompile` matches on the message, which names both versions:
  *an older runtime is refused by name*.
- `VersionGuard.PreMacroRuntimeFailsByName` compiles the **committed** generated config against a
  frozen 0.6.0 header and matches the `#error`.
- The built CLI's output compiles clean against 0.7 and fails against the frozen header with
  exactly one error. Clang had reported two before the `#else`.

**2. `extends` must name a class (§6.5).** `extends="u8g2gl_box"` is refused with
`U8G2GL_EXTENDS_DRAWING_ELEMENT`, and the message names both working routes. A drawing element that
itself declares `extends` still gets only `DRAWING_ELEMENT_EXTENDS`. After the refusal the child
keeps the parent's props: one error instead of five, pinned by a test. Your §6.5 clause is in,
after the existing paragraph.

**3. No inherited alias (§13.1, R2).** One check, one code, `U8G2GL_BINDING_ALIAS`, replacing
`U8G2GL_GEOMETRY_BINDING_ALIAS`. The message gives [D-20]'s consequence for geometry and [UD-5]'s
otherwise. Nothing relied on the alias: no manifest, fixture or test. A custom drawing element
binding its own non-geometry prop stays legal. Your §13.1 text is in, verbatim.

## For you

1. **§13.1 "names it freely" needs a geometry carve-out.** A custom *drawing* element binding its
   own geometry prop under another name (`<bind name="bind_when" setter="x">`) is still refused, as
   it was since PR-4R2, because [D-20] keys origin and clamp by name. Your new sentence, read
   literally, permits it. The refusal is kept and now pinned by a test. Suggested wording: "names it
   freely, except that a geometry prop keeps its [D-20] name".
2. **rules/03's lead-in disagrees with its table.** It still says generated code "asserts **two**
   floors" under a `Floor` column header, beside the new `Comparison` column that calls the schema
   requirement an equality.
3. **§16 "preceded by an `#ifndef`"** is still true of the `#else` form; "guards the call" would be
   more exact.
4. **Manifest diagnostics locate at the element, not the attribute.** This applies to
   `EXTENDS_DRAWING_ELEMENT`, unknown `extends` and cycles alike. It is a parser change.
5. **Process notes.** A fresh worktree needs
   `git submodule update --init --reference ../U8G2GL/extern/u8g2 extern/u8g2` before configure.
   `generate.test.ts` pins the CLI version literally, so every bump breaks it.
   `refresh-goldens.mjs` reads `dist/`, so rebuild first.

## For PR-05

- **Runtime ≥ 0.7 is now required** by every project regenerated with CLI 0.11.0, including
  departures-board-v3. Ship the 0.7.0 runtime alongside.
- Custom elements that PR-05 brings to firmware can no longer extend a drawing element or alias an
  inherited binding. Both now fail at `validate` with a remedy, not at compile time.

No fourth hole found.
