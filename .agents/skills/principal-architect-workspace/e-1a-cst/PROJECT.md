# E-1a: CST and Lossless Round-Trip

**Parent:** the editor track, `implementation_plan.md` §5. **Scope and acceptance criteria:**
[E1-DECOMPOSITION.md §1, E-1a](../e-d-editor-design/E1-DECOMPOSITION.md), approved by the owner
on 2026-10-26 (recorded in [e-d-editor-design/PROJECT.md](../e-d-editor-design/PROJECT.md)).
**Base:** `origin/main` @ `019b103`. **Worktree:** `../U8G2GL-e1a`.

## Purpose

The document model `[UD-3]` requires: a concrete syntax tree that preserves every byte, records
an exact range for every part, and turns an editing intent into a minimal text edit. Nothing
consumes it yet; E-1b moves the parser onto it.

## Owner approval

> "approved - please proceed autonomously from this point on until you run out of quota.  Please spin up sub-agents as needed."

Given 2026-10-27, in reply to the Chief Architect's plan for the Tier-1 PR (#19), as a standing
instruction to continue the programme autonomously. *Provenance note:* the owner did not review
this Work-Order breakdown before it started. The approval anchoring E-1a's **scope** is the
owner's 2026-10-26 approval of the E-1 decomposition; this standing instruction is what
authorises starting it and the breakdown below, within that approved scope. The same precedent
is PR-06's (owner, 2026-10-15: "Approval to proceed autonomously on this workorder").

## Decomposition

| WO | Topic | Branch | ACs | Status |
|---|---|---|---|---|
| WO1 | CST parse and print, diagnostics parity, isomorphism test, bench | `u8g2gl-e1a/wo1-cst` | a1, a2, a5, a6, a7, a8 | In progress |
| WO2 | Minimal-edit functions | `u8g2gl-e1a/wo2-edits` (from WO1's tip) | a3, a4 | Pending |
| WO3 | Readability review and PA verification | — | all | Pending |

One worker, WO1 then WO2, sequentially in this worktree.

## PA rulings

1. **Boundary, one deviation from E1-DECOMPOSITION.** a7's architecture test goes in
   `cli/test/architecture/` beside `layering.test.ts`, not under `cli/test/cst/`, because it
   covers all of `cli/src/core/`. It is a new file; `layering.test.ts` is not edited.
2. **No version bump.** E-1a changes no generator output and no runtime, so neither the CLI nor
   the runtime version moves (rule 03). The determinism check must stay green with no bump.
3. **Not exported from `cli/src/core/index.ts` yet.** The CST's public surface is settled when
   E-1b and E-2 consume it; exporting it now would make it API before anything uses it.
4. **Diagnostics parity (a6)** compares code, line and column with today's `tokenizeXml` on every
   malformed fixture. Where the tokeniser's location is arguably wrong, parity still wins in
   E-1a; the worker reports the case and E-1b decides.

## Status log

- **2026-10-27.** Worktree created from `origin/main` @ `019b103`. WO1 issued.
