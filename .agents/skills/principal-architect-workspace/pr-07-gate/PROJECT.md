# Project: PR-07 — the gate

**Not a build.** PR-07 re-verifies the two stale gate figures, assembles one dossier a reader who
was not here can evaluate, and makes a recommendation. **The GO/NO-GO verdict is the owner's**
(`docs/implementation_plan.md` §6).

## Base and branches

- **Base:** `origin/main` @ `c30cd2d` (§6 criterion 4 rewritten and corrected, probe evidence
  merged at `dc3ace8` / `de08e29`).
- **Worktree:** `../U8G2GL-07`. **Stack:** `u8g2gl-07/wo0-setup` → `wo1-c1` → `wo2-c3-c4` →
  `wo3-dossier` → `wo4-recommendation`; the top is the PR head. **Each WO is pushed when it
  completes.**
- **Foundation:** `origin/u8g2gl-integration/wo4-readability` @ `499142f8` (PR #292, draft, [R10]).
  Read only, through `git archive` into `tmp/`. **Nothing is written to `esp32-app-foundation`.**
- **Baselines at base:** C++ 512 (one known skip, `SizeOfReport.ThirtyTwoBitTarget`), CLI 1353,
  zero warnings; runtime **0.10.0**, CLI **0.13.1**, schema **0.4**.
- **Tooling:** PlatformIO through the MCP only. **Ask the owner before every flash.** Board:
  ESP32-S3 Nano, `/dev/cu.usbmodem101` (303A:1001), currently carrying PR-5R2's test firmware.

## Corrections found while scoping (recorded, all resolved before approval)

1. The bridge placed the probe evidence on `main`; it was on branches only. Merged onto `main` by
   the Chief Architect (`dc3ace8`, `de08e29`). Cite `main` paths.
2. Five G-PROBE-2 PA commits (`21eba99`..`a3ca58f`) sit on G-PROBE's branch. Left as history
   (`rules/04`), recorded in the merge message.
3. §6 still carried criterion 4's original wording eight days after the 2026-10-13 ruling.
   Rewritten (`cc71df9`), then corrected (`c30cd2d`) for two defects the PA raised: the +6.2 s
   (wall clock, 0.8.0, `device-measurements/EVIDENCE.md`) and the +4.99 s with its breakdown (MCP
   task time, 0.7.0, foundation `pr-u8g2gl-05/evidence/EVIDENCE.md`) had been combined; and the
   note asserted the board satisfied the criterion, pre-empting the verdict.
4. **Open by design:** whether U8G2GL "controls" the build-time cost of its three integration
   libraries (`u8g2gl`, `U8G2GLDisplay`, `U8G2GLUI`). §6 leaves the word undefined; the dossier
   argues it both ways and names it as the strongest case against a pass on criterion 4.
5. C2's "99 against 105" rests on a counterfactual `C2-ANALYSIS.md` flags as never compiled and
   approximate. The caveat travels with the number.

## Work-Order ledger

The PA executes all four: each is measurement or writing only, and the flashes need the owner live.

- **[x] WO0 — setup.** Worktree, this file, owner approval recorded. Push.
- **[x] WO1 — C1 at runtime 0.10.0.** Host: foundation's render harness from a `git archive` of
  `499142f8`, built against this worktree's runtime; all five scenarios and the state probe.
  Expect `lit=1405`, sha256 `b9042618…f62d` for `connected`. Device: `device-measurements/rig/
  c1-image-a` rebuilt against 0.10.0 through the MCP; **flash only on the owner's word**. If
  either has moved, that is the finding — reported, not reconciled. Push.
- **[x] WO2 — C3 and C4 at runtime 0.10.0 / CLI 0.13.1.** Build only, no flash.
  - C3: clean `esp32dev` builds of `499142f8`, 0.8.0 against 0.10.0 (library-only copy, F-LINK),
    several clean builds each, compared like for like on `esp_diagnostics` presence; delta
    attributed by `nm`.
  - C4: interleaved rounds, legacy against migrated; generator timed alone, compilation separated
    from dependency resolution in the verbose logs. Push.
- **[x] WO3 — the dossier** (`GATE-DOSSIER.md`). Per criterion: measurement, method, commit, and
  **met / not met / met-with-qualification**. Includes the PA's re-read of the migrated board at
  `499142f8` for any surviving positioning, typography or truncation decision. The three
  limitations stand where the verdict is read: C2 rests on DiagnosticsBoard alone (G-BOARDS
  dropped 2026-10-21); one screen, four static labels; [Q-19]. Probe results in a section labelled
  context, not criterion evidence. Push.
- **[x] WO4 — the recommendation.** Reasoning, the strongest counter-case, and the owner's
  paragraph. Docs-only PR on `u8g2gl`, merged with a merge commit (`rules/04`).

**Not in scope:** the cut-over (F-LINK, F-GLOB, F-REGEN, F-PLATFORM, the repin to a tag, NTP and
system-information sources).

## Status log

- **2026-10-22 — Decomposition approved by the owner, verbatim:** "Approved, proceed with the
  PR-07 decomposition as last proposed: WO0 setup, WO1 C1 host + device (ask before each flash),
  WO2 C3 and C4 at 0.10.0 / CLI 0.13.1, WO3 dossier, WO4 recommendation, docs PR on u8g2gl."
- **2026-10-22 — WO0 done** (`7471e19`). Worktree `../U8G2GL-07` from `c30cd2d`.
- **2026-10-22 — WO1, host done; device held** (`37954af`). Host at 0.10.0: five scenarios 0
  differing, hashes equal the committed baseline, plain user 0. Device image built at 0.10.0
  (`ea3b29f8…2e5e`); asked before flashing, **owner, verbatim: "Not now".** Device half stands at
  0.9.0. `[~]` until it is flashed.
- **2026-10-22 — WO2 done** (`f4f1266`). C3: 0.8.0 → 0.10.0 RAM +40 B, flash +472..488 B,
  attributed by symbol; 85.6%, 227 233 B free; regeneration by CLI 0.13.1 changes no byte.
  C4: edit loop +4.90 s; generator 0.04–0.06 s; edit compile 0.71 s faster; fixed overhead
  +5.48 s. The second build of each tree recompiled everything with no input change and was
  discarded as a warm-up; S2 not repeated at 0.10.0.
- **2026-10-22 — WO3 done** (`a28cbec`). `GATE-DOSSIER.md`: all four criteria
  met-with-qualification. PA re-read of the migrated board finds no positioning, typography or
  truncation decision in C++; the format strings' double space and U+00B7 classed as content.
- **2026-10-22 — WO4 done.** `RECOMMENDATION.md`: GO, with four conditions on post-gate work;
  counter-case stated. Docs-only PR on `u8g2gl`, to be merged with a merge commit.
- **2026-10-22 — WO1 device done.** Owner, verbatim: "Yes, flash the C1 image (ea3b29f8…2e5e) to
  the ESP32-S3 Nano now, capture serial, and update C1-REVERIFY.md and the dossier on the PR."
  The board on USB had changed (now `/dev/cu.usbmodem2101`, MAC `80:65:99:a1:8e:90`; yesterday
  `/dev/cu.usbmodem101`, `3C:0F:02:DE:72:24`); the owner confirmed it is the SSD1322 rig before
  the flash. Flashed through the MCP, esptool hash verified; serial `runtime=0.10.0 lit=1405
  sha256=b9042618…f62d`, four of four repeats. **Device = host at 0.10.0.** C1 is met without
  qualification; the dossier and recommendation are updated (condition 1 satisfied).
