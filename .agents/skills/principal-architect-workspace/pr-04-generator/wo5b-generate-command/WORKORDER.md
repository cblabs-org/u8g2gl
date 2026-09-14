---
work_order: WO5b
project: pr-04-generator
title: "`generate` command, shared load path, not-yet-supported policy"
branch: u8g2gl-generator/wo5b-generate-command
base: u8g2gl-generator/wo5a-validator-carries
complexity: standard
status: complete
---

# WO5b — `generate` command and shared load path

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval of PR-04 in
`../PROJECT.md` under "Human Approval" (owner's own words, timestamped), that
`../PROJECT.md` records **the WO5 split as approved at the owner checkpoint**
("Checkpoint rulings"), and that this WORKORDER's `status` is `dispatched`. Otherwise
**stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo5b-generate-command`
**Base**: `u8g2gl-generator/wo5a-validator-carries`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill, `references/typescript.md`. `src/core/` stays isomorphic.

## Design authority

design_spec §13.9, §13.10, §15.3, §16 **on `main` @ `ef73776`**; ui_spec §16.1.
PROJECT.md decisions 1 and 3. Where this work order and the spec disagree, **stop and
report**.

---

## Objective

A `generate` command that runs exactly the validation `validate` runs, refuses on any
error, and writes a deterministic file set confined to the output directory. It emits
only stamped headers here; content arrives in WO9–WO10.

## Line-Item Instructions

- [x] **Extract `loadProject()`** from `handleValidateCommand` (`cli.ts`) into
      `src/node/`. `validate` and `generate` both call it. The `'error'` missing-name
      policy is inherited — **do not add auto-naming** to `generate`; `--fix-names`
      stays on `validate`.
- [x] **Not-yet-supported policy.** A validator parameter, shaped like the name policy
      (a parameter, not a branch): `'warning'` for `validate`, `'error'` for
      `generate`. It reports `U8G2GL_NOT_YET_SUPPORTED` for, each with a message naming
      the PR that delivers it:
  - `<focus_ring>`, `<event_cb>`, `<screen_load_event>`, `<screen_back_event>` → PR-09
  - collection `<element>` children (§9), and a composite that also has a C++ class
    (`view` + `extends`) → PR-08
  - `<bdf>` fonts and `<convert>` images → **PR-04b**; the message must be specific
    enough that PR-04b can replace it
- [x] **`generate [path] --target <name> --out <dir> --check --json`.** `--target`
      defaults to the first `<target>`; `--out` defaults to the project's
      `<output dir>` or `generated/`.
- [x] **Core API:** `generate()` in `src/core/generator/` returns an in-memory, ordered
      set of `{ path, content }` plus diagnostics. No I/O in core.
- [x] **Node writer:** writes only under the output directory (§13.10). Deletes a stale
      file only if it carries the GENERATED header. Refuses to write anything if
      validation has any error.
- [x] **`--check`:** writes nothing; exits non-zero and lists files that would change
      (§16's CI check).
- [x] **Header stamp** on every generated file: source path, schema version, generator
      version, target. **No timestamp** (§13.9).
- [x] **F9 (from WO1):** diagnostics located in a bundled framework manifest print with
      no source line, because the file map holds only project files. `loadProject()`
      builds the map; include the bundled manifest text.
- [x] **Carried from WO5a — single-file schema version.** `validate` on any single
      file that is not `u8g2gl.xml` reports `U8G2GL_UNKNOWN_SCHEMA_VERSION` with an
      empty version, because no project manifest was parsed. A single screen, globals or
      widget file has no schema to check; do not report one. `loadProject()` owns this
      path now, so fix it there, for `validate` and `generate` alike.
- [x] `--json` contract documented in `printUsage` and TSDoc:
      `{ files, diagnostics, errors, warnings }` (budget arrives in WO12).

## Strict Boundary Box

**In scope:** `cli/src/node/cli.ts`, new `cli/src/node/load-project.ts` and writer
module, new `cli/src/core/generator/`, `cli/src/core/validator/` (policy parameter and
the not-yet-supported checks only), `schema/diagnostic.ts`, tests, this WORKORDER.

**Do NOT touch:** runtime; manifests; the WO5a carries; resolution or emitted content
(WO6+).

---

## Testing Requirement

- [x] Same project: `validate` warns, `generate` errors, same code and location.
- [x] `generate` on a project with a missing name fails with the same diagnostic as
      `validate`.
- [x] Writer never escapes `--out` (path traversal test); never deletes an unstamped
      file.
- [x] `--check` on an up-to-date directory exits 0; after a hand edit, non-zero.
- [x] Two runs produce byte-identical output.
- [x] A diagnostic inside a bundled framework manifest prints its source line.

## Verification Requirement

- [x] CLI tests, `tsc`, lint clean; C++ suite unchanged and green
- [x] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

**"Stop and report" in this WORKORDER means:** do not choose — record it in the
Completion Report, then continue with the remaining line items. It never means halt or
ask for permission.

---

## Completion Report

**Worker:** Tier-3, 2026-09-14. **Code commit:** `dc82dea` on
`u8g2gl-generator/wo5b-generate-command`, not pushed.

### Authorization

I checked the committed files, not the dispatch prompt:
- Front matter: `project: pr-04-generator`, `status: dispatched`.
- `../PROJECT.md` "Human Approval" quotes the owner, *"Approved — proceed with the
  twelve work orders, start WO1"*, at `2026-09-13T19:59:36Z`.
- "Checkpoint rulings", item 4: **"WO5 split into WO5a (findings) and WO5b
  (`generate`) — APPROVED."**
- The status log records WO5b dispatched.

Nothing was missing or inconsistent. **One disagreement between this work order and
the spec**, recorded below as S1.

### Test counts

| Suite | Before (`8e108c0`) | After (`dc82dea`) |
|---|---|---|
| `cmake --build build` warnings | 0 | **0** |
| `ctest --test-dir build` | 284 pass, 1 known skip | **284 pass**, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |
| `npx vitest run` | 418, 29 files | **458**, 34 files, all pass |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` (eslint and test type-check) | clean | clean |

The +40 tests:
- `test/validator/not-yet-supported.test.ts`: 6
- `test/generator/generate.test.ts`: 10
- `test/node/load-project.test.ts`: 5
- `test/node/write-generated.test.ts`: 7
- `test/integration/generate.test.ts`: 12

No runtime C++, manifest, parser or `docs/` file changed.

**Checked against the base.** In a throwaway worktree at `8e108c0` under git-ignored
`tmp/` (since removed), `validate screens/screen_home.xml --json` reports
`U8G2GL_UNKNOWN_SCHEMA_VERSION` once. At `dc82dea` it reports it zero times. The other
new tests import modules that do not exist at the base, so they fail there
trivially.

### Per line item

**1. `loadProject()` extracted.**
- New `cli/src/node/load-project.ts`, holding
  `loadProject(targetPath, { label?, frameworkManifests? })`. It returns:
  - `model: ProjectModel`
  - `projectRoot` (directories only)
  - `fileContents`
- The directory path, the single-file root-tag dispatch, the WO5a framework stand-in
  (`bundledFrameworkFilename`) and registry construction all moved out of `cli.ts`
  unchanged.
- Parsing uses the default `'error'` missing-name policy. `generate` has no
  auto-naming and no `--fix-names`; an unknown option is a usage error, tested with
  `--fix-names`.
- Both `validate` and `generate` go through `loadOrExit()` → `loadProject()`.
- The merge, dedupe and sort that `cli.ts` did inline is now
  `checkProject(model, policy)` in `cli/src/core/generator/check-project.ts`.
  `validate` calls it with `'warning'`; `generate()` calls it with `'error'`. There
  is one validation path, not two.

**2. Not-yet-supported policy.**
- New Pass 8, `cli/src/core/validator/validate-not-yet-supported.ts`:
  - `type NotYetSupportedPolicy = 'warning' | 'error'`
  - `DEFAULT_NOT_YET_SUPPORTED_POLICY = 'warning'` (see D1)
  - `validateNotYetSupported(input)`
- `ValidateInput` gains `notYetSupported?: NotYetSupportedPolicy`. `validate()` runs
  Pass 8 last and sorts as before.
- The severity is read from the parameter and used verbatim. Code, location, message
  and `offendingText` do not depend on it, and a test asserts that equality.
- Code `U8G2GL_NOT_YET_SUPPORTED` was added to `diagnostic.ts`, documented as the
  two-severity code.
- Every construct reported, with its location, `offendingText` and exact message:

  | Construct | Located at | `offendingText` | Message |
  |---|---|---|---|
  | `<focus_ring>` (screen or composite view) | the `<focus_ring>` | `focus_ring` | `<focus_ring> is not yet supported: focus navigation (§12.2) — it is delivered in PR-09, and 'u8g2gl generate' refuses it until then.` |
  | `<event_cb>` | the event element | `event_cb` | `<event_cb> is not yet supported: input events (§12.3) — it is delivered in PR-09, and 'u8g2gl generate' refuses it until then.` |
  | `<screen_load_event>`, `<screen_back_event>` | the event element | its tag | `<screen_load_event> is not yet supported: screen navigation (§12.3) — it is delivered in PR-09, and 'u8g2gl generate' refuses it until then.` (likewise for back) |
  | Collection child | the child | its tag | `Collection element <column> in <wd_list> is not yet supported: declared-capacity collections (§9) — it is delivered in PR-08, and 'u8g2gl generate' refuses it until then.` |
  | Composite with a C++ class (`view` + declared `extends`) | the manifest | composite name | `Composite <wd_card> also extends C++ class 'u8g2gl_obj': a composite with a C++ class of its own — it is delivered in PR-08, and 'u8g2gl generate' refuses it until then.` |
  | `<bdf>` font | the `<bdf>` | `bdf` | `<bdf> font 'tall_12' is not yet supported: compiling BDF fonts with bdfconv (§14) — it is delivered in PR-04b, and 'u8g2gl generate' refuses it until then. Declare a <builtin> U8G2 font meanwhile.` |
  | `<convert>` image | the `<convert>` | `convert` | `<convert> image 'logo' is not yet supported: build-time PNG-to-XBM conversion (§14) — it is delivered in PR-04b, and 'u8g2gl generate' refuses it until then. Declare an <xbm> image meanwhile.` |

- How each is detected:
  - A collection child is a tagged child whose tag is in its parent's
    `manifests.get(parent).api.elements`. The parent's own list is used, per the WO1
    F8 PA decision, and no tag list appears in the code.
  - A classed composite is read from the **declared** manifest, because the registry
    gives every composite `u8g2gl_obj`. See F1: from XML this cannot fire today.
- Scope: screens, every declared composite's `<view>`, and globals' fonts and images.
- The PR names are three constants at the top of the file, so each later PR finds
  its entries.

**3. `generate [path] --target <name> --out <dir> --check --json`.** Final flags and
defaults:

| Flag | Default | Notes |
|---|---|---|
| `[path]` | `.` | One positional argument. A single file is refused with `U8G2GL_MISSING_FILE` ("needs a project directory"). |
| `--target <name>` | the first `<target>` | An unknown name gives `U8G2GL_UNKNOWN_TARGET` (new code) with `suggestions` from `findClosest`. No targets gives `U8G2GL_MISSING_REQUIRED`. |
| `--out <dir>` | the project's `<output dir>`, else `generated` | `--out` resolves against the working directory; `<output dir>` resolves against the project directory (D3). |
| `--check` | off | Writes nothing. |
| `--json` | off | Global flag. |

- Exit status: 0 on success (with `--check`, only if nothing would change); 1 if
  refused, or if `--check` finds drift; 2 on a usage error (missing flag value,
  unknown option, two paths).
- A missing path or unreadable project exits 1 with a `U8G2GL_MISSING_FILE`
  diagnostic, in the JSON shape when `--json` is given.

**4. Core API.** `cli/src/core/generator/`:
- `generate(input: GenerateInput): GenerateResult`, where `GenerateInput` is
  `ProjectModel` plus `target?` and `generatorVersion`.
- Result shape: `{ files: readonly { path, content }[], diagnostics, errors,
  warnings, target? }`. It holds no I/O, and `files` is `[]` on any error.
- Steps:
  1. `checkProject(input, GENERATE_NOT_YET_SUPPORTED_POLICY)` — the policy is the
     constant `'error'`, and no caller can override it.
  2. Resolve the target.
  3. Lay out the files.
- File order is fixed:
  1. `u8g2gl_generated_config.h`
  2. `ui.hpp`
  3. `ui_subjects.cpp`
  4. `ui_fonts.cpp`
  5. `ui_images.cpp`
  6. `ui_screen_<name>.cpp` per screen, in load order (filenames sorted)
- The content is the header stamp only.
- Also exported: `checkProject`, `ProjectModel`, `GENERATED_MARKER`,
  `formatHeaderStamp`, `isGeneratedContent`.

**5. Node writer.** New `cli/src/node/write-generated.ts`.

`planGeneratedWrite(outDir, files)` → `FileChange[]` (`{ path, action }`, where
`action` is `created | updated | unchanged | deleted`). It writes nothing.

`writeGenerated(outDir, result)` works in three stages:
1. **Refuse** (throw, writing nothing) if `result.errors > 0`.
2. **Plan.** This confines every path before anything is written.
3. **Apply.** Create or update changed files, skip unchanged ones (not rewritten),
   and unlink stale ones.

How writes are confined (`confinedPath`), all checked before the first write:
- **Lexically:** reject an empty path, an absolute path, a backslash, and any `''`,
  `.` or `..` segment. Then require `resolve(outDir, …segments)` to lie strictly
  under `outDir + sep`.
- **Physically:** the nearest existing ancestor, resolved through `realpathSync`,
  must lie under the real output directory. This defeats a symlinked subdirectory
  leading out.
- **Destination:** an existing destination that is itself a symlink is refused.
- Throwing is correct here: core never emits such a path, so reaching it is a
  programmer error (typescript.md §4).

How it decides what it may delete:
- It lists regular files under `outDir` (symlinks are neither followed nor listed),
  sorted by code unit.
- A file not in the new set is `deleted` **only if its text begins with**
  `GENERATED_MARKER` (`isGeneratedContent`).
- Any other file is not listed and never touched. That covers hand-written code,
  `notes.txt`, and a file quoting the marker on a later line (tested).

**6. `--check`.**
- Uses the same plan and writes nothing; tested on a directory that does not exist,
  which stays absent.
- Exits 1 if any change is not `unchanged`, listing lines such as
  `would update: ui.hpp`.
- Up to date: exit 0 with "Generated files in <dir> are up to date".

**7. Header stamp.** Exact format (`formatHeaderStamp`): ASCII, LF endings, fixed
order, no timestamp.

```
// GENERATED by u8g2gl. Do not edit: regenerate with 'u8g2gl generate'.
// source: <project-relative source path, e.g. screens/screen_home.xml>
// schema: <project schema, e.g. 0.4>
// generator: <package.json version, e.g. 0.6.0>
// target: <target name>
```

- Line 1 is `GENERATED_MARKER`, the writer's deletion test.
- Sources by file: `u8g2gl.xml` for the config and `ui.hpp`; `globals.xml` for the
  subjects, fonts and images units; the screen's own file for each screen unit.
- Tests assert no date or time pattern and no absolute path.

**8. F9 (from WO1).** `loadProject()` adds every bundled manifest text to
`fileContents` under `u8g2gl/manifests/<file>`, the path framework diagnostics use. A
project file with the same key keeps its own text. The test injects a doctored
`u8g2gl_box.xml` and asserts that `formatDiagnostics` prints its `<bogus_child />`
source line with the gutter.

**9. Carried from WO5a — single-file schema version.**
- `ProjectModel.hasProjectManifest` is true for a directory, or for a single file
  whose root is `<u8g2gl>`.
- When it is false, `checkProject()` drops `U8G2GL_UNKNOWN_SCHEMA_VERSION`. The only
  such diagnostic then is the placeholder project's.
- `loadProject()` decides the flag; `checkProject()`, shared by `validate` and
  `generate`, applies it.
- A single `u8g2gl.xml` with a bad schema still reports it (tested). A single screen
  file does not (tested, and verified against the base as above).

**10. `--json` contract.**
- `generate`: `{ "files": FileChange[], "diagnostics": Diagnostic[], "errors": N,
  "warnings": N }`, keys in that order (tested).
  - Each `FileChange` is `{ "path", "action" }`, with `path` relative to the output
    directory.
  - `action` is `created | updated | unchanged | deleted`: what was done, or with
    `--check` what would be done.
  - `files` is `[]` when refused.
- `validate`: unchanged.
- Documented in `printUsage` (tested) and in the TSDoc of `handleGenerateCommand`.
  `generate()` has TSDoc too. Budget arrives in WO12.

### Testing requirement — how each is met

- **Same project: `validate` warns, `generate` errors, same code and location.**
  - `integration/generate.test.ts` uses the committed `valid-project`. It has 3
    constructs: two `<bdf>` and a `<focus_ring>`. Code, file, line, column and
    message are identical, severities are warning vs error, generate exits 1 with
    `files: []`, and no `generated/` is created.
  - Also covered in core (`generate.test.ts`) and at pass level
    (`not-yet-supported.test.ts`).
- **Missing name.** Unit and integration tests: generate's `MISSING_NAME`
  diagnostics deep-equal validate's, nothing is written, and no name appears in the
  source.
- **Writer confinement and deletion.** `write-generated.test.ts`:
  - `..`, `sub/../../`, absolute and symlink escapes all throw with the outside
    directory still empty, and a valid file listed first is not written either.
  - Stale stamped files (including nested ones) are deleted; unstamped files are
    kept.
  - Integration: a hand-written `generated/app_glue.cpp` survives a run.
- **`--check`.** Exit 0 when up to date; exit 1 after a hand edit, listing
  `would update: ui.hpp`, with the edit intact. Also tested with `--json`.
- **Byte-identical output.** Two runs into different directories give identical
  snapshots, and a rerun reports every file `unchanged`. Core also asserts identical
  `JSON.stringify`.
- **Framework manifest source line.** `load-project.test.ts` (F9).

### Existing tests changed

- **`cli.test.ts`, the two `validate valid-project/` tests.** `valid-project`
  deliberately contains `<bdf>` fonts and a `<focus_ring>`, which now warn.
  - The human test now expects `Validation passed: 0 errors, 3 warning(s).` and
    still no stderr.
  - The JSON test expects `warnings: 3`, all three `warning U8G2GL_NOT_YET_SUPPORTED`.
  - The fixture itself is unchanged, because it is now the "same project"
    generate refuses.
- **`validate.test.ts`, "valid project fixture …".** Now 0 errors and exactly two
  `NOT_YET_SUPPORTED` warnings (the fixture's two `<bdf>` fonts). Renamed to say so.
- **`cli.test.ts`, WO1's `createLabelProject` and WO9's fix-names project.** Fonts
  switched from `<bdf name="small_9">` to `<builtin name="u8g2_font_6x10_mr">`, and
  the labels' `font=` to match. These tests are about manifests and names, not fonts.
  All their assertions are unchanged; two would otherwise see a new warning
  (`diagnostics toEqual([])`, `toHaveLength(0)`).

No assertion was removed.

### Decisions I made

- **D1 — default policy `'warning'`**, unlike the missing-name default of `'error'`.
  - The build journey cannot inherit it: `generate()` applies the fixed
    `GENERATE_NOT_YET_SUPPORTED_POLICY = 'error'` and exposes no override.
  - Every other `validate()` caller (the designer, tests) is authoring, where decision
    1 requires a warning.
  - Documented on the constant.
- **D2 — `checkProject()` lives in `core/generator/`.** That is the in-box new
  directory, and it must be isomorphic for the designer. The WO5a carry is applied
  there, driven by the flag `loadProject()` sets, so both commands share it.
- **D3 — `--out` is relative to the working directory, `<output dir>` to the
  project.** Each is relative to where it was written.
- **D4 — `generate` writes only files whose bytes change.** This avoids mtime churn
  in build systems. `--check` and a write share one plan, so they cannot disagree.
- **D5 — unit file names.** §13.7 names `ui.hpp` and `u8g2gl_generated_config.h`
  only, so I chose `ui_subjects.cpp`, `ui_fonts.cpp`, `ui_images.cpp` and
  `ui_screen_<name>.cpp`, following §13.7's `ui_screen_home_*` functions. WO9/WO10
  may rename them; marker-based stale deletion makes a rename safe. `<output
  prefix>` is not applied (F4).
- **D6 — `generate` argument parsing is strict** (unknown option → exit 2). A
  command that writes files must not silently ignore a typo. `validate`'s lenient
  parsing is unchanged.
- **D7 — `KNOWN_COMMANDS` appends `generate` last**, so the existing
  "Available commands: validate, find, catalogue" assertion still holds as a prefix.
- **D8 — new code `U8G2GL_UNKNOWN_TARGET`**, so an unknown `--target` carries
  structured suggestions rather than prose.

### Stop-and-report: spec disagreement

- **S1 — header contents.** §13.9 on `main` @ `ef73776` says the header carries
  *"source path, schema version, and generator version **only**"*. This work order
  also requires the **target**. I did not resolve it. The stamp follows the WORKORDER
  line item, because the rest of the work order needed one concrete format to test.
  Removing the target is one line in `formatHeaderStamp` plus two test strings.
  §16 lists schema and generator versions without "only". → PA / Chief Architect.

### Out-of-scope findings (not fixed, not filed)

1. **F1 — the parser discards `extends` on a composite.** `parseWidgetManifestFile`
   returns `{ name, api, view, loc }` when a `<view>` is present and drops `extends`.
   So `<widget name="x" extends="wd_base">…<view>` cannot be told apart from a plain
   composite, and the "composite that also has a C++ class" refusal **cannot fire
   from XML today**. The check is written against the declared manifest and tested on
   a model with `extends` set. The parser is outside this box. → the PA, before PR-08
   relies on it.
2. **F2 — collections already error in `validate`.** Pass 2 walks every tagged child,
   so `<column>` inside `<wd_list>` is reported `U8G2GL_UNKNOWN_COMPONENT` (error) as
   well as the new warning. For collections, `validate` cannot "warn only" as
   decision 1 intends; the editor would show such a document as broken. Pass 2 is
   outside this box.
3. **F3 — `src/core/index.ts` does not re-export `core/generator/`.** It is not in
   the Boundary Box, so the package's main entry does not expose `generate`,
   `checkProject` or the header helpers. `cli.ts` imports them directly.
4. **F4 — `<output prefix>` is parsed but unused.** The unit names above are
   hardcoded `ui_…`. WO9 should decide whether `prefix` renames files, symbols or
   both.
5. **F5 — diagnostic sort uses `localeCompare`.** `validate.ts` and now
   `checkProject()` (kept identical deliberately) sort by `String.localeCompare`,
   which typescript.md §5 forbids as locale-dependent. File paths are ASCII today, so
   it is latent. Belongs with WO12's determinism work.
6. **F6 — `getPackageVersion()` falls back to `'0.3.0'`.** If `package.json` cannot be
   read, the generator stamps a wrong version instead of failing. Pre-existing;
   matters now that the version is stamped into committed output.
7. **F7 — `<output dir>` itself is not validated.** The writer confines writes to the
   configured directory, but `dir="../src"` or `dir="."` is accepted, pointing
   generation at application sources or the project root. [D-11] and §13.10 say
   generation writes only to the output directory; nothing checks that the
   configured one is sensible. A validator rule candidate.
8. **F8 — stale deletion leaves empty directories behind.** Harmless while every
   generated path is flat.
9. **F9 — `generate` usage errors (exit 2) print prose to stderr, not JSON.** This
   matches `find`'s existing behaviour. §15.3's "`--json` on every command" is met
   for outcomes, but not for argument errors.

### Diff boundary

`git diff --name-only 8e108c0..dc82dea`:
- `cli/src/core/generator/check-project.ts`, `generate.ts`, `header.ts`, `index.ts`
  (new)
- `cli/src/core/schema/diagnostic.ts` (two codes)
- `cli/src/core/validator/index.ts`, `validate.ts` (policy parameter and Pass 8),
  `validate-not-yet-supported.ts` (new)
- `cli/src/node/cli.ts`, `load-project.ts` (new), `write-generated.ts` (new)
- `cli/test/generator/generate.test.ts`, `cli/test/integration/generate.test.ts`,
  `cli/test/node/load-project.test.ts`, `cli/test/node/write-generated.test.ts`,
  `cli/test/validator/not-yet-supported.test.ts` (new)
- `cli/test/integration/cli.test.ts`, `cli/test/validator/validate.test.ts`

Nothing outside the box changed: no runtime, manifests, parser, WO5a carries,
resolution or emitted content, `core/index.ts`, or `docs/`.
