---
name: e-1a-wo2
description: Work Order 2 of E-1a — minimal-edit functions over the CST
---

# Role

As WO1. **Parent project:** `e-1a-cst` ([PROJECT.md](../PROJECT.md)).

# Where you work

- Same worktree, `/Users/mcneillm/Documents/Projects/U8G2GL-e1a`. When WO1 is committed, create
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

- [ ] **a3** — every edit test asserts that the before/after line diff touches only the target's
      lines, and for `replaceAttributeValue` exactly one line. Write a small line-diff helper in
      the test folder.
- [ ] **a4** — replacing `a &amp; b` with `a & c` writes `a &amp; c`; single- and double-quoted
      values keep their quotes; a value containing the quote character is escaped.
- [ ] Each function has tests on: a compact one-line element, a one-attribute-per-line element,
      CRLF input, tab indentation, and the departures screen from
      `.agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/probe-project/screens/`.
- [ ] Re-parsing every edit's result with `parseCst` gives no diagnostics.
- [ ] Full CLI suite, lint and tsc clean.
- [ ] Completion report below.

# Completion report

*(Worker fills this in.)*
