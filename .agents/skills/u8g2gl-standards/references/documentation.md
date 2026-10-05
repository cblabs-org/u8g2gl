# Documentation Standards

The most frequently violated standards in any codebase, and the ones with the
longest-running cost. U8G2GL is read far more often than it is written — by the
next contributor, by whoever implements the generator against §13's contract, and
by agents that were not present when a decision was made. Undocumented code
forces every one of them to re-derive intent from mechanism, and they will
sometimes get it wrong.

Four layers, each answering a different question:

| Layer | Answers | Where |
|---|---|---|
| **File header** | What is in this file, and what does it export? | Top of every `.h`, `.cpp`, `.ts` |
| **Doxygen / TSDoc** | How do I call this, and what does it guarantee? | Every public declaration |
| **In-routine breakdown** | What are the stages of this algorithm? | Inside non-trivial functions |
| **Why-comments** | Why is it done *this* way? | Wherever a choice is non-obvious |

---

## 1. File headers

Every source file opens with a header block. Its most valuable part is the
**exported-symbol list**: it lets a reader learn a file's API without reading the
file, and it is the first thing anyone opening an unfamiliar header wants.

### C++

```cpp
/*
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 *
 * https://github.com/cblabs-org/u8g2gl
 *
 * SPDX-License-Identifier: MIT
 *
 * File: include/u8g2gl/u8g2gl_obj.h
 * Description: Base object for every visual element — geometry, flags, parent
 *              index for the flat hierarchy, resolved style, and the virtual
 *              tick/render lifecycle.
 *
 * Exported Classes:
 * - u8g2gl_obj: base class for all widgets
 *
 *     Geometry:
 *     - set_coords():        Position and size in device pixels
 *     - get_x/y/w/h():       Individual accessors
 *
 *     Visibility & flags:
 *     - set_hidden():        Exclude from rendering
 *     - has_flag():          Test a U8G2GL_FLAG_* bit
 *
 *     Hierarchy:
 *     - set_parent_index():  Index into the screen's flat object array
 *
 *     Data binding:
 *     - bind_text():         Bind display text to a subject
 *     - bind_flag_if_*():    Conditional flag from a subject's value
 *
 *     Lifecycle (virtual):
 *     - tick():              Advance animation; returns next deadline
 *     - render():            Draw to the U8G2 buffer
 */
```

**Group the exports by concern**, as above. A flat alphabetical list of thirty
methods is nearly useless; six groups of five is a map. Where a class implements
a contract, name the contract as the group.

### TypeScript

```ts
/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/display-catalogue.ts
 * Description: Builds the display catalogue from U8G2 source. Parses the
 *              u8x8_display_info_t structs rather than constructor names,
 *              because 34% of names do not yield a geometry by regex.
 *
 * Exports:
 * - DisplayRecord:        One display's resolved geometry, bus and framebuffer size
 * - buildCatalogue():     Parse a U8G2 source tree into records
 * - findDisplays():       Query the catalogue (identify / source / compare modes)
 */
```

### The rules

- **Every file gets one.** No exceptions for small files; a small file with no
  header is the one nobody can place.
- **SPDX identifier is mandatory** — `SPDX-License-Identifier: MIT`. It is
  machine-readable and it is how a downstream consumer audits licensing.
- **The `File:` path must match reality.** A stale path after a rename is worse
  than none, because it is confidently wrong.

### `Purpose:` — the field that does the real work

**A header block must open with why this module exists, not what it contains.**
The single most common failure is a description that restates the filename:

```
 * Description: Implementation of u8g2gl_tree.cpp        ← says nothing
 * Description: Declarations for u8g2gl_style.h          ← says nothing
```

A reader who opened the file already knows its name. What they do not know is
what problem it solves, what role it plays, and how it relates to the modules
either side of it. Give them that:

```
 * Purpose: Answers the only two questions the render loop asks about an
 *          object's ancestry — "am I actually visible?" and "what region may I
 *          draw into?" Hiding a container must hide its children, and a child
 *          must not paint outside its parent; both fall out of walking parent
 *          indices upward. This module exists so no widget has to know the
 *          hierarchy exists.
 *
 * Description: Two upward ancestry walks plus the rectangle intersection they
 *              share. Every walk is bounded and null-tolerant because it runs
 *              inside the render loop, where a bad pointer means a reboot
 *              rather than an exception.
```

**The test:** could a reviewer who has never seen this codebase read the header
block alone and say what the module is for, and why it is separate from its
neighbours? If not, the header is not finished.

Say explicitly where the module sits: what calls it, what it calls, and which
design decision it implements. A pointer such as "implements [A-3]" costs one
line and connects the code to the reasoning behind it.

---

## 2. Doxygen and TSDoc

Every **public** declaration carries a doc comment. Private helpers do when
non-obvious.

```cpp
/**
 * @brief Bind this object's text to a string subject.
 *
 * The object registers as an observer and re-renders when the subject changes.
 * Binding replaces any literal text; the two are mutually exclusive, and the
 * generator rejects a declaration that sets both.
 *
 * @param subject  Subject to observe. Must outlive this object — subjects are
 *                 statically allocated by generated code, so this holds by
 *                 construction for generated screens.
 * @param fmt      Optional printf format applied to the value. nullptr uses the
 *                 raw string.
 * @return false if the subject's observer capacity is exhausted; the binding is
 *         not registered. Capacity is declared per subject (§9.2).
 */
bool bind_text(u8g2gl_subject_string_base* subject, const char* fmt = nullptr);
```

**What earns its place:**

- `@brief` — always. One line, imperative, no full stop needed.
- `@param` — where the name alone does not carry it. `@param x X coordinate` is
  noise; the lifetime note above is not.
- `@return` — whenever a return value can surprise, especially a `bool` that
  means "failed" rather than "false".
- **Preconditions, lifetimes and failure modes** — the highest-value content, and
  the most commonly missing. A caller can guess what a setter does; they cannot
  guess that a pointer must outlive the object.

**What does not:**

```cpp
/** @brief Gets the X coordinate. */
int16_t get_x() const;                     // adds nothing — the signature said it
```

A trivial accessor may carry a one-line `@brief` or nothing. Do not pad.

**Document the contract, not the implementation.** A doc comment describing *how*
becomes wrong the first time the body changes; one describing *what is guaranteed*
survives refactoring.

### Function banners in implementation files

Doxygen lives on the **declaration**, in the header — duplicating the full
contract in the `.cpp` guarantees the two will drift.

But a reviewer reading the implementation should not have to jump to the header
to know what they are looking at. Give every non-trivial function in a `.cpp` a
short banner: one line on what it does, and a line per parameter *as the
implementation uses it*.

```cpp
// u8g2gl_effective_clip
// Computes the region an object may draw into: its own bounds intersected with
// every ancestor's. Walks upward from `index`.
//   objs    — flat array, document order; a null entry aborts to an empty rect
//   parents — parallel index array, or nullptr to use each object's own index
//   index   — the object whose clip is wanted
u8g2gl_rect u8g2gl_effective_clip(...)
```

This is orientation, not contract. It says what the parameters *are*; the header
says what the caller must *guarantee*. Keep it to a few lines — if the banner
starts restating the header, delete it and fix the header instead.

Trivial functions — a one-line accessor, a straight delegation — do not need one.
Where a run of them shares a rationale, annotate the *block* once rather than
each member; sixteen near-identical banners is noise that trains readers to skip
comments.

### Completeness — check the file, do not eyeball it

**Documenting headers and forgetting implementations is the single most common
way this standard is under-applied.** It happens because headers are where the
API lives, so attention goes there naturally and the `.cpp` looks "already
covered". It is not: the header carries the contract, the implementation carries
the reasoning, and the reasoning is what a reviewer cannot reconstruct.

Before calling a file done, enumerate its functions and account for every one —
either it has a banner, or it is trivial enough not to need one. Verify rather
than assume:

```bash
# Functions declared at file scope, and whether the line above is a comment
awk '/^[a-zA-Z].*\(/ && !/^\s/ { printf "%-6d %-60s %s\n", NR, substr($0,1,58),
     (prev ~ /^\/\//) ? "banner" : "— CHECK" } { prev=$0 }' src/file.cpp
```

Every `— CHECK` is a decision you must actually make, not a line to skim past.

The same applies to the four documentation layers: a file with a good header
block and no why-comments is not documented, it is labelled. Ask which of the
four are missing before you move on.

### What "high standard" means here

A reviewer new to the codebase should be able to open any single file and answer:

1. **What is this module for, and why is it separate from its neighbours?** —
   the `Purpose:` block
2. **What can I call, and what must I guarantee when I do?** — Doxygen on
   declarations
3. **What is this function doing, and what are its inputs?** — the banner
4. **What are the stages of this algorithm?** — step comments
5. **Why is it done this way rather than the obvious way?** — why-comments

If any answer requires reading another file, or reading the implementation to
understand the interface, the documentation is not finished.

---

## 3. In-routine breakdowns

Any function with distinct stages gets numbered section comments. This is house
style, used consistently across the author's codebases, and it is what makes a
40-line render path skimmable.

```cpp
void u8g2gl_screen::render(U8G2& display) {
    // --- Step 1: Clear the frame buffer ([D-4] full-frame redraw) ---
    display.clearBuffer();

    // --- Step 2: Draw every visible object in document order ---
    for (uint8_t i = 0; i < object_count_; ++i) {
        if (!is_effectively_visible(i)) continue;
        objects_[i]->render(display);
    }

    // --- Step 3: Push to hardware ---
    display.sendBuffer();
}
```

**Format:** `// --- Step N: <what this stage does> ---`

**When to use it:**

- Any function long enough that its shape is not obvious at a glance — roughly
  fifteen lines and up, but judge by structure rather than counting.
- Any function with a sequence that must happen in order, especially where the
  order is load-bearing. `init()` ordering in generated code is exactly this:
  construct → set properties → apply styles → **register bindings last**, so no
  observer fires against a half-configured object.
- Any algorithm where a reader would otherwise reverse-engineer the phases.

**When not to:**

- Short, single-purpose functions. A three-line accessor with a "Step 1" comment
  is noise, and noise trains readers to skip comments.
- As a substitute for extraction. If a function has nine steps, ask whether three
  of them are a function. Breaking it up beats annotating it.

**Name the stage's purpose, not its mechanism.** `// --- Step 2: Draw every
visible object in document order ---` tells a reader something. `// --- Step 2:
Loop ---` does not.

---

## 4. Why-comments

The highest-value comments in the codebase, and the ones no linter can require.

Code states *what* it does. It cannot state why it does that rather than the
obvious alternative — so a later reader "simplifies" it and reintroduces the bug.

```cpp
// Tile width must account for the sub-tile offset: a widget at x=6 w=12 spans
// pixels 6..17, which is tiles 0..2, not the 2 tiles (12+7)/8 would suggest.
// Getting this wrong leaves stale columns on the display.
int tw = ((x % 8) + w + 7) / 8;
```

Worth a comment:

- **A non-obvious formula**, as above.
- **A deliberate deviation** from the obvious approach, with the reason.
- **A decision reference.** `// Flat array with parent indices, not a tree — see
  [A-3]` costs one line and saves an argument.
- **A constraint from elsewhere** — a hardware quirk, a spec section, an upstream
  bug.
- **Anything discovered painfully.** If it took an hour to work out, write it
  down; the next person has the same hour to lose.

Not worth a comment:

```cpp
i++;  // increment i
```

**The test:** would a competent reader be surprised, or ask "why like that?" If
so, answer them.

### 4.1 What a comment may cite — durable references, not provenance

A comment is read by someone who was never here. That is this document's
governing test, and it settles cleanly what a comment is allowed to point at.

**Keep:**

- **Published references the reader can follow** — `§13.5`, `[D-18]`, `[A-3]`, a
  U8G2 function name, an upstream issue number.
- **Measured facts.** `// u8g2_DrawRBox's band is w - r - r, which wraps before
  the corner centre underflows` is evidence. It stays true and stays useful.

**Drop:**

- **Bare work-order tags** — `PR-04 WO9`, `WO3 item 5`. They name a workspace
  that never ships, so the reader cannot follow them anywhere.
- **Pointers to workspace files.** Same reason: the reader does not have them.
- **Narrated debate** — "the PA rejected the first approach here". The argument
  is settled; write the conclusion and its reason instead.

The rewrite is nearly always one line. `// WO3 item 5: clamp before the cast`
becomes `// Clamp before the cast: a bound width of 300 wraps int16_t (§13.2)`.
The provenance goes and the knowledge stays — which is the trade, because
provenance is what `git log` is for.

**This rule binds new and changed lines only.** Several hundred such citations
exist in older code. **They are not defects, and a reviewer must not raise
them.** Sweeping them would be a large diff with no behaviour change, churning
`git blame` across files people are actively reading, and a stale work-order
reference costs a reader a shrug. Fix one when you are already editing that
line, and not otherwise.

---

## 5. What to check when reviewing

In rough order of value:

1. **A header block whose description restates the filename** — "Implementation
   of foo.cpp" is worse than no description, because it occupies the space where
   the module's purpose should be and looks superficially complete. Check every
   `Purpose:`/`Description:` against the test above.
2. **Missing file header or SPDX** — mechanical, and grouped as one finding
   across many files rather than one per file.
3. **Public API with no doc comment** — especially anything with a lifetime
   requirement, a failure mode, or a non-obvious return.
4. **Long function with no breakdown** — a 40-line body with no structure.
5. **A non-obvious construct with no why-comment** — the costly kind, because the
   knowledge exists only in the author's head.
6. **Stale documentation** — a `File:` path that no longer matches, a `@param`
   for a removed parameter, a comment describing behaviour that has changed.
   **Treat stale docs as more serious than missing docs.** Absent documentation
   slows a reader down; wrong documentation actively misleads them.
7. **A comment citing a work order, a workspace file, or a past debate** — §4.1.
   **Only on lines the change under review touches.** Pre-existing citations are
   explicitly not defects and raising them is itself a review error.
