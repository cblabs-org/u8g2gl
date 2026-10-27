# E-1b: The Parser on the CST, Closing [Q-17]

**Parent:** the editor track, `implementation_plan.md` §5. **Scope and acceptance criteria:**
[E1-DECOMPOSITION.md §1, E-1b](../e-d-editor-design/E1-DECOMPOSITION.md), approved by the owner
on 2026-10-26 (recorded in [e-d-editor-design/PROJECT.md](../e-d-editor-design/PROJECT.md)).
**Base:** stacked on E-1a, `u8g2gl-e1a/wo3-readability` @ `4f2c050` (PR #22). This PR targets
`main` after #22 merges; until then its diff includes E-1a's. **Worktree:** `../U8G2GL-e1b`.

## Purpose

**One** parser for the generator and the designer. Today's tokeniser is replaced under the
existing parser by the CST, so every diagnostic can point at an attribute's exact range, and the
designer's ranges and the validator's are the same ranges.

## Owner approval

> "approved - please proceed autonomously from this point on until you run out of quota.  Please spin up sub-agents as needed."

Given 2026-10-27 as a standing instruction to continue the programme autonomously.
*Provenance note:* the owner did not review this Work-Order breakdown before it started. E-1b's
**scope** rests on the owner's 2026-10-26 approval of the E-1 decomposition; this instruction
authorises starting it within that scope. Precedent: PR-06 (owner, 2026-10-15).

## Decomposition

| WO | Topic | Branch | ACs | Status |
|---|---|---|---|---|
| WO1 | CST → `RawXmlDocument` adapter under the parser; ranges on the raw types; freeze the tokeniser's outputs; delete `xml-tokeniser.ts` | `u8g2gl-e1b/wo1-adapter` | b1, b2, b4, b5 | In progress |
| WO2 | [Q-17]: manifest diagnostics located at the attribute, with the offending text | `u8g2gl-e1b/wo2-q17` (from WO1's tip) | b1, b3 | Pending |
| WO3 | Readability review and PA verification | `u8g2gl-e1b/wo3-readability` | all | Pending |

## PA rulings

1. **`tokenizeXml` keeps its name and signature.** It is exported from `cli/src/core/index.ts`, so
   it is public API of the npm package. It becomes the CST → raw adapter (`parseCst` then a tree
   conversion), in a new file under `cli/src/core/parser/`. `decodeXmlEntities` stays exported
   too, re-exported from `cst/entities.ts`'s implementation. `xml-tokeniser.ts` is deleted (b4);
   the public names survive it.
2. **The tokeniser's behaviour is frozen before it is deleted.** E-1a's parity test compares the
   CST against `tokenizeXml`; once `tokenizeXml` is the CST, that comparison is circular. So the
   **first** commit records the old tokeniser's diagnostics (code, line, column, message) for the
   whole parity corpus into a committed JSON golden under `cli/test/cst/`, and the parity test
   reads the golden. The old tokeniser's tree output is frozen the same way for the 105 repository
   files (element names, attribute names and values and `loc`s, text content, comments), so the
   adapter is checked against the real old behaviour, not against itself.
3. **E-1a's three intentional differences become real.** A file with a BOM, CDATA in an element,
   and an out-of-range character reference now parse. That is accepted. The golden records the
   old behaviour on those inputs and the test asserts the new one explicitly, so the change is
   visible and deliberate.
4. **The five tokeniser locations E-1a judged wrong are not fixed here.** b1 allows only [Q-17]
   location moves. They are recorded as a follow-up in this file's status log.
5. **No version bump.** Generated output must be byte-identical (b2). If any golden moves, stop
   and report: that is a defect in E-1b, not a reason to bump.
6. **Ranges.** `RawXmlAttribute` gains `nameRange` and `valueRange`, `RawXmlElement` gains `range`
   (`{ start, end }` offsets into the source). The existing `loc`/`nameLoc`/`endLoc` fields stay,
   derived from the ranges, so no consumer changes.

## Status log

- **2026-10-27.** Worktree created from E-1a's tip `4f2c050`, `extern/u8g2` checked out. WO1
  issued.
