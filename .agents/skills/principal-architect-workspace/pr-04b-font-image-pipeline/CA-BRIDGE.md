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

## 2. `<convert>` with a PNG whose size differs from the declared size

§14.2 gives `width` and `height` but doesn't say whether they *resize* or
*declare*. **PA default: refuse a mismatch**, naming both sizes. Reason: any
resampling filter is a new design commitment (and a determinism surface),
§1.5 says omit until needed, and a refusal can become a resize later without
breaking anyone. **Question:** is that the reading you intended, or should
the spec say the attributes resize — and with which filter?

## 3. Polarity and transparency in `<convert>`

**PA default:** a pixel darker than `threshold` sets the XBM bit (drawn in the
foreground colour); transparency is composited over white, so a transparent
pixel stays clear. This is ImageMagick's convention and suits dark-on-light
icon art. **Question:** confirm, and consider stating it in §14.2 — it is
visible in the editor's side-by-side preview (ui_spec §12), so the designer
and the CLI must agree, and a sentence in the spec is what makes them agree.

## 4. The committed Wasm artefact

**PA decision:** the built Wasm is committed, like `catalogue.json`, with
provenance and a test that its U8G2 commit matches the catalogue's and the
submodule's. This keeps Emscripten out of every CLI build and test. The cost
is a ~60–80 KB binary in the repo that changes only when U8G2 or Emscripten is
bumped. Flagging it because it is a new kind of committed artefact.

## 5. `range` grammar

`<bdf range>` is documented as `"0x20-0x7F"` but never specified. WO2 validates
it and translates it to bdfconv's `-m`. **PA default:** accept exactly what
bdfconv's `-m` accepts for simple ranges (comma-separated codepoints and
`a-b` ranges, hex or decimal), with a named error for anything else. The
spec should state the grammar — say whether you want the full bdfconv
mapping language (it has `>` remapping and `~` exclusion) or only this
subset. Subset is the §1.5 default.

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
