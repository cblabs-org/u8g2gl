---
name: pr-02-cli-schema-wo1
description: Handoff instructions for Work Order 1 — Project Skeleton
complexity: mechanical
---

# Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make high-level architectural
> decisions, do not create additional branches, and do not plan beyond this
> checklist. Your task is strictly limited to executing the checklist below.

# Objective

Create the TypeScript/Node project skeleton for the U8G2GL CLI tool inside a
`cli/` directory at the repository root. The skeleton must be npm-publishable
as `u8g2gl`, enforce an isomorphic boundary between core and Node-only code,
and include a working Vitest test harness with a CLI entry point stub.

# Parent PR & Authorization

This work order belongs to **PR-02: CLI Foundation, Schema, Validator, Display
Catalogue**. The human's approval of the 6-WO decomposition is recorded in:
`.agents/skills/principal-architect-workspace/pr-02-cli-schema/PROJECT.md`
(status log, 2026-09-08T23:08:28Z).

# Strict Boundary Box

**DO NOT:**
- Create or modify any C++ files (`include/`, `src/`, `test/` at repo root)
- Create or modify any files outside `cli/`, `.gitignore`, and this workspace
- Make schema design decisions — WO2 does that
- Add XML parsing or display catalogue code — WO3 and WO4 do that
- Create additional git branches
- Modify anything in `.agents/` except appending your Completion Report to this file

**YOU MAY:**
- Create all files under `cli/`
- Modify the root `.gitignore` to add `cli/node_modules/`, `cli/dist/`
- Install npm dev dependencies (TypeScript, Vitest, ESLint, etc.)

# Coding Standards

**Read before writing any code:**
- `.agents/skills/u8g2gl-standards/SKILL.md` — §2 TypeScript naming
- `.agents/skills/u8g2gl-standards/references/typescript.md` — full TypeScript rules

**Key rules:**
- PascalCase types, camelCase functions, kebab-case files, SCREAMING_SNAKE constants
- `strict: true`, `noUncheckedIndexedAccess: true`
- No `any` — use `unknown` and narrow
- Prefer union string types over `enum`
- SPDX MIT header on every source file

# Line-Item Instructions

- [ ] **`cli/package.json`** — Create with:
  - `name`: `u8g2gl`
  - `version`: `0.3.0` (matches schema version)
  - `description`: CLI and schema toolkit for U8G2GL
  - `license`: `MIT`
  - `type`: `module` (ESM)
  - `bin`: `{ "u8g2gl": "./dist/node/cli.js" }`
  - `main`: `./dist/core/index.js`
  - `types`: `./dist/core/index.d.ts`
  - `exports`: map `"."` to core, `"./node"` to node entry
  - `scripts`: `build` (tsc), `test` (vitest run), `lint` (eslint)
  - `engines`: `{ "node": ">=18" }`
  - Dev dependencies: `typescript` (^5.x), `vitest` (^2.x), `eslint` (^9.x),
    `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`

- [ ] **`cli/tsconfig.json`** — Create with:
  - `target`: `ES2022`, `module`: `Node16`, `moduleResolution`: `Node16`
  - `strict`: `true`, `noUncheckedIndexedAccess`: `true`
  - `declaration`: `true`, `declarationMap`: `true`, `sourceMap`: `true`
  - `outDir`: `dist`, `rootDir`: `src`
  - `include`: `["src"]`

- [ ] **`cli/eslint.config.js`** (flat config) — Create with:
  - TypeScript parser and plugin
  - **Critical rule:** A custom or pattern rule that errors on any import from
    `node:*` modules within files under `src/core/`. This enforces the isomorphic
    boundary. Files in `src/node/` may import `node:*` freely.
  - Standard recommended rules

- [ ] **`cli/vitest.config.ts`** — Minimal config. Test files in `test/`.

- [ ] **Directory structure** — Create:
  ```
  cli/src/core/index.ts          ← barrel export (empty for now)
  cli/src/node/cli.ts            ← CLI entry point (see below)
  cli/src/browser/index.ts       ← stub barrel (empty, placeholder)
  ```

- [ ] **`cli/src/core/index.ts`** — Empty barrel export with SPDX header and
  a comment: `// Core isomorphic exports — schema, parser, validator, catalogue query`

- [ ] **`cli/src/node/cli.ts`** — CLI entry point stub:
  - Shebang: `#!/usr/bin/env node`
  - Parse `process.argv` minimally (no dependency needed for this stub):
    - `--json` flag (boolean) — store for later use
    - `--version` flag — print version from package.json and exit
    - `--help` flag — print usage and exit
    - First positional arg as the subcommand name
  - Subcommand dispatch stub: recognise `validate`, `find`, `catalogue` and
    print `"Not yet implemented: <command>"` for each.
  - Unknown subcommand: print error with available commands and exit 1.
  - Exit codes: 0 success, 1 error, 2 usage error.

- [ ] **`cli/test/smoke.test.ts`** — Smoke test proving Vitest works:
  - A trivial test (`expect(true).toBe(true)`)
  - Import from `../src/core/index.ts` to prove the module resolves

- [ ] **Root `.gitignore`** — Append entries for:
  ```
  cli/node_modules/
  cli/dist/
  ```

- [ ] **Run `npm install`** in `cli/` to generate `package-lock.json`

- [ ] **Run `npm run build`** to verify TypeScript compiles cleanly

- [ ] **Run `npm test`** to verify the smoke test passes

- [ ] **Run `npm run lint`** to verify ESLint passes, including the isomorphic
  boundary rule on `src/core/`

# Verification Requirement

Before committing:
1. `npm run build` — zero errors
2. `npm test` — smoke test passes
3. `npm run lint` — zero errors
4. `node dist/node/cli.js --version` — prints version
5. `node dist/node/cli.js --help` — prints usage
6. `node dist/node/cli.js validate` — prints "Not yet implemented"
7. `git status` — only `cli/` files and root `.gitignore` modified

**Commit on green build.** Do not wait for approval — SendMessage is disabled.
Branch: `u8g2gl-cli/wo1-skeleton`. Push to origin after committing.

# Issue Surfacing

If you discover a defect, upstream bug, or concern *outside your boundary box*,
surface it in your Completion Report below — do not file issues directly. The
Principal Architect will triage and file them under the correct author identity.

---

## Completion Report
<!-- Written by the worker at task completion -->

### Status
complete

### Changes Made
- `cli/package.json` — npm package configuration (`u8g2gl` version `0.3.0`), configured ESM `type: module`, bin entry `./dist/node/cli.js`, core exports, build/test/lint scripts, and dev dependencies (`typescript`, `vitest`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `@types/node`).
- `cli/tsconfig.json` — TypeScript configuration targeting `ES2022`, module and resolution `Node16`, `strict: true`, `noUncheckedIndexedAccess: true`, declarations, sourcemaps, output to `dist/`, root `src/`.
- `cli/eslint.config.js` — flat config with typescript-eslint recommended rules, plus `no-restricted-imports` rule banning `node:*` and Node built-ins under `src/core/**/*.ts` to maintain the isomorphic boundary.
- `cli/vitest.config.ts` — Vitest configuration targeting `test/**/*.test.ts`.
- `cli/src/core/index.ts` — isomorphic core entry point barrel export placeholder with SPDX header.
- `cli/src/node/cli.ts` — CLI entry point stub (`#!/usr/bin/env node`) with argument parser, `--json`, `--version`, `--help`, and subcommand dispatch for `validate`, `find`, `catalogue` with status codes (0 success, 1 error, 2 usage error).
- `cli/src/browser/index.ts` — browser entry point stub barrel placeholder with SPDX header.
- `cli/test/smoke.test.ts` — smoke test verifying Vitest test harness and core module resolution.
- `cli/package-lock.json` — lockfile generated from clean `npm install`.
- `.gitignore` — appended `cli/node_modules/` and `cli/dist/`.

### Decisions Made
- Used `@typescript-eslint/eslint-plugin` flat recommended configs with `no-restricted-imports` specifying `node:*` and `builtinModules` to enforce the isomorphic boundary strictly in `src/core/`. Tested and verified that attempting to import `node:path` in `src/core/` generates an ESLint error.
- Added `@types/node` as a dev dependency to provide strict typing for Node built-in imports (`node:fs`, `node:url`) in `src/node/cli.ts`.
- Included usage exit code 2 when required CLI arguments or subcommands are omitted or when invalid options are provided, and exit code 1 on unknown subcommands.

### Verification Results
1. `npm run build` — compiled cleanly with zero errors.
2. `npm test` — smoke test passed (2/2 tests passed).
3. `npm run lint` — zero errors; verified isomorphic boundary catches `node:*` imports in `src/core/`.
4. `node dist/node/cli.js --version` — printed `0.3.0`.
5. `node dist/node/cli.js --help` — printed usage instructions.
6. `node dist/node/cli.js validate` — printed "Not yet implemented: validate".
7. `node dist/node/cli.js <unknown>` — exited with code 1.
8. `node dist/node/cli.js` — exited with code 2.
9. `git status` — confirmed only `cli/` and `.gitignore` were touched.

### Dead Ends & Warnings
- (none)

### Out-of-Scope Findings
- (none)

### Blockers
- (none)
