---
work_order: WO10b
project: pr-04-generator
title: "Bound text reaches the label; Chief Architect emission rulings (ui_obj_, init order, relative bound positions)"
branch: u8g2gl-generator/wo10b-bound-text
base: u8g2gl-generator/wo11-editor-target
complexity: high
status: complete
---

# WO10b — Bound text reaches the label

## Authorization

Part of PR-04 (`pr-04-generator`). Verify, from committed files: the human's approval of PR-04 in
`../PROJECT.md` under "Human Approval"; that `../PROJECT.md` records **WO10b as approved by the
owner** ("WO10b — owner decision, 2026-09-19" under Human Approval); that the Chief Architect's
rulings are recorded ("Chief Architect rulings on CA-BRIDGE-2026-09-18"); and that this
WORKORDER's `status` is `dispatched`.
If any is missing, record it in the Completion Report and stop.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo10b-bound-text` · **Base**: `u8g2gl-generator/wo11-editor-target`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval — you cannot be answered,
and your work will strand uncommitted. Do not push or tag.

## Standards

`u8g2gl-standards` skill: `references/cpp.md`, `references/documentation.md`. **No heap.** Zero
warnings. Every mutator that changes what is drawn calls `mark_dirty()`, guarded on change.

## Design authority

design_spec §7.2, §8.4, §10, §11.3, §13.4, §13.5, §13.7, §13.8, §13.12 (as amended on `main` @
`ff20f0c`); `docs/decisions/d20-bindable-geometry.md` and its 2026-09-19 amendment. **Must land
before PR-04 is submitted** (owner, 2026-09-19). "Stop and report" means record it, do not choose,
continue with the remaining items.

---

## Objective

A label bound to a subject draws that subject's value. Today it draws nothing.

## Background — confirmed by the PA in merged code (PR-01/PR-03)

`u8g2gl_obj::bind_text(u8g2gl_subject_string_base*)` and the int overload register
`u8g2gl_on_text_binding_change` (`src/u8g2gl_obj.cpp:417`), whose comment says the widget "reads
the subject directly when it renders". But `u8g2gl_label::render()` draws only `text_`, which only
`set_text()` assigns, and nothing assigns it from the subject. The binding marks the frame dirty
and **nothing appears**. §13.12's `msg` and `bar_location` would be blank on a device. WO10's
generated fixture test is green only because it does not assert bound text.

## Root cause (stated by the PA — confirm or correct it in your report)

**Runtime.** Nothing reads the subject: the observer only marks dirty, and every label render path
reads `text_`. The generator emits `bind_text(&subject)` correctly and last. The new init order
(styles before properties) neither causes nor masks the defect, but it means an active binding must
take precedence over a literal `text`, whatever order the two were set in.

## Line-Item Instructions

### A. Bound text (the defect)

- [x] **The label draws its bound subject at render time**, as the observer's comment already
      promises: a string subject's current value; an int subject formatted through its
      `bind_text_fmt` (default `%d` if none). A literal `text` still works when nothing is bound.
- [x] **Where formatted text lives.** Prefer a stack buffer inside `render()` (no per-object RAM).
      `dots` and `scroll` modes need the text's width, which today is cached in
      `message_width_`: say how width is kept correct when the subject changes, and state the RAM
      and per-frame cost of your choice. Size the buffer from a documented constant, and truncate,
      never overflow.
- [x] **Change marks dirty and re-measures.** A subject change must mark the frame dirty (it does)
      and invalidate any cached width, so scroll/dots stay correct.
- [x] **An active binding wins over a literal `text`** in either set order (manifest: "Overridden
      when bind_text is active").
- [x] **Acceptance tests, both of which must FAIL at the base** (Chief Architect):
      (1) **runtime:** bind a label to a string subject, set a value, render, and assert the text
      drawn *is that value*. If the U8G2 test double can't record drawn text, extend it in its
      existing idiom (WO11 added an ordered call log; use it). Never weaken the test;
      (2) **end to end:** the generated fixture with `bind_text` compiles, and its label draws the
      subject's text. Extend WO10's generated-fixture test to assert it.
      Also: changing the subject changes the drawn text; an int-bound label with
      `bind_text_fmt="%d°C"` draws the formatted value; `dots` on a long bound string truncates
      correctly. **Remove any "do not assert bound text" carve-out in WO11's parity test** and
      assert it on both targets.
- [x] **Button too, if it shares the path.** `u8g2gl_button` declares `bind_text`; if its render has
      the same defect, fix it the same way and say so.

### B. Chief Architect rulings, 2026-09-19 (spec already on `main`)

- [x] **Ruling 2 — every emitted object is `ui_obj_<name>`**, composite children
      `ui_obj_<instance>_<child>` (§13.4, §13.12). Through `mangle.ts`, the single naming
      authority; its collision table covers the new family. Regenerate the goldens, the committed
      firmware fixture and WO11's editor fixture **once**, and **say in the commit message** that
      the goldens change for this ruling. Bump nothing: goldens pin `0.0.0-golden`, and the CLI
      version bump is WO12's.
- [x] **Ruling 3 — own attributes win over named styles** (§10). Emit init as construct → **apply
      styles → set properties** → bind → events → focus ring (§13.7), in the shared
      `emit/screen-model.ts` so both targets change together. Test: an element with `font=` and a
      style whose font differs ends with its own font; the same for an inline `style_*` override.
- [x] **Ruling 1a — bound positions are container-relative** (§7.2, [D-20] amendment). Draw-call
      primitives: add the container's build-time device-absolute origin into the emitted bound
      argument (`origin + subject.get()`), through `emit/placement.ts` only.
- [x] **Ruling 1b — object-backed elements (PA mechanism, PROJECT.md).** `bind_x(subject, int16_t
      origin)` and `bind_y(subject, int16_t origin)`: the observer applies `origin + value`,
      summed in 32 bits and clamped to int16_t as a sum. `bind_width` and `bind_height` are
      unchanged. In `u8g2gl_binding_desc`, make `ref_value` one named member of an anonymous union
      with `int16_t coord_origin`, with a comment saying which binding kind uses which. Update
      the manifests' `bind_x`/`bind_y` emission so the origin is emitted as a literal. Tests: a
      child of a container at x=40 bound to 5 is at 45; a screen-level element is at its value;
      the clamp holds at the int16_t edges.
- [x] The editor registry's set-by-name for `bind_x`/`bind_y` carries the origin too, so the parity
      test covers the new argument.

### C. Carried from WO11's review

- [x] **`u8g2gl_obj.xml` declares `font_mode` and `bitmap_mode`** (WO11 f3). `u8g2gl_obj` has the
      setters, but only `u8g2gl_xbm.xml` declares them, so the editor refuses a named style that
      sets them on a label, button or clock while firmware applies them. Declare them, regenerate
      the bundled manifests, and add a parity case that exercises one.
- [x] **`emit/styles.ts` spells enumerators through `cppValue()`** (WO11 f4). This removes the second
      spelling left over from WO9. Output must stay byte-identical apart from this work order's
      intended changes.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_label.h`, `src/u8g2gl_label.cpp`, `include/u8g2gl/u8g2gl_button.h`,
`src/u8g2gl_button.cpp` (the same defect only), `include/u8g2gl/u8g2gl_obj.h` and
`src/u8g2gl_obj.cpp` (text-binding plumbing; `bind_x`/`bind_y` origin; the descriptor union),
`include/u8g2gl/u8g2gl_editor.h`/`src/u8g2gl_editor.cpp` (the origin only),
`include/u8g2gl/manifests/u8g2gl_obj.xml` and the bundled `cli/src/data/manifests.json` (the
`bind_x`/`bind_y` signature; `font_mode`/`bitmap_mode` declarations), `cli/src/core/resolver/mangle.ts`, `cli/src/core/generator/emit/`
(naming, init order, bound origin), goldens and committed fixtures, `test/`, `cli/test/`, this
WORKORDER.

**Do NOT touch:** the validator (rulings 1c and 6 are WO11b's); `docs/`; `PROGRAM*.md`. Do not move
text binding off `u8g2gl_obj` (Q-10). Run every suite alone.

## Verification Requirement

- [x] `cmake --build build` zero warnings; `ctest --test-dir build` all pass, including the
      real-U8G2 header target
- [x] CLI `vitest`, `tsc`, lint clean
- [x] Build both configurations (the editor runtime too) with zero warnings; editor parity passes
- [x] Goldens and fixtures regenerate byte-identically from the committed generator after your change
- [x] Diff limited to the Boundary Box

---

## Completion Report

**Worker:** Tier-3, 2026-09-19. **Status `complete`.** Commits `f1cffa9` (runtime bound text) and `c9b8f96`
(generator rulings and WO11 carries, the one regeneration), plus this report. Not pushed or tagged, and no
version bumped: the goldens stay pinned at `0.0.0-golden`, and the CLI bump is WO12's.

### Authorization

Verified from committed files, not from the dispatch prompt:
- The front matter says `project: pr-04-generator`, `status: dispatched`.
- `../PROJECT.md` "Human Approval" quotes *"Approved — proceed with the twelve work orders, start WO1"* at
  `2026-09-13T19:59:36Z`.
- "WO10b — owner decision, 2026-09-19" quotes *"agree with your recommendation on WO10b"*.
- "Chief Architect rulings on CA-BRIDGE-2026-09-18" records rulings 1a, 1b, 2 and 3, with the PA's
  mechanism for 1b.

I read the rulings on `main` @ `ff20f0c` (`git show ff20f0c -- docs/`): §7.2, §10, §13.4, §13.5, §13.7,
§13.8, §13.12, and the [D-20] amendment.

### Test counts (every figure from an uncontended run, suites one after another)

| Suite | Before (`678d2b3`) | After (`c9b8f96`) |
|---|---|---|
| `cmake --build build --clean-first` | 0 warnings | **0 warnings**, 104 TUs, both configurations (firmware and `U8G2GL_EDITOR`) |
| `ctest --test-dir build` | 336, 1 known skip | **361**, same skip (`SizeOfReport.ThirtyTwoBitTarget`), `RealU8g2` passes |
| `npx vitest run` | 851, 56 files | **859**, 56 files |
| `npx tsc --noEmit`, `npm run lint` | clean | clean |

New tests: C++ +25 (14 in `f1cffa9`, 11 in `c9b8f96`). CLI +8, plus existing tests updated for the
rulings (names, order); none were weakened.

### Root cause — confirmed, one addition

**Confirmed: the runtime, not the generator.**
- `u8g2gl_on_text_binding_change` only called `mark_dirty()`.
- Every label path read only `text_`: `render()`, `render_static()`, `render_scroll()`, and also `tick()`
  and `render_animation_update()`. Nothing read the subject.
- The generator emitted `bind_text(&subject)` correctly and last.
- The init-order change neither causes nor masks the defect.

**Addition: `u8g2gl_button` had the same defect** (`render()` read only `text_`). I fixed it the same way.

### A. Bound text — what was built

- **`u8g2gl_obj::bound_text(buffer, capacity)`** (protected) reads an active text binding when the object
  renders:
  - a string subject: its own buffer, with nothing copied;
  - an int subject: formatted through `bind_text_fmt`, or `"%d"` if there is none, by `snprintf` into the
    caller's buffer. It truncates and always terminates.
  - The value is passed as `int` because formats are written for one (`%d°C`); every supported target has
    a 32-bit `int`. This is documented.
- **Where formatted text lives: on the stack of `render()`.** The buffer is
  `U8G2GL_BOUND_TEXT_BUFFER_SIZE` bytes, a documented constant of 32 in `u8g2gl_obj.h`, overridable with
  `#ifndef`.
  - `tick()` and `render_animation_update()` use the same 32-byte stack buffer while they run.
  - **RAM: 0 bytes per object**; `sizeof(u8g2gl_label)` is unchanged.
  - **Cost per frame, per label or button:** one scan of the binding pool (`U8G2GL_MAX_TOTAL_BINDINGS`
    slots, which the generator sizes: 7 in the fixture), plus one `snprintf` for an int.
- **Keeping the width correct.** The text observer is now the private static `on_text_bound`. It calls a
  new virtual hook, `on_text_binding_changed()`, whose default marks the frame dirty.
  - The label overrides it to invalidate its measured width (`invalidate_text()`, shared with
    `set_text()`), so `dots` and `scroll` re-measure **once per change, not once per frame**.
  - `bind_text()` calls the hook when it binds, so a width measured for a literal is dropped too.
  - The hook costs one vtable slot per class (flash) and no RAM.
- **An active binding wins in either order.** `current_text()` asks the binding first on every read and
  never copies the bound value into `text_`. `get_text()` still returns the literal; its documentation says
  so.
- **Tests**:
  - `LabelBoundText.*` (9): the acceptance test; the value changing; `%d°C`; `%d` at `INT32_MIN`;
    truncation at the buffer size; precedence in both orders; `dots` re-measured when the subject changes;
    `scroll` with no literal; and the literal alone as the control.
  - `Button.Bound*` (2).
  - `GeneratedFixture.BoundLabelsDrawTheirSubjectsText`: the end-to-end acceptance test.
  - `EditorParity.HomeScreen*`: **WO11's carve-out is removed.** Both logs must contain `"Euston"` and
    `"On time"` (and a second case, `"Crewe"`/`"Delayed"`), as well as match each other.
  - Drawn text is read from the stub's ordered call log, which copies the text.

### B. Rulings

- **Ruling 2, `ui_obj_<name>`.**
  - `mangle.ts`'s `objectIdentifier()` is the only spelling, used by `screen.ts` for every declaration,
    table entry, call and guard term.
  - The collision table checks the prefixed identifier.
  - Realisation, the scene's `name` and diagnostics keep the name the author wrote. A collision's
    `offendingText` stays that name, so the caret still underlines what the author wrote.
  - The golden's `clock` object is now `ui_obj_clock`.
- **Ruling 3, styles before properties.**
  - `INIT_STEPS = ['styles', 'properties', 'bindings']`, so firmware and the scene change together.
  - Inline `style_*` overrides stay in the styles step, after the named styles.
  - Tests:
    - CLI: the order, and own `font=` set after the style.
    - `GeneratedFixture.ElementsOwnAttributesWinOverANamedStyle`: own `font=` beats the style "loud"'s font
      while the style's align and `font_mode` still apply; an inline `style_align="right"` beats the
      style's center.
- **Ruling 1a (draw calls).**
  - `placement.ts` now owns `POSITION_BINDINGS` and `boundPositionOrigin()`, and `Placement` carries its
    container `origin`.
  - `draw-args.ts` spells a bound position as `40 + ui_subject_x.get()`. A zero origin is not spelled, so
    screen-level output is unchanged.
- **Ruling 1b (objects).**
  - The signatures are `bind_x(subject, int16_t origin)` and `bind_y(subject, int16_t origin)`, with no
    default: every caller states the origin.
  - The origin is stored in the slot before the first callback runs.
  - The sum is taken in 32 bits and clamped to int16_t as a sum. The value is first bounded to ±65536 so
    the 32-bit sum cannot overflow (UB) at `INT32_MAX`. This gives the same result as clamping the exact
    sum, because any value beyond that bound clamps to the same edge whatever the origin.
  - `ref_value` is now one named member of an anonymous union with `int16_t coord_origin`. A comment says
    which binding kind uses which. `sizeof` is unchanged.
  - `bind_width`/`bind_height` are unchanged.
- **Editor.**
  - `u8g2gl_editor_bind_fn` and `u8g2gl_editor_bind()` gain `int16_t origin`.
  - The generated thunk passes the origin to `bind_x`/`bind_y`. Every other binding **refuses** a non-zero
    origin instead of dropping it, the same rule as for a format.
  - The scene carries `origin` on position bindings and bound position arguments, as **format version 2**.
    The test host adds it.
- **Manifests.** `u8g2gl_obj.xml`'s `bind_x`/`bind_y` lines are unchanged. The manifest vocabulary has no
  way to say "takes an origin", and the parser and schema are outside the box. [D-20] already names the
  four geometry bindings, so the emitter asks `POSITION_BINDINGS` (see finding 6).

### C. WO11 carries

- `u8g2gl_obj.xml` declares `font_mode` and `bitmap_mode`, and `manifests.json` is rebuilt.
  - The new fixture style "loud" sets `font_mode`.
  - The parity test applies it through the label's inherited prop. Before this change the editor would
    have refused it.
- `styles.ts` spells every style value through `cppValue()` against the `u8g2gl_obj` prop of the same
  name.
  - Its own enumerator table (`DRAW_COLORS`, `U8G2GL_ALIGN_${upper}`, …) is gone.
  - `ProjectEmitInput` gains `manifests` for this.
  - **Byte-identical:** after this change alone, every firmware golden regenerated unchanged. Only the
    editor registry moved, because of the new declarations.

### Base-failure evidence (throwaway worktree `tmp/wo10b/base` at `678d2b3`)

- **Acceptance (1), runtime, fails behaviourally.** `LabelBoundText.StringSubjectValueIsTheTextDrawn` at
  the base: `drawn_texts(display)` is `{}`, expected `{ "Euston" }`.
- **Acceptance (2), end to end, fails behaviourally.** `GeneratedFixture.BoundLabelsDrawTheirSubjectsText`
  at the base: the only text drawn on the home screen is the clock's `"00"`. `drawn.front()` is `"00"`
  instead of `"Euston"`, `drawn.back()` is `"00"` instead of `"On time"`, and after the change it is still
  `"00"` instead of `"Delayed"`.
- **Commit 1's 14 new C++ tests:** **14 fail, all behaviourally.**
  - Of these, 12 fail on missing text.
  - The two parity cases fail on `drew_text(…) == false`.
  - One test needed a one-line shim for `U8G2GL_BOUND_TEXT_BUFFER_SIZE` to compile at the base.
- **Commit 2, CLI:** I ran the five changed test files at the base: **27 of 109 fail.**
  - 26 fail behaviourally: bare names, the old order, no origin in the output.
  - 1 fails only because `objectIdentifier` does not exist there.
  - Of the 8 *new* CLI tests, 7 fail behaviourally. The eighth, "generates without a diagnostic", is a
    sanity control and passes at the base, as intended.
- **Commit 2, C++ (11 new tests):** all 11 fail at the base **only because the API does not exist**
  (`bind_x`'s origin parameter, `u8g2gl_editor_bind`'s origin argument, the `bounds` screen unit).
- **Behavioural proof for those 11, by mutation of the committed tree** (each reverted, and the tree
  confirmed clean):
  1. `INIT_STEPS` back to properties-first fails `ElementsOwnAttributesWinOverANamedStyle` (own font was
     the style's 5x7).
  2. `boundPositionOrigin()` returning 0 fails `BoundPositionsAreContainerRelative` (knob at 5, not 45; the
     readout clipped out entirely).
  3. Clamping the term instead of the sum fails `Obj.BoundPositionClampsTheSumNotEachTerm` (22767, not
     30000).
  4. The editor thunk passing 0 for the origin fails `EditorRegistry.BindXByNamePassesTheContainerOrigin…`
     and both `EditorParity.BoundsScreen*` cases.

  Parity does not fail under mutations 1–2, correctly: both targets follow `INIT_STEPS` and `placement.ts`.

### End to end through the built CLI

I copied the committed fixture to `tmp/wo10b/e2e`.
- `generate` exits 0 and writes 10 firmware files.
- `generate --target-kind editor --json` exits 0.
- **Both match the committed fixture byte for byte**, except the stamp (`0.6.0` against the pinned
  `0.0.0-golden`).

### Golden excerpt (`cli/test/generator/fixtures/emit-project/expected/ui_screen_home.cpp`)

```diff
-static u8g2gl_clock clock;  // 6
+static u8g2gl_clock ui_obj_clock;  // 6
-// --- init: construct, set properties, apply styles, register bindings (§13.7) ---
+// --- init: construct, apply styles, set properties, register bindings (§13.7) ---
-    // --- Step 2: Set properties ---
-    badge.set_coords(0, 0, 60, 12);
+    // --- Step 2: Apply styles (§10) ---
+    ui_obj_title.apply_style(ui_style_header);
+    ui_obj_lvl_a.apply_style(ui_style_body);
+
+    // --- Step 3: Set properties ---
```
The fixture's new screen emits `u8g2gl_draw_box(display, 40 + ui_subject_knob_x.get(), 10, 4, 4, true, 0);`
and `ui_obj_track_readout.bind_x(&ui_subject_knob_x, 40);`.

### Decisions I made

1. **Bound text is read at render time through a protected helper on `u8g2gl_obj`, with a virtual
   change hook.** The helper lives on `u8g2gl_obj`, not in a label-only copy, so the button shares it
   (Q-10: text binding stays on `u8g2gl_obj`). I used a hook rather than comparing pointers, because a
   string subject's pointer never changes when its value does.
2. **`bind_x`/`bind_y` take no default origin.** A silently absolute default would contradict §7.2 for
   hand-written code. I updated the existing test callers to pass `0`.
3. **I pre-bound the value before the 32-bit sum** so that `INT32_MAX + origin` is not UB. The results
   equal clamping the exact sum.
4. **The author's name stays in realisation, the scene and diagnostics.** `ui_obj_` is applied only where
   C++ is spelled. This keeps diagnostics pointing at what the author wrote, and it is why the editor needed
   no naming work.
5. **The fixture gets a third screen** (`bounds`, with a `slider` composite) rather than changes to the
   existing screens, so WO10's assertions stand unchanged. `x="0"` is written beside `bind_x` because
   validation currently demands it (finding 1). The capacity probe is recounted by hand: 7 bindings.
6. **`boundValueFor()` is removed.** It was unused and would have been a second draw-time spelling without
   the origin.
7. **I committed in two steps, not five.** The two WO11 carries and all three rulings change the committed
   fixture or goldens. Because the goldens must change once, they share one commit. The runtime fix is
   separate and was green on its own.

### Out-of-scope findings (not fixed, not filed)

1. **`validate` requires a literal `x` even when `bind_x` supplies it**, and a literal `font` on a label
   even when a named style or `style_font` supplies it. Authors must write `x="0"` beside `bind_x`. →
   WO11b.
2. **A third spelling of the [D-20] binding set.** The set is spelled in the validator's
   `GEOMETRY_BINDINGS`, in `screen-model.ts`'s `` `bind_${axis}` ``, and now in `placement.ts`'s
   `POSITION_BINDINGS` (positions only). → WO11b/PA: one exported table.
3. **`mangle.ts`'s keyword and reserved-prefix checks on a composite child's joined name are now moot for
   C++**, because objects are `ui_obj_`-prefixed (instance `ui` + child `set_x` no longer collides with
   `ui_set_x`). I kept the behaviour and reworded the message so it no longer calls the joined name "the
   C++ identifier". Whether §13.4 still wants the rule is for the Chief Architect.
4. **Stale docs outside the box.**
   - `generator/realise/model.ts` calls `identifier` "its C++ identifier"; it is now the author's joined
     name.
   - The `u8g2gl-standards` skill (`documentation.md` §3) still gives the init order as
     "construct → set properties → apply styles".
   - The generated config's "busiest object" comment names the author's name, not `ui_obj_`.
5. **`u8g2gl_xbm.xml` still declares `bitmap_mode`,** now inherited from `u8g2gl_obj`. The registry merges
   the two, so output is unaffected, but it is a second declaration. The file is outside the box.
6. **Draw-call bound arguments wrap into `int16_t` parameters rather than clamp**, both
   `ui_subject_x.get()` (existing) and `40 + ui_subject_x.get()`. Object bindings clamp. This asymmetry
   predates WO10b and is for the PA or Chief Architect.
7. **Rebinding text (pre-existing).** A second `bind_text()` on one object reuses its slot but registers a
   second observer without removing the first. That breaks the one-observer-per-binding count for rebinds
   and leaves a stale observer on the old subject. Generated code never rebinds. → PR-06, with WO11
   finding 1.
8. **`u8g2gl_button::set_text()` marks dirty unconditionally** (no change guard), unlike the label.
   Pre-existing and minor.
9. **The PR-09 obligation stands:** `focus_style` must not overwrite a property the element set itself
   (§10).

### Diff boundary

`git diff --name-only 678d2b3..HEAD`, all inside the box (plus this WORKORDER):

```
cli/src/core/generator/emit/{draw-args,editor-registry,index,placement,scene,screen-model,screen,styles,unit}.ts
cli/src/core/resolver/mangle.ts
cli/src/data/manifests.json
cli/test/generator/emit-editor.test.ts
cli/test/generator/emit-screen.test.ts
cli/test/generator/fixtures/emit-project/expected/ui_screen_home.cpp
cli/test/resolver/mangle.test.ts
cli/test/validator/identifiers.test.ts
cli/test/validator/one-pipeline.test.ts
include/u8g2gl/manifests/u8g2gl_obj.xml
include/u8g2gl/{u8g2gl_button,u8g2gl_editor,u8g2gl_label,u8g2gl_obj}.h
src/{u8g2gl_button,u8g2gl_editor,u8g2gl_label,u8g2gl_obj}.cpp
test/CMakeLists.txt
test/editor_host/editor_host.cpp
test/generated_fixture/generated/{u8g2gl_generated_config.h,ui.cpp,ui.hpp,ui_screen_bounds.cpp,
    ui_screen_gauges.cpp,ui_screen_home.cpp,ui_styles.cpp,ui_subjects.cpp}
test/generated_fixture/generated_editor/{ui_editor_registry.cpp,ui_scene.json}
test/generated_fixture/{globals.xml,screens/screen_bounds.xml,support/capacity_probe.cpp,widgets/slider/slider.xml}
test/{test_binding,test_button,test_editor,test_editor_parity,test_generated_fixture,test_label,test_obj,test_subject}.cpp
```

The validator, `docs/` and `PROGRAM*.md` are untouched; the two `cli/test/validator/` files are
tests, updated for the new identifier in collision messages. Scratch files and every log cited above live
under `tmp/wo10b/` (git-ignored); the base worktree was removed after use.
