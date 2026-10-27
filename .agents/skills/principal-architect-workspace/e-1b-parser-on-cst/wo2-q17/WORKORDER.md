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

- [x] Before changing anything, list every diagnostic code that is a [Q-17] case and where it is
      raised. Paste it in the report.
- [x] **b3** — each case reports the **attribute's** line and column (the value's, or the name's
      where the attribute is missing — say which and why) and includes the offending text in the
      message. One new test per case, asserting line, column and text.
- [x] **b1** — the only existing tests you change are ones whose expected location for a [Q-17]
      diagnostic moves from the element to the attribute. List each, old and new location.
- [x] No generator golden changes (`git status` after the suite).
- [x] Full suite, lint, tsc clean. Completion report below.

# Completion report

**Commits** (branch `u8g2gl-e1b/wo2-q17`, from WO1's tip `416f3fc`; not pushed):
- `434583d` fix(manifest): locate extends and `<bind>` diagnostics at the attribute
- this report

**[Q-17] cases, listed before changing anything** (old location → new):

| # | Code | Raised at | Old location | New location |
|---|---|---|---|---|
| 1 | `U8G2GL_UNKNOWN_WIDGET` (extends names an unknown element) | `manifest/manifest-registry.ts`, `buildManifestRegistry` step 3 | `<widget>` tag | `extends` **value** |
| 2 | `U8G2GL_EXTENDS_DRAWING_ELEMENT` (extends names a drawing element) | same | `<widget>` tag | `extends` **value** |
| 3 | `U8G2GL_CIRCULAR_REFERENCE` (extends cycle) | same | `<widget>` tag of the manifest closing the cycle | that manifest's `extends` **value** |
| 4 | `U8G2GL_BINDING_ALIAS`, inherited setter (§13.1) | `validator/validate-schema.ts`, `checkBindDeclarations` → `bindingAliasDiagnostic` | `<bind>` tag | `name` **value** |
| 5 | `U8G2GL_BINDING_ALIAS`, a drawing element's own geometry prop (§13.1) | same | `<bind>` tag | `name` **value** |
| 6 | `U8G2GL_TYPE_MISMATCH`, inherited setter (§13.1's second constraint) | `checkBindDeclarations` | `<bind>` tag | `type` **value** |
| 7 | `U8G2GL_TYPE_MISMATCH`, a drawing element's prop | `checkBindDeclarations` | `<bind>` tag | `type` **value** |
| 8 | `U8G2GL_DRAWING_ELEMENT_EXTENDS` (a drawing element declares extends) | `validate-schema.ts`, pass 5 | `<widget>` tag | `extends` **name** |

Judgment calls, for the PA:
- Q-17 says the `<bind>` refusals report "at the `<widget>` tag"; in the code they already reported
  at the `<bind>` tag. Still the element, not the attribute, so treated as in scope.
- Cases 6–7: design_spec §13.1 names both constraints and says "the type mismatch reuses
  `U8G2GL_TYPE_MISMATCH`", so a type refusal is a `<bind>` refused by §13.1.
- Case 8 is not one of Q-17's three named `extends` faults; it is the remaining `extends`
  attribute diagnostic and was left at the tag otherwise. Included; easy to back out if the PA
  reads Q-17 narrowly.

**Value or name, and why.** Value wherever the value is wrong and the fix is to change it (1–7):
for `extends` the named base is what is unknown, drawing or cyclic; for an alias the `name` must
change (the message says "Write name=…"); for a mismatch the `type` must. Name for case 8,
because the attribute should not exist and the fix is to delete it. The offending text was
already in every message and in `offendingText`; unchanged. Fallback: where the attribute was not
written (a composite's implicit `u8g2gl_obj` base in a cycle; a `BindDef` built without the
parser) the diagnostic reports at the tag, as before.

**b3.** New `cli/test/manifests/attribute-locations.test.ts`, 9 tests: one per case 1–8 (file,
line, column, `offendingText`, and the message contains the text), plus the fallback. Checked
through the built CLI too: a probe-project widget with `extends="u8g2gl_objx"` reports
`widgets/wd_probe_box/wd_probe_box.xml:2:38` with the caret under the value.

**b1.** Before 2205, after **2214 passed, 0 failed**. **No existing test changed.** The existing
tests of these codes (`validator/bind-type-paths.test.ts`, `manifests/manifest-registry.test.ts`,
others) assert file and line, or build manifests without the parser; the attribute is on the same
line as its tag in all of them, so none moved.

**No generator golden changes.** `git status` after the suite: only this WO's files.

**Lint and tsc clean** (`npm run lint`); `npm run build` clean.

**Files touched outside `manifest/` and `parser/`:**
- `cli/src/core/schema/source-location.ts` — new `AttributeLocation` (name and value start).
- `cli/src/core/schema/widget-manifest.ts` — `WidgetManifest.extendsLoc`, `BindDef.attributeLocs`,
  `BindAttributeLocations`.
- `cli/src/core/validator/validate-schema.ts` — the sites raising cases 4–8 live there; three
  location arguments changed, nothing else.
- `cli/test/manifests/attribute-locations.test.ts` — the new tests.

**Not done:** `docs/` untouched (the PA closes the Q-17 row).
