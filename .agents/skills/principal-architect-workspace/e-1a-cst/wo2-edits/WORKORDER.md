---
name: e-1a-wo2
description: Work Order 2 of E-1a — minimal-edit functions over the CST
---

# Role

As WO1. **Parent project:** `e-1a-cst` ([PROJECT.md](../PROJECT.md)).

# Where you work

- Same worktree, `.`. When WO1 is committed, create
  **only** this branch from WO1's tip: `git checkout -b u8g2gl-e1a/wo2-edits`. That is the one
  branch this WO authorises. Verify with `git branch --show-current` before every commit.
- Do not push. Commit trailer as WO1.

# Strict boundary box

`cli/src/core/cst/**` and `cli/test/cst/**` only.

# What to build

Edit functions, each taking the CST (and its source text where needed) and returning
`TextEdit[]` (`{ start, end, text }`, offsets into the original text), **never** a new document.
Also an `applyEdits(text, edits)` helper for tests and consumers (non-overlapping edits, applied
from the end).

- `replaceAttributeValue(attr, newDecodedValue)`: re-encode for the attribute's quote character
  (`&amp;`, `&lt;`, the quote itself), keep the quote style.
- `insertAttribute(element, name, value)`: after the last attribute, matching the element's
  layout — same line if its attributes share a line, otherwise one per line with the existing
  attributes' indentation. Element with no attributes: one space after the name.
- `removeAttribute(attr)`: removes it and its leading whitespace; if it was alone on its line,
  removes the line.
- `insertElement(parent, index, xmlFragment)`: indentation copied from the nearest sibling, or
  the parent's plus one step (detect the step from the document; default two spaces). Handles a
  self-closing parent by expanding it.
- `removeElement(element)`: its own lines only, never an adjacent comment.
- `renameElementTag(element, newName)`: start and end tags.

# Checklist

- [x] **a3** — every edit test asserts that the before/after line diff touches only the target's
      lines, and for `replaceAttributeValue` exactly one line. Write a small line-diff helper in
      the test folder.
- [x] **a4** — replacing `a &amp; b` with `a & c` writes `a &amp; c`; single- and double-quoted
      values keep their quotes; a value containing the quote character is escaped.
- [x] Each function has tests on: a compact one-line element, a one-attribute-per-line element,
      CRLF input, tab indentation, and the departures screen from
      `.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/probe-project/screens/`.
- [x] Re-parsing every edit's result with `parseCst` gives no diagnostics.
- [x] Full CLI suite, lint and tsc clean.
- [x] Completion report below.

# Completion report

**Status: complete.** Worker, 2026-10-27, on `u8g2gl-e1a/wo2-edits`, branched from WO1's tip
`4ea14ae`.

### Test counts

- Before (WO1 tip): **1738** — 1705 passed, 23 failed, 10 skipped.
- After: **1809** — 1776 passed, 23 failed, 10 skipped. **71 new**, all in `edits.test.ts`.
- The 23 failures are the same pre-existing environmental set recorded in WO1 (BDF tests
  needing the uninitialised `extern/u8g2` submodule), unchanged.
- `npm run lint` (eslint + tsc over src and test): clean.

### Commits

- `c023b3b` feat(cst): minimal-edit functions returning TextEdit[]

### Files (all inside the box)

`cli/src/core/cst/edits.ts` (the six functions), `apply-edits.ts` (`applyEdits`),
`entities.ts` (+ `encodeAttributeValue`), `index.ts` (re-exports).
`cli/test/cst/line-diff.ts` (the a3 helper), `edits.test.ts`.

### Checklist evidence

- **a3** — every edit test goes through `expectEdit`, which applies the edits, re-parses
  (asserting no diagnostics) and asserts with `lineDiff` (common line prefix/suffix trimmed,
  terminators included so CRLF damage counts) that the changed lines of the original lie inside
  the target's lines — or, for a pure insertion, on a boundary inside or just after it. For
  `replaceAttributeValue` it asserts exactly one line changed on each side.
- **a4** — `a &amp; b` → `a & c` writes exactly `a &amp; c`; `'…'` and `"…"` keep their quotes;
  each escapes only its own quote (`&apos;` / `&quot;`), plus `&amp;`, `&lt;`, and line breaks
  as `&#10;`/`&#13;` so a value edit can never become multi-line.
- **Five layouts per function** (`it.each(LAYOUTS)`): compact one-line, one attribute per line,
  the same with CRLF, tab indentation, and the probe project's `screen_departures.xml` (read
  from the evidence path at test time). Plus exact-output tests for each layout rule.
- **Re-parse clean**: asserted on every edit result.

### Behaviour decisions the PA should review

1. **Signatures.** The functions that need layout take the document first:
   `insertAttribute(cst, element, name, value)`, `removeAttribute(cst, attr)`,
   `insertElement(cst, parent, index, fragment)`, `removeElement(cst, element)`.
   `replaceAttributeValue(attr, value)` and `renameElementTag(element, name)` need only the node.
2. **`replaceAttributeValue` returns `[]`** when the raw value already decodes to the target, so
   an author's spelling (`&#65;` for `A`) is never rewritten for nothing.
3. **`insertAttribute` throws `RangeError` on a duplicate name** (caller error; use
   `replaceAttributeValue`). Quote = the last attribute's quote, else `"`. "Same line" means the
   last attribute shares a line with its predecessor (or with the tag name if it is the only
   one); otherwise a new line after it with its indentation. If the tag's `/>` was on that
   line, it moves down with the new attribute (the old last-attribute line loses ` />`).
4. **`removeAttribute`**, when not alone on its line, removes the attribute and *all* preceding
   whitespace including line breaks, as the WO says — so removing the last attribute in
   `x="1"\n    y="2" />` joins ` />` onto `x`'s line. Both lines are the element's.
5. **`insertElement`'s `index`** counts element children only (text/comments/whitespace not
   counted). Siblings laid out on one line get the fragment on that line verbatim. A
   multi-line fragment is re-indented and its line breaks converted to the file's. Step
   detection: the first nested element (document order) that starts its own line and is
   indented by a whitespace suffix of its parent's indentation; default two spaces. Throws
   `RangeError` on an out-of-range index or an unclosed parent.
6. **`removeElement`** on whole lines removes those lines including their break; on a shared
   line removes the element and the spaces/tabs before it. It never removes a comment, even one
   on the same line. Removing the root is allowed (the result then has no root, which the
   parser reports).
7. **`applyEdits`** throws `RangeError` on overlap/out of range (a bug in the producer); two
   insertions at one offset land in array order.

### Not done

Nothing from the checklist. No consumer uses the edits yet (by design, E-1b/E-2).
