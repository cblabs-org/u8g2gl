# PR-07 gate dossier

The evidence for the stop-or-go decision in `docs/implementation_plan.md` §6, in one place, for a
reader who was not here. **The verdict is the owner's.** This document supplies the measurements,
their limits, and (in [RECOMMENDATION.md](RECOMMENDATION.md)) the Principal Architect's
recommendation.

**Read against:** `origin/main` @ `c30cd2d` (§6 as corrected 2026-10-22). Runtime **0.10.0**,
CLI **0.13.1**, schema **0.4**. Foundation's held integration branch
`u8g2gl-integration/wo4-readability` @ `499142f8` (PR #292, draft, never merged — [R10]).

---

## The verdict at a glance

| # | Criterion (§6, current text) | Result | Measured at |
|---|---|---|---|
| 1 | Pixel-identical to the legacy board, by automated diff | **Met-with-qualification** — host at 0.10.0; device still at 0.9.0 | host `c30cd2d`; device `pr-05r2` 0.9.0 |
| 2 | Wholly declarative; the framework does not inflate authored code | **Met-with-qualification** — declarative half met; "does not inflate" rests on one board and an uncompiled estimate | foundation `499142f8` |
| 3 | Flash and RAM comfortable on `esp32dev` alongside WiFi and TLS | **Met-with-qualification** — link-time only; no run-time heap measurement | `c30cd2d` + `499142f8` |
| 4 | The loop is not slower for any reason the framework controls | **Met-with-qualification** — met only if the build tool's per-library scan is not something U8G2GL "controls"; §6 leaves that word to the owner | `c30cd2d` + `499142f8` / `7396e43d` |

**No criterion is met without qualification, and none is not met.** Every qualification is
stated in full below, and criterion 4's is the strongest case against a pass.

### Three limitations that bound every result above

1. **Criterion 2 rests on one board.** G-BOARDS — two further migrations, OTAProgressBoard and
   WiFiWizardBoard — was **dropped by the owner on 2026-10-21** (`a19aefc`). That was deliberate,
   and this is its recorded consequence: "the framework does not inflate authored code" is a
   statement about DiagnosticsBoard alone. On a GO, PR-10 migrates the remaining boards and the
   measurement arrives across six at no extra cost.
2. **One screen, four static labels.** The migrated board has no animation, no conditional
   visibility, no second screen and no input. Every criterion was measured on the easiest content
   the framework will ever draw.
3. **[Q-19]: a collection widget costs 2,304 bytes per instance whatever `max_rows` declares**
   (`DEFAULT_MAX_ROWS × DEFAULT_MAX_COLS × DEFAULT_MAX_CELL_CHARS` = 16 × 6 × 24), because §9.2's
   generated storage does not exist, and **§18's size report will not show it**. The departures
   screen G-PROBE-2 built used two such widgets — 4,608 bytes the declared `max_rows="1"` and
   `max_rows="10"` do not reflect. This is outside criterion 3's measurement (which has no
   collection widget), and it is the first thing a real application screen would hit.

---

## Criterion 1 — pixel identity

**Text:** *Renders pixel-identically to the legacy board, by automated diff — not by eye.*

**Measurement (host, 2026-10-22, runtime 0.10.0).** Foundation's own render harness, built from
`git archive 499142f8` unedited, against this repository at `c30cd2d`
([C1-REVERIFY.md](C1-REVERIFY.md)):

- All five scenarios **0 differing pixels**; migrated `.bin` files hash identically to the legacy
  baseline, and the regenerated baseline hashes identically to foundation's committed one.
  `connected`: lit 1405, `b9042618…f62d`.
- State probe: a **plain user** — `begin()` only, no foundation module, no legacy begin-time calls
  — draws the same frame: 0 differing.
- Truncation probe: 181 of 181 lengths identical, 41 of 41 truncated identical.

**Measurement (device).** ESP32-S3 Nano + SSD1322, a plain-user sketch hashing the frame buffer:
`runtime=0.9.0 lit=1405 sha256=b9042618…f62d`, identical to the host
(`pr-05r2-timing/wo8-device/logs/f1-criterion1.serial.txt`). The same image built against 0.10.0
on 2026-10-22 (`firmware.bin` `ea3b29f8…2e5e`) **was not flashed: the owner answered "Not now".**

**History.** PR-05 passed with 0 pixels, but with the legacy module setting `setFontPosTop()`;
without it, 1,407 pixels differed, and a further 274 on reference height. PR-05R fixed both in the
runtime; on `main` at the time a plain user crashed on the first frame on the device. Since 0.8.0
the result has been about U8G2GL alone (`pr-05r-runtime-fixes/CRITERION-1.md`).

**Result: met-with-qualification.** The qualification is narrow: the device half is one runtime
minor behind `main` (0.9.0 against 0.10.0). 0.10.0 moved no pixel on the host, against real U8G2,
for any scenario. Flashing the built image removes the qualification.

**Does not show:** other screens; the SSD1322 at other bus speeds; I²C displays; the cut-over
itself (the legacy module is not removed in the harness).

---

## Criterion 2 — declarative, and not inflating authored code

**Text:** *No positioning, typography or truncation decision remains in C++. Total authored code
is compared against the legacy board with the growth attributed by concern — growth from the
framework itself must be immaterial; growth from choices made independently of it is named and
excluded rather than assumed.*

**This criterion was rewritten on 2026-10-16 after its original wording ("materially shorter and
clearer") was measured and failed.** §6 keeps the original, the measurement and the reasoning.
The rewritten first half is stricter than the original; the second half is the one that changed
the outcome.

### First half: wholly declarative — met

Re-read by the PA at `499142f8`, every line of `modules/U8G2GLDisplay/boards/
DiagnosticsScreenBoard.{hpp,cpp}` and of the generic host `U8G2GLScreenBoard.{hpp,cpp}`,
`U8G2GLDisplay.{hpp,cpp}`:

- **Positioning:** none in C++. All four rows' `x`, `y`, `width`, `height` are in
  `screens/screen_diagnostics.xml`. (Legacy had them at seven sites in `DiagnosticsBoard`.)
- **Typography:** none in the board. Fonts and alignment (`align="center"` on row 1) are in the XML.
  The host calls `setFont(AppFonts::defaultSmall())` only when no font is current
  (`U8G2GLScreenBoard.cpp:86-88`), as a guard against a null-font crash in the runtime of the
  time. It changes no pixel (every label sets its own font), and runtime 0.8.0 removed the cause;
  it is cut-over debris, not a layout decision.
- **Truncation:** display truncation is `long_mode="dots"` on rows 2–4, in the XML.
- **What stays in C++, and why it is not a layout decision:** reading WiFi, uptime and heap;
  formatting the three strings (`snprintf`, byte-identical to legacy); throttling to 1 s;
  publishing to subjects. Two choices inside those format strings are visual — the two-space gap
  in `"Heap: %luKB  v%s"` and the U+00B7 separator in row 2 — and **the PA classes them as
  content, not layout**. A reader who disagrees has found the one place this half could fail.
- **An unenforced invariant, carried from `C2-ANALYSIS.md` §4:** the C++ buffers (`char
  wifi[64]`, `uptime[32]`, `heap[48]`) must match the subjects' `max_len` in `globals.xml`
  (63, 31, 47). Nothing checks it. A longer buffer is cut silently at the subject — a byte-level
  truncation that is not a layout decision but does live across two languages.

### Second half: does not inflate authored code — met-with-qualification

From `pr-05-integration/C2-ANALYSIS.md`, counted with foundation's `count_lines.py` at `499142f8`:

| | Legacy | Migrated as shipped | Migrated without the testability split |
|---|---:|---:|---:|
| XML code lines | — | 34 | 34 |
| Board C++ code lines | 101 | 99 | 59 |
| `main.cpp` code lines | 4 | 6 | 6 |
| **Authored code lines** | **105** | **139 (+32%)** | **99 (−6%)** |

- **Raw totals grow 32%** (39% at PR-05's commit). That stands as a finding.
- **Attributed by concern:** 40 of the migrated board's 99 C++ code lines are the read/format
  split WO2 required so the harness could test the board. It is not a framework cost — a board can
  publish from one inline `tick()` as legacy did. **Named and excluded**, as the criterion requires.
- **The excluded figure is an estimate.** The "without the split" column is a counterfactual
  board that **was never compiled**; `C2-ANALYSIS.md` calls it approximate, ±5 lines. "99 against
  105" carries that caveat wherever it appears.
- **The layout concern:** 24 legacy layout code lines left C++ entirely, replaced by 18 lines of
  layout XML.
- **Also excluded, and named here because the criterion says framework growth must be
  immaterial:** the generic host (`U8G2GLScreenBoard` + `U8G2GLDisplay`, 86 code lines) and
  `u8g2gl.xml` are paid once per application, not per board, and `C2-ANALYSIS.md` leaves them out
  of the per-board count. With one migrated board they are not amortised: counted in, the
  framework's footprint is 99 + 86 = 185 against 105. Whether a one-off integration cost is
  "growth from the framework itself" is a reading the owner can reject. The answer arrives
  measured, not projected, only when a second board exists (limitation 1).

**Result: met-with-qualification.** The declarative half is met strictly. The inflation half is
met on the per-board reading, on one board, through an estimate that was not compiled, and with a
one-off integration cost set aside.

---

## Criterion 3 — flash and RAM on `esp32dev`

**Text:** *Measured flash and RAM comfortable on `esp32dev` alongside WiFi and TLS.*

**Measurement (2026-10-21, runtime 0.10.0)** — [C3-C4-REMEASURE.md](C3-C4-REMEASURE.md). Clean
builds of foundation `499142f8`, whose `esp32dev` firmware links WiFi, the HTTPS stack
(`NetworkClientSecure`, mbedTLS) and PsychicHttp. Compared like for like on `esp_diagnostics`.

| | RAM (static) | Flash | App partition (1,572,864 B) |
|---|---:|---:|---|
| Legacy foundation `7396e43d` | 57,500 B | 1,336,147 B | 84.9% |
| Migrated, runtime 0.8.0 | 57,340 B | 1,345,143–1,345,159 B | 85.5% |
| **Migrated, runtime 0.10.0** | **57,380 B** | **1,345,631 B** | **85.6%**, 227,233 B free |

- **0.8.0 → 0.10.0: RAM +40 B, flash +472 to +488 B**, attributed symbol by symbol (observer
  removal, label changes, the resume callback; the binding pool +16 B; four objects +4 B each).
  The stale +568 B (0.7.0 → 0.8.0) still stands for its own step.
- **Regenerating with CLI 0.13.1 changes no byte** (F-REGEN moves stamps and the runtime floor
  only).
- **Against legacy:** RAM −120 B, flash +9.5 KB (+0.6 points). The two foundation commits differ
  in more than U8G2GL, so +9.5 KB is an upper bound on the framework's cost.

**Result: met-with-qualification.** The framework's share is at most 0.6 points of the
partition; the 84.9% was the application's before U8G2GL arrived. The qualification: **this is
link-time static memory.** No run-time heap figure exists with WiFi and TLS actually connected,
and Q-4's "alongside WiFi and TLS" is, strictly, a run-time question. Static RAM is lower than
legacy, and the runtime allocates nothing on the heap, so the PA expects no run-time difference.
That is a reason, not a measurement. Limitation 3 ([Q-19]) is outside this measurement.

---

## Criterion 4 — the edit loop

**Text (rewritten 2026-10-22; substance ruled by the owner 2026-10-13):** *The
edit–regenerate–rebuild loop is not slower for any reason the framework controls. The generator's
own cost and the compile time are measured separately from the build system's. Growth
attributable to U8G2GL must be immaterial; growth from the build tool's dependency resolution is
named, quantified and attributed, not absorbed.* The designer's loop is tested at E-2, not here.

**The original wording — "faster in practice than editing C++ was" — is not met** on any
measurement taken, and §6 records that.

**Measurement (2026-10-22, runtime 0.10.0 / CLI 0.13.1)** — [C3-C4-REMEASURE.md](C3-C4-REMEASURE.md).
Five interleaved rounds, a matched one-coordinate edit on each side, hook configured so every
migrated build regenerates; PlatformIO's own timing; host load 1.3–2.2.

| | Legacy | Migrated | Difference (paired median) |
|---|---:|---:|---:|
| Edit build | 22.71 s | 27.61 s | **+4.90 s** (+22%) |
| No-change build | 18.79 s | 24.30 s | **+5.48 s** |
| Work an edit causes | 3.88 s | 3.17 s | **−0.71 s** |
| Generator alone | — | 0.04–0.06 s | — |

**The three quantities §6 asks for:**

1. **Generator: 0.04–0.06 s.** Immaterial.
2. **Compile and link of the edit: 0.71 s faster than legacy.** Immaterial, and in the
   framework's favour.
3. **Build system: +5.48 s of fixed per-build overhead**, paid on every build whether anything
   changed or not. It tracks the dependency graph PlatformIO walks: 6,265 lines for legacy, 8,944
   for migrated. The walk grows because of three added libraries: `u8g2gl` (the runtime),
   `U8G2GLDisplay` (the integration module) and `U8G2GLUI` (the generated UI). Attribution to the
   dependency finder rests on 0.8.0's experiment, in which `lib_ldf_mode = off` with explicit
   `lib_deps` turned +6.24 s into −14 s. **That experiment was not repeated at 0.10.0.**

The three earlier figures, each on its own basis: +4.99 s (MCP task time, 0.7.0, foundation's
PR-05 evidence); +6.24 s (wall clock, 0.8.0, `device-measurements/EVIDENCE.md`); +4.90 s (here).
**Do not combine them.** They agree on shape, not size.

### The open question: does U8G2GL "control" the +5.48 s?

§6 leaves "controls" undefined on purpose and requires this document to argue it both ways. It
decides the criterion.

**Not controlled, so the criterion is met:**
- Everything U8G2GL itself does in the loop is negligible or faster: the generator costs 0.05 s,
  and the edit compiles 0.71 s faster than the hand-written board.
- The cost is PlatformIO's per-library scan, an implementation choice of the build tool.
  `lib_ldf_mode = off` with explicit `lib_deps` removes it entirely **without changing U8G2GL's
  packaging**: the same three libraries then build 14 s faster than legacy.
- Three libraries is foundation's own convention: `LVGLDisplay` + `UIDesign` is the same
  runtime/integration/UI split. Any display framework integrated by that convention pays the same
  scan.
- Of the three, two (`U8G2GLDisplay`, `U8G2GLUI`) are foundation-side libraries, laid out by
  foundation's precedent.

**Controlled, so the criterion is not met — the strongest case against a pass:**
- **The +5.48 s exists only because of what U8G2GL adds.** Remove U8G2GL and it disappears. A
  framework that requires its consumer to add three libraries chooses the consumer's scan cost,
  whatever tool performs the scan.
- **It is paid on the configuration that ships.** The known way out costs about 45 hand-kept lines
  (a 48-library list, an `-I` per module, a `symlink://` workaround for a name collision), moves the
  image by about 430 B, and **was not adopted**. On foundation's defaults, every build, including
  every edit, is about 5 s slower: +22% on the edit loop.
- **U8G2GL could reduce it and has not tried.** It controls how many libraries a consumer needs
  (the generated UI could compile inside the integration module or the project; the integration
  module could be thinner) and what it documents. "Not slower for any reason the framework
  controls" invites the question of what the framework did about the one reason it is slower.
- Under the original wording this criterion failed, and the new wording passes by reclassifying
  the same +5 s. That is the owner's ruling (2026-10-13), not an error, but it means **both
  criteria that failed on measurement passed after rewording.** A sceptical reader of this gate
  will notice.

**Result: met-with-qualification.** It is met if "controls" means the framework's own work
(generation and compilation). It is not met if it includes the integration cost the framework
imposes on its consumer's default build. The PA's reading is in
[RECOMMENDATION.md](RECOMMENDATION.md); the decision is the owner's.

---

## Context: what the probes showed — *not gate evidence*

None of this bears on a criterion. It is the programme's strongest evidence that the architecture
reaches its actual target, and that is why it is here, labelled, rather than folded into a
criterion it does not belong to.

- **The custom-widget path works end to end** (G-PROBE-2,
  `g-probe2-widgets/WIDGET-PATH.md`). Two project widgets (`wd_service_list`,
  `wd_train_formation`) with `<api>` manifests validate, generate, compile under `-Werror`,
  compose with built-in elements, and render. That had never been tried before.
- **A real National Rail departures screen is 15 lines of XML plus two C++ widgets**: 4,810 lit
  pixels, hashed `0b0e554a…8156`. The formation diagram (157 SLOC of pixel arithmetic) is C++ by
  design (§6.5).
- **[Q-8] repeaters and [Q-15] cards are not needed** to ship that screen, so both stay deferred.
- **Superseded:** G-PROBE-1's Part 2 (`g-probe-departures/EXPRESSIVENESS.md`) concluded the schema
  "cannot express" a departures board. It evaluated the built-in element set as if it were the
  whole framework. Its Part 1 render and Part 3 costs stand.
- **Corrected:** G-PROBE-2's headline "§9's typed API generates: YES" is wrong for collections.
  The collection API is hand-written and the storage uses the defaults. That correction is
  `PROGRAM.md` 2026-10-21 and limitation 3 above.
- `WIDGET-PATH.md` links its evidence with `file:///` paths into the PA's local worktrees, which
  do not resolve on `main`. The evidence is on `main` under `g-probe2-widgets/evidence/`.

---

## Evidence index (all on `main` unless stated)

| Criterion | Document | Taken at |
|---|---|---|
| 1 | `pr-07-gate/C1-REVERIFY.md` (this PR); `pr-05r-runtime-fixes/CRITERION-1.md`; `pr-05r2-timing/wo8-device/logs/f1-criterion1.serial.txt` | 0.10.0 host; 0.8.0; 0.9.0 device |
| 2 | `pr-05-integration/C2-ANALYSIS.md`; PA re-read in this document | foundation `499142f8` |
| 3 | `pr-07-gate/C3-C4-REMEASURE.md` (this PR); `device-measurements/EVIDENCE.md` §M5 | 0.10.0; 0.8.0 |
| 4 | `pr-07-gate/C3-C4-REMEASURE.md` (this PR); `device-measurements/EVIDENCE.md` §M5; foundation `pr-u8g2gl-05/evidence/EVIDENCE.md` (on `499142f8`) | 0.10.0; 0.8.0; 0.7.0 |
| Context | `g-probe-departures/`, `g-probe2-widgets/`, `PROGRAM.md` 2026-10-21 | merged `dc3ace8`, `de08e29` |

**Out of scope here, and recorded for the cut-over:** F-LINK, F-GLOB, F-REGEN, F-PLATFORM, the
repin to a tag, and the NTP and system-information sources U8G2GL does not own. The host's
null-font guard and font-mode restore in `U8G2GLScreenBoard::render()` also belong there.
