PR-05: the runtime ships as a PlatformIO library

§16 says the runtime "ships as a PlatformIO library and an Arduino library". Before this PR it was
neither: there was no `library.json` and no `library.properties`. That blocked
`esp32-app-foundation` from depending on it. This PR makes the runtime a PlatformIO library that a
consumer can pin by git commit, and that fetches nothing it doesn't need.

**1. `library.json`.**
- Declares name `u8g2gl`, version 0.7.0, MIT, `frameworks: arduino`, and depends on
  `olikraus/U8g2 ^2.36.18`, the pinned submodule's tag.
- `export.exclude` keeps `cli/`, `docs/`, `test/`, `extern/` and `.agents/` out of any future packed
  archive.
- The author is named, with no contact address.

**2. The version is checked at configure time (§16, `rules/03`).** The runtime version is now
stated three times: `CMakeLists.txt`, `library.json` and `u8g2gl_version.h`.
- Configure refuses if `library.json` disagrees with the header, naming both values. It is read by
  regex, because `string(JSON)` needs CMake 3.19 and the floor is 3.16.
- Demonstrated: `library.json` set to 0.7.1 fails configure with "Runtime version mismatch:
  library.json says 0.7.1, include/u8g2gl/u8g2gl_version.h says 0.7.0".

**3. Every submodule is `update = none`.**
- **Why:** PlatformIO installs a git dependency with `clone --recursive` (6.1.19's `vcsclient.py`).
  Without this, every consumer would fetch `extern/u8g2` (about 200 MB) and two **private**
  `mm-skills` repositories, and the install would fail for anyone without access to them.
- **Measured:** both of PlatformIO's clone paths, for a branch or tag and for a commit, honour
  `update = none`. A fresh `git clone --recursive` is 13 MB, with no submodule populated.
- **Contributor-facing change:** contributors now initialise with
  `git submodule update --init --checkout extern/u8g2`. Plain `--init` skips silently. The CMake
  error message and the workspace bridge say so.

**4. One incidental version literal reads `package.json`.**
- `cli/test/integration/generate.test.ts:345` now reads `package.json`.
- The deliberate pin, "the 0.11.0 proof" at `:460-473`, stays. A stamp compared against the file it
  came from proves no bump happened.

**Verified end to end, twice.**
- **A scratch PlatformIO consumer:** `esp32dev`, `framework = arduino, espidf`,
  `lib_compat_mode = strict`, with `lib_deps` pinned to this branch's code commit. It was pinned
  before the history rewrite, which changed only `library.json`'s author field.
  - It builds green, with `u8g2gl @ 0.7.0` and `U8g2 @ 2.36.18` resolved.
  - The installed library is 10 MB, with `extern/` empty.
- **Foundation's integration PR** (the twin of this one) pins `82ec83f` itself. It builds
  `esp32dev` and `esp32s3nano` through PlatformIO, and its native suite passes at 1018/1018.

**Not in this PR:**
- **`library.properties`.** The Arduino 1.5 library format puts only `src/` on the include path,
  and the public headers are in `include/u8g2gl/`. Shipping it today would advertise an Arduino
  library that cannot compile. The Arduino half of §16 needs a layout decision first.

**Versions:** none move. The schema stays 0.4, the CLI 0.11.0 and the runtime 0.7.0. Metadata
changes no generated output and no API.

**Tests:** C++ **401** (one known skip, `SizeOfReport.ThirtyTwoBitTarget`), CLI **1338**, both
unchanged. Zero warnings. Both suites were run sequentially from a clean build by the PA.

**Merge order:** this PR merges **first**. Foundation's PR pins `u8g2gl` by commit (in
`platformio.ini` `[u8g2gl]` and in `test/render/CMakeLists.txt`), and is re-pinned to this PR's
merge commit on `main` before it merges.

**Findings for the Chief Architect**, measured while integrating the first real board, reported
and **not** fixed here:
1. **The runtime never establishes `setFontPosTop()`**, though every text widget assumes it. A
   plain `begin()` + `ui_handler()` user gets 15 lit pixels instead of 1392.
2. **The state saver restores a null font**, which segfaults on the first frame if no font was
   current.
3. **The state saver does not restore the font mode**, although it is readable through
   `font_decode.is_transparent`.
4. **A screen file not named `screen_*.xml` is silently ignored**, and reports "0 screens".
5. **The generated config's PlatformIO advice fails in a real build.** A project-wide `-include`
   breaks on the first unrelated library. A build middleware scoped to the runtime's sources works,
   and cuts the binding pool from 6144 B to 96 B.
6. **`frameworks: arduino` keeps the runtime out of native builds.**

The detail is in `pr-05-integration/PROJECT.md`.

Record: `.agents/skills/principal-architect-workspace/pr-05-integration/` (PROJECT.md, the WO-A
WORKORDER and this description).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
