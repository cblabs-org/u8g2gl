---
work_order: WO10
project: pr-04-generator
title: "Firmware emission: screens, and the compile layer"
branch: u8g2gl-generator/wo10-emit-screens
base: u8g2gl-generator/wo9-emit-project
complexity: standard
status: complete
---

# WO10 — Screen emission and compile layer

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo10-emit-screens`
**Base**: `u8g2gl-generator/wo9-emit-project`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill, both languages. Generated C++ compiles with zero
warnings under `-Wall -Wextra -Wpedantic`.

## Design authority

design_spec §12.4 (corrected: `uint32_t` tick), §13.3, §13.5, §13.7, §13.8,
§13.12 (corrected: composite container is `u8g2gl_obj`), §17.1; [D-21] §4.
Where this work order and the spec disagree, **stop and report**.

---

## Objective

Emit each screen's translation unit, and prove the output compiles and behaves by
building it in the C++ test suite.

## Do these first — three manifest fixes, or you cannot emit

WO9 emits the project-level units and the two shared helpers (`emit/value.ts`,
`emit/draw-args.ts`). **Spell every setter call and draw argument through them**; that single
spelling is what WO11's parity test holds firmware and the editor to. WO9 also surfaced three
blockers:

- [x] **`segments` has no `emit=`, so a circle or ellipse cannot be emitted at all.** Add
      `emit="U8G2GL_DRAW_SEGMENT_{VALUE^^}"` to the `segments` prop in
      `include/u8g2gl/manifests/u8g2gl_circle.xml` and `u8g2gl_ellipse.xml`, and rebuild the
      bundle (`npm run build:manifests` in `cli/`). The runtime's `u8g2gl_draw_segment_t`
      (`include/u8g2gl/u8g2gl_draw.h`) spells `U8G2GL_DRAW_SEGMENT_UPPER_RIGHT`, `_UPPER_LEFT`,
      `_LOWER_LEFT`, `_LOWER_RIGHT`, `_ALL`. Its values mirror U8G2's `U8G2_DRAW_*` option
      bits — **do not renumber them**, and do not add an enumerator the header lacks. A test
      must emit a circle with a non-default segment.
- [x] **Drawing manifests over-require geometry (PA decision).** Every drawing manifest marks
      `x`, `y`, `width`, `height` `required="true"`, so §6.2's and §8.4's own examples —
      `<u8g2gl_box … bind_width="level" />` with no `width`, and anchor-positioned drawing
      elements — cannot validate. Drop `required` from geometry a **binding or an anchor** can
      supply, on every drawing manifest, and rebuild the bundle. This is manifest data
      ([D-17]), not schema vocabulary: WO7b's "every element fully positioned" rule already
      makes a genuinely missing position an error, so nothing is weakened. Tests: §8.4's
      bound-width box validates and emits; a box with no width and no binding still fails.
- [x] **`<bind_flag_if_*>` with `subject="$p"` at screen level is silent.** WO8a's carry closed
      the attribute form only. At screen level there is nothing to substitute, so it is an
      error, with the same code that form already uses.

## Line-Item Instructions

- [x] **Per-screen `.cpp`:** static objects in array order (composite containers as
      `u8g2gl_obj`); `objs[]` and `parents[]`; the `u8g2gl_screen` descriptor.
- [x] **`init`** in the §13.7 order: construct → set properties → apply styles →
      register bindings → (events and focus refused in PR-04). Bindings last.
      Setter calls through WO9's value helper only.
- [x] **`tick`** returns the minimum deadline across objects (`u8g2gl_min`).
- [x] **`render`** in document order: objects via WO4's `u8g2gl_render_object`;
      draw-call elements as calls through WO9's draw-argument helper, guarded by
      WO8's build-time visibility conjunction, with bound values read from the
      subject at draw time. Adjacent siblings sharing an identical guard may be
      hoisted; **never reorder**.
- [x] **Frame-dirty observers** registered once per subject that draw-call bindings
      read (§13.5), using WO4's `u8g2gl_frame_dirty_observer`.
- [x] **Carried from WO4 — F7:** objects render through
      `u8g2gl_render_object(d, objs, parents, i)`, **never** `obj.render(d)` directly
      as design_spec §13.12's example still shows. A direct call skips effective
      visibility and clipping, so a hidden object would draw. A test with a hidden
      object proves the generated code does not.
- [x] **Carried from WO5a — binding overloads.** Emit each binding from the declaration
      whose `type` matches the bound subject (`bind_text` exists for `string` and `int`),
      using WO8's recorded choice rather than re-selecting by name.
- [x] **Carried from WO4 — F5, the proof:** the compiled fixture's binding pool is the
      *generated* capacity, not the default — asserted from a translation unit inside
      the library build, not only from generated code.
- [x] **Generated code ignores `add_binding` returns** — capacities are exact
      ([D-21] §4) — and a `static_assert` in the fixture build proves the pool
      equals the counted total.
- [x] **Compile layer:** commit a generated fixture project under `test/` and add
      it to the C++ test build. A C++ test runs `ui_init`, sets subjects, ticks,
      renders, and asserts stub draw-call history and dirty gating. A CLI test fails
      if regenerating that fixture changes the committed files.

## Strict Boundary Box

**In scope:** `cli/src/core/generator/emit/` (screen units); `include/u8g2gl/manifests/*.xml`
and `cli/src/data/manifests.json` (the two manifest fixes above only);
`cli/src/core/validator/` (the `<bind_flag_if_*>` `$p` gap only); `test/` (generated
fixture, new C++ test, `test/CMakeLists.txt`, and the `-include` integration WO9 designed);
CLI tests; this WORKORDER.

**Do NOT touch:** runtime sources (a runtime gap is a **stop and report** — WO4
owned that surface); editor emission (WO11); shared helpers except to fix a defect,
disclosed.

---

## Testing Requirement

- [x] §13.12's example generates, compiles and renders; `rule` is a bare draw call.
- [x] A static screen changing a subject redraws once and then idles
      (`U8G2GL_IDLE`).
- [x] A draw-call element under a hidden composite does not draw.
- [x] Regenerating the committed fixture is an empty diff.

## Verification Requirement

- [x] C++ build zero warnings, including generated code; `ctest` all pass
- [x] CLI tests, `tsc`, lint clean
- [ ] Diff limited to the Boundary Box — **one disclosed excursion**: `cli/src/core/generator/generate.ts` (wiring only, +12/−6 including its doc comment; see the Completion Report)

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Worker:** Tier-3, 2026-09-18. **Status `complete`**, with **two stop-and-reports recorded,
not chosen** (below) and one disclosed boundary excursion (`generate.ts`). Implementation commit
`3a58ab3`. Not pushed, not tagged, no version bumped (no schema change; the generator bump is
WO12's).

### Authorization

Verified from committed artifacts, not from the dispatch prompt: front matter names
`project: pr-04-generator` and read `status: dispatched`; `../PROJECT.md` "Human Approval" quotes
the owner, *"Approved — proceed with the twelve work orders, start WO1"*, at `2026-09-13T19:59:36Z`;
its status log records WO10 dispatched on this branch. Base `d92d906`, clean tree.

This session was cut off by an API usage limit almost immediately and resumed from the start with
nothing modified; the coordinator's resume message relayed no approval, and none was relied on.

### Test counts — every figure from an uncontended run

| Suite | Before (`d92d906`) | After (`3a58ab3`) |
|---|---|---|
| `npx vitest run` | 776, 51 files | **824**, 54 files, all pass |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` (eslint + test type-check) | clean | clean |
| `cmake --build build` | 0 warnings | **0 warnings** on `--clean-first`, all 72 TUs recompiled, generated units included |
| `ctest --test-dir build` | 305, 1 known skip | **315**, same skip (`SizeOfReport.ThirtyTwoBitTarget`) |

Each suite was run alone. The baseline 776 was re-measured after the manifest fixes and before any
emission code (still 776).

### The three manifest fixes, and what each unblocked

| Fix | Change | Unblocked |
|---|---|---|
| **`segments` `emit=`** | `emit="U8G2GL_DRAW_SEGMENT_{VALUE^^}"` on `u8g2gl_circle.xml` and `u8g2gl_ellipse.xml`; bundle rebuilt. `values=` already matched the runtime's five enumerators, so nothing was renumbered or added | Any circle or ellipse emits. The fixture's `dial` (`segments="upper_left"`) compiles, and the C++ test asserts U8G2 receives option `0x02` |
| **Geometry not over-required** | `required="true"` dropped from `x`/`y`/`width`/`height` on box, circle, ellipse, hline, vline and pixel. Every one of those props has a matching `<bind>`, and the box is anchorable. Line/triangle endpoints and all radii **stay required**: nothing else can supply them | §8.4's `<u8g2gl_box … bind_width="level">` with no `width` validates and emits (it is the fixture's `level_bar`); `right="0" width="8"` on a box validates. **But see stop-and-report 2** |
| **`<bind_flag_if_*> subject="$p"` at screen level** | `screenLevelPlaceholders()` in `validate-references.ts` now walks directive children too, raising the attribute form's `U8G2GL_UNSUBSTITUTED_PROP` | Realisation can no longer silently drop a flag binding on a subject called `$p`. The control inside a composite still validates |

`manifest-fixes.test.ts` holds each fix beside its control (11 tests).

### What a screen unit contains (`emit/screen.ts`)

In order, each drawn from realisation (WO8b) and the resolver, never recomputed:

1. **Includes**: `ui.hpp`, then the sorted widget headers the objects need, plus `u8g2gl_draw.h`
   when there is a draw call. A framework class uses `u8g2gl/<tag>.h`. A project class uses
   `<tag>.hpp` (§6.5's layout). A composite container uses `u8g2gl/u8g2gl_obj.h`.
2. **Static objects** in `RealisedScreen.objects` order. The class is the tag ([D-12]); a
   composite's container is `u8g2gl_obj` (§13.12, corrected). Each has a comment giving its index,
   whether it is a composite container, and its parent. A comment names each draw-call element
   that has no object.
3. **`ui_screen_<n>_objs[]` / `ui_screen_<n>_parents[]`**, one entry per line, with
   `U8G2GL_NO_PARENT` spelled out. A screen with no objects emits no arrays, because a
   zero-length array is ill-formed.
4. **`init`** with the four §13.7 steps as numbered comments:
   - **Set properties**: one `set_coords(x, y, w, h)` per object, then every *written* setter prop
     in manifest order, spelled through `cppValue()`. Defaults are not restated. A composite's own
     `<api>` props are template parameters and are skipped.
   - **Apply styles**: `style=`, then `<style>` children, then `style_*` overrides (§10 calls them
     overrides).
   - **Register bindings**, last. Each uses the method of the overload realisation chose.
5. **`activate` / `deactivate`**: empty, with the reason in a comment (events and focus are
   PR-09, and `u8g2gl_set_active_screen` already marks the screen dirty).
6. **`tick`**: `U8G2GL_IDLE` folded through `u8g2gl_min` over **every** object.
7. **`render`**: `realised.drawOrder`, objects and draw calls interleaved in document order.
8. **`u8g2gl_screen ui_screen_<n>`**, the descriptor `ui_handler()` drives. `ui.hpp` now declares it
   `extern` beside the screen's five functions; without that, a screen could be initialised but
   never shown.

The fixture's `gauges` render function, verbatim:

```cpp
void ui_screen_gauges_render(U8G2& display) {
    // Every object goes through u8g2gl_render_object(), never obj.render(): …
    u8g2gl_draw_box(display, 4, 20, ui_subject_level.get(), 6, true, 0);  // level_bar: no object (§13.5)
    u8g2gl_draw_circle(display, 100, 40, 10, false, U8G2GL_DRAW_SEGMENT_UPPER_LEFT);  // dial: no object (§13.5)
    u8g2gl_render_object(display, ui_screen_gauges_objs, ui_screen_gauges_parents, 0);  // panel
    if (!panel.is_hidden()) {
        u8g2gl_draw_hline(display, 0, 30, 60);  // panel_edge: no object (§13.5)
    }
    u8g2gl_render_object(display, ui_screen_gauges_objs, ui_screen_gauges_parents, 1);  // panel_note
    u8g2gl_render_object(display, ui_screen_gauges_objs, ui_screen_gauges_parents, 2);  // ghost
    if (ui_subject_wifi_connected.get() != false) {
        u8g2gl_draw_pixel(display, 120, 2);  // blip: no object (§13.5)
    }
}
```

**Hoisting.** Adjacent draw calls whose guard text is identical share one `if`, and nothing is ever
moved to create a pair. `emit-screen.test.ts` pins both: two adjacent `hline`s under a hidden
composite share one block, and a third with the same guard, separated from them by an object,
gets its own block after that object.

### How bindings are emitted

- **Attribute bindings** call `binding.declaration.setter`, the overload realisation recorded for
  the subject's type (WO5a finding 4). Emission never looks bindings up by name. The subject is
  `cppValue({type:'subject'})`. A format is passed only when the chosen declaration names a `fmt`
  attribute and the author wrote it: `n.bind_text(&ui_subject_count, "%d trains");` beside
  `s.bind_text(&ui_subject_station_name);`. A missing declaration throws, because Pass 5 refuses
  that document.
- **Flag directives** call the directive's method: `obj.bind_flag_if_eq(&subj, <ref>, U8G2GL_FLAG_<FLAG>)`.
  `ref` goes through `cppValue`: as a `bool` for `true`/`false` on a bool subject, otherwise as an
  `int`. The flag is spelled through `cppEnumerator`. A small table (`FLAG_COMPARISONS`) mirrors
  the runtime's overload set: eq/not_eq for int and bool, gt/lt for int only. It also gives the
  "flag is clear" comparison a draw-time guard needs (`!=`, `==`, `<=`, `>=`).
- **Return values are ignored** ([D-21] §4), with the reason in a comment beside the registrations.
- **Frame-dirty observers** are in the new **`ui.cpp`** (`emit/ui-init.ts`), not a screen unit. The
  observer is per subject, not per screen, and registering it in each screen that reads the subject
  would overrun the `_n<N>` WO8b counted with exactly one. The subjects are read from
  `Capacities.subjects[].frameDirty`, so what is registered is what was counted.
  `ui_init()` runs: `ui_subjects_init()`, `ui_styles_init()`, every screen's `init` in document
  order, then `ui_subject_<s>.add_observer(nullptr, u8g2gl_frame_dirty_observer);`. A test puts
  `level` under three draw calls on two screens and gets exactly one registration and `_n<1>`.

### Build-time ancestor visibility

`RealisedElement.visibility` is spelled term by term, outermost ancestor first, then the element's
own bound `hidden` flags, in the order realisation recorded them:

- `ancestor_visible` → `!<identifier>.is_hidden()`;
- `flag_clear` → `ui_subject_<s>.get() <clear-comparison> <ref>`.

`is_hidden()` reads only the object's own flag, but the conjunction holds one term per ancestor
object, so together it is the effective visibility the runtime walk would compute. Objects never
use this path: `u8g2gl_render_object` walks the parent table itself.

### Absolute coordinates — a decision the fixture forced

The resolver settles coordinates **relative to the container** (§13.6 step 4, and every bounds
message is worded that way). The runtime takes **absolute** ones: `set_coords()` says so, and
`u8g2gl_effective_clip()` intersects an object's stored bounds with its ancestors'. §13.12 cannot
show the difference because `bar` sits at the origin. `emit/placement.ts` translates: a
container's settled corner is added to each child's *position* (`x`, `y`, endpoints); lengths
(width, height, radii) are unchanged. It is a separate module so WO11 calls the same function. The
fixture's `panel` at (0, 30) proves it: its `edge` draws at y=30 and its `note` at (0, 32). A
container positioned by a binding has no absolute origin at build time, so its children are refused
with `U8G2GL_UNRESOLVED_GEOMETRY` rather than placed at a guessed 0.

### How the generated capacities reach the library's compilation, and the proof

This is WO9's design, applied as written. `test/CMakeLists.txt` compiles the runtime a second time
as **`u8g2gl_fixture_runtime`** from the same `U8G2GL_RUNTIME_SOURCES`, with
`target_compile_options(… PUBLIC "SHELL:-include …/u8g2gl_generated_config.h")`. That is the form
the generated header documents for CMake. `SHELL:` is needed because CMake de-duplicates a
repeated `-include` and would pass the header as an input file. PUBLIC means the generated units
and the test see the same values the library does. The fixture test links this library and never
`u8g2gl`.

Three proofs, the first from inside the library build:

1. **`support/capacity_probe.cpp` is compiled into `u8g2gl_fixture_runtime` beside `u8g2gl_obj.cpp`**
   and `static_assert`s `U8G2GL_MAX_TOTAL_BINDINGS == 5` and `U8G2GL_MAX_BINDINGS_PER_OBJ == 1`.
   Five is a hand count, written line by line in the file (home 4, gauges 1; the draw calls take
   no slot), held against the generator's count. **Shown to discriminate:** with the forced
   include removed from the library target, in a throwaway build directory, the library fails to
   compile with `static assertion failed due to requirement '(32 * 8) == 5'` and `'8 == 1'`. The
   CMake file was then restored.
2. At run time, `CapacitiesReachTheRuntimeLibrarysOwnCompilation` reads the macros *through the
   probe*, and so as the library saw them: 5, 1, 5, and not the default 256.
3. Behaviourally, through the library's own pool: after `ui_init()`, a fresh object binding a
   subject that has room gets `bind_x() == false`. The pool is exactly full. With the default
   pool of 256 this bind would succeed.

### What the C++ fixture test exercises (`test/test_generated_fixture.cpp`, 10 tests)

The fixture (`test/generated_fixture/`) is §13.12's XML verbatim, except for the fonts (BDF is
refused until PR-04b), together with §6.4's `status_bar`. A second, static screen `gauges` holds:
§8.4's bound-width box, a circle with a non-default segment, a `panel` composite (one draw-call
child and one object child) hidden through a bool flag binding, a label with `hidden="true"`, and
a pixel with a bound hidden flag. The target is 128×64 because that is what the U8G2 stub
reports, and the runtime clamps every clip to it. §13.12 at its own 256-wide target is asserted
line for line in `emit-screen.test.ts`.

Draw-call history asserted from the stub:

- **§13.12 renders through the wrapper**: one clear, one send, **5 `setClipWindow` + 5
  `setMaxClipWindow`** (a direct `obj.render()` sets none), `rule` = `drawHLine(0, 11, 128)` exactly
  once, the XBM drawn once, and the last clip = msg's bounds `(0, 16, 128, 28)`.
- **A flag binding hides an object**: after `ui_set_wifi_connected(false)` the frame sends, no XBM
  is drawn, and there are 4 clips.
- **Static screen, redraw once, then idle**: the first frame draws box width 10. The next
  `ui_handler` returns `U8G2GL_IDLE` with no send. `ui_set_level(30)` triggers one send (width 30)
  and `U8G2GL_IDLE`, then idle again. Re-setting 30 is not a change. `level` is read only by a
  draw call, so the frame-dirty observer is the only thing that could have scheduled that frame.
- **Hidden container**: no `drawHLine` and no `drawUTF8` at all. The control: after
  `ui_set_show_panel(true)`, `drawHLine(0, 30, 60)` and exactly one text, `"Note"`.
- **Hidden object**: with the panel shown, exactly one text is drawn, and it is `"Note"`, never
  `"Ghost"`. **Shown to discriminate:** replacing ghost's render line in the generated unit with
  `ghost.render(display);` made both hidden tests fail (`"Ghost"`, 2 texts). The file was then
  restored and the regeneration test confirms it is byte-identical.
- **A draw call with a bound hidden flag**: the pixel is drawn at (120, 2) while connected and not
  drawn when disconnected.
- **Circle segment**: `drawCircle(100, 40, 10, option = U8G2GL_DRAW_SEGMENT_UPPER_LEFT)`.

§13.12's `msg` text is deliberately **not** asserted. See stop-and-report 1.

### Byte-identical regeneration

- `cli/test/generator/compile-fixture.test.ts` regenerates `test/generated_fixture/` through the
  core API, with the fixed `0.0.0-golden` stamp, and asserts that the file set and every byte equal
  what is committed. It also runs a second time and compares.
- End to end through the built CLI: two `generate --out` runs `diff -r` clean, and `--check`
  exits 0. The real CLI's output differs from the committed fixture only in the `// generator:`
  stamp line.
- `refresh-goldens.mjs` now refreshes both the WO9 goldens and this fixture. It has no update flag,
  as before.

### Decisions I made

1. **A new project unit, `ui.cpp`**, holds `ui_init()` and the frame-dirty observers. `ui_init()`
   has to know every screen, and the observers belong to the project (reasoning above). It is
   emitted after `ui_images.cpp` and before the screens.
2. **The descriptor is named `ui_screen_<name>`**, defined in the screen unit and declared in
   `ui.hpp` (`screenDescriptorIdentifier()` in `ui-hpp.ts`). See finding 5 for the collision gap.
3. **Coordinates are translated to absolute in emission** (`placement.ts`), as described above.
4. **Two shared-helper exports, behaviour unchanged**: `resolvedLiteralFor` and `boundValueFor` in
   `draw-args.ts` are now exported. Object setters read their literals exactly as draw calls do,
   and the emission pre-check needs the helper's own "is this bound" rule. A second copy of either
   is the duplication PROJECT.md's sharing decision forbids.
5. **Every object is ticked.** §13.12's example ticks three of its five objects. [D-18] removed
   `animated`, so no manifest says which objects animate, and the base `tick()` returns
   `U8G2GL_IDLE`. The cost is a virtual call per static object per loop.
6. **Only written props are emitted**, not defaults: §13.7 guarantees a default-constructed object
   already holds them, and §13.12 emits the same way.
7. **A bound rectangle axis with no literal** is passed as `0` to `set_coords`, with a comment,
   because the binding applies the subject's value when it is registered
   (`add_value_binding` step 4). Any other missing axis throws.
8. **Emission refuses, as diagnostics, the defects no pass catches** (findings 8–10):
   - a flag directive with no `ref_value` (`MISSING_REQUIRED`);
   - a comparison the runtime has no overload for (`TYPE_MISMATCH`);
   - an unknown `style_*` key (`UNKNOWN_ATTRIBUTE`) or an unspellable `style_*` value
     (`TYPE_MISMATCH`);
   - a style on a draw-call element (`UNKNOWN_ATTRIBUTE`);
   - a drawing element whose size nothing supplies (`MISSING_REQUIRED`; stop-and-report 2).

   Each has a test.
9. **The fixture's fonts unit is compiled as its own object library** with a correctly-cased
   `U8g2lib.h` shim first on its include path. `fixture_u8g2_fonts.h` is forced in to declare the
   two font tables the stub lacks. The generated `#include <U8g2lib.h>` is correct for real U8G2 and
   was not changed (finding 7).

### Stop-and-reports (recorded, not chosen)

1. **Runtime gap: a label never draws a bound string subject.** `u8g2gl_obj::bind_text(string*)`
   registers an observer that marks the object dirty. But `u8g2gl_label::render()` draws only
   `text_`, which only `set_text()` assigns, and nothing in `src/` reads `get_bound_text_subject()`.
   So §13.12's `msg` and `bar_location` draw nothing on a device, whatever the generator emits.
   The generated binding calls are correct (`bar_location.bind_text(&ui_subject_station_name);`).
   The C++ test does not assert bound text and says why in a comment. Runtime is WO4's surface, so
   this was not fixed.
2. **The WORKORDER's premise for fix 2 does not hold.** It says WO7b's "every element fully
   positioned" rule already makes a genuinely missing position an error. It does not for a
   *size*: the rule reports an under-determined start (`width` with no `x`), not an absent size.
   So once `required` is gone, `<u8g2gl_box x="4" y="20" height="6" />` (no width, no binding)
   **validates**. Emission would then have thrown. `generate` now refuses it with a located
   `U8G2GL_MISSING_REQUIRED` ("it is not written, no anchor settles it, and no binding supplies
   it"), but `validate` passing a document `generate` refuses breaks decision 1's journey split.
   The fix belongs in the validator: a `draw=` prop with no default must be written, anchored or
   bound. The validator is outside this box beyond the `$p` gap. `manifest-fixes.test.ts` pins the
   current `validate` behaviour so the fix is visible when it lands.

### Out-of-scope findings (not fixed, not filed)

1. **The manifest parser invents `setter="set_<name>"`** for any prop with neither `setter=` nor
   `draw=` (`parse-widget-manifest.ts:139`), including a composite's template parameters. Emission
   filters them. Without the filter, §13.12 emitted `bar.set_title_subject(…)`.
2. **A bound axis inside an offset container is absolute, not relative.** `bind_x` on an object
   sets an absolute x, and a draw call reads the subject as-is. The spec says nothing about
   whether a subject driving a child's position is relative to its container.
3. **A bound container moves without its children** ([D-20]): children are placed at the
   container's *written* position. §8.4 forbids anchored children of a bound container, but not
   absolute ones.
4. **§13.7's file list** has neither `ui.cpp` nor WO9's styles unit.
5. **The screen descriptor is not in `mangle.ts`'s collision table.** Screen `a`'s table
   `ui_screen_a_objs` and screen `a_objs`'s descriptor `ui_screen_a_objs` would collide
   undetected; so would screen `home`'s `ui_screen_home_init` and screen `home_init`'s descriptor.
6. **§13.4 checks C++ keywords, not C library globals.** An element named `clock` emits
   `static u8g2gl_clock clock;` (the WO9 golden has one), which conflicts with `clock()` wherever
   `<time.h>` is visible. `time`, `abs` and others likewise.
7. **The host stub is misnamed `U8G2lib.h`**; real U8G2 is `U8g2lib.h`. The runtime copes with
   `__has_include` ladders. Generated code uses the real spelling, which on a case-sensitive
   filesystem cannot find the stub at all.
8. **`style_*` overrides are never validated** except `style_font`.
9. **Flag directives are under-validated**: `ref_value` is optional; string or time subjects,
   gt/lt on a bool subject, and an unknown `bind_flag_if_*` suffix all validate.
10. **`bind_text_fmt` on a string subject validates** (`%s` passes Pass 5), but the runtime's string
    `bind_text` takes no format, so the emitted call would not compile. Emission does not guard
    this.
11. **A literal `hidden` on a drawing element is `U8G2GL_UNKNOWN_ATTRIBUTE`** (drawing manifests
    declare no `hidden` prop). WO3's PA decision says `hidden` applies to every element, as an
    object flag or a draw-time guard. Only the bound form works today.
12. **Style precedence follows §13.7 literally.** Properties are set first and styles applied
    after, so a named style's `font` overrides an element's own written `font=`. That is the
    spec's order; it may not be the intended precedence.
13. **`.vite/`** appeared as an ignored directory at the repository root. It is not mine and was
    left alone.

### Existing tests changed, and why

- `generator/generate.test.ts`, `generator/emit-golden.test.ts`, `integration/generate.test.ts`:
  the file list gains `ui.cpp`.
- `integration/generate.test.ts`: the screen unit is now asserted to *start with* the exact stamp
  and to contain its render function, rather than to *be* only the stamp. WO10 is what fills it.
- WO9 goldens refreshed: `ui.hpp` gains the descriptor declaration; `ui.cpp` added;
  `ui_screen_home.cpp` filled. Every refreshed line was read.

No test was weakened. The WO8a expansion counter and WO8c's second-count and prefix-list source
scans are untouched and pass. No second count, capacity, expansion or resolution was added.

### Diff boundary

`git diff --name-only d92d906..HEAD`:

- `cli/src/core/generator/emit/`: **new** `screen.ts`, `ui-init.ts`, `placement.ts`; changed
  `index.ts`, `ui-hpp.ts`, `draw-args.ts` (two exports, disclosed above)
- `cli/src/core/generator/generate.ts`: **the one excursion**. Emission is now handed
  `realisation.screens`, `pipeline.resolution.screens` and `input.manifests`, the model this
  function already held. Without it no screen unit can be emitted. +12/−6, including the file's
  Description paragraph updated to say WO10 emits the screens.
- `cli/src/core/validator/validate-references.ts` (the `$p` directive gap only)
- `include/u8g2gl/manifests/`: box, circle, ellipse, hline, pixel, vline; and
  `cli/src/data/manifests.json` (rebuilt)
- CLI tests: new `emit-screen`, `compile-fixture`, `manifest-fixes`; changed `generate`,
  `emit-golden`, `integration/generate`, `refresh-goldens.mjs`, the WO9 goldens
- `test/CMakeLists.txt`, `test/test_generated_fixture.cpp`, and `test/generated_fixture/`
  (project XML, asset, committed `generated/`, `support/`)
- this WORKORDER

Untouched: runtime `src/` and `include/u8g2gl/*.h`, `extern/`, `docs/`, `PROGRAM*.md`, realisation
and capacities, the resolver, the value helper, and anything for the editor target. No throwaway
worktree was created. Scratch builds lived in `tmp/wo10/` and were removed.
