# [D-18] One Element Vocabulary — the widget tiers are collapsed

**Status**: Decided
**Date**: 2026-09-11
**Supersedes**: [D-6] (partially — see below), §6's four-tier model, §13.5's demotion conditions
**Decision**: There is one kind of thing in a U8G2GL document — an **element**.
Whether an instance becomes a C++ object or a sequence of draw calls is a
**generator outcome**, never an authoring category.

## Context

§6 defined four tiers: static primitives, built-in widgets, pure-XML components,
and custom C++ widgets. Three separate conversations converged on the same
finding — the tiers describe *the generator's output*, and that leaked into the
author's vocabulary.

1. **Components** (Tier 3) produce no runtime construct. §13.6 inlines them by
   textual substitution and deletes them, so a component has no box, no clip
   window, no state, no tick, and nothing to attach hand-written behaviour to.
   §13.12's own worked example emits `U8G2GL_NO_PARENT` for every child of a
   component instance.
2. **Primitives** (Tier 1) are "always inlined" while widgets are "inlined if
   they qualify" (§13.5). Those are the same mechanism with different defaults.
   Primitives also cannot be bound at all, so hiding a separator on a flag —
   an ordinary thing to want — is impossible.
3. **Static demotion** (§13.5) can no longer fire. Its first condition is "the
   element has no `name`", and [U-1] made `name` mandatory. The justification
   for deleting `<u8g2gl_text>` depends on demotion working, so that promise is
   currently unkept.

## Decision

**One vocabulary of elements.** Every element — a line, a label, a composite, a
custom C++ widget — is declared by an `<api>` manifest and instantiated by its
tag. Two axes remain, and neither is a tier:

| Axis | Values | Visible to the author? |
|---|---|---|
| **Who wrote it** | framework / user | Only as a folder location |
| **How an instance is realised** | object / draw calls | No — reported in the §18 budget |

### The realisation rule

> An element gets an **object** if and only if it must remember something
> between frames, or something must hold a reference to it — a focus ring, an
> event, or a parent composite's child pointer. Otherwise it compiles to draw
> calls.

This one sentence replaces the Tier 1 / Tier 2 split, §13.5's six demotion
conditions, `animated="false"`, and the hardcoded `TIER1_PRIMITIVES` set in the
validator. **Demotion stops being a rule and becomes the default**; an object is
the exception an element earns.

### Composites are real objects

A composite element (what earlier drafts called a component) instantiates a container
object with real `x`/`y`/`w`/`h` and real children. This costs one base object
per instance — `u8g2gl_obj` is 64 bytes on a 64-bit host, approximately 40 on a
32-bit target — against a floor of ESP32 with 16 KB usable RAM ([D-1]).

The runtime already supports this: `parent_index_` has been a member of
`u8g2gl_obj` since PR-01, and §13.3's flat-array-with-parent-index tree is built
and merged. Inlining was the only thing discarding the hierarchy.

### Primitives get no classes

Bindable primitives do **not** become classes. The runtime exposes **free draw
functions** — `u8g2gl_draw_box(U8G2&, x, y, w, h, filled, radius)` — called
directly by generated firmware code *and* by the editor target's draw-by-name
table. One implementation serves both, which is what [D-9] requires and what a
per-primitive class could not have given.

A manifest therefore declares either a `draw=` target (a free function) or a
`setter=` target (a class method). Today both spellings are `setter=`, meaning
two different things — that ambiguity is resolved by this decision.

## What [D-6] retains and what it loses

[D-6] rejected *runtime string lookup* — `get_element(self, "fill")` — inside a
framework whose premise is build-time resolution. **That rejection stands and is
not weakened.**

What is withdrawn is [D-6]'s blanket conclusion that a C++ widget may not
compose named sub-elements at all. It may: the generator emits **typed member
pointers** resolved at build time. No string lookup, no runtime dispatch, no
untyped access. [D-6]'s target survives; its over-broad phrasing does not.

## Consequences

- **Schema 0.4.** `components/` and the `<component>` element are removed; a
  composite is a widget with a `<view>`. Breaking, so §15.4 requires the CLI to
  refuse 0.3 with a specific migration message.
- **§13.6 component inlining is deleted.** Inlining survives only as an
  unobservable generator optimisation under the realisation rule.
- **The `ComponentProp` / `PropDef` split disappears**, taking with it the
  missing `help` field on component props — which [ui_spec.md §9](../ui_spec.md)
  calls the editor's differentiator.
- **Cycle detection and nested-tag validation become one code path** rather than
  two, closing two gaps that exist today (a component may instantiate itself,
  and a misspelled tag inside a component passes validation).
- **The component box is defined.** `right`, `bottom`, `hcenter` and `vcenter`
  inside a composite resolve against the container, because the container now
  exists. See [D-20].
- **Composites get framework clipping** (§11.3) like any other object.
- **The editor's "editable vs preview-only" split narrows** to its real cause:
  an element with a `<view>` is editable; one whose rendering is C++ is not.

## Cost accepted

- Roughly 40 bytes per composite instance on a 32-bit target. Reported in §18.
- [D-6] and §6 require rewriting, and the four-tier vocabulary appears
  throughout the documentation set.
- The decision is taken at PR-04's doorstep. This is deliberate: the inliner
  does not exist yet, only the schema model and parser touch components, and no
  user XML exists in the field. It is the cheapest moment this change will ever
  have.

## Amendment — 2026-09-13: classed elements are not yet demoted in PR-04

**The realisation rule is unchanged.** What changes is how much of it the first
generator delivers.

PR-04 applies the rule fully to elements declared only with `draw=`, which
compile to draw calls. **Elements backed by a class are always realised as
objects for now**, even when the rule says they need not be — a static label with
no bindings and no references, for example.

The reason is that demoting a classed element needs two things that do not yet
exist:

- Per-property knowledge of which values require state between frames.
  `long_mode="scroll"` does; `long_mode="clip"` does not. The manifest cannot
  currently express that difference, and adding it is new vocabulary — a
  schema-minor change reserved to the owner.
- A stateless `u8g2gl_draw_label` to demote to.

**Deferred under §1.5: a feature is added when need is shown, not predicted.**
The cost is known and visible — a static label is an 80-byte object on a 64-bit
host, rather than no object at all. §18's budget report must state explicitly
that classed-element demotion is not yet delivered, so nobody reads the report as
the rule's full saving.

**Trigger to deliver:** gate criterion 3 (the measured budget on `esp32dev`)
showing that object overhead matters, or measured pressure on a real screen.

This follows the same pattern as [D-21]'s interim binding default: the decision
stays in force, the gap in the implementation is written down with its cost, and
nothing relies on the gap going unnoticed.
