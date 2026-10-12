---
work_order: WO4
project: pr-05r-runtime-fixes
title: "The last ambient item, and a bool comparison the ESP32 can resolve"
branch: u8g2gl-05r/wo4-height-and-bool-refs
base: u8g2gl-05r/wo3-platformio
complexity: architect
status: dispatched
---

# WO4 — establish the reference-height mode; make bool-subject comparisons unambiguous on xtensa

## Authorization

Part of PR-05R (`pr-05r-runtime-fixes`). Verify from committed files: `../PROJECT.md` "Human
Approval" quotes the owner's approval of this PR's decomposition, and its Session Log records the
owner's "continue and go until fixed" and the PA's rulings R7 and R8 that this WO executes. This
WORKORDER's `status` must be `dispatched`. Otherwise **stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions beyond
> the choices this WORKORDER hands you, do not branch, do not plan beyond this checklist.

## Branch and working tree

**Work only in `/Users/mcneillm/Documents/Projects/U8G2GL-05r`.** **Branch**:
`u8g2gl-05r/wo4-height-and-bool-refs` (already checked out, no upstream) · **Base**:
`u8g2gl-05r/wo3-platformio`. Run `git branch --show-current` **as its own command immediately
before every commit** (`.agents/rules/04-branch-hygiene.md`). Scratch in `tmp/`
(`.agents/rules/02-workspace.md`), never `/tmp`. `tmp/fdn/` is the PA's foundation harness
build — read it, rebuild it, do not edit its sources.

## COMMIT ON A GREEN BUILD

Authorized to commit on a green build. **Do NOT stop to ask**: nobody can answer. Do not push,
tag, publish or open a PR. A decision this WORKORDER does not cover and that cannot be made inside
the Boundary Box: commit what is green, set `status: blocked`, write the Completion Report, stop.

## Standards

Load `u8g2gl-standards` first: `references/cpp.md`, `references/typescript.md`,
`references/documentation.md`. **§4.1** on lines you add or change: cite published references
and measured facts; no work-order tags, no workspace paths, no narrated debate. Pre-existing
citations are not yours to sweep; comments this WO makes wrong are yours to correct.

## Tooling Constraints — PlatformIO MCP only

**The owner has denied direct use of the `pio` CLI.** Any PlatformIO build goes through the
PlatformIO MCP server: load the `platformio-mcp:pio-manager` skill, load tools with ToolSearch
(`select:mcp__plugin_platformio-mcp_platformio__build_project,mcp__plugin_platformio-mcp_platformio__check_task_status,mcp__plugin_platformio-mcp_platformio__project_envs`),
always pass `projectDir` and `environment`, use `background: true` and poll. No `pio` shell
commands or wrappers. If the MCP refuses, paste the refusal, commit what is green, set
`status: blocked`, stop. The scratch rig is `tmp/pio/` (esp32dev, Arduino).

---

## Objective

(A) U8G2GL establishes U8G2's font reference-height mode inside its render guard and restores the
caller's, so a plain `begin()` user renders the same pixels as foundation's legacy-state display.
(B) A bool subject's comparison compiles on ESP32 whether generated or hand-written.

## Part A — reference-height mode (PA ruling R7)

**Measured by the PA** (foundation's render harness, `tmp/fdn/`, built against this branch at
WO3's tip with `-DU8G2GL_SOURCE_DIR` pointing at this worktree): criterion 1 holds, all five
scenarios **0 differing pixels**; `no_font_pos_top` now **0** (was 1407 before WO1); but
`no_font_ref_height_all` and `plain_user_ui_handler` both differ by **274 pixels** (137 + 137,
rows 19..29, columns 5..128). Re-run: `cmake --build tmp/fdn/build --target after` (configured
with `-DU8G2_SOURCE_DIR=<worktree>/extern/u8g2 -DU8G2GL_SOURCE_DIR=<worktree>
-DRENDER_AFTER_DIR=<worktree>/tmp/fdn/after-05r`).

Every text widget centres on `getAscent() - getDescent()` (`u8g2gl_label.cpp:338`,
`u8g2gl_clock.cpp:224`, `u8g2gl_button.cpp:177`, `u8g2gl_progress_bar.cpp:263`), and
`u8g2_font_calc_vref_top` measures from `font_ref_ascent`. Both depend on `u8g2->font_height_mode`
(`u8g2_font.c:1181-1222`; `0` text, `1` extended text, `2` all — use U8G2's own
`U8G2_FONT_HEIGHT_MODE_*` names). Nothing in U8G2GL sets it; U8G2's setup leaves it at text
(`u8g2_setup.c:88`).

**Ruling R7: the framework establishes `setFontRefHeightAll()`.** A label clips to its own box, so
the reference height must cover every glyph in the font, not just `A` and `g`. It is also the mode
foundation's XML was tuned under.

- [ ] `u8g2gl_state_saver`: capture `font_height_mode`; establish ALL compare-first (the R1a
      rule); restore the caller's mode compare-first through the matching setter
      (`setFontRefHeightText` / `ExtendedText` / `All`). Each of these calls `u8g2_UpdateRefHeight`
      on the **current** font, so restore the font before the height mode — state the order and
      why in the destructor's comments. `UpdateRefHeight` returns early on a null font; confirm the
      null-font path still holds.
- [ ] `test/stubs/U8g2lib.h`: model `font_height_mode` under its real name, and the three setters.
- [ ] Real-U8G2 tests in `test/test_ambient_state.cpp`: a label rendered after
      `setFontRefHeightText()` lights the same buffer as after `setFontRefHeightAll()`; the
      caller's mode comes back; show both failing before the change.
- [ ] Re-run the cost benchmark from WO1 (`tmp/bench/`) for the label case and paste it.
- [ ] Docs: the saver's header and class doc, `u8g2gl_render_object()`'s doc, design_spec §11.3
      and Appendix A — the established baseline is now position top, direction 0, reference
      height all.
- [ ] **Re-run the foundation harness** and paste the `compare` and `state probe` output. The
      target is: five scenarios 0 differing, and `plain_user_ui_handler` **0**. If it is not 0,
      report what differs — do not chase it outside this box.

## Part B — bool comparisons on xtensa (PA ruling R8)

**Found by WO3, confirmed by the PA:** `u8g2gl_obj.h:369-372` overloads `bind_flag_if_eq` and
`bind_flag_if_not_eq` on a bool subject for both `int32_t` and `bool`. On xtensa `int32_t` is
`long`, so a literal `0` converts to either equally: ambiguous. The generator types `0`/`1` on a
bool subject as `int` (`cli/src/core/generator/emit/screen-model.ts`, the `refType` line), so
`cli/test/generator/fixtures/emit-project/screens/screen_home.xml:36` (`ref_value="0"`) emits
`bind_flag_if_eq(&ui_subject_wifi_connected, 0, …)` — committed in
`test/generated_fixture/generated/ui_screen_home.cpp:75`. The host compiles it; ESP32 cannot.
Hand-written `obj.bind_flag_if_eq(&b, 0, flag)` fails the same way.

**Ruling R8: one overload per subject type.**
- [ ] Runtime: remove the `int32_t` overloads for `u8g2gl_subject_bool_base*` (declarations and
      `src/u8g2gl_obj.cpp:589`, `:597`). Before removing, find every caller (runtime, tests, the
      editor registry in `u8g2gl_editor.*`, generated code) and state what each did. If a caller
      relies on comparing a bool subject against an integer other than 0/1, **stop and report**.
- [ ] Generator: a bool subject's `ref_value` is always emitted as `bool` — `0` → `false`, `1` →
      `true`. The validator already restricts it to `true`/`false`/`0`/`1`
      (`validate-types.ts:291`); keep that. Update the `refType` comment.
- [ ] Keep `screen_home.xml:36` as `ref_value="0"` — it is the regression input. Regenerate
      goldens and the compile fixture: **`npm run build` first** (`refresh-goldens.mjs` reads
      `dist/`). The golden diff must be the `0` → `false` (and any `1` → `true`) lines only.
- [ ] Tests: a CLI test that a bool subject's comparison never emits an integer literal; C++ tests
      updated for the removed overloads.
- [ ] **On-target proof, through the MCP:** in `tmp/pio/`, an esp32dev env that compiles the
      regenerated `test/generated_fixture/generated/` (with whatever main/support it needs). Show
      it failing on the WO3 tip's fixture with the ambiguity error, and building after. Paste both.
- [ ] design_spec: wherever the bool-subject overloads or `ref_value` typing are described.

## Strict Boundary Box

- **In:** `include/u8g2gl/u8g2gl_state_saver.h`, `u8g2gl_core.*` docs, `u8g2gl_obj.h`/`.cpp`
  (the two overloads only), `u8g2gl_editor.*` only if it registers the removed overloads,
  `test/stubs/U8g2lib.h`, C++ tests, `cli/src/core/generator/emit/screen-model.ts` and
  `screen.ts` (ref typing only), CLI tests, goldens, `test/generated_fixture/`, design_spec
  §11.3, Appendix A and the bool-binding passages.
- **Out:** versions (WO5); the version-pin test (WO5); the validator's accepted set; WO3's config
  and manifest work; foundation's sources (`tmp/fdn/` is read-and-build only).

## Verification Requirement

- [ ] C++ from a **clean configure**: **0** warnings; ctest **410 + your new tests** (minus any
      removed with the overloads — say which), one skip. CLI: vitest **≥ 1352**, `tsc`, lint.
- [ ] Part A tests failing before and passing after; foundation harness output pasted.
- [ ] Part B MCP builds failing before and passing after; golden diff described.
- [ ] `git diff --name-only <base>..HEAD` within the Boundary Box.

## Issue Surfacing

Out-of-scope findings go in the Completion Report. Do not fix them, do not file issues. Known and
handled elsewhere: version bumps and the version-pin test (WO5); `u8g2gl_obj.h`'s
`render_animation_update()` doc, `model.ts` `BudgetLine.note`, `U8G2GL_NO_PARENT` in
`u8g2gl_config.h`'s header (WO6).

---

## Completion Report (append below on completion)

Use: Status · Baseline and final counts · Changes Made · Decisions Made · Evidence · Dead Ends &
Warnings · Out-of-Scope Findings · Blockers.
