# u8g2gl

Declarative UI for [U8G2](https://github.com/olikraus/u8g2) monochrome displays.

U8G2GL lets you describe an embedded display's screens in XML (layout, styles,
fonts, images and data bindings) and generates readable, heap-free C++ that
draws them with U8G2 on an ESP32, RP2040, STM32 or any other U8G2 target. This
package is its command-line tool: it validates a project, generates the C++,
and serves a designer in your browser where you edit the XML beside a live
pixel-exact canvas.

## Commands

Run it with `npx`, from a project directory (one containing `u8g2gl.xml`), or
install it as a development dependency.

```sh
npx u8g2gl validate            # check the project against the schema
npx u8g2gl generate            # validate, then write the generated C++
npx u8g2gl design              # open the project in the designer
```

- **`validate [path]`** checks every file and reports each problem with its
  file, line and column, and a stable code. `--fix-names` names unnamed
  elements in place.
- **`generate [path]`** writes the generated sources into the project's output
  directory (`generated/` by default), and only files it owns. The output is
  deterministic, so it is meant to be committed: an unchanged project
  regenerates to an empty diff, and `generate --check` fails in CI when the
  committed code is stale. Every run reports the screen's memory cost.
- **`design [path]`** starts a local server (127.0.0.1 only, with a per-session
  token in its URL) and opens the designer in your browser. `--no-open`
  prints the URL instead. The designer renders the built-in elements at once.
  Lost the tab? Run it again. It reopens the running session.
  Its Explorer's context menu shows a widget's C++ read-only and opens files
  in your own editor: `--editor <command>` (or `U8G2GL_EDITOR`) names it,
  such as `code`; otherwise the application your system associates with
  the file is used.

`u8g2gl --help` lists every command and option, including `--json` output.

## The toolchain for project widgets and Run

Drawing your project's own widgets in the designer, and the **Run** test (the
generated firmware run frame by frame against the canvas), compile C++ to
WebAssembly. That needs [Emscripten](https://emscripten.org/) at the exact
version the CLI pins. If the designer reports that there is no toolchain:

```sh
npx u8g2gl toolchain install
```

It asks before downloading anything and states the size first: about 1.3 GB
installed, about 2 GB once in use. It installs into your user cache directory,
never into the project, and an Emscripten you installed yourself at the pinned
version is used as it is (`u8g2gl toolchain status` shows which).

## The runtime library comes from PlatformIO

The generated C++ calls the U8G2GL runtime library, which your firmware gets
through PlatformIO (the library's `library.json`), not from npm. This package
carries a copy of the runtime's sources only so the designer can compile them
to WebAssembly.

Keep the two in step: generated code requires a runtime at least as new as the
one this CLI shipped with, and fails to compile with a message saying so
otherwise.

## Licence

MIT. The package also redistributes U8G2's sources and fonts and the
designer's bundled libraries under their own licences: see
`THIRD-PARTY-NOTICES.md` and the `LICENSES/` directory.
