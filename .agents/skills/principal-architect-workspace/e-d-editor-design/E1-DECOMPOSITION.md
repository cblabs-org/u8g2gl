# E1-DECOMPOSITION: E-1 as Buildable PRs

**E-D WO3.** 2026-10-26, against `main` @ `fdf75ed`.
**Design:** [EDITOR-DESIGN.md](EDITOR-DESIGN.md). **Measurements:** [LOOP-BUDGET.md](LOOP-BUDGET.md).

E-1 was one ledger row covering three kinds of work: a filesystem layer, a CST parser and
serializer, and an application shell. The served-first ruling (owner, 2026-10-26) adds a
fourth, the project editor Wasm, and replaces the File System Access layer with a design
server. Here it is as **five PRs**. Each has a strict boundary and acceptance criteria a
reviewer can check from the PR alone.

**Conventions for every PR below:**
- Baselines held: C++ **512** tests (one known skip), CLI **1353**, zero warnings. Schema
  **0.4** is never bumped. Runtime 0.10.0 and CLI 0.13.1 move only under
  `.agents/rules/03-versioning.md`.
- Workers load the `u8g2gl-standards` skill. The `readability-reviewer` agent audits each PR
  before it is submitted.
- **Merge commits, not squash** (`.agents/rules/04-branch-hygiene.md`).
- "AC" means acceptance criterion. Every AC names the artefact or command that checks it.

---

## 1. The PRs

### E-1a · CST and lossless round-trip

**Purpose.** The document model `[UD-3]` requires. It preserves every byte, records an exact
range for every part, and turns an editing intent into a minimal text edit.

**In scope.** A new module `cli/src/core/cst/`:
- `parseCst(text, file)` builds a tree of nodes. Element nodes carry name, attributes,
  children and self-closing form. Attribute nodes carry a name range, a value range, the quote
  character, and the **raw** value text (entities undecoded) alongside the decoded value.
  Text, comment, processing-instruction, CDATA and whitespace trivia are nodes too. Every node
  carries `[start, end)` **offsets**, with line and column derived from them.
- `printCst(cst)` reproduces the input text.
- Edit functions, each returning `TextEdit[]` (`{ start, end, text }`) and never a new document:
  `replaceAttributeValue`, `insertAttribute` (placed after the last attribute, matching the
  element's own attribute layout: same line, or one per line with that indentation),
  `removeAttribute`, `insertElement` (indentation copied from the nearest sibling, or the
  parent's plus one step), `removeElement` (its own lines only, never an adjacent comment),
  `renameElementTag`.
- Well-formedness diagnostics, with the same codes as today's tokeniser.

**Out of scope.** Any consumer: the parser keeps using today's tokeniser until E-1b.
Incremental parsing, because LOOP-BUDGET §5.3 shows a full parse costs 0.2 ms at 100
elements. Formatting.

**Boundary box.** `cli/src/core/cst/**`, `cli/test/cst/**`. Nothing else.

| AC | Criterion | Checked by |
|---|---|---|
| a1 | `printCst(parseCst(t)) === t`, byte for byte, for **every `.xml` file in the repository** (105 at `fdf75ed`), found by glob at test time so new files join automatically | A test over `git ls-files '*.xml'` |
| a2 | The same holds for a synthetic corpus the repository lacks. It has **no CRLF file and one file with entities**, so it must include: CRLF and mixed line endings, a BOM, tabs, single and double quotes, `&amp;`/`&#x…;` in values, comments before the root, between attributes' lines and inside text, CDATA, an XML declaration and none, a trailing newline and none | Named test cases, one per item |
| a3 | Every edit function changes **only** the bytes of its target: the diff of before and after touches only the target's lines, and for `replaceAttributeValue`, **one line** | A diff-line-count assertion on every edit test |
| a4 | A value with entities round-trips: replacing `a &amp; b` with `a & c` writes `a &amp; c`, and quote style is preserved | Tests |
| a5 | Ranges are exact: for every attribute in a1's corpus, `text.slice(value.start, value.end)` is its raw value | A test over a1's corpus |
| a6 | Malformed input gives the same diagnostic code and location as today's tokeniser on every malformed fixture under `cli/test/` | A parity test running both |
| a7 | Isomorphic, with no dependencies: no `node:` import, and no new `package.json` dependency | **A new architecture test** forbidding `node:` imports anywhere under `cli/src/core/`. None exists today: `layering.test.ts` checks layer order and explicitly ignores `node:` specifiers, so `core/`'s isomorphism, which [D-10] and the whole designer rest on, has never been enforced |
| a8 | Full parse of the stress100 screen (LOOP-BUDGET §1) at **under 1 ms** median in Node | A benchmark test, reported but not gating, because CI machines vary |

---

### E-1b · The parser on the CST, closing [Q-17]

**Purpose.** **One** parser for the generator and the designer. Today's tokeniser is replaced
under the existing parser by the CST, so every diagnostic can point at an attribute's exact
range, and the designer's ranges and the validator's are the same ranges.

**In scope.**
- `xml-tokeniser.ts`'s tree builder is replaced by a CST → `RawXmlDocument` adapter.
  `RawXmlAttribute` gains `nameRange` and `valueRange`, and `RawXmlElement` gains `range`.
  Existing `loc` fields stay, derived from the ranges, so no consumer has to change.
- The manifest parser records and uses attribute ranges. Every diagnostic named in [Q-17]
  (an `extends` naming an unknown element, a drawing element or a cycle; a `<bind>` refused by
  §13.1) is located at the **attribute**, with the offending text.
- `xml-tokeniser.ts` is deleted once nothing imports it.

**Out of scope.** Any change to generated output, including the scene. Putting ranges into
`ui_scene.json` is E-2's job, because it changes generator output and so needs a CLI version
bump. E-1b must not need one.

**Boundary box.** `cli/src/core/parser/**`, `cli/src/core/schema/source-location.ts`, the
manifest parser's diagnostic sites, and their tests.

| AC | Criterion | Checked by |
|---|---|---|
| b1 | **All CLI tests pass unchanged** (1353 at baseline), except tests whose *expected* location for a [Q-17] diagnostic moves from the element to the attribute. Each such change is listed in the PR description | `npm test` |
| b2 | **Every golden is byte-identical.** No generator version bump | CI's §13.9 determinism check passes with the CLI version unchanged |
| b3 | Each [Q-17] case reports the attribute's line and column and its offending text. design_spec §21's Q-17 row is then closed | New tests, one per case |
| b4 | No second parser: `xml-tokeniser.ts` is deleted, and nothing in `cli/src` parses XML except `core/cst/` | `git grep` in the PR description |
| b5 | Validator cost is no worse: LOOP-BUDGET's Node bench at no more than 1.2× the WO1 medians for parse and check on the probe and stress100 projects | The bench script from `evidence/wo1/` |

---

### E-1c · The design server

**Purpose.** `npx u8g2gl design`: the served-first ruling's server. It serves the editor and
the project, watches files, and runs builds. **Never in the per-edit loop.**

**In scope.**
- A `design` command in the CLI's node layer (`cli/src/node/design/`). It binds **127.0.0.1
  only**, on a free port, and opens the browser at a URL carrying a random per-session token.
- The `ProjectFileSystem` interface (`[UD-2]`) in `cli/src/core/`, with operations `read`,
  `write`, `list` and `watch`. It has two implementations: **served** (the browser half, over
  HTTP plus a server-sent-events or WebSocket channel) and **in-memory** (for tests, and for
  any future static mode).
- Writes confined to the project directory by the same real-path rule `load-project.ts`'s
  `isInsideProject` applies (§13.10). The two share one function, not two copies.
- A watcher that pushes `changed`, `added` and `removed` events for project files.
- A second `u8g2gl design` in the same project attaches to the running server (a lock file
  holding the port).
- A build endpoint and a job queue, empty until E-1d registers its job.

**Out of scope.** The editor application (E-1e) and Wasm builds (E-1d). The server serves a
placeholder page until E-1e lands.

**Boundary box.** `cli/src/node/design/**`, `cli/src/core/project-fs/**` (the interface and
the in-memory implementation), `cli/src/node/cli.ts` (registering the command), and their tests.

| AC | Criterion | Checked by |
|---|---|---|
| c1 | A request **without the token** is refused (403) on every route, including the event channel | Tests |
| c2 | **No write escapes the project**: `..`, absolute paths, and a symlink pointing outside are all refused | Tests, sharing the existing write-boundary cases |
| c3 | The server is reachable only on loopback | A test that asserts the bound address |
| c4 | An external edit to a project file produces a `changed` event within **200 ms** | A test that writes a file and times the event |
| c5 | The served and in-memory `ProjectFileSystem` implementations pass **one shared contract test suite** | Tests |
| c6 | `core/` stays isomorphic: the interface and in-memory implementation have no `node:` import | E-1a's new architecture test (a7) |
| c7 | A second `u8g2gl design` in the same project attaches and prints the running URL. A stale lock (dead PID) is detected and replaced | Tests |

---

### E-1d · The project editor Wasm

**Purpose.** The served-first ruling's other half. The Wasm the canvas renders with is built
from **this** project, with its real widget C++, and is current with it. This PR also fixes
every bridge limitation WO1 found (LOOP-BUDGET F6, F10).

**In scope.**
- **A managed toolchain.** `u8g2gl toolchain install | status | path` installs **Emscripten
  5.0.3, pinned**, into the user's cache directory (`~/Library/Caches/u8g2gl/` on macOS,
  `$XDG_CACHE_HOME/u8g2gl/` on Linux, `%LOCALAPPDATA%\u8g2gl\` on Windows), after asking for
  consent and stating the size (about 1.6 GB installed). It verifies the download, and never
  touches an emsdk the user installed themselves. If one is already on `PATH` at exactly 5.0.3,
  it is used.
- **A build job** registered with E-1c's queue:
  1. `generate` the editor and firmware targets into a build cache, not into the project.
  2. Compile the registry, the project's widget `.cpp` files, and its font and image units.
     The runtime and U8G2 are compiled once per U8G2GL version and cached.
  3. Link at `-O1`, or `-O3` for a test run (EDITOR-DESIGN §5.2).
  4. Embed the **build hash**, a hash of every input.
- **The bridge driven by the project, not the fixture.** Fonts and images come from the
  project's generated units, through a table the generator emits, not names in `bridge.cpp`.
  Subject string capacity, the display buffer and every ceiling come from the project's
  `u8g2gl_generated_config.h` ([D-21]). This removes the 128-byte string cap, the 2 KB buffer
  cap and the fixed constants in `editor_config.h`.
- **Placeholders.** For an element whose class is unknown, `applyScene()` builds everything
  else, draws a placeholder in that element's rectangle (EDITOR-DESIGN §5.4), and reports the
  element in a list (`getPlaceholders()`). It no longer fails the whole scene.
- **The platform-header rule.** A widget that includes `Arduino.h`, an ESP-IDF header or a
  FreeRTOS header gets one diagnostic naming the header and the rule (EDITOR-DESIGN §5.3).
- **A CI job** building the framework editor Wasm and running `wasm/test/snapshot.test.mjs`.
  It is the first Wasm build in CI (F10).

**Out of scope.** The test-run harness (EDITOR-DESIGN §4.4, its own PR). Filling collections
by name (§9; that is PR-08's to design). Any change to the firmware target's output.

**Boundary box.** `wasm/**`, `cli/src/node/toolchain/**`, `cli/src/node/design/build/**`,
`cli/src/core/generator/emit/editor-registry.ts` (the font and image table),
`.github/workflows/ci.yml` (the new job), and their tests. **Any edit to a generator emit file
changes editor-target goldens**, so it takes the CLI patch bump that
`.agents/rules/03-versioning.md` requires.

| AC | Criterion | Checked by |
|---|---|---|
| d1 | **G-PROBE-2's departures project renders with its real widgets, unmodified.** `message_text max_len="256"` is accepted (it is refused today) | A test building the project at `g-probe2-widgets/evidence/probe-project` and rendering its scene |
| d2 | A widget edit rebuilds in **at most 2 s** on the reference machine (LOOP-BUDGET §4 measured about 1.1 s) | A timed test, reported |
| d3 | A scene naming an unknown class renders every other element **pixel-identically** to the same scene with that element removed, apart from the placeholder's own rectangle. `getPlaceholders()` names it | A test |
| d4 | The build hash changes when, and only when, an input changes: a widget source, a manifest, a font, an image, or the generated config | Tests |
| d5 | **Firmware is unaffected.** Firmware goldens are byte-identical, and the existing check that firmware binaries carry no editor code still passes | CI's determinism check; `test/CMakeLists.txt`'s existing check |
| d6 | A widget including `Arduino.h` produces the one named diagnostic, located at the `#include` line | A test |
| d7 | CI builds the Wasm and runs the snapshot test on Linux. **Checkpoint C2** additionally records a clean-account install on macOS arm64 and Linux x64 | CI; C2's note to the owner |
| d8 | `bridge.cpp` names no fixture font or image, and has no capacity literal | Review; `git grep` in the PR description |

---

### E-1e · The shell

**Purpose.** The application: the shell `[UD-1]` specifies, served by E-1c, rendering with
E-1d's Wasm. Text editing and a **read-only** canvas. Canvas editing is E-2.

**In scope.**
- `designer/`, a new top-level package: Vite, React, Dockview and Monaco (`[UD-1]`). The CLI's
  `core/` is consumed as a library, not copied.
- The layout of ui_spec §6, with E-D's additions (EDITOR-DESIGN §2.2): activity bar, explorer,
  tabbed Monaco editors for XML, Problems, Output, and the status bar with the editor-Wasm
  indicator.
- The live pipeline of EDITOR-DESIGN §3.2: at most one run per animation frame, validator
  diagnostics as Monaco markers and Problems rows (click to land on the fault), and the canvas
  rendering the active screen at a chosen zoom.
- **Saving and the IDE beside it**, exactly as EDITOR-DESIGN §2.3 sets out: explicit save, a
  silent reload of a clean buffer, a three-way choice for a dirty one, and generated names
  written into the buffer on open and to disk only on save.
- Selection from XML to canvas, highlight only.

**Out of scope.** Direct manipulation, the property panel and the palette (E-2). Sample data
(E-3). The test run (its own PR).

**Boundary box.** `designer/**` and a `design` route in E-1c serving its build.

| AC | Criterion | Checked by |
|---|---|---|
| e1 | Open the departures project. Edit `x` on `row0` in Monaco, and the canvas shows it in the next frame | A Playwright test |
| e2 | **Keystroke to canvas, p95 under 16 ms, with Chromium's CPU throttled 4×**, on the departures project and a 20-element screen, measured over 300 keystrokes. **This is checkpoint C3** | A Playwright performance test using the CDP throttle |
| e3 | Saving after one edit changes **only** that edit's bytes on disk | A test diffing the file |
| e4 | A file changed on disk while its buffer is clean reloads. While it is dirty, the user gets the three-way choice and **nothing is overwritten** | Tests |
| e5 | A file opened and closed without an edit is **not rewritten**, even with names generated in the buffer | A test checking mtime and bytes |
| e6 | A Problems row opens the file at its line and column | A test |
| e7 | It runs in **Chromium, Firefox and Safari**: served mode needs nothing Chromium-only | Playwright across its three engines |
| e8 | A project with no toolchain still opens: framework elements render, project widgets show placeholders, and the status bar says why | A test with the toolchain path unset |

---

## 2. Order and parallelism

```
            ┌── E-1a CST ──► E-1b parser on CST (Q-17) ──┐
 E-D ──────►│                                             ├──► E-2 canvas editing, panel, palette
            └── E-1c server ──► E-1d project Wasm ──► E-1e shell ──┘        │
                                                                             ├──► Test run
                                                                             └──► E-3 sample data (needs PR-08 §9, see C6)
```

- **Two independent streams.** E-1a and E-1b touch `cli/src/core/{cst,parser}`. E-1c, E-1d and
  E-1e touch `cli/src/node/design`, `wasm/` and `designer/`. They share no files, so they can be
  built in parallel, one writer per stream.
- **The critical path is E-1a → E-1b → E-2.** The shell does not wait on the CST, because it edits
  text in Monaco and renders through today's parser. Only canvas *editing* needs CST ranges.
  This corrects the editor-track note in `implementation_plan.md` §5, which reads as if the
  serializer blocked everything.
- **E-1b goes first in its stream, and early.** It refactors the core of a CLI with 1353 tests,
  and it is safest while nothing in the designer depends on it.

## 3. What E-2, E-3 and the test run inherit

| PR | Inherits from E-D |
|---|---|
| **E-2** | Canvas editing through CST edit functions (EDITOR-DESIGN §3.5–§3.7). Scene `source` gains a **range**, with the CLI patch bump that requires. The panel follows the [Q-10] and [Q-19] rulings (EDITOR-DESIGN §7). It ships without the §8 schema features. **AC:** edit to pixels p95 under 16 ms with the full shell and a scripted 300-frame drag, CPU throttled 4× (§3.4). **AC:** every canvas gesture is one undo stop and a minimal diff (a one-line diff for a nudge). **Checkpoint C4** follows E-2's panel |
| **Test run** (proposed new row) | A firmware-target harness in Wasm (EDITOR-DESIGN §4.4), the parity verdict and the diff overlay, and Run (⌘↵) with an opt-in to run after a pause. **AC:** the departures project's test-run frame equals its live frame for the same sample set, by SHA-256 |
| **E-3** | [U-6] (leaning: `samples/*.json`, ignored by `generate`). **Collection sample data depends on PR-08 meeting EDITOR-DESIGN §9's requirement.** Checkpoint C6 |

---

## 4. Proposed Tier-1 text

E-D does not edit Tier-1 documents. Below is the text proposed for the Chief Architect to land,
or the owner to approve verbatim.

### 4.1 `ui_spec.md` `[UD-2]`: a second amendment, after the 2026-10-05 one

> *Amendment, 2026-10-26 (owner, E-D).* The decision stands as written. Its sequencing changes
> again: **served mode is built first, and static mode is deferred.** The premise is the owner's
> 2026-10-24 ruling that a designer has the full toolchain installed for building a U8G2
> application, which is true of every user this release serves. Served mode is required because
> a real project's screens are custom widgets (G-PROBE-2), whose C++ must be compiled into the
> editor's Wasm, and a browser page cannot run a compiler. `npx u8g2gl design` builds that Wasm
> with a pinned Emscripten the CLI manages, and is never in the per-edit loop: rendering stays
> in-browser, per `[UD-4]`. One `ProjectFileSystem` keeps static mode possible. It is to be
> reassessed at the checkpoints E-D set (EDITOR-DESIGN.md §10), and built when a user without a
> toolchain asks.

### 4.2 `implementation_plan.md` §5: the editor-track ledger

Replace the E-1 row with:

| PR | Repo | Scope | Depends |
|---|---|---|---|
| **E-1a** | U8G2GL | CST with lossless round-trip and minimal-edit functions (`[UD-3]`), in `cli/src/core/cst/` | E-D |
| **E-1b** | U8G2GL | The parser on the CST; attribute ranges in every diagnostic, closing [Q-17]. Output byte-identical | E-1a |
| **E-1c** | U8G2GL | `u8g2gl design`: loopback server with a token, `ProjectFileSystem` (served and in-memory), watcher | E-D |
| **E-1d** | U8G2GL | Project editor Wasm: managed pinned Emscripten, a project-driven bridge (fixes LOOP-BUDGET F6), placeholders, build hash, Wasm CI | E-1c |
| **E-1e** | U8G2GL | The shell: Vite, React, Dockview, Monaco; live diagnostics; save and conflict handling; read-only canvas | E-1c, E-1d |

Amend E-2's depends to **E-1b, E-1e**. Add a row:

| **E-2T** | U8G2GL | Test run: firmware-target harness in Wasm, parity verdict against the live frame | E-2 |

Amend E-3's depends to **E-2 · blocked by [U-6] · collection data needs PR-08 to meet EDITOR-DESIGN §9**.
Replace the paragraph "E-1 is not one PR and will not be decomposed until E-D lands" with a
pointer to this document. Correct "only the serializer is on anyone's critical path" to name
the path E-1a → E-1b → E-2 (§2).

### 4.3 A requirement for PR-08's bridge, crossing tracks

> **From E-D (EDITOR-DESIGN.md §9).** A declared-capacity collection (§9.2) must be **fillable by
> name** through the editor registry: a generated thunk, as `[UD-4]` already generates for
> construction and properties, that accepts rows for a named object. Without it, the designer
> cannot show sample data in any collection widget. LOOP-BUDGET F7 measured both of the
> departures board's service lists as blank. It is cheap to design in and expensive to add after
> PR-08's API is fixed.

### 4.4 Corrections to existing text

EDITOR-DESIGN.md §11 lists them: items 1, 2, 5, 6 and 7 are Tier 1's to correct. E-1a closes item 8, and E-1d items 3 and 4.
