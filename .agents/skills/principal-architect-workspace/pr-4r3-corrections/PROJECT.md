# PROJECT — PR-4R3: the runtime handshake, and two manifest holes

**Tier 2 · Principal Architect**
**Programme**: U8G2GL
**Parent**: [PROGRAM.md](../PROGRAM.md) — after PR-4R2 (#9), before PR-05
**Source**: Chief Architect bridge "PR-4R3: the runtime handshake, and two manifest holes" (pasted
by the owner, 2026-10-06), and the Chief Architect's rulings on the PA's scoping questions (below)
<!-- Last updated: 2026-10-06 -->

## Mandate

PR-05 is the first time generated code meets a runtime the user builds separately. Three holes it
would expose land here instead.

1. **Generated code asserts the runtime version** (§16, rules/03). Floor = the runtime version the
   CLI was built beside, stamped from `include/u8g2gl/u8g2gl_version.h`. A stale stamp must fail a
   test. Bring back a test that an older runtime is refused by name.
2. **`extends` must name a manifest that has a class** (§6.5). A class extending a drawing element
   (`extends="u8g2gl_box"`) is refused at the manifest, with a diagnostic that says why and where
   to go instead.
3. **A `<bind>` may not alias an inherited non-geometry setter** (`name="bind_foo"
   setter="bind_text"`). Refuse it, after checking nothing relies on it.

**Out of scope:** anything owed to PR-05 or PR-06; [Q-9]'s `setter=` → `prop=` rename; further
sweeps of manifest validation. A fourth hole is reported, not absorbed.

**Baselines to hold:** C++ **395** (one known skip, `SizeOfReport.ThirtyTwoBitTarget`), CLI
**1319**, **zero** warnings under `-Wall -Wextra -Wpedantic`. Schema **0.4** (do not bump).
U8G2 **2.36.18**. Scene format **3**.

**Versions (R3, approved):** CLI 0.10.0 → **0.11.0** (every generated config gains a line) and
runtime 0.6.0 → **0.7.0** (new public macro), both in WO1. Consequence, stated by the Chief
Architect: every project regenerated with CLI 0.11.0 requires runtime ≥ 0.7, including
departures-board-v3. Intended; carried into PR-05's bridge.

## Branch Strategy

Base: `origin/main` @ `783e189`. Worktree `../U8G2GL-4r3` (the main checkout is parked on a
merged branch; other PA worktrees exist). Branches `u8g2gl-4r3/wo<N>-<topic>`, stacked serially,
each based on the previous WO's branch by name. WO1's branch has **no upstream**. The stack tip
opens as one PR against `main`.

## Scoping findings — PA, 2026-10-06

Measured against a CLI built from a `git archive` of `783e189` (CLI 0.10.0).

- **Item 1.** Precedents exist on both sides: `cli/test/manifests/manifest-bundle.test.ts` is the
  drift guard for a committed copy of in-tree data, and the `VersionGuard.*` CTests
  (`test/version_guard/*.cpp`, `test/CMakeLists.txt`) are compile-must-fail tests matched on the
  refusal message. **Gap in the bridge:** a runtime that predates `U8G2GL_REQUIRE_RUNTIME_VERSION`
  sees the emitted line as a syntax error, not a refusal — and that is the runtime the guard most
  exists to catch. Hence an `#ifndef` fallback naming the floor (R1).
- **Item 2. The bridge's suggested remedy is refused today.**

  | Manifest | Result at `783e189` |
  |---|---|
  | `extends="u8g2gl_box"`, empty `<api>` | Validates, 0 errors. Emits `static wd_b ui_obj_w;` with **no** geometry call — the hole |
  | `extends="u8g2gl_obj"` + a `draw=` prop (the bridge's remedy) | Refused, `DRAWING_ELEMENT_EXTENDS`: own props all `draw=` make it a drawing element |
  | Own drawing element: no `extends`, `draw="u8g2gl_draw_box"` props | Works: `u8g2gl_draw_box(display, 0, 0, 10, 6);` |
  | `extends="u8g2gl_obj"`, empty `<api>`, drawn in its C++ class | Works |

- **Item 3.** Every `<bind>` in the repo whose `name` differs from its `setter=` is either a
  framework **drawing** manifest's own-prop binding (`bind_x` → `x`), or a test of PR-4R2's
  geometry refusal. Nothing aliases an inherited setter; no framework class manifest binds one
  setter under two names. A custom drawing element binding its own prop (`<bind name="bind_foo"
  setter="filled">`) validates and emits `u8g2gl_draw_box(…, ui_subject_b.get())` — it names, it
  does not alias, so it stays legal. §13.1 already stated the broad rule; the code enforced only
  the geometry half.

## Chief Architect rulings, 2026-10-06 (verbatim where they set text)

The PA put three questions to the Chief Architect through the owner. Rulings:

**R1 — the runtime floor is a floor.** *"Ruled: major equal, runtime minor ≥ the floor's, at every
version."* The `#ifndef` fallback is in: *"Emit the `#ifndef` fallback naming the floor, and test
both cases as you propose."* Spec text is the Chief Architect's, landed by this PR. **§16**:
replace the two paragraphs after the requirements table with:

> The two requirements compare differently, because they ask different questions.
>
> The **schema** question is "does this runtime implement the vocabulary this code
> was written for?", which only equality answers: the major, and the minor while
> the major is 0, because before 1.0 breaking vocabulary changes land in minor
> bumps (§15.4). A 0.3 project must not compile against a 0.4 runtime.
>
> The **runtime** question is "does this runtime have the API this code calls?".
> API accretes, so this is a **floor**: the major must be equal and the runtime's
> minor must be at least the floor's, at every version. Applying the schema's
> shape here would ignore the minor from 1.0 onward, and a post-1.0 minor is
> exactly where new API arrives — code generated against 1.2 would compile
> against a 1.0 runtime lacking everything 1.1 and 1.2 added.
>
> *Accepted residual.* Before 1.0 a runtime minor may break rather than add, so a
> newer runtime can satisfy the floor and still fail to compile. That degrades to
> an ordinary compile error, which is visible, and it is much the rarer
> direction: the case this guard exists for is the user who upgrades the CLI and
> forgets the library.
>
> **A runtime older than the macro cannot answer the question at all.** The
> generated guard is therefore preceded by an `#ifndef` that names the required
> floor, so that runtime — the one the check most exists to catch — reports a
> refusal rather than a syntax error.

**rules/03**: replace the comparison sentence and the runtime row, adding a `Comparison` column:

> | `U8G2GL_REQUIRE_RUNTIME_VERSION` | The runtime version the generator was **built beside** | Floor: major equal, runtime minor ≥ the floor's |
>
> The schema requirement is an **equality** — the major, and the minor while the
> major is 0. The runtime requirement is a **floor**, compared on the minor at
> every version, because API accretes and a newer runtime is fine.

PA reading (put to the owner before approval): the schema row's `Comparison` cell reads
"Equality: major, and minor while the major is 0".

*"If it runs long, the drift test is the part that must not be squeezed. A stamp that can go stale
without failing is worse than no stamp, because it makes a wrong floor look verified."* Use
`manifest-bundle.test.ts`'s shape; do not invent a second.

**R2 — one code.** Rename `U8G2GL_GEOMETRY_BINDING_ALIAS` → **`U8G2GL_BINDING_ALIAS`**. *"One check
raises one code; the message carries the specifics, including [D-20]'s consequence for the geometry
case."* **§13.1**: replace the paragraph beginning "A `<bind>` may not reach a setter under another
name" and the one after it with:

> **A `<bind>` that re-declares a setter already bound in its `extends` chain must
> use the inherited binding's name.** `<bind name="bind_when" setter="bind_x" />`
> is refused, and so is a `type` the inherited setter — or, on a drawing manifest,
> the target prop — does not accept. A manifest declaring a binding for its own
> prop or its own method names it freely; the rule bites only on an inherited
> setter rebound under a different name. Both are checked on widget and composite
> manifests alike, because a manifest is data ([D-17]) and unvalidated data is a
> crash with extra steps.
>
> The geometry case is why this is a rule rather than a style preference. [D-20]'s
> bindable geometry resolves its origin, its clamp and its anchor by the binding's
> **name**, so a geometry setter reached under a different name silently receives
> none of them and the generated call does not compile. The diagnostic is
> `U8G2GL_BINDING_ALIAS`; the type mismatch reuses `U8G2GL_TYPE_MISMATCH`.

**Item 2 — §6.5 clause, verbatim:**

> **`extends` must name an element that has a manifest *and a class*.** A drawing
> element (§6.2) has no class — it is served by free functions ([D-18]) — so
> extending one is refused: the generated code would call methods on a type with
> no such members. An element that wants box-like drawing has two routes, and
> neither of them extends the box. Declare a drawing element of its own (`draw=`
> props, no `extends`), or extend `u8g2gl_obj` and draw from your own class.

PA reading (put to the owner before approval): this is added **after** the existing
"`extends` must name an element that has a manifest" paragraph, which stays — it covers a C++
class with no manifest, a different case.

**R3 — versions approved** (see Mandate).

## Human Approval

**Owner, 2026-10-06, verbatim**, in reply to the PA's message presenting the Chief Architect's
three rulings, the two PA readings above, and the four-WO decomposition below, which ended
*"Do you approve the decomposition and the three rulings so I can proceed?"*:

> please proceed autonomously

## Work Order Decomposition

- [x] **[WO1 — generated code asserts a runtime floor](wo1-runtime-floor/WORKORDER.md)** ✅ `69f8b7d` · `u8g2gl-4r3/wo1-runtime-floor` · base `main` @ `783e189` · standard · item 1, R1, R3 · CLI 0.11.0, runtime 0.7.0
- [x] **[WO2 — `extends` must name an element with a class](wo2-extends-class/WORKORDER.md)** ✅ `9351366` · `u8g2gl-4r3/wo2-extends-class` · base WO1 · standard · item 2, §6.5 clause
- [ ] **[WO3 — a `<bind>` may not alias an inherited setter](wo3-binding-alias/WORKORDER.md)** · `u8g2gl-4r3/wo3-binding-alias` · base WO2 · standard · item 3, R2, §13.1 text
- [ ] **WO4 — readability review and remediation** · `u8g2gl-4r3/wo4-readability` · base WO3 · standard

WORKORDERs for WO2–WO4 are written at dispatch, against the code as it then stands.

**Ordering.** WO1 first: it carries both version bumps, so goldens move once for one stated
reason. WO2 and WO3 both touch `schema/diagnostic.ts`, so they stack.

## For the Chief Architect

- **§16 placement (PA editorial call, WO1).** R1 says to replace "the two paragraphs after the
  requirements table". Those two paragraphs ("The runtime floor is the runtime version the
  generator was built beside…", "This needs no discipline…") explain the **stamp**, which the new
  text does not restate. The sentence that contradicts R1 is *before* the table: "both are compared
  on the major version **and on the minor while the major is 0**…". WO1 therefore inserts R1's text
  immediately after the table, keeps the stamp paragraphs, and removes only the comparison
  sentences before the table. Every word of R1 lands; nothing contradicting it remains. Check the
  diff in the PR.
- **rules/03 lead-in now disagrees with its own table** (WO1). The pre-existing sentence says
  generated code "asserts **two** floors" and the middle column is headed `Floor`, while the new
  `Comparison` column says the schema requirement is an equality. Your words, so not touched.
  Suggest "two requirements" and a column header such as `Compared against`.
- **Version literals pinned in tests** (WO1). `cli/test/integration/generate.test.ts` pins the CLI
  version in three places, so every CLI bump fails it until edited. Worth a line on whatever bump
  checklist exists, or reading the version from `package.json` in the test.
- **Fresh worktrees need `extern/u8g2`** (WO1). Configure fails until
  `git submodule update --init --reference ../U8G2GL/extern/u8g2 extern/u8g2`. Relevant to every
  PA and to PR-05's setup notes.

## Session Log

- **2026-10-06** — Bridge received. PA scoped all three items against `783e189` (findings above):
  the bridge's item-2 remedy has no success path, and the bridge's comparison for the runtime
  floor ignores the minor from 1.0 on. Three questions went to the Chief Architect through the
  owner; rulings R1–R3 recorded above. Owner approved (quoted). Worktree `../U8G2GL-4r3` created
  on `u8g2gl-4r3/wo1-runtime-floor` from `origin/main`, upstream removed. Rule
  `00-operating-model.md` identical to the skill's asset. WO1 dispatched.
- **2026-10-06** — **WO1 complete, `69f8b7d`.** PA verified from a clean configure, each suite
  alone: C++ **401 / one skip** (395 + six `VersionGuard` tests), **0** warnings; CLI **1326**,
  `tsc`, lint clean. Golden diff: the 9 guard lines in each of the two config goldens, nothing else.
  `OlderRuntimeFailsToCompile` matched on "this code was generated for runtime 0.7 + 1 or newer, but
  this runtime is 0.7.0"; `PreMacroRuntimeFailsByName` compiles the **committed** fixture config
  against a frozen 0.6.0 header and matches the `#error`. Drift test reads the real header and has
  a doctored-header case (worker showed it failing against the stale 0.6.0 stamp). Built CLI
  reports 0.11.0; a fresh project's config compiles against this runtime and against the frozen
  header fails first on `#error "This code requires u8g2gl runtime 0.7 or newer…"`. §16 and rules/03
  carry R1's text, placed as recorded above. **Carried to WO4:** (1) clang continues past `#error`
  and adds "a type specifier is required" on the macro line — put the call in an `#else`; emitted
  text changes within unreleased 0.11.0, no further bump. (2) The `static_assert` message says
  "generated for runtime M.m or newer", which misdescribes refusing a *newer major*; state the
  requirement (major M, minor ≥ m). Worker added `VersionGuard.GeneratedConfigCompiles` as the
  control for the pre-macro test — kept. WO2 dispatched on `u8g2gl-4r3/wo2-extends-class`.
- **2026-10-06** — **WO2 complete, `9351366`.** PA verified, each suite alone: CLI **1331**, `tsc`,
  lint clean; C++ unchanged (401 / one skip); goldens unchanged. Built CLI on the scoping probes:
  `extends="u8g2gl_box"` → exactly one error, `U8G2GL_EXTENDS_DRAWING_ELEMENT`, message names both
  working routes; `generate` refuses, nothing written. Own drawing element and
  `extends="u8g2gl_obj"` validate clean; `extends="u8g2gl_obj"` + `draw=` prop still gets
  `DRAWING_ELEMENT_EXTENDS` only (no double report). **Accepted:** after the refusal the child keeps
  the parent's props — measured 1 error versus 5 (four "unknown attribute" cascades) when it
  inherits nothing; pinned by a test. Location limit recorded under "For the Chief Architect".
  WO3 dispatched on `u8g2gl-4r3/wo3-binding-alias`.
