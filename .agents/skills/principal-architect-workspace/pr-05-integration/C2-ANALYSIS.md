# Gate criterion 2 — the line attribution and the "clearer" judgement

Criterion 2 (`docs/implementation_plan.md` §6, PR-07) reads:

> 2. The XML is materially shorter and clearer than the C++ it replaces.

PR-05 measured whole board against whole board — 138 authored lines migrated against 99 legacy —
and the Chief Architect ruled that this answers a different question, because the criterion says
"the C++ **it replaces**". This document does the reading that was asked for: it classifies every
line of the legacy board, says how many of those lines the XML actually took over, reconciles the
138, separates the testability refactor from framework cost, and gives the written "clearer"
judgement a line count cannot give.

**The verdict belongs to PR-07.** What follows is the measurement and the judgement it needs,
not a recommendation about what the programme should do.

---

## Method

- **What was read.** `esp32-app-foundation` at `origin/u8g2gl-integration/wo4-readability`,
  commit **`499142f8`** ("docs(pa): PR description for R10 (held), WO-B6/B7 and the device
  results"). That branch is **not merged**; everything here was read with
  `git show 499142f8:<path>` into a scratch directory. **Nothing was written to
  `esp32-app-foundation`.**
- **Which files.**
  - Legacy: `modules/U8G2Display/boards/DiagnosticsBoard.{hpp,cpp}`
  - Migrated: `modules/U8G2GLDisplay/boards/DiagnosticsScreenBoard.{hpp,cpp}`
  - XML: `uidesign/ssd1322-256x64/u8g2gl/{u8g2gl.xml,globals.xml,screens/screen_diagnostics.xml}`
  - Wiring: `src/main.cpp`
  - Generic host: `modules/U8G2GLDisplay/{U8G2GLScreenBoard,U8G2GLDisplay}.{hpp,cpp}`
- **How lines were counted.** Foundation's own committed `test/render/count_lines.py`, the same
  tool PR-05 used, so the kind totals (total / blank / comment-only / code) in this document
  reconcile line for line with `EVIDENCE.md` §2. A line with code and a trailing comment is code;
  a completely empty line inside a block comment is blank.
- **How concerns were attributed.** A second pass, described in §1, assigns every physical line of
  the legacy board to exactly one *concern*. The attribution was run as a script that (a) refuses
  to start if any line is assigned twice or left unassigned, and (b) prints kind subtotals per
  concern, which are checked to sum to `count_lines.py`'s own per-file figures. Both files
  reconcile exactly: `.cpp` 184 / 18 / 92 / 74, `.hpp` 125 / 14 / 84 / 27.
- **Re-deriving it.** The attribution is given below as explicit line ranges, so a reader who
  disagrees can re-run the arithmetic against the two files at `499142f8` without the script.

### The two commits, and why there are two sets of numbers

PR-05's `EVIDENCE.md` §2 reports the legacy `.cpp` as 173 lines and the XML as 33 code lines.
At the branch tip the same files are 184 and 34. The difference is one commit:

- **`a4a463e1`** "fix(display): legacy DiagnosticsBoard shows descenders, a real middle dot, and
  ellipsis" (2026-10-10) — the R8 defect fixes, applied to the **legacy** board. It added 11 lines
  to `DiagnosticsBoard.cpp` and 10 to `DiagnosticsBoard.hpp`, and **20 of those 21 lines are
  layout-concern** (the three `ROW*_HEIGHT` constants and their derivation, the three
  `setTruncated(true)` calls, the Latin-1 font switch). `94941a76` made the matching change on the
  XML side.
- PR-05's figures were taken at **`a6288ed8`** (the WO-B3 evidence commit, 2026-10-07), before
  both. Counted at `a6288ed8` the XML is 137 / 17 / 87 / 33 — exactly `EVIDENCE.md` §2's row — and
  the legacy board is 288 / 30 / 163 / 95, which with the four `main.cpp` lines is its 99.

So the honest answer needs both columns. **The tip is the primary measurement**, because the tip
is the code the cut-over would actually delete. PR-05's commit is given alongside so the two
documents can be laid against each other.

---

## 1. The line attribution

### 1.1 Classification rules

Every physical line of the two legacy board files gets exactly one concern:

| | Concern | What goes in it |
|---|---|---|
| **L** | Layout, positioning, typography | Coordinates, widths, heights, alignment, font choice, overflow behaviour, and the includes that supply fonts and the label widget. **This is the concern the XML claims.** |
| **D** | Draw dispatch | The calls that put the widgets on the display. |
| **F** | Data fetch, formatting, publication | Platform reads (WiFi, `millis()`, heap), the `snprintf` formats, the buffers they write into, the 1-second throttle, and the `setText()` that hands the result to a widget. |
| **B** | Class scaffolding and lifecycle | Function signatures and braces, section banners, the own-header include, the dependency-pointer assignment, `isExpired()` and `getBoardName()`. |
| **H** | File-level boilerplate | The licence / SPDX / module header block. |

And the rules that decide the hard cases — these are the places to disagree:

1. **Kind** (blank / comment / code) is `count_lines.py`'s, never re-decided here.
2. A **code line's** concern is what the statement does.
3. A **comment-only line's** concern is what its text is about. A *structural* comment line with
   no concern content — `/**`, ` */`, a `// =====` banner, an empty line inside a block comment —
   takes the **dominant** concern of the entity it documents, where dominant means the concern
   holding the most code lines in that entity's body.
4. A **function's signature line and its braces are B**, whatever the body does. This is deliberate
   and it is conservative *against* the XML: it means the XML never gets credit for deleting a
   function's existence. Someone who thinks `render()`'s signature should count as D would move
   two more lines into D.
5. A **blank line** belongs to the block that follows it; a blank inside a block belongs to that
   block.
6. An **include** takes the concern of what it supplies.

Applied to `499142f8`, the assignment is:

**`DiagnosticsBoard.cpp` (184 lines)**

| Concern | Lines |
|---|---|
| H | 1–21 |
| B | 22, 30–33, 50, 58–64, 76–77, 102, 117, 153, 163, 168, 169–184 |
| L | 24, 34–49, 51–54, 65–66, 68, 71–73, 75, 83–101 |
| D | 154–162, 164–167 |
| F | 23, 25–29, 55–57, 67, 69–70, 74, 78–82, 103–116, 118–152 |

**`DiagnosticsBoard.hpp` (125 lines)**

| Concern | Lines |
|---|---|
| H | 1–27 |
| B | 28–31, 33, 36–39, 45–46, 48–51, 55–58, 60–61, 65, 67–70, 73–76, 78, 81, 83–99, 125 |
| L | 32, 40–44, 52–54, 100–115 |
| D | 71–72 |
| F | 34–35, 47, 59, 62–64, 66, 77, 79–80, 82, 116–124 |

### 1.2 The counts

**At the tip (`499142f8`), both legacy board files:**

| Concern | Total | Blank | Comment | **Code** |
|---|---:|---:|---:|---:|
| Layout, positioning, typography (**L**) | 72 | 7 | 41 | **24** |
| Draw dispatch (**D**) | 15 | 1 | 10 | **4** |
| Data fetch, formatting, publication (**F**) | 88 | 9 | 37 | **42** |
| Class scaffolding and lifecycle (**B**) | 86 | 14 | 41 | **31** |
| File-level boilerplate (**H**) | 48 | 1 | 47 | **0** |
| **TOTAL** | **309** | **32** | **176** | **101** |

Split by file: `.cpp` is L 47/16, D 13/4, F 67/36, B 36/18, H 21/0 (total/code);
`.hpp` is L 25/8, D 2/0, F 21/6, B 50/13, H 27/0.

**At PR-05's commit (`a6288ed8`)**, derived by subtracting the `a4a463e1` diff line by line
(10 L lines from the `.hpp`, 10 L and 1 F from the `.cpp`):

| Concern | Total | **Code** |
|---|---:|---:|
| L | 52 | **18** |
| D | 15 | **4** |
| F | 87 | **42** |
| B | 86 | **31** |
| H | 48 | **0** |
| **TOTAL** | **288** | **95** |

95 code lines in the two files plus the four `src/main.cpp` lines is PR-05's **99**. The
attribution therefore partitions PR-05's own number without altering it.

### 1.3 So how many of legacy's lines did the XML replace?

**The direct answer: 24 code lines at the tip, 18 at PR-05's commit.**

Those are the L lines, and the XML really did take all of them — the migrated
`DiagnosticsScreenBoard.{hpp,cpp}` contain **zero** layout code lines. No coordinate, no width, no
height, no font, no alignment, no truncation flag appears anywhere in the migrated C++. The
concern left the language entirely.

A further **4 code lines** (D) also left the board, but they went to `U8G2GLScreenBoard::render()`
in the generic host, not to the XML. Crediting those to the XML would be wrong; crediting them to
U8G2GL would be fair. The ceiling for "what adopting U8G2GL removed from this board" is therefore
**28 code lines of 101** (tip) or **22 of 95** (PR-05's commit). The other 73 code lines — the
platform reads, the three `snprintf`s, the throttle, the class scaffolding — are still hand-written
C++ in the migrated board, as they must be.

**And what the XML cost.** The three XML files are 34 code lines / 128 total at the tip
(33 / 137 at `a6288ed8`). They are not all layout:

| XML part | Total | **Code** | What it is |
|---|---:|---:|---|
| `screens/screen_diagnostics.xml`, all of it | 58 | **13** | the four rows (8 lines) plus `<?xml>`, `<screen>`, `<view>` and their closers |
| `globals.xml` `<fonts>` block (lines 33–41) | 9 | **5** | three `<builtin>` font declarations plus the block's own tags |
| `globals.xml` `<subjects>` block (lines 18–31) | 14 | **6** | four string subjects — the *publication channel*, not layout |
| `globals.xml` envelope and header | 19 | **3** | file boilerplate |
| `u8g2gl.xml`, all of it | 28 | **7** | project scaffolding — target, setup constructor, output dir. **Paid once per project, not per board.** |

So the fair like-for-like — the XML that carries the layout concern, against the legacy lines that
carried it:

| Comparison | Legacy | XML | Change |
|---|---:|---:|---:|
| Code lines, layout concern (incl. file/block envelopes) | 24 | 18 | **−25%** |
| Code lines, layout *statements* only (no envelopes, no includes) | 22 | 11 | **−50%** |
| Total lines an author reads for the layout | 72 | 67 | **−7%** |

At PR-05's commit the same three rows are **18 → 17 code lines (−6%)**, 16 → 10 statements (−38%),
and **52 → 76 total lines (+46%)**. The tip flatters the XML here, because `a4a463e1` added six
layout code lines to the legacy board and only one to the XML: the closer the legacy board gets to
correct, the better the XML compares.

**Against the Chief Architect's own yardstick** — "if the XML replaced 60 lines of layout C++ the
criterion is met; if it replaced 20, it is not" — the answer is **18 or 24**, at the bottom of that
range. That yardstick was an informal framing rather than a rule, so it is reported here as what it
is; but on it, the reading does not rescue the criterion.

---

## 2. Reconciling 138 against 33 + 99

There is no missing-line error. `EVIDENCE.md` §2's "After" table has **three** authored rows, not
two, and the brief quotes two of them:

| Part | Total | **Code** |
|---|---:|---:|
| XML (three files) | 137 | **33** |
| `DiagnosticsScreenBoard.{hpp,cpp}` | 330 | **99** |
| `src/main.cpp` — 6 lines | 6 | **6** |
| **Authored, this board** | **473** | **138** |

**The missing 6 are the six `src/main.cpp` lines**, which `EVIDENCE.md` lists individually at
`a6288ed8`: line 91 `#include "U8G2GLDisplay.hpp"` (new), 92 `#include
"boards/DiagnosticsScreenBoard.hpp"` (changed), 94 `static DiagnosticsScreenBoard
diagnosticsBoard;` (changed), 212 `U8G2GLDisplay::begin();` (new), 213
`diagnosticsBoard.configure(&app.getWifiManager());` (unchanged), 215
`displayModule.carousel.add(&diagnosticsBoard);` (unchanged). The legacy side carries the matching
four lines (91, 93, 211, 213), which is why its total is 99 and not 95. All three rows were
verified at `a6288ed8` and reproduce exactly: 137 + 330 + 6 = 473, and 33 + 99 + 6 = 138.

**Why it reads as an error.** The two numbers collide. The migrated board's two C++ files hold
**99** code lines, and the legacy board's whole authored footprint is also **99** code lines
(24 + 71 + 4). Any sentence saying "the board's C++ is 99" is ambiguous between them, and
`EVIDENCE.md` §2's prose uses the figure for both within a few lines of each other — "99 code lines
in the two board files, 6 in `main.cpp`" for the migrated side, and "the legacy board is 99 lines
of code" above it. That is a readability defect in `EVIDENCE.md`, not an arithmetic one, and it is
worth a clarifying edit if that file is revisited.

At the tip the same three rows are 128 + 333 + 8 = **469 total**, and 34 + 99 + 6 = **139 code**,
against a legacy 313 / **105**. The direction PR-05 reported is unchanged: **total authored code
rose, by 39% at PR-05's commit and 32% at the tip.** That finding stands independently of
everything in §1.

---

## 3. How much of the growth is the testability refactor

The migrated board carries a structure the legacy board does not: `readDiagnosticsInputs()` (the
only code that touches WiFi, `millis()` and the heap), `formatDiagnostics()` (pure, so a host test
can drive it with fixed inputs), and the two value types they pass, `DiagnosticsInputs` and
`DiagnosticsLines`. WO2's work order required this split so the render harness could hold the two
boards pixel-identical. It is not a cost U8G2GL imposes — a board could publish to subjects from
one inline `tick()`, exactly as the legacy board formatted inline.

**Method.** A counterfactual `DiagnosticsScreenBoard.{hpp,cpp}` was written in scratch, collapsing
the split back into `tick()` and keeping everything else: the same header block, the same Doxygen
blocks (reused verbatim where they survive), the same three `snprintf` formats, the same throttle,
the same three `ui_set_diag_*()` publications, and private `char` buffers in place of
`DiagnosticsLines`. It was counted with the same `count_lines.py`. It is a paper construction — it
was **not compiled** — and its comment density is inherited from the real files rather than chosen,
but the reader should treat the split figure as an estimate of about ±5 lines, not an exact number.

| Version | Total | Blank | Comment | **Code** |
|---|---:|---:|---:|---:|
| Migrated board as shipped (`499142f8`) | 333 | 35 | 199 | **99** |
| Counterfactual, split collapsed into `tick()` | 189 | 23 | 107 | **59** |
| **Attributable to the testability refactor** | **144** | 12 | 92 | **40** |

**So 40 of the migrated board's 99 C++ code lines — 40% — are the read/format split, and 144 of
its 333 total lines.** Most of the total-line share is documentation: the split introduces two
public free functions and two public structs, and house style gives each of them a Doxygen block
and an entry in the header's Exported-* lists.

Separating the two gives the framework-only comparison:

| | Legacy (tip) | Migrated as shipped | Migrated without the split |
|---|---:|---:|---:|
| XML code lines | — | 34 | 34 |
| Board C++ code lines | 101 | 99 | 59 |
| `main.cpp` code lines | 4 | 6 | 6 |
| **Authored code lines** | **105** | **139** (+32%) | **99** (−6%) |

**The 32–39% growth PR-05 reported is almost entirely the testability refactor.** Strip it and the
migrated board is a few lines *below* legacy. That is the fair correction to make to PR-05's
headline — and it cuts both ways, because what remains is not a saving either. On authored code
lines the framework is close to neutral for this one board: **it does not cost, and it does not
pay.** What it buys has to be argued on clarity and on the second board, not on this count.

For completeness, the costs not in any column above, because they are not authored by this board:
the generic host `U8G2GLScreenBoard` + `U8G2GLDisplay` is 401 lines / 86 code, and
`uidesign/.../generated/` is 377 lines / 145 code of machine output. The host and `u8g2gl.xml` are
paid once; a second board adds an XML screen, its subjects, and a C++ feeder.

---

## 4. Is it clearer? A judgement

**Where the XML is plainly clearer, and it is the main thing it does.** In the legacy board, row 2
is specified in **seven places across two files**: `DiagnosticsBoard.hpp:108` for its height
constant, `:113` for the widget member, `DiagnosticsBoard.cpp:52` for x / y / width, `:86` for
alignment, `:93` for truncation, `:99` for the font, and `:137` for the text. Six of those are
layout. To answer "what does row 2 look like?" a reader assembles the answer from a constructor
initialiser list, a header constant, and three separate blocks of `configure()`. In the XML it is
one element of two lines — `screen_diagnostics.xml:47–48` — carrying x, y, width, height, font,
overflow mode and the bound subject together. That is a real and significant improvement, and it is
the improvement the criterion is reaching for. The vocabulary is better too: legacy writes
`_row2.setAlignment(0);  // LEFT` and `_row1.setAlignment(1);  // CENTER`, magic integers rescued by
a trailing comment, where the XML writes `align="center"` or says nothing and gets left by default;
legacy's `setTruncated(true)` becomes `long_mode="dots"`, which names the behaviour rather than a
boolean. And the XML quietly makes an existing dishonesty honest: the legacy constructor takes
`displayWidth` and `displayHeight` and computes `displayWidth - 8`, implying a board that adapts to
any panel, while `y = 16, 30, 44` and `displayHeight` being discarded with `(void)displayHeight;`
say otherwise. The XML writes `width="248"` and does not pretend.

**Where it is not clearer, and this is not a small list.** Reading the migrated board end to end
now means reading three artifacts in two languages plus a generator's conventions. To follow the
WiFi row you read `bind_text="diag_wifi"` in `screen_diagnostics.xml`, find `<string
name="diag_wifi" max_len="63"/>` in `globals.xml`, know — from nowhere in either file — that the
generator turns that into `ui_set_diag_wifi()`, and then find that call in
`DiagnosticsScreenBoard.cpp:160`. Legacy's equivalent is `_row2.setText(_wifiLine)`: one hop,
resolved by the compiler and by any editor's go-to-definition. The XML also introduces a coupling
nothing enforces: `max_len="63"` in `globals.xml` must agree with `char wifi[64]` in
`DiagnosticsScreenBoard.hpp:96`, and the only thing holding them together is a comment in each file
saying so. Relatedly, every row's text is now buffered twice — once in `DiagnosticsLines`, once in
the generated subject — where legacy buffered it once. And the hard part of this screen is
unchanged: the heights 18 / 14 / 12 are still `getMaxCharHeight() + 1` values that cannot be
derived from anything visible in the artifact you are reading. Legacy explained that in five
comment lines beside the constants; the XML explains it in eighteen (`screen_diagnostics.xml:20–37`)
because it must also explain the runtime's centring arithmetic. The framework did not abstract the
font-metric problem away; it moved the explanation.

**The honest summary.** On the one question it exists to answer — *what is on the screen and
where* — the XML is clearly better, and a designer or a reviewer looking at the layout is better
served. On the question *how does this board work end to end*, it is **not clearly clearer**: it
trades one indirection the compiler checks for three the reader must hold in their head, and it
adds a silent cross-file invariant. The gain is concentrated and real; the loss is diffuse and also
real. Note too that "the XML" is 13 code lines but **58 lines to read**, 38 of them comment — the
layout artifact is not materially smaller to read than the layout C++ was (67 lines against 72),
because the reasoning the C++ carried had to go somewhere and it went into the XML. That is the
right place for it. It is not a reduction.

---

## 5. Verdict

**Criterion 2 is met on "clearer", in part and on a narrow reading; it is not met on "materially
shorter", on any reading I can construct from these two files.**

Taking the two halves separately, because they diverge:

- **"Materially shorter" — not met.** On the Chief Architect's own reading, the XML replaced **24
  legacy code lines** (18 at PR-05's commit) and cost **18 code lines** of layout XML — a 25%
  reduction, or 6% at PR-05's commit. Measured in lines a reader actually reads, 67 against 72, a
  7% reduction, or a 46% *increase* at PR-05's commit. On the whole-board reading, authored code
  rose 32% at the tip and 39% at PR-05's commit. No framing of the files yields a material
  shortening, and the narrowest framing that does look good — 11 layout statements against 22, a
  halving — is also the one that excludes the file envelopes and all the comments, which is to say
  most of what an author writes and reads.
- **"Clearer" — met in part.** Row geometry moving from seven scattered sites to one declarative
  element is a genuine and significant improvement. It is partly offset by a three-artifact,
  two-language indirection chain, a name-matched binding the compiler does not help with, and an
  unenforced `max_len` / buffer-size invariant. §4 is the written judgement the criterion asks for.

Two findings matter to PR-07 beyond the verdict, and both correct PR-05's headline:

1. **The growth was not framework cost.** 40 of the migrated board's 99 C++ code lines are the
   testability refactor WO2 required. Without it the migrated board is 99 authored code lines
   against legacy's 105. On this measure the framework is approximately neutral for one board — it
   neither costs nor pays, which is a different and more useful statement than "+39%".
2. **The layout concern left C++ completely.** All 24 layout code lines are gone from the migrated
   C++; four more went to the base class. That is the structural claim U8G2GL is making, and it is
   true. Whether a 25% line reduction on that concern counts as "materially shorter" is the
   question in front of the gate, and it is a judgement about the word "materially", not a
   measurement that is still missing.

**One scope caveat.** This is one board, four labels, no animation, no conditional visibility, no
second screen. The strongest case for U8G2GL on line count — the marginal board, which reuses the
86-code-line host and the 7-line project file — is not measured here because no second board exists.
A criterion about a framework, decided on its first and only consumer, is being decided at the point
where the framework looks worst. That is a fact about the evidence available, not an argument for
any particular verdict.

---

## What this does not show

- **One board, one screen.** Four static labels on a 256×64 panel. Nothing about screens with
  animation, state, conditional visibility, or more than one view.
- **No second-board measurement.** The per-board marginal cost, which is where the argument for the
  framework is strongest, is a projection in `EVIDENCE.md`, not a measurement, and remains so.
- **Nothing about flash, RAM, build time or pixels.** Those are criteria 1, 3 and 4, measured in
  `EVIDENCE.md` §§1, 3, 4 and in `pr-05r-runtime-fixes/CRITERION-1.md`.
- **The counterfactual in §3 was not compiled.** It is a paper construction for the purpose of
  separating two costs; its comment density is inherited, not chosen, but it is still my
  construction and the 40-line figure should be read as approximate.
- **The concern attribution is a judgement**, not a measurement. The rules in §1.1 are written out
  so a reader can reject a specific one. The two rules most likely to move the answer are rule 4
  (signatures and braces are scaffolding, which costs the XML credit for `render()`) and rule 3
  (structural comment lines follow the dominant concern, which drives most of the 41 L comment
  lines). Rejecting rule 4 moves 2 code lines; rejecting rule 3 could move a dozen comment lines
  between L and B, and would not change any code-line figure.
