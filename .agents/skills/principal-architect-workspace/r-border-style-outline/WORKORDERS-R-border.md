---
name: r-border-wo1-wo3
description: Work Orders of R-border — the framework draws a style's one-pixel border outline for every element (runtime 0.15.0), the Wasm and parity follow, then the CLI patch bump, designer captions and docs
---

# Role

You are a senior engineer and execution-focused worker. You are **not** the Principal Architect.

- Do not change the design.
- Do not create any branches beyond the three named here.
- Do not push.
- Do not start other work, including E-3b, padding that grows to clear an outline, any border width other than 1, or either foundation repository.

Execute **WO1, then WO2, then WO3**.

**Parent project:** `r-border-style-outline`.
- **Binding:** [PROJECT.md](PROJECT.md): its "The design under A" section, with **B1 = A, B2 = B2a, B3 = runtime 0.15.0 / CLI 0.25.1 / schema 0.7 unchanged**.
- **Approval:** the owner's own words are recorded in PROJECT.md's "Owner approval" section and status log (rule 00).
- **Read first:** the whole of PROJECT.md, `.agents/rules/03-versioning.md`, and design_spec §10 and §11.

# Where you work

- **Worktree:** `../U8G2GL-e4`, starting on `u8g2gl-rborder/wo1-runtime` (cut from `origin/main` at `1915179`, upstream unset). Cut each later branch from the previous tip with `git checkout -b <name>`: `u8g2gl-rborder/wo2-wasm`, then `u8g2gl-rborder/wo3-cli-docs`.
- **Boundary.** Each WO names its own. Anything outside it: stop and report.
- **Install:** `extern/u8g2` must be at the pinned `d66b49a`, and it is. Don't run `git submodule update`. Run `npm ci` in `cli/` before `npm ci` and any build in `designer/`.
- **Commits:** run `git branch --show-current` as its own command before every commit. Commit as you go. **Do not push.**
- **Scratch:** keep scratch files in `tmp/`, and keep every CLI `--out` inside it. Fetch nothing from the network beyond `npm ci` from the lockfiles.
- **Baselines.** Record them first, running the suites one at a time:
  - **Emscripten:** `source ~/Documents/Projects/departures-board/tools/layoutsim/emsdk/emsdk_env.sh`. Never commit that path, and never download or update Emscripten.
  - **Framework editor Wasm:** `emcmake cmake -B build-wasm -DCMAKE_BUILD_TYPE=Release && cmake --build build-wasm -j8`, then the CLI build, before the Wasm tests and e2e.
  - **Wasm tests:** run each with `node wasm/test/<name>.test.mjs`.
  - **Host C++:** `cmake -B build && cmake --build build -j8 && ctest --test-dir build --output-on-failure`.
  - **Designer unit:** `npx playwright test --config playwright.unit.config.ts`.
  - **e2e:** run against `npm run build:e2e`. Rebuild `build:e2e` before every `test:e2e`, because a production build overwrites it.
  - **Production:** `npm run build`, then `test:e2e:production`.
  - **Known flakes** (report them if they fail): `design-hidden.spec.ts:144`, `performance.spec.ts:168`, `drag-performance.spec.ts:189`, and `generate-editor.test.ts` hitting vitest's 5 s limit under a full parallel run.
- **Standards:** load `u8g2gl-standards` before writing code. C++ and TypeScript naming differ; check §2. Put no workspace pointers in source comments or test titles. The home-path guard must pass.
- **Browsers:** Playwright, headless, with `--no-open`. Never open a window, an editor or Finder on the owner's desktop.
- **Ports:** 5321 is the owner's demo server, and 5399 and 5401 are the PA's. Never bind or stop them.
- **Hardware:** none. Never flash.
- **Flakes:** if a test fails, re-run it alone and report both runs. Do not weaken a test to pass.
- **Versions:** never tag or publish. Bump only what WO1 and WO3 name. Never bump the schema.

# WO1 — The runtime draws the outline (`u8g2gl-rborder/wo1-runtime`)

**Boundary:** `include/`, `src/`, `test/` (host tests), and `CMakeLists.txt`. Not `wasm/`, `cli/` or `designer/`.

- [ ] **`u8g2gl_draw_frame(display, x, y, w, h, radius)`**, public in `u8g2gl_draw.h`, beside `u8g2gl_draw_box()`, with Doxygen. It is the button's static `draw_border_rframe()` promoted unchanged in behaviour:
  - it always calls `drawRFrame`, as the button always has;
  - the origin wraps through `u8g2gl_coord_pos()`;
  - a size that isn't positive draws nothing;
  - the radius is clamped by `u8g2gl_coord_corner_radius()`.

  The button calls it in place of the static helper. **The button's pixels must not change.** `test_button.cpp` and `test_radius_honoured.cpp` pass untouched.
- [ ] **The outline, in both render paths.** In `u8g2gl_render_object()`, and in `u8g2gl_repaint_object()`, right after `render()`:
  - **When:** the element's resolved `style_.border` is true and `draws_own_outline()` is false.
  - **What:** draw `u8g2gl_draw_frame()` on its box `(x, y, w, h)`, in `style_.draw_color`, with `style_.radius`.
  - **Clip:** in the repaint path, draw before the clip is reset to the full display, so the outline stays inside the element's effective clip.
  - **State:** keep the draw inside the existing state guard, so no draw colour leaks to the caller.
  - **Shape:** one small framework helper, used by both paths, rather than two copies.
- [ ] **`virtual bool draws_own_outline() const`** on `u8g2gl_obj`, defaulting to `false`, with Doxygen saying why it exists: an element that frames its own box would draw the outline twice, and under xor the two cancel. `u8g2gl_button` overrides it to return `border_width_ > 0`. No other widget overrides it.
- [ ] **Tests**, in `test/test_style_border.cpp`, against real U8G2 pixels:
  - for every element type the runtime ships: `border` false draws no outline, and `border` true lights exactly its box's frame and nothing else outside what the element draws without it;
  - `border` set on the element, through `style_border`, and through a named style, all draw the same (the existing precedence);
  - a radius exactly at the §10 bound, and one past it, clamped;
  - an outline partly off the left and top edges, and one partly outside a container's clip: only the visible, clipped part is drawn;
  - a container whose child overlaps its outline: the child draws over it;
  - the button with `border` true at `border_width` 0, 1 and 2, under draw colours 0, 1 and xor: at 0 the framework outline is drawn; at 1 and 2 the button's own frame appears exactly once, and under xor it is not cancelled;
  - the repaint path draws the same outline as the frame path;
  - the caller's draw colour is unchanged afterwards.
- [ ] **Runtime 0.15.0**, in `CMakeLists.txt` and `u8g2gl_version.h`, and wherever else the runtime version must agree (find them; any check that enforces agreement must pass).
- [ ] Every host suite passes. List any existing test whose expectation moved, with why. **Stop and report** if a test moves for an element that sets no `border`.

# WO2 — Wasm and parity (`u8g2gl-rborder/wo2-wasm`)

**Boundary:** `wasm/`, the parity tests (`test/test_editor_parity.cpp`, `test/test_wasm_parity.cpp`) and their corpus. Parity frames are computed when the tests run, not committed, so nothing is "refreshed": this WO adds coverage and confirms agreement.

- [ ] Rebuild the framework editor Wasm with the installed Emscripten.
- [ ] Add a parity scene with a bordered container, a bordered label with a radius, and buttons at `border_width` 0 and 1 with `border` true. Show the editor and firmware frames agree on it and on every existing scene.
- [ ] Every Wasm test passes. **Stop and report** if any existing scene's frame moves that sets no `border`.

# WO3 — CLI, designer and docs (`u8g2gl-rborder/wo3-cli-docs`)

**Boundary:** `cli/package.json`, `cli/package-lock.json`, the goldens, `designer/src/**`, `designer/e2e/**`, `docs/design_spec.md` §10, `docs/ui_spec.md` §6.4, and `ChangeLog`.

- [ ] **CLI 0.25.1** (rule 03: a runtime minor bump forces a CLI patch bump). Refresh the goldens with `refresh-goldens.mjs`, then show that every golden diff is only the runtime floor (`U8G2GL_REQUIRE_RUNTIME_VERSION` and whatever stamps it). **Stop and report** on any other golden change.
- [ ] **The style card** (`designer/src/forms/style-facts.ts` and its users):
  - `border` becomes a drawn item on both captions;
  - the button's caption says its own `border_width` frame stands in for the outline when it is above 0;
  - the "no element draws a style's border yet" note goes.

  Unit tests follow.
- [ ] **e2e:** update `styles-consts.spec.ts` for the new captions, and add one pixel check that a `<u8g2gl_obj border="true">` panel draws its outline on the canvas. Check `palette.spec.ts`, `design-hidden.spec.ts` and `element-tree.spec.ts`, which already write `border`, and report any that moved.
- [ ] **Docs:**
  - **design_spec §10:** the outline, as built: what is drawn, when, the clip, the children over it, and the button rule with its xor reason;
  - **ui_spec §6.4:** the captions, as built;
  - **ChangeLog:** runtime 0.15.0 and CLI 0.25.1, saying plainly that **any element with `border="true"` now draws a one-pixel outline it did not draw before**.
- [ ] Every suite passes, one at a time. `check-package` passes at 0.25.1.
- [ ] **Completion report**, appended here: the commits, each suite's result, every moved test with why, and anything you were unsure of.
