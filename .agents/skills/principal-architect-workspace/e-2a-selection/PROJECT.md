# E-2a: Selection, and the Scene's Ranges

**Parent:** E-2 ([e-2-canvas-editing/PROJECT.md](../e-2-canvas-editing/PROJECT.md)), whose
owner approval (2026-10-28) covers this PR's scope as its first row. **Base:** `main` @
`fd717b1`. **Worktree:** `../U8G2GL-e2a`.

## Purpose

Everything E-2b and E-2c edit, they edit **the selection**. E-2a makes the selection exist,
in both directions, honestly, and makes the canvas say when it cannot be trusted (§3.8) — before
anything writes to the text.

## Decomposition

| WO | Topic | Branch | Status |
|---|---|---|---|
| WO1 | Scene `source` gains a range; CLI 0.13.4 | `u8g2gl-e2a/wo1-scene-range` | ⏳ |
| WO2 | The selection model; canvas → XML and XML → canvas | `u8g2gl-e2a/wo2-selection` | ⏳ |
| WO3 | Canvas overlays: handles, badge, marquee; status-bar geometry | `u8g2gl-e2a/wo3-overlays` | ⏳ |
| WO4 | §3.8 document states: hatching, the dimmed last good frame, editing-enabled | `u8g2gl-e2a/wo4-states` | ⏳ |
| WO5 | Readability review and PA verification | `u8g2gl-e2a/wo5-readability` | ⏳ |

## PA rulings

1. **The range is additive.** `source` keeps `file`, `line`, `column` and gains `start` and
   `end`: offsets of the element's whole range in the file's text, as the CST reports them.
   Every generator golden moves, so CLI 0.13.3 → 0.13.4 (rule 03); CI's determinism condition
   is then satisfied by the bump. The C++ runtime and the Wasm bridge do not read `source`; if
   either does, stop and report.
2. **Selection is a set of element names**, held in one observable outside React (as the
   pipeline's state is). It is never stored as offsets: after each pipeline run the names are
   looked up in the new scene and the new CST. A name no longer present drops out; a **rename**
   keeps the selection when the edit that removed the old name added a new one at the same
   element (same CST element by range after `applyEdits`'s mapping), which is EDITOR-DESIGN
   §3.7's "a rename is an edit like any other".
3. **Hit-testing uses the scene's rectangles**, topmost first in document order reversed.
   Repeated clicks on the same point cycle down through overlaps; a click elsewhere resets the
   cycle. Marquee selects elements whose rectangle intersects it. Esc clears. A composite's
   child is never selected: the hit resolves to its instance (ui_spec §8).
4. **Canvas → XML reveals and decorates without focus.** Monaco's `revealRangeInCenterIfOutsideViewport`
   and a decoration; `editor.focus()` is never called by selection. **XML → canvas** reuses
   `documents/element-at.ts` (the innermost named element containing the caret). Typing that
   keeps the caret inside the element does not change the selection.
5. **Neither direction edits the document.** A test asserts the model's version id is unchanged
   across every selection gesture.
6. **The per-frame rule (EDITOR-DESIGN §3.3) starts here.** Selection changes re-render only the
   overlay, the status bar's geometry and (later) the panel; no other React component. The
   keystroke gate from E-1e must still pass, its self-test included.
7. **§3.8.** *Invalid but buildable:* elements a diagnostic falls inside (by CST range) are
   drawn hatched on the canvas overlay, not in the framebuffer. *Invalid and unbuildable,* or
   *not well-formed:* the last good frame, dimmed; not well-formed also shows the banner *XML not
   well-formed at L:C*. The pipeline exposes `canvasEditing: boolean` (false only when not
   well-formed) for E-2b to read; nothing in E-2a writes text.
8. **Boundary:** `cli/src/core/generator/emit/scene.ts` and its goldens, the version files,
   `designer/src/` and `designer/e2e/`, and their tests. No CST change unless WO2's rename rule
   needs one (then additive, with tests). No new dependency (programme ruling 2).

## Status log

- **2026-10-28.** Worktree created from `main` @ `fd717b1`, `extern/u8g2` checked out. WO1–WO5
  issued to one worker in order.
