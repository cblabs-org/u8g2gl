PR-05R: the framework owns its ambient U8G2 state, and five more integration defects

PR-05 put generated code on real hardware for the first time and found six defects that host
testing could not see. This PR fixes all six, plus two more of the same kind found while fixing
them. The headline: a plain `begin()` + `ui_handler()` user used to get a near-blank screen
(15 lit pixels instead of 1392). They now get the exact frame foundation's legacy display does.

**1. The render guard establishes ambient state and restores the caller's (§11.3).**
- `u8g2gl_state_saver`, constructed by `u8g2gl_render_object()`, now saves, establishes, then
  restores. It captures draw colour, font, font mode, bitmap mode, font position, reference-height
  mode and font direction. Direction is only captured when U8G2 is built with
  `U8G2_WITH_FONT_ROTATION`, because the field doesn't exist otherwise.
- It establishes the framework baseline: `setFontPosTop()`, `setFontRefHeightAll()` and
  direction 0. U8G2GL's state wins inside each object's render; the caller's wins at every other
  moment.
- **Why the guard, not `begin()`:** the user's own drawing code between frames or objects would
  undo a one-off setting, and the blocked-loop repaints would miss it.
- **Why "all" for reference height:** a label clips to its own box, so its reference height must
  cover every glyph in the font, not just `A` and `g`.
- **Null font:** restoring a null font used to segfault inside `u8g2_SetFont()`
  (`u8g2_font_get_byte`, address 0). It is now written straight back to the struct.
- **Font mode and bitmap mode:** the header said these could not be read back. Both are fields in
  `u8g2_t`, and both are now restored. The header's reasoning is corrected.
- **Cost:** the guard compares before it sets, because an out-of-line setter call costs more than
  a field read. Measured on the arm64 host against real U8G2: about 4 ns per object for a label.
  A caller left in U8G2's default text height mode pays about 3.5 ns more. Nothing allocates. The
  guard is 20 B on 32-bit targets.
- **Blocked-loop repaints:** the label marquee, clock colon and progress bar used to call
  `render()` outside the guard. They now share `u8g2gl_repaint_object()`, which saves state,
  clips to the object, clears, renders and resets the clip. The label's private clip workaround is
  gone.

**2. A skipped `.xml` file is reported, not ignored (§1.2, §15.1, §19).**
- `validate` and `generate` warn with `U8G2GL_SCREEN_FILE_SKIPPED`, at the file's line 1, column
  1, with the concrete rename. They cover three cases:
  - a misnamed `screens/*.xml` (case variants included);
  - a stray `.xml` at the project root;
  - a `screens/` subdirectory.
- It is a warning, not an error, so a notes file does not block a build.

**3. The generated config reaches the runtime through a macro (§16, §18).**
- The old advice was a project-wide `-include`. Measured, it fails on the first unrelated library:
  Arduino `SPI` and `Wire`, with `u8g2gl/u8g2gl_version.h: No such file or directory`.
- The header now advises `-I generated` and `-D U8G2GL_GENERATED_CONFIG=\"u8g2gl_generated_config.h\"`,
  which `u8g2gl_config.h` includes. Only runtime and generated code include that file, so the
  define is inert everywhere else. One form serves CMake, ESP-IDF and PlatformIO.
- **Measured on `esp32dev` through the PlatformIO MCP:** `s_binding_pool` drops from 6144 B to
  144 B, and RAM from 31588 B to 25588 B, for the fixture project.
- The C++ suite now delivers the header the advised way.
- The §18 budget line states the slot count, the default it replaces, and that the figure holds
  only when the header reaches the runtime.

**4. `library.json` declares `"frameworks": "*"`.**
- With `"arduino"`, PlatformIO's finder refused the runtime in a native build ("Framework
  incompatible library"). With `"*"` it builds natively with 0 warnings.
- A native consumer still supplies U8G2's C sources and `Arduino.h`/`Print.h` shims (§16).
- Arduino builds are unchanged in size and dependency graph.

**5. A bool subject has one comparison overload.**
- `bind_flag_if_eq` and `bind_flag_if_not_eq` overloaded a bool subject on both `int32_t` and
  `bool`. On xtensa `int32_t` is `long`, so a literal `0` is ambiguous. Generated
  `ref_value="0"` and hand-written code both failed to compile on ESP32, and compiled on the host.
- The `int32_t` overloads are removed, so the generator now emits `false`/`true`. A compile-time
  test shows the old header ambiguous on any host.
- Proved on target through the PlatformIO MCP: the generated fixture plus a hand-written call fail
  before and build after.
- The editor registry normalises an integer ref for a bool subject with `!= 0`, because
  hand-written scenes can still send one.

**6. The version test no longer needs an edit per release.**
- The literal `0.11.0` assertion is gone. The stamp test reads `package.json`.
- §13.9 ("output changes need a bump") stays a review rule. Every output change shows in the golden
  diff.

**Gate criterion 1, re-measured.** PR-05's 0-pixel result was obtained with foundation's legacy
module setting the font state. Measured again with foundation's render harness against this branch:
- five scenarios: 0 differing pixels;
- a plain `begin()` user: 0, down from 1407.
- The method and tables are in the workspace's `CRITERION-1.md`.
- Host only; the on-device check is still to do.

**Versions:**
- Runtime 0.7.0 → **0.8.0**: behaviour change and a removed overload.
- CLI 0.11.0 → **0.12.0**: generated output changed with no input change (§13.9).
- Schema stays **0.4**.
- Every project regenerated with CLI 0.12.0 requires runtime ≥ 0.8.

**Tests:** C++ 401 → **415** (one known skip), CLI 1338 → **1353**. Zero warnings. Each
work order was re-run by the PA from a clean configure.

**Merge with a merge commit, not a squash** (`rules/04`): foundation's held branch pins a bare
U8G2GL commit.

**Not in this PR:**
- the Arduino IDE release artefact (Q-18);
- foundation-side changes, though its cut-over should switch to the macro form;
- a link-time check that the header reached the runtime (considered, not built).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
