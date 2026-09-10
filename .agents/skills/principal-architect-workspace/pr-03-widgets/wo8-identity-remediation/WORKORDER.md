---
work_order: WO8
project: pr-03-widgets
title: "[U-1] identity remediation — unique synthesis + 32-bit sizeof"
branch: u8g2gl-widgets/wo8-identity-remediation
base: u8g2gl-widgets/wo7-integration
complexity: standard
status: pending
---

# WO8 — `[U-1]` Identity Remediation

## Authorization

This Work Order is part of PR-03 (pr-03-widgets), whose decomposition was approved
by the human on 2026-09-10T07:10:37Z. WO8 was added by the Chief Architect on
2026-09-10 following review of PR #3, at the human's direction ("produce the WO8
remediation branch and stack it on top in the PR"). Verify:
`.agents/skills/principal-architect-workspace/pr-03-widgets/PROJECT.md`

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do not
> branch beyond the one named below, and do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-widgets/wo8-identity-remediation`
**Base**: `u8g2gl-widgets/wo7-integration`

The branch has been created and you are on it. Verify with
`git branch --show-current` **immediately before every commit** — not once at the
start, and never in the same command as the commit itself. A check that runs
alongside the action cannot gate it.

## COMMIT ON A GREEN BUILD

You are authorized to commit and push on a green build. Do NOT stop to ask for
approval — you cannot be answered, and your work will strand uncommitted.
Build, test, commit, push.

## Standards

Read BEFORE writing any code: the `u8g2gl-standards` skill, and in particular
`references/documentation.md` and `references/typescript.md`.

---

## Background — what is wrong and why

`[U-1]` was settled as: `name` is required, but a missing name is **auto-generated
on load with a warning** rather than rejected, so a hand-authored or tool-emitted
file still opens in the editor. The policy is correct and is **not** in question.

WO6 implemented it in `cli/src/core/parser/parse-widget-tree.ts:131` as
`` `${cleanTag}_${siblingIndex}` ``, where `siblingIndex` is a **per-parent**
counter (see `childWidgetIndex`, lines 155 and 170). But the uniqueness namespace
is **per-screen**: `validate-identifiers.ts:353` walks the entire screen into a
single `seenElementNames` set.

The two scopes do not match, so two unnamed elements under different parents
collide. Reproduced against `wo7-integration`:

```xml
<screen name="home"><view>
  <u8g2gl_box name="left"  x="0"  y="0" width="10" height="10">
    <u8g2gl_label text="a" />
  </u8g2gl_box>
  <u8g2gl_box name="right" x="20" y="0" width="10" height="10">
    <u8g2gl_label text="b" />
  </u8g2gl_box>
</view></screen>
```

```
names:  [ 'left', 'label_0', 'right', 'label_0' ]
diags:  U8G2GL_DUPLICATE_NAME (error) — Duplicate element name 'label_0' in screen 'home'.
```

A two-column layout with an unnamed label in each column is an entirely ordinary
document, and it fails to a hard **error**. The warn-and-continue path is therefore
unreachable for exactly the documents that most need it. The diagnostic is also
unactionable: it names a duplicate `label_0` the author never wrote and cannot find
in their source.

**A second defect — positional instability — is deliberately NOT in your scope.**
See "Explicitly out of scope" below. Do not attempt to fix it.

---

## Strict Boundary Box

**In scope — these files only:**
- `cli/src/core/parser/parse-widget-tree.ts`
- `cli/test/validator/element-identity.test.ts` (and a new test file if you prefer)
- `test/test_sizeof.cpp` and/or `CMakeLists.txt` for item 3 only
- This `WORKORDER.md` (your Completion Report)

**Do NOT touch:**
- The `[U-1]` policy itself. Warn-and-continue stays. Do not change the severity of
  `U8G2GL_MISSING_NAME` to `error`.
- Any widget implementation, manifest, or the C++ runtime, except the sizeof test.
- `docs/` or any other `.agents/` file.
- The validator's duplicate-name check. It is correct — it is the *synthesis* that
  must stop producing duplicates, not the check that must stop reporting them.

**Do NOT** create branches beyond the one named, open PRs, rebase, or merge.

If a fix appears to require a change outside this box, **stop and record it** in
your Completion Report rather than making it.

## Explicitly out of scope — do not implement

Synthesised names are recomputed from position on every load, so inserting an
element renumbers its later siblings (`box_0` becomes `box_1`). This is a real
defect, but the fix is to **write the generated name back into the document**, and
that requires an XML serializer preserving round-trip fidelity. No serializer
exists in `cli/src/core/` — parsing is one-way today.

That work belongs to the editor's document layer, which owns loading and saving, and
it is being recorded as a requirement against `[U-1]` and `ui_spec` by the Chief
Architect. **Do not build a serializer. Do not attempt to make names stable across
insertions.** Uniqueness within a single parse is the whole of your objective.

---

## Line-Item Instructions

### 1. P1 — Make synthesised names unique within their namespace

- [ ] Before synthesising any name, collect **every explicit `name`** already present
      in the document being parsed (screen or component) into a "taken" set. This
      needs a pre-pass, because an explicit name appearing *later* in the document
      must still block an earlier synthesised name from taking it.
- [ ] Synthesise as `{cleanTag}_{n}`, starting at `n = 0` and incrementing until the
      candidate is not in the taken set. Add each name you issue to the taken set.
- [ ] Keep the existing `cleanTag` derivation (prefix stripping, §13.4 conformance)
      exactly as it is. It is correct and tested; only the numeric suffix changes.
- [ ] Apply this to components as well as screens — `validate-identifiers.ts:449`
      shows components have their own per-component namespace.

The guarantee to aim for: **synthesis can never be the cause of a
`U8G2GL_DUPLICATE_NAME` error.** After this change, a duplicate-name error can only
mean the author wrote the same name twice, which is exactly what that diagnostic
should mean.

### 2. P2 — Keep the diagnostic actionable

- [ ] The warning must continue to report the generated name and offer it as a
      `name="..."` suggestion, as it does today.
- [ ] Add a short why-comment at the synthesis site explaining that the counter must
      be document-scoped because the uniqueness namespace is document-scoped, and
      that the two diverging is what caused this remediation. A future reader will
      otherwise "simplify" it straight back to a sibling index.

### 3. P3 — Measure widget sizes on the 32-bit target width

- [ ] WO7's sizeof report states its host width (64-bit), which was correct of it,
      but concludes that widgets "satisfy host memory budgets". The §18 budget is a
      claim about the **32-bit target**, and the pointer-heavy members are precisely
      the ones whose width changes.
- [ ] Add a 32-bit measurement. `-m32` on the host is sufficient; if the toolchain
      cannot produce a 32-bit build in this environment, **say so in your Completion
      Report and stop** — do not fabricate figures, and do not spend more than a
      short attempt on toolchain installation.
- [ ] Report both widths side by side.

---

## Testing Requirement

Add tests that would have caught the defect. At minimum:

- [ ] Two unnamed elements under two different named parents in one screen produce
      **two distinct names and zero errors** (this is the reproduction above — it
      must go from failing to passing).
- [ ] A synthesised name never collides with an explicit name declared elsewhere in
      the same document, **including one declared later in document order**.
- [ ] The existing `element-identity.test.ts` expectations still hold for the
      single-element cases. Note that `'box_0'` remains correct for the first
      unnamed element of its tag; if any existing assertion changes, explain why in
      your Completion Report rather than quietly editing it.

## Verification Requirement

- [ ] `npx vitest run` in `cli/` — all tests pass, none weakened or removed
- [ ] `npx tsc --noEmit` and `npm run lint` — zero errors
- [ ] `cmake --build build` — zero warnings under `-Wall -Wextra -Wpedantic`
- [ ] `ctest --test-dir build` — all C++ tests pass
- [ ] `git diff` touches only the files named in the Boundary Box

## Issue Surfacing

If you find a defect outside this checklist, record it in your Completion Report —
do not fix it and do not file an issue. The architect triages.

---

## Completion Report

<!-- Written by the worker at task completion -->
