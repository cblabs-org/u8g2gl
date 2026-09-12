# Context Bridge — U8G2GL

**Written for reload after a context compaction.** Read this first; it tells you
what exists, what is decided, where the authority lives, and what to do next.

**Date:** 2026-09-09
**Role in this programme:** Chief Architect (Tier 1). You do not write production
code — you plan, decompose, delegate to Principal Architects, review what returns,
and maintain the decision record. Documentation and specs *are* yours.

---

## 1. What this project is, in one paragraph

U8G2GL is a build-time XML-to-C++ UI framework for monochrome U8G2 displays —
128×64 OLEDs, 256×64 dot-matrix panels. **Its purpose is to make a visual designer
possible for those displays.** The schema, generator, runtime and Wasm preview are
infrastructure serving that end. XML earns its place because an editor needs a
document it can *read back*; generated C++ is write-only in practice. AI-assisted
authoring is a beneficiary of a good schema, not the reason for one.

MIT licensed. Repo: `github.com/cblabs-org/u8g2gl` (private).

---

## 2. Read these, in this order

| Document | What it is | Authority over |
|---|---|---|
| [`docs/design_spec.md`](../../../docs/design_spec.md) | v0.3. 17 numbered `[D-n]` decisions, `[Q-n]` open questions | **What to build.** Framework behaviour |
| [`docs/ui_spec.md`](../../../docs/ui_spec.md) | v1.1. 7 `[UD-n]` decisions, 4 `[U-n]` open | **The designer.** Editor behaviour |
| [`docs/implementation_plan.md`](../../../docs/implementation_plan.md) | v1.7. `[A-n]` architecture stance, `[PD-n]` programme decisions, PR ledger, risks | **Where and in what order** |
| [`docs/concept.md`](../../../docs/concept.md) | Why the project exists, honest market read, stop conditions | Positioning |
| [`PROGRAM.md`](PROGRAM.md) | Programme state and session log | Current status |
| `docs/research/` | **Frozen** point-in-time inputs. Where they conflict with the spec, the spec wins | Nothing — historical |

**Precedence:** design_spec wins on framework behaviour; ui_spec wins on editor
behaviour; implementation_plan wins on sequencing. Never resolve a conflict by
picking the newest — pick by authority.

---

## 3. Decision registers — the load-bearing ones

Full rationale is in the documents. This is the index, so you know what exists and
do not re-litigate a settled call.

**`[D-n]` framework decisions** (design_spec §3): C++ not C `[D-3]`; full-frame
redraw with a frame-level gate `[D-4]`; `renderAnimationUpdate` is an escape
hatch, not a lifecycle phase `[D-5]`; no "fractal" sub-element composition `[D-6]`;
layout resolved at build time `[D-7]`; collections are **not** subjects `[D-8]`;
Wasm preview not a JS reimplementation `[D-9]`; TypeScript CLI on npm `[D-10]`;
`generated/` is committed `[D-11]`; `u8g2gl_` XML prefix `[D-12]`; flat symbol
prefixes, no namespaces `[D-13]`; display catalogue generated from U8G2's own
tables `[D-14]`; `ui_handler()` returns ms-until-next-work `[D-15]`; `--json` on
every command `[D-16]`; build-time `<api>` manifests, no runtime property table
`[D-17]`; **one element vocabulary, tiers collapsed `[D-18]`; `long_mode` on the
label `[D-19]`; bindable geometry, no runtime layout `[D-20]`; generated
capacities `[D-21]`**. The last four were taken 2026-09-11/12 and **invalidate
parts of merged PR-01/02/03** — see PR-3R below. Full records under
`docs/decisions/`.

**`[A-n]` architecture stance** (plan §1): heritage rejected — `modules/U8G2Display`
is an integration reference, not a basis `[A-1]`; parallel LVGL 9's *decomposition*
but not its *mechanisms* `[A-2]`; flat object array with parent index, not a tree
`[A-3]`; the generator↔runtime contract is design_spec §13 `[A-4]`.

**`[PD-n]` programme decisions** — all four closed: MIT `[PD-1]`; U8G2GL repo ships
runtime **and** CLI, foundation gets an Apache-2.0 integration module `[PD-2]`;
virtual base ~48 B with flat parent-index hierarchy `[PD-3]`; strangler-fig
migration with a dated freeze policy `[PD-4]`.

**`[UD-n]` editor decisions** — all seven closed. See the summary table at the top
of `ui_spec.md`.

**Closed since:** `[U-1]` element identity — ui_spec §16.1, settled in PR-03.

**Still open:** `[Q-1]` multi-target layout overrides (needs two real targets);
`[Q-2]` `bdfconv` packaging (work, not risk — Wasm recommended); `[Q-4]` measured
runtime budget on `esp32dev`; `[Q-5]` frame-loop ownership; `[U-3]` multi-target
canvas; `[U-6]` where sample data lives **(gates PR-04's sample-data hooks)**;
`[U-7]` palette taxonomy.

---

## 4. Programme state

**PR-01 — runtime core. MERGED (`#1`).** Object model, subjects, styles, frame gate.
Seven work orders including two review remediations.

**PR-02 — CLI, schema, validator, display catalogue. MERGED (`#2`).** Six work orders.

**PR-03 — widget set + element identity. MERGED (`#3`), 2026-09-10.** Nine work
orders. Tier-1 primitives and eight Tier-2 widgets, 17 `<api>` manifests with a
manifest-to-validator cross-test, and `[U-1]` settled end to end. WO8 and WO9 were
architect-raised remediations after review — see §4.1, because the shape of that
review is the reusable part.

Final state: **C++ 166 tests, CLI 224 tests, zero warnings** under
`-Wall -Wextra -Wpedantic`. Widget sizes on a 64-bit host: `u8g2gl_obj` 48 B, widgets
56–72 B. **No 32-bit measurement exists** — the host is Apple silicon and cannot
produce one. `SizeOfReport.ThirtyTwoBitTarget` measures for real under ILP32 and
otherwise skips loudly, so §18 still cannot cite a target figure but the harness is
ready.

Versions after PR-03: schema **0.3** (unchanged), CLI/generator **0.5.0**.

**PR-3R — remediation. AWAITING APPROVAL.** Eight work orders realigning the
merged runtime, CLI and widgets to `[D-18]`–`[D-21]` and schema 0.4. **It blocks
PR-04**, which consumes the schema model and manifests directly. Assessment in
`REMEDIATION-D18.md`, decomposition in `pr-3r-remediation/PROJECT.md`.

Three things found while assessing it, all verified against the code:
`set_hidden()`/`set_disabled()` fail to mark the frame dirty **today**, not
latently; `TIER1_PRIMITIVES` has drifted so `<u8g2gl_frame>` validates cleanly
with no manifest behind it; and `MAX_BINDINGS_PER_OBJ = 4` is exceeded by
`[D-20]`'s four geometry bindings alone, with no validation and a silent runtime
failure — which is why `[D-21]` exists.

**Next:** PR-04 generator, PR-05 foundation integration, PR-06 Wasm preview, then
**PR-07 — the GO/NO-GO gate**. Ledger in plan §5.

### 4.1 What PR-03's review actually caught, and why it took two passes

WO6 implemented `[U-1]` as "require `name`, auto-generate on load with a warning".
Review found two defects a green build did not:

1. **The synthesised name collided.** The counter was per-parent; the uniqueness
   namespace was per-screen. Two unnamed labels in two containers both became
   `label_0` and failed to a hard `DUPLICATE_NAME` error — so the warn-and-continue
   path was unreachable for exactly the documents needing it. WO8 fixed it with a
   document-wide allocator seeded by a pre-pass over explicit names.

2. **The name was positional, so it was not an identity.** Insert an element and its
   later siblings renumber. **Generated code binds to the name**, so this silently
   rebinds a user's application code to a different widget. WO9 fixed it.

**The process lesson is in how the second one was mis-scoped.** I first deferred it as
"an editor concern — nothing consumes it yet". Wrong: the consumer is the *generator*,
which is PR-04, the very next PR. The owner caught it. **When deferring, name the
consumer and check when it actually arrives** — "nothing consumes this yet" is a claim
with a date on it, and the date is usually sooner than it feels.

I also prescribed the fix — "write the name back to the document" — without checking
it was buildable, and asserted it needed a round-trip serializer. It did not: source
locations were already recorded, so an attribute *insertion* was enough. **Check that
a prescribed fix is buildable before prescribing it**, and do not confuse "write to
the document" with "re-emit the document".

## 5. Infrastructure built this programme

**Skill `u8g2gl-standards`** (`.agents/skills/u8g2gl-standards/`) — the single
authority on coding standards, loaded by *both* coding agents and the reviewer so
author and reviewer cannot work from divergent rules. `SKILL.md` plus references
`documentation.md`, `cpp.md`, `typescript.md`. Naming differs **by language**:
C++ is `u8g2gl_obj`/`snake_case`/trailing `_`; TypeScript is ordinary
`PascalCase`/`camelCase`. Judging one by the other's table is the most common
false positive.

**Agent `readability-reviewer`** (`.agents/agents/readability-reviewer.md`) —
invokes the skill, audits against it, emits a **WORKORDER** (not a review essay) so
findings hand straight to a remediation worker. Read-only apart from its own
report.

**Rules** (`.agents/rules/`) — `00-operating-model` (tiered authorization),
`01-plan-before-execute` (the plan gate), `02-workspace`, `03-versioning` (four
independently versioned artefacts), `04-branch-hygiene`.

---

## 6. Process lessons — earned the hard way, do not relearn

1. **Verify the branch before every commit.** `git branch --show-current`.
   Misplaced commits happened **twice**; both followed a rebase or a parallel
   session moving HEAD. A `git push origin main` succeeds by pushing an unchanged
   `main` and tells you nothing. Rule `04-branch-hygiene` exists because of this.
2. **One working tree, one owner.** Use `git worktree` for parallel work. A PA
   session sharing the checkout silently redirected commits once.
3. **`SendMessage` is disabled here.** Never instruct a worker to ask for approval
   before committing — it will stop, cannot be answered, and its work strands
   uncommitted. Have workers commit on a green build and review the commit.
4. **Trace an objective to the API surface that delivers it** when writing a
   boundary box. A worker correctly surfaced a required change as "out of scope"
   because the WORKORDER named an objective but not the surface satisfying it, and
   the feature shipped unreachable.
5. **Measure, never assert, size and layout claims** — and state the target width.
   A reviewer's padding claim was false on the 64-bit host and true on the 32-bit
   target.
6. **Sync before submitting a stack** (`STACKING_REFERENCE` §4). Use
   `git rebase --update-refs` so intermediate WO branches move with the tip;
   without it, rebasing the tip orphans them.
7. **Workers fill templates mechanically.** WO7 produced *"Description:
   Implementation of u8g2gl_tree.cpp"* in all 15 files — a tautology that occupies
   the space where meaning belongs and looks superficially complete. Check output
   for substance, not presence.

---

## 7. Immediate state and what to do next

**Date of this revision: 2026-09-10.**

**The main working tree is on `u8g2gl-widgets/wo2-scroll-xbm-glyph` with a PR-03
worker actively mid-WO** — uncommitted `scrolling_label`, `xbm` and `glyph`
sources plus modified `CMakeLists.txt`. **Do not commit, stash, or switch branches
in that tree.** For your own documentation work use a worktree:

```bash
git worktree add /tmp/wt main    # then commit and push from there
git worktree remove /tmp/wt
```

**Nothing is blocked on the owner right now.** PR-03 is running. The next thing
that needs you is ingesting PR-03 when it completes.

**When PR-03 returns, review these three specifically:**

1. **WO6's element-identity decision.** The PA chose Option A (require `name`),
   the one breaking choice. Check the reasoning holds against round-trip fidelity
   ([UD-3]), the sidecar editor-state file, and §13.4's mangling and collision
   rules. If it does not, this is far cheaper to change before the generator
   exists than after.
2. **WO5's manifest→validator cross-test.** This is the seam between PR-02 and
   PR-03: manifests must satisfy the `PropDef` schema in
   `cli/src/core/schema/widget-manifest.ts`. If that test is missing or weak, a
   PR-04 integration failure has been deferred rather than prevented.
3. **Measured `sizeof` for every widget**, with the host width stated. Widget
   instances multiply across a screen. Do not accept asserted figures — build both
   sides and measure, which is how the PR-01 padding claim was found to be wrong
   on the host and right on the target.

**Still open, no owner decision needed yet:** `[Q-1]` multi-target layout
overrides (needs two real targets to test against), `[Q-2]` `bdfconv` packaging
(work, not risk — Wasm route recommended), `[Q-4]` measured budget at the PR-07
gate, `[U-3]` multi-target canvas, `[U-6]` where sample data lives, `[U-7]` palette
taxonomy.

**The governing principle when in doubt** (design_spec §1.5): omission is the
default; a feature earns inclusion by *demonstrated* rather than anticipated need;
**schema surface is the expensive kind of complexity** because it is permanent
once authors write XML against it, whereas generator complexity is cheap. A
typical screen should be 15 lines of XML.
