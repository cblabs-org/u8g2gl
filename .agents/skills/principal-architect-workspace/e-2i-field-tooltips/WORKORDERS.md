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

- [ ] Ruling 8: `ui_spec`, the `ChangeLog`, and CLI 0.16.4 in `cli/package.json` and its lock
      file.
- [ ] Run the readability review (the `readability-reviewer` agent, or the standards skill's
      checklist) over the E-2i diff, and fix its findings.
- [ ] Re-run every suite one at a time. Run `scripts/check-package.mjs` from the repository
      root with Emscripten sourced.
- [ ] Write a completion report at the end of this file: commits per WO, suites before and after,
      decisions taken under the rulings, and anything left open.
