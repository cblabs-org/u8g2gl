# PR-06: Wasm Harness, CI, and Runtime Debts

## Status: COMPLETE ✅

**PR**: https://github.com/cblabs-org/u8g2gl/pull/15
**Branch**: `u8g2gl-06/wo6-readability`
**Commits**: 14 (265231a..3b76f1d)

## Owner Approval

> Approval to proceed autonomously on this workorder. Please do as much as you
> can and back-load the interactive parts. I will not be at the bench for several
> hours.

Approved 2026-10-15 ~07:00 BST. Full decomposition approved per plan gate.

## Decomposition

| WO | Topic | Branch | Commits | Status |
|---|---|---|---|---|
| WO1 | Runtime debts | `u8g2gl-06/wo1-runtime-debts` | 265231a..09abea9 (4) | ✅ |
| WO2 | Container-edge pixels | `u8g2gl-06/wo2-container-edge-pixels` | b985bff..2e0eb6d (2) | ✅ |
| WO3 | CI infrastructure | `u8g2gl-06/wo3-ci-infrastructure` | cb90fee..ee26d14 (4) | ✅ |
| WO4 | Determinism check | `u8g2gl-06/wo4-determinism-check` | f75710e..d5a0bb0 (3) | ✅ |
| WO5 | Wasm harness | `u8g2gl-06/wo5-wasm-harness` | 3b76f1d (1) | ✅ |
| WO6 | Readability + verification | (no new commits) | — | ✅ |

## Test Counts

| Suite | Baseline | Result |
|---|---|---|
| C++ | 501 | **511** (+10, 1 known skip) |
| CLI | 1353 | **1353** |
| Warnings | 0 | **0** |

## Versions

- Runtime: 0.9.0 → **0.10.0**
- CLI: 0.13.0 → **0.13.1**
- Schema: **0.4** (unchanged, owner decision)
- U8G2: **2.36.18** (pinned)

## CA Rulings Applied

1. Observer removal: public API, runtime 0.10.0, remove by (user_data, cb) pair
2. Stale binding: reproduced stale fire in test before fixing
3. Int-narrowing: debug assert in C++ scoped around coord_bound()
4. Xtensa pin: foundation's actual espressif32 resolution
5. F-STD: test both gnu++17 + injected standard (gnu++2b = C++23)
6. Determinism: demonstrated failing before passing
7. Wasm harness: D-9 parity proof included
8. Positive control: inverted (CI fails if control passes)

## Key Findings

### Version Sync Issue (PA-fixed in ee26d14)
WO1 bumped runtime to 0.10.0 but didn't propagate to
`cli/src/data/runtime-version.json`. Fixed, then §13.9 required CLI bump to
0.13.1 (d5a0bb0).

### Foundation C++ Standard
Foundation compiles as `gnu++2b` (C++23), not the `gnu++17` its ini implies.
The platform's `-std` lands after `build_flags`. CI matrix tests both.

### Wasm Parity
Wasm renders emit-project fixture deterministically:
- sha256: `90c427579704cc78a830363008464e62f8af98e7edf3ea648c73a9ff9b10fcee`
- Display: 128×64, 82 lit pixels
- Full D-9 criterion 1 parity requires foundation's scene

## Session Log

- 2026-10-15 ~07:00: Owner approval, MCP reset
- 2026-10-15 ~07:15–08:30: WO1–WO4 dispatched and completed
- 2026-10-15 ~08:30–09:30: WO5 worker rate-limited; PA completed directly
- 2026-10-15 ~09:30–09:45: WO6 verification (PA-executed)
- 2026-10-15 ~09:54: Context resumed; tests re-verified, branch pushed, PR #15 created
