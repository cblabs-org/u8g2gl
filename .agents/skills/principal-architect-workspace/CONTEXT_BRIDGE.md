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
canvas; `[U-6]` where sample data lives **(gates editor track E-3, not PR-04 — PR-04 builds no sample-data hooks; corrected 2026-09-13)**;
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

**PR-3R — remediation. MERGED (`#4`), 2026-09-13.** Twelve work orders (eight
planned, four added during execution) realigned the merged runtime, CLI and
widgets to `[D-18]`–`[D-21]`. Final: C++ 240 tests, CLI 266, zero warnings,
schema **0.4**, CLI **0.6.0**. Full wrap-up in `pr-3r-remediation/PROJECT.md` —
read it before briefing PR-04's PA; its lesson is that three of four real defects
were found by unifying duplicated logic.

**Role note.** PR-3R was executed with the Chief Architect acting as its PA, at
the owner's request, later withdrawn: it spent Tier-1 context on Tier-2 detail.
From PR-04 on, the Chief Architect hands each PR to a PA by bridge prompt and
ingests the result from `PROJECT.md` — no work-order verification at Tier 1. Assessment in
`REMEDIATION-D18.md`, decomposition in `pr-3r-remediation/PROJECT.md`.

Three things found while assessing it, all verified against the code:
`set_hidden()`/`set_disabled()` fail to mark the frame dirty **today**, not
latently; `TIER1_PRIMITIVES` has drifted so `<u8g2gl_frame>` validates cleanly
with no manifest behind it; and `MAX_BINDINGS_PER_OBJ = 4` is exceeded by
`[D-20]`'s four geometry bindings alone, with no validation and a silent runtime
failure — which is why `[D-21]` exists.

**⚠ The editor had no PR until 2026-09-13.** design_spec §20 Phase 3 makes the
editor the programme's destination, but the PR ledger's Phase 3 was consolidation
work only. An editor track is now in both ledgers — **E-D, then E-1 to E-3** —
and `CA-1` and `CA-2` settled its shape and the gate's scope on 2026-10-05
(see §7). **Don't let a refresh of either ledger quietly drop the track again**:
that is how it vanished the first time, and it is still the programme's purpose.

**Next:** see §7, which is the current one. In outline: PR-4R2, PR-05 foundation
integration, PR-06 Wasm preview, then **PR-07 — the GO/NO-GO gate**, and the
editor track only on a GO. Ledger in plan §5.

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

**Revised 2026-10-06 (second revision, after #10).**

### Where the programme is

Merged: **#1** PR-01 runtime core · **#2** PR-02 CLI/schema/validator · **#3**
PR-03 widgets + `[U-1]` · **#4** PR-3R remediation to `[D-18]`–`[D-21]` · **#5**
PR-04 the generator · **#6**+**#7** PR-4R corrections · **#8** PR-04b the font
and image pipeline · **#9** PR-4R2 (bound children clipped, `<bind>` aliasing
refused, the radius bound checked however configured) · **#10** PR-4R3 (the
runtime version floor, `extends` restricted to elements with a class).

Baselines at `main` @ `15296b4`: **C++ 401** tests (one known skip,
`SizeOfReport.ThirtyTwoBitTarget`), **CLI 1338**, zero warnings. Schema **0.4**,
CLI **0.11.0**, runtime **0.7.0**, scene format **3**. U8G2 pinned at
**2.36.18** (`d66b49af`) in `extern/u8g2`. **Take these from a merged `main`,
never from a report** — a PA's figures are correct when written and stale by the
time they are read.

**Next: PR-05** — foundation integration and the first real board. It is the
first PR in `esp32-app-foundation` rather than this repository, which is a
different shape of work: a different repo, a different licence (Apache-2.0), and
PlatformIO rather than npm. Then PR-06, then the **PR-07 gate**. The editor
track (E-D, then E-1..E-3) begins only on a GO — owner decision CA-1,
2026-10-05.

PR-05's font risk is effectively nil: all twelve of departures-board-v3's font
arrays are byte-identical to generator output, so its font work is renaming to
lowercase `<bdf>` names and using `ui_font_<name>`.

### Your role, and the correction that shaped it

You are the **Chief Architect (Tier 1)**. You do not write production code and
you do not run work orders. You hand each PR to a Principal Architect by bridge
prompt, rule on what they bring back, and maintain the records.

**Two owner corrections are load-bearing:**
- *"you don't do anything — always hand off to a PA"* — implementation and
  in-PR record-keeping go to the PA, always.
- *"You own the specification, so you can update those files directly"* — the
  spec, `concept.md`, `ui_spec.md`, the decision records, `PROGRAM.md`,
  `PROGRAM-PLAN.md` and the standards skill are **yours to edit directly**.

Earlier in the programme the Chief Architect ran PR-3R as its own PA. It worked,
and it spent Tier-1 context on `nm` output and boundary-box diffs. Don't repeat
it.

### Outstanding — Chief Architect's own

**All of PR-04b's spec debt is landed (2026-10-05).** §14.1 (Q-2's answer, the
`range` grammar, absent-means-unfiltered), §14.2 (`<convert>` fully specified),
§18's real budget lines, §21's Q-2 closure, §22 / §22.1, `implementation_plan.md`,
and §4.1 of the standards' `documentation.md` — the comment-citation rule with
its "pre-existing citations are not defects" half.

**One item remains, and it is desk work rather than a PR:** confirm that every
piece of state the designer needs has a home in the XML or an agreed sidecar.
That is the only schema-shaped risk left in the editor, and schema is the
expensive thing to reverse (§1.5). Everything else about round-trip is a parser
contract under `[UD-3]`, so it waits for E-1.

### Owner decisions — both closed 2026-10-05

- **CA-1 — the editor track.** Runs **after the PR-07 gate**. Browser-hosted
  with no server, which is `[UD-2]`'s static mode already specified; served mode
  deferred, so the designer is Chromium-only for now. **E-D** added ahead of E-1
  (interaction design and decomposition, no code), because E-1 bundles a
  filesystem layer, a CST serializer and an application shell. Generating C++
  runs in the browser; building firmware stays in PlatformIO.
- **CA-2 — the gate.** Four criteria stand, firmware-side. A fifth editor
  criterion was recommended and declined. The unmeasured differentiator is
  written up at `implementation_plan.md` §6 — **do not reopen it**; whoever runs
  the gate judges criteria 2 and 4 as written.

Full reasoning for both: `PROGRAM.md`, 2026-10-05.

### Carried into PR-05 and PR-06

PR-4R3 (#10) cleared the three holes that would otherwise have surfaced inside
PR-05. What remains:

**PR-05 must ship runtime 0.7.0 alongside the CLI.** Every project regenerated
with CLI 0.11.0 emits `U8G2GL_REQUIRE_RUNTIME_VERSION(0, 7)`, so an older
runtime is now refused by name — including for departures-board-v3. This is
intended; 0.7 is the first runtime that can answer the question at all.

**Two validator refusals are new to anyone migrating existing widgets:** a
custom element may no longer `extends` a drawing element, nor rebind an
inherited setter under another name. Both now fail at `validate` with a remedy
rather than at compile time, which is a better failure but an unfamiliar one.

**PR-06 owes one thing from PR-4R2:** link `u8g2gl_u8g2_csrc_arduino`, not
`u8g2gl_u8g2_csrc`. Under `ARDUINO`, `u8x8.h` adds `pins[]` to `u8x8_t`; the
mismatch is two struct layouts and a crash.

**Q-17 is open** (§21): manifest diagnostics locate at the `<widget>` element
rather than the attribute at fault, which §15.1 does not allow. It needs the
parser to record attribute locations. Trigger: the next PR touching the manifest
parser, or E-1.

### Setting up a fresh PA worktree — three things that have cost time

- **The U8G2 submodule is not initialised automatically.** Before configuring:
  `git submodule update --init --reference ../U8G2GL/extern/u8g2 extern/u8g2`
- **`cli/test/.../generate.test.ts` pins the CLI version literally**, so every
  version bump breaks it. It should read `package.json`; until it does, expect
  it and fix it in the same commit as the bump.
- **`refresh-goldens.mjs` reads `dist/`**, so a rebuild must come first or it
  regenerates goldens from stale output — which looks like success.

### Working trees — check every time

Three checkouts exist:

| Path | Branch | Note |
|---|---|---|
| `U8G2GL` | `u8g2gl-generator/wo13-readability` | the main checkout, sitting on a **merged, stale** branch |
| `U8G2GL-04b` | `u8g2gl-fonts/wo6-readability` | PR-04b's PA |
| `U8G2GL-4r` | `u8g2gl-4r/wo5-readability` | PR-4R's PA |

**Always work in a fresh worktree on `main`**, never in a PA's checkout:
`git worktree add --detach <scratch>/x origin/main && git -C <scratch>/x checkout -B main origin/main`.
Verify `git branch --show-current` as **its own command** immediately before every
commit, and confirm with `git log --oneline origin/main -1` after pushing — a
successful `git push origin main` proves nothing about where your commits landed.

### Things learned that are not in the plan or the work orders

- **Measure U8G2; do not reason about it.** Three times a plausible derivation
  was refuted by a short measurement, twice against the Chief Architect. The
  radius bound is the sharp case: `r ≤ min(w,h) − 1` was derived from one
  arithmetic line while another wrapped first, and it accepted 30 of 68 radii
  that draw outside the box. Reasoning about a C function means reading *every*
  operation in it.
- **Unifying duplicated logic is where defects hide.** Three of PR-3R's four
  real defects surfaced that way, and PR-4R found another. PR-4R2 found both of
  its real problems in the same place — object vs draw call, attribute vs
  style, widget vs composite manifest.
- **A rule whose only outcome is an error is probably unbuildable.** §13.5's
  "a bound container child gets an object" could never succeed: a drawing
  element has no class to instantiate, so every path through the condition
  ended in a refusal. When writing a normative rule, say what its *success*
  looks like; if there isn't one, the rule is a ban wearing a requirement's
  clothes.
- **A PA that pushes back on the spec is usually worth listening to**, and
  PR-4R2 did it twice. Both times the owner ruled before work started, quoted
  verbatim in `PROJECT.md`. That is the shape to insist on — not "the PA
  disagreed and proceeded", but a recorded decision ahead of the work.
- **Verify a PA's claim when it becomes permanent.** Reports have been accurate,
  but a claim that turns into spec wording (the 2039 font names, the 522 with
  capitals, zero case-folding collisions) is worth ten minutes against the
  source.
- **Edit with asserted anchors.** Every spec edit in this programme has been an
  exact-match replace that aborts if the anchor moved. It has caught real drift.
- **Shell gotchas that have bitten:** zsh eats `:t` and `:c` in `$REF:path`
  (brace it, `${REF}:path`), and `git grep` wants `-A` *before* the ref.
- **Decision records are history.** Amend them with a dated note; never rewrite
  the original text.

### The governing principle when in doubt

design_spec §1.5: omission is the default; a feature earns inclusion by
*demonstrated* rather than anticipated need; **schema surface is the expensive
kind of complexity**, because it is permanent once authors write XML against it,
whereas generator complexity is cheap. A typical screen should be 15 lines of
XML.
