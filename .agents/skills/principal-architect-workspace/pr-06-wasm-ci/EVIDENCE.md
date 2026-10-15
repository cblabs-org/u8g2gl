# PR-06 CI Failure Evidence

Per the bridge: "evidence that the CI checks can fail, not just that they pass."

## 1. Xtensa Cross-Compile — Positive Control

The frozen pre-R8 fixture (`ctl_corpus/`, `test/xtensa_control/pre_fix/`) fails
to compile on xtensa with overload ambiguity — the exact defect class the check
was designed for.

CI asserts this failure with an inverted assertion:

```yaml
- name: "Positive control must FAIL"
  run: |
    cd test/xtensa
    if pio run -e ctl_${{ matrix.env_name }} 2>&1; then
      echo "::error::Positive control passed — the check no longer detects the defect class"
      exit 1
    else
      echo "Positive control failed as expected (xtensa overload ambiguity detected)"
    fi
```

**The inverted control caught a real misconfiguration during CA review.** When
the platform pin was changed to bare `espressif32` (resolving to legacy v7.1.3
on CI), the positive control *passed* — and the inverted assertion fired:
`::error::Positive control passed — the check no longer detects the defect class`.
This led to the finding that `espressif32` is not a stable identifier.

## 2. Determinism Check (§13.9)

Demonstrated failure: synthetic commit modifying a golden file without an input
change or CLI version bump produced:

```
::error::Generator output changed without an input change and without a CLI version bump (§13.9).
Generator output changed without an input change and without a CLI version bump (§13.9).
Exit code: 1
```

## 3. D-9 Parity Proof

`test_wasm_parity.cpp` asserts SHA-256 golden
`bca55545ebb5a40cef2a296b7218c0192d5339717c18212360c89ff0581b03ef`.
The Wasm snapshot test (`wasm/test/snapshot.test.mjs:89`) asserts the same hash.
Any divergence between native and Wasm renders fails one or both tests.

Verified identical on macOS (local) and Linux (CI runner), confirming
platform-independent pixel buffers.

## 4. Use-After-Free (CI-caught)

Commit `0a42b23` fixed a use-after-free that was **silent on macOS but caused
14 segfaults on Linux CI**. This is direct evidence that CI catches defects
the developer's local machine cannot.

## 5. C++ and CLI Suites

512 C++ tests, 1353 CLI tests. A broken commit causes visible test failures
in the CI output.
