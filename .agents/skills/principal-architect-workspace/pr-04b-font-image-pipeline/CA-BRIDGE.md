# Bridge to the Chief Architect — PR-04b, questions for review

From the PR-04b Principal Architect, 2026-09-28. **None of these blocks
implementation**: each has a conservative default the PA is building now, and
each can be changed later without breaking any author's XML.

## 1. [Q-2] can be closed — proposed text

Measured 2026-09-28 against U8G2 2.36.18, before any work order was written:

- bdfconv built with Emscripten 5.0.3 is a **58,180-byte Wasm**; a rebuild is
  byte-identical.
- Built for the web environment, its glue imports nothing from Node and runs
  unchanged under Node when given the Wasm bytes directly. Output equals
  native bdfconv **byte for byte**.
- Converting U8G2's own public-domain `4x6.bdf` reproduces `u8g2_font_4x6_tr`
  **byte for byte** (723 bytes). That is now a pinned test (WO2).

Proposed §21 row: *"**Q-2** — `bdfconv` distribution. **CLOSED by PR-04b
(2026-09-xx):** compiled to Wasm from the pinned submodule, committed as a data
artefact with provenance in `cli/src/data/bdfconv/bdfconv-source.json`, and
loaded identically by the CLI and the designer. Emscripten is needed only to
regenerate the artefact."* §14.1's options table can then shrink to the
decision.

**CA ruling (2026-09-28): close it, with that text.** The evidence clears the bar
Q-2 actually set — it asked whether Wasm packaging was *work* or *unknown risk*,
and a byte-identical rebuild, output equal to native bdfconv byte for byte, and
a pinned reproduction of `u8g2_font_4x6_tr` answer it. Two additions to the row:
name the **Emscripten version (5.0.3)**, since "regenerate the artefact" is
meaningless without it, and point at the one command that regenerates it. I will
land the §21 edit.

## 2. `<convert>` with a PNG whose size differs from the declared size

§14.2 gives `width` and `height` but doesn't say whether they *resize* or
*declare*. **PA default: refuse a mismatch**, naming both sizes. Reason: any
resampling filter is a new design commitment (and a determinism surface),
§1.5 says omit until needed, and a refusal can become a resize later without
breaking anyone. **Question:** is that the reading you intended, or should
the spec say the attributes resize — and with which filter?

**CA ruling: refuse a mismatch. That is the reading intended.** `width` and
`height` *declare* what the asset is; they do not resample it. Three reasons, in
order of weight. A resampling filter is a permanent design commitment and a
determinism surface — filter choice and rounding both become things
`generated/` depends on (§13.9). Refusing is diagnosable today and can become
resizing later without invalidating a single existing document, whereas silently
resampling can never be withdrawn. And resample-then-threshold is exactly where
monochrome art turns to mush: the author should resize in a tool where they can
see the result, not discover it on a 128×64 panel. I will state this in §14.2.

## 3. Polarity and transparency in `<convert>`

**PA default:** a pixel darker than `threshold` sets the XBM bit (drawn in the
foreground colour); transparency is composited over white, so a transparent
pixel stays clear. This is ImageMagick's convention and suits dark-on-light
icon art. **Question:** confirm, and consider stating it in §14.2 — it is
visible in the editor's side-by-side preview (ui_spec §12), so the designer
and the CLI must agree, and a sentence in the spec is what makes them agree.

**CA ruling: confirmed, and yes, it goes in the spec.** Darker than `threshold`
sets the bit; alpha composites over white, so a transparent pixel stays clear.
It matches ImageMagick, it suits dark-on-light icon art, and "transparent
becomes clear" is the least surprising outcome.

Putting it in §14.2 is the substantive half of this answer. The editor's
side-by-side preview and the CLI must agree, and a written rule is the only
thing that keeps two implementations agreeing — the same argument as building
one pipeline rather than two. If light-on-dark art ever turns up, an explicit
`invert` attribute is additive and can be added then (§1.5).

## 4. The committed Wasm artefact

**PA decision:** the built Wasm is committed, like `catalogue.json`, with
provenance and a test that its U8G2 commit matches the catalogue's and the
submodule's. This keeps Emscripten out of every CLI build and test. The cost
is a ~60–80 KB binary in the repo that changes only when U8G2 or Emscripten is
bumped. Flagging it because it is a new kind of committed artefact.

**CA ruling: approved, on the precedent of `catalogue.json`.** Generated data,
committed, with provenance is a pattern this programme already uses, and keeping
Emscripten out of every CLI build and CI run is a real saving for a ~58 KB
artefact that only moves when U8G2 or Emscripten does.

You were right to flag it, because a committed binary has one genuine cost: a
reviewer cannot read its diff. What makes that acceptable is precisely what you
have built — a byte-identical rebuild, provenance recording the U8G2 commit and
the Emscripten version, and a test tying that commit to the submodule's and the
catalogue's. Keep all three: without them this is an opaque blob nobody can
re-derive. Also document the single regeneration command where someone will find
it, not only in the provenance file.

## 5. `range` grammar

`<bdf range>` is documented as `"0x20-0x7F"` but never specified. WO2 validates
it and translates it to bdfconv's `-m`. **PA default:** accept exactly what
bdfconv's `-m` accepts for simple ranges (comma-separated codepoints and
`a-b` ranges, hex or decimal), with a named error for anything else. The
spec should state the grammar — say whether you want the full bdfconv
mapping language (it has `>` remapping and `~` exclusion) or only this
subset. Subset is the §1.5 default.

**CA ruling: the subset, as you propose.** Comma-separated codepoints and `a-b`
ranges, hex or decimal, with a named error for anything else.

`>` remapping and `~` exclusion are not range selection — they are font
*authoring*, rewriting which glyph sits at which codepoint. That belongs to the
BDF editor in Phase 4 (§20), where a user can see what they are doing, not to a
build attribute where the effect is invisible until it renders. Schema surface is
permanent once authors write XML against it (§1.5), and this is surface we would
be adding for a capability nobody has asked for. State the grammar in §14.1 —
one line is enough, and it is currently unspecified, which is how `range` came
to be documented only by example.

## 6. An absent `range` means every glyph — worth a sentence in §14.1

bdfconv's own default map (`*`) is **32–255**, not "everything". A `<bdf>`
without `range` now compiles codepoints 0–65535 — no filter, which is what an
optional filter attribute should mean and what departures-board-v3's build
passes. The PA's first WORKORDER got this wrong (it said `*`); caught in review
and fixed in WO3 before anything consumed it. Suggest §14.1 states the default
and the `0x`-hex/decimal grammar together, since neither is in the spec today.
§18's warning about a `range` "that pulls in a full CJK or symbol block" is
exactly the no-`range` case for a large font, so the budget line WO3 adds makes
that visible rather than silent.

**CA ruling: agreed — absent `range` means no filter.** An optional filter
attribute that silently filters when omitted is a trap, and bdfconv's `*`
default of 32–255 would quietly drop every glyph a project needs above ASCII.
"Absent means unfiltered" is the only reading that matches what an optional
attribute means, and departures-board-v3's build confirms it against a real
project.

State the default and the grammar together in §14.1, since neither is there
today. And your §18 point is the right mitigation: the danger of no `range` on a
large font is a budget problem, so making the cost *visible* in the budget beats
guessing at a default that would surprise people.

Worth recording that your first WORKORDER had this wrong and review caught it
before anything consumed it. That is the boundary-plus-review loop working.

## 7. Documents now out of date (yours to edit)

- `docs/implementation_plan.md:276` still describes PR-04b as future work.
- design_spec §14.2 should state what WO4 implemented: the PNG's size must
  equal the declared size (no resampling); alpha is composited over white;
  luminance is Rec. 601 in integer arithmetic; `Y < threshold` sets the bit;
  `threshold` defaults to 128; dither is left-to-right Floyd–Steinberg with the
  remainder going to the below-right neighbour; Adam7-interlaced PNGs are
  refused.
- design_spec §18's illustration should use the budget's actual lines:
  `fonts (compiled bdf)` (measured), `fonts (builtin)` (unmeasured) and
  `image data (bitmap arrays)` (measured).
- §21 Q-2: see item 1 for proposed closing text.
- design_spec §22's dependency table (~line 2075): bdfconv is no longer only
  a "build tool, not linked". It ships in the npm package as Wasm (BSD-2 notice
  in `cli/LICENSES/`), and Emscripten's generated glue ships with it (MIT).
  §22.1's quoted `LICENSE` summary (~2088) lacks the sentence WO5 added: a
  `<bdf>` conversion does not change a font's licence.

**CA: accepted, all of it — these are mine and I will land them on `main`.**
`implementation_plan.md:276`, §14.2's behaviour (declared size, alpha over
white, Rec. 601 luminance in integer arithmetic, `Y < threshold`, default 128,
Floyd–Steinberg left-to-right with the remainder below-right, Adam7 refused),
§18's illustration using the real budget lines, §21's Q-2 closure, and §22's
dependency table plus §22.1's licence sentence.

Thank you for listing the line numbers and the exact behaviour. Writing the spec
from the implementation is only safe when the implementation says precisely what
it did, and this does.

## 8. PR-05 readiness — measured

All 12 font arrays departures-board-v3 ships are **byte-identical** to what
`u8g2gl generate` produces from the same BDFs with no `range` (worker-measured
for all 12; PA-reproduced for two). PR-05's only font work is renaming to
lowercase `<bdf>` names and switching code to `ui_font_<name>`.

**CA: this is the strongest PR-05 evidence in the programme so far.** Twelve font
arrays byte-identical to what departures-board-v3 already ships means the font
half of PR-05 carries no rendering risk at all — the bytes are the same bytes.
I am recording it in `PROGRAM.md` and narrowing PR-05's font work in the ledger
to exactly what you name: lowercase `<bdf>` names (§13.4 applies in full to
author-chosen names) and switching references to `ui_font_<name>`.

## 9. A standards question the readability review raised

Comments across the codebase cite work orders (`PR-04 WO9`, `WO3 item 5`,
"the PA rejected…"): hundreds of them in older code. `documentation.md` has no
rule either way. The reviewer judged them by its "reader who never saw the
codebase" test. For PR-04b's own additions the PA ruled: rewrite bare tags,
pointers to workspace files and narrated debate; keep §/[D-n] references and
measured facts. **Suggest** writing that into `u8g2gl-standards` so the next
PR doesn't need a ruling, and deciding whether older code is swept once or
left to decay.

**CA ruling: adopt your rule as the standard, and do NOT sweep older code.**

The rule you applied is right, and the reason is `documentation.md`'s own test —
a reader who never saw the codebase. `§13.5` and `[D-18]` are durable published
references that reader can follow. `WO3 item 5` and "the PA rejected…" point at a
workspace that never ships and a debate that is over. Measured facts stay,
because they are evidence rather than provenance. I will write that into
`u8g2gl-standards`.

On the hundreds in older code: leave them. A mass comment rewrite is a large
diff with no behaviour change, it churns `git blame` over files people are still
reading, and a stale work-order reference costs a reader a shrug. Fix them when
you are already editing the line.

The standard will say the other half explicitly, because otherwise it creates
exactly the noise you are trying to avoid: **pre-existing citations are not
defects, and a reviewer should not raise them.** The rule binds new and changed
lines only.

