---
work_order: WO6
project: pr-04-generator
title: "Resolver: constant arithmetic and anchors to literals"
branch: u8g2gl-generator/wo6-resolver
base: u8g2gl-generator/wo5b-generate-command
complexity: standard
status: complete
---

# WO6 — Resolver: arithmetic and anchors

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval in `../PROJECT.md`
under "Human Approval" (owner's own words, timestamped) and that this WORKORDER's
`status` is `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo6-resolver`
**Base**: `u8g2gl-generator/wo5b-generate-command`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval.

## Standards

`u8g2gl-standards` skill. Isomorphic core. Integer arithmetic only — floating
point must never reach output (§13.9).

## Design authority

design_spec §7.2, §13.2, §13.11 step 3, [D-7], [D-20]. Where this work order and
the spec disagree, **stop and report**.

---

## Objective

Every coordinate attribute resolves to a literal integer, by one evaluator that
the validator also uses. Today `validate-geometry.ts` checks literals only and
skips anything with an expression.

## Line-Item Instructions

- [x] **Integer expression evaluator:** literals, `#const` from `globals.xml`,
      `#screen_width`/`#screen_height` from the selected target's catalogue record,
      `#parent_width`/`#parent_height`, `+ - * /` with parentheses. Integer
      division truncating toward zero. Diagnostics carry the attribute's location:
      unknown constant (with suggestions), non-integer constant, division by zero,
      malformed expression.
- [x] **Anchors:** two of `{x, width, right}` determine the third; same for
      `{y, height, bottom}`; `hcenter`/`vcenter` centre within the container,
      odd remainders rounding down (§7.2). Over-constraint diagnostics already
      exist — reuse, do not duplicate.
- [x] **Resolved model:** resolved geometry per element, with provenance back to
      the source attribute. Screen-level container is the display.
- [x] **`validate-geometry.ts` uses the evaluator,** so bounds checks now cover
      expressions. Composite internals keep WO6-of-PR-3R's "no absolute check at a
      composite's top level" until WO7 supplies the instantiation size.
- [x] Expose the resolver from core for `generate` (and, later, the editor).
- [x] **Carried from WO5b:** `cli/src/core/index.ts` does not export the generator
      WO5b added under `src/core/generator/`. Export it alongside the resolver, so the
      browser build ([UD-2]) can reach both through core.
- [x] **Carried from WO3:** `CommonAttributes` in `cli/src/core/schema/widget-node.ts`
      still types `x`, `y`, `width`, `height` and `hidden` as common to every
      element, which WO3 made untrue — they come from the effective manifest. Align
      the type so the resolver cannot read geometry off a node that has none.

## Strict Boundary Box

**In scope:** new `cli/src/core/resolver/`; `cli/src/core/validator/validate-geometry.ts`;
`cli/src/core/schema/widget-node.ts` (`CommonAttributes` only);
`cli/src/core/index.ts` (exports only);
`cli/src/core/generator/` (wiring only); `schema/diagnostic.ts`; tests; this WORKORDER.

**Do NOT touch:** composite expansion (WO7); realisation (WO8); emission; runtime.

---

## Testing Requirement

- [x] Resolved integers asserted for each anchor combination and centring with
      odd remainders (§17.1 "Resolution" layer).
- [x] `width="#screen_width - 8"` overflowing the display is now caught by
      `validate`; the same attribute fitting is not.
- [x] Same screen against a 128-wide and a 256-wide target resolves differently
      (§7.3).

## Verification Requirement

- [x] CLI tests, `tsc`, lint clean; C++ unchanged and green
- [x] Diff limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

**Worker:** Tier-3, 2026-09-14. **Code commit:** `6b5d562` on
`u8g2gl-generator/wo6-resolver`, not pushed. **Status `complete`.**

### Authorization

Checked from committed files, not the dispatch prompt:
- Front matter named `project: pr-04-generator` with `status: dispatched`.
- `../PROJECT.md` "Human Approval" quotes the owner, *"Approved — proceed with the
  twelve work orders, start WO1"*, at `2026-09-13T19:59:36Z`. The checkpoint rulings
  amend that decomposition and do not replace it.
- The status log records WO6 dispatched after the WO5b review.

### Test counts

| Suite | Before (`3642371`) | After (`6b5d562`) |
|---|---|---|
| `npx vitest run` | 458, 34 files | **550**, 38 files |
| `npx tsc --noEmit` | clean | clean |
| `npm run lint` (eslint + test type-check) | clean | clean |
| `cmake --build build` warnings | 0 | 0 (C++ untouched) |
| `ctest --test-dir build` | 284, 1 known skip | 284, 1 known skip (`SizeOfReport.ThirtyTwoBitTarget`) |

**The new tests fail on the base.** I copied `geometry-expressions.test.ts` into a
throwaway worktree at `3642371`, since it imports nothing WO6 adds. **7 of its 13
tests fail there**: the expression overflow, the anchored overflow, the negative size,
the evaluator diagnostics, the nested expression parent, and both composite checks. The
6 that pass on both commits are the controls: fits, first target, centred, over-constraint
reported once, no catalogue record, and deferred top level. The worktree is removed.

### Line items

- **Evaluator.** `cli/src/core/resolver/expression.ts`, `evaluateExpression(text, scope, site)`.
  - Returns `value`, `deferred` (no diagnostic) or `invalid` (diagnostics). Errors win
    over deferral, and both sides of an operator are evaluated, so every unknown
    constant in one expression is reported.
  - Diagnostics carry the attribute's own `attributeLocs` entry (the node's location
    when there is none), `offendingText`, and suggestions where machine-applicable.
- **Anchors.** `cli/src/core/resolver/resolve.ts`, `resolveAxis`. Over-constraint is
  raised here and only here: `validate-geometry.ts` no longer has its own check, and
  the message text is unchanged.
- **Resolved model.** `resolveScreens()` and `resolveElements()`. The screen-level
  container is the display (`displayContainer()`).
- **`validate-geometry.ts`.** Rewritten onto the resolver; details below.
- **Exposed from core.** `cli/src/core/index.ts` now re-exports `./resolver/index.js`
  **and** `./generator/index.js`, which closes the WO5b carry. No export names collide:
  `tsc` and the browser build are clean.
- **Generator wiring.** `generate()` resolves again against the **built** target. A
  resolution error refuses the build: no files, the error in `diagnostics`. A clean
  build returns `GenerateResult.resolved: readonly ResolvedScreen[]`.
  - `check-project.ts`'s dedupe, sort and count moved, unchanged, into an exported
    `finaliseDiagnostics()`. `generate()` needed that ordering too, and a second copy
    of the comparator is what that module exists to prevent.
  - `node/cli.ts` builds its `--json` explicitly, so `resolved` does not leak into
    CLI output.
- **WO3 carry.** `CommonAttributes` is covered below.

### Grammar and precedence

```
expression := term    (('+' | '-') term)*        lowest precedence, left-associative
term       := unary   (('*' | '/') unary)*       left-associative
unary      := '-' unary | primary
primary    := INTEGER | '#' NAME | '$' NAME | '(' expression ')'
NAME       := [A-Za-z_][A-Za-z0-9_]*             whitespace anywhere between tokens
```

- **Division truncates toward zero, as C does:** `-7 / 2` is -3.
  - It is computed as `(a - a % b) / b`, which is exact integer arithmetic.
  - `Math.trunc(a / b)` is deliberately not used, because it goes through a rounded
    floating-point quotient.
  - A why-comment at `truncatingDivide` says this. Tests pin the sign table and sweep
    every pair in -9..9 by -4..4 against C truncation.
- **Every literal, constant and intermediate is range-checked against `int32_t`**
  (§13.2) → `U8G2GL_INTEGER_OVERFLOW`.
  - The check runs after each operation, so no value exceeds what a JS number holds
    exactly.
  - `-0` is normalised to `0`.
- **Anything else is `U8G2GL_MALFORMED_EXPRESSION`**, with a reason and a character
  offset. That includes `%`, `.`, a bare name, a `#` with no name, empty text, and
  unbalanced parentheses.

### Where `#screen_*`, `#parent_*` and constants come from

- **`#screen_width` / `#screen_height`** — the `DisplayRecord` for the target, found
  by `findTargetDisplay(target, catalogue)`: the record whose `setup` equals
  `target.setup`. That is the same lookup validate-geometry already used.
  - `validate` uses `project.targets[0]`.
  - `generate` uses the target it builds.
  - No record: both built-ins are **deferred**.
- **`#parent_width` / `#parent_height`** — the container's resolved size.
  - At screen level the container is the display (§7.2: the two coincide).
  - Nested, it is the parent element's resolved `width` / `height`, derived ones
    included. Each axis is independent, so a parent with only a width still supplies
    `#parent_width`.
  - Unknown (a composite's top level before WO7, or a parent with no size on that
    axis): **deferred**.
- **Other `#name`** — `globals.xml` `<consts>`, first declaration winning
  (`buildConstantTable`; duplicates are already Pass 7's).
  - Unknown → `U8G2GL_UNKNOWN_CONSTANT`, with `#`-spelled suggestions from the
    built-ins plus declared names.
  - A `<string>`, or an `<int>` whose value is not an integer literal →
    `U8G2GL_NON_INTEGER_CONSTANT`, reported at the use.
  - Built-ins take precedence over a `<const>` of the same name.
- **`$name`** — deferred, for WO7 to substitute. The evaluator never errors on one.

### Anchor rules as implemented

Per axis, `{x, width, right, hcenter}`, and `{y, height, bottom, vcenter}` the same
way. C is the container's size along that axis.

- **Reading.**
  - `right`, `bottom`, `hcenter` and `vcenter` are read on every element (they are
    `COMMON_ATTRIBUTES`).
  - `x`, `y`, `width` and `height` are read **only if the effective manifest declares
    a prop of that name**. So `<u8g2gl_line x=…>`, and any unknown tag, has no geometry.
  - Centring is on for any present value except `"false"`. `isCentringOn()` is now
    also the predicate the [D-20] bound-container check uses.
- **Over-constraint.**
  - `x + width + right` all written → the existing `U8G2GL_OVERCONSTRAINED` with the
    existing message. Nothing is derived.
  - `hcenter` with `x` or with `right` → the same code, message
    `'hcenter' and 'x' are both specified` (decision 3).
- **Derivation**, only when C is known and the axis is not over-constrained:
  - `hcenter + width`: `x = floor((C − width) / 2)` and `right = C − x − width`. The
    odd remainder goes to the right side. Rounding down is **floor**, including when
    the child is wider than its container: C=128, width=131 gives x=−2, right=−1.
    Integer-only, in `floorHalf`, with a why-comment.
  - `x + width`: `right = C − x − width`.
  - `width + right` with no `x` written: `x = C − right − width`.
  - `x + right` with no `width` written: `width = C − x − right`.
- **A written attribute that is invalid or deferred is never replaced by a derived
  one.** Exclusions test what was *written*, and derivation inputs test what
  *resolved*.
- **Under-determined axes** (e.g. `width` alone) leave the missing members absent.

### Resolved model and provenance

```ts
ResolvedScreen     { screen; container: Container; elements: ResolvedElement[] }
ResolvedElement    { node: WidgetNode; container: Container; geometry: ResolvedGeometry; children: ResolvedElement[] }
ResolvedGeometry   { x?, y?, width?, height?, right?, bottom?: ResolvedCoordinate }
ResolvedCoordinate { value: number; provenance: Provenance }
Provenance = { kind: 'attribute'; attribute; expression; loc? }
           | { kind: 'derived';   attribute; from: string[]; loc? }   // loc = the anchor attribute's
Container          { label: string; width?: number; height?: number }
```

- Document order is preserved throughout.
- The source `WidgetNode` is carried unchanged, so later stages keep identity, props
  and bindings.
- A composite instance's `<view>` is not entered (WO7).

### How `validate-geometry.ts` uses the evaluator

The resolver is the only evaluator. The literal regex, `parseInt` and the local
over-constraint checks are gone.
1. **Screens.** `findTargetDisplay(targets[0])` → `createResolverContext` →
   `resolveElements(children, displayContainer)`. The resolver's diagnostics are
   reported, then `checkBounds` walks the resolved tree.
2. **Composite templates.** Resolved in a container with no size, so the top level
   gets no absolute check and `#parent_*` is deferred there, as PR-3R WO6 already had
   it. Nested elements are checked against their resolved parent.
3. **Bounds.** Per axis, only where the container size, start and size all resolved:
   - `x < 0` or `x + width > C` → `U8G2GL_OUT_OF_BOUNDS`, message text unchanged. The
     location comes from provenance. `offendingText` is the expression, or the source
     attribute names for a derived value (`width, right`).
   - **New:** a resolved **negative size** → `U8G2GL_OUT_OF_BOUNDS`
     ("resolves to width=-12, which is negative").
4. **[D-20] bound containers.** Unchanged, apart from sharing `isCentringOn`.

**Diagnostics it can now raise that it could not before:** `UNKNOWN_CONSTANT`,
`NON_INTEGER_CONSTANT`, `DIVISION_BY_ZERO`, `MALFORMED_EXPRESSION` and
`INTEGER_OVERFLOW` (all new codes in `schema/diagnostic.ts`, each documented).
Separately, `OUT_OF_BOUNDS` and `OVERCONSTRAINED` now fire through expressions and
anchors, and there is the negative-size case.

### `CommonAttributes`

- Removed `x`, `y`, `width`, `height` and `hidden`.
- Kept `name`, the four anchors, `style` and `focusStyle` (still written by the parser
  and read by references, per the WO3 review).
- The doc comment says why and points at `COMMON_ATTRIBUTES`. The parser still writes
  geometry through the index signature, so a reader must narrow a
  `string | boolean | undefined`.
- `types.test.ts` gains a never-called closure with `@ts-expect-error` on `x` that
  fails type-checking if geometry becomes common again. It is proven to bite, because
  `npm run lint` type-checks tests. Nothing in `src/` read those members through the
  type.

### Tests

- **`test/resolver/expression.test.ts`** — grammar, the truncation table and sweep,
  `-0`, constant sources and precedence, deferral, every diagnostic with code,
  location, `offendingText` and suggestions, and overflow bounds.
- **`test/resolver/resolve.test.ts`**
  - All five two-of-three anchor combinations, and centring (even, odd, vertical, and
    wider than the container).
  - Provenance, and both over-constraint forms.
  - The rule that a written coordinate is never replaced by a derived one.
  - Unknown, nested and width-only containers, and no display record.
  - Manifest-gated geometry.
  - §7.3: the same parsed screen on 128 vs 256 wide gives clock x = 88 / 216 and title
    width 120 / 248.
  - A composite instance's `<view>` is not entered.
- **`test/validator/geometry-expressions.test.ts`** — `width="#screen_width - 8"`
  overflowing at `x="16"` is caught with its line and `offendingText`; the same
  attribute at `x="8"` is not. Plus anchored and negative-size overflow, and composite
  templates.
- **`test/generator/generate-resolve.test.ts`**
  - `resolved` differs by `--target`.
  - `64 / (#screen_width - 128)` validates and generates on the 256-wide first target,
    and refuses with `DIVISION_BY_ZERO` on `--target narrow`.
- **`test/validator/geometry.test.ts`** — six existing tests built geometry on tags an
  empty `registryOf([])` does not know. Now that geometry comes from the manifest they
  had none. They use `frameworkRegistry()`, with the assertions unchanged. The old
  "safely skips unresolvable symbolic expressions" test now declares `header_height`,
  since `#screen_width` resolves and an undeclared constant is an error.

### Decisions I made

1. **Unary minus is accepted.** §7.2 lists `+ - * /`. The old validator accepted
   negative literals (`-?\d+`) and a negative coordinate is meaningful, so `-5` and
   `-(a - b)` parse. There is no unary `+`.
2. **Five new diagnostic codes, not reused ones.** The line item names four
   conditions. I added `INTEGER_OVERFLOW` as a fifth, because §13.2 emits `int32_t`
   and §13.9 forbids floating point on the path to output. Without it a large product
   could reach output rounded.
3. **`hcenter` together with `x` or `right` is `OVERCONSTRAINED`.** §7.2 is silent on
   this. It is the only reading that neither drops a written attribute silently nor
   picks a winner. **The PA may overrule;** it is one branch in `resolveAxis`.
4. **Centring rounds with floor for negative remainders too.** "Round down" read
   literally.
5. **Geometry is read only where the effective manifest declares it** (the WO3 carry,
   applied to reading and not only to the type). Anchors stay common.
6. **Constant values are integer literals, not expressions.** §7.2 gives expressions
   to coordinate attributes. Literal-only makes constant cycles impossible.
7. **Built-ins shadow a `<const>` of the same name.** This is silent; see finding 6.
8. **A negative resolved size is `OUT_OF_BOUNDS`.** Previously `x="100" right="40"`
   validated.
9. **Container sizes are per axis.** The old validator gave children a container only
   when both parent width and height were literals.
10. **Deferred means silent**: an unknown container, no display record, or a `$prop`.
    See finding 4.
11. **`generate()` re-resolves against the built target**, returns `resolved`, and
    `finaliseDiagnostics` is extracted (wiring, see line items).

### Spec disagreements

None found between this WORKORDER and §7.2, §7.3, §13.2, §13.11 or [D-20]. Two points
are spec **silences**, decided above rather than stopped on, because neither contradicts
anything: decision 3 (centring with an explicit edge) and decision 4 (negative
remainders). The step order in §13.11 (expand, then evaluate) versus WO6 preceding WO7
is sequencing within the approved decomposition, not a conflict: `resolveElements` takes
any container, so WO7 can re-run it with the instantiation size.

### Out-of-scope findings (not fixed, not filed)

1. **`validate` bounds-checks only the first target.** `generate --target other`
   re-resolves, so expression errors are caught, but `OUT_OF_BOUNDS` is **not**
   re-checked for that display. `width="200"` refuses nothing on a 128-wide second
   target. `ValidateInput` has no target parameter, and `checkBounds` is private to
   Pass 6.
2. **Under-determined axes have no spec default.** For example `width` with no `x`.
   `u8g2gl_obj.xml` gives `x` no default. The model leaves `x` absent, so emission
   (WO10) needs a rule or a diagnostic.
3. **`hcenter` / `vcenter` values are never type-checked.** `hcenter="yes"` centres
   (the existing [D-20] predicate already treated it as an anchor). They are not
   manifest props, so no pass checks them as `bool`.
4. **A coordinate that stays deferred after WO7 must become an error at emission.**
   Today a `$prop` written in a **screen**, or `#parent_height` under a screen parent
   with no height, resolves to nothing without a diagnostic.
5. **Derived values are not range-checked, and nothing checks `int16_t`.** Anchor
   arithmetic on int32 inputs stays below 2^33 and is exact, but it is not
   range-checked. Separately, runtime coordinates are `int16_t` (`set_coords`,
   [D-20]'s clamp), while §13.2 says `int32_t`. For WO10.
6. **A `<const>` named `screen_width` (or another built-in) is silently shadowed.**
   Pass 7 could reserve the four names.
7. **An `<int>` constant's value is not checked at declaration.** `value="1.5"` is
   reported only where it is used, and never if it is unused (Pass 1 checks only
   presence).
8. **Anchors on elements whose `x` is not a left edge are undefined.** `circle`,
   `ellipse` and `pixel` take a centre `x`, but `right`/`hcenter` still derive a left
   edge. `right` is also accepted on `u8g2gl_line`, which has no `x` (§7.2 is silent).
9. **§7.3 `<target_override>` is not resolved.** Not in WO6's scope; nothing in the
   resolver reads it.
10. **`types.test.ts` says "all 23 required diagnostic codes".** It predates many
    codes and checks a subset. End-of-PR readability review.
11. **The first target is resolved twice in `generate`** (once inside validation, once
    in step 3). The cost is negligible; recorded so WO9/WO10 do not add a third pass.

### Diff boundary

`git diff --name-only 3642371..6b5d562`:
- `cli/src/core/resolver/{expression,resolve,index}.ts` (new)
- `cli/src/core/validator/validate-geometry.ts`
- `cli/src/core/schema/widget-node.ts` (`CommonAttributes` and its header line only)
- `cli/src/core/schema/diagnostic.ts` (five codes)
- `cli/src/core/index.ts` (exports only)
- `cli/src/core/generator/{generate,check-project,index}.ts` (wiring)
- tests: `test/resolver/*` (new), `test/validator/geometry-expressions.test.ts` (new),
  `test/generator/generate-resolve.test.ts` (new), `test/validator/geometry.test.ts`,
  `test/schema/types.test.ts`

Nothing under `docs/`, `include/`, `src/` (runtime), manifests, the parser, or
composite expansion changed.
