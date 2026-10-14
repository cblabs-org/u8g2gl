PR-5R2: animation that keeps time — due-time scheduling, LVGL-shaped timers, a self-updating clock

The first on-device measurement session (branch `u8g2gl-device/measurements`) ran animation on real
hardware for the first time and found it subtly wrong. A 40 px/s scroll ran at 37.9 px/s, and a loop
sleeping on `ui_handler()`'s deadline woke 4 343 times in 20 s with nothing to do. A clock's seconds
appeared 260 ms late, or never if the loop honoured `U8G2GL_IDLE`. The seconds also sat 2 px below
the hours and minutes. This PR fixes all of that, adds the mechanism the owner ruled for
time-dependent content (Q-C), and fixes three smaller defects found along the way. It lands before
PR-06, whose snapshot goldens would otherwise record the clock's baseline error.

**Verified on the device:** ESP32-S3 Nano + SSD1322, flashed through the PlatformIO MCP, with the
owner watching. Scroll **40.01 px/s**. **0** idle wakes. Every second drawn **15 ms** after its
boundary, blink on and blink off, which is one frame: render plus the 11.8 ms SPI send. **0**
skipped seconds. Criterion 1's frame is unchanged on the new runtime (`lit=1405`,
`b9042618…f62d`).

**1. The label scrolls at its configured rate, and its deadline is honest.**
- **Before:** a step ran only when `now > due`, strictly greater, and the next step was scheduled
  from when the step *ran*. Every step therefore cost at least one interval plus 1 ms, and lateness
  accumulated.
- **Steps are now scheduled from their due time.** The remainder of 1000/speed is carried, so
  30 px/s averages exactly 30.
- **A wake one interval or more late takes one step and resyncs.** It never bursts to catch up.
- **`tick()` never returns 0.** Before, it returned 0 when `now == due` and then refused to step,
  which is the spin the device measured. Millisecond wraparound is handled by difference
  arithmetic.

**2. The clock's seconds sit on the HH:MM baseline.**
- The secondary font was placed by aligning the bottoms of the two fonts' descender boxes. Digits
  sit on the baseline, and descenders differ between fonts (helvB12 4 px, helvR08 2 px), so the
  seconds landed low.
- **Now the ascents are aligned.** A real-U8G2 pixel test covers three font pairs: the lowest lit
  rows were 32/34, and are now 32/32.

**3. `u8g2gl_timer`, LVGL's timer reimplemented for this library (§11.1).**
- LVGL has no "data source" concept. Its idiom is a timer whose callback sets a subject, and that
  is what U8G2GL now offers. U8G2GL already copies `lv_timer_handler`'s return contract ([D-15]).
- **API:** `u8g2gl_timer_init/delete/pause/resume/set_period/ready/reset/set_repeat_count/get_user_data`.
  These are LVGL's names, with LVGL's `_init` convention for storage the caller owns.
- **Deliberate divergences from LVGL:**
  - **The host owns the storage, with no pool and no heap.** A fixed pool is right where the
    generator counts objects from XML; timers are created by host code the generator never sees.
    Timers link intrusively, and a timer's destructor unlinks it.
  - **Scheduling is from the due time.** LVGL's `last_run = lv_tick_get()` drifts.
  - **A subset of the calls.** Auto-delete, external data, global enable, idle statistics and list
    walking are omitted, because they exist for LVGL's heap and OS support.
- **`ui_handler()` runs due timers first,** so a subject a timer writes is drawn in the same call.
  It returns the earlier of the timer and widget deadlines. Timers run even with no active screen.
- **Safe** when a callback deletes itself or another timer, or initialises a new one.

**4. The wall clock: a developer adding a clock writes no seconds logic.**
- `u8g2gl_wall_clock` is a host-declared helper. It takes one function that returns the time, or
  says it isn't known yet, and publishes a time subject on each second boundary. The clock binds to
  that subject.
- The clock's own `tick()` now handles only the colon blink, locked to changes in its time value
  and scheduled drift-free.
- **Unknown time** (`U8G2GL_TIME_UNKNOWN`) shows `--:--` (`--:--:--` with seconds) in the same
  digit columns.
- **The library stays platform-free:** NTP, the RTC and time zones belong to the host.

**5. A binding update ends the loop's sleep.**
- **A real bug:** `ui_handler()` cleared the dirty flag *after* rendering, so a subject written
  during a render was lost. It now clears the flag before drawing, and returns 0 if the frame was
  dirtied again.
- **`u8g2gl_set_resume_cb()`** mirrors `lv_timer_handler_set_resume_cb`. It fires when the frame
  goes from clean to dirty, and when a timer gains work. It fires on the transition only, so a
  stream of writes doesn't cause a storm, and it is silent inside `ui_handler()`.
- **The threading contract is now written down (§11.1):** single-threaded, as LVGL without
  `LV_USE_OS`. Never call `ui_handler()` from a timer callback.

**6. Two smaller defects.**
- **A resized label re-measures.** `set_coords` / `set_w` / `set_h`, and bindings through them, now
  call a new protected `on_size_changed()` hook. Before, a label narrowed below its text never
  started scrolling.
- **Subjects can no longer be copied or moved.** Their observer pointers point into their own
  storage, so a copy silently corrupted both subjects.

**Versions (rules/03).**
- **Runtime 0.8.0 → 0.9.0,** for the new API.
- **CLI 0.12.0 → 0.13.0.** The generated runtime floor moved `(0, 8)` → `(0, 9)`, and that is the
  goldens' only change.
- **Schema unchanged** at 0.4.
- Projects regenerated with this CLI need runtime 0.9 or newer.

**Spec.**
- §11.1: timers, the wall clock, the resume callback, threads, and the LVGL table and divergences.
- §11.2: dirty ordering.
- §11.3: the label's deadline and the clock blink.
- §8.1: the time subject.
- §6.3: the clock.
- §21: Q-14's SPI half answered (*full frame 11.8 ms, one label's tiles 4.4 ms; material above
  roughly 10 frames/s; I²C open*).

**Tests.** C++ 415 → **501** (1 skip, `SizeOfReport.ThirtyTwoBitTarget`), 0 warnings. CLI **1353**,
unchanged. The bug-catching tests were each checked to fail against the code before the fix.

**Not in this PR.**
- **The circular scroll re-sends identical frames** while its text crosses the blank 30 px gap: the
  33 "redundant sends" the device showed. It is harmless, and the optimisation would be to skip the
  redraw while the text is fully clipped.
- **Converting widgets' `tick()` to timers.**
- **Foundation's concrete time and system-info sources,** which belong to its cut-over.

**Merge with a merge commit, not a squash** (rules/04): foundation's held branch pins a bare commit.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
