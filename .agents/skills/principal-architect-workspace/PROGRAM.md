# PROGRAM — U8G2GL

**Tier 1 · Chief Architect**
<!-- Last updated: 2026-09-04T11:25:07Z -->

## Mandate
Deliver U8G2GL per [design_spec.md](../../../docs/design_spec.md) v0.2: a build-time
XML-to-C++ UI framework for U8G2 monochrome displays. Upstream home is
`esp32-app-foundation`; `departures-board-v3` is the downstream pathfinder.

**Reloading after a compaction? Read [CONTEXT_BRIDGE.md](CONTEXT_BRIDGE.md) first.**

Human-facing plan: [implementation_plan.md](../../../docs/implementation_plan.md)
PR sequence and graph: [PROGRAM-PLAN.md](PROGRAM-PLAN.md)

## Status
**Planning.** Blocked on four programme decisions (PD-1 licence, PD-2 CLI home,
PD-3 ratify core object model, PD-4 legacy migration strategy). No PRs spawned.

## Reconnaissance findings driving the plan
- **A-1** `modules/U8G2Display/` is an INTEGRATION REFERENCE, NOT an architectural
  basis. Its flat imperative widget model is departures-board heritage; building a
  veneer over it would encode the design we are moving past. Corrected from plan v1.0.
- **A-2** Architecture parallels LVGL 9's core decomposition: obj, obj_class with
  base_class + property table, observer, group (focus), style, event. Diverge only
  where monochrome demands: no runtime tree/layout/dirty-regions ([D-4],[D-7]).
- **A-3** Object tree is build-time; runtime is a flat array with a parent index.
  Hierarchy semantics (inherited visibility, clip-to-parent) by walking up, ~1 byte
  per object, versus LVGL's per-node child vectors.
- **F-2** `uidesign/<board>/lvglpro/` → `modules/LVGLDisplay/ui/` is an exact
  precedent to mirror for XML-source → generated-code layout.
- **F-3** `ButtonModule`/`EncoderModule` exist — §12 input integrates, not invents.
- **F-4** `departures-board/tools/layoutsim` (vendored emsdk + build_wasm.py) makes
  [D-9] a port rather than a build.

## Repositories
| Repo | Role |
|---|---|
| U8G2GL | Programme home; host CLI if PD-2 lands standalone |
| esp32-app-foundation | Upstream runtime/binding/uidesign/build (Apache-2.0) |
| departures-board-v3 | Downstream consumer, pinned via framework.lock f53cc1d7 |

## Programme Session Log

### 2026-09-04T11:25:07Z — Programme initiated
Chief Architect engaged. Spec v0.2 committed at `a79aaa7`. Reconnaissance of
esp32-app-foundation and departures-board-v3 completed; findings F-1..F-4 recorded
above and folded into the plan.

Key architectural call surfaced for human decision: PD-3 (widget naming). Existing
`LabelWidget` et al. are consumed by every system board and by pinned downstream v3.
Recommendation is type aliases (`using u8g2gl_label = LabelWidget;`), which delivers
[D-12]/[D-13]'s 1:1 XML↔class readability at zero blast radius. This converts the
programme's single largest compatibility risk into a header of using-declarations.

Sequencing deliberately front-loads independently valuable work (subject system,
display catalogue, Wasm preview, pixel-regression harness) ahead of the PR-07 gate,
so that a NO-GO at the gate still leaves the foundation better off. Stopping must
be cheap for the gate to be honest.

Defect surfaced, not ours to fix: esp32-app-foundation/library.json declares
`CC-BY-NC-SA-4.0` against an Apache-2.0 LICENSE and 120 Apache SPDX headers.

### 2026-09-04T15:56:37Z — Plan v1.1: heritage anchoring rejected
Human correction: do not let `modules/U8G2Display` heritage constrain the design;
target the optimal architecture paralleling LVGL for u8g2 matrix displays.

Plan v1.0 had reduced the programme to "codegen over the existing runtime" — sunk-cost
reasoning. Rewritten: the legacy module is an integration reference only (A-1), the
architecture parallels LVGL 9's core (A-2), and hierarchy resolves at build time to a
flat runtime (A-3).

Consequences: PD-3 changed meaning entirely — from "widget naming aliases" (an artefact
of building on legacy) to "ratify the core object model". New PD-4 covers legacy
migration by strangler-fig, since six system boards and a pinned downstream v3 depend
on the old module. New PR-00 is a real prerequisite: the committed spec has no object
model section at all — it goes from XML tags straight to widget behaviour. That gap was
invisible while legacy widgets were assumed and is fatal now. PR count 10 → 12.

### 2026-09-05T07:52:18Z — XML-to-code contract authored (spec §13, v0.3)
Closed the gap between generator and runtime work packages. §7 of the plan had
flagged PR-03 ∥ PR-04 as blocked on an unwritten contract; that contract is now
design_spec.md §13, normative, at spec v0.3 / schema 0.3.

Load-bearing decision [D-17]: widget properties are build-time `<api>` manifests
the generator reads, not runtime property tables. Considered and rejected: a
hardcoded generator table (makes custom widgets second-class) and an LVGL-style
runtime property table (pays dispatch and type erasure for a build-time lookup).
LVGL needs lv_obj_property at runtime because its editor loads XML on-device;
we have no runtime XML, so we need the descriptor without the dispatch.

Second-order win: built-in and custom widgets collapse to one mechanism. The
generator's widget knowledge becomes data, so adding a widget needs no generator
release. This retroactively strengthens §6.4 — the Tier-4 story was previously
asserted but not mechanised.

§13 also settles identifier mangling and collision policy (hard error, never a
silent rename), the static-demotion rule, component-inlining semantics, [A-3]'s
flat array with parent indices, and byte-level determinism — no timestamps, so an
unchanged project regenerates to an empty diff, which matters because generated
code is committed ([D-11]) and appears in review.

Still blocked on PD-1..PD-4. No Tier-2 PA spawned.

### 2026-09-05T09:22:51Z — PD-1 and PD-2 resolved; repository topology corrected
Human resolved PD-1: **MIT**, matching U8G2 (BSD-2-Clause) and LVGL (MIT), on the
reasoning that an Apache-2.0 project consuming MIT as a submodule is fine. Verified
and correct — MIT is the more permissive licence and flows downstream cleanly.

Investigating that phrasing surfaced a topology error in the plan. Foundation's
`modules/LVGLDisplay/library.json` declares `"lvgl/lvgl": "^9.5.0"` as an external
dependency plus `"UIDesign": "*"` for generated UI; LVGL (MIT) already sits inside
this Apache-2.0 project alongside six other MIT components. So the established
pattern is: MIT framework as a dependency, thin Apache-2.0 integration module in
`modules/`.

Plan v1.2 had PR-01 (object model) and PR-03 (widget set) landing *inside*
foundation. That was wrong — it would have made U8G2GL a foundation-internal
feature rather than a library, contradicting concept.md's positioning and making it
unusable by any U8G2 project that is not a foundation app. Corrected in v1.3: the
runtime and CLI both live in the U8G2GL repo (MIT); what goes upstream is
`modules/U8G2GLDisplay/` (Apache-2.0), the integration module. PR-01..PR-04 and
PR-06 all move to this repository; only PR-05 and PR-07 land in foundation.

This also resolves PD-2 more strongly than the original question framed it — the
CLI question was really a question about what the U8G2GL repo *is*.

Remaining: PD-3 (ratify object model, blocks PR-01), PD-4 (legacy migration,
blocks PR-05).

### 2026-09-05T10:48:18Z — PD-3 and PD-4 resolved; all programme decisions closed
PD-4: strangler-fig. PD-3: LVGL-parallel decomposition, **virtual base class**,
flat runtime array with parent index.

The PD-3 discussion changed my recommendation. I had proposed a monomorphic model
(~12 B/object, no vptr) on efficiency grounds, since the generator already emits
concrete calls. The human asked whether the extra cost was worth keeping dynamic
creation open. Two things emerged:

1. My own monomorphic proposal still needed dispatch for focus routing, and would
   have supplied it as a generated per-screen function-pointer table — a hand-rolled
   vtable. That is the same error as mirroring lv_obj_class in C++, inverted. Once
   dispatch is needed anywhere, the language's mechanism is cleaner and no dearer.
   This argued *for* the human's position, against my own recommendation.
2. My quoted cost was wrong: ~60 B per screen, not 90. Corrected in the plan.

Recorded an important boundary so a capability is not assumed that has not been
bought: a vptr buys polymorphic dispatch and generic traversal, **not** dynamic
creation. The latter also needs an allocator (pool, not heap, on these parts), a
class registry, a runtime property mechanism ([D-17] deliberately removed one),
mutable object/parent arrays where §13.3 emits static const, and lifetime rules.
All five are additive later; the vptr is the one piece structurally hard to
retrofit, which is what justifies paying now. The model is *ready for* dynamic
creation, not *capable of* it.

Also corrected two stale [A-2] rows: lv_obj_property withdrawn (superseded by
[D-17]) and lv_obj_class reclassified from "Adopt" to "Reject the mechanism" —
it hand-rolls in C what C++ provides natively under [D-3].

**All four programme decisions are now closed. PR-01 and PR-02 are unblocked and
parallelisable.** No Tier-2 PA spawned yet.

### 2026-09-05T11:21:27Z — External architecture review ingested
Reviewer endorsed the v0.1→v0.3 corrections and the additions ([D-14] catalogue,
[D-15] deadline return, [D-17] manifests, §13 contract, [D-16] --json). Four
pushbacks; three accepted, one accepted-with-a-better-fix.

1. **`<row>`/`<col>` deferred to Phase 2.** Accepted, but for a stronger reason
   than offered: the cost is schema surface, not generator complexity. Summing
   widths is trivial; the problem is that shipping `<row>` in schema 0.3 makes it
   permanent, and its design is unsettled (how `gap` interacts with an anchored
   child; what `right="0"` means inside a row). Anchors + arithmetic already solve
   the multi-target motivation. Now PR-08b, conditional on demonstrated need.

2. **Strangler-fig needs a maintenance-freeze date.** Accepted in full — a real
   gap. Without it both modules take bug fixes and drift. Added a trigger table
   to PD-4: frozen at PR-05 (first board migrated), deprecated at PR-10, removed
   when v3 advances its lock. Enforced at review, with shared issue references
   required for any fix landing in both during the frozen window.

3. **§13 may be necessary but not sufficient for PR-03 ∥ PR-04** (constructor
   signatures, base layout unspecified). Observation correct, proposed remedy
   ("tight coordination") rejected — coordination manages a coupling that should
   instead be severed. Added to §13.7: every widget is default-constructible and
   configured solely via setters, so the generator never needs a constructor
   signature; plus an explicit list of what the generator may not assume (class
   size, field layout, base offsets, allocation, internals). The contract is now
   sufficient and the two PRs are genuinely independent.

4. **Phase 3 preview over-scoped.** Partially accepted with a sharper cut than
   proposed. Hot reload is cheap and high-value over PR-06's existing Wasm
   harness — kept. The font/glyph browser is the part that is real web
   development — made discretionary, justified by demand rather than assumed.

No change to any [D-n] decision; all four were refinements to scope, sequencing
and contract completeness.

### 2026-09-08T23:09:00Z — PR-01 Complete: Runtime Core
**Summary**: C++ runtime library delivered across 7 WOs (5 initial + 2 post-review
remediation). 80 tests, zero warnings, ~870 B static RAM for a representative
15-widget/8-subject project. All §13 contract surfaces implemented.
**Cross-PR decisions**: (1) Subject observer capacity is template-parameterised —
PR-04 generator must count bindings per subject and emit `_n<N>` types.
(2) `bind_text()`/`bind_flag_if_*()` take `_base` subject types — PR-03 uses this.
(3) Style embedding deferred (Finding E trigger: 50+ objects or §18 flag).
**Architecture evolution**: PD-3's object size target corrected from ~16 B to ~36 B
(style member was omitted). WO6 reduced actual from 48 B → 48 B on 64-bit (no
further change; subjects fell from 400→80 B). The runtime is heap-free and the
§13 contract is now *sufficient* — PR-03 and PR-04 are genuinely independent.
**Unresolved items escalated from PA**: None. Finding E deferred with trigger.
Stack tip: `u8g2gl-runtime/wo7-readability`.

### 2026-09-09T00:34:06Z — UI design closed; context bridge written
All seven editor decisions [UD-1..7] are settled and recorded in ui_spec.md,
now v1.1 with a decision-summary table at the top for orientation after a
compaction. The UI design discussion is complete; nothing from it remains only
in conversation.

Wrote CONTEXT_BRIDGE.md so a fresh session can reload cold: the decision
registers by ID, document precedence (design_spec on framework behaviour,
ui_spec on editor behaviour, plan on sequencing), programme state, the skills
and agents built, and seven process lessons that were earned rather than
assumed — branch verification, worktrees for parallel work, SendMessage being
disabled, tracing objectives to their API surface, measuring rather than
asserting size claims, syncing before stack submission, and checking worker
output for substance rather than presence.

State at time of writing: PR-01 merged (#1). PR-02 CLI in progress with six WOs
committed on branch. The live risk is R-8 — PR-02 must not freeze schema 0.3
without ui_spec §15's nine schema requirements, or 0.4 becomes a breaking
change. [U-1] and [U-6] gate that and need an owner decision.
### 2026-09-09T06:13:58Z — PR-02 ingested (CLI, schema, catalogue, validator)
Six work orders, 121 tests across 23 suites, clean build. Staged as PR #2.

**Verified independently rather than accepted from the report:**
- **Isomorphic boundary holds** — no `node:`, `fs`, `path` or `process` imports
  anywhere in `src/core/`, and the PA enforced it with ESLint rather than
  vigilance. This was the constraint most likely to be violated invisibly and
  most expensive to discover late.
- **Catalogue avoided the trap** — parses the 206 `u8x8_display_info_t` structs
  from `u8x8_d_*.c`, not constructor names, and filters to `_F_`. Yields 1637
  full-buffer constructors.
- **Determinism** — no `Date.now()`, `new Date()` or `toISOString()` anywhere in
  core or node.
- **Diagnostics exceed spec** — 22 stable machine codes, structured suggestion
  arrays, plus `endLine`/`endColumn` for range highlighting, which [D-16] did not
  ask for and Monaco will want.

**I was wrong about R-8, and the PA was right to push back on it.**
The bridge prompt said the nine ui_spec §15 editor requirements *gate* PR-02.
The PA deferred them to a WO7 with the reasoning that they are additive schema
extensions needing no restructuring. Checking that claim: `<previews>`, `group`,
palette metadata and sample data are all new optional attributes or new document
types. Adding an optional field to a schema is backward compatible — a minor
bump, not a breaking 0.4. So five of six are genuinely deferrable and my blanket
framing was too strong.

**The exception is [U-1], element identity, and it remains open.** `name` is
still `readonly name?: string` with no synthetic-id mechanism. This is the one
§15 item that is *not* additive: if the answer is "require `name` on editable
elements" that breaks existing XML, whereas synthetic ids would be additive. It
was the item I explicitly asked the PA to decide and it was not decided. It
should be settled before the editor work begins, not after.

**Process finding, repeated from PR-01:** the PA reports workers still paused for
approval despite WORKORDERs saying "commit on green build". The instruction is
being written but not obeyed — it needs to be more prominent in the worker spawn
prompt, not only in the WORKORDER body.

Readability review of the TypeScript is running separately.

### 2026-09-10T06:26:42Z — PR-02 merged; PR-03 briefed and running; context distilled

**PR-02 merged as #2.** Readability review returned no P1 and no P2 — 40/40
TypeScript files carry SPDX headers, purpose-first descriptions and TSDoc, and
the isomorphic boundary is ESLint-enforced rather than merely documented. The
contrast with PR-01, which shipped with no documentation at all, is entirely
explained by the `u8g2gl-standards` skill existing before PR-02 was written.
That is the clearest evidence so far that the standards infrastructure pays.

Two minor findings deferred, neither blocking: `core/validator/*.ts` uses an
unnumbered `// --- N. ---` banner instead of the house `// --- Step N: ---`
(59 correct uses elsewhere, so it is local drift), and `parse-widget-tree.ts`
threads a `diagnostics` parameter that is never written to — verified zero
`.push` calls, so either a placeholder or a dropped requirement.

**PR-03 briefed and running.** Seven WOs, owner-approved 2026-09-10. WO1
(primitives + label) complete; WO2 (scrolling label, xbm, glyph) in flight.

Element identity [U-1] was folded into PR-03 at the owner's request rather than
left to drift — correct, because it is the only non-additive item among ui_spec
§13's schema requirements and settling it after the generator exists is the
expensive path.

**The PA chose Option A — require `name` on every element.** I offered three
options and leaned toward the hybrid (name when present, positional synthetic id
otherwise, promoted to a real name on first edit). Option A is the one genuinely
breaking choice: it invalidates existing XML where the others would have been
additive. It may still be right, and the PA was asked to decide rather than
comply — but it carries the highest cost of the three and the reasoning must be
checked when WO6 lands, against round-trip fidelity, the sidecar state file, and
§13.4's mangling rules.

**Process failure, third occurrence, now with a diagnosis.** A workspace commit
landed on PR-02's own branch. Recovered before it reached the remote. The rule in
`.agents/rules/04-branch-hygiene.md` existed and I still did it, because I printed
the branch in the *same batched command* as the commit — so the check produced
information I could not act on. **A check must gate the action, not accompany
it.** Where another session holds the tree, the answer is a worktree, which is
what this distillation used.

**Context distilled** into CONTEXT_BRIDGE.md §4 and §7 ahead of a compaction:
full PR state with measured figures, the three things to scrutinise when PR-03
returns, and the corrected R-8 assessment.

---

## Session — 2026-09-10 · PR-03 merged, `[U-1]` closed

**PR-03 merged as [#3](https://github.com/cblabs-org/u8g2gl/pull/3).** Nine work
orders: WO1–WO7 as decomposed, plus WO8 and WO9 raised by the Chief Architect after
reviewing the open PR. C++ 166 tests, CLI 224, zero warnings. CLI `0.3.0` → `0.5.0`;
schema unchanged at `0.3`.

### `[U-1]` element identity — settled

`name` is required. **The CLI errors on a missing name; the editor generates one and
persists it on save.** The split is by journey because *auto-correction requires a
human who can see it and undo it* — the editor has an undo stack and a save cycle, a
build pipeline has neither. Full decision and reasoning: `docs/ui_spec.md` §16.1.

### Two review findings a green build did not catch

WO6 shipped 197 passing tests and both of these:

1. **Collision.** Synthesis counter was per-parent; the uniqueness namespace was
   per-screen. Two unnamed labels in two containers both became `label_0` and failed
   to a hard error — making the warn-and-continue path unreachable for exactly the
   documents that needed it. Fixed in WO8.
2. **Positional identity.** Names recomputed from position on every load, so an
   insertion renumbered later siblings. Generated code binds to the name, so this
   silently rebinds application code to a different widget. Fixed in WO9.

Both were found by reading the code against its stated intent and then *writing a
throwaway test to check*, not by reading alone. The reproduction took about five
minutes and neither defect was visible in the completion reports, which were accurate
about everything they claimed.

### Process lessons — both mine, both about deferral

**Name the consumer, and check when it arrives.** I deferred the positional-identity
defect as "an editor concern, nothing consumes it yet". The consumer was the
*generator* — PR-04, the very next PR. The owner caught it. "Nothing consumes this
yet" is a claim with a date on it, and the date is usually sooner than it feels.

**Check a prescribed fix is buildable before prescribing it.** I told the PA to
"write the name back to the document" and asserted it needed a round-trip serializer,
which would have made it a large piece of work properly belonging elsewhere. It
needed no such thing: source locations were already recorded, so an attribute
*insertion* sufficed. I had conflated "write to the document" with "re-emit the
document". Checking took one grep.

**A third, smaller one:** I rebased the stack onto `main` before noticing the branches
were already pushed, turning tidying into a rewrite of published history. The
force-push was blocked, which was the right outcome — I discarded the rebase instead.
Check whether a branch is published *before* rebasing it, not after.

### Worth keeping

The workers caught things the work orders did not specify. WO8 found that
`<style name="x"/>` names a style *reference*, not an element — a naive pre-pass would
have let it steal a label's identifier. WO9's integration test deliberately includes
the label manifest so revalidation is not confounded by `UNKNOWN_WIDGET`, which is the
exact trap I fell into checking it manually. Both are cases of a worker understanding
the intent rather than the letter, which is what the WORKORDER format is for.
