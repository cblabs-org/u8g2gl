# Third-Party Notices

U8G2GL is licensed under the MIT License (see `LICENSE`). It depends on the
third-party components below, which carry their own licences.

| Component | Version | Licence | How U8G2GL uses it |
|---|---|---|---|
| [U8G2](https://github.com/olikraus/u8g2) | 2.36.18, pinned as the git submodule `extern/u8g2` | **Code:** BSD-2-Clause ("new-bsd", two-clause BSD licence).<br>**Fonts:** licensed **per font group**; each group's terms are listed in U8G2's `LICENSE` and on the U8G2 wiki page [fntgrp](https://github.com/olikraus/u8g2/wiki/fntgrp). | The submodule is used for **host tests** (compiling the runtime against U8G2's real headers), for **building the display catalogue** (`cli/src/node/build-catalogue.ts`), and for **building bdfconv to WebAssembly** (`cli/src/node/build-bdfconv.ts`). Nothing from U8G2's own sources is copied into U8G2GL's sources. **The npm package ships U8G2 in three forms:** the compiled bdfconv binary (`dist/data/bdfconv/`); the C sources and headers the design server's Wasm builds compile, unmodified, including `csrc/u8g2_fonts.c` with every built-in font (`framework/extern/u8g2/`, staged by `cli/scripts/stage-package.mjs`); and those compiled into the framework editor Wasm the designer bundles (`designer/framework-wasm/`). U8G2's `LICENSE`, with its font terms, travels with them as `framework/extern/u8g2/LICENSE` and `LICENSES/u8g2-BSD-2-Clause.txt`, and bdfconv's as `LICENSES/bdfconv-BSD-2-Clause.txt`. **Firmware gets U8G2 through its own dependency** (the PlatformIO library declares it), so an application receives U8G2 under U8G2's own terms, including the font-group terms for any font it uses. |
| [Emscripten](https://emscripten.org/) | 5.0.3 (`285c424dfa9e83b03cf8490c65ceadb7c45f28eb`), used to *build* the bdfconv artefact and the framework editor Wasm. A design session also uses it, as a toolchain the user consents to install (`u8g2gl toolchain install`); it is never part of the package | MIT (also offered under the University of Illinois/NCSA licence) | The JavaScript "glue" code Emscripten generates is shipped with each Wasm module the package carries: bdfconv's (committed as `cli/src/data/bdfconv/bdfconv-glue.generated.ts`, compiled into `dist/data/bdfconv/bdfconv-glue.generated.js`) and the framework editor Wasm's (`designer/framework-wasm/u8g2gl_editor.js`, built at pack time). Licence text in `cli/LICENSES/emscripten-glue-MIT.txt`. |

The authoritative licence text for U8G2 is `extern/u8g2/LICENSE` at the pinned
commit. The bdfconv Wasm artefact's exact build provenance — U8G2 commit,
Emscripten version and commit, and the flags used — is recorded in
`cli/src/data/bdfconv/bdfconv-source.json`.

## The designer bundle

`u8g2gl design` serves the designer, a browser application built with Vite
into the npm package's `designer/` directory. The bundle compiles in the
designer's production dependencies, so the package redistributes them. Each
is listed below with its licence; the licence texts are in the package's
`LICENSES/` directory (`cli/LICENSES/` in this repository). The list is the
designer's production dependency tree in `designer/package-lock.json`, and
`cli/test/packaging/notices.test.ts` fails when that tree gains a package this
table does not name, or a version here drifts from the lock file.

| Package | Version | Licence | Licence text |
|---|---|---|---|
| `react` | 19.3.0 | MIT | `LICENSES/react-MIT.txt` |
| `react-dom` | 19.3.0 | MIT | `LICENSES/react-MIT.txt` (the same text and copyright as React's) |
| `scheduler` | 0.28.0 | MIT | `LICENSES/react-MIT.txt` (the same text and copyright as React's) |
| `dockview-react` | 8.5.1 | MIT | `LICENSES/dockview-MIT.txt` |
| `dockview` | 8.5.1 | MIT | `LICENSES/dockview-MIT.txt` (the same text and copyright) |
| `dockview-core` | 8.5.1 | MIT | `LICENSES/dockview-MIT.txt` (the same text and copyright) |
| `monaco-editor` | 0.57.0 | MIT | `LICENSES/monaco-editor-MIT.txt`, and Monaco's own third-party notices, verbatim, in `LICENSES/monaco-editor-ThirdPartyNotices.txt`. The codicon icon font in the bundle (`designer/assets/codicon-*.ttf`) is shipped by `monaco-editor` as part of its package. |
| `marked` | 14.0.0 | MIT | `LICENSES/marked-MIT.txt` (a dependency of `monaco-editor`) |
| `dompurify` | 3.4.17 | MPL-2.0 OR Apache-2.0; redistributed here under **Apache-2.0** | `LICENSES/dompurify-Apache-2.0.txt` (a dependency of `monaco-editor`; the lock file pins it through the designer's `overrides`) |

`@types/trusted-types`, also in that tree, is TypeScript type declarations
only: no code from it reaches the bundle, so it is not redistributed.

## Icons: Lucide, vendored

The designer draws its icons from [Lucide](https://lucide.dev), **vendored**:
it is not an npm dependency, and nothing is fetched at run time. Updating it
is a deliberate change made with `scripts/update-icons.mjs`.

| Component | Version | Licence | How U8G2GL uses it |
|---|---|---|---|
| [Lucide](https://github.com/lucide-icons/lucide), as the `lucide-static` package | 1.61.0 | **ISC**. The icons Lucide derived from [Feather](https://github.com/feathericons/feather), listed in its licence, are also under Feather's **MIT** licence. | `scripts/update-icons.mjs` generates two files from the package: `cli/src/data/icons.json`, the icon **names** only (and Lucide's aliases for renamed icons), and `designer/src/icons/lucide-sprite.svg`, the icons' path data as one SVG sprite, which the designer bundle carries as an asset (`designer/assets/lucide-sprite-*.svg` in the package). Lucide's licence text, with Feather's, verbatim, is in `LICENSES/lucide-ISC.txt` (`cli/LICENSES/` in this repository). |

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
