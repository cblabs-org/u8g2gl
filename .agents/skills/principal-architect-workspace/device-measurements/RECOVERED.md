# Recovered scratch evidence

These files were written to the git-ignored `tmp/` of the `U8G2GL-device` worktree
(branch `u8g2gl-device/measurements`, tip `28ce9b2`) and cited by this project's records but
never committed. They were recovered when that worktree was removed on 2026-10-26 and filed
here unedited. `.log` files are renamed `.txt` because `*.log` is git-ignored.

| Filed as | Original `tmp/` path | Cited by |
|---|---|---|
| `wo1-rig-firmware/CAPTURE.md` | `CAPTURE.md` | WO1 deliverables |
| `rig/logs/build-f1.txt`, `upload-f1.txt` | `device/logs/{build_f1,upload_f1}.log` | PROJECT.md, flash F1 |
| `rig/logs/upload-f2.txt` | `device-m2/logs/upload_f2.log` | flash F2 |
| `rig/logs/upload-f3.txt` | `device-m1/logs/upload_f3.log` | flash F3 |
| `rig/logs/upload-f4.txt` | `device-m1c/logs/upload_f4.log` | flash F4 |
| `evidence/m4/esp32dev.build.out.txt` | `m4/logs/esp32dev.build.out.txt` | PR06-SPEC.md |
| `evidence/m5/*` | `m5/logs/*` (and `m5/fdn-07/first-build-sdkconfig-defaults.log`) | EVIDENCE.md §§3–4, WO2 report |

The F1–F4 serial logs were already committed under `rig/logs/` and are identical.

**Left out:** the three `m5/logs/nm-*.txt` symbol dumps (about 580 KB each); WO2's report quotes
the one fact drawn from them (`s_binding_pool` = 96 B). `m5/EVIDENCE-499142f8.md` is a copy of
esp32-app-foundation's `pr-u8g2gl-05/evidence/EVIDENCE.md` at `499142f8` and lives there.

**Not recovered:** `m5/logs/fdn-08.clean.pio.log` (EVIDENCE.md, the 0.8.0 rebuild row) and the
`m5/diag/` reproduction directories were not in the worktree when it was removed. The nearest
surviving log is `evidence/m5/fdn-08.pio.build.txt`.
