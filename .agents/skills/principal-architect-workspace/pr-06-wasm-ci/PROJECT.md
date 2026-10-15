# PR-06: Wasm Harness, CI, and Runtime Debts

## Status: MERGED ✅

**PR**: https://github.com/cblabs-org/u8g2gl/pull/15
**Branch**: `u8g2gl-06/wo6-readability`
**Merge commit**: `ce0046c`
**Commits**: 21 (265231a..8e81395)

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
| Post-WO | CI fixes + CA review | c00d8ca..8e81395 (7) | — | ✅ |

## Test Counts

| Suite | Baseline | Result |
|---|---|---|
| C++ | 501 | **512** (+11, 1 known skip) |
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
4. Xtensa pin: pioarduino URL (bare `espressif32` resolves to legacy v7.1.3 on CI — finding)
5. F-STD: test both gnu++17 + injected standard (gnu++2b = C++23)
6. Determinism: demonstrated failing before passing
7. Wasm harness: D-9 parity proof — SHA-256 assertion, both native and Wasm
8. Positive control: inverted (CI fails if control passes)

## Key Findings

### Platform Pin Discovery (929f17b)
`platform = espressif32` is **not a stable identifier across environments**.
Resolves to pioarduino v55.03.311 locally (because pioarduino is installed)
but to Espressif's legacy v7.1.3 (GCC 8.4) on fresh CI runners. The old
compiler does not trigger the overload ambiguity the positive control detects.
**The inverted positive control caught this within days of its own author's
ruling — the strongest evidence for inverted controls the programme has.**

### D-9 Parity
Native and Wasm builds produce byte-identical pixel buffers:
- SHA-256: `bca55545ebb5a40cef2a296b7218c0192d5339717c18212360c89ff0581b03ef`
- Display: 128×64, 1024 bytes, 48 lit pixels (bare scene, no sample data)
- Verified identical on macOS (local) and Linux (CI)
- Scope: bridge-path parity (D-9), not firmware-path parity (D-17/criterion 1)

### Use-After-Free on Linux (0a42b23)
WO1's observer removal introduced a use-after-free — `remaining_slots()` bound
an object to a stack-local filler subject. Silent on macOS, 14 segfaulting tests
on Linux. **CI caught a defect introduced by this PR, in this PR.**

### Version Sync Issue (PA-fixed in ee26d14)
WO1 bumped runtime to 0.10.0 but didn't propagate to
`cli/src/data/runtime-version.json`. Fixed, then §13.9 required CLI bump to
0.13.1 (d5a0bb0).

### Foundation C++ Standard
Foundation compiles as `gnu++2b` (C++23), not the `gnu++17` its ini implies.
The platform's `-std` lands after `build_flags`. CI matrix tests both.

## Session Log

### 2026-10-15 ~07:00 — Session start
Owner approval, MCP reset. Full decomposition approved.

### 2026-10-15 ~07:15–08:30 — WO1–WO4 dispatched and completed
Runtime debts, container-edge pixels, CI infrastructure, determinism check.

### 2026-10-15 ~08:30–09:30 — WO5 worker rate-limited; PA completed directly
Wasm harness ported from departures-board `layoutsim`.

### 2026-10-15 ~09:30–09:45 — WO6 verification (PA-executed)
Readability pass, test counts verified, branch pushed.

### 2026-10-15 ~09:54 — PR #15 created
Context resumed after session interruption; tests re-verified, PR opened.

### 2026-10-15 ~11:00 — CI fixes
Submodule init fix (c00d8ca): `.gitmodules` `update = none` defeats `submodules: true`.
Use-after-free fix (0a42b23): stack-local filler subject, silent on macOS, segfault on Linux.

### 2026-10-15 ~11:47 — CA review posted
Four items: D-9 parity (blocking), platform pin, determinism coupling, stale description.

### 2026-10-15 ~12:30 — CA review remediation (1fc444c, 929f17b, 8e81395)
- D-9 parity: `test_wasm_parity.cpp` + snapshot test both assert golden SHA-256
- Platform pin: reverted to pioarduino URL after CI proved bare `espressif32` resolves wrong
- Determinism coupling: documented in SKILL.md
- PR description: refreshed
- Parity scope: clarified bridge-path vs firmware-path

### 2026-10-15 ~20:53 — PR merged
Merge commit `ce0046c`. All 5 CI checks green.

### 2026-10-15T20:55:51Z — Project Wrap-Up

**Architectural outcome**: U8G2GL has its first CI (5 jobs) and its D-9 parity
proof. The Wasm harness proves the preview is the runtime — one implementation,
two compilation targets. The inverted positive control earned its keep
immediately by catching a platform pin misconfiguration.

**Lessons for future projects**:
- `platform = espressif32` in PlatformIO is not portable — always pin explicitly
  for CI. Foundation's `platformio.ini` needs the same fix (filed as F-PLATFORM).
- Inverted positive controls catch ruling errors, not just defect-class regressions.
- Use-after-free from observer removal patterns: destructors that call
  `remove_observer()` must not reference stack-local subjects that are already destroyed.
- CI on the first run caught a defect introduced by its own PR — strongest possible
  argument for §17.3.

**Unresolved items (CA to land)**:
1. **Determinism coupling in `rules/03`**: the policy that a runtime minor bump
   forces a CLI patch bump is documented only in the standards skill. The CA ruled
   this belongs in `rules/03` beside the determinism condition and will land it.
2. **F-PLATFORM**: foundation's `platform = espressif32` is environment-dependent.
   The CA will add this to cut-over requirements alongside F-LINK / F-GLOB / F-REGEN.
