# Remediation Assessment — [D-18] / [D-19] / [D-20], schema 0.4

**For**: Chief Architect
**Date**: 2026-09-11
**Trigger**: design decisions [D-18], [D-19], [D-20] committed as `245f9be`
**Scope of this document**: what already-merged work (PR-01, PR-02, PR-03) no
longer matches the design, and in what order it should be corrected.

**No code has been changed.** This is an assessment only.

> **Chief Architect, 2026-09-12.** Assessment accepted; every claim in it was
> verified against the code. Three amendments, recorded in
> [pr-3r-remediation/PROJECT.md](pr-3r-remediation/PROJECT.md):
> **R1.1 is a live defect, not a latent one** — `set_hidden()` and
> `set_disabled()` are public API and fail to mark dirty today;
> **`TIER1_PRIMITIVES` has already drifted**, so three phantom tags validate
> cleanly (tested), which makes R2.2 a live hole rather than a design smell; and
> **the static pools no longer fit the design**, now recorded as
> [`[D-21]`](../../../docs/decisions/d21-generated-capacities.md) — `[D-20]`'s
> four geometry bindings exhaust `MAX_BINDINGS_PER_OBJ = 4` by construction, and
> nothing validates it.
>
> Sequencing follows the recommendation with one change: R1.1 and R1.2 are one
> work order, since the per-axis setters are the same functions that need the
> dirty call. The eight `u8g2gl_draw_*` functions are pulled **into** scope,
> because the manifests name them and the cross-test would otherwise be red.

---

## Headline

| PR | Merged as | Remediation | Blocks PR-04? |
|---|---|---|---|
| **PR-01** runtime core | #1 | **Small** — 3 contained items, one of them a latent defect | No |
| **PR-02** CLI / schema / validator | #2 | **Moderate** — the schema model changes shape; this is the bulk | **Yes** |
| **PR-03** widget set | #3 | **Moderate** — one class deleted, one absorbed, all 17 manifests touched | **Yes** |

**The critical path is PR-02 and PR-03 remediation before PR-04 starts.** PR-04
is the generator; it consumes the schema model and the manifests directly, so
starting it against the current shapes would mean writing code twice.

Nothing here invalidates the *approach* of any merged PR. The object model,
catalogue, diagnostics, parser and widget implementations all stand. What
changes is vocabulary, one manifest attribute, and one deleted class.

---

## PR-01 — runtime core

### R1.1 `set_coords()` does not mark dirty — **latent defect**

`src/u8g2gl_obj.cpp:28` assigns the four members and returns. Harmless today,
because coordinates are only set during `init()` before anything has rendered.
Once [D-20] makes geometry bindable, a move or resize will not set the frame
dirty flag, §11.2's gate will skip the redraw, and **the change will not
appear** until something unrelated forces a frame.

The failure mode is the bad kind: it works whenever anything else on screen is
animating, and fails silently on a static screen.

Audit `set_hidden()` and `set_disabled()` for the same defect while there.

### R1.2 No per-axis geometry setters

Only `set_coords(x, y, w, h)` exists. [D-20] **requires** `set_x` / `set_y` /
`set_w` / `set_h`: a `bind_width` observer receives one value and has nothing
sensible to pass for the other three. Keep `set_coords` for the generator's
`init()` path, where one call is smaller than four in committed output.

Secondary benefit: four same-typed `int16_t` arguments with no way to catch a
transposition is a poor hand-written API, and [D-20] makes hand-written geometry
the sanctioned path.

### R1.3 `truncate` is deleted by [D-19]

It lives on the **style**, not the label:

- `include/u8g2gl/u8g2gl_style.h:67` (member), `:77` (setter)
- `src/u8g2gl_style.cpp:67,126,147`
- `src/u8g2gl_obj.cpp:162` forwards `u8g2gl_obj::set_truncate` into the style
- `test/test_style.cpp` asserts it

So removal is wider than a label change. Sequence it with R3.2 — `long_mode`
supersedes it, and the two should not be in flight separately.

---

## PR-02 — CLI, schema, validator

### R2.1 Merge the component schema into the widget manifest

`Component` and `ComponentProp` (`cli/src/core/schema/component.ts`) become
`WidgetManifest` with a `view`, and `PropDef`. Touches
`cli/src/core/parser/parse-component.ts`, `cli/test/parser/parse-component.test.ts`,
`cli/test/schema/types.test.ts` and the parser fixtures.

**This also fixes a defect nobody logged:** `ComponentProp` has no `help` field,
so a composite's props cannot carry description text — and `ui_spec.md §9` calls
that surface the editor's differentiator. Merging the types fixes it for free.

### R2.2 Remove the hardcoded `TIER1_PRIMITIVES` set

`cli/src/core/validator/validate-references.ts:23`. [D-17]'s premise is that the
generator's knowledge of elements is *data, not code*; this set is the premise
already leaking. It disappears once the drawing set is manifest-declared.

### R2.3 Composite reference validation — two existing gaps

Both predate these decisions and are closed by the same code path:

- **Unknown tags are not validated inside composites.** The check at
  `validate-references.ts:136` runs only over screens; the walk at `:331`
  validates fonts, images and subjects inside components but never the tag. A
  misspelled element inside a composite passes validation today.
- **No cycle detection.** Nothing prevents A instantiating B instantiating A.
  With composites now producing real objects, this must be a hard error.

### R2.4 Geometry bounds-check against the container

`cli/src/core/validator/validate-geometry.ts:126–169` checks `rightEdge >
displayWidth`. Per [D-20] the reference is the **containing element**, which is
the display only at screen level.

### R2.5 Manifest schema — `animated` out, `draw=` in

- Drop `animated` from `WidgetManifest` (`schema/widget-manifest.ts`). It existed
  solely to license demotion, which [D-18] replaces with a per-instance rule.
- Add `draw=` alongside `setter=` as an emission target. Today both spellings are
  `setter=` meaning two different things — a U8G2 method on primitives, a runtime
  method on widgets.
- `cli/test/manifests/manifest-crosstest.test.ts` asserts against the current
  shape and moves with it.

### R2.6 Schema 0.3 → 0.4

Bump, plus the §15.4 refusal path: the CLI must reject `schema="0.3"` naming
each change and its migration, not fail obscurely. The migration table is in
design_spec §15.4.

---

## PR-03 — widget set

### R3.1 Delete `u8g2gl_scrolling_label`

`include/u8g2gl/u8g2gl_scrolling_label.h`, `src/u8g2gl_scrolling_label.cpp`,
`include/u8g2gl/manifests/u8g2gl_scrolling_label.xml`,
`test/test_scrolling_label.cpp`, and its entries in `CMakeLists.txt` and
`test/CMakeLists.txt`.

### R3.2 Absorb it into `u8g2gl_label` as `long_mode`

Four values: `clip` (default), `dots`, `scroll`, `scroll_circular`. `wrap` is
deliberately not offered — labels are single-line — and that omission must be
documented where a user coming from LVGL will meet it.

`test/test_sizeof_report.cpp` budget for `u8g2gl_label` rises by roughly 16
bytes. The existing scrolling-label tests become label tests rather than being
discarded; the behaviour is unchanged, only its home.

### R3.3 All 17 manifests carry `animated=`

Mechanical removal, but it is every manifest in
`include/u8g2gl/manifests/`, so it wants doing once rather than per-widget.

### R3.4 Eight primitive manifests use `setter=` for U8G2 calls

`u8g2gl_box`, `circle`, `ellipse`, `hline`, `line`, `vline`, `pixel`,
`triangle` — each naming a U8G2 method (`drawBox`) where [D-18] now wants a
runtime free function (`draw="u8g2gl_draw_box"`).

---

## Not remediation — genuinely new work

Listing these so they are not mistaken for corrections to merged PRs:

- **The `u8g2gl_draw_*` free functions.** Eight small functions; nothing to
  correct, they simply do not exist yet.
- **The editor target's draw-by-name table** (`ui_spec.md` [UD-4]) — belongs
  with the editor work, not here.
- **Composite container semantics in the generator** — PR-04's job.

---

## Recommended sequencing

1. **R1.1 alone, first.** It is a latent correctness defect, it is independent
   of everything else, and it should not wait behind a schema discussion.
2. **PR-02 and PR-03 remediation together**, as one PR. R2.5 and R3.3/R3.4 are
   two halves of the same manifest change, and splitting them leaves the
   cross-test red in between.
3. **R1.2 and R1.3 with that PR**, since `truncate` removal spans runtime and
   manifests.
4. **Then PR-04.**

## Risks

- **R2.1 is the largest single item** and touches the parser, the validator and
  four test files. It is a type merge rather than a behaviour change, which
  makes it tedious rather than risky — but it is where the estimate will be
  wrong if it is wrong.
- **The 0.3 → 0.4 refusal path (R2.6) is easy to defer and should not be.** It is
  the whole reason the break is defensible: §15.4 requires breaking changes to
  be diagnosable, and a bump without the migration message is a silent break.
- **No user XML exists outside this repository's fixtures**, which is what makes
  the break cheap now and expensive after PR-05.
