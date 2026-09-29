# Third-Party Notices

U8G2GL is licensed under the MIT License (see `LICENSE`). It depends on the
third-party components below, which carry their own licences.

| Component | Version | Licence | How U8G2GL uses it |
|---|---|---|---|
| [U8G2](https://github.com/olikraus/u8g2) | 2.36.18, pinned as the git submodule `extern/u8g2` | **Code:** BSD-2-Clause ("new-bsd", two-clause BSD licence).<br>**Fonts:** licensed **per font group**; each group's terms are listed on the U8G2 wiki page [fntgrp](https://github.com/olikraus/u8g2/wiki/fntgrp). | The submodule is used for **host tests** (compiling the runtime against U8G2's real headers), for **building the display catalogue** (`cli/src/node/build-catalogue.ts`), and — since PR-04b WO1 — for **building bdfconv to WebAssembly** (`cli/src/node/build-bdfconv.ts`). Nothing from U8G2's own sources is copied into U8G2GL's sources, but the *compiled bdfconv binary* is committed and **does ship in the published npm package** (`cli/src/data/bdfconv/bdfconv-wasm.json` and the glue module compiled to `dist/data/bdfconv/`, with `cli/LICENSES/bdfconv-BSD-2-Clause.txt`), because the CLI needs it at runtime to compile `<bdf>` fonts. **Applications otherwise get U8G2 through their own dependency** (PR-05's integration module declares it), so they receive U8G2 under U8G2's own licence terms, including the font-group terms for any font they use. |
| [Emscripten](https://emscripten.org/) | 5.0.3 (`285c424dfa9e83b03cf8490c65ceadb7c45f28eb`), used only to *build* the bdfconv artefact — not a runtime or install-time dependency | MIT (also offered under the University of Illinois/NCSA licence) | The JavaScript "glue" code Emscripten generates when compiling bdfconv to WebAssembly is committed and shipped alongside the compiled Wasm (`cli/src/data/bdfconv/bdfconv-glue.generated.ts`, compiled into `dist/data/bdfconv/bdfconv-glue.generated.js` in the package; licence text in `cli/LICENSES/emscripten-glue-MIT.txt`), because that generated runtime code ships inside the npm package. |

The authoritative licence text for U8G2 is `extern/u8g2/LICENSE` at the pinned
commit. The bdfconv Wasm artefact's exact build provenance — U8G2 commit,
Emscripten version and commit, and the flags used — is recorded in
`cli/src/data/bdfconv/bdfconv-source.json`.

## Fonts and images

Converting a font does not change its licence. A font compiled from a BDF
file with `<bdf>` is the same work under the same terms: the generated array
carries whatever terms the BDF carried. U8G2's own fonts carry per-group terms
(see [fntgrp](https://github.com/olikraus/u8g2/wiki/fntgrp)). The same holds
for an image: a PNG converted with `<convert>` to a bitmap array keeps the
licence of the PNG. U8G2GL does not supply, and does not relicense, any font
or image you compile.

## Material committed to this repository for testing

| Item | Where | Licence | In the npm package? |
|---|---|---|---|
| `4x6.bdf`, copied unmodified from U8G2's `tools/font/bdf/` (U8G2 2.36.18) | `cli/test/integration/fixtures/valid-project/fonts/`, `test/generated_fixture/assets/fonts/` | **Public domain** (the file's own `COPYRIGHT` property reads "Public domain font.  Share and enjoy."; recorded beside the fixture copy in `test/generated_fixture/assets/fonts/LICENSE`). Needs no attribution; it is listed here for provenance. | No: test fixtures only (`cli/package.json` `files` does not include `test/`; confirmed with `npm pack --dry-run`) |
| `arrow_mini.bdf`, a hand-written three-glyph font | `test/generated_fixture/assets/fonts/custom/` | MIT, as U8G2GL (its header carries `SPDX-License-Identifier: MIT`). Needs no entry beyond this line. | No |
| `logo_mark.png`, a generated 16x16 image | `test/generated_fixture/assets/` | MIT, as U8G2GL: written by `cli/test/fixtures/make-fixture-logo.ts` (SPDX MIT header), and a test proves the committed file is exactly its output. | No |
