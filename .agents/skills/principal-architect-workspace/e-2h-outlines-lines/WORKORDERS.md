---
name: e-2h-wo1-wo3
description: Work Orders of E-2h — the Outlines toggle, line end handles, then docs and review
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the three named here.
- Do not push.
- Do not start other work.

Execute **WO1, then WO3, then WO2**. That is the order the parent project's numbering note sets.

**Parent project:** `e-2h-outlines-lines` ([PROJECT.md](PROJECT.md)). Its rulings are binding.
The owner's approval is recorded in its status log (rule 00). Read
`.agents/rules/03-versioning.md` before WO2.

# Where you work

- **Worktree:** `../U8G2GL-e2h`, starting on `u8g2gl-e2h/wo1-element-outlines` (based on
  `0655a79`). Cut each later branch from the previous tip with `git checkout -b <name>`:
  `u8g2gl-e2h/wo3-line-ends`, then `u8g2gl-e2h/wo2-docs-review`.
- **Install:** `extern/u8g2` is already checked out at the pinned commit. Don't touch it, and
  don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in
  `designer/`.
- **Commits:** verify the branch before every commit. Commit as you go; **do not push**.
- **Scratch:** put scratch files in `tmp/`. Fetch nothing from the network beyond `npm ci` from
  the lockfiles.
- **Baselines:** record them first, running the suites one at a time.
  - Build the framework editor Wasm before `npm run build:e2e`.
  - The e2e suite needs `npm run build:e2e`, never the production build.
  - Production is checked with `npm run build` and `test:e2e:production`.
  - Emscripten: `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`.
    Never commit that path.
- **Standards:** load `u8g2gl-standards` before writing code. No workspace pointers in source
  comments or test titles. The home-path guard must pass.
- **Browsers:** Playwright headless and `--no-open`. Never open a window, an editor or Finder on
  the owner's desktop.
- **Ports:** the owner's demo server listens on 5321. Never bind it, never stop it.
- **Timing runs:** after each one, read `pmset -g log` (read only). A run that overlaps a Sleep
  or DarkWake is void and must be repeated. Change no power setting.
- **Known flake:** `drag-performance.spec.ts:256` ("forced move 9") fails intermittently on CI
  and on main. Do not change it. If it fails locally, re-run it alone and report both runs.
- **Versions:** never tag, never publish. Bump only what WO2 names.

# WO1 — the Outlines toggle (`u8g2gl-e2h/wo1-element-outlines`)

- [ ] Ruling 1: a new overlay kind `outline` in `canvas-view.ts`, with its colour, dashed
      border, faint fill and place in the draw order.
- [ ] `EditLoop` composes outline rectangles from `bounds` while outlines are on, apart from
      the selection and problem rectangles, so each can change alone.
- [ ] The toolbar toggle in `canvas-panel.tsx`, beside freeze, remembered in `localStorage`
      through try/catch.
- [ ] Unit tests (ruling 3) and e2e (ruling 3's first two items). Render counts unchanged.

# WO3 — line end handles (`u8g2gl-e2h/wo3-line-ends`)

- [ ] Ruling 2: one rule says which elements are line-shaped, by element, not by box shape.
- [ ] A single selected line draws end handles only, with no box handles. `u8g2gl_line` keeps
      its vertex handles. `hline` and `vline` gain two end handles each.
- [ ] Plan the hline and vline end drags (`x`/`width`, `y`/`height`), with clamping and the
      literal-only refusal, through the existing edit path as one undo step.
- [ ] The property panel shows no "Can't resize" line for an axis a line has no handle on.
      Real refusals on an end still show.
- [ ] Unit tests and e2e (ruling 3). The existing resize, move and vertex specs still pass.

# WO2 — docs, version, review, evidence (`u8g2gl-e2h/wo2-docs-review`)

- [ ] Ruling 4: `ui_spec` §4 and §8, the `ChangeLog`, and CLI 0.16.3 in `cli/package.json` and
      its lock file.
- [ ] Run the readability review (the `readability-reviewer` agent, or the standards skill's
      checklist) over the E-2h diff, and fix its findings.
- [ ] Re-run every suite one at a time. Run `scripts/check-package.mjs` from the repository
      root with Emscripten sourced.
- [ ] Write a completion report at the end of this file. It covers the commits per WO, the
      suites before and after, decisions taken under the rulings, and anything left open.
