# CA bridge — PR-05R returned (2026-10-12)

**From:** PA, `pr-05r-runtime-fixes` · **Stack tip:** `u8g2gl-05r/wo6-readability` · **Status:**
6/6 WOs verified; not yet pushed (awaiting the owner).

## The six items

| # | Item | Outcome | Evidence |
|---|---|---|---|
| 1 | `setFontPosTop()` never set | The render guard establishes it (R1) | `no_font_pos_top` 1407 → 0 |
| 2 | Null font restored | Written back to the struct; was a segfault in `u8g2_font_get_byte` | real-U8G2 test, before/after |
| 3 | Font mode not restored | Restored, with bitmap mode; header reasoning corrected | real-U8G2 test |
| 4 | Misnamed screen file silent | `U8G2GL_SCREEN_FILE_SKIPPED` warning with the rename (R5) | built CLI |
| 5 | `-include` advice unworkable | `U8G2GL_GENERATED_CONFIG` macro (R4); budget honest | MCP: pool 6144 → 144 B |
| 6 | `frameworks: "arduino"` | `"*"`; native builds, Arduino unchanged | MCP native + esp32dev |

## Beyond the bridge — two more, absorbed under the owner's "go until fixed"

- **Repaint paths outside the guard** (label, clock, progress bar) — R2, shared
  `u8g2gl_repaint_object()`.
- **Reference-height mode** — an eighth ambient item; PA scoping missed it, criterion 1's harness
  found it (274 pixels). R7: the guard establishes `setFontRefHeightAll()`.
- **Bool-subject comparisons ambiguous on xtensa** — the seventh defect. R8: one overload per
  subject type. Host suites could not see it; proved on ESP32 through the PlatformIO MCP.

## Where the framework establishes ambient U8G2 state, and why

In `u8g2gl_state_saver`, constructed by `u8g2gl_render_object()` and by
`u8g2gl_repaint_object()`, around every widget draw. U8G2GL's state inside each object's render;
the caller's at every other moment. A one-off in `begin()` or per frame is undone by user code
between frames or objects, and misses the blocked-loop repaints. Compare-first, measured cheaper
than unconditional setting (the PA's contrary reasoning was refuted by measurement).

## Criterion 1

**Holds for U8G2GL alone, on the host.** Foundation's render harness against this branch: five
scenarios 0 differing pixels; `plain_user_ui_handler` 0 (was 1407 before PR-05R). See
[CRITERION-1.md](CRITERION-1.md). Device not yet re-checked — the owner will attach hardware.

## Counts

C++ 401 → **415** (one known skip), CLI 1338 → **1353**, zero warnings. Runtime **0.8.0**, CLI
**0.12.0**, schema 0.4. Every project regenerated with 0.12.0 requires runtime ≥ 0.8.

## For the Chief Architect

1. **Foundation's cut-over** should switch from its build middleware to the macro: the middleware's
   glob misses silently for a `symlink://` dependency, staying green with the 6144 B pool.
2. **Foundation's harness**: `state_probe.json` text calls font mode unrestorable (stale); its
   pinned-sha check is not enforced against `-DU8G2GL_SOURCE_DIR`.
3. **R3 outcome**: §13.9 is now a review rule, not a test (owner: the lock-file guard was
   over-engineering). Worth a line in the programme's review checklist.
4. **A host-only suite cannot see target type widths.** The xtensa ambiguity reached a committed
   fixture. Consider a cross-compile of the fixture in PR-06/PR-07's CI plan.
5. **Tooling**: the owner has denied direct `pio`; PlatformIO work goes through the MCP only.
   `platform = native` needs a pinned spec (`platformio/native@1.2.1`) through the MCP.
6. The pinned foundation commit should still become a tag (`rules/04`).
