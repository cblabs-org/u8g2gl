# PROJECT — PR-3R: Remediation to [D-18] / [D-19] / [D-20] / [D-21], schema 0.4

**Tier 2 · Principal Architect**
**Programme**: U8G2GL
**Parent**: [PROGRAM.md](../PROGRAM.md)
**Assessment**: [REMEDIATION-D18.md](../REMEDIATION-D18.md)
<!-- Last updated: 2026-09-12 -->

## Mandate

Realign the merged runtime, CLI and widget set to the decisions taken on
2026-09-11 (`245f9be`) and 2026-09-12, so PR-04's generator is written once
against the correct shapes rather than twice.

**This PR blocks PR-04.** The generator consumes the schema model and the
manifests directly.

## Why now

No user XML exists outside this repository's fixtures. The break is cheap today
and expensive after PR-05 puts generated code in a real application. That window
is the entire reason this is an interim PR rather than a backlog item.

## Branch Strategy

Base: `main` @ `1ff25d2`. Branches `u8g2gl-remediation/wo<N>-<topic>`, stacked
serially. PR head is the last branch in the stack.

## Work Order Decomposition

- [x] **[WO1 — dirty-flag correctness and per-axis geometry](wo1-dirty-geometry/WORKORDER.md)** ✅ `4ca9e01` · `u8g2gl-remediation/wo1-dirty-geometry` · base `main` · standard · R1.1, R1.2
- [x] **[WO2 — label `long_mode` absorbs `u8g2gl_scrolling_label`](wo2-label-long-mode/WORKORDER.md)** ✅ `4e649cf` · base WO1 · standard · R1.3, R3.1, R3.2
- [x] **[WO2b — reversing scroll](wo2b-scroll-semantics/WORKORDER.md)** ✅ `217473c` · base WO2 · standard · defect surfaced by WO2 (PA-added)
- [x] **[WO3 — `u8g2gl_draw_*` free functions](wo3-draw-functions/WORKORDER.md)** ✅ `b13bdff` · base WO2b · standard · new work, required by WO4
- [x] **[WO3b — complete the draw layer](wo3b-draw-testability/WORKORDER.md)** ✅ `07cfd2d` · base WO3 · standard · defects surfaced by WO3 (PA-added)
- [x] **[WO4 — manifests: `animated` out, `draw=` in](wo4-manifests/WORKORDER.md)** ✅ `ac02684` · base WO3b · standard · R2.5, R3.3, R3.4
- [x] **[WO5 — merge component schema into widget manifest](wo5-schema-merge/WORKORDER.md)** ✅ `2bd7082` · base WO4 · standard · R2.1 — *prop half only*
- [ ] **[WO5b — retire the `Component` type](wo5b-component-retire/WORKORDER.md)** · base WO5 · standard · finishes R2.1 (PA-added)
- [ ] **[WO6 — validator: primitives, composite tags, cycles, container geometry](wo6-validator/WORKORDER.md)** · base WO5b · standard · R2.2, R2.3, R2.4
- [ ] **[WO7 — capacity defaults and the structural object ceiling](wo7-capacities/WORKORDER.md)** · base WO6 · standard · [D-21]
- [ ] **[WO8 — schema 0.4, the 0.3 refusal path, integration](wo8-schema-04/WORKORDER.md)** · base WO7 · standard · R2.6

**WO4 was re-graded `mechanical` → `standard`.** Stripping `animated` from 17
XML files is rote, but the same work order changes `widget-manifest.ts`, the
manifest parser and the cross-test, and the cross-test must end *meaningful*
rather than merely green. That is judgement, not transcription.

**Ordering rationale.** WO1 and WO2 are runtime-only and unblock nothing else, so
they go first and can be reviewed while the schema work proceeds. WO3 must
precede WO4 because the manifests name functions that would otherwise not exist
and the cross-test would be red between them. WO8 is last because the version
refusal path must describe changes that have all already landed.

## Deviations from the assessment

**The `u8g2gl_draw_*` free functions are in scope** (WO3), though
REMEDIATION-D18.md lists them under "genuinely new work". WO4 points eight
manifests at those functions and `manifest-crosstest.test.ts` verifies manifests
against real C++ symbols — so excluding them would leave the cross-test red for
the length of the PR. Eight small functions is a cheaper price than a knowingly
broken test.

**R1.1 and R1.2 are one work order, not two.** The assessment recommends R1.1
first and alone. The per-axis setters are the same functions that need the dirty
call, so splitting them means editing `set_coords` to add `mark_dirty()` and then
immediately restructuring it to add `set_x`/`set_y`/`set_w`/`set_h`. Same
surface, twice.

**R1.1 is a live defect, not a latent one.** The assessment says the missing
`mark_dirty()` is harmless until [D-20] lands. That holds for `set_coords`, which
only runs during `init()`. It does not hold for `set_hidden()` and
`set_disabled()`, which are public API: an application calling
`obj->set_hidden(true)` on a static screen gets no repaint today, in merged code.
The bound path is safe because the observer marks dirty; the imperative path is
not. WO1 treats this as the correctness fix it is.

## Findings added by the Chief Architect

Not in the assessment; verified against the code on 2026-09-12.

**`TIER1_PRIMITIVES` has already drifted.** It names `u8g2gl_frame`,
`u8g2gl_disc` and `u8g2gl_bitmap`, none of which have manifests, and omits
`ellipse`, `pixel`, `triangle` and `xbm`, which do. Tested: `<u8g2gl_frame>`
**passes validation** while `<u8g2gl_nonsense>` is correctly rejected. Three
phantom tags validate today and would reach PR-04's generator with nothing behind
them. R2.2 closes a live hole, not just a design smell.

**The static pools no longer fit the design** — now [D-21]. `MAX_BINDINGS_PER_OBJ`
is 4 while [D-20] makes four geometry properties bindable, so one element binding
its geometry has nothing left for `text`. `MAX_OBJECTS_PER_SCREEN` is 32 while
[D-18] turns every composite into an object. Neither is validated, and
`add_binding()` fails by returning `false` — a value generated code can ignore.
WO7 takes the runtime and validator half; the generator emitting exact capacities
is PR-04.

## Human Approval

<!-- Record the owner's own words and the timestamp. A worker verifies this as
     its authorization, so it must be genuine. -->

**APPROVED by the human (Matt McNeill) on 2026-09-13.**

The owner's own words, verbatim:

> "ok please can you give me a md bridget prompt to ask an implementation
> architect to start work on the PR3R please ?"

Context: the owner had the eight-work-order decomposition, the three deviations
from the assessment and the `[D-21]` record in front of them, and separately
directed that migration tooling be dropped ("no need for migration we have never
written any xml yet never mind having downstream users"). That direction is
recorded in WO8's boundary box.

## Status Log

- 2026-09-13 — Approved by the owner; handed to a Principal Architect to execute.
- 2026-09-12 — `--migrate` tooling rejected by the owner; WO8 trimmed and the
  rejection recorded in its boundary box.
- 2026-09-12 — Decomposition drafted by the Chief Architect. [D-21] recorded in
  `docs/decisions/d21-generated-capacities.md`, design_spec §3/§13.7/§18.1, and
  the plan ledger as PR-3R.

### WO1 — complete (`4ca9e01`)

Verified independently: boundary respected exactly, C++ 166 → **175 tests**, zero
warnings, CLI 224 untouched. `set_coords`, `set_hidden`, `set_disabled` and the
four new per-axis setters all mark dirty, each guarded on the value actually
changing so a setter called from a tick loop cannot defeat §11.2's gate.

**Cross-cutting decision — the change-guard is now the house pattern.** WO1
applied it consistently rather than only to the new setters. Later work orders
match it rather than inventing a second idiom.

**Correct by design, deliberately not "fixed":** `set_flag`/`clear_flag` do not
auto-mark, because `clear_dirty()` *is* `clear_flag(DIRTY)` and would immediately
re-set the flag it clears. Good catch by the worker — a mechanical application of
the rule would have broken the gate.

**Surfaced and triaged into WO2:** eleven more instances of the same defect — nine
style delegations, `apply_style()`, and `set_parent_index()`. Verified:
`set_font()` calls `style_.set_font()` and returns, so a runtime font change never
repaints. Folded into WO2 rather than given its own order because WO2 already
edits that delegation block to delete `set_truncate`; separating them means
touching the same lines twice.

### WO2 — complete (`4e649cf`)

Verified: C++ 175 → **207 tests**, zero warnings, boundary respected.
`u8g2gl_scrolling_label` deleted, `truncate` gone from style and obj, and the
eleven surfaced `mark_dirty()` gaps fixed.

**The worker improved on the pattern it was told to copy.** WO1's guard compares
the value; for style setters that broke `Button.RenderAlignmentOverride`, because
setting `align` to its already-default value must still update the style's
set_mask. The guard now checks `style_.has(PROP)` as well. Caught by an existing
test, documented at the guard site, regression test added. This is the right
failure mode — the suite caught a plausible-looking generalisation.

**Cost correction.** `sizeof(u8g2gl_label)` is **80 bytes** on a 64-bit host, not
the 72 that [D-19]'s +16 estimate implied — the real delta is +24, from
`long_mode_` and an `overflow_` flag neither old class had. [D-19]'s cost section
is amended rather than left standing, per §1.3.

### Spec defect found by WO2 — resolved, and WO2b added

The worker flagged that design_spec contradicted itself: the semantics table says
`scroll` reverses at each end, while §15.4's migration table mapped the old
`u8g2gl_scrolling_label` onto `scroll`. Checked the deleted source — it wrapped
continuously ("wrap to re-enter smoothly from the right edge"), which is
`scroll_circular`.

**The migration table was the error.** Corrected in design_spec §15.4 and in the
[D-19] record. The semantics table stands: it matches LVGL exactly, and §1.4
makes that familiarity a goal.

The worker followed the migration table as instructed, so `scroll` currently
wraps and **nothing implements reversing**. That is a defect against [D-19],
tracked as **WO2b**, inserted between WO2 and WO3. Redefining `scroll` as
wrapping was considered and rejected — it diverges from LVGL silently, on the
identifier an LVGL user is most likely to reach for, which is worse than a
missing mode.

The worker was right to flag this rather than invent bounce timing no document
specified.

### PA repair — the stack was left red

WO2's deletion of the scrolling-label manifest broke
`manifest-crosstest.test.ts`'s "at least 17 manifest files" assertion, correctly
outside its boundary. Fixed by the PA rather than deferred to WO4, because
leaving a red suite across WO2b and WO3 invites the next worker to either "fix"
it out of scope or wonder whether they caused it.

Fixed by removing the magic count rather than decrementing it to 16. The
assertion's real purpose is guarding against a **vacuous suite** — if the
manifest path resolves wrong, the file list is empty, the per-manifest loop
generates no tests, and the cross-test passes while checking nothing. It now
asserts that, and stops drifting every time a manifest is legitimately added or
removed. A hardcoded count is the same failure mode `TIER1_PRIMITIVES` already
demonstrated.

### Carried to WO4

- `include/u8g2gl/manifests/u8g2gl_obj.xml` still declares the deleted
  `truncate` / `set_truncate`
- The label manifest's `animated="false"` is questionable under scroll modes —
  `animated` is being deleted wholesale, so this resolves itself

### WO2b — complete (`217473c`)

Verified: 4 files, all inside the box; C++ 207 → **210 tests**; zero warnings;
`sizeof(u8g2gl_label)` still **80 bytes** on a 64-bit host — the direction flag
landed in existing padding and cost nothing. `scroll_circular`'s tests pass
unchanged, which was the condition for believing its behaviour was preserved.

`scroll` now reverses, dwelling at each end on the existing `static_dwell_ms`
rather than a second timing property.

**Checked rather than assumed:** with neither scrolling mode latching
`is_scroll_finished()`, the obvious worry is that the method is now dead API. It
is not — it still latches for the static-dwell case, so its meaning narrowed
deliberately instead of evaporating.

**Surfaced, triaged as a non-issue today:** a consumer relying on the old
latch-on-wrap to rotate messages would break. Nothing consumes it — no generated
code, no application — so there is nothing to break yet. Worth remembering at
PR-05, when a real app first drives these labels.

### WO3 — complete (`b13bdff`), with three defects surfaced → WO3b

Eight free functions delivered, C++ 210 → **233 tests**, zero warnings, boundary
respected. The functions are free functions with the why-comment [D-18] needs, and
the signatures were derived from the manifests rather than invented.

The worker also found real depth: `u8g2gl_draw_box` dispatches across
`drawBox`/`drawFrame`/`drawRBox`/`drawRFrame`, and it added a segment enum
mirroring U8G2's actual `U8G2_DRAW_*` bit values rather than approximating them.

**Three surfaced defects, all verified, all going to WO3b.** The worker was right
to surface rather than fix in each case — every one sat outside its boundary — but
none can ship.

1. **`u8g2gl_draw_ellipse` is declared with no body.** The test double has no
   `drawEllipse`, and defining against the real U8G2 API would break the shared
   host build. Sound reasoning, unacceptable outcome: a declared symbol that
   cannot link, invisible only because nothing calls it — and **WO4 is about to
   point the ellipse manifest at it**. This is the one that had to be caught now.
2. **The test double is a no-op for six of eight primitives.** `drawHLine`,
   `drawVLine`, `drawLine`, `drawCircle`, `drawDisc`, `drawTriangle` are empty
   bodies, so those tests assert only "does not crash". A rendering framework
   whose draw path is largely unverified — and the root cause of (1).
3. **`filled` on `u8g2gl_draw_triangle` does nothing.** The manifest declares it;
   U8G2 has no unfilled-triangle primitive, so it is silently ignored. Same class
   of defect as `long_mode="scroll"` silently wrapping, which this PR has already
   had to correct once.

**On (3) the worker was over-cautious and I have overruled it.** It declined to
"invent an unspecified outline algorithm" — but three lines between three vertices
is not an invention, it is what a triangle outline is. WO3b supplies the authority
it correctly declined to assume on its own.

### WO3b — complete (`07cfd2d`)

C++ 233 → **238 tests**, zero warnings, boundary respected. All three defects
closed. Verified independently with `nm` on the built archive: all eight
`u8g2gl_draw_*` symbols are `T` (defined), none `U`. The link landmine is gone,
confirmed at the binary level rather than by reading the source.

**The worker verified its own claim the stronger way and said why** — a source
grep proves the declarations match the definitions, `nm` proves the linker
agrees. That is the distinction that mattered here, since the whole defect was a
declaration that compiled cleanly and would only have failed at final link.

**One disclosed extension to the test double**, and it is the right one: the
triangle outline issues three `drawLine` calls, which a single last-call slot
cannot prove. It added a small indexed call history rather than a second
mechanism — the existing idiom indexed, exactly as instructed.

The draw path is now genuinely verified rather than asserted not to crash, which
matters considerably more once PR-04 starts generating calls into it.

### WO4 — complete (`ac02684`)

CLI 220 → **239 tests**, C++ 238 unchanged, zero warnings. Verified: zero
manifests carry `animated`, zero `setter="drawX"` remain, `truncate` is gone from
`u8g2gl_obj.xml`.

**The cross-test is now the good kind.** It parses `u8g2gl_draw.h` and builds the
set of declared free functions from the header itself, then asserts every `draw=`
value is a member — rather than checking against a hand-copied list. It also
carries a self-check that the extractor did not silently return empty. That is
[D-17]'s "data, not code" applied to the test as well as the generator, and it
picked the anti-vacuous guard up from the count assertion I rewrote in WO2 rather
than being told to.

A typo'd `draw=` now fails before it ever reaches a linker.

**Decision recorded — a lingering `animated` is ignored, not a parse error.** Four
fixtures outside WO4's boundary still carry it, and erroring would fail those
suites for a reason unrelated to their own concern. It also matches the parser's
existing behaviour of never diagnosing unrecognised *attributes*, only
unrecognised child elements. Consistency with the surrounding parser beats
strictness here; regression tests pin the choice.

**Three findings, all placed:**
1. `validate-schema.ts` will emit a spurious "missing required attribute
   'setter'" for every `draw=` prop once real manifests run the full pipeline —
   **a defect with no failing test to announce it**. Folded into WO6, which owns
   the validator.
2. `types.test.ts` still names the deleted `u8g2gl_scrolling_label` — folded into
   WO5, which is rewriting that file anyway.
3. WO4's own prose said "17 manifests" when 16 exist. Corrected — the count was
   stale, not the instruction.

### WO5 — partially complete (`2bd7082`), remainder → WO5b

CLI 239 → **240 tests**, `tsc` clean, boundary respected. `ComponentProp` is
merged into `PropDef` and `help` now round-trips on a composite prop — the defect
nobody had logged, with a test that fails without the fix.

**`Component` itself was not retired, and the worker was right to stop.** Five
call sites across four validator files read `comp.api` as a bare `PropDef[]` while
a widget's props come through an `ApiBlock`. Unifying the type means unifying
those reads, and those files were reserved for WO6.

It built the literal version the checklist asked for, found it did not compile,
and surfaced the conflict rather than either reaching into reserved files or
picking a shape that compiled but encoded the wrong thing. That is precisely what
a boundary box is for, and the alternative — a silent reading that happened to
build — would have been much harder to spot in review.

**My scoping error, not the worker's.** I wrote WO5 as though the merge were
confined to the schema types. It is not: the type *is* how the validators reach
composite props, so the merge always reached into WO6's files. The boundary was
drawn in the wrong place and the worker found the seam.

**WO5b takes the remainder and runs before WO6**, deliberately: a type migration
and four behaviour changes in one diff is not reviewable. WO5b does the migration
with no behaviour change; WO6 then changes behaviour on a settled shape.

WO5b also deletes the `@deprecated ComponentProp` alias WO5 left behind. A
deprecation alias buys downstream consumers time to migrate, and there are none —
the same reasoning that rejected `--migrate`.
