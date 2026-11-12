---
name: e-2i-wo1-wo3
description: Work Orders of E-2i — property help in tooltips, manifest help wording, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the three named here.
- Do not push.
- Do not start other work.

Execute **WO1, then WO2, then WO3**.

**Parent project:** `e-2i-field-tooltips` ([PROJECT.md](PROJECT.md)). Its rulings are binding.
The owner's approval is recorded in its status log (rule 00). Read
`.agents/rules/03-versioning.md` before WO3.

# Where you work

- **Worktree:** `../U8G2GL-e2i`, starting on `u8g2gl-e2i/wo1-field-tooltips` (based on
  `ae0a90f`). Cut each later branch from the previous tip with `git checkout -b <name>`:
  `u8g2gl-e2i/wo2-help-text`, then `u8g2gl-e2i/wo3-docs-review`.
- **Install:** `extern/u8g2` is already checked out at the pinned commit. Don't touch it, and
  don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in
  `designer/`.
- **Commits:** verify the branch before every commit. Commit as you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles.
- **Baselines:** record them first, running the suites one at a time.
  - Build the framework editor Wasm before `npm run build:e2e`.
  - The e2e suite needs `npm run build:e2e`, never the production build. A production
    `npm run build` overwrites the e2e build: always rebuild `build:e2e` before `test:e2e`.
  - Production is checked with `npm run build` and `test:e2e:production`.
  - Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
- **Standards:** load `u8g2gl-standards` before writing code. No workspace pointers in source
  comments or test titles. The home-path guard must pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** the owner's demo server listens on 5321. Never bind it, never stop it.
- **Known flakes (do not change them):** `drag-performance.spec.ts:256` ("forced move 9") and
  `structure.spec.ts:63` (a Shift-click loses `row0`). Both fail intermittently on main. If one
  fails locally, re-run it alone and report both runs.
- **Versions:** never tag, never publish. Bump only what WO3 names.

# WO1 — field tooltips (`u8g2gl-e2i/wo1-field-tooltips`)

- [x] Rulings 1: extract the Palette's tooltip into one shared component; move the Palette onto
      it with no change in look or behaviour. The Palette tooltip specs pass unedited.
- [x] Rulings 2–3: the ⓘ trigger after each property name that has help, the name hover, and the
      tooltip with the help text and the facts line (a pure, unit-tested function).
- [x] Ruling 4: remove the inline `.field-help` and its CSS; keep the disabled reason, problems
      and the computed / Detach / Edit in XML note inline.
- [x] Ruling 5: render counts unchanged.
- [x] Ruling 7's unit and e2e tests.

# WO2 — help wording (`u8g2gl-e2i/wo2-help-text`)

- [x] Ruling 6: the `long_mode` help and the three "Used only when…" strings in
      `include/u8g2gl/manifests/u8g2gl_label.xml`. Never edit `test/xtensa_control/pre_fix/`.
- [x] Regenerate `cli/src/data/manifests.json` (`npm run build:manifests`) and
      `cli/test/cst/tokeniser-trees.json` through its own refresh path.
- [x] Prove no other golden moved: `git diff --stat`, and `scripts/refresh-goldens.mjs` on the
      built CLI leaves an empty diff.

# WO3 — docs, version, review, evidence (`u8g2gl-e2i/wo3-docs-review`)

- [x] Ruling 8: `ui_spec`, the `ChangeLog`, and CLI 0.16.4 in `cli/package.json` and its lock
      file.
- [x] Run the readability review (the `readability-reviewer` agent, or the standards skill's
      checklist) over the E-2i diff, and fix its findings.
- [x] Re-run every suite one at a time. Run `scripts/check-package.mjs` from the repository
      root with Emscripten sourced.
- [x] Write a completion report at the end of this file: commits per WO, suites before and after,
      decisions taken under the rulings, and anything left open.

# Completion report (worker, 2026-11-12)

**Provenance.** `WORKORDERS.md` names its parent, `e-2i-field-tooltips`, and that project's status log
records the owner's own word, "Approve", for the plan. Rule 00 is satisfied.

## Commits

None is pushed, tagged or published.

| WO | Branch | Commits |
|---|---|---|
| WO1 | `u8g2gl-e2i/wo1-field-tooltips` | `34f8f41` feat(designer): property help in tooltips, on a shared tooltip |
| WO2 | `u8g2gl-e2i/wo2-help-text` (cut from `34f8f41`) | `c43f16f` docs(manifests): u8g2gl_label help written for users |
| WO3 | `u8g2gl-e2i/wo3-docs-review` (cut from `c43f16f`) | `92b5ece` (ui_spec, ChangeLog, CLI 0.16.4), `d615d73` (review fixes), and this report |

## Versions

CLI 0.16.3 → **0.16.4** in `cli/package.json` and `cli/package-lock.json`, with a `0.16.4` line
under `cli v0.16.xx` in `ChangeLog`. No `cli-v0.16.*` tag exists. `release-version.mjs next cli dev`
prints `cli-v0.16.4-dev.1`; nothing was tagged. There is no schema or runtime change.
`refresh-goldens.mjs`, run on the built 0.16.4 CLI, leaves an **empty diff**.

## Suites, before and after (one at a time)

| Suite | Before (`36a9ba2`) | After (`d615d73`) |
|---|---|---|
| Home-path guard | self-test 11/11; clean | self-test 11/11; clean |
| CLI `npm test` | 2750 passed, 23 skipped (130 files) | the same |
| CLI lint and tsc | clean | clean |
| Goldens (`test/generator`) | not run separately | 279 passed; refresh leaves an empty diff |
| Wasm editor build | builds | (unchanged; not rebuilt) |
| Designer typecheck / `build:e2e` | clean / builds | clean / builds |
| Designer unit | 206 passed | 213 passed (+7 facts line) |
| Designer e2e | 99 passed (21:31–21:35) | 100 passed (21:55–21:58; +1 tooltip) |
| Production build: no-hook grep / `test:e2e:production` | clean / 3 passed | clean / 3 passed |
| `check-package.mjs` | PASS, 0.16.3, 15,350,690 bytes, 771 files | PASS, 0.16.4, 15,351,081 bytes, 771 files |

No e2e failure or flake in either full run; `drag-performance.spec.ts:256` and
`structure.spec.ts:63` passed both times. The C++ suite was not run: nothing in it changed. The
last command run in `designer/` was the production build, so `dist/` is the production build now:
run `npm run build:e2e` before the next `test:e2e`.

## Decisions under the rulings

**WO1.**
- **The shared tooltip** is `designer/src/ui/tooltip.tsx`: `useTooltip(place)` (state owned by the
  anchor's component), `tooltipTriggers()` (pointer-enter/leave, focus/blur), `<Tooltip>`
  (`role="tooltip"`, fixed, `pointer-events: none`) and the placements `rightOf()` / `leftOf()`.
  The CSS class `.palette-tooltip` became `.tooltip`, with the same rules; the Palette keeps
  `palette-tooltip` as its content class, its id scheme and its `.palette-tooltip-*` children.
  `palette.spec.ts` is unedited and passes.
- **Escape.** While a tooltip is open, a window keydown listener in the capture phase closes it and
  calls `preventDefault` and `stopImmediatePropagation`, so it reaches no element handler. This
  holds for a hover-opened tooltip while the canvas has focus as well as for a focused ⓘ. The
  Palette's tooltip gains this too, as it is the same component; nothing else about it changed.
- **The ⓘ** is a `<button type="button" class="field-info" aria-label="About <key>">` holding
  Lucide's `info` icon at 12 px, after the name. It carries `aria-describedby` while open. The name
  and the ⓘ share one hover wrapper (`.field-name`), so moving between them keeps it open. A click
  also opens it (Safari does not focus a clicked button; touch has no hover); it never edits.
- **Placement.** The panel is at the shell's right, so the tooltip goes to the panel's left,
  level with the field's top (`leftOf`, sized from the viewport's right edge so its own width is
  never measured).
- **The facts line format** is `fieldFacts()` in `designer/src/panel/field-facts.ts`: parts joined
  by ` · ` — the type; then an enum's members, or a binding's subject types, joined by ` | `; then
  `default <value>` (an empty default shows as `default ""`). Examples:
  `enum · clip | dots | scroll | scroll_circular · default clip`, `int · default 16`, `string`,
  `subject · string | int`. A `color` does not list the draw colours (the ruling names enums only).
- **Re-renders.** The tooltip state is `FieldRow`'s own. The new e2e reads the render counts and
  checks that opening the tooltip re-renders `PanelField:long_mode` and nothing else in the panel.
  `panel-budget.spec.ts` and `overlays.spec.ts` are unchanged and pass.
- **Tests.** Seven units (enum, plain, no default, empty default, colour, binding, and the real
  `u8g2gl_label` long_mode facts and help). One new e2e: no inline help; the ⓘ and the name on hover
  and the ⓘ on focus each show the help and facts; the tooltip lies left of the panel; Escape
  closes it and keeps the selection, both with the ⓘ focused and with the canvas focused; a control
  shows the same Escape with no tooltip open does clear the selection; a disabled reason still shows
  inline. The two existing `.field-help` assertions now hover the ⓘ, and the validator-problem test
  checks no tooltip is open as the problem shows. Every prop in the framework and the departures
  fixture has help, so the "no ⓘ without help" branch is not reachable end to end.

**WO2.**
- The `long_mode` help, normalised for whitespace, is exactly the ruling's text. A designer unit
  test pins it. It is wrapped over four lines in the manifest's own style, two fewer than before.
- **The tokeniser record.** No refresh script exists, and `tokeniser-golden.ts` says the record is
  never regenerated. So the same edit was applied to the record: the four values, every later
  location two lines up, and the new `endLoc` of the two props whose closing line changed. This
  was done by a scratch script, then checked against the CST, which it matches. This edit moves
  locations, which earlier hand-applied edits did not.
- **Boundary deviation:** `cli/test/cst/tokeniser-diagnostics.json` also keys this file by its
  SHA-256, so its hash had to change too, or `diagnostics-parity.test.ts` fails. The hash is the only
  change there; the file's diagnostics stay `[]`. `test/xtensa_control/pre_fix/` and its records
  are untouched.

**WO3.** ui_spec §9.2 is rewritten: the ⓘ, the tooltip, the facts line, Escape, what stays inline,
and the owner's dated decision. The readability review (the `readability-reviewer` agent) found no
P1 or P2. Its three P3s are fixed:
- Principle 6 (§0, line 47) and the PR-02 `help` row no longer say "inline". These edits are in
  ui_spec but outside §9; the review flagged them as contradictions.
- The ⓘ's click handler has a why-comment, and click is named in the header, §9.2 and ChangeLog.

Three P4s are taken: `hide` documented, `useTooltip` signature wrapped, the Palette header
re-flowed. The fourth P4 (`@brief` on functions only) needs no change.

## Left open

- `cli/test/cst/tokeniser-golden.ts`'s header lists the edits applied to the record by hand. It
  does not mention this one, which also moves locations. That file is outside the boundary, so it
  is not changed; the PA may want a sentence there.
- `tokeniser-diagnostics.json` was changed outside the named boundary (hash only), as above.
