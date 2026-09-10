---
work_order: WO6
project: pr-03-widgets
title: "Element Identity [U-1] — Option A: Require name"
branch: u8g2gl-widgets/wo6-element-identity
base: u8g2gl-widgets/wo5-manifests-crosstest
complexity: standard
status: pending
---

# WO6 — Element Identity [U-1]

## Authorization

This Work Order is part of PR-03 (pr-03-widgets), whose decomposition was
approved by the human on 2026-09-10T07:10:37Z. Verify:
`.agents/skills/principal-architect-workspace/pr-03-widgets/PROJECT.md`

## Objective

Implement the [U-1] element identity decision: **Option (a) — require `name`
on every element**, with a graceful load-time fallback that auto-generates names
for elements that omit them (emitting a warning diagnostic).

Human direction (2026-09-10): "XML is an intermediate descriptive [format]; we
should do option A and mandate a name. If we really want to optimise then we
should optimise at export time [...] or at loading time, and dynamically generate
names where they were missed in the XML."

## Branch

**Branch**: `u8g2gl-widgets/wo6-element-identity`
**Base**: `u8g2gl-widgets/wo5-manifests-crosstest`

The branch has been created for you. Verify with `git branch --show-current`
before every commit.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval. Do NOT send a message asking to proceed. Build, test, commit, push.

## Standards

Read BEFORE writing any code:
- `.agents/skills/u8g2gl-standards/SKILL.md`
- `.agents/skills/u8g2gl-standards/references/typescript.md`

## Checklist

### 1. Decision record

Create `docs/decisions/u1-element-identity.md`:

```markdown
# [U-1] Element Identity

**Status**: Decided
**Date**: 2026-09-10
**Decision**: Option (a) — require `name` on every element

## Context

The editor must address an element stably across edits — to select it, to write
back one changed attribute, to keep a selection alive while the user types
elsewhere. Without a name, an element has no identity.

## Options Considered

(a) Require `name` on every element
(b) Synthetic ids from document position
(c) Hybrid: `name` when present, synthetic otherwise, with promotion

## Decision

Option (a). Reasoning:
- XML is an intermediate descriptive format, not hand-authored prose
- The generator needs a name anyway for C++ variable naming (§13.3)
- The agent creating XML will typically generate meaningful names
- Option (c) adds significant complexity for marginal benefit
- The schema is pre-1.0; existing XML is test fixtures, not production

## Graceful Fallback

When the parser encounters an element without `name`, it auto-generates one from
`{tag}_{index}` (e.g. `box_3`) and emits a warning diagnostic. This ensures:
- Existing XML is loadable (not a hard break)
- The warning tells the author to add a meaningful name
- The generator always has a name to emit as a C++ variable
```

### 2. Schema change

#### `cli/src/core/schema/widget-node.ts`

Change `CommonAttributes.name` from optional to required:

```typescript
// BEFORE:
/** Optional identifier for the instance... */
readonly name?: string;

// AFTER:
/** Required identifier for the instance. Used as C++ variable name by the
 *  generator (§13.3) and as stable element identity for the editor.
 *  Per [U-1], every element must have a name. The parser auto-generates
 *  one from {tag}_{index} if omitted, with a warning diagnostic. */
readonly name: string;
```

**IMPORTANT**: This change may cause TypeScript compilation errors in code that
constructs `WidgetNode` objects with `name` as optional. Find and fix all such
locations — primarily in the parser code.

### 3. Parser update — auto-generate names

#### `cli/src/core/parser/parse-widget-tree.ts`

In the widget tree parser, when constructing a `WidgetNode`:

1. Check if the `name` attribute is present.
2. If present, use it as-is.
3. If absent, generate one:
   - `const generatedName = \`${tag}_${siblingIndex}\`;`
   - Emit a warning diagnostic:
     ```typescript
     diagnostics.push({
       code: DIAGNOSTIC_CODES.MISSING_NAME,  // add new code
       severity: 'warning',
       file: filename,
       line: loc.line,
       column: loc.column,
       message: `Element <${tag}> is missing a required 'name' attribute. ` +
                `Auto-generated name '${generatedName}'. Add an explicit name ` +
                `for stable identity and readable generated code.`,
       offendingText: tag,
       suggestions: [`name="${generatedName}"`],
     });
     ```

### 4. Add diagnostic code

#### `cli/src/core/schema/diagnostic.ts`

Add `MISSING_NAME` to the `DIAGNOSTIC_CODES` constant:

```typescript
MISSING_NAME: 'U8G2GL_MISSING_NAME',
```

### 5. Validator update

#### `cli/src/core/validator/validate-identifiers.ts`

Add a validation rule that checks:
- Every element has a `name` (should always pass after parser auto-generation)
- The generated name conforms to §13.4: `[a-z][a-z0-9_]*`
- No reserved prefixes: `u8g2gl_`, `ui_`, `wd_`
  (Wait — `u8g2gl_` is the framework's own prefix. Widget *instances* should
  not use reserved prefixes. The check should be:
  - Instance names must not start with `u8g2gl_` or `ui_`
  - `wd_` is the custom widget prefix, used for widget class names, not instances)
- No duplicate names within the same screen

### 6. Update existing test fixtures

Some test fixtures in `cli/test/` may lack `name` attributes on elements. Add
them where missing to prevent new warning diagnostics from breaking existing
tests. Search for all `.xml` fixtures containing widget tags and add `name`
attributes.

### 7. Write tests

Add tests to `cli/test/validator/` or a new test file:

```
TEST: Missing name generates warning and auto-name
TEST: Present name passes without warning
TEST: Duplicate names within same screen produces error
TEST: Reserved prefix in name produces error
TEST: Auto-generated names are valid identifiers per §13.4
```

### 8. Build and test

```bash
cd cli && npm test
```

All existing tests must pass (with fixture updates). Zero TypeScript errors.

### 9. Commit and push

**VERIFY BRANCH FIRST:**
```bash
git branch --show-current   # Must show: u8g2gl-widgets/wo6-element-identity
```

```bash
git add -A
git commit -m "feat(schema): require element name — settle [U-1] element identity (PR-03 WO6)"
git push origin u8g2gl-widgets/wo6-element-identity
```

## Strict Boundary Box

You may ONLY touch:
- `docs/decisions/u1-element-identity.md` (NEW)
- `cli/src/core/schema/widget-node.ts` (MODIFY — name becomes required)
- `cli/src/core/schema/diagnostic.ts` (MODIFY — add MISSING_NAME code)
- `cli/src/core/parser/parse-widget-tree.ts` (MODIFY — auto-generate names)
- `cli/src/core/validator/validate-identifiers.ts` (MODIFY — add name checks)
- `cli/test/` fixtures (MODIFY — add missing names)
- `cli/test/` test files (NEW or MODIFY — add identity tests)

You may NOT touch:
- Any C++ runtime source or headers
- The manifest XML files from WO5
- The manifest parser (`parse-widget-manifest.ts`)

## Constraints (REJECTION CRITERIA)

- `name` must be `readonly name: string` (required), NOT optional.
- Auto-generated names must conform to §13.4 identifier rules.
- Omitting `name` must produce a WARNING, not an error (graceful fallback).
- Duplicate `name` within a screen must produce an ERROR.
- All existing CLI tests must pass after fixture updates.
- Zero TypeScript compilation errors.
- Full documentation on the decision record.

## Completion Report Template

```
## Completion Report
- **Date**: YYYY-MM-DDTHH:MM:SSZ
- **Status**: COMPLETE / PARTIAL / BLOCKED
- **Commit**: <sha>
- **Branch verified**: yes/no
- **Tests**: X passed, Y failed
- **Fixtures updated**: N files
- **Notes**: <any observations>
```

## Completion Report
- **Date**: 2026-09-10T07:52:16Z
- **Status**: COMPLETE
- **Commit**: 5fc3cbd
- **Branch verified**: yes
- **Tests**: 197 passed, 0 failed
- **Fixtures updated**: 1 fixture file (valid-screen.xml) + 4 test files updated with required names
- **Notes**: SRO [U-1] settled with Option (a) requiring element name. Graceful fallback generates {tag}_{index} (stripping framework/custom prefixes to satisfy §13.4) and emits warning diagnostic U8G2GL_MISSING_NAME. All 25 test suites passing with 197 tests. Zero TypeScript or ESLint errors.

