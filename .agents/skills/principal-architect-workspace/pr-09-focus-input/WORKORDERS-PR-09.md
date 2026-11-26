---
name: pr-09-wo1-wo4
description: Work Orders of PR-09 — runtime input dispatch, focus ring, triggers, screen stack, the §10 style-precedence fix and focus_style; then the generator and validator, the designer, and docs with PR-08's loose ends
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the four named here.
- Do not push.
- Do not start other work. In particular, none of the following:
  - the flow view (`[UD-7]`, F7);
  - composites with their own C++ class (still deferred from PR-08);
  - foundation's `ButtonModule` / `EncoderModule` wiring, or its widget migration to runtime 0.16;
  - anything in either foundation repository.

Execute **WO1, then WO2, then WO3, then WO4**.

**Parent project:** `pr-09-focus-input` ([PROJECT.md](PROJECT.md)). The plan is
[RESCOPE-PR-09.md](RESCOPE-PR-09.md). Its decisions Q1a (as clarified), Q2a, Q3a and Q4a, and its
PA rulings 1–7, bind this PR.
- **Read first:** the whole of PROJECT.md and RESCOPE-PR-09.md. The owner's approval is recorded in
  both status logs (rule 00). The approval in principle is in
  `../pr-08-collection-api/REFRESH-PR-08-09.md` (Q5a, Q6a, Q7).
- **Before WO1:** read `.agents/rules/03-versioning.md`.
- **Spec:** design_spec §10 and §12, and §13 and §18 for what the generator emits and reports.

# Where you work

- **Worktree:** `../U8G2GL-e4`, starting on `u8g2gl-09/wo1-runtime`, which is based on main at
  `834dcfa` with no upstream set. Its first commit holds these PA records.
  - Cut each later branch from the previous tip with `git checkout -b <name>`:
    `u8g2gl-09/wo2-generator`, then `u8g2gl-09/wo3-designer`, then `u8g2gl-09/wo4-docs-review`.
- **Boundary:**
  - **Runtime:** `include/` and `src/`, for rulings 1–4 and Q2a and Q3a; `library.json` and the
    runtime-version files the version checks require; the host test tree under `test/`.
  - **CLI core:** `cli/src/core/**` (parser types only if a field is missing, the validator,
    realisation, the generator, and new codes in `cli/src/core/schema/diagnostic.ts`).
  - **Wasm:** `wasm/bridge.cpp`, `wasm/harness.cpp` and the Wasm build files, for ruling 7 only.
  - **Design server:** `cli/src/node/design/test-run/**`, for ruling 7's per-step parity only.
  - **Designer:** `designer/**`.
  - **Loose ends (Q4a, WO4 only):** `cli/src/node/format-budget.ts`, the stale comment in
    `cli/src/core/parser/parse-widget-manifest.ts`, and the designer's number cell.
  - **Tests, fixtures and goldens** these changes move. **Docs and versions** in WO4.
  - **Not touched:**
    - the schema version (it stays 0.7) and the XML vocabulary: everything PR-09 needs already
      parses (finding 1). If you find a construct that doesn't, **stop and report**;
    - `extern/`;
    - either foundation repository.
  - If a step seems to need anything outside the Boundary, or a design choice the rulings don't
    settle, **stop and report**.
- **Install:** `extern/u8g2` is already checked out at the pinned commit. Don't touch it, and don't
  run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as
  you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from the
  lockfiles. Any CLI `--out` path stays inside the worktree's `tmp/`.
- **Baselines:** record them first, running the suites one at a time. At `834dcfa` the PA saw:
  Wasm 7/7, ctest 560/560, CLI 3280, designer unit 351, e2e 170/170, production 3/3.
  - **Framework editor Wasm:** build it (`emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release &&
    cmake --build build-wasm -j8`) before `npm run build:e2e`, and again after any runtime or
    `bridge.cpp` change.
  - **Host C++ tests:** `cmake -B build && cmake --build build -j8 && ctest --test-dir build
    --output-on-failure`.
  - **e2e:** it needs `npm run build:e2e`, never the production build. A production `npm run build`
    overwrites the e2e build, so always rebuild `build:e2e` before `test:e2e`.
  - **Production:** checked with `npm run build` and `test:e2e:production`.
  - **Wasm tests:** run them as CI runs them, `node wasm/test/<name>.test.mjs`, every one listed in
    `.github/workflows/ci.yml`.
  - **Emscripten:** `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
  - **Known flakes,** still to be reported if they fail:
    - e2e: `performance.spec.ts:168`, `drag-performance.spec.ts:189` and
      `design-hidden.spec.ts:144`;
    - `generate-editor.test.ts`, when it hits vitest's 5 s limit under a full parallel run.
  - **Load:** the machine may be heavily loaded by other processes. Re-run any failure alone before
    judging it.
- **Standards:** load `u8g2gl-standards` before writing code. C++ and TypeScript naming differ, so
  check §2. No workspace pointers in source comments or test titles. The home-path guard must pass.
- **Browsers:** Playwright runs headless, with `--no-open`. Never open a window, an editor, Finder or
  an OS file dialog on the owner's desktop.
- **Ports:** the owner's demo server listens on 5321, and the PA's on 5399 and 5401. Never bind them,
  never stop them.
- **Flakes:** if any test fails, re-run it alone and report both runs. Do not weaken a test to pass.
- **Goldens:** when a golden moves, read the diff. Every changed line must be explained by this WO's
  change; anything else is a defect to report. **Q3a's purpose is that no existing button's pixels
  change:** a moved button pixel in any existing golden or fixture frame is a defect.
- **Versions:** never tag, never publish. Bump only in WO4: runtime 0.17.0, CLI 0.28.0, schema
  unchanged at 0.7.

# WO1 — the runtime (`u8g2gl-09/wo1-runtime`)

- [ ] **Events (ruling 1).** A `u8g2gl_event_t` with `ENCODER_CW`, `ENCODER_CCW`, `ENCODER_CLICK`,
      `ENCODER_LONG_CLICK`, `BUTTON_NEXT`, `BUTTON_PREV`, `BUTTON_PRESS` and `BUTTON_LONG_PRESS`.
      - A runtime entry point dispatches one event to the active screen; WO2 emits the generated
        `ui_dispatch(event)` beside `ui_handler()` that calls it.
      - CW and NEXT move focus forward; CCW and PREV move it back; CLICK and PRESS fire the focused
        element's `press`; the two long events fire `long_press`.
      - The framework never times input (§12.1). Dispatch is synchronous and allocates nothing.
- [ ] **Focus (ruling 2).** A new flag, `U8G2GL_FLAG_FOCUSED`, set and cleared only by the runtime.
      - A screen carries an optional ring: a table of object indices and `wrap`, supplied by
        generated code (ruling 6). No ring means the screen ignores input.
      - On activate, focus goes to the first visible, enabled member. Moving skips hidden and
        disabled members. With `wrap` false, moving past either end does nothing. If no member is
        focusable, nothing is focused.
      - A focus change marks both objects dirty.
- [ ] **Triggers (Q2a).** Each object may carry a table of events: a trigger (`press`,
      `long_press` or `value_changed`) and an action (load a screen, go back, or call a callback).
      - **The switch:** `press` on a focused `u8g2gl_switch` toggles it. If it's bound to a bool
        subject, the toggle writes the subject, through the subject's ordinary setter so every other
        binding updates.
      - **`value_changed`** fires only when input changed the value, never for a binding or a
        setter called by the application. In PR-09 only the switch produces it.
      - A switch's own toggle happens before its `press` events run, so a `press` callback sees the
        new value.
- [ ] **Navigation (ruling 4).** A screen stack of (screen, focus position), depth
      `U8G2GL_SCREEN_STACK_DEPTH`, default 4, overridable at compile time.
      - A load pushes the current screen and its focus position, then activates the target.
      - Back pops, activates that screen and restores its focus position (falling to the ring's
        rule if that member is no longer focusable). Back on an empty stack does nothing.
      - Full: drop the oldest entry. Static storage only.
- [ ] **Callbacks (ruling 5).** The signature is
      `void <callback>(u8g2gl_obj& target, u8g2gl_trigger_t trigger);`. Define `u8g2gl_trigger_t`
      in the runtime.
- [ ] **The §10 precedence fix and `focus_style` (ruling 3).**
      - Each object stores a mask of the style properties its own setters set, and a pointer to its
        base named style.
      - `apply_style()` merges only properties not in that mask. This must not change any existing
        output: at init, styles are applied before properties (§13.7), so the mask is empty then.
        Prove that with the unchanged goldens and host tests.
      - Gaining focus applies the element's `focus_style`. Losing it clears the non-own properties
        and re-applies the base style.
      - **Cost:** measure `sizeof(u8g2gl_obj)` before and after, and report it (gate C3). If it
        grows by more than one pointer plus one mask word, stop and report.
- [ ] **The button (Q3a).** It draws inverted when focused **or** when its style sets `invert`, and
      not when disabled (as today). A disabled button is never focused anyway.
- [ ] **Tests:** host C++ tests against real U8G2 pixels:
      - focus movement, skipping hidden and disabled members, both `wrap` values, and a ring with
        no focusable member;
      - a screen with no ring ignoring every event;
      - press and long press reaching the right action; a callback receiving its target and
        trigger;
      - the switch toggle writing its bound subject, and `value_changed` firing for input but not
        for `ui_set_…`;
      - load, back, back on an empty stack, and overflow dropping the oldest, with focus restored;
      - **`focus_style`:** applied on focus, and fully restored after losing it, pixel for pixel;
        a property the element set itself surviving both the focus style and the restore;
      - a focused button inverted; an `invert`-styled button unchanged.

# WO2 — the generator and validator (`u8g2gl-09/wo2-generator`)

- [ ] **Generated output (ruling 6).** For each screen, emit its ring (object indices and `wrap`),
      each object's event table, and each target screen as a pointer. Nothing allocates. Emit
      `ui_dispatch(u8g2gl_event_t)` beside `ui_handler()`, and declare every `<event_cb>` callback
      in `ui.hpp` (ruling 5): a missing definition must be a link error naming it.
      - A ring member and an event-carrying element are realised as objects (finding 2 already
        models the ring; extend it to events).
      - Report the new tables' bytes in §18.
- [ ] **Pass 8** drops its four PR-09 refusals (`validate-not-yet-supported.ts`), including the
      `FOCUS_AND_EVENTS_PR` entries and their tests.
- [ ] **New checks,** each a diagnostic naming the element and, where there is one, the target.
      Add codes to `diagnostic.ts` and run them in `validate` and in `generate`'s own pass, under the
      existing refusal policy:
      - a `<focus name>` names an element written in that screen (error);
      - the same element twice in one ring (error);
      - a `screen` attribute names a screen in the project (error);
      - a callback is a valid C identifier, and the generated-name collision check covers it
        (error, reusing `U8G2GL_GENERATED_NAME_COLLISION`);
      - `value_changed` on an element that can't produce it (warning, Q2a);
      - **Q1a:** a ring member with no events that isn't a switch (warning: a highlight-only stop
        may be deliberate);
      - an element with `press` or `long_press` events that isn't in its screen's ring (warning: it
        can never be pressed);
      - `focus_style` names a style (already checked; keep it).
      - Membership is never inferred: nothing joins a ring that the author didn't list.
- [ ] **Goldens:** fixtures without focus or events must not change at all. New fixtures get new
      goldens. Explain every diff.
- [ ] **Editor target (ruling 7).** The scene carries each screen's ring and each object's events;
      bump the scene version and keep the designer reading it. `bridge.cpp` gains a dispatch
      entry point running the same runtime code. A callback on the editor target is recorded and
      reported to the caller, not run.
- [ ] **Parity:** a multi-screen fixture (a settings menu: a ring with a switch bound to a bool
      subject, buttons with `press` loading a second screen and a callback, a `long_press`, and a
      back) driven through a scripted event sequence on both targets, with the frames compared
      after each step and lit-pixel checks. Extend the test run (`cli/src/node/design/test-run/**`,
      `wasm/harness.cpp`) to replay that sequence.

# WO3 — the designer (`u8g2gl-09/wo3-designer`)

Everything here must be authorable from the designer alone: no XML-only gaps.

- [ ] **Explorer:** a marker on each element in its screen's ring, showing its position.
- [ ] **The ring:** per screen, an ordered list the author adds to, removes from and reorders, with
      `wrap`. It adds nothing on its own. Adding offers only named elements written in the screen.
- [ ] **Property panel:** the element's events (trigger, then an action: a target screen from a
      picker, back, or a callback name), and `focus_style` picked from the named styles.
- [ ] **Diagnostics:** WO2's new checks appear in the designer like the rest, with their element.
- [ ] **Canvas focus preview:** toolbar buttons with keys for next, previous, press, long press and
      back, driving the bridge dispatch, so the canvas runs the device's code. Loading a screen
      switches the designer's screen; a callback is shown (its name and target), not run. Leaving
      preview restores the editing state.
- [ ] **Writes:** every form writes XML the parser reads back unchanged, and round-trips through
      undo.
- [ ] **Tests:** unit tests, and e2e that authors a ring and its events entirely from the UI,
      previews focus moving, toggles a bound switch, goes to another screen and back, and checks the
      XML on disk.

# WO4 — docs, review and loose ends (`u8g2gl-09/wo4-docs-review`)

- [ ] **Docs:** design_spec §10 (the precedence fix) and §12 (events, focus, triggers, the stack,
      the callback signature, opt-in membership and its warnings), ui_spec, implementation_plan
      (PR-09's row; the foundation wiring noted for the cut-over), and the ChangeLog.
- [ ] **Loose ends (Q4a):**
      - the text §18 report (`format-budget.ts`) prints each storage line's name and derivation, as
        `--json` already does;
      - remove the stale "until PR-08" comment at `parse-widget-manifest.ts:293`;
      - the designer's number cell marks a typed out-of-range value (9090 into a 0–100 field) as
        invalid, the way the other invalid cells are marked, and doesn't write it.
- [ ] **Readability review:** run the `readability-reviewer` agent over the PR's diff and fix its
      findings, or report why not.
- [ ] **Versions:** runtime 0.16.0 → **0.17.0**, CLI 0.27.0 → **0.28.0**, schema unchanged at 0.7.
      Refresh the goldens the runtime floor moves, and explain them.
- [ ] **Final:** every suite one at a time, `check-package` and the home-path guard, then the
      completion report below.

# Completion report

Append it here under `## Report (worker, <date>)`:
- commits per WO;
- every suite's result, and every flake with both runs;
- `sizeof(u8g2gl_obj)` before and after, and the new tables' bytes on the settings fixture;
- each golden's change, explained;
- anything found outside scope;
- deviations, and choices the rulings didn't settle.

## Report (worker, 2026-11-26)

Provenance checked first: this file names `pr-09-focus-input`, whose PROJECT.md status log (committed in
`52ba10a`) records the owner's own "Approve as recommended" of 2026-11-26.

### Commits per WO
- **WO1** `u8g2gl-09/wo1-runtime`: `bd15c93` feat(runtime): input dispatch, focus ring, triggers and screen stack.
- **WO2** `u8g2gl-09/wo2-generator`: `6c00218` feat(generator): focus rings, events and the editor dispatch.
- **WO3** `u8g2gl-09/wo3-designer`: `6cf0c13` feat(designer): author and preview focus rings and events.
- **WO4** `u8g2gl-09/wo4-docs-review`: `f081178` docs, versions and loose ends; the review-fixes commit after
  it; this report. Nothing pushed, tagged or published.

### Suites (final, one at a time, on the WO4 tip)
- **Baseline at `834dcfa`:** Wasm 7/7, ctest 560/560 (1 skipped: SizeOfReport.ThirtyTwoBitTarget), CLI 3255 +
  25 skipped (3280), designer unit 351, e2e 153 passed + 17 skipped (170), production 3/3.
- **Final:**
  - Wasm 8/8: the seven, plus the new `input-parity.test.mjs` (68 checks).
  - ctest 587/587, with the same 1 skipped: 26 new `test_input` and 1 `test_input_parity`.
  - CLI 3294 passed + 25 skipped (3319). The Emscripten-only CLI tests also ran with Emscripten on PATH, as CI
    runs them: all passed, including `valid-project` now compared pixel for pixel and a new harness `runEvents`
    test.
  - designer unit 357.
  - e2e 155 passed + 17 skipped (172).
  - production 3/3.
  - `check-package` PASS (u8g2gl-0.28.0.tgz). The home-path guard passes.
- **Flakes:** none of the known three failed.
  - My own new e2e (`input.spec.ts`) raced once, comparing a frame captured mid-update. Fixed by waiting for a
    settled frame. Afterwards it passed 6/6, and the full run passed.
  - The first full e2e run failed `overlays.spec.ts:139` and `panel.spec.ts:70`. Both are real consequences
    of the new panel section (a fourth section, and Input and Focus ring re-rendering on selection), not
    flakes. Both tests were updated with comments, and both pass.
- **Environment:** for about an hour, every exec of the emsdk's own binaries (clang, its python) hung in
  kernel wait (state U). Reading the files was unaffected. It cleared by itself, and every Wasm-dependent suite
  above ran after that.

### Sizes
- **`sizeof(u8g2gl_obj)`:** 48 → 56 bytes on 64-bit, and 32 → 36 on 32-bit (Wasm). That is one pointer, the
  base style. The own-property mask fills existing padding. The label's 64-bit ceilings rise 80 → 88 in
  `test_label` and `test_sizeof_report`; no other ceiling moved.
- **`sizeof(u8g2gl_screen)`:** 36 → 48 (32-bit) and 72 → 96 (64-bit), per screen.
- **The new tables on the settings fixture (`test/input_menu`)**, at 32-bit:
  - 5 ring stops × 8 B = 40 B.
  - 5 events × 12 B = 60 B, both const.
  - The screen stack is 4 × 8 B = 32 B RAM.
  - At 64-bit: 16 B per stop and 24 B per event.
  - §18 reports the entries by count, unmeasured in bytes (see deviations).

### Golden changes
- **Firmware goldens of fixtures without input:** unchanged by WO1–WO3.
- **WO2:** the five committed `generated_editor/ui_scene.json` (generated_fixture, static_children,
  collection_data, fill_guard ×2) move by `"version": 5` → `6` only.
- **WO4:** the eight committed `u8g2gl_generated_config.h` files move by the runtime floor only (the `#error`
  text and `U8G2GL_REQUIRE_RUNTIME_AT_LEAST(0, 16, 0)` → `(0, 17, 0)`).
- **New:** `test/input_menu/` and its goldens, plus the harness `support/` units, which are checked against
  their generators.
- No existing button's pixels moved: the D-9 snapshot golden and every parity test are unchanged.

### Outside scope (not touched)
- **An orphaned `u8g2gl design` process from an earlier session** (pid 43300, on
  `tmp/e2e/session-J6ZvCp`, port 0) was already running before I started. It is not on 5321, 5399 or 5401.
  It is not mine, so I left it.
- **A `<style name>` child of an element shows as an Explorer row.** This predates PR-09. A ring's `<focus>`
  entries no longer do.
- **Older work-order, ruling and finding citations remain across the CLI.** This is pre-existing, and §4.1
  says not to sweep them.

### Deviations, and choices the rulings didn't settle
1. **`ui_dispatch()` is generated only for a project with a ring or an event.** That keeps every existing
   golden byte-identical, as the WO requires. A project without input can still call `u8g2gl_dispatch()`.
2. **Where the tables live:**
   - The event table is per screen, with each entry carrying its object index, not per object. That keeps
     `u8g2gl_obj` at +1 pointer (gate C3).
   - The `focus_style` pointer lives in each ring stop.
3. **Several named styles on a ring member with a `focus_style`.** An object keeps one base style, so these
   are merged into one function-local static base in init. Single-style elements are unchanged.
4. **Order and stopping.** A press runs the element's own toggle, then its `press` events, then
   `value_changed`. An element's events stop once one changes the active screen.
5. **Which elements produce `value_changed`.** This is a named runtime-class list,
   `VALUE_INPUT_CLASSES = ['u8g2gl_switch']`, matched over the `extends` chain (`core/schema/input-model.ts`).
   The manifest can't express it without schema surface (Q1b declined). This sits uneasily with [D-17].
6. **Composites:**
   - A composite's own `<focus_ring>` stays refused (NOT_YET_SUPPORTED, "a later PR").
   - Events in composite templates build per instance, and get the unreachable-press warning.
7. **Diagnostics:**
   - Added `U8G2GL_UNKNOWN_TRIGGER`. The parser cast any trigger text.
   - A callback must be a C identifier, not a keyword, and outside `u8g2gl_`.
   - A `<focus>` naming no element stays Pass 2's `U8G2GL_UNKNOWN_WIDGET`.
8. **§18 bytes for the tables are unmeasured, with the struct shape in the note.** Bytes are `sizeof` the
   runtime's, which §13.7 keeps from the generator. They are measured above instead.
9. **The bridge now applies named styles as runtime `u8g2gl_style`s through `apply_style()`**, not property
   thunks. Without that the editor would treat every style property as the object's own. The pixels are
   unchanged (snapshot golden).
10. **Bridge `previewBack()`:** no input event is "back", so the designer's Back calls `u8g2gl_screen_back()`.
11. **The test run replays scripted events server-side**, through `events` and the harness's `runEvents`. The
    designer's Run button doesn't send a script yet. Canvas parity is proven by the native and Wasm parity
    tests and by the e2e.
12. **`.github/workflows/ci.yml` gained the two new Wasm targets and the input-parity step.** That file is
    outside the listed boundary, but without the change the new Wasm test would never run in CI.
13. **`test_core`:** 21 tests now deactivate their stack-local screen before it goes out of scope. TearDown
    had always read the dangling pointer; the new focus code made that a crash.
14. **A WO2 defect fixed on the WO4 branch.** The harness's sample-set declaration was out of order, and the
    Wasm build found it once Emscripten ran again.
15. **The designer's number cell now refuses an out-of-range value instead of clamping it (Q4a).**
    `samples.spec.ts`'s clamping case was rewritten to expect the refusal.
16. **The readability review (readability-reviewer agent):** no P1 or P2 findings. All of its P3 items and
    its P4 suggestions were fixed, except "See PD-3", which is a published decision ID.
