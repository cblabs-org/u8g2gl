# bdfconv, compiled to WebAssembly

The files in this directory are **generated**. Do not edit them by hand.

| File | What it is |
|---|---|
| `bdfconv-wasm.json` | U8G2's `bdfconv`, compiled to Wasm, as base64 |
| `bdfconv-glue.generated.ts` | Emscripten's JavaScript loader for it, as an ES module |
| `bdfconv-source.json` | Provenance: U8G2 tag and commit, Emscripten version and commit, the exact compiler flags, and the sha256 of every file above |

`src/core/fonts/` loads these to compile `<bdf>` fonts (design_spec §14.1). The
same bytes run under Node in the CLI and in the browser in the designer.

## Regenerating

Regenerate only when the U8G2 submodule (`extern/u8g2`) or the pinned Emscripten
version changes. From `cli/`:

```bash
npm run build:bdfconv -- --emsdk /path/to/emsdk
```

- **Emscripten must be exactly 5.0.3.** The script refuses any other version
  and names both. It finds `emcc` through `--emsdk`, then the `EMSDK`
  environment variable, then `PATH`.
- It builds bdfconv from `extern/u8g2/tools/font/bdfconv/` by default; pass
  `--u8g2-path` (or set `U8G2_PATH`) to use another U8G2 tree.
- It rewrites all three files. A rebuild from the same inputs is byte-identical,
  including from a different checkout path.

Then run `npm test`. `test/bdfconv/provenance.test.ts` checks that the recorded
U8G2 commit matches both the submodule and `catalogue-source.json`, and that
every file's sha256 matches its record. `test/fonts/u8g2-oracle.test.ts` checks
that compiled fonts still equal U8G2's own shipped arrays byte for byte.

Emscripten is needed **only** here. Building, testing and installing the CLI
never need it.

## Licences

bdfconv is BSD-2-Clause (© 2017 olikraus) and Emscripten's generated loader is
MIT. Both notices ship in the npm package under `cli/LICENSES/`. See also
`THIRD-PARTY-NOTICES.md` at the repository root.
