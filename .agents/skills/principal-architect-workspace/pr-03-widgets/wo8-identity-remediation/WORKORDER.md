---
work_order: WO8
project: pr-03-widgets
title: "[U-1] identity remediation — unique synthesis + 32-bit sizeof"
branch: u8g2gl-widgets/wo8-identity-remediation
base: u8g2gl-widgets/wo7-integration
complexity: standard
status: complete
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

**Status**: complete. Branch `u8g2gl-widgets/wo8-identity-remediation`, commit
`c59f8c3` (fix) plus this report.

### 1. P1 — synthesis is now document-scoped ✅

`cli/src/core/parser/parse-widget-tree.ts`. Added a `NameAllocator` — a `taken`
set of every element name in the document plus a `nextIndex` search cursor per
clean tag (the cursor is an O(N) optimisation only; correctness rests entirely on
`taken`).

- `createNameAllocator()` runs a **pre-pass**, `collectExplicitNames()`, which
  walks the whole subtree and reserves every explicit `name`. This is what makes
  a *later* explicit name block an earlier synthesised one.
- `allocateName()` advances `{cleanTag}_{n}` from `n = 0` until the candidate is
  free, then reserves it.
- The allocator is created **once, in `parseWidgetTree()`**, and threaded down
  the recursion. That function is called exactly once per screen
  (`parse-screen.ts:130`) and once per component (`parse-component.ts:121`) —
  i.e. precisely the scope `validate-identifiers.ts` uses at lines 353 and 449.
  Creating it there and nowhere else is what stops the two scopes drifting apart
  again. Components are covered by construction, and there is a test for it.
- `cleanTag` derivation is byte-for-byte unchanged, as instructed.
- `parseWidgetNode()`'s fourth parameter changed from `siblingIndex: number` to
  `allocator: NameAllocator`, defaulted so a standalone subtree parse still
  works. It is exported from `parser/index.ts`; nothing in the repo calls it
  directly.

One subtlety worth flagging: the pre-pass and the recursive walk must agree on
which children are *elements*. `<style name="x"/>` references a style, it does
not declare an element called `x`, and the same applies to `<bind_flag_if_*>` and
the event elements. I extracted `isNestedWidgetElement()` so both use one
predicate — had the pre-pass used a naive "any element with a name" walk, a
`<style name="label_0">` would have reserved `label_0` and pushed the real label
to `label_1`. There is a regression test for this.

### 2. P2 — diagnostic stays actionable ✅

The `U8G2GL_MISSING_NAME` warning still reports the generated name and still
offers `name="..."` as a structured suggestion; severity is unchanged
(`warning`), and the `[U-1]` policy was not touched. A why-comment at the
synthesis site states that the counter must be document-scoped because the
uniqueness namespace is document-scoped, names this remediation, and explicitly
tells a future reader not to simplify it back to a sibling index.

### 3. P3 — 32-bit measurement ❌ NOT MEASURED (toolchain unavailable)

**No 32-bit build is possible in this environment, so no 32-bit figures are
reported.** Per the instruction not to fabricate figures, none are given.

What was tried, briefly:

| Attempt | Result |
|---|---|
| `c++ -m32` | `ld: unknown/unsupported architecture name for: -arch armv4t` |
| `--target=armv7m-none-eabi -c` | `fatal error: 'cstdint' file not found` |
| same, with the macOS SDK's libc++ on the include path | libc++ `__config` rejects a non-Apple target: *"vendor availability markup"* and *"No thread API"* |
| emscripten / `wasm32` (the other ILP32 target this library supports) | `emcc` not installed; bare `--target=wasm32-unknown-unknown` has no C++ headers |
| `arm-none-eabi-g++`, `i686-elf-g++`, `xtensa-esp32-elf-g++`, `riscv64-*`, Homebrew `g++-13/14` | none installed |

The host is Apple silicon (`arm64`, Darwin 25.6). macOS has no 32-bit support at
all, and Apple's libc++ headers refuse a cross target. Producing a genuine
measurement would mean installing a cross toolchain or writing a freestanding
libc++ shim — both beyond the short attempt allowed, and the shim would have to
be committed to be reproducible, which is outside the Boundary Box.

What I did instead, so the gap is visible rather than papered over
(`test/test_sizeof_report.cpp`):

- The report now prints the pointer width it **actually measured**
  (`sizeof(void*) * 8`) rather than hard-coding "64-bit host", and records it as
  a `pointer_bits` test property.
- Added `SizeOfReport.ThirtyTwoBitTarget`, which performs the real measurement
  when `sizeof(void*) == 4` and otherwise **`GTEST_SKIP`s with an explanation**.
  An unmeasured width now shows up in `ctest` as a skip; previously a 64-bit-only
  run reported an unqualified pass. Running this suite from any 32-bit or cross
  build populates the figures with no further code change.
- Its assertions are deliberately the 64-bit ceilings. A narrower pointer can
  only shrink these objects, so those bounds are guaranteed true; a tighter
  32-bit budget is **not** asserted because there is no measurement to derive one
  from, and inventing one would be exactly the unsubstantiated figure §1.3
  forbids. The comment says so and says to tighten them from the first real run.
- I removed the stale claim in the old header that "32-bit target estimates
  [are] noted in comments" — there were none.

**Measured figures, both widths side by side:**

| Type | 64-bit host (arm64, measured) | 32-bit target |
|---|---|---|
| `u8g2gl_obj` | 48 B | **not measured** |
| `u8g2gl_label` | 56 B | **not measured** |
| `u8g2gl_scrolling_label` | 72 B | **not measured** |
| `u8g2gl_xbm` | 56 B | **not measured** |
| `u8g2gl_glyph` | 56 B | **not measured** |
| `u8g2gl_progress_bar` | 64 B | **not measured** |
| `u8g2gl_clock` | 72 B | **not measured** |
| `u8g2gl_switch` | 56 B | **not measured** |
| `u8g2gl_button` | 64 B | **not measured** |

WO7's conclusion that these "satisfy host memory budgets" remains unsubstantiated
as a statement about the §18 target budget, and this WO could not substantiate
it. **Architect action needed**: a CI job or dev-container with an ILP32
toolchain (`arm-none-eabi-g++` is the natural choice) would close this
permanently; the test is already written and waiting for it.

### Tests

New tests, all in `cli/test/validator/element-identity.test.ts` under a
`WO8: synthesised names are unique within the document namespace` block:

1. **The reproduction** — two unnamed labels under two different named boxes.
   Asserts `label_0` / `label_1`, **zero** errors, zero `DUPLICATE_NAME`, and
   that the warn-and-continue path still fires twice with correct suggestions.
   Verified failing before the fix, passing after.
2. Synthesised name must not take an explicit name declared **later** in
   document order (`label_0`, `label_1` explicit later ⇒ first becomes `label_2`).
3. Synthesised name must not take an explicit name **nested under another
   parent**.
4. Deeply nested same-tag elements — asserts global uniqueness of the collected
   name set.
5. Component views get their own document-scoped namespace.
6. `<style name="...">` must not reserve an element name.

**Counts** — CLI: **197 → 203** (25 files). C++: **165 → 166** (`ctest`), of
which the new `ThirtyTwoBitTarget` reports as Skipped on this host. Nothing was
weakened or removed.

**One existing assertion changed, as anticipated by the WORKORDER**
(`element-identity.test.ts`, "Auto-generated names are valid identifiers"):

```
- expect(names).toEqual(['box_0', 'label_1', 'custom_slider_2']);
+ expect(names).toEqual(['box_0', 'label_0', 'custom_slider_0']);
```

**Why**: the old counter was a shared sibling index, so three *differently
tagged* unnamed siblings got 0, 1, 2. The counter is now per clean tag, so each
distinct tag starts at 0 again. `'box_0'` is unchanged and remains correct for
the first unnamed element of its tag, exactly as the WORKORDER notes. The
assertion's actual subject — §13.4 identifier conformance and the absence of
identifier errors — is unaffected, and the loop that checks it is untouched.

### Verification

| Check | Result |
|---|---|
| `npx vitest run` (cli/) | ✅ 203/203 pass, 25 files |
| `npx tsc --noEmit` | ✅ zero errors |
| `npm run lint` | ✅ zero errors |
| `cmake --build build` | ✅ zero warnings under `-Wall -Wextra -Wpedantic` |
| `ctest --test-dir build` | ✅ 166/166 pass (1 skip, as designed) |
| `git diff` scope | ✅ 3 files, all inside the Boundary Box |

### Issues found, not fixed

1. **A generator version bump is arguably required and I did not make one.**
   `rules/03-versioning.md` says a generator change that alters output without an
   input change is breaking and *requires* a bump, and grants an agent authority
   to make it. This change does alter output — an unchanged project containing
   unnamed elements of mixed tags will now regenerate different identifiers. But
   `cli/package.json` is not in the Boundary Box, so per the "stop and record it"
   instruction I have recorded it instead of acting. **Architect decision:** bump
   `0.3.0` → `0.4.0` (or `0.3.1`) before this stack merges. Note the change only
   affects documents that were already emitting a `MISSING_NAME` warning.

2. **Positional instability remains, as scoped.** Inserting an element still
   renumbers the synthesised names of its later same-tag siblings, and the new
   allocator does not change that — it is still recomputed per parse. Confirmed
   in scope of the Chief Architect's `[U-1]`/`ui_spec` requirement; no serializer
   was built and no attempt was made to stabilise names.

3. **`validate-identifiers.ts` re-reports `MISSING_NAME` as an *error*** (lines
   ~356 and ~452) for any node whose `name` is absent. After parsing this is
   unreachable — the parser always fills one in — so it fires only for
   programmatically constructed ASTs, which is what the existing test at line 167
   exercises. It is not wrong, but the same diagnostic code carrying `warning`
   from the parser and `error` from the validator is a trap for anyone branching
   on `code` per `typescript.md` §4. Flagging only; the Boundary Box forbids
   touching the validator.

4. **The 64-bit ceilings in `test_sizeof_report.cpp` have ~33% headroom** over
   the measured figures (e.g. `u8g2gl_obj` measures 48 B against a 64 B bound),
   so they would not catch a moderate regression. Left as found — changing them
   is a budget decision, not a WO8 one.
