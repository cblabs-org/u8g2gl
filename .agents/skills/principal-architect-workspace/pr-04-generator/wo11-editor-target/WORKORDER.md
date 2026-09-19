---
work_order: WO11
project: pr-04-generator
title: "Editor target: class registry, property thunks, draw-by-name, scene description"
branch: u8g2gl-generator/wo11-editor-target
base: u8g2gl-generator/wo10-emit-screens
complexity: standard
status: dispatched
---

# WO11 — Editor target

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo11-editor-target`
**Base**: `u8g2gl-generator/wo10-emit-screens`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill, both languages. **No heap** — the editor target is still
runtime code.

## Design authority

design_spec §13.1 (two generation targets), ui_spec [UD-4], §4.1 steps 5–7, §15.
**Sample data is out of scope** (PROJECT.md decision 4). Where this work order and
the spec disagree, **stop and report**.

---

## Objective

The editor target, generated from the same manifests and the same resolved model as
firmware, compiled out of firmware entirely — and a test that fails if the two
targets diverge.

## Background

The editor is the point of this programme. ui_spec §15 names editor-target
generation as PR-04 scope. This work order is last among the emitters so that it
reuses finished shared helpers rather than growing a second copy of them — PR-3R's
evidence is that the second copy is where the defect hides.

## What WO9 and WO10 built, and one known runtime defect

- **Reuse, never re-spell:** `emit/value.ts` (the §13.2 value spelling), `emit/draw-args.ts`
  (draw-argument order) and `emit/placement.ts` (container-relative → device-absolute
  coordinates). The parity test below is only meaningful if the editor path goes through the
  same three.
- **The firmware fixture** is committed at `test/generated_fixture/` and compiled in the C++
  suite; its goldens pin the generator stamp to `0.0.0-golden`. Build the parity test on that
  fixture.
- **Known runtime defect — do not fix it here.** `u8g2gl_label::render()` draws only `text_`;
  a label bound to a subject never draws the subject's value (confirmed by the PA; proposed as
  WO10b). Your parity test must not assert bound text. Literal `text` set by name is fine —
  both targets reach `set_text()`. If the defect blocks a line item, record it and continue.
- **Run every suite alone** — never alongside another suite or build (Standing instructions).

## Line-Item Instructions

- [ ] **`include/u8g2gl/u8g2gl_editor.h`**, entirely under `#ifdef U8G2GL_EDITOR`:
      registry entry types — tag, `sizeof`/`alignof`, placement-construct and destroy
      into **caller-provided storage**, a property-thunk table, and a draw-by-name
      entry type. The editor host (PR-06) owns the storage.
- [ ] **Generated registry unit** covering **all loaded manifests** (framework and
      project), so the palette can place any element: construct-by-name for classed
      elements, set-by-name thunks, draw-by-name for `draw=`-only elements. Thunks
      spell setter calls through WO9's value helper; draw entries use WO9's
      draw-argument helper. **No second spelling of either.**
- [ ] **Carried from WO5a — binding overloads.** A binding name may appear once per
      subject type. Set-by-name for a binding must dispatch on the subject's type, and
      the registry must not collapse `bind_text`'s `string` and `int` declarations into
      one entry.
- [ ] **Scene description JSON** from the same resolved, flattened model WO8
      produces (ui_spec §4.1 step 6): flat element list, resolved geometry and
      properties, parent table, realisation. Subjects are described, **values are
      not supplied** — the editor host supplies them.
- [ ] **Parity test:** a native C++ test compiled with `-DU8G2GL_EDITOR` builds the
      WO10 fixture from its scene description through the registry and renders it;
      the stub draw-call history must equal the firmware-generated fixture's.
- [ ] **Firmware pays nothing:** a check (e.g. `nm` on the firmware test binary)
      that no registry symbol is present without `U8G2GL_EDITOR`.

## Strict Boundary Box

**In scope:** new `include/u8g2gl/u8g2gl_editor.h` and its `src/` file if any;
`cli/src/core/generator/emit/` (editor units); `cli/src/node/cli.ts`
(`--target-kind firmware|editor` or equivalent flag, named by the worker);
`test/` (editor parity test, CMake); CLI tests; this WORKORDER.

**Do NOT touch:** the Wasm build (PR-06); sample data; shared helpers except to fix
a defect, disclosed; firmware emission output (the parity test is what guards it).

---

## Testing Requirement

- [ ] Construct a `u8g2gl_label` by name into provided storage, set `text` and
      `font` by name, render: same history as the firmware setter path.
- [ ] Draw a `u8g2gl_box` by name: same history as the firmware draw call.
- [ ] Parity test on the full fixture passes, and fails if a thunk is deliberately
      mis-spelled (prove it is not vacuous, then revert).
- [ ] Firmware binary contains no registry symbols.

## Verification Requirement

- [ ] C++ build zero warnings in both configurations; `ctest` all pass
- [ ] CLI tests, `tsc`, lint clean
- [ ] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Worker:** Tier-3, 2026-09-18/19. **Status `complete`.** Commits `61d6972` (was `6efa6fa` before the
PA's rebase onto `main` @ `ff20f0c`) and `7958d75`, plus this report. Not pushed, not tagged, no version
bumped (no schema change; the generator bump is WO12's).

### Authorization

Verified from committed artefacts, not the dispatch prompt: front matter `project: pr-04-generator`,
`status: dispatched`; `../PROJECT.md` "Human Approval" quotes the owner, *"Approved — proceed with the
twelve work orders, start WO1"*, at `2026-09-13T19:59:36Z`; the status log records WO11's re-dispatch.
Paused once at the coordinator's instruction for the rebase, then resumed on the rebased branch. The
rebase changed docs only; everything was rebuilt and re-run after it. `design_spec.md` @ `ff20f0c` was
read (§13.1, §13.4, §13.7, §13.12, the [D-20] amendment). Its three rulings (`ui_obj_` naming, styles
before properties, container-relative bound positions) are WO10b's and were **not** implemented. See
"Readiness for WO10b".

### Test counts — every figure from an uncontended run

| Suite | Before (`4a526d2`) | After (`7958d75`) |
|---|---|---|
| `npx vitest run` | 824, 54 files | **851**, 56 files, all pass |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` | clean | clean |
| `cmake --build build --clean-first` | 0 warnings | **0 warnings**, 102 translation units (both configurations; see below) |
| `ctest --test-dir build` | 315, 1 known skip | **336**, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |

**Both configurations, zero warnings each, under `-Wall -Wextra -Wpedantic`.**
- **Without `U8G2GL_EDITOR`:** `u8g2gl`, `u8g2gl_fixture_runtime` and the real-U8G2 target all compile
  `src/u8g2gl_editor.cpp` (it is now in `U8G2GL_RUNTIME_SOURCES`), and it compiles to an empty unit.
- **With `U8G2GL_EDITOR`:** the new `u8g2gl_editor_runtime` and `test_editor` targets, including the
  generated registry.
- **Checked by hand:** the generated `ui_editor_registry.cpp` and `src/u8g2gl_editor.cpp` compiled
  standalone *without* the define give 0 warnings, and `nm` lists only the assembler's `ltmp0`.

New tests: CLI +27 (19 in `emit-editor.test.ts`, 5 in `integration/generate-editor.test.ts`, 3 in
`compile-fixture.test.ts`). C++ +21 (13 `EditorRegistry.*`, 5 `EditorParity.*`, 3 `EditorSymbols.*`).

**At the base, honestly priced** (throwaway worktree `tmp/wo11-base` at the rebased dispatch commit
`0b6edf1`, since removed):
- **CLI: 5 behavioural, 22 trivial.** All 5 integration tests fail behaviourally: the base CLI runs and
  rejects `--target-kind`. The 19 `emit-editor` tests and the 3 new `compile-fixture` tests fail only
  because `screen-model.js` / `emitEditorFiles` do not exist there. (The copied `compile-fixture` file's
  4 existing tests are blocked by the same import, an artefact of the copy.)
- **C++: 0 behavioural, 18 trivial.** Both new test files fail to compile at the base
  (`unknown type name 'u8g2_stub_call'`, and `u8g2gl_editor.h` does not exist). The two "absent" `nm`
  guards would pass at the base (there is nothing to find); they are regression guards. The positive
  control fails trivially (no binary). The behavioural evidence for the C++ side is the non-vacuity
  proof below.

### What was built

- **`include/u8g2gl/u8g2gl_editor.h`, `src/u8g2gl_editor.cpp`**, entirely under `#ifdef U8G2GL_EDITOR`.
  - `u8g2gl_editor_value`: a value tagged with its §13.2 type. An enum or colour travels as its XML text,
    so no enumerator number crosses the boundary.
  - Entry types: class (tag, placement-construct, rectangle thunk, property and binding tables,
    `sizeof`/`alignof`), property, binding (per subject type), drawing (params in parameter order),
    directive (`bind` plus `clear`), flag.
  - By-name operations that check before calling a thunk: construct (refuses null, short or misaligned
    storage), set (type-checked), bind (dispatched on subject type), bind-flag, flag-clear (a draw call's
    guard term), draw (count and type checked).
  - Construction is `::new (storage) T()` into host storage; destruction goes through the virtual
    destructor, which releases pool slots. No heap anywhere.
- **Generated registry unit** (`emit/editor-registry.ts` → `ui_editor_registry.cpp`), covering every
  loaded manifest, framework and project:
  - classed elements get class entries (a project class includes `<tag>.hpp`, as screen units do);
  - drawing elements get draw entries;
  - composites get none (their container is the `u8g2gl_obj` entry);
  - plus the directive and flag tables.
  - Every thunk is a captureless lambda in a `const` table, so there are no generated names to collide.
  - **No second spelling:** each enum or colour branch is spelled with `cppValue(prop, value)`. Draw
    functions and argument order come from `drawFunctionOf()`, defaults from `cppValue(prop, default)`.
    The rectangle setter, class and header come from the screen model, flags from `BINDING_FLAGS` +
    `FLAG_ENUMERATOR_PATTERN`, and directives and their guard comparisons from `FLAG_COMPARISONS`.
- **Binding overloads:** effective `<bind>`s are one per (name, type), so `bind_text` string and int are
  two entries keyed by `U8G2GL_SUBJECT_*`, and `u8g2gl_editor_find_binding` selects by type.
  - Where the manifest declares `fmt=`, the thunk asks the compiler whether the overload takes a format
    (`u8g2gl_editor_bind_call`, a SFINAE-friendly generic lambda plus `if constexpr`). The string
    `bind_text`, which takes none, **refuses** a format rather than dropping it.
  - Where no `fmt=` is declared, a format is refused outright.
  - Tested in C++ and in the CLI.
- **Scene description** (`emit/scene.ts` → `ui_scene.json`, format version 1), built from the same
  realisation, resolution and placement as the firmware units:
  - `display`, `init` (step order), and `subjects` as name, type and `max_len` — **never a value**; the
    test host refuses a scene whose subjects carry one;
  - styles by the attribute and value they set, in firmware's applied order; fonts; images;
  - per screen: the object count, the parent table (`null` = no parent) and the elements in draw order.
    Objects carry class, index, parent, `rect` (a bound axis is 0, as firmware passes it), written
    properties, styles, overrides, bindings (with `fmt` exactly when firmware passes one) and flag
    directives (the `ref` typed as firmware types it). Draw calls carry their arguments (bound ones name
    a subject; absent ones are left to the registry default) and their guard terms.
- **One model, two backends.**
  - `emit/screen-model.ts` was extracted from `screen.ts`: placement, class/header, rectangle, written
    properties, named styles, overrides, flag comparison, and now `INIT_STEPS`.
  - `screen.ts` is firmware's spelling of those decisions; `scene.ts` is the editor's.
  - Firmware output is **byte-identical**: the WO9 goldens and the committed compile fixture regenerate
    unchanged, checked after every refactor step.
- **CLI:** `generate --target-kind firmware|editor` (default `firmware`).
  - `editor` writes the two editor files, by default into `<output dir>_editor`: a *sibling*, because the
    writer deletes stale GENERATED files anywhere beneath its directory, so a nested or shared directory
    would delete one target's output when the other runs.
  - It is emitted only from a build whose firmware emission succeeded, so it refuses exactly what
    firmware refuses and never describes a document `generate` rejects.
  - An unknown or missing kind is exit 2.
- **Fixture:** `test/generated_fixture/generated_editor/` is committed. `compile-fixture.test.ts` holds it
  byte-identical, and `refresh-goldens.mjs` refreshes it.

### Parity test, and proof it is not vacuous

`test_editor_parity.cpp` renders the committed fixture twice in one program: through the generated
firmware `ui_screen_<n>_render` functions, and through `test/editor_host/`. The host reads
`ui_scene.json`, owns its subjects (given the same values), constructs every object by name into its own
aligned arena, configures in the scene's `init` order and renders through `u8g2gl_render_object` and
draw-by-name. It knows no element, setter or draw function by name.

The U8G2 stub gained an **ordered call log** (op, integer args, pointer, copied text), so "same history"
means same calls in the same order with the same arguments. `same_call_log()` refuses an empty or
overflowed log, so two empty logs cannot pass. Four cases cover:
- home, with the icon shown and hidden;
- gauges, with the panel hidden, and with the panel shown, the blip guarded off and a changed level.

Each case also asserts content counts, so the comparison is known to cover real drawing. **Bound text is
asserted nowhere.**

**Non-vacuity, shown and reverted:**
1. Misspelled the label's `align="right"` thunk as `U8G2GL_ALIGN_LEFT` in the committed registry.
   `EditorParity.GaugesScreenWithThePanelShownAndTheBlipGuardedOff` failed through the named style:
   `call 11 differs: firmware: drawUTF8(60, 37, …) "Note" / editor: drawUTF8(0, 37, …) "Note"`.
   `EveryAlignValueMatchesItsFirmwareEnumerator` failed too.
2. Swapped the box draw thunk's width and height arguments. Both gauges parity cases failed
   (`firmware: drawBox(4, 20, 10, 6, …) / editor: drawBox(4, 20, 6, 10, …)`), as did both box unit tests.
3. Reverted from a saved copy; `git diff` clean on the registry; all 18 editor tests pass again.

### Firmware pays nothing — `nm`

Three CTest cases run `test/check_editor_symbols.cmake`. It matches nm *symbol lines* only, because an
archive listing names the empty `u8g2gl_editor.cpp.o` member. The pattern is `u8g2gl_editor|ui_editor`.
- `libu8g2gl.a`: **no symbol matches**.
- `test_generated_fixture` (the firmware fixture binary): **no symbol matches**.
- `test_editor` (positive control): **485 symbols match**.

### Testing Requirement, line by line

- **Label by name** (construct into provided storage, text and font by name, render) gives the same log
  as the firmware setter path: `LabelByNameDrawsWhatTheFirmwareSetterPathDraws`, plus all three `align`
  values.
- **Box by name** gives the same log as the firmware draw call: `BoxByNameDrawsWhatTheFirmwareDrawCallDraws`
  (defaults), `…TakesWrittenValuesOverDefaults`, and the circle segment.
- **Parity on the full fixture** passes and fails when a thunk is misspelled: above.
- **Firmware binary has no registry symbols:** above.

### Readiness for WO10b (rulings deferred to it)

- **Styles before properties:** now **one constant**. `INIT_STEPS` in `screen-model.ts` drives the
  firmware init layout and is emitted as the scene's `init`, which the host obeys. WO10b reorders one
  array, and both targets follow. This structural change was made now because it was small.
- **`ui_obj_` naming:** nothing to do on the editor side. The scene's `name` is realisation's
  identifier, so it follows whatever `mangle.ts` produces, and the registry and host name no objects.
- **Container-relative bound positions: recorded, not changed.**
  - Draw calls: the bound argument source is one place (`drawArgumentSources` 'bound'), shared by both
    targets. The scene's bound argument can gain an `origin` field additively (bump
    `SCENE_FORMAT_VERSION`).
  - Objects: the runtime's `bind_x/y` take no offset, so the registry's bind thunk signature
    `(obj, subject, fmt)` has nowhere to pass one. WO10b's runtime shape decides it, and the thunk
    signature follows.

### Decisions I made

1. **Decision logic extracted into `screen-model.ts`** rather than exported piecemeal from `screen.ts`,
   so the editor and firmware backends are equal consumers.
2. **Enum/colour values cross as text, matched by generated branches**, not as enumerator numbers. The
   CLI cannot know an enumerator's value without a second copy of the runtime's headers.
3. **Styles are applied through the element's own property thunks, by attribute name**, not by building
   `u8g2gl_style` objects in the host.
   - This is how firmware already applies `style_*` overrides. A style's `merge_from` and the matching
     setters leave the same resolved style for every property both set.
   - The parity test proves it for the fixture's named style.
   - See finding 3 for the gap it exposes.
4. **Draw-prop defaults naming a generated symbol (font, image, style) are treated as required** in draw
   thunks. The editor build does not link a project's `ui_*` symbols. No framework drawing manifest has
   such a default.
5. **Subject-typed setter props are left out** of the registry, with a comment. No class manifest
   declares one, and the setter's parameter type cannot be spelled from the manifest.
6. **The parity binary runs the firmware units on the editor runtime** (`U8G2GL_EDITOR`, default
   capacities) in one process, so both paths share one stub and one runtime.
   - The fixture's exact pool cannot hold the editor's bindings as well.
   - The capacity macros are read only in `src/u8g2gl_obj.cpp`, which no generated unit compiles, so
     there is no ODR hazard. This is documented in `test/CMakeLists.txt` and in the test header.
7. **The test host builds once per instance** (finding 1).

### Disclosed edits outside the obvious box (all behaviour-preserving, proven by the goldens)

- **Shared helpers:**
  - `draw-args.ts`: `drawFunctionOf()`, `drawArgumentSources()` and `bindingFor()` extracted.
    `drawCallFor()` and `boundValueFor()` now use them. This gives one precedence rule (bound, written,
    default), which `screen.ts`'s missing-argument check also uses now instead of restating it.
  - `value.ts`: exports `COLOR_VALUES` (the keys of its existing colour table).
  - `styles.ts` (emit/, not one of the three named helpers): an `attribute` field per style property, and
    `styleProperties()`.
- **Root `CMakeLists.txt`:** `src/u8g2gl_editor.cpp` added to `U8G2GL_RUNTIME_SOURCES`; empty in
  firmware.
- **`test/stubs/U8G2lib.h`:** the ordered call log, recording only, with no signature changed. It adds
  about 9 KB per `U8G2` instance (128 entries).
- **Not touched:** `generate.ts` (the CLI composes firmware generation and editor emission itself),
  `docs/`, `PROGRAM*.md`, manifests, validator, resolver, realisation, and firmware emission output.

### Out-of-scope findings (not fixed, not filed)

1. **For PR-06: the runtime cannot remove a subject observer.** Destroying an object frees its pool
   slots, and inactive slots are ignored, but the subject's observer entries remain. An editor host that
   rebuilds a scene on every edit (ui_spec §4.1) against long-lived subjects exhausts each subject's
   `_n<N>` observer capacity after N rebuilds. If a freed pool slot is reused, a stale observer on the
   old subject also fires for the new binding. The test host sidesteps this with one build per host.
   PR-06 needs `remove_observer()`, or subjects rebuilt with the scene.
2. **`ui_scene.json` cannot carry the GENERATED marker** (JSON has no comments), so the writer will never
   delete a stale one. It is mitigated by the fixed file name. If per-screen scene files are ever
   emitted, this becomes real.
3. **A named style's `font_mode` cannot be applied by the editor to a label, button, clock and so on.**
   `u8g2gl_obj.xml` declares no `font_mode` or `bitmap_mode` prop, although `u8g2gl_obj` has both
   setters (`bitmap_mode` is declared only on `u8g2gl_xbm`). Firmware applies them through
   `apply_style()`. The editor host refuses loudly ("has no property 'font_mode' to apply") rather than
   drawing differently. Declaring both props on `u8g2gl_obj.xml` closes it (manifest data, [D-17]).
4. **`styles.ts` spells enumerators without `cppValue()`.** It uses `U8G2GL_ALIGN_${upper}` and its own
   `DRAW_COLORS` table, a second spelling from WO9. The editor path uses `cppValue()`. The parity test
   holds the two to agreement only for what the fixture uses (`align`).
5. **§13.1 / §13.7 do not name the editor target's files** (`ui_editor_registry.cpp`, `ui_scene.json`),
   the scene format, or how `generate` selects the target (`--target-kind`). This is for the Chief
   Architect with the other §13.7 file-list items.
6. **`ui_editor_registry` is not in `mangle.ts`'s collision table.** No generated family can produce it
   today (every family is `ui_<kind>_…` and no kind is `editor`), but it belongs with WO11b's
   screen-descriptor collision work.
7. **Editor capacities:** `u8g2gl_editor_runtime` uses `u8g2gl_config.h`'s defaults (a 256-slot pool).
   An editor constructs scenes no document counted, so PR-06 must decide the Wasm build's capacities;
   [D-21]'s generated figures do not apply to it.
8. **Narrowing in thunks:** `int` props reach narrower setter parameters (`set_scroll_px_per_sec(uint8_t)`,
   `set_glyph(uint16_t)`) by the same implicit conversion firmware's literals take. An out-of-range editor
   value wraps silently where the validator would have rejected the literal. The PR-06 host should
   validate before calling.

### Diff boundary

`git diff --name-only 0b6edf1..HEAD` (the rebased dispatch commit). The `.agents/…` and
`docs/design_spec.md` entries are the PA's `134c218`; no worker commit touches `docs/`, `.agents/` or
`PROGRAM*.md`:

```
.agents/skills/principal-architect-workspace/pr-04-generator/BRIDGE-PR04-CHECKPOINT.md
.agents/skills/principal-architect-workspace/pr-04-generator/PROJECT.md
.agents/skills/principal-architect-workspace/pr-04-generator/wo10b-bound-text/WORKORDER.md
.agents/skills/principal-architect-workspace/pr-04-generator/wo11b-validator-hardening/WORKORDER.md
CMakeLists.txt
cli/src/core/generator/emit/draw-args.ts
cli/src/core/generator/emit/editor-registry.ts
cli/src/core/generator/emit/index.ts
cli/src/core/generator/emit/scene.ts
cli/src/core/generator/emit/screen-model.ts
cli/src/core/generator/emit/screen.ts
cli/src/core/generator/emit/styles.ts
cli/src/core/generator/emit/value.ts
cli/src/node/cli.ts
cli/test/generator/compile-fixture.test.ts
cli/test/generator/emit-editor.test.ts
cli/test/generator/refresh-goldens.mjs
cli/test/integration/generate-editor.test.ts
docs/design_spec.md
include/u8g2gl/u8g2gl_editor.h
src/u8g2gl_editor.cpp
test/CMakeLists.txt
test/check_editor_symbols.cmake
test/editor_host/call_log.h
test/editor_host/editor_host.cpp
test/editor_host/editor_host.h
test/editor_host/scene_json.cpp
test/editor_host/scene_json.h
test/generated_fixture/generated_editor/ui_editor_registry.cpp
test/generated_fixture/generated_editor/ui_scene.json
test/stubs/U8G2lib.h
test/test_editor.cpp
test/test_editor_parity.cpp
```

`git diff --name-only 4a526d2..HEAD` (the pre-rebase dispatch commit) is the same worker file set plus
what `main` brought in with the rebase: `.agents/…/PROGRAM.md`, `docs/concept.md`,
`docs/decisions/d20-bindable-geometry.md`, `docs/ui_spec.md`, and `.agents/…` and
`docs/design_spec.md` as above. This WORKORDER is added by the report commit. Scratch files live in
`tmp/wo11/` (git-ignored); the base worktree was removed.
