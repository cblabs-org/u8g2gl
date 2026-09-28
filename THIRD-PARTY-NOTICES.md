# Third-Party Notices

U8G2GL is licensed under the MIT License (see `LICENSE`). It depends on the
third-party components below, which carry their own licences.

| Component | Version | Licence | How U8G2GL uses it |
|---|---|---|---|
| [U8G2](https://github.com/olikraus/u8g2) | 2.36.18, pinned as the git submodule `extern/u8g2` | **Code:** BSD-2-Clause ("new-bsd", two-clause BSD licence).<br>**Fonts:** licensed **per font group**; each group's terms are listed on the U8G2 wiki page [fntgrp](https://github.com/olikraus/u8g2/wiki/fntgrp). | The submodule is used only for **host tests** (compiling the runtime against U8G2's real headers) and for **building the display catalogue** (`cli/src/node/build-catalogue.ts`). Nothing from it is copied into U8G2GL's sources or published packages. **Applications get U8G2 through their own dependency** (PR-05's integration module declares it), so they receive U8G2 under U8G2's own licence terms, including the font-group terms for any font they use. |

The authoritative licence text for U8G2 is `extern/u8g2/LICENSE` at the pinned
commit.
