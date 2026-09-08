# TypeScript Standards — CLI, Generator and Designer

Applies to the CLI ([D-10]) and the designer ([UD-1]). `esp32-app-foundation` has
no TypeScript, so this has no upstream to adapt — it is written for this codebase.

## 1. The isomorphic constraint

**The most consequential rule here.** The schema, validator, resolver and generator
must run **unmodified in both Node and a browser**, because the designer is
static-first ([UD-2]) and does its own validation and generation client-side.

```
src/core/        ← isomorphic. NO node: imports, no fs, no path, no process
src/node/        ← Node-only: filesystem, CLI entry, child processes
src/browser/     ← browser-only: File System Access API, worker glue
```

- **`src/core/` may not import `node:` anything.** Not `fs`, not `path`, not
  `process`. Enforce it with a lint rule, not vigilance.
- I/O crosses the boundary through an interface. `ProjectFileSystem` has a Node
  implementation and a browser implementation; the core takes it as a parameter.
- If you find yourself wanting `path.join` in core, you want a pure string helper.

Getting this wrong is expensive and late-breaking: it compiles and tests fine on
Node, then fails in the designer.

## 2. Naming

Ordinary TypeScript conventions — there is no reason to import the C++ scheme.

| Category | Convention | Example |
|---|---|---|
| Classes, types, interfaces | PascalCase, **no `I` prefix** | `ProjectFileSystem`, `DisplayRecord` |
| Functions, variables | camelCase | `resolveAnchors()` |
| Constants | SCREAMING_SNAKE | `SCHEMA_VERSION` |
| Files | kebab-case | `display-catalogue.ts` |
| Enums | prefer union types | `type Severity = 'error' \| 'warning'` |

Prefer union string types over `enum` — they serialise directly to the `--json`
output and need no mapping.

## 3. Types

- **`strict: true`**, and `noUncheckedIndexedAccess`. Non-negotiable.
- **No `any`.** Use `unknown` and narrow. A lint error, not a preference.
- Parse external input into typed structures at the boundary; do not pass raw
  parsed XML or JSON into the core.
- Prefer `readonly` and immutable data. The resolver is a pure transformation —
  XML in, scene description out — and should be written that way, which also
  makes it trivial to test.

## 4. Diagnostics are a product surface

Per design_spec §1.2 and §15, diagnostic quality *is* the product. This is not
error handling; it is a feature with a contract.

Every diagnostic carries:

```ts
interface Diagnostic {
  readonly code: string;          // STABLE, e.g. 'U8G2GL_UNKNOWN_FONT'
  readonly severity: Severity;
  readonly file: string;
  readonly line: number;          // 1-based
  readonly column: number;        // 1-based
  readonly message: string;       // human prose — may be reworded freely
  readonly suggestions?: readonly string[];  // structured, machine-applicable
}
```

- **`code` is a stable API.** Consumers branch on it. Renaming one is a breaking
  change; the prose message is not.
- **Suggestions are a list, never embedded in prose.** A caller must be able to
  apply a fix without regexing "did you mean…". This is what makes [D-16] real.
- Never throw for a user error. Throwing is for programmer error — an
  unreachable branch, a violated invariant.

## 5. Determinism

Generated output is committed and reviewed (§13.9, [D-11]). Therefore:

- **No timestamps** in output. Ever.
- Iterate arrays and `Map`, never a plain object's key order or a `Set`.
- Sort anything whose natural order is undefined — includes, diagnostics (by
  file, line, column).
- No randomness, no locale-dependent formatting, no `toLocaleString`.

A generator change that alters output without an input change is a breaking
change and needs a version bump (rules/03-versioning.md).

## 6. Testing

Vitest — it runs the same code in Node and a browser-like environment, which is
what the isomorphic constraint requires.

- **Golden-file tests** for the generator: generated C++ compared byte-for-byte
  against a checked-in expectation. This is the primary defence for §13.9.
- **Fixture-driven validator tests**: valid and invalid XML asserting the exact
  diagnostic — code, position and suggestions, not just "it failed".
- **Round-trip tests** ([UD-3]): parse → edit one attribute → serialise, and
  assert the diff is one line and comments survive. This is the requirement most
  likely to be silently broken.
- Test `src/core/` with no Node globals available, so an accidental `fs` import
  fails the test rather than shipping.

## 7. Dependencies

Every dependency in `src/core/` must work in a browser. Check before adding, not
after.

Prefer no dependency. This is a CLI whose install experience is part of its value
([D-10]) — `npx u8g2gl` should be fast. An XML parser is justified; a utility
library for three functions is not.

## 8. React and the designer

- Function components and hooks. No class components.
- **State lives in the CST** ([UD-3]), not in React. The document is the model;
  components render from it and emit text edits. Do not mirror document state
  into `useState` — that is the bug that makes canvas and XML disagree.
- Monaco, Dockview and the Wasm canvas are imperative; wrap each behind a hook
  that owns its lifecycle.
- Keep the canvas render path out of React's reconciler. It draws to a `<canvas>`
  from a framebuffer; React should own the surrounding chrome, not the pixels.
