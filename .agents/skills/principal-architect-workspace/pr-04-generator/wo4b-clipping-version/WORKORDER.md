---
work_order: WO4b
project: pr-04-generator
title: "Clipping correctness and the pre-1.0 version guard"
branch: u8g2gl-generator/wo4b-clipping-version
base: u8g2gl-generator/wo4-runtime-support
complexity: standard
status: dispatched
---

# WO4b — Clipping correctness and the pre-1.0 version guard

## Authorization

Part of PR-04 (`pr-04-generator`). Verify the human's approval of PR-04 in
`../PROJECT.md` under "Human Approval" (owner's own words, timestamped), that
`../PROJECT.md` records **WO4b as approved at the owner checkpoint** ("Checkpoint
rulings"), and that this WORKORDER's `status` is `dispatched`. Otherwise **stop and
report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo4b-clipping-version`
**Base**: `u8g2gl-generator/wo4-runtime-support`

`git branch --show-current` **as its own command immediately before every commit**.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. Do NOT stop to ask for approval — you cannot
be answered, and your work will strand uncommitted.

## Standards

`u8g2gl-standards` skill, `references/cpp.md` and `references/documentation.md`. No
heap, zero warnings, Doxygen on public declarations, why-comments where a decision is
not obvious.

## Design authority

design_spec §11.3, §16 and `.agents/rules/03-versioning.md` **as they stand on `main`
@ `ef73776`** — your branch predates that commit, so read them with
`git show main:docs/design_spec.md` and `git show main:.agents/rules/03-versioning.md`.
Where this work order and the spec disagree, **stop and report** (record it, and
continue with the remaining items).

**Do not fetch U8G2 source** from the network (Chief Architect ruling).

---

## Objective

Make framework clipping trustworthy before generated code starts relying on it, and
make the version guard catch the pre-1.0 breaking change it currently lets through.

## Background

WO4 surfaced three clipping defects and one version-guard gap; the owner approved this
work order to close them.

- **F1 — the clip corner convention.** Both call sites use
  `setClipWindow(x, y, x+w-1, y+h-1)`, §11.3's form: `src/u8g2gl_core.cpp:160`
  (`u8g2gl_render_object`) and `src/u8g2gl_label.cpp:314` (scrolling label). The PA read
  the U8G2 **2.36.18** source already present on this machine, in
  departures-board-v3's PlatformIO cache
  (`departures-board-v3/framework/.pio/libdeps/esp32dev/U8g2/src/clib/`). It shows the
  second corner is **exclusive**:
  - `u8g2_apply_clip_window` (`u8g2_setup.c`) bounds `user_x1` by `clip_x1`, and
    `user_x1` defaults to `width`;
  - `u8g2_IsIntersection` (`u8g2_intersection.c`) says "upper limits are not included";
  - `u8g2_DrawHVLine` (`u8g2_hvline.c`) returns on `x >= user_x1`.

  So `x+w-1` loses the last column and row. **This is a source reading, not a pixel
  test** — nothing on this host renders through real U8G2.
- **F4 — the state saver.** `u8g2gl_state_saver` saves and restores draw colour and
  font only. Its header and §11.3 say it saves the clip window; U8G2 cannot read the
  clip back. It restores neither font mode nor bitmap mode.
- **F6 — the scrolling label replaces the framework clip.** It sets a clip to its own
  bounds and then calls `setMaxClipWindow()`. Its own bounds are not intersected with
  its ancestors', so inside a container it can paint outside the container. §11.3:
  "the clip window is set by the framework, not the widget".
- **Version guard.** `U8G2GL_REQUIRE_SCHEMA_VERSION` compares the major only, so a
  project generated for schema 0.3 compiles against a 0.4 runtime. §16 and rules/03
  on `main` now require major, **and minor while major is 0**.

## Line-Item Instructions

- [ ] **One function owns the clip-corner convention.** Add a single runtime function
      (e.g. `u8g2gl_apply_clip(U8G2&, const u8g2gl_rect&)`) that converts a rect to a
      `setClipWindow` call, including WO4's clamping of negative origins. **Every**
      `setClipWindow` call in the runtime goes through it; no other file spells the
      corner arithmetic. Use the **exclusive** form, `(x, y, x + w, y + h)`.
- [ ] **Document the convention at that one function**, exactly as the Chief
      Architect directed: state it as an **assumption not verified by a pixel test**,
      then cite the evidence it rests on — the U8G2 2.36.18 source reading above, with
      the three functions named — and state that PR-06's real-U8G2 build must add a
      pixel test at a container edge, which will show any one-pixel difference
      directly.
- [ ] **Pin the convention with a test**: a rect of known `x, y, w, h` produces exactly
      `setClipWindow(x, y, x+w, y+h)` on the stub, and a negative origin clamps as
      before. The test's comment names the one function as the place to change if
      PR-06's pixel test disagrees.
- [ ] **F4 — make the state saver's contract true.** Because U8G2 cannot read the clip
      back, the saver cannot restore it. Remove the claim from its header, and make
      clip lifetime the render wrapper's documented responsibility (set, render,
      reset). Also save and restore **font mode** and **bitmap mode** if the stub and
      the `U8G2` API used in `include/` support reading them; if either cannot be read
      back, say so in the header instead of implying it is saved.
- [ ] **F6 — the label stops replacing the framework clip.** The scrolling label must
      not set its own clip window or reset to the full display when rendered through
      `u8g2gl_render_object`; the effective clip already bounds it (§11.3). If the
      label genuinely needs a clip narrower than its bounds, it must intersect with the
      effective clip and restore it, not the full display — and there is no way to read
      the clip back, so prefer removing the widget-side clip. A test: a scrolling label
      inside a narrower container never widens the clip beyond the container.
- [ ] **Version guard — major, and minor while major is 0.** Change
      `U8G2GL_REQUIRE_SCHEMA_VERSION` so that at major 0 the minor must match too, with
      the refusal message naming both versions. Update its Doxygen to the §16 wording
      on `main`. Extend WO4's compile-failure tests: `(0, 3)` against schema 0.4 **must
      fail to compile**; `(0, 4)` compiles; a mismatched major still fails.

## Strict Boundary Box

**In scope:** `include/u8g2gl/u8g2gl_tree.h`, `u8g2gl_core.h`, `u8g2gl_state_saver.h`,
`u8g2gl_version.h`, `u8g2gl_label.h`; `src/u8g2gl_tree.cpp`, `src/u8g2gl_core.cpp`,
`src/u8g2gl_label.cpp`; `test/` (tests, `test/version_guard/`, `test/CMakeLists.txt`,
`test/stubs/U8G2lib.h` read-back support only); this WORKORDER.

**Do NOT touch:** `docs/` (§11.3's `x+w-1` text is the Chief Architect's — report it);
manifests; the CLI; other widgets. Do **not** move `font`/`align`/text binding off
`u8g2gl_obj` (Q-10). Do **not** implement `bind_src` or `bind_glyph` (Q-12). Do **not**
fetch U8G2 source.

---

## Testing Requirement

- [ ] Convention test pins `(x, y, x+w, y+h)` through the one function.
- [ ] No `setClipWindow` call remains outside that function (`grep` in the report).
- [ ] Scrolling label inside a narrower container does not widen the clip.
- [ ] `U8G2GL_REQUIRE_SCHEMA_VERSION(0, 3)` fails to compile against 0.4, proven by a
      real failing compile; `(0, 4)` compiles; mismatched major still fails.

## Verification Requirement

- [ ] `cmake --build build` — zero warnings (reconfigure if CMake files change)
- [ ] `ctest --test-dir build` — all pass (baseline 277, one known skip)
- [ ] `cd cli && npx vitest run && npx tsc --noEmit && npm run lint` — clean (406)
- [ ] `git diff --name-only` limited to the Boundary Box

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix, do not file.

---

## Completion Report

*To be filled in by the worker.*
