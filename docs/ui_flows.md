# U8G2GL Designer — User Flows

**The eight flows of the designer, worked through to the level a mockup can be drawn from.**

**Version**: 1.0
**Date**: September 2026
**Status**: Phase 0 of the design process. F2, F3 and F6 are worked in full; F1, F4, F5, F7 and F8 are walked through for coverage. §8 and §9 are the outputs that feed the next phase.
**Companion documents**: [ui_spec.md](ui_spec.md) (the designer — **authoritative on editor behaviour**) · [design_spec.md](design_spec.md) (the framework) · [implementation_plan.md](implementation_plan.md) (sequencing)

> This document **expands** [ui_spec.md §5](ui_spec.md), it does not replace it. §5 remains the index of the eight flows; this is the detail behind three of them. Where this document and `ui_spec.md` disagree, `ui_spec.md` wins until a decision here is promoted into it.
>
> **`[F-n]`** identifies a flow. **`[FD-n]`** marks a flow decision made in this document and proposed for promotion into `ui_spec.md`. **`[FQ-n]`** marks a question this work raised that is not yet answered.

---

## 1. Why this document exists

`ui_spec.md` settled *what the designer is* — seven `[UD-n]` decisions, a layout, a panel inventory. It did not settle *what happens when you use it*. Its eight flows are one line each:

> **F3 · Bind data.** Select element → choose subject → set format string → see it render against sample data.

That is a scenario, not a flow. It has no preconditions, no empty case, no failure, and no answer to the first question a real user hits — *what if no subjects exist yet?* Nothing can be drawn from it, and more importantly, nothing can be **found wrong** in it.

Working the flows properly is the cheapest place to discover design faults, because the only cost of being wrong is a rewritten paragraph. §8 and §9 record what this pass found; several items are architectural rather than cosmetic, and one closes an open question that had been sitting in the schema register for want of a flow to answer it.

### 1.1 What a worked flow contains

| Part | Why it is there |
|---|---|
| **Entry points** | A flow reached three ways has three different starting states. Mockups drawn from one entry miss the others |
| **Preconditions** | What must already exist. The interesting design is usually in what happens when it does not |
| **The path** | Step by step, naming the surface that changes at each step |
| **States** | Empty · partial · error · in-progress. The state coverage that dense UI *"lives or dies on"* |
| **Branches** | Where the path forks, and what decides it |
| **Keyboard** | For F2 especially, the keyboard path *is* the flow |
| **What it proves** | The schema, architecture or spec consequence the flow exposes |

---

## 2. F2 · Adjust precisely

> **Select (canvas or XML) → nudge by pixel → read coordinates → align to a neighbour.**

**This is the most important flow in the tool.** `ui_spec.md` §5 says it runs dozens of times a session and must be the fastest thing in it. Everything below is in service of keeping the loop — *look, nudge, look* — under the 16 ms budget of §4.1 and free of any modal interruption.

### 2.1 Entry points

| From | Starting state |
|---|---|
| **Canvas click** | Element selected, pointer on canvas, keyboard focus on canvas |
| **XML caret** | Element selected via §4.3 sync, but keyboard focus is in **Monaco** — arrows move the caret, not the element |
| **Problems row** | Element selected and revealed; the user arrived to fix something specific |
| **Continuing** | Already selected and already nudging. The common case, and the one to optimise |

The second row is a trap worth naming. Selection is shared but keyboard focus is not, so "selected" does not imply "nudgeable." The canvas must be focused for arrows to move anything, and the user needs to know which surface owns the keyboard without guessing — a focus ring on the active pane, not a subtle one.

### 2.2 Preconditions

An element exists and is selectable. It is not inside a composite instance (`ui_spec.md` §8: instances render inline but are not editable in place — selecting one offers *Open element* instead). Its position is not expression-valued — see §2.6, which is where this flow turned out to be genuinely undecided.

### 2.3 The path

1. **Select.** Click hit-tests in draw order, topmost wins (§4.3). Repeated clicks at the same point cycle downward through overlaps — needed constantly, because monochrome layouts stack a label over a box over a background.
2. **Read.** Selection geometry appears in the status bar and as a live badge on the element. Both, because the badge is where the eye already is and the status bar is where it stays put while the badge moves.
3. **Nudge.** `←↑→↓` move by 1 px. `Shift` + arrow moves by 8 px — one tile, because tile boundaries are real (partial refresh works in tiles).
4. **Observe.** The canvas repaints. Guides appear when an edge reaches alignment with a sibling or a display bound.
5. **Repeat** until right.

Each nudge is a text edit at a CST range (§4.1 step 2). The XML pane updates live, a one-line diff, comments and formatting untouched.

### 2.4 `[FD-1]` Nudges coalesce into one undo entry

**A run of consecutive nudges on the same selection is one undo step.** The run ends on selection change, on a different kind of edit, or after 500 ms of no nudging.

`ui_spec.md` §4.1 says "one undo stack" and says nothing about granularity, which reads as settled but is not. Without coalescing, undoing a 12-pixel correction is twelve keystrokes — and since the whole flow is *repeat until right*, the natural correction to over-nudging is undo. Per-keystroke undo makes the tool's most common repair its most tedious one.

The 500 ms break matters as much as the coalescing: without it, a nudge made twenty minutes later joins the same undo entry as this morning's, and undo becomes unpredictable. Unpredictable undo is worse than coarse undo.

### 2.5 `[FD-2]` A held arrow key must not run the full pipeline per repeat

**A nudge that changes only coordinates, on an element nothing else depends on, skips re-validation and re-resolution and patches the scene description directly.** Any other edit takes the full §4.1 path.

Key autorepeat delivers roughly 30 events per second. §4.1 specifies immediate — not debounced — handling for canvas edits, against a 16 ms budget. Running parse → validate → resolve → emit scene → construct → tick → render thirty times a second at that budget is the one place in the architecture where the numbers are genuinely tight.

The correctness condition is the important half, and it is why this cannot simply be "optimise later": the shortcut is only valid when **no other element's resolved position depends on this one.** [design_spec.md §7.2](design_spec.md) anchors let one element position against another, so moving element A can move element B. The resolver knows the dependency graph; the fast path is available only for elements with no dependents. Implemented without that condition, a held arrow key silently desynchronises anchored siblings from the element they follow — which will look like a rendering bug and be diagnosed as one.

### 2.6 `[FD-3]` Guides indicate alignment; they never alter a nudge

**During keyboard nudge, alignment guides appear but snapping does not occur. During drag, snapping occurs with a 3 screen-pixel threshold.**

`ui_spec.md` §8 specifies snapping for drag and is silent on nudge. The two must differ. An arrow key is an explicit request for exactly one pixel, and a snap that turns it into three violates the tool's fourth principle — *pixel-exact by default* — at the exact moment the user is being most deliberate. Drag is the opposite: an imprecise gesture that wants help.

So the guide is doing two different jobs. On drag it is a magnet; on nudge it is a read-out that says *this edge now lines up with that one* — which is the information the user was nudging to obtain.

### 2.7 `[FD-4]` Nudging an expression-valued coordinate does not overwrite the expression

**An element whose `x` is `#left_margin`, or an anchor expression, cannot be nudged. The arrow keypress is refused with a transient explanation naming the expression, and the property field offers an explicit *override to literal* action.**

This is the most consequential gap this flow exposed, and nothing in either specification covers it.

[design_spec.md §7.2](design_spec.md) gives build-time layout helpers — constant references and anchors — and `ui_spec.md` principle 5 says *the XML stays authored; the editor is a co-author, not the file's owner.* A nudge that silently replaces `x="#left_margin"` with `x="14"` destroys an intentional relationship, and destroys it in the tool's highest-frequency interaction, where the user's attention is on the pixels and not on the markup. The user would discover it later, as a layout that stopped responding to a constant they were still editing.

Refusing is not obstruction. The user retains the constant and the ability to abandon it, but abandoning it becomes a decision rather than a side effect. The cost is one transient message in a rare case; the alternative is a silent, delayed, hard-to-attribute loss of authored structure.

**Related, and deliberately not solved here:** what a *drag* does to the same element. Refusing a drag is harsher than refusing a keypress, because drag carries no expectation of exactness. Recorded as `[FQ-1]`.

### 2.8 States

| State | Behaviour |
|---|---|
| **Nothing selected** | Arrows do nothing. They are reserved for nudge and are not repurposed for panning — a key that does two things depending on invisible state is worse than a key that does one. Status bar shows no selection |
| **Multi-selection** | All selected elements move by the same delta. Status bar shows the bounding box, not any one element. Align and distribute act on the set |
| **Out of bounds** | **Permitted and flagged.** The element renders with the §8 hatched indicator and a Problems row appears. The nudge is never blocked: pixel-exact means the value is what was asked for, and a coordinate clamped by the editor is a coordinate the XML and the canvas disagree about |
| **Expression-valued** | Per `[FD-4]` |
| **Document structurally invalid** | The canvas holds the last good frame, dimmed (§4.1). Nudging is still permitted — the edit is applied to text — but the canvas cannot show the result until the document parses. The dimming is what tells the user why nothing is moving |
| **Inside a composite instance** | Not selectable for edit. Offers *Open element* |

### 2.9 Keyboard reference

| Key | Effect |
|---|---|
| `←↑→↓` | 1 px |
| `Shift` + arrow | 8 px (one tile) |
| `Esc` | Clear selection |
| `Tab` | Next element in document order — see `[FQ-2]` |
| `Ctrl/⌘ Z` | Undo one coalesced run (`[FD-1]`) |
| `⌘↵` / `Ctrl+Enter` | **Run**: the test run (EDITOR-DESIGN §4), from anywhere in the designer, the XML editor included. It overrides Monaco's *Insert Line Below*, which it would otherwise be |

### 2.10 What this flow proves

The fast path (`[FD-2]`) needs a dependency graph from the resolver, which is **PR-04**. The editor cannot be built on a resolver that only answers "what are the final coordinates" — it must also answer "what depends on this." That is a PR-04 API requirement discovered by drawing a flow, and it is exactly the kind of thing found late and expensively otherwise.

---

## 3. F3 · Bind data

> **Select element → choose subject → set format string → see it render against sample data.**

Where F2 is about speed, F3 is about **teaching**. It is the flow in which `ui_spec.md` principle 6 — *the property panel teaches* — either works or does not, and it is the flow the incumbent tools handle worst.

### 3.1 Entry points

From a selected element, via the property panel's Binding group. There is no other entry: binding is a property, and the panel is where properties are edited.

### 3.2 Preconditions — and the one that matters

A subject of a compatible type must be declared. [design_spec.md §5.3](design_spec.md) puts subject declarations in `globals.xml`.

**On a new project, none exist.** This is not an edge case — it is the state of every project the first time anyone binds anything, which makes it the first impression of the tool's differentiating feature.

### 3.3 `[FD-5]` The panel creates subjects inline, and this requires a multi-document session

**When no compatible subject exists, the binding control shows a *Declare a subject* affordance that creates one in `globals.xml` without leaving the panel.**

The alternative is an empty dropdown, which is a dead end presented as a control — the user must work out for themselves that subjects exist, that they live in a different file, what the syntax is, and that `max_len` must be chosen for a string. That is the "no guidance for the non-coding user" failure `ui_spec.md` §1 identifies in LVGL Pro, reproduced exactly.

**The architectural consequence is larger than the feature.** `ui_spec.md` §4 shows a single CST for a single document. This edit originates in the screen document and lands in `globals.xml`. So:

- The session holds a **CST per open document**, not one CST.
- An edit may target a document that is not open, which must then be loaded, edited and saved.
- **Undo must span the pair.** Declaring a subject and binding to it is one user action producing two document edits; undoing it must not leave an orphaned declaration. This is in direct tension with `ui_spec.md` §14, which excludes cross-file undo as *"a large problem, narrow benefit."*

The exclusion is not wrong, but it was written against a different case. A *general* cross-file undo stack is a large problem. What this needs is narrower: **an edit group that spans documents, atomic on undo.** Recorded as `[FD-6]` and flagged for `ui_spec.md` §14, which currently forbids the thing this flow requires.

`max_len` for a new string subject is the one parameter the affordance must ask for, and it should ask with the consequence attached — [design_spec.md §8.2](design_spec.md) makes it `max_len + 1` bytes of real RAM, and §9.2 requires cost shown where it is incurred.

### 3.4 `[FD-7]` Two manifest binds render as one control

**Where a widget's manifest declares several `<bind>` entries differing only in subject type, the panel renders a single control whose dropdown offers every compatible subject, and selects the matching bind on commit.**

The manifests as shipped in PR-03 declare:

```xml
<bind name="bind_text" type="string" setter="bind_text" fmt="bind_text_fmt" />
<bind name="bind_text" type="int"    setter="bind_text" fmt="bind_text_fmt" />
```

Rendered literally, that is two rows — *Bind text* and *Bind text int* — and the user must know their subject's type before they can tell which row to use. The manifest is describing one user-facing capability through two generator-facing entries, and the panel must reflect the user's model, not the generator's.

This is a **panel generation rule**, and `[UD-5]` has none — it says the panel is generated from manifests and stops there. Rules of this kind are where the difference between a generated panel and a designed one lives.

### 3.5 The path

1. **Select** the element. Panel shows its groups.
2. **Open Binding.** The control lists type-compatible subjects (`ui_spec.md` §9.1), or offers declaration per `[FD-5]`.
3. **Choose a subject.** Immediately:
   - `text` is disabled with an explanation — the manifest's own `help` says *"Overridden when bind_text is active"*, so the panel already has the words.
   - A format field appears **only if the subject type needs one.** A string subject bound to `bind_text` needs no format; an int does.
4. **Set the format.** `bind_text_fmt="%d°C"`. Validated as typed against the subject's type — [design_spec.md §8.4](design_spec.md) type-checks conversions at build time, and the panel must apply the same check immediately, because a build-time-only check means the guidance arrives after the user has moved on.
5. **Observe.** The canvas re-renders against the active sample set. If no sample value exists, `ui_spec.md` §11's visible placeholder appears — and the user is now in F6.

### 3.6 `[FD-8]` Conditional bindings are a repeated-child group, not a property

**The panel renders `bind_flag_if_*` children and `<event_cb>` children as an editable list with add and remove, in their own groups.**

[design_spec.md §8.4](design_spec.md) expresses conditional visibility as a **child element**, not an attribute:

```xml
<u8g2gl_xbm src="icon_wifi">
    <bind_flag_if_eq subject="wifi_connected" ref_value="0" flag="hidden" />
</u8g2gl_xbm>
```

`ui_spec.md` §9.1's editor table maps `<prop>` types to controls and has no row for this, because the panel was conceived as a flat list of attributes. An element may carry several of these, in any combination of the four comparison variants.

So the panel is **not** a flat property list. It is a property list plus zero or more repeated-child sections. That is a structural change to `[UD-5]`, and it means the manifests must declare which child elements a widget accepts — which none of the seventeen currently do.

Conditional visibility is not an advanced feature in this domain. Showing a WiFi icon only when connected is close to the first thing anyone does on a status bar.

### 3.7 States

| State | Behaviour |
|---|---|
| **No subjects declared** | *Declare a subject* affordance (`[FD-5]`). Not an empty dropdown |
| **Subjects exist, none compatible** | List shown greyed with the reason — *"3 subjects declared, none of type string"* — plus the declare affordance. Silently showing an empty list when subjects plainly exist reads as a bug |
| **Format string invalid** | Flagged inline as typed, with the expected conversion for the subject's type |
| **Format can overflow `max_len`** | Warned in the panel, not only at build. [design_spec.md §8.2](design_spec.md) already requires a build-time warning where overflow is provable; the panel should raise the same warning at the moment the format is written |
| **Bound subject has no sample value** | Placeholder renders in the canvas; the panel links to the sample set (hand-off to F6) |
| **Bound subject deleted from `globals.xml`** | The binding dangles. Validator raises it; the panel shows the name struck through with a *re-bind* action. It must not silently clear the attribute — that discards the author's intent and the diagnostic along with it |

### 3.8 What this flow proves

Three things, in increasing order of cost: manifests need to declare acceptable child elements; `[UD-5]` needs panel generation *rules* and not just a data source; and the editor session is multi-document with cross-document atomic undo, which `ui_spec.md` §14 presently excludes.

---

## 4. F6 · Check against real data

> **Switch sample sets — typical, empty, longest plausible — and confirm the layout survives each.**

`[UD-6]`'s rationale is that monochrome layout is length-dependent: an 8-character and a 30-character string differ in whether text fits, scrolls or truncates. This flow is how that rationale is cashed in, and working it answers `[U-6]`.

### 4.1 Entry points

Canvas toolbar selector; keyboard cycle; from F3 when a binding has no sample value.

### 4.2 Preconditions

At least one sample set. `ui_spec.md` §11 offers the four conventional sets — **typical**, **empty**, **longest plausible**, **worst case** — at project creation.

### 4.3 `[FD-9]` Sample data is a project document, `samples.xml` — closing `[U-6]`

**Sample data lives in the project, beside `globals.xml`. It is not a sidecar.**

`[U-6]` framed the choice as *project-shared argues for the former; never-compiled argues for separation*, and had no way to settle it. The flow settles it by supplying the missing test.

**Sidecar is for what two developers would legitimately disagree about.** Editor view state — zoom, panel sizes, scroll position, which set is currently active — is per-person, changes constantly, and would make every pan a source-control diff. §15 correctly puts it in `.u8g2gl-editor.json`.

Sample data fails that test in both directions. *Longest plausible* is a **shared engineering judgement about the product** — the longest station name the departures board must survive is a fact about the deployment, not a preference. Two developers disagreeing about it is a disagreement to resolve in review, not to paper over with separate files. Put it in a sidecar and the layout one developer verified is not the layout another verifies, with nothing in the diff to show why.

**"Never compiled" was the wrong criterion.** Comments are never compiled and belong in the file. What generated output excludes has no bearing on what version control should carry.

It is also coupled to `globals.xml` — every sample value names a subject — so renaming a subject must update both, and the validator must flag a sample naming a subject that no longer exists. Coupled documents that travel together belong together.

**Consequence:** `[UD-6]` (design-time only, never compiled) is unaffected and remains true. What changes is location, and `ui_spec.md` §15's sample-data row moves from *Must add ([U-6])* to a settled schema addition.

### 4.4 The path

1. **Switch** the active set from the toolbar, or cycle by keyboard.
2. **The canvas re-renders.** This re-enters §4.1 at **step 7** only — the scene description is unchanged, and only the values handed to the Wasm runtime differ. No parse, no validate, no resolve. It should be visibly instant; anything slower makes sweeping four sets feel like four separate operations rather than one comparison.
3. **Inspect.** Overflow, truncation and scroll behaviour differ per set. Problems rows that are data-dependent update with the set.
4. **Repeat** across sets.

### 4.5 `[FD-10]` Compare mode — proposed, not decided

**A mode rendering the current screen against every sample set at once, stacked vertically.**

Cycling shows one set at a time, which means the comparison happens in the user's memory. The question being asked is *"does this layout survive all four?"* — a question about the set, answered badly by a sequence. Four 256×64 panels stack in roughly the height of one 128×64 panel at 4×, so the canvas can afford it.

The cost is genuinely low: §4.1 step 7 already takes the sample set as an input, so this is running the last step four times with different inputs. No new pipeline, no new architecture.

Marked as a proposal rather than a decision because it adds a canvas mode, and `design_spec.md` §1.5 makes omission the default — this should earn inclusion from someone using the tool, not from someone writing this paragraph.

### 4.6 States

| State | Behaviour |
|---|---|
| **No sample sets** | Canvas renders placeholders for every bound element, with a single prominent *Create sample sets* action offering the four conventional ones. A canvas full of placeholders with no explanation is the worst first impression the tool can make |
| **Set exists, subject missing a value** | Placeholder for that element only (§11). The omission is visible rather than silent |
| **Sample names a deleted subject** | Validator raises it against `samples.xml`. The value is kept, not dropped — a rename is more likely than a deletion, and discarding the value makes the rename lossy |
| **Collection with zero rows** | The *empty* set must mean empty collections too, not merely empty strings. An empty list is a layout case in its own right and a common one |
| **Collection over declared capacity** | Sample rows beyond the declared `max_rows` are not rendered, and the excess is warned. At runtime `add_row()` simply returns `false` past capacity ([design_spec.md §9.2](design_spec.md)) — silently, from the display's point of view — so the design-time preview must show the same truncation the device would, not a fuller list the hardware cannot hold |

### 4.7 What this flow proves

`[U-6]` is closed. The general rule extracted — *sidecar is for what two developers would legitimately disagree about* — is reusable, and should settle the next question of its kind without another round.

---

## 5. Coverage walkthrough — F1, F4, F5, F7, F8

Not worked in full. The purpose here is to catch a missed state or an unspecified surface, and each of the five produced at least one.

### 5.1 F1 · Lay out a screen

> Open project → select screen → drag widgets from palette to canvas → position → set properties → save.

**`[FD-11]` The palette must fill required properties on drop.** `u8g2gl_scrolling_label`'s manifest marks `font` as `required="true"` with no default. Dropping one therefore produces an immediately invalid document, and the user's first act in the tool generates an error they did not cause. The palette must fill required props from project defaults — the first declared font — and where no default exists, say so at the point of the drop rather than emitting a broken element.

This is `ui_spec.md` §15's missing *palette metadata* doing real work. It was listed there as display name, category and icon — cosmetic framing. Default-fill is the part that matters.

Also unspecified: drop position (pointer, snapped to tile?), default size, and the generated `name`. `[U-1]` settled that the editor generates and persists names; the palette is where most names originate, so the scheme's quality is mostly determined here.

### 5.2 F4 · Build and fix

> Continuous validation; build on demand. Errors as squiggles and Problems rows; click a row → land on the fault.

**Missed state: diagnostics with no location.** Over-budget RAM, a missing toolchain, a failed font compilation — none has a file, line or column, but `ui_spec.md` §13 specifies Problems rows as *severity, file, line, column, message, suggestion*. A row that cannot be clicked to navigate needs a defined presentation, or it looks broken.

Also unspecified: whether a build is blocked while Problems contains errors, and what the canvas shows during a build — F4 is the only flow with a meaningfully long-running operation.

### 5.3 F5 · Design an element

> Open element → edit in isolation against `<previews>` → set prop defaults → see what a consumer gets.
>
> **Not yet worked.** [D-18] changed this flow's subject matter materially — a composite is now a real container with its own bounds, so the flow must settle how resizing an element in its preview interacts with its children's anchors, and what the gallery shows when a `<view>` and a C++ class are both present.

**This flow cannot be executed at all today.** `<previews>` does not exist in schema 0.3 — confirmed: zero of the seventeen manifests carry it. F5 is blocked on a schema addition, not on editor work, and `ui_spec.md` §15 already lists it. Worth stating plainly that a listed flow is currently unreachable.

### 5.4 F7 · Wire navigation

> In the flow view, drag from a focusable element to a screen; the `<screen_load_event>` is written.

**Missed branch: the source element is not focusable.** [design_spec.md §12.2](design_spec.md) governs the focus ring; a `<screen_load_event>` on an unfocusable element can never fire. The flow view must either refuse the drag with a reason or offer to make the element focusable — silently writing an event that cannot fire is the worst of the three.

### 5.5 F8 · Work with fonts

> Browse glyphs, check metrics, measure whether a string fits a width.

**`[FD-12]` The string ruler should measure sample values, not only typed text.** `ui_spec.md` §12 describes the ruler as *type a string, see its width*. But the string the layout must survive is not one the user invents at the ruler — it is the *longest plausible* value already recorded in `samples.xml` (`[FD-9]`). The ruler should offer the bound subject's sample values directly, so the question becomes *"does the real worst case fit?"* rather than *"does this thing I just typed fit?"*

F8 and F6 are the same question asked from two surfaces. Connecting them costs a dropdown.

---

## 6. Cross-cutting findings

Three things emerged from more than one flow, which is usually the signal that they are structural rather than local.

**The panel is not a flat property list.** F3 needs repeated-child groups (`[FD-8]`); F3 needs several manifest entries collapsed into one control (`[FD-7]`); F1 needs default-fill on insert (`[FD-11]`). `[UD-5]` says the panel is generated from manifests, which remains true, but generation needs **rules**, and the manifests need to describe more than a flat list of props.

**The editor session is multi-document.** F3 edits `globals.xml` from a screen's panel; F6 reads `samples.xml`; F8 crosses into sample data. `ui_spec.md` §4 diagrams one CST and §14 excludes cross-file undo. Both need revisiting — narrowly, for atomic cross-document edit groups, not for a general cross-file undo stack.

**Authored structure must survive editing.** `[FD-4]` (expressions are not overwritten by a nudge), F3's dangling binding, F6's sample naming a deleted subject — the same principle each time. `ui_spec.md` principle 5 states it for formatting and comments; these flows show it applies equally to constants, anchors and cross-document references. **The editor's default on encountering something it cannot safely edit is to preserve it and explain, never to normalise it away.**

---

## 7. State inventory — the artboard list

Every distinct visual state named above. This is the input to the design phase; artboards should be drawn from this list rather than from a fresh reading of the flows.

### Property panel — the differentiator, most artboards

| # | State | Why it needs drawing |
|---|---|---|
| 1 | Default, populated | The baseline. **15–21 controls** — `u8g2gl_obj` contributes 14, widgets add 1–7 — each with an inline description per §9.2. Whether this is usable at all is the single biggest open question in the design |
| 2 | Groups with Advanced collapsed | The only mitigation for 1, and the reason `group=` is load-bearing rather than cosmetic |
| 3 | Multi-selection, mixed values | §9.4 |
| 4 | Constraint-disabled control | `text` greyed because `bind_text` is set, with its explanation |
| 5 | Capacity showing memory cost | `max_rows 16 → 2.3 KB`. §9.2's "consequence where incurred" |
| 6 | Font selected, with feedback | Pixel height, glyph coverage, width warning |
| 7 | Validation error inline | Invalid format string, as typed |
| 8 | Binding: no subjects exist | `[FD-5]` — the declare affordance |
| 9 | Binding: none compatible | Greyed list with the reason |
| 10 | Binding: dangling subject | Struck through, re-bind offered |
| 11 | Conditional group | `[FD-8]` — repeated children with add/remove |
| 12 | Expression-valued field | `[FD-4]` — greyed with override affordance |
| 13 | Tier-4 widget, read-only | `<api>` and preview only; must read as deliberate, not broken |

### Canvas

| # | State |
|---|---|
| 14 | Selection with handles and live badge |
| 15 | Alignment guides during drag (snapping) |
| 16 | Alignment guides during nudge (`[FD-3]` — indicating, not snapping) |
| 17 | Multi-selection with bounding box |
| 18 | Out-of-bounds hatching |
| 19 | Degraded render — last good frame, dimmed |
| 20 | Placeholder rendering for missing sample values |
| 21 | Pixel grid at 4×; tile grid toggled |
| 22 | Compare mode — `[FD-10]`, if adopted |

### Empty and first-run — absent from `ui_spec.md` entirely

| # | State |
|---|---|
| 23 | No project open |
| 24 | Project with no screens |
| 25 | Screen with no elements |
| 26 | No sample sets — placeholders everywhere, with the create action |
| 27 | No fonts declared |

### Other surfaces

| # | State |
|---|---|
| 28 | Problems: mixed severities, navigable |
| 29 | Problems: diagnostic with no location (§5.2) |
| 30 | Build in progress |
| 31 | Budget panel, over-budget item highlighted |
| 32 | Flow view: screens and edges |
| 33 | Flow view: refused drag from unfocusable element |
| 34 | Font browser with string ruler measuring a sample value (`[FD-12]`) |

**34 states.** Per the phase plan, the property panel (1–13) takes one canvas, canvas states (14–22) a second, and empty/first-run (23–27) a third. 28–34 are conventional and can be specified in prose.

---

## 8. Schema and architecture deltas

What these flows proved is needed, beyond `ui_spec.md` §15's nine. **Nothing here is a decision to implement** — this is the triage list for the owner.

| # | Delta | From | Kind | Note |
|---|---|---|---|---|
| 1 | `group=` on `<prop>` | §7 state 1 | Schema | Already in §15. **Now known to be load-bearing** — 15–21 props per panel makes grouping the difference between usable and not |
| 2 | Manifests declare acceptable child elements | `[FD-8]` | Schema | `bind_flag_if_*`, `event_cb`. Not in §15 — the panel was conceived as attributes only |
| 3 | Panel generation rules in `[UD-5]` | `[FD-7]`, `[FD-8]`, `[FD-11]` | Spec | Collapse rule, repeated-child rendering, default-fill. `[UD-5]` names a data source but no rules |
| 4 | Palette default-fill for required props | `[FD-11]` | Schema | Reframes §15's palette metadata from cosmetic to functional |
| 5 | `samples.xml` as a project document | `[FD-9]` | Schema | **Closes `[U-6]`.** §15's sample-data row becomes settled |
| 6 | Multi-document CST session | `[FD-5]` | Architecture | `ui_spec.md` §4 diagrams one CST |
| 7 | Cross-document atomic edit groups | `[FD-6]` | Architecture | **`ui_spec.md` §14 currently excludes this.** Narrower than general cross-file undo |
| 8 | Resolver exposes the dependency graph | `[FD-2]` | PR-04 API | Needed for the nudge fast path's correctness condition. A PR-04 requirement, found by drawing a flow |
| 9 | Editor contract for expression-valued attributes | `[FD-4]` | Spec | Neither document covers what editing does to `#const` and anchors |
| 10 | Presentation for location-free diagnostics | §5.2 | Spec | §13's Problems row assumes file, line, column |

Items 6, 7 and 8 are architectural and the most expensive to retrofit. Item 7 contradicts a standing exclusion and needs an explicit decision rather than quiet erosion.

---

## 9. Questions raised

| ID | Question | Blocks |
|---|---|---|
| **FQ-1** | What does *dragging* an expression-valued element do? Refusing a keypress is cheap (`[FD-4]`); refusing a drag is harsher, since drag carries no expectation of exactness | Canvas artboards |
| **FQ-2** | Does `Tab` move to the next element in document order? Conventional, and useful in a flat document — but it collides with focus traversal between panes | F2 artboards |
| **FQ-3** | Is a build blocked while Problems contains errors, or attempted and failed? | F4 |
| **FQ-4** | Is compare mode (`[FD-10]`) adopted? Deliberately left to someone using the tool | F6 artboards |

---

## 10. What happens next

1. **Owner triage of §8.** Items 6, 7 and 8 are architectural; item 7 contradicts a standing exclusion in `ui_spec.md` §14.
2. **Promote the settled ones.** `[FD-9]` closes `[U-6]` and belongs in `ui_spec.md` §15 and §16. The `[FD-n]` decisions that survive triage move into `ui_spec.md` as `[UD-n]` or into its flow section.
3. **Build the grounding pack** — device screenshots for the canvas region, reference captures for the chrome, the 17 real manifests for panel content.
4. **Seed design system**, then draw §7's states across three canvases.
