# PROGRAM — U8G2GL

**Tier 1 · Chief Architect**
<!-- Last updated: 2026-09-11T19:48:04Z -->

## Mandate
Deliver U8G2GL per [design_spec.md](../../../docs/design_spec.md) v0.2: a build-time
XML-to-C++ UI framework for U8G2 monochrome displays. Upstream home is
`esp32-app-foundation`; `departures-board-v3` is the downstream pathfinder.

**Reloading after a compaction? Read [CONTEXT_BRIDGE.md](CONTEXT_BRIDGE.md) first.**

Human-facing plan: [implementation_plan.md](../../../docs/implementation_plan.md)
PR sequence and graph: [PROGRAM-PLAN.md](PROGRAM-PLAN.md)

## Status
**PR-01, PR-02 and PR-03 merged** (#1, #2, #3). All four programme decisions
closed. PR-04 (generator) is next and is **gated on remediation** — see
[REMEDIATION-D18.md](REMEDIATION-D18.md) and the 2026-09-11 log entry.

Schema is **0.4** as of `245f9be`, breaking against 0.3. Design decisions
[D-18], [D-19] and [D-20] collapsed the widget tier model; PR-02's schema types
and PR-03's manifests no longer match the spec and must be corrected before the
generator consumes them.

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

---

### 2026-09-11T19:48:04Z — Widget tiers collapsed; PR-02/PR-03 remediation gates PR-04

**Owner-led design session, owner-approved.** Three decisions committed as
[`245f9be`](https://github.com/cblabs-org/u8g2gl/commit/245f9be), assessment as
`13b746b`. No code changed.

- **[D-18]** One element vocabulary. The four tiers are withdrawn. Whether an
  instance becomes an object or draw calls is a generator outcome governed by a
  single realisation rule, not an authoring category. Composites become real
  container objects; primitives are served by free draw functions shared by the
  firmware and editor targets.
- **[D-19]** `long_mode` on the label. `truncate` and `u8g2gl_scrolling_label`
  deleted.
- **[D-20]** Geometry is bindable; anchors resolve against the container.
  **No runtime layout pass — [D-7] survives untouched.**

**[D-6] is amended, not withdrawn.** Its rejection of runtime string lookup
stands in full; only its blanket ban on composing sub-elements goes, since the
generator resolves children to typed pointers at build time.

### The finding that forced this

Three separate problems shared one cause, and the owner found it by asking why
the component/widget distinction existed at all:

1. Components produced no runtime construct, so they had no box, no clipping and
   nowhere to hang behaviour. `right="0"` inside one had no referent.
2. Primitives could not be bound, so hiding a separator on a flag was impossible.
3. **Static demotion could never fire.** §13.5's first condition was "the element
   has no `name`" — and `[U-1]`, which this programme closed in PR-03, made
   `name` mandatory. §6's deletion of `<u8g2gl_text>` rested on demotion working,
   so it was a promise the generated code did not keep.

Item 3 is the one worth sitting with. `[U-1]` was decided carefully, reviewed,
and merged — and it silently disabled an optimisation specified three sections
away in the same document. Neither the decision record nor the WORKORDER
mentions §13.5. **A decision that changes what is always true about a document
invalidates every rule that tested for its absence**, and nothing in the process
looks for those.

### A second finding, about a research document

`widget_design_assessment.md` justified making `wd_train_formation` a C++ widget
on the grounds that "there is no XML composition that could express a nose cone
triangle overlapping a rounded rectangle frame". Reading the implementation,
`render()` uses only `drawRFrame`, `drawTriangle`, `drawLine`, `drawBox` and
`drawText` — all already in the primitive set. The claim is simply false, and it
had been repeated downstream before the owner challenged it.

The real line is **static structure versus data-driven structure**: `numCoaches`
arrives at runtime and determines the divider count, cell count and total width.
Corrected in place with a `[!CAUTION]` block rather than quietly, because the
bad argument had already travelled.

*Process point:* that document is marked "frozen research input, spec wins" —
which protected the spec from its *conclusions* but not from its *reasoning*,
which had been absorbed. Freezing a document does not quarantine the arguments
already taken from it.

### One latent defect, not a design issue

`set_coords()` does not call `mark_dirty()` (`src/u8g2gl_obj.cpp:28`). Harmless
while coordinates are only set during `init()`; a silent missed redraw the moment
[D-20] makes geometry dynamic. It works whenever anything else on screen is
animating and fails only on a static screen. **Recommended as its own fix,
first**, ahead of the schema work.

### Remediation — the critical path

Full assessment in [REMEDIATION-D18.md](REMEDIATION-D18.md).

| PR | Remediation | Gates PR-04? |
|---|---|---|
| PR-01 | Small — 3 contained items | No |
| PR-02 | Moderate — the schema model changes shape | **Yes** |
| PR-03 | Moderate — one class deleted, all 17 manifests touched | **Yes** |

PR-04 consumes the schema model and manifests directly, so starting it against
the current shapes means writing it twice. Recommended sequencing: the dirty-flag
fix alone first, then PR-02 and PR-03 remediation as one PR (the manifest changes
are two halves of one change and split leaves the cross-test red), then PR-04.

**Nothing invalidates the approach of any merged PR.** The object model,
catalogue, diagnostics, parser and widget implementations all stand.

### Two validator gaps found in passing

Both predate these decisions and close on the same code path as the remediation:
unknown element tags are not validated inside composites (the check runs only
over screens), and there is no cycle detection for a composite instantiating
itself.

### Deferred, recorded as open questions

`[Q-7]` conditional property visibility (`visible_when`), and `[Q-8]`
**repeaters** — a composite instantiated N times against a declared-capacity
collection. Q-8 is the one with teeth: it is the difference between a designer
being able to draw a list row and list rows being a C++ job permanently. Schema
surface, so §1.5 applies — deferred until a real screen demonstrates the need.

---

## Session — 2026-09-12 · [D-21] recorded, PR-3R decomposed

The tier-collapse decisions ([D-18]/[D-19]/[D-20], `245f9be`) invalidated parts
of merged PR-01/02/03. The PA's assessment (`REMEDIATION-D18.md`) was verified
claim by claim and accepted, with three amendments.

### [D-21] Static capacities are generated, not configured

`docs/decisions/d21-generated-capacities.md`, design_spec §3, §13.7, §18.1.

The pools were sized before the design changed under them.
`U8G2GL_MAX_BINDINGS_PER_OBJ` is 4, and [D-20] makes `x`/`y`/`width`/`height`
bindable — so one element binding its geometry has nothing left for `text`. Not
a tight fit; a ceiling the design's own examples cross. [D-18] raises object
counts structurally by making composites real objects. Neither is validated, and
`add_binding()` fails by returning `false`, which generated code can ignore: the
screen compiles, links, boots, and silently fails to update one widget.

The generator holds the whole document, so it emits the numbers instead of
inheriting a guess. The point is not that the failure moves earlier — it stops
existing for generated projects, because the pool is sized from the very bindings
being added.

Rejected: raising the defaults (a bigger guess, and static pools mean every
project pays the worst case), dynamic allocation (violates [D-1]), runtime assert
(discovered on hardware).

### Three findings the assessment did not have

1. **R1.1 is live, not latent.** `set_hidden()` and `set_disabled()` are public
   API and mark nothing dirty today. The bound path is safe — the observer marks
   dirty — so only imperative callers are affected, which is why no test caught
   it and why it works on any screen with an animation running.
2. **`TIER1_PRIMITIVES` has already drifted.** It names `frame`, `disc`,
   `bitmap` — no manifests — and omits `ellipse`, `pixel`, `triangle`, `xbm`.
   Tested: `<u8g2gl_frame>` passes validation, `<u8g2gl_nonsense>` is rejected.
   Three phantom tags would reach PR-04's generator with nothing behind them.
3. **The capacity gap above**, now [D-21].

All three came from writing a throwaway test rather than reading harder. That is
now twice in two reviews that a five-minute reproduction found something reading
did not.

### PR-3R decomposed — eight work orders, awaiting approval

`pr-3r-remediation/PROJECT.md`. Deviations from the assessment: R1.1+R1.2 merged
(the per-axis setters are the same functions needing the dirty call); the eight
`u8g2gl_draw_*` functions pulled into scope (WO4's manifests name them and the
cross-test would be red between work orders).

### Documentation carried forward

The standards skill gained three non-negotiables — mutators mark dirty, element
knowledge is data not code, capacities are generated — plus a §4.1 design
baseline naming [D-18]–[D-21], because code written against the old element model
looks plausible and is wrong.

**Correction to a note made mid-session:** `.claude` looked like a duplicate of
`.agents` and is in fact a symlink to it, documented in `.gitignore:54`. Writing
"both copies" through the two paths duplicated every insertion into the one file;
caught by counting the inserted markers, reverted, reapplied once. The check that
found it — count what you inserted — is cheaper than the reasoning that would
have avoided it.

---

## Session — 2026-09-13 · PR-3R merged; role corrected; the editor was missing from the plan

### PR-3R ingested — merged as #4

Twelve work orders (eight planned, four added during execution). The merged
runtime, CLI and widgets now match `[D-18]`–`[D-21]`. C++ 240 tests, CLI 266, zero
warnings, schema **0.4**, CLI **0.6.0**; readability review over the full 89-file
diff found no P1s. Full record: `pr-3r-remediation/PROJECT.md`, Project Wrap-Up.

**Cross-PR lesson, carried into PR-04's bridge:** three of the four substantive
defects were found by merging duplicated logic — the manifest cross-test, the
draw-layer test double, and the widget/composite prop paths. In each case the
duplication was where a defect had been hiding. PR-04 decides how much firmware
and editor generation share, and now has evidence to decide with.

**Architecture evolution:** `Component` no longer exists as a type — a composite
is a `WidgetManifest` with a `view`; `<component>` and `components/` are removed,
and using them gives an error naming the migration. Primitives that need no
object compile to `u8g2gl_draw_*` free functions. `long_mode="scroll"` reverses at
each end and `scroll_circular` wraps, matching LVGL.

**Escalated and still open:** there is no 32-bit measurement, because this host
can't build one, so §18 still can't quote a target figure; the interim binding
default costs a measured +5,120 bytes on 64-bit until PR-04 emits exact
capacities; the widget and composite prop checks are now nearly identical and
should be unified; manifest/runtime parity has never been audited as a whole.

### Role correction

The owner corrected this: the Chief Architect had been acting as PR-3R's PA —
decomposing it, briefing every worker, checking every diff, running the test
suites. The owner did ask for that, then withdrew the request as poor protection
for Tier-1 context, and they were right. Twelve work orders of `nm` output and
boundary-box diffs is exactly the detail the three tiers exist to keep out of
Tier 1.

**From PR-04 on:** each PR goes to a PA by bridge prompt. The Chief Architect
takes the result from `PROJECT.md` and does not check individual work orders.

### Chief Architect finding — no PR delivered the editor

With the role corrected, the first job was the Tier-1 artifacts — and they were
stale. `PROGRAM-PLAN.md` still showed PR-01 and PR-02 as blocked, put the runtime
in the wrong repo, named a property table (`[D-17]` rejected it) and component
inlining (`[D-18]` removed it), and had no PR-3R. It has been rewritten.

**The rewrite exposed the more serious problem.** `design_spec` §20 Phase 3 is
headed "Interaction & the Editor" and calls the editor "the programme's
destination, not an optional extra". The PR ledger's own Phase 3 is
"Consolidation and stretch" — migrating boards, retargeting departures-board —
and **no PR anywhere carried the editor**. Following the plan as written, the
editor would never have been built. That is the deferral-by-omission the owner
explicitly rejected in September, sitting in the dependency graph where nobody was
looking.

Checked, not assumed: the plan and the UI spec treat PR-02's validator and PR-04's
resolver as *inputs* to the editor, and push the glyph editor to "after the first
editor release" — but nothing schedules that release.

**Action:** an editor track (E-1 shell and round-trip, E-2 canvas and property
panel, E-3 sample data and navigation) is now in both ledgers **as placeholders
only**, so it can't drop out again. Its shape is owner decision **CA-1**.

**A second finding, CA-2:** all four PR-07 gate criteria are firmware-side, and
none measures the editor. A GO would say nothing about the programme's purpose,
and a NO-GO could end the editor without it ever being tested. Owner decision.

**Smaller fixes:** PR-08 no longer covers composites (PR-3R and PR-04 deliver
them); §20 no longer lists the removed `u8g2gl_scrolling_label`; and PR-04 ∥ PR-06
now has a stated condition — agree the editor registry's shape before either PA
starts, or one of them writes it twice.

---

## Session — 2026-09-13 (cont.) · PR-04 PA questions answered; spec defects fixed

PR-04's PA raised five decisions and four spec defects. The decisions went back
through the owner. The spec is a Tier-1 document, so the Chief Architect fixed it
directly after checking each report.

### Decisions for PR-04

1. **Focus rings, events and screen navigation — deferred to PR-09.** APPROVED.
   `generate` refuses them with `U8G2GL_NOT_YET_SUPPORTED`, and the realisation
   analysis still models them, so the rule stays complete and PR-09 won't have to
   reopen it. Collections (§9) and composites that also have C++ are deferred to
   PR-08 in the same way. **One condition:** `validate` has to report the same
   thing as a *warning*. Otherwise the editor, which runs validation, would show a
   document as valid that `generate` then refuses. That is the same journey split
   `[U-1]` uses — the build errors, authoring warns. None of this blocks the gate,
   because the PR-07 status-bar screen needs no focus, events or collections.

2. **Classed elements always become objects for now.** APPROVED as an interim
   measure, and recorded against `[D-18]` as an amendment. The alternative — a
   per-property marker saying when an instance needs no state, plus
   `u8g2gl_draw_label` — was declined: it is new manifest vocabulary (schema-minor,
   and schema surface is the costly kind of complexity under §1.5), and nobody has
   shown the need yet. Gate criterion 3 will show whether it matters. The §18
   budget report must say that label demotion is not yet delivered.

3. **Fonts and images — deferred out of PR-04, but moved onto the critical
   path.** Approved in part. PR-04 refuses `<bdf>` and PNG `<convert>` with a named
   error. **Checking showed that departures-board-v3 uses custom BDF fonts
   throughout** — `NatRailTall12`, `RailClockMega13`, `NatRailClockLarge9` and
   others — so PR-05 can't migrate a real board without `bdfconv`. **New PR-04b**
   (font and image pipeline, `[Q-2]`) sits between PR-04 and PR-05. `[Q-2]` was
   recorded as "work, not risk"; it is now on the critical path.

4. **`[U-6]` does not gate PR-04.** CONFIRMED — build no sample-data hooks.
   **Correcting the PA, and myself:** it doesn't gate PR-06 either. PR-06's
   snapshot harness supplies fixture values without deciding where authored
   samples live. `[U-6]` gates editor track **E-3**. The `CONTEXT_BRIDGE` note that
   said "PR-04's sample-data hooks" was mine and wrong, and has been corrected.

5. **Versions.** CLI goes to **0.7.0**. **Runtime 0.3.0 → 0.4.0: APPROVED.** New
   runtime API is a minor bump before 1.0, and it's within Chief Architect authority
   — `rules/03-versioning.md` reserves only schema bumps and releases for the owner.
   **No schema bump:** confirmed that `[D-20]`'s geometry bindings were already part
   of 0.4.

`[Q-1]` doesn't gate anything: `generate` builds one `<target>` per run.

### Spec defects — all four checked against the spec and the runtime

- **§13.3 vs `[D-21]`.** FIXED. The text said the parent index widens to `uint16_t`
  above 255, but `[D-21]` makes 254 a hard ceiling and rejected widening. The
  old text was also off by one — 255 ignores the `U8G2GL_NO_PARENT` sentinel.
- **§12.4 vs §13.7.** FIXED. One §12.4 example declared `tick` as `void`.
  Everywhere else in the spec, and in the runtime, it returns the next deadline
  (`[D-15]`).
- **§13.5.** FIXED. One frame-dirty observer per subject is enough, rather than
  one per subject per screen, because `u8g2gl_mark_dirty()` marks the active
  screen and activating a screen marks it dirty anyway. The cost is an
  occasional extra frame, accepted for the saving.
- **§13.12.** **Half fixed — the PA was half right.** `static status_bar bar;` is
  a real defect: after `[D-18]` a composite has no class, so it is now
  `static u8g2gl_obj bar;`. **But the spec's `bind_time` call is correct.** The
  clock is specified to bind time, in §6's widget table and through §8's `time`
  subject type. The defect is in merged code, not the spec. See below.

### Finding — the clock manifest names a method that doesn't exist

`include/u8g2gl/manifests/u8g2gl_clock.xml` declares
`<bind name="bind_time" type="int" setter="bind_time" />`. **There is no
`bind_time` anywhere in `include/` or `src/`.** The manifest points at a setter
that doesn't exist, and gives it the type `int` although the runtime has a
`u8g2gl_subject_time`.

This is the manifest/runtime parity gap PR-3R listed as never audited, now
showing up for real. It slipped through because PR-03's cross-test checked
`<prop>` setters (and PR-3R added `draw=`), but **never checked `<bind>`
setters**. PR-04 would hit it the first time it generated a clock binding.

**Sent back to the PA** with two options: implement `bind_time` on the clock
against the time subject and fix the manifest type, or refuse the binding with
`U8G2GL_NOT_YET_SUPPORTED`. **Either way, the cross-test must now check `<bind>`
setters**, so no manifest binding can name a method that doesn't exist again.

### Housekeeping

Removed a stale PR-02 scratch worktree. The PA is not working in this checkout —
the tree was clean with no `pr-04` workspace — so Tier-1 documents were committed
straight to `main` after checking that `origin/main` hadn't moved.

---

## Session — 2026-09-13 (cont.) · Ruling on F3: `extends` must name a manifest

PR-04's PA reported that §6.5's example uses `extends="u8g2gl_widget"`, but no
manifest or class by that name exists. Now that the generator resolves `extends`,
the example fails validation. The PA put it to the Chief Architect: either change
the example, or allow `extends` to name something that isn't a manifest.

**Ruling: change the example. `extends` must name a manifest.** No new decision
number, because this clarifies `[D-17]` and §13.1 rather than adding a decision.

**Evidence, checked before ruling.** All seven class-backed built-in manifests
extend `u8g2gl_obj`, and `u8g2gl_obj` has a manifest declaring the inherited
properties with their setters — `x`, `y`, `width`, `height`, `hidden`, `font`,
and so on. §13.1, the contract, already uses `extends="u8g2gl_obj"` in its own
example, so §6.5 was the odd one out. `u8g2gl_widget` is a stale name for the
base class. It appeared exactly twice, in the §6.5 example and the §19 naming
table, and both now say `u8g2gl_obj`.

**Why `extends` can't name something without a manifest.** The parent manifest
is where inherited properties are declared. Without it the generator can't emit
setters for `x` or `hidden` on a custom element, and the editor's property panel
has nothing to show. Allowing it would move knowledge about elements back outside
the manifests — the very thing PR-3R spent two work orders removing
(`TIER1_PRIMITIVES`, the image-tag literals), and now a non-negotiable in the
standards skill. Anyone who needs to extend a class that has no manifest can
write one; an `<api>` with no new props is enough.

§6.5 now states the rule explicitly, so the example can't drift back.

**Process note.** The PA had moved into the main checkout, on
`u8g2gl-generator/wo2-manifest-parity`, since the previous round, when the tree
was free. Tier-1 edits therefore went through a worktree on `main`, and the PA's
tree was not touched. Rule 04 again: check who holds the tree every time — last
round's answer doesn't carry over.

---

## Session — 2026-09-14 · PR-04 rulings after WO4

PR-04's PA brought four decisions and four spec findings after WO4. All four
decisions were approved as the PA recommended. That grows the PR-04 ledger from
12 work orders to 14; the owner saw this before approving.

### Rulings

**1. WO4b, clipping correctness — approved.** [D-18] made composites real
containers so that clipping would mean something, and WO4 found three reasons it
can't be trusted yet. F4 (the state saver doesn't save the clip window, though
its header says it does) and F6 (a scrolling label resets the clip and draws
outside its container) are ordinary defects and can be fixed now.

**F1** (whether U8G2 excludes the clip window's far corner) **can't be settled
from source on this machine.** There's no U8G2 checkout here, and the catalogue
builder takes `--u8g2-path` without recording it (see Q-11). So instead of
guessing: put the convention in exactly one function, write it down there as an
*unverified* assumption, pin it with a test, and require PR-06's real-U8G2 Wasm
build to include a pixel test at a container's edge. That test would show the
one-pixel difference directly, so the question gets a verified answer rather than
an assumed one, and WO4b isn't blocked.

**2. Pre-1.0 version guard — approved.** It compares the minor version too while
the major is 0, because that's where pre-1.0 breaking changes land. §16 and
`rules/03-versioning.md` now say so; before, both said "major" only.

**3. `setter=` naming a prop on `<bind>` — kept for PR-04, recorded as Q-9.**
It's a third meaning of `setter=`, and §13.1 had said [D-18] fixed the double
meaning. New manifest vocabulary still needs a demonstrated need, so the fix
waits for the next schema bump, where `prop=` is the obvious candidate.

**4. WO5 split into WO5a (findings) and WO5b (the `generate` command) —
approved.** One diff carrying the whole command plus seven carried findings
couldn't be reviewed properly.

### Spec findings, fixed on main

- **F2** — §16 said the runtime and CLI were "versioned in lockstep", which
  contradicted `rules/03-versioning.md`. Now: versioned independently.
- **F7** — §13.12's example called `render()` directly instead of the
  `u8g2gl_render_object()` wrapper, which handles visibility, clipping and the
  saved state. Example corrected.
- **W6** — §6.3 listed `bind_src` and `bind_glyph`, which nothing declared or
  implemented. Removed, and recorded as Q-12 in case a real need appears.
- **W2** — every element inherits `font`, `align` and text binding from the base
  object. That's a real design question rather than a typo, so it's Q-10, to
  settle before E-2 builds the property panel on top of it.

### Chief Architect finding — Q-11

Checking where F1 could be verified showed that **the display catalogue doesn't
record where it came from.** [D-14] derives it from U8G2's own tables, but
nothing in `catalogue.json` says which U8G2 version, and the builder takes a path
without recording it. It can be neither reproduced nor diffed against a U8G2
upgrade. Not urgent; it should be fixed at the next rebuild.

### Pattern

The PA was in the main checkout again, this time on
`u8g2gl-generator/wo4-runtime-support`. The edits went through a worktree on
`main`.

---

## Session — 2026-09-14 (cont.) · PR-04 rulings: WO4c, WO7b, and real U8G2 found

PR-04's PA asked for two more work orders, WO4c and WO7b. Both approved, taking
the ledger from 14 to 16. The owner saw this before approving.

### Real U8G2 source was on this machine all along

The last round deferred F1 to PR-06 because "there is no U8G2 checkout". That was
wrong. **U8G2 2.36.18 is at
`esp32-app-foundation/sample-app/.pio/libdeps/esp32dev_all_on/U8g2/`**, a sibling
project's PlatformIO cache. I found it by looking in the sibling projects that
build real firmware, instead of repeating the previous round's answer. Nothing
was downloaded.

**F1 — settled from source, no longer deferred.** `clib/u8g2.h:352` documents
`clip_x1` as the *"right corner of the clip window (excluded)"*, and `:354`
documents `clip_y1` the same way. `u8g2_clip_intersection2` agrees: from `a`
(included) to `b` (excluded). **The far corner is exclusive**, so the runtime
must call `setClipWindow(x, y, x+w, y+h)`, not `x+w-1`. PR-06's container-edge
pixel test changes from *discovering* this to *guarding* it.

**WO4c — verified before approving.** Real `U8g2lib.h` has no `getFont()`, only
`getFontAscent`/`getFontDescent`. It does have `getU8g2()` returning `u8g2_t*`,
and `u8g2_t` has `const uint8_t *font` (`u8g2.h:359`). The PA's fix is correct.

### Stub audit — names fine, types wrong

Every U8G2 method the PA branch's test stub declares (38 of them) was checked
against real 2.36.18. **Only `getFont` doesn't exist.** So the stub hasn't
invented an API; WO4c's fix covers that.

**But a check on names can't see types, and the types disagree.** The stub takes
`int` coordinates; real U8G2 takes `u8g2_uint_t`, which is `uint16_t` because
`U8G2_16BIT` is on by default (`u8g2.h:71`). On hardware a negative coordinate
becomes a huge unsigned value — `-5` turns into `65531` — so an element meant to
sit partly off the left edge lands off the right edge instead. That's exactly
what a scrolling label or an offset container child does. **Every "degenerate
input doesn't crash" test runs against the `int` stub**, so none of them can
catch it. WO3's draw functions already guard negative *sizes*; nothing guards
negative *origins* on their way into U8G2.

Added to WO4c: make the stub's coordinate types match real U8G2, so the compiler
forces each conversion to be written out, and clamp the clip window's near
corner at 0.

### Rulings

**1. WO4c — approved, scope extended.** Read the font via `getU8g2()->font` and
drop `getFont()` from the stub, as the PA proposed. Add the far-corner clamp.
Also, as above: type the stub's coordinates as `u8g2_uint_t`/`uint16_t`, handle
negative origins explicitly, and use the exclusive clip corner.

**2. WO7b — approved.** Each of its six gaps silently turns bad geometry into
some value when it should raise a diagnostic, and the generator can't safely
accept a missing coordinate. The contract it enforces is now normative in §7.2:
- anchors only on elements whose manifest declares `x`, `y`, `width`, `height`
- every element fully positioned, never a silent zero
- `hcenter`/`vcenter` are strict booleans
- built-in constant names are reserved
- constants are validated where they're declared
- bounds are checked for the target being generated

**3. §13.2 — fixed.** Coordinates are `int16_t`, matching `u8g2gl_obj`'s
storage. Other `int` properties stay `int32_t`, because
`set_time(uint32_t epoch_seconds)` needs the width. "Does it fit `int16_t`?" and
"is it inside its container?" are separate checks.

**4. The PA's interim anchor rule is now the permanent rule**, written into §7.2.
It reads the manifest rather than a list of element names ([D-17]), which is why
it could be made permanent. Anchors on non-rectangular primitives are deferred
until a real screen needs them (§1.5).

### Decided by the owner — U8G2 becomes a pinned dependency

The copy that settled F1 is a build cache in another project: not reproducible,
not in CI, and gone after `pio run --target clean`. The runtime has never been
compiled against real U8G2 headers in this repo, only against the stub. The
owner's decision, verbatim:

> "we should simply download it into this repo and intall it as a lib in any ap
> that uses our library and designer."

— pointing at `esp32-app-foundation/modules/LVGLDisplay` as the model.

**What that precedent actually does.** `LVGLDisplay` doesn't vendor LVGL. Its
`library.json` declares `"lvgl/lvgl": "^9.5.0"`, the app's `platformio.ini`
lists the same in `lib_deps`, and foundation's `THIRD-PARTY-NOTICES.md` has a
row for it. PlatformIO fetches it at build time, pinned by version.

**Two consumers, two mechanisms:**

- **This repo** needs U8G2's source itself: for a compile check against real
  headers, for PR-06's Wasm build, and for the catalogue builder. Mechanism: a
  **git submodule pinned to tag 2.36.18** (e.g. `extern/u8g2`). That downloads
  it into the repo without committing U8G2 into U8G2GL's history — 48 MB, 42 MB
  of it in `clib`, carried by every clone for good. The repo already uses
  submodules, and U8G2 ships its own `CMakeLists.txt`. **Confirmed by the
  owner, 2026-09-14:** "submodule approach is fine with pinned like the other
  example I gave you is fine" — the other example being `LVGLDisplay`'s pinned
  `library.json` dependency. Pinned to 2.36.18.
- **Apps using the library or the designer** get U8G2 the `LVGLDisplay` way: a
  pinned dependency in the integration module's `library.json`
  (`olikraus/U8g2`, `^2.36.18`) plus a notices row. That's PR-05.

**Why 2.36.18:** `esp32-app-foundation` already builds it, and PR-05 integrates
there. Using one U8G2 version in both repos rules out bugs that only exist
because tests and firmware used different versions.

**Licence:** U8G2's code is BSD-2-Clause; its fonts carry per-group licences
(U8G2 wiki, `fntgrp`). U8G2GL has no `THIRD-PARTY-NOTICES.md` yet and needs one,
with a U8G2 row covering both. That's consistent with the earlier decision to
follow U8G2's licensing.

**Routing:**
- **PR-04 / WO4c** — add the pinned submodule, a host CMake target that compiles
  the runtime against real U8G2 headers, and the notices file. That compile check
  *is* WO4c's acceptance criterion — "the runtime compiles against real U8G2" —
  and it would have caught both `getFont` and the `int`/`u8g2_uint_t` mismatch
  automatically.
- **PR-05** — the integration module declares `olikraus/U8g2@^2.36.18`, and
  foundation's notices file gets a row.
- **PR-06** — the Wasm build compiles U8G2's C source from the submodule.
- **Q-11** — the catalogue builder uses the submodule by default and records its
  commit, which closes Q-11.

**Lesson.** Last round I said "no U8G2 checkout on this machine" after searching
only the obvious paths, and deferred a question that was answerable. The
sibling projects that build real firmware were the obvious place to look. When
something turns out to be missing, check the places that actually depend on it
before concluding it's absent.

---

## Session — 2026-09-18 · Prior-art review: UiUiUi

The owner asked how U8G2GL compares with
[UiUiUi](https://github.com/dirkhillbrecht/UiUiUi), then asked for the designs to
be updated with the lessons. The owner also confirmed the Chief Architect edits
the specification directly: *"You own the specification, so you can update those
files directly."* The previous standing rule, "always hand off to a PA", still
applies to implementation and record-keeping inside a PR.

### Finding

UiUiUi is the closest prior art to U8G2GL's **runtime**: static allocation,
U8G2 only, monochrome widgets. So the runtime isn't what makes U8G2GL different;
the toolchain is, and above all the editor. **concept.md §2.2 had already
reached the adoption conclusion** ("structure alone is not what people want —
visual tooling is"). The review adds evidence — 39 stars, no commits since
October 2023 — and four technical lessons.

### Edits

- **concept.md** — §2.2 dormancy evidence; §4.2 table row updated; a "What
  UiUiUi teaches" paragraph with the four lessons.
- **design_spec [D-4]** — a *candidate refinement* note, with the decision
  unchanged. Redraw stays full-frame; only sending the dirty tiles is open. The
  dirty region must include each object's **previous** bounds, because a moved
  or hidden element changes pixels where it used to be. The ~25 ms I²C figure is
  labelled an estimate.
- **design_spec §7.2** — prior art for the `<row>`/`<col>` deferral: UiUiUi built
  the runtime preferred-size layout [D-7] rejects, and its author calls it
  "clumsy".
- **design_spec §21** — **Q-14** (send only dirty tiles; measure on I²C and SPI)
  and **Q-15** (a one-of-N "cards" element; deferred to E-3).
- **ui_spec §7.3** — a pointer to Q-15, so E-3's navigation design finds it.

### Correction made while editing

The first draft of Q-15 called cards "relevant to … modal navigation". ui_spec
§7.3 excludes modals specifically because they need overlay rendering and z-order
beyond document order ([D-4]). A cards element needs neither: it shows one child,
in document order. The wording was loose enough to read as a back door to modals,
so Q-15 now says plainly that cards is not a modal, and ui_spec §7.3 says the
same.

### Coordination

**Q-13 is reserved** for PR-04's `$prop` interpolation question (ruling 5 of
2026-09-16), which PR-04's PA is adding on its branch. When it rebases onto this
commit, Q-13 belongs after Q-12 and before Q-14.

### Chief Architect note

UiUiUi overlaps U8G2GL in exactly the runtime, and the runtime is what PR-07's
gate measures. That strengthens **CA-2**: a GO would show U8G2GL can do what
UiUiUi already does, and say nothing about the editor that differentiates it.

These edits were made directly on `main`, through a worktree. PR-04's PA was on
`u8g2gl-generator/wo11-editor-target`, and its tree was not touched.

---

## Session — 2026-09-19 · Rulings on CA-BRIDGE-2026-09-18 (PR-04, first emitted code)

PR-04's PA reached WO11 with 12 of 18 work orders complete, and the generator
emitting C++ that compiles and runs. WO8a, WO9 and WO10 were the first work
orders to emit real code. They raised six questions, each with concrete evidence.
The owner asked for the spec to be updated and landed on `main`; the Chief
Architect made every spec edit directly.

### Rulings

1. **Bound positions are container-relative**, like literal ones. The reason
   goes beyond consistency: **an attribute's meaning is permanent; its
   implementation isn't.** Absolute would have made children-follow-parent a
   breaking change later. **A container whose own position is bound may have no
   children in 0.4**. The PA's wording was "no positioned children", but §7.2
   requires every element to be positioned, so that means none at all. This rules
   out sliding panels and carousels, which is the honest cost of having no
   reflow. The way to lift it later is Q-16: accumulate ancestor origins in the
   ancestor walk the runtime already does every frame. That's translation, not
   layout. Amendment added to the [D-20] record.
   *Checked in code:* the binding descriptor has no offset field. That makes this
   free for draw-call primitives (the offset is a build-time literal in the draw
   arguments) and costs a little for object-backed elements. Mechanism is the
   PA's call.
2. **Every emitted object is `ui_obj_<name>`.** The PA was right that a prefix
   beats a reserved list: C library names depend on the platform's headers, and
   `clock` has already collided with `<time.h>`. **The CA corrected its own first
   ruling** (`ui_<screen>_<name>`) before handing it over. A screen called
   `subject`, `font`, `image`, `style` or `screen` would have collided with the
   other generated families. And the screen adds no uniqueness, because objects
   are `static` in their own screen's translation unit. A fixed family can't
   collide.
3. **An element's own attributes win over named styles, including styles applied
   later.** For PR-04, applying styles before properties is enough.
   *Checked in code:* nothing re-applies a style after init yet, and
   `apply_style()` merges with `merge_from`, so whichever is applied last wins.
   **Obligation on PR-09:** `focus_style` re-applies styles at run time, and as
   things stand it would overwrite an element's own `font` every time the element
   takes focus. PR-09 needs to track which properties each element set itself.
4. §13.7 now lists `ui_styles.cpp` and `ui.cpp`. `ui.cpp` holds the frame-dirty
   observers, which are one per subject, not per screen.
5. §13.5 uses `.get()`; the example as written wouldn't compile.
6. **Non-rectangular elements are bounds-checked by what they actually draw** —
   *not* the full bounding box the PA recommended. A quarter-circle corner at the
   display edge has a full box that hangs off-screen, even though every pixel it
   draws is on it. A false error that blocks a valid design costs more than the
   conservatism saves.

### Spec defect found while editing

§10's styling table still listed `truncate`, which [D-19] deleted in favour of
`long_mode`. PR-3R removed it from the code; the spec hadn't followed. Removed now.

### Beyond the Chief Architect's remit — flagged to the owner

**WO10b — "a label bound to a subject never draws its text" — breaks the Phase 1
exit criterion itself.** The departures-board status bar shows a *bound* station
name. The owner decides, but the CA recommends fixing it before PR-04 is
submitted, not treating it as an optional work order.

### Coordination

The `wd_` sentence in §13.4's rules was left untouched on `main`. The PA is
removing `wd_` on its own branch under the 2026-09-16 ruling, and editing the
same sentence here would have caused a merge conflict. The `ui_obj_` rule went in
as a separate paragraph.

The edits were made through a worktree on `main`. PR-04's PA was on
`u8g2gl-generator/wo11-editor-target`, and its tree was not touched.
