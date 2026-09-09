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
`[D-17]`.

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

**Still open:** `[Q-1]` multi-target layout overrides (needs two real targets);
`[Q-2]` `bdfconv` packaging (work, not risk — Wasm recommended); `[Q-4]` measured
runtime budget on `esp32dev`; `[Q-5]` frame-loop ownership; `[U-1]` element
identity **(gates PR-02)**; `[U-3]` multi-target canvas; `[U-6]` where sample data
lives **(gates PR-02)**; `[U-7]` palette taxonomy.

---

## 4. Programme state

**PR-01 — runtime core. MERGED** (`#1`). Object model, subjects, styles, frame
gate. 80 tests, zero warnings. Seven work orders including two review remediations:
WO6 fixed four memory-sizing defects (one a spec violation — string subjects
ignored their declared `max_len`, making the §18 budget untrue); WO7 fixed
documentation, which was absent entirely.

**PR-02 — CLI, schema, validator, display catalogue. IN PROGRESS.** Six WOs
committed on `u8g2gl-cli/wo1-skeleton` … `wo6-cli-integration`: skeleton, schema
0.3 document model, XML parser with source locations, U8G2 display catalogue and
query engine, validator with §15 diagnostics, CLI integration.

**Next after PR-02:** PR-03 widgets, PR-04 generator, PR-05 foundation integration
module, PR-06 Wasm preview, then **PR-07 — the GO/NO-GO gate**. Full ledger in
plan §5.

**⚠ PR-02 must not freeze schema 0.3 without `ui_spec.md` §15's nine schema
requirements.** That is risk R-8 and the reason ui_spec exists now rather than
later. `<previews>`, formalised `help`, property grouping, palette metadata,
editor-target generation hooks, sample data, element identity, round-trip
fidelity, and editor view state as a **sidecar** file — not in the project XML,
or every pan and zoom becomes a source-control diff.

---

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

**Working tree is on `u8g2gl-cli/wo6-cli-integration`** with uncommitted PR-02
workspace files (`MEMORY.md` modified, `pr-02-cli-schema/PROJECT.md` and
`wo1-skeleton/` untracked) belonging to the PR-02 PA session. **Do not commit or
stash those** without asking — they are another session's in-flight work.

Documentation work belongs on `main`; use a worktree rather than switching this
tree.

**Open items needing the owner:**
- `[U-1]` and `[U-6]` gate PR-02's schema freeze and have no good default.
- Whether PR-02's PA has ui_spec §15's nine schema requirements in scope — if not,
  schema 0.3 ships without editor support and 0.4 becomes a breaking change.

**The governing principle when in doubt** (design_spec §1.5): omission is the
default; a feature earns inclusion by *demonstrated* rather than anticipated need;
**schema surface is the expensive kind of complexity** because it is permanent
once authors write XML against it, whereas generator complexity is cheap. A
typical screen should be 15 lines of XML.
