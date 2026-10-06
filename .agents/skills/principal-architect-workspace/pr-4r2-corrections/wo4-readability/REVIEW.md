---
name: pr-4r2-wo4-readability-review
description: Readability and documentation findings for PR-4R2, as WORKORDER checklist items
complexity: mechanical
---

# PR-4R2 WO4 — Readability Review

**Scope reviewed:** `86d3f89..HEAD` on `u8g2gl-4r2/wo4-readability`, excluding `.agents/`, `cli/src/data/manifests.json`, `test/generated_fixture/generated*/**` and `cli/package-lock.json`. 28 files, judged on added and changed lines.
**Reviewed:** 2026-10-06
**Standards:** `u8g2gl-standards` (SKILL.md, cpp.md, typescript.md, documentation.md incl. §4.1)

**Severity counts:** P1 0 · P2 2 · P3 3 · P4 3

## Result

No P1. The change is well documented: every new file has an SPDX header with a real `Purpose:`, every new function has a banner or Doxygen, multi-stage functions carry step breakdowns, and the new `u8g2gl_clip_scope` is a model of lifetime and failure-mode documentation. Pattern-match against `include/u8g2gl/u8g2gl_core.h:166-237` and `cli/src/core/validator/configured-radius.ts`.

**§4.1, half 1 (new or changed lines): clean.** I grepped every added line for `WO\d`, `PR-\d…`, `.agents`, `evidence/` and debate wording, then read all added comments. No bare work-order tags, workspace paths or narrated debate were added. The diff also removed one (`scene.ts` "PR-04 WO10b added `origin`"), which is the right behaviour.
**§4.1, half 2:** Pre-existing citations sitting next to changed lines (for example `screen.ts` Purpose block "WO8b", "WO9", "PR-04 WO11", "PR-04 WO4 F7"; `draw-args.ts` "WO10"; `validate-geometry.ts:44` "PR-4R WO3") are on untouched lines. They are not raised.

## Strict Boundary Box

No behaviour changes. Comments, doc text and one dead-code expression only. Do not touch generator output unless the architect approves item P3-3, because it moves goldens.

## Line-Item Instructions

### P2 — Stale documentation (misleads the next reader)

- [ ] `include/u8g2gl/u8g2gl_state_saver.h:21-23` (confirmed). Text: "The clip window. U8G2 has no clip getter. Clip lifetime belongs to u8g2gl_render_object(), which sets the clip, renders, and resets it to the full display." Clip set and reset now belongs to `u8g2gl_clip_scope` (`u8g2gl_core.h:206`), which `u8g2gl_render_object()` uses and a generated draw call also uses. Rule: documentation.md §5 item 6, stale docs. **Fix:** replace lines 21-23 with: "The clip window. U8G2 has no clip getter, so nothing can save and restore it. Clip lifetime belongs to u8g2gl_clip_scope (u8g2gl_core.h), which u8g2gl_render_object() declares after this saver so the clip resets to the full display before colour and font are restored." Lines 17 and 58 remain accurate.

- [ ] `include/u8g2gl/u8g2gl_draw.h:131-133` (confirmed, `@param radius` of `u8g2gl_draw_box`). Text: "A radius past `2r <= min(width, height)` is clamped down to that bound, not refused". The validator now refuses a literal over-bound radius at build time (`checkCornerRadius()`, `validate-geometry.ts:688`, code `U8G2GL_OUT_OF_BOUNDS`, §10), whether it is written as an attribute, an inline `style_radius` or a named style. Only a value the validator cannot see (bound, or unresolved) reaches the runtime clamp. Rule: documentation.md §5 item 6. **Fix:** change to: "A radius past `2r <= min(width, height)` is refused at build time when it and the size are literal (U8G2GL_OUT_OF_BOUNDS, §10); one that reaches here by another route is clamped down to that bound, not refused, and one that clamps to 0 (a 1-pixel side) draws square corners; see u8g2gl_coord_corner_radius()." Also apply to the same claim at `:118` ("its radius clamped to the box") by appending "(a literal over-bound radius is refused at build time, §10)", and to the table row at `:60-65` by adding the same note, so all three places agree.

### P3 — Consistency and documentation gaps

- [ ] `cli/src/core/generator/emit/screen.ts:23` — "Two rules are load-bearing" now heads three bullets (the diff added the clip-scope bullet at `:33-38` inside the list). Stale count. **Fix:** change "Two rules" to "Three rules".

- [ ] `cli/src/core/validator/validate-schema.ts:379, 390, 418` — step comments in `checkBindDeclarations` are written `// Step 1: …`. House format is `// --- Step N: <purpose> ---` (documentation.md §3). The function is new, so this is not a legacy style. **Fix:** rewrite as `// --- Step 1: Gather what the targets are ---`, `// --- Step 2: A binding the inherited chain already has fixes the name and types ---`, `// --- Step 3: Otherwise a drawing manifest's setter= names one of its props ---`. Move the detail lines (`:380-383`) to plain comments beneath.

- [ ] **Known item 3 — emitted render comment** (`cli/src/core/generator/emit/screen.ts:644-649`, confirmed). The generated comment says: "…so nothing paints outside its container and a hidden container hides its children (§11.3). A draw call has no object, so its visibility is the build-time guard (§13.5)." It is now incomplete rather than false, but it reads as "a draw call has no clip", which is wrong for a bound draw-call child of a container (it is drawn inside a `u8g2gl_clip_scope`, `:417`). A reader of `ui_screen_*.cpp` meets the `u8g2gl_clip_scope` line without the comment having prepared them for it; the per-call trailing comment ("`<container>`'s effective clip (§13.5)") is the only explanation. **Priority: P3, not P2.** The generated file stays correct and self-explaining at the point of use, and fixing the text moves every golden (`test/generated_fixture/generated*/ui_screen_*.cpp`, `cli/test/**` goldens), which per rules/03 needs a stated reason. **Decision for the owner:** if wanted, append one line to the comment array: `'    // A bound draw call inside a container is drawn inside that container\'s clip, as an object would be (§13.5).'` and regenerate goldens in the same commit. If not wanted, no action. No generator version bump beyond 0.10.0 is needed if it ships in this release; otherwise it is a determinism-affecting change (§13.9) and needs one.

### P4 — Optional, only if the architect approves

- [ ] `cli/test/validator/bind-type-paths.test.ts:49` — `.replace('<widget', '<widget').replace('<api>', '<api>')` replaces each string with itself. Dead code on a new line (readability, "dead code"). **Fix:** delete both `.replace(...)` calls.
- [ ] Over-long reflowed lines on changed text: `test/editor_host/editor_host.h:26` (the changed line runs far past the block's ~80 columns and leaves `:24-26` ragged), `test/test_bound_child_clip.cpp:23` ("…56, measured. The object cases are the control:"), and `cli/src/core/validator/validate-geometry.ts:43` ("…element is a drawing element or an object. Measured against the pinned U8G2"). **Fix:** re-wrap each paragraph at the block's existing width. No rule mandates a column limit, so this is taste.
- [ ] `cli/src/core/validator/validate-geometry.ts:688-697` — the banner comment is a nine-line paragraph that mixes contract and rationale. Could split into a banner plus a why-comment. Taste only.

## Verification Requirement

- [ ] `git diff` shows only comment, doc-string and (P4) dead-code changes; no behaviour.
- [ ] `cd cli && npx vitest run` — all pass, none weakened (and goldens unchanged unless P3-3 approved).
- [ ] CMake configure and `ctest` for the host build — zero warnings, all pass.

## Review Notes

**Known items:** all three confirmed with line numbers above. Items 1 and 2 are stale documentation (P2) because each states something the code no longer does. Item 3 is P3 and an owner decision.

**What I checked and found clean:** SPDX and truthful `File:` paths on new files (CLI files use the `src/…` / `test/…` path relative to `cli/`, matching the existing convention); exported-symbol lists updated in `draw-args.ts`, `scene.ts`, `core.h`; Doxygen on `u8g2gl_clip_scope` (lifetime, null handling, non-nesting, destruction state); banners in `src/u8g2gl_core.cpp` for the new ctor and dtor; step breakdowns in `u8g2gl_render_object()`; enum/naming (C++ `u8g2gl_clip_scope`, `u8g2gl_` snake case; TS camelCase) all correct for their language; no heap use, no `std::function` and no `String` in the added runtime code; trailing-underscore members `display_`, `applied_`; scene format version and CLI/runtime version bumps are consistent (0.10.0 across package.json and test expectations; 0.6.0 in CMake and `u8g2gl_version.h`).

**Not measured:** `u8g2gl_clip_scope` adds no per-object data and is a stack object, so no sizeof claim was made or needed.

**Observations (standards silent):**
- `validate-geometry.ts:733-735`: for a `draw=` radius the diagnostic says "U8G2 draws outside the box (u8g2_box.c)", which is accurate for raw U8G2, while `u8g2gl_draw_box` itself clamps the radius (draw.h:131). That wording is pre-existing in the message and the validator's test pins it; it is not a defect of this change, but an author reading it may think the runtime would draw outside.
- documentation.md §4.1 is not yet reflected in the copy of the skill loaded from the main checkout (`/Users/mcneillm/Documents/Projects/U8G2GL/.claude/skills/u8g2gl-standards`), only in this worktree's `.agents/skills`. Worth syncing.

**Files reviewed:** CMakeLists.txt; cli/package.json; cli/src/core/generator/emit/{draw-args,scene,screen}.ts; cli/src/core/schema/{diagnostic,globals}.ts; cli/src/core/validator/{configured-radius,validate-geometry,validate-schema,validate-widget-props}.ts; cli/test/generator/{emit-editor,emit-screen}.test.ts; cli/test/integration/generate.test.ts; cli/test/validator/{bind-type-paths,radius-build-time}.test.ts; include/u8g2gl/manifests/{u8g2gl_box,u8g2gl_obj}.xml; include/u8g2gl/{u8g2gl_core,u8g2gl_version,u8g2gl_state_saver,u8g2gl_draw}.h; src/u8g2gl_core.cpp; test/CMakeLists.txt; test/editor_host/editor_host.{h,cpp}; test/test_{bound_child_clip,core,editor_parity,radius_honoured}.cpp.

## Completion Report

<!-- Written by the remediation worker at task completion -->
