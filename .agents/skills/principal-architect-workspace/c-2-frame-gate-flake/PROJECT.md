# C-2: The Frame-Gate Self-Test on CI

**Parent:** none; a follow-up found by C-1's CI (PR #29). **Base:** `main` @ `295caaf` (C-1
merged). **Worktree:** `../U8G2GL-c2`. One change, made by the PA; no worker.

## Owner approval

The PA asked, 2026-10-28, whether to fix the flaky self-test in a small PR after #29 merged. The
owner answered:

> "Yes, after merge"

and later, "ok - 29 is merged". Both given 2026-10-28.

## The flake

`designer/e2e/performance.spec.ts`'s frame-gate self-test forces 4 of 10 keystrokes to miss their
frame and asserts three things: each forced keystroke is counted 2 or more frames; every other
keystroke is counted at most 1; the gate fails. On #29's first CI run (Chromium under 4× CPU
throttle on a GitHub runner) one unforced keystroke took 2 frames (histogram `{"1":5,"2":1,"4":4}`),
so the second assertion failed; the re-run passed (`{"1":6,"4":4}`). The real latency gate in the
same file is already local-only on CI (`process.env.CI === undefined`) for this reason.

## Ruling

1. **The "every other keystroke" assertion runs only outside CI**, the same condition the real
   gate uses. The forced-keystroke and gate-fails assertions run everywhere: they are what prove
   the gate can fail, and a slow runner only makes them easier to meet. No other change.

## Status log

- **2026-10-28.** Worktree created from `main` @ `295caaf`.
- **2026-10-28. Done and verified locally.** Designer e2e (test build, Emscripten on PATH) 13
  passed + 1 skipped; `performance.spec.ts` with `CI=1` 2/2, the self-test still forcing the gate
  to fail (`{"1":6,"3":1,"4":3}`). Guard clean.
