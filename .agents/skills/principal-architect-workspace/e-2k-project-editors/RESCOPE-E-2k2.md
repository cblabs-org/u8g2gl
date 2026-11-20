# E-2k2 (re-scoped): fonts and images by injection

*PA plan, drafted 2026-11-19 against main @ `6cedfa6` (#62 merged). **Approved by the owner 2026-11-20** (status log).*

E-2k was approved on 2026-11-14 ("Approve E-2k"), rulings 11–17 being E-2k2's.
E-6 (#60) and E-7 (#61) have since delivered part of that scope, so this is the
remainder, re-checked against the code. Anything below that differs from an
approved ruling is marked **changed** and is listed for decision.

## What the code says now

| # | Finding |
|---|---|
| 1 | **Every font and image is compiled into the editor Wasm.** The generated `ui_editor_asset()` (editor registry) is a name → symbol table over the project's `ui_fonts.cpp`/`ui_images.cpp`, and `wasm/bridge.cpp` resolves every font and image through it. Nothing else in the registry names a font |
| 2 | **So a font or image change rebuilds the Wasm.** `prepare-build.ts` hashes `ui_fonts.cpp` and `ui_images.cpp`, and the designer requests a build for any change outside `screens/` |
| 3 | **Without Emscripten, only the fixture's five fonts draw.** The bundled framework Wasm links `test/generated_fixture`'s fonts. A widget-free project on a machine without the toolchain fails on any other font ("the project declares no font …") |
| 4 | **The browser already holds BDF and image bytes.** `designer/src/project/project-assets.ts` runs the CLI's own `compileProjectAssets()` in the browser: bdfconv Wasm for `<bdf>`, the §14.2 pipeline for images. Only built-in font bytes are missing, and those live in the packaged `extern/u8g2/csrc/u8g2_fonts.c` (40 MB) |
| 5 | **Delivered by E-6/E-7:** the built-in font picker (search, filters, decoded suffixes, natively rendered samples), the file chooser, and BDF/image import in `globals.xml`'s form; large fonts |
| 6 | **Not delivered:** the Fonts activity view (disabled in the activity bar), the glyph grid and string ruler, "Browse fonts…" from the property panel (a plain dropdown of declared fonts), the range presets and glyph warning, and the fonts and images sections' sizes, usage counts and removal guard |

## Rulings

### WO1: injection (rulings 11–13, unchanged in intent)

1. **The bridge gains an injected asset table** (`wasm/bridge.cpp` only): `injectFont(name, bytes)`, `injectImage(name, width, height, bytes)` and `clearInjected()`. Lookup tries it before `ui_editor_asset()`. `u8g2_font_4x6_tr` stays built in as the fallback, drawn with a visible warning naming the missing font.
2. **The designer injects every declared font and image** before each `applyScene`:
   - `<bdf>` and images: the bytes `compileProjectAssets()` already produced (finding 4);
   - built-ins: from a new design-server route, `GET /api/font/builtin?name=`, behind the session token. It reads the packaged `u8g2_fonts.c` once, builds an index (large fonts included), and caches it. No network, no new download.
   - These are the bytes the firmware links, so the canvas cannot differ from the device.
3. **Changed: the editor target stops compiling project fonts and images.** The generated `ui_editor_asset()` becomes an empty table in the editor target, and the build hash no longer covers `ui_fonts.cpp`/`ui_images.cpp`. So a font or image change never rebuilds, only widget code does. Firmware output is unchanged. (Decision K1.)
4. **Consequence:** the bundled framework Wasm draws every font and image of a widget-free project, with no Emscripten at all.
5. **Tests.** Wasm parity tests: an injected built-in font, BDF and image each render pixel-identically to the same asset compiled in; `clearInjected()` leaves nothing behind. e2e: adding a built-in font and using it on a label renders with no build requested. WO1 records the rebuild time this removes.

### WO2: the Fonts view and "Browse fonts…" (ruling 14)

6. **The Fonts view is enabled in the activity bar** (decision K2). It holds two lists:
   - the project's fonts;
   - all 2,039 built-ins, reusing E-6's picker, samples and filters.
   Selecting a font shows its glyph grid and a string ruler (ui_spec §12), drawn by the real renderer through injection. Type text and see its width in pixels.
   **Add to project** writes `<builtin>` through the CST path.
7. **The property panel's font field ends with "Browse fonts…"**, which opens the view and returns the choice to that field (decision K3). Choosing a font the project hasn't declared is two edits, in two documents: the `<builtin>` line in `globals.xml`, then the field. Each is undone in its own document (ui_spec §14), and the view says so.

### WO3: ranges, sizes and usage (rulings 16 and 17)

8. **Range presets on a `<bdf>`**, each with its byte cost: All (the default, no `range`), Printable ASCII, Latin-1, Digits and time, and Only what this project uses. The last is derived from static text and format strings, plus sample values once E-3b lands. It is flagged unsafe for a font used by an element bound to a string subject.
9. **A new CLI validator warning:** static text using a glyph outside its font's declared range. It is a warning, not an error, and changes no generated output.
10. **The fonts and images sections show:**
    - each item's size in bytes, and how many elements and styles use it (click to list them);
    - for images, a 1:1 preview, with a `<convert>`'s threshold or dither choice shown beside its result.
    Remove is refused while an item is still used, naming the users.

### WO4: docs and review

11. **Docs:** ui_spec §6.4, §12 and the activity bar; design_spec §9 (the editor resolves assets by injection) and §14.1 (the presets); the ChangeLog.
12. **Versions:**
    - schema stays 0.7, and runtime 0.14.0 (no `include/` or `src/` change; the bridge is editor-host code);
    - CLI **0.23.0 → 0.24.0**: a minor bump, because finding 1's editor golden moves and the editor gains a surface.

## Boundary

- `wasm/bridge.cpp`, `wasm/test/**` and `ci.yml`, for the new Wasm tests;
- `cli/src/core/generator/emit/**`, for the editor target's asset table only;
- `cli/src/node/design/**`, for the font route and the build hash;
- `cli/src/core/validator/**`, for ruling 9 and K5's widget-source check only, with `cli/src/core/schema/diagnostic.ts` for their codes;
- `designer/src/**` and `designer/e2e/**`;
- the editor goldens;
- the docs above and the CLI version.

**No** schema, runtime or firmware-output change.

## Decomposition

Worktree `../U8G2GL-e4` from `origin/main` @ `6cedfa6`. One branch per WO, stacked. The worker doesn't push. The PA verifies end to end, pushes and opens the PR.

| WO | Branch | Done when |
|---|---|---|
| WO1 | `u8g2gl-e2k2/wo1-injection` | The parity tests pass. A font change requests no build. A widget-free project renders a non-fixture font on the framework Wasm |
| WO2 | `u8g2gl-e2k2/wo2-fonts-view` | e2e covers: browse, then Add to project; a string's measured width matches the canvas; Browse fonts… from a label sets its font, one undo step per document |
| WO3 | `u8g2gl-e2k2/wo3-ranges-usage` | Unit tests cover range derivation and costs. CLI tests cover the warning. e2e covers: the presets write `range`; removing a used font is refused, naming its users |
| WO4 | `u8g2gl-e2k2/wo4-docs-review` | All suites pass, run one at a time. The goldens move only in the editor asset table. check-package passes at 0.24.0. The home-path guard is clean |

## For the owner to decide

- **K1. Stop compiling fonts and images into the editor Wasm?** I recommend **yes**. Fonts would then never rebuild, and a widget-free project would work with no toolchain.
  - The cost is one editor-golden change.
  - The alternative keeps the compiled-in table as a second source behind injection. That's simpler, but every font change would still rebuild.
- **K2. Enable the Fonts view?** I recommend **yes**. The activity bar already shows the icon, disabled, and the discoverability principle says a shown feature should work. The "Assets" icon stays disabled; that's out of scope here.
- **K3. "Browse fonts…" adds an undeclared font**, as two edits in two documents with separate undo? I recommend **yes**. The alternative is to list only fonts already declared.
- **K4. CLI 0.24.0?**
- **K5. How a widget gets a font or image.** This is the owner's direction (2026-11-20, in their own words):

  > "either the widget uses a font prop and the lib handles it end to end via injection. OR the widget codes it in the c++ and it owns it and takes responsibilty for compiling it in. Any other method is an error."

  The PA's proposal for the ruling:
  - **Exactly two routes.**
    - **A prop:** a `type="font"` or `"image"` prop. U8G2GL handles it end to end: declaration, generation, and injection in the editor.
    - **Owned by the widget:** a U8G2 font (`u8g2_font_…`) or the widget's own bitmap, named in its C++. It's compiled with the widget, in the firmware and in the editor build alike.
  - **Anything else is an error.** In practice, that means widget source naming a generated project symbol (`ui_font_…`, `ui_image_…`).
    - A new diagnostic, `U8G2GL_WIDGET_ASSET_SYMBOL`, reports it at its file and line and tells the author to use a prop instead.
    - It comes from one widget-source check, run by `validate`, `generate` and the editor build alike, so a widget can't pass on the device and fail only in the designer.
    - Comments and string literals are skipped.
  - **The rule covers widget sources only.** Application code may still use the generated symbols.
  - **No fallback path.** With this rule in place, K1 needs no "keep compiling fonts in" mode.
  - Neither of the owner's two projects uses a generated symbol in widget code (checked 2026-11-20), so nothing existing breaks.

## Status log

| Date | Entry |
|---|---|
| 2026-11-19 | PA re-scoped E-2k2 against main @ `6cedfa6`, after #62 merged. No branch or code change exists. **Awaiting the owner's approval.** |
| 2026-11-20 | The owner asked "what happens to fonts in widgets?". The PA added K5. The owner then directed the two-route rule, quoted under K5, and the PA wrote it in as the ruling. |
| 2026-11-20 | **Approved by the owner.** Asked "Do you approve E-2k2 with K1–K5 as now written?", the owner replied, in their own words: **"Approve E-2k2"**. That approves this re-scope: rulings 1–12, K1 (the editor target stops compiling project fonts and images), K2 (the Fonts view enabled), K3 ("Browse fonts…" adds an undeclared font, as two edits in two documents), K4 (CLI 0.24.0) and K5 (the two-route rule, with `U8G2GL_WIDGET_ASSET_SYMBOL`). PA branched `u8g2gl-e2k2/wo1-injection` from `origin/main` @ `6cedfa6` in `../U8G2GL-e4`. Work orders: [WORKORDERS-E-2k2.md](WORKORDERS-E-2k2.md). |
