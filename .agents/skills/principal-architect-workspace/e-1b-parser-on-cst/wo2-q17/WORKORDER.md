---
name: e-1b-wo2
description: Work Order 2 of E-1b — manifest diagnostics located at the attribute, closing Q-17
---

# Role

As WO1. **Parent project:** `e-1b-parser-on-cst` ([PROJECT.md](../PROJECT.md)).

# Where you work

Same worktree. When WO1 is committed, create **only** `git checkout -b u8g2gl-e1b/wo2-q17` from
WO1's tip. Verify the branch before every commit. Do not push.

# What [Q-17] says

`docs/design_spec.md` §21, row Q-17: an `extends` that names an unknown element, a drawing
element or a cycle, and a `<bind>` refused by §13.1, all report at the `<widget>` tag rather than
the attribute at fault. §15.1 requires file, line, column and the offending text.

# Strict boundary box

- The sites that raise those diagnostics: find them (start at `cli/src/core/manifest/manifest-registry.ts`
  and the `diagnostic.ts` codes around `extends` and `<bind>`, then follow where `<bind>` refusals
  are raised). Edit those sites, and the schema types they need to carry an attribute location
  (for example `WidgetManifest` gaining the `extends` attribute's location, and each bind's
  attribute locations), in `cli/src/core/manifest/**`, `cli/src/core/parser/**` and
  `cli/src/core/schema/**`.
- **Not** `docs/` — the PA closes the Q-17 row. Not the generator or its goldens.
- List every file you touched outside `manifest/` and `parser/` in the report, with why.

# Checklist

- [ ] Before changing anything, list every diagnostic code that is a [Q-17] case and where it is
      raised. Paste it in the report.
- [ ] **b3** — each case reports the **attribute's** line and column (the value's, or the name's
      where the attribute is missing — say which and why) and includes the offending text in the
      message. One new test per case, asserting line, column and text.
- [ ] **b1** — the only existing tests you change are ones whose expected location for a [Q-17]
      diagnostic moves from the element to the attribute. List each, old and new location.
- [ ] No generator golden changes (`git status` after the suite).
- [ ] Full suite, lint, tsc clean. Completion report below.

# Completion report

*(Worker fills this in.)*
