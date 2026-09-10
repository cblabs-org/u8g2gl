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

**PR-01 — runtime core. MERGED (#1).** `u8g2gl_obj`, four subject types, style
cascade, frame gate with `ui_handler()` deadline aggregation. 80 tests, zero
warnings. Seven WOs, of which two were review remediations: **WO6** fixed four
memory-sizing defects — one a spec violation, string subjects allocated a fixed
128 B and ignored their declared `max_len`, which made the §18 budget untrue —
and **WO7** fixed documentation, which was absent entirely.

Measured after remediation (64-bit host; 32-bit target ~25–40% smaller):
`u8g2gl_obj` 64→48 B, `u8g2gl_style` 40→24 B, `u8g2gl_observer` 24→16 B, scalar
subjects 400→80 B, string subject 528→120 B. A 15-object / 8-subject project
dropped ~2480 B → ~870 B static RAM. `Core.SizeOfReport` prints these every test
run so a regression is caught rather than discovered in a budget later.

**PR-02 — CLI, schema, validator, display catalogue. MERGED (#2).** Six WOs,
121 tests across 23 suites. Delivers: schema 0.3 document model, zero-dependency
XML parser with per-attribute source locations, display catalogue of 1637
full-buffer constructors, validator with seven passes, and `u8g2gl` commands with
`--json` throughout.

Verified independently at review rather than accepted from the report:
- **Isomorphic boundary holds and is ESLint-enforced** — `no-restricted-imports`
  on `src/core/**` blocks `node:*` and all builtins with an explanatory message.
  This was the constraint most likely to break invisibly; it now cannot regress
  silently. Best thing in the PR.
- **Catalogue avoided the known trap** — parses the 206 `u8x8_display_info_t`
  structs from `u8x8_d_*.c`, not constructor names (34% of names yield no
  geometry by regex), and filters to `_F_`.
- **22 stable diagnostic codes** with structured suggestion arrays, plus
  `endLine`/`endColumn` beyond what [D-16] asked for — Monaco will want those.
- No clock reads anywhere, so determinism holds.

Readability review returned **no P1 and no P2** — 40/40 TypeScript files carry
SPDX headers, purpose-first descriptions and TSDoc. A marked contrast with PR-01,
and the difference is that the standards skill existed before PR-02 was written.

**PR-03 — built-in widget set + element identity. IN PROGRESS.** Decomposition
approved by the owner 2026-09-10. Seven WOs:

| WO | Scope | State |
|---|---|---|
| WO1 | Tier-1 primitives + `u8g2gl_label` | complete |
| WO2 | `scrolling_label`, `xbm`, `glyph` | **in flight** |
| WO3 | `progress_bar`, `clock` | pending |
| WO4 | `switch`, `button` | pending |
| WO5 | XML manifests + manifest→validator cross-test | pending |
| WO6 | Element identity [U-1] | pending |
| WO7 | Sizeof report, readability review, stack submission | pending |

**⚠ Review WO6 carefully when it lands.** The PA chose **Option A — require
`name` on every element**. That is the one genuinely *breaking* option of the
three offered: it invalidates existing XML, where synthetic ids or the hybrid
(name-when-present, promoted on first edit) would have been additive. It may
still be right — requiring a name is simple and author-controlled — but it was
the option carrying the highest cost and the reasoning needs checking.

**Next:** PR-04 generator, PR-05 foundation integration module, PR-06 Wasm
preview, then **PR-07 — the GO/NO-GO gate**. Full ledger in plan §5.

**R-8 — corrected, and my original framing was wrong.** The bridge prompt told
PR-02's PA that ui_spec §13's nine schema requirements *gated* that PR. The PA
deferred them, arguing they are additive. Checking that: `<previews>`, property
`group`, palette metadata and sample data are all new *optional* attributes or
new document types, and adding an optional field to a schema is a minor bump, not
a breaking change. Five of six are genuinely deferrable.

**The exception is [U-1] element identity** — the only non-additive item, which is
why it was pulled into PR-03 rather than left to drift.

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
