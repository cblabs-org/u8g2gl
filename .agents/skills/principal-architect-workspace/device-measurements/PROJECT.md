# Project: device-measurements — on-device measurement session

A **measurement session**, not a feature PR. It produces evidence and changes no runtime or CLI
code. A defect found here is a finding with a reproduction, for PR-06 or a new remediation — never
a fix in this branch.

## Base and branch

- **Base:** `u8g2gl-05r/wo6-readability` @ `81e533f` (PR #13, open). Runtime 0.8.0 / CLI 0.12.0.
  `main` is 0.7.0 and crashes on the first frame of a plain user's render (`CRITERION-1.md`).
- **Branch:** `u8g2gl-device/measurements`, evidence only, in worktree `../U8G2GL-device`. #13's
  branch and its worktree `../U8G2GL-05r` are not written to.
- **Rig:** copied from `../U8G2GL-05r/tmp/` into this worktree's `tmp/device/` and `tmp/fdn/`
  (git-ignored), **without** `.pio-mcp-policy.json` and `.pio-mcp-workspace/`, so this rig is
  not enrolled in any MCP policy profile and every flash needs approval.
- **Foundation** is never written to. What is needed comes by `git archive` into `tmp/`.

## Hardware

ESP32-S3 Nano (`arduino_nano_esp32`, USB `303A:1001`, seen at `/dev/cu.usbmodem101`) with an
SSD1322 256×64: CS 10, DC 9, SCK 48, MOSI 38, no reset. `SPI.begin(48, 47, 38, -1)`.

## Measurements

| Id | Question | Needs | Priority |
|---|---|---|---|
| C1 | Sanity: rig still gives `lit=1405`, sha256 `b9042618…f62d` | flash F1 | gate for the rest |
| M2 | [Q-14] SPI: full 2048-byte frame vs dirty tiles for one changed label | flash F2 | 1 |
| M4 | xtensa sweep of the generated corpus — PR-06 CI rehearsal | build only | 2 |
| M1 | Frame loop at bus speed; are [D-15] deadlines honoured | flash F3 + owner's eyes | 3 |
| M3 | `u8g2gl_repaint_object()` with the loop blocked; state guard | flash F3 + owner's eyes | 4 |
| M5 | Criterion 3 (flash/RAM on 0.8.0) and Criterion 4 (`lib_ldf_mode`, explicit `lib_deps`) | build only | 5 |

## Work-Order ledger

- **[ ] [wo1-rig-firmware](wo1-rig-firmware/WORKORDER.md):** Re-point the copied rig at this
  worktree; build image A (unchanged `device_after`), image B1 (M2) and image B2 (M1 → M3).
  Build only, through the MCP. `standard`.
- **[ ] [wo2-build-measurements](wo2-build-measurements/WORKORDER.md):** M4 xtensa sweep (with
  a positive control at the pre-fix runtime), then M5. Build only, through the MCP. `standard`.
- **[ ] wo3-flash-session:** PA with the owner present. F1 (image A), F2 (image B1), F3 (image
  B2), asked for once, lock around each. MCP `upload_firmware` first; if refused, ask the owner in the moment before any
  direct `pio`. A third flash only on a broken image B, asked separately. `interactive`.
- **[ ] wo4-evidence:** PA reproduces headline figures from raw logs, writes `EVIDENCE.md` to the
  `CRITERION-1.md` standard, commits on this branch.

WO1 and WO2 run in parallel: disjoint `tmp/` directories (`tmp/device/` against `tmp/m4/`,
`tmp/m5/`), no tracked source touched by either. **Workers do not commit**; the PA reviews and
commits, so no two parties share HEAD.

## Rulings

- **R1 — Q-14 screen.** Q-14 asks for a departures-board screen; none exists on this rig. Use
  foundation's diagnostics screen (the real screen on this panel), change one row. State that it
  is not the departures board. The runtime has no dirty-bounds union, so the tile rectangle is
  computed by hand: M2 measures transfer, not bookkeeping. I²C stays open.
- **R2 — M4 coverage.** The brief's corpus (`cli/test/generator/fixtures/*/expected/`) is one
  project, 6 `.cpp`. Also compile foundation's committed generated diagnostics project and the M1
  scratch project, reported separately. Warnings are listed, not failures. Both `esp32dev`
  (LX6) and `esp32-s3` (LX7) targets.
- **R3 — Owner's eyes** on the panel during F3 for M1 and M3; confirmed at flash time.
- **R4 — Push** of this branch is asked at the end, not assumed.
- **R5 — Policy.** The `lab_admin` enrolment of `../U8G2GL-05r/tmp/device` was found **still
  live** on 2026-10-12 (`approvalRequiredOperations: []`, `upload_firmware` allowed). No MCP
  operation is run in that folder. Revoking it is the owner's action.

## Status Log

- **2026-10-12** — Decomposition presented (four WOs, flash points F1 + F2 in one sitting, R1–R5
  as proposed defaults). **Owner's approval, verbatim: "approve".** Taken as approval of the plan
  as written including the proposed defaults for the four open questions (R1–R4). Worktree
  `../U8G2GL-device` created on `u8g2gl-device/measurements` @ `81e533f`; rig copied without
  policy files.
- **2026-10-12** — PA refinement within the approved plan: M2 split into its own image (B1) from
  M1/M3 (B2), so the top-priority measurement does not depend on the scratch screen. Flashes F1–F3
  in one sitting, one ask. WO1 and WO2 written and dispatched in parallel.

## Session Log
