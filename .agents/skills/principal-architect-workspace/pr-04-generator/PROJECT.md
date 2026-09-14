# PROJECT — PR-04: Generator, XML → C++ per design_spec §13

**Tier 2 · Principal Architect**
**Programme**: U8G2GL
**Parent**: [PROGRAM.md](../PROGRAM.md)
**Contract**: [design_spec.md §13](../../../../docs/design_spec.md) (normative)
<!-- Last updated: 2026-09-13 -->

## Mandate

Generator XML → C++ per §13: property emission, composite expansion, build-time
layout ([D-7], [D-20]), identifier mangling, realisation ([D-18]), generated
capacities ([D-21]), and the `generate` command. Firmware **and** editor targets
([UD-4], ui_spec §15). `--json` on every command ([D-16]).

## Branch Strategy

Base: `main` @ `f693aab`. Branches `u8g2gl-generator/wo<N>-<topic>`, stacked
serially. PR head is the last branch in the stack. Sync with `main` using
`git rebase --update-refs` before submission.

Baseline at base: **C++ 240 tests, CLI 266 tests, zero warnings** under
`-Wall -Wextra -Wpedantic`. Schema 0.4, CLI 0.6.0, runtime 0.3.0.

## Findings that shaped the decomposition

Verified against the code on 2026-09-13, before any work order was written.

1. **The CLI never loads the framework manifests.** `read-project.ts` discovers
   only the project's `widgets/`; `include/u8g2gl/manifests/` is never read and
   the npm package does not ship it. Four test fixtures validate only because
   they carry stale copies of `u8g2gl_label.xml` (still `animated="false"`).
   Nothing resolves `extends`.
2. **Manifests name methods the runtime lacks.** `bind_time` (clock) and
   `bind_value` (progress bar, switch) exist in no header. The cross-test checks
   only that `draw=` names exist — not `setter=`, not `<bind>` setters, not the
   order of draw-function parameters.
3. **[D-20] bindable geometry has no surface** — no manifest binding, no runtime
   method, and the validator rejects `bind_width` as unknown.
4. **No per-object render wrapper.** `ui_handler` calls `render_fn`; nothing in
   `src/` sets up the state saver, clip and effective visibility §11.3 describes.
   The §16 major-version guard does not exist; CMake says `0.3.0`.
5. **No focus ring, dispatch, events or screen stack in the runtime** (PR-09).
6. **Realisation of classed elements had no data source** — resolved as an
   amendment to [D-18], below.

## Firmware / editor sharing — decided deliberately

PR-3R found three of its four real defects by unifying duplicated logic. So:

- **One pipeline, one intermediate model.** Load → validate → resolve → expand →
  realise → flatten runs once. The firmware and editor emitters are two thin
  backends over that model.
- **Three shared helpers**, used by the validator and both emitters where they
  apply: the manifest registry with `extends` resolved; the §13.2 value→C++
  spelling (so a setter call is spelled in one place); the draw-function argument
  order.
- **Sharing is enforced by a test, not by intent.** WO11 builds the same fixture
  through both targets and asserts identical draw-call history from the U8G2
  stub. The only legitimate difference is where values come from — literals in
  firmware, a runtime value in an editor thunk.

## Work Order Decomposition

- [x] **[WO1 — manifest registry](wo1-manifest-registry/WORKORDER.md)** ✅ `6c71715` · `u8g2gl-generator/wo1-manifest-registry` · base `main` @ `f693aab` · standard · finding 1; widget/composite prop-check unification (inherited)
- [x] **[WO2 — manifest ↔ runtime parity](wo2-manifest-parity/WORKORDER.md)** ✅ `33cd27b`, `0257d57` · base WO1 · standard · finding 2; `bind_time`, `bind_value`
- [x] **[WO3 — [D-20] bindable geometry](wo3-bindable-geometry/WORKORDER.md)** ✅ `a652fd6` (partial by design — one stop-and-report, resolved by the PA) · base WO2 · standard · finding 3
- [x] **[WO4 — runtime support for generated code](wo4-runtime-support/WORKORDER.md)** ✅ `6a78247` · base WO3 · standard · finding 4; runtime 0.4.0
- **Owner checkpoint** — reached 2026-09-14; rulings below. WO4b added, WO5 split
- [x] **[WO4b — clipping correctness and pre-1.0 version guard](wo4b-clipping-version/WORKORDER.md)** ✅ `4094489` · `u8g2gl-generator/wo4b-clipping-version` · base WO4 · standard · F1, F4, F6, version guard (checkpoint-approved)
- [x] **[WO5a — manifest and validator carries](wo5a-validator-carries/WORKORDER.md)** · base WO4b · standard · WO1 F5, WO3 carries, `extends` remedy (checkpoint-approved split)
- [ ] **[WO5b — `generate` command and shared load path](wo5b-generate-command/WORKORDER.md)** · base WO5a · standard · constraint 4; NOT_YET_SUPPORTED severity split; WO1 F9
- [ ] **[WO6 — resolver: arithmetic and anchors](wo6-resolver/WORKORDER.md)** · base WO5b · standard · [D-7], [D-20]
- [ ] **[WO7 — composite expansion and mangling](wo7-composite-expansion/WORKORDER.md)** · base WO6 · standard · §13.4, §13.6
- [ ] **[WO8 — realisation and capacities](wo8-realisation-capacities/WORKORDER.md)** · base WO7 · standard · [D-18], [D-21], `_n<N>`
- [ ] **[WO9 — project-level emission](wo9-emit-project/WORKORDER.md)** · base WO8 · standard · §13.7
- [ ] **[WO10 — screen emission and compile layer](wo10-emit-screens/WORKORDER.md)** · base WO9 · standard · §13.7, §13.8, §17.1
- [ ] **[WO11 — editor target](wo11-editor-target/WORKORDER.md)** · base WO10 · standard · [UD-4], ui_spec §15
- [ ] **[WO12 — budget, `--json`, determinism](wo12-budget-determinism/WORKORDER.md)** · base WO11 · standard · §13.9, §18, [D-16]; CLI 0.7.0

**WO2–WO12 were drafted before WO1 ran.** Their line items are revised by the PA
against each predecessor's Completion Report before dispatch; the boundaries are
the approved decomposition.

### Standing instructions carried in every WORKORDER

- Workers **commit on a green build and never ask permission mid-flight** — they
  cannot be answered, and their work strands.
- Load the `u8g2gl-standards` skill before writing code.
- Run `git branch --show-current` as its own command immediately before every
  commit.
- Out-of-scope findings go in the Completion Report. Filing issues is the PA's
  authority, not the worker's.
- **"Stop and report" means: do not choose — record it in the Completion Report,
  then continue with the remaining line items.** It never means halt the work order
  or ask for permission. (Clarified after WO5a noticed WORKORDERs said "stop" while
  dispatch prompts said "record and continue".)

## Decisions — Chief Architect, 2026-09-13 (recorded in PROGRAM.md @ `f693aab`)

1. **Focus ring, events, screen navigation — deferred to PR-09.** `generate`
   refuses them with `U8G2GL_NOT_YET_SUPPORTED`; realisation still models them.
   Collections, and composites that also have C++, get the same treatment until
   PR-08. **Condition:** `validate` reports these as a **warning** and `generate`
   as an **error**, so the editor never shows as valid a document `generate`
   refuses — the same journey split as [U-1]. → WO5. *PA application:* the same
   split is used for `<bdf>` and `<convert>`, for the same reason.
2. **Classed elements always become objects** — interim, recorded as an
   amendment to [D-18]. The manifest-vocabulary alternative is declined. The §18
   report **must** state that classed-element demotion is not yet delivered.
   → WO8, WO12.
3. **`<bdf>` and PNG `<convert>` — named errors in PR-04.** The refusal message
   names PR-04b, which replaces it (departures-board-v3 uses custom BDF fonts).
   → WO5.
4. **[U-6] does not gate PR-04.** No sample-data hooks. It gates editor track E-3.
5. **Versions.** CLI → 0.7.0. Runtime 0.3.0 → **0.4.0 approved**. No schema bump.

**Spec corrections on `main` @ `f693aab`, re-read before use:** §13.3 (parent
index `uint8_t`, 254-object hard ceiling, no widening), §12.4 (tick returns a
`uint32_t` deadline), §13.5 (one frame-dirty observer per subject), §13.12 (a
composite emits `static u8g2gl_obj bar;`).

### PA decision — `bind_time`: implement, do not refuse

The Chief Architect confirmed that the spec is right (the clock binds time) and the
defect is in merged code: `u8g2gl_clock.xml` declares `bind_time` typed `int`,
and no `bind_time` exists in `include/` or `src/`. Asked to choose between
implementing it and refusing it.

**Implemented, in WO2.** `u8g2gl_clock::bind_time(u8g2gl_subject_time_base*)`,
with the manifest's bind type corrected to `time`. Reasons:

- `bind_time` is the clock's primary binding (§6.3). Refusing it leaves a
  framework element unusable in exactly the case it exists for, and makes
  §13.12's worked example impossible to generate.
- `u8g2gl_subject_time` already exists, so this is one method plus a manifest
  fix — cheaper than a refusal path PR-05 would have to remove.
- `bind_value` on the switch and progress bar is the same defect and is fixed the
  same way.

**Either way, as directed:** WO2 extends the manifest cross-test to check
`<bind>` setters. PR-03's cross-test checked only `<prop>` targets, which is how
this got through.

## Work Order Reviews

### WO1 — complete (`6c71715`)

**Verified independently, not from the report:** commits only on the WO1 branch;
nothing under `include/`, `src/` or `docs/` changed; C++ zero warnings and `ctest`
green (240, one known 32-bit skip); CLI 266 → **293**, `tsc` and lint clean. End to
end through the built CLI: a project using `<u8g2gl_label>` with no local manifest
copy now validates, and a copied framework manifest produces
`U8G2GL_SHADOWED_FRAMEWORK_MANIFEST`.

**The merge found what PR-3R said it would.** Seven asymmetries between the
widget and composite paths (A1–A7), including a tag declared as both being
double-reported (A3) and image references never checked inside composites (A7).
That makes four for four on the unification pattern.

**Decisions accepted:** `ValidateInput.manifests` is the registry; a manifest whose
`extends` names itself is a root; per-file schema checks run on the manifest as
declared, not the effective one, so an inherited defect is reported once against
its owner; composite messages now read "on <x>".

**Triage of the eleven findings:**

| # | Finding | Placed |
|---|---|---|
| F1 | `u8g2gl_obj.xml` declares label-only props (`font`, `align`, `bind_text`) on the base, so with `extends` resolved a `<u8g2gl_pixel>` accepts `bind_text` | **WO2** — manifest data correctness, and WO2's cross-test is the tool that should catch it |
| F2 | The parser defaults a missing `extends` to `u8g2gl_obj`, so "missing required `extends`" can never fire and a real self-extends is undetectable | **WO2** — PA decision below |
| F3 | design_spec §6.5 example extends `u8g2gl_widget`, which does not exist | **Chief Architect** — spec defect |
| F4 | Prop checking walks only screens, never a composite's `<view>` (§13.11 requires it) | **WO3** — attribute acceptance |
| F5 | `validate` on a single framework manifest file reports shadowing | **WO5** — single-file path moves into `loadProject()` |
| F6 | `tsconfig` covers only `src/`; four type errors already exist in tests | **WO3** — it rewrites those validator tests |
| F7 | Duplicate plain-widget manifests are not diagnosed; duplicate composites are | **WO3** |
| F8 | Should collection `<element>`s be inherited? | **PA decision below** |
| F9 | Diagnostics against a bundled framework manifest print without a source line | **WO5** — the file map is built in `loadProject()` |
| F10 | Integration tests run `dist/`, which nothing rebuilds before `vitest` | **WO2** — first work order after this; a stale build silently tests old code |
| F11 | "component" wording remains in schema/references/identifiers passes | **WO3** |

**PA decision — F2.** The default moves out of the parser and into the registry,
where it is visible: a manifest with a `<view>` and no `extends` inherits
`u8g2gl_obj`, because that is what it realises as (§13.12, corrected); a plain
widget with no `extends` is the error the schema check already describes.

**PA decision — F8.** Collection `<element>`s are **not** inherited. Collections
are refused until PR-08 (decision 1), so nothing in PR-04 reads them; inheriting
them now would decide PR-08's semantics by accident.

### WO2 — complete (`33cd27b`, `0257d57`)

**Verified independently:** commits only on the WO2 branch; `docs/` untouched; C++
240 → **260**, zero warnings (one known 32-bit skip); CLI 293 → **383** starting
from a deleted `dist/`, which is itself the proof F10 works; `tsc` clean.

`bind_time` (typed `time`) and `bind_value` exist and are tested. **Every object
binding method now returns `bool`** and a runtime test holds all thirteen to one
pool slot and one observer, including on exhaustion — the invariant WO8 counts
against. The cross-tests check prop setters, bind setters with subject type, bind
types and draw-parameter order, through WO1's registry rather than a second
`extends` walk.

**F1 resolved as no move, correctly.** `u8g2gl_obj` itself declares `set_font`,
`set_align` and both `bind_text` overloads, so by the "decide from the C++" rule
they belong on its manifest. The real cause is C++ placement — see W2.

**Testing box left unticked, accepted.** Against WO1's tip only the bind-setter
check had a real manifest to catch; the other three found nothing wrong. The worker
proved each non-vacuous by breaking a manifest in a throwaway worktree. That meets
the intent.

**Checked against the Chief Architect's F3 ruling (`4e4b992`):** `extends` must name
a manifest; every class-backed built-in extends `u8g2gl_obj`.

**PA decision — the worker's question 2: drawing manifests do not `extends`.**
WO2 added `extends="u8g2gl_obj"` to the eight drawing manifests to keep the schema
check quiet once F2 removed the parser default, and said plainly that this
conflicts with §6.2 and §6.5. It does: a drawing element has no class ([D-18]),
and §6.5 now states `extends` is real C++ inheritance. The ruling concerns
class-backed elements and gives no licence to claim a class that does not exist.
Resolved in WO3:

- A `draw=`-only manifest declares **no** `extends`, and declaring one is an error.
- `u8g2gl_obj` is the single root class manifest — the base §13.7 names as the
  contract — and drops its self-referencing `extends`.
- A manifest with `setter=` props and no `extends`, other than that root, is the
  existing schema error. A composite still inherits `u8g2gl_obj` via the registry.

**PA decision — the worker's question 1: draw-argument order.** This dissolves
with question 2. Box's `radius`-before-`filled` order came from inheriting
`u8g2gl_obj`'s style `radius`; without `extends`, the box's effective order is its
declared order, which matches `u8g2gl_draw_box`. WO3 removes the `it.fails`
marker, and the generator uses effective order, which for drawing elements is
declared order. Neither alternative is needed: C++ parameters stay as they are.

**Triage of W1–W8:**

| # | Finding | Placed |
|---|---|---|
| W1 | Re-binding stacks a second observer; a failed re-bind loses the original | **Carried forward, not PR-04.** Generated code binds each attribute once per element, and the validator rejects a duplicate attribute. A hand-written-use defect; for PR-05, when an application first drives the runtime directly |
| W2 | `font`, `align`, text binding live on `u8g2gl_obj` in C++, so every element inherits them | **Carried forward.** A standards §3 ISP concern on merged runtime, not a PR-04 defect; moving them is a runtime redesign. Reported to the Chief Architect |
| W3 | `u8g2gl_progress_bar::set_value()` marks dirty without a change guard | **WO4** — runtime, house pattern |
| W4 | Composites inherit `u8g2gl_obj`'s props | **Accepted, intended.** A composite realises as `u8g2gl_obj` (§13.12), so its container has those setters |
| W5 | Comments stale after F2 in `validate-references.ts`, `schema/widget-manifest.ts` | **WO3** |
| W6 | §6.3 lists `bind_src` (xbm), `bind_glyph` (glyph); no manifest or runtime declares them | **Chief Architect** — spec lists bindings that do not exist. Today they fail honestly as unknown attributes |
| W7 | A full subject asserts in debug before `false` is observable | **Accepted, by design.** The header documents it; generated capacities are exact, so it cannot fire in generated code |
| W8 | `test_subject.cpp` placeholder header, stale comment | **WO4** |

### WO3 — complete (`a652fd6`), `partial` by design

**Verified independently:** commits only on the WO3 branch; `docs/` untouched; C++
260 → **266**, zero warnings; CLI 383 → **406**; `tsc` clean; `npm run lint` clean and
now also type-checks the tests. Only the seven class-backed manifests declare
`extends`; `u8g2gl_obj` is the root through one documented constant; the cross-test
exception list is gone.

[D-20] is now real end to end: `bind_x/y/width/height` on objects (one slot, one
observer, per-axis setters so dirty only on change), four geometry `<bind>`s on
`u8g2gl_obj.xml` and each drawing manifest, binding types checked from manifests,
and `U8G2GL_BOUND_GEOMETRY_ANCHORED_CHILD`. `COMMON_ATTRIBUTES` now holds only
identity/anchor/style attributes; geometry and `hidden` come from manifests.
`focusStyle` stays because the parser writes and references reads it.

**F6 was four times worse than recorded** — sixteen test type errors, three of them
`@ts-expect-error` over commented-out code checking nothing. This is the vacuous-test
pattern again, and the test type-check now in `lint` is what stops its return.

**Decisions accepted:** drawing elements bind only the four [D-20] axes (§1.5 — no
demonstrated need for bindable `radius`); `hcenter="false"` is not an anchor; a
composite's `<view>` children count as its children for the [D-20] rule.

**The stop-and-report — PA decision: no new vocabulary for flags.** The worker could
not declare `hidden` for drawing elements because `BindDef` describes attributes,
not `<bind_flag_if_*>` children. None is needed. §8.4 fixes the flag set at
`hidden` and `disabled`, so it is not per-element data. `hidden` applies to every
element (realised as an object flag or as a draw-time guard, §13.5); `disabled` on a
`draw=`-only element is an error, because there is nothing to disable. That rule
follows from "has no class", which the registry already knows — not from an element
list. → WO5.

**Worker decision overruled — binding overloads.** It accepted every type declared
on the same C++ method, so `bind_text` accepts an int subject (§8.4's own example)
but `bind_text_int` now also accepts a string. `bind_text_int` appears nowhere in the
spec. **Decision:** delete `bind_text_int`; declare `bind_text` once per subject type
(`<bind name="bind_text" type="string" …/>` and `type="int"`); the validator accepts
a subject type if any binding of that name declares it; the registry merges bindings
by (name, type). This is existing vocabulary used twice, not new vocabulary, and it
removes the inference. → WO5.

**Remaining findings:**

| # | Finding | Placed |
|---|---|---|
| 3 | On drawing manifests `<bind setter="width">` names a prop, not a method — the two-meanings ambiguity §13.1 criticises | **Owner, at the WO4 checkpoint.** A dedicated attribute is new vocabulary. Interim: as built, documented |
| 4 | Composite interiors are prop-checked but not type-checked | **WO7** — a `$subject` resolves only after expansion, so types are checked on the expanded tree |
| 5 | `CommonAttributes` in `schema/widget-node.ts` still lists geometry and `hidden` | **WO6** — the resolver reads geometry off nodes |
| 6 | A manifest with both `setter=` and `draw=` props is undefined | **WO5** — an error: [D-18] says a manifest declares one or the other |
| 7 | `vitest run` alone does not catch test type errors | **Accepted** — every WORKORDER's green definition already includes `lint` |

### WO4 — complete (`6a78247`)

**Verified independently:** commits only on the WO4 branch; `docs/` and `cli/`
untouched; C++ 266 → **277**, zero warnings after reconfigure; CLI 406 unchanged,
`tsc` and lint clean. The version guard's refusal is proven by a real failing
compile — `VersionGuard.MismatchedSchemaMajorFailsToCompile` passes only when the
compiler stops with the guard's own message, with a matching-major control beside it.

**Delivered:** `u8g2gl_render_object(U8G2&, objs, parents, index)` taking a screen's
own arrays (effective visibility, empty-clip skip, state saver, clip, `render()`,
reset); `u8g2gl_version.h` at runtime 0.4.0 / schema 0.4 with
`U8G2GL_REQUIRE_SCHEMA_VERSION`, and a configure-time check that CMake and the header
agree; `u8g2gl_frame_dirty_observer`, pinned to the observer type at library build
time; W3 and W8 closed.

**Decisions accepted:** the guard compares the **schema** major, not the generator
major — the CLI and runtime are versioned separately, so a generator comparison
would mean nothing (rules/03-versioning.md). Clip is reset to the full display after
each object because U8G2 cannot read the clip back. Negative clip origins clamp to 0.

**Interruption handled without loss.** The worker hit the API usage limit mid-flight
with eleven files uncommitted. Nothing was committed, stashed or discarded on its
behalf; the same worker was resumed with its context and re-derived its state from
`git diff`. Recorded because a fresh worker reconstructing a half-finished diff is
the riskier path, and this is the first time it has come up.

**Triage of F1–F8:**

| # | Finding | Placed |
|---|---|---|
| F1 | `setClipWindow(x, y, x+w-1, y+h-1)` clips away the last column and row. **Confirmed against U8G2 source** (`departures-board-v3/framework/.pio/libdeps/esp32dev/U8g2/src/clib/`): `u8g2_apply_clip_window` sets `user_x1 = min(user_x1, clip_x1)`, whose default is `width`; `u8g2_IsIntersection` states "upper limits are not included"; `u8g2_DrawHVLine` returns on `x >= user_x1`. So `clip_x1` is **exclusive** and the correct call is `setClipWindow(x, y, x+w, y+h)`. Affects WO4's `u8g2_render_object`, `u8g2gl_label`'s scroll clip, and design_spec §11.3's text | **Owner checkpoint** — proposed WO4b; §11.3 to the **Chief Architect** |
| F2 | §16 says runtime and CLI are versioned "in lockstep"; they are not (CLI 0.6→0.7, runtime 0.4), and §16 does not say which major is compared | **Chief Architect** — spec defect; rules/03-versioning.md already describes the real, separate versioning |
| F3 | The guard cannot catch 0.3 → 0.4, which §15.4 calls breaking, because both are major 0 | **Owner checkpoint** — pre-1.0 policy |
| F4 | `u8g2gl_state_saver` does not save the clip window, though its header and §11.3 say it does; nor font or bitmap mode | **Owner checkpoint** — proposed WO4b |
| F5 | Generated capacities do not reach the library: the pool is sized in `u8g2gl_obj.cpp`, compiled without the generated header | **WO9** (design) and **WO10** (proof). Without it [D-21] silently does not happen |
| F6 | A scrolling `u8g2gl_label` sets its own clip and resets to full display, so it can draw outside its container | **Owner checkpoint** — proposed WO4b |
| F7 | §13.12 calls `render()` directly; generated code copying it would draw hidden objects unclipped | **WO10** (must use the wrapper, with a test) and **Chief Architect** (example predates the wrapper) |
| F8 | Other test files may still carry placeholder headers | **End-of-PR readability review** |

---

## Owner Checkpoint — after WO4 (2026-09-14)

WO1–WO4 repaired merged code and are complete and verified: C++ 240 → **277**, CLI
266 → **406**, zero warnings. Stack tip `u8g2gl-generator/wo4-runtime-support`. Every
WO1–WO4 finding is placed above. Four things need the owner before WO5 is dispatched.

**1. Add WO4b — clipping correctness (F1, F4, F6)?** Recommended. [D-18] made
composites real containers precisely so that clipping would mean something, and the
three findings together say framework clipping is not yet trustworthy: the clip
corner **is** off by one (F1, confirmed against U8G2 source after the checkpoint was
first written — the second corner is exclusive), the state saver does not save the
clip it claims to, and a scrolling label escapes its container. WO10's compile layer
runs against the U8G2 stub, which cannot catch any of them. Scope: correct every
`setClipWindow` call to the exclusive form and add a stub test that pins it;
`u8g2gl_state_saver` saves and restores the clip (or the claim is removed); the label
clips inside the effective clip rather than replacing it. The stub should model
U8G2's exclusive upper bound so the test means something.

**2. Pre-1.0 version guard (F3).** The guard as built compares the schema major, so
0.3 against 0.4 compiles. Recommended: while major is 0, compare major **and** minor,
matching §15.4's statement that 0.3 → 0.4 is breaking. A one-line change to the
macro, which already takes the minor. Belongs in WO4b if approved, otherwise WO9.

**3. `setter=` on drawing-element bindings (held from WO3).** `<bind name="bind_width"
setter="width">` uses `setter=` to name a prop, not a method — the two-meanings
ambiguity §13.1 says [D-18] resolved. Options: (a) keep, documented; (b) a dedicated
attribute such as `prop=`, which is new manifest vocabulary, a schema-minor owner
decision. Recommendation: **(a) for PR-04**, with the ambiguity recorded against the
next schema bump. Nobody has shown the need, and §1.5 prices vocabulary highest.

**4. WO5 has grown.** It now carries the `generate` command and shared load path, the
not-yet-supported policy, F5 and F9 from WO1, three WO3 carries (flags, `bind_text`
overloads, mixed manifests) and the `extends` message. Recommended split:
**WO5a — manifest and validator carries** (flags, overloads, mixed manifests,
`extends` message, F5 single-file shadowing) and **WO5b — `generate` command**
(load path, policy, writer, `--check`, F9). The carries are validator behaviour
changes; the command is new surface; one diff for both is not reviewable — the same
reasoning that split PR-3R's WO5 from WO5b.

If all four are approved as recommended, the ledger goes from twelve work orders to
fourteen (WO4b, WO5a/WO5b).

### Checkpoint rulings — Chief Architect, delivered in the owner's session, 2026-09-14

Recorded in PROGRAM.md; spec at `main` @ `ef73776`. **The ledger is now fourteen work
orders.** Provenance: the rulings were pasted into this Principal Architect session by
the owner, as the answer to the checkpoint the owner's approval established; they
amend the approved decomposition within PR-04's mandate and do not replace the Human
Approval below.

1. **WO4b — APPROVED.** F4 and F6 are ordinary defects, fixed in WO4b. For F1: put the
   clip-window corner convention in **exactly one function**, document it there as an
   assumption **not verified by a pixel test**, pin the chosen convention with a test,
   and **do not fetch U8G2 source**.
2. **Version guard — APPROVED, in WO4b.** Compare major, and minor too while major is 0.
   §16 and `rules/03-versioning.md` on `main` now say this.
3. **`setter=` naming a prop on `<bind>` — KEEP for PR-04.** Recorded as **Q-9** for the
   next schema bump. No `prop=`, no new manifest vocabulary.
4. **WO5 split into WO5a (findings) and WO5b (`generate`) — APPROVED.**

**Non-blocking findings, resolved on `main`:** F2 fixed (§16: runtime and CLI versioned
independently). F7 fixed (§13.12 now calls `u8g2gl_render_object()` for every object,
draw calls kept in document order — WO10 may follow the example). W2 recorded as
**Q-10**, decided before E-2 — **do not** move `font`/`align`/text binding off
`u8g2gl_obj` in PR-04. W6 removed from §6.3 and recorded as **Q-12** — **do not**
implement `bind_src` or `bind_glyph`. **Q-11**: the PR-02 catalogue builder took
`--u8g2-path` without recording it.

**`bind_time` — confirmed shipping.** §13.12 calls it, correctly. For the record, it
was delivered in **WO2** (`33cd27b`: the method, and `type="time"` on the manifest),
not WO4; both are in the stack.

**Rebase target is `main` @ `ef73776`** (§6.3, §13.12, §16, §21, rules/03 changed).

### PA note on F1 — the ruling's premise and the evidence

Ruling 1 was premised on there being no U8G2 checkout on this machine. After the
checkpoint was first sent, a search completed and found U8G2 **2.36.18** already present
in departures-board-v3's PlatformIO cache
(`departures-board-v3/framework/.pio/libdeps/esp32dev/U8g2/src/clib/`). Nothing was
fetched. Reading it shows the second clip corner is **exclusive**
(`u8g2_apply_clip_window`, `u8g2_IsIntersection`, `u8g2_DrawHVLine`; commit `fcdce73`).

The ruling's structure is followed exactly — one function, a pinning test, a PR-06
pixel test — and WO4b chooses the exclusive form the source supports. The single
adjustment is wording: the comment says the convention is **read from U8G2 source but
not verified by a pixel test**, rather than an unsupported assumption, because the
first is true and the second no longer is. Raised with the owner rather than applied
silently.

**Obligation on PR-06.** PR-06's real-U8G2 build must add a **pixel test at a container
edge**: an object whose clip is exactly its bounds, drawing to its last column and row.
Any one-pixel difference in the corner convention shows directly. If it disagrees, the
fix is the one function WO4b creates, and the pinning test's comment points there.

### WO4b — complete (`4094489`)

**Verified independently:** commits only on the WO4b branch; `docs/` and `cli/`
untouched; C++ 277 → **284**, zero warnings after reconfigure; CLI 406 unchanged, `tsc`
and lint clean. `grep setClipWindow include src` finds exactly one call, in
`u8g2gl_apply_clip` (`src/u8g2gl_core.cpp:191`). All four version-guard compile tests
pass, including `VersionGuard.StaleSchemaMinorFailsToCompile` — 0.3 against 0.4 now
really fails to compile.

**Delivered:** `bool u8g2gl_apply_clip(U8G2&, const u8g2gl_rect&)`, the exclusive
`(x, y, x+w, y+h)` convention, documented there with the U8G2 2.36.18 evidence and the
PR-06 pixel-test obligation, pinned by a test naming it; the state saver's header now
states it does not save clip, font mode or bitmap mode (U8G2 has no getters for them),
with clip lifetime the wrapper's job; `u8g2gl_label::render()` no longer touches the
clip in any mode; the guard compares major, and minor while major is 0.

**The worker proved its tests catch the defects** by building them against the old code
in a throwaway worktree: the container test failed on the old label (two clips set,
right edge 99 not 40), and `(0, 3)` compiled cleanly against the old macro.

**Spec disagreement, correctly not resolved:** design_spec §11.3 on `main` still says
`x+w-1, y+h-1` and that the state saver saves the clip. → **Chief Architect.**

**Triage of G1–G7:**

| # | Finding | Placed |
|---|---|---|
| G1 | **The runtime does not compile against real U8G2.** `u8g2gl_state_saver` calls `getFont()`, which U8G2 2.36.18's `U8g2lib.h` does not declare — only the stub does. **Verified by the PA:** every `U8G2` method the runtime calls was checked against the real header; `getFont` is the only one missing. Real U8G2 exposes the font as `getU8g2()->font` (`U8g2lib.h:70`, `u8g2.h:359`). Pre-dates PR-04; invisible because nothing has ever compiled the runtime against real U8G2 | **Owner — proposed WO4c** |
| G2 | `render_animation_update()` cannot see ancestors, so a marquee redrawn while the loop is blocked is bounded by its own bounds, not its container's; the next full frame is correct | **Accepted** — [D-5]'s escape hatch runs outside the frame by design; the limitation is documented at the label |
| G3 | Comments outside the box still overstate the state saver (`u8g2gl_obj.h:396`, `u8g2gl_button.cpp:85`) | **End-of-PR readability review** |
| G4 | The far clip corner is not clamped to the display; `u8g2_uint_t` is 8-bit without `U8G2_16BIT` | **Downgraded, proposed WO4c.** `u8g2.h:74` forces `U8G2_16BIT` on every 32-bit environment, which is every supported target (§2.1); only AVR is exposed. A clamp in `u8g2gl_apply_clip` is cheap insurance, not a live defect |
| G5 | The stub records clip calls but does not model U8G2's exclusive bound | **Accepted** — PR-06's container-edge pixel test is the real check |
| G6 | The "major only from 1.0" branch of the guard has no test | **Accepted** — no runtime at major 1 exists to test against |
| G7 | This branch's `rules/03-versioning.md` predates `main` @ `ef73776` | **Rebase before submission** |

### Proposed WO4c — runtime compiles against real U8G2 (awaiting the owner)

**Not added to the ledger on the PA's judgement** — the owner has just set it at
fourteen. Recommended because G1 is a hard compile failure in merged code that PR-05's
first real build would hit, and the cause — a test stub offering an API the real library
lacks — will recur unless the stub is corrected:

- the state saver reads the font via `display.getU8g2()->font`;
- the stub stops declaring `getFont()` and gains `getU8g2()` returning a struct with a
  `font` member, so the runtime can no longer compile against an API real U8G2 lacks;
- G4's far-corner clamp in `u8g2gl_apply_clip`.

Small, runtime-only, and independent of WO5a–WO12, so it can land anywhere in the stack
before submission. Evidence: U8G2 2.36.18 in departures-board-v3's PlatformIO cache,
read, nothing fetched.

### WO5a — complete (`a31527c`)

**Verified independently:** commits only on the WO5a branch; runtime `src/` and
`test/` untouched; C++ 284 unchanged, zero warnings; CLI 406 → **418**, `tsc` and lint
clean. `bind_text_int` appears nowhere in the manifests or the bundle; `bind_text` is
declared once per subject type on `u8g2gl_obj`, `u8g2gl_label` and `u8g2gl_button`.

**Delivered:** `U8G2GL_INAPPLICABLE_FLAG` for `disabled` on a drawing element, decided
from the effective manifest, never a tag; bindings merged by (name, type), with WO3's
same-setter inference removed, so a string subject on an int-only binding fails again;
`U8G2GL_MIXED_EMISSION_TARGETS`; the unknown-`extends` message now carries the §6.5
remedy; single-file `validate` of a bundled framework manifest no longer reports
shadowing, while a project copy still does.

**The worker ran its new tests against the base** in a throwaway worktree: eight fail
there, one or more per line item, and every control passes on both. One existing test
changed, correctly — it pinned the replace-by-name binding merge this work order
reverses.

**Triage:**

| # | Finding | Placed |
|---|---|---|
| 1 | Flag values are never checked: `flag="hiden"`, or a directive with no `flag`, validates silently | **WO7** — its types pass already walks binding directives on the expanded tree |
| 2 | "Is a drawing element" is spelled in three places (schema pass, prop checks, cross-test) | **WO8** — one registry helper, the three call sites migrated. Realisation needs the same predicate, and PR-3R's evidence says three copies is where the next defect hides |
| 3 | `bind_text_int` still appears in `docs/ui_flows.md:174` and d19 | **Chief Architect** |
| 4 | A binding name now appears once per type, so emission must choose the overload matching the subject, never the first by name | **WO8, WO10, WO11** |
| 5 | Composites are not checked for mixed emission targets | **Accepted** — composite props carry neither `setter=` nor `draw=` |
| 6 | Single-file mode reports `UNKNOWN_SCHEMA_VERSION ''` for any non-project file | **WO5b** — the single-file path moves into `loadProject()` |
| 7 | WORKORDERs said "stop and report"; dispatch prompts said "record and continue" | **Resolved** — defined once under Standing instructions |

## Human Approval

<!-- The owner's own words and the timestamp. A worker verifies this as its
     authorization. The Chief Architect's decisions above are not approval of
     this decomposition; this is. -->

**APPROVED by the human (Matt McNeill) on 2026-09-13**, recorded at
`2026-09-13T19:59:36Z`.

The owner's own words, verbatim:

> "Approved — proceed with the twelve work orders, start WO1"

Context: the owner had the twelve-work-order decomposition, the six findings
above, the sharing decision, the Chief Architect's answers to the five decisions
and the PA's `bind_time` decision in front of them.

## Status Log

- 2026-09-14 — **WO5a complete** (`a31527c`, report `1ebbae3`). Verified
  independently. WO5b dispatched on `u8g2gl-generator/wo5b-generate-command`. WO4c
  still awaiting the owner.
- 2026-09-14 — **WO4b complete** (`4094489`, report `084339c`). Verified
  independently. G1 confirmed against real U8G2: the runtime does not compile against
  it (`getFont()`). **WO4c proposed to the owner, not added.** WO5a dispatched on
  `u8g2gl-generator/wo5a-validator-carries` — CLI-only, independent of G1.
- 2026-09-14 — **Checkpoint rulings received** (Chief Architect, `main` @ `ef73776`):
  WO4b approved, version guard approved, `setter=` kept (Q-9), WO5 split approved.
  Ledger now fourteen. WO4b dispatched on `u8g2gl-generator/wo4b-clipping-version`;
  WO5a/WO5b drafted; `wo5-generate-command/` retired in favour of the two.
- 2026-09-14 — **WO4 complete** (`6a78247`, report `0a8a77f`). The worker was cut
  off by an API usage limit with its work uncommitted; the tree was left untouched
  and the same worker resumed with its context, finishing from that state. Verified
  independently. **Owner checkpoint reached — WO5 not dispatched.**
- 2026-09-13 — Chief Architect ruling on F3 (`main` @ `4e4b992`): `extends` must name
  a manifest. The registry's error stays; its message gains the remedy (→ WO5).
- 2026-09-13 — **WO3 complete** (`a652fd6`, report `d2b79ca`), status `partial` by
  design. Verified independently; stop-and-report resolved by the PA; one question
  held for the owner checkpoint. WO4 revised and dispatched on
  `u8g2gl-generator/wo4-runtime-support`.
- 2026-09-13 — **WO2 complete** (`33cd27b`, `0257d57`, report `400cf1b`). Verified
  independently; two design questions answered by the PA, consistent with the Chief
  Architect's F3 ruling on `main` @ `4e4b992`. WO3 revised and dispatched on
  `u8g2gl-generator/wo3-bindable-geometry`.
- 2026-09-13 — **WO1 complete** (`6c71715`, report `984aff2`). Verified independently;
  findings triaged below. WO2 revised and dispatched on
  `u8g2gl-generator/wo2-manifest-parity`.
- 2026-09-13T19:59Z — **Approved by the owner.** WO1 branch cut from `f693aab`;
  WO1 dispatched.
- 2026-09-13 — Chief Architect answered the five decisions and four spec reports;
  recorded above. `bind_time` decision taken by the PA.
- 2026-09-13 — Decomposition drafted by the Principal Architect.
