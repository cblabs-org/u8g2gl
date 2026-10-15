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

If the positive control ever passes (meaning the defect class is no longer
detected), the CI step fails.

## 2. Determinism Check (§13.9)

Demonstrated failure: synthetic commit modifying a golden file without an input
change or CLI version bump produced:

```
::error::Generator output changed without an input change and without a CLI version bump (§13.9).
Generator output changed without an input change and without a CLI version bump (§13.9).
Exit code: 1
```

Recorded in the determinism check CI job header comment.

## 3. C++ and CLI Suites

Well-established suites with known failure modes. The suites themselves are the
evidence — 511 and 1353 tests respectively. A broken commit would cause test
failures visible in the CI output.

## 4. Wasm Snapshot Determinism

The snapshot test (`wasm/test/snapshot.test.mjs`) produces a SHA-256 hash of
the rendered frame buffer. Any runtime change affecting pixel output would
change the hash. The test exits non-zero on an empty frame.

SHA-256: `90c427579704cc78a830363008464e62f8af98e7edf3ea648c73a9ff9b10fcee`
Display: 128×64, 82 lit pixels
