# E-1e: The Shell

**Parent:** the editor track, `implementation_plan.md` §5. **Scope and acceptance criteria:**
[E1-DECOMPOSITION.md §1, E-1e](../e-d-editor-design/E1-DECOMPOSITION.md), approved by the owner
on 2026-10-26 (recorded in [e-d-editor-design/PROJECT.md](../e-d-editor-design/PROJECT.md)). The
interaction design is [EDITOR-DESIGN.md](../e-d-editor-design/EDITOR-DESIGN.md) §2 and §3.
**Base:** stacked on E-1d, `u8g2gl-e1d/wo5-readability` @ `51482b0` (PR #26, itself on E-1c #23).
**Worktree:** `../U8G2GL-e1e`.

## Purpose

The application: the shell `[UD-1]` specifies, served by `u8g2gl design` (E-1c), rendering with
the project editor Wasm (E-1d). Text editing in Monaco and a **read-only** canvas. Canvas editing,
the property panel and the palette are E-2's.

## Owner approval

Two instructions, verbatim:

> "approved - please proceed autonomously from this point on until you run out of quota.  Please spin up sub-agents as needed."

(2026-10-27, the standing instruction to continue the programme.) And, specifically for this PR's
dependencies and downloads, answering the PA's question whether E-1e could add its npm
dependencies and download Playwright's browsers:

> "Yes — E-1e may add Vite, React, Dockview and Monaco as dependencies and download Playwright's Chromium, Firefox and WebKit for its tests."

*Provenance note:* the second was sent through a reply button whose text the PA drafted; the
owner chose to send it. The owner did not review this Work-Order breakdown before it started;
E-1e's **scope** rests on the 2026-10-26 decomposition approval.

## Decomposition

| WO | Topic | Branch | ACs | Status |
|---|---|---|---|---|
| WO1 | `designer/` package: Vite, React, Dockview, Monaco; the ui_spec §6 layout; served by `u8g2gl design` | `u8g2gl-e1e/wo1-scaffold` | (structure) | In progress |
| WO2 | The live pipeline: one run per animation frame, diagnostics as markers and Problems rows, the canvas, the Wasm indicator, placeholders without a toolchain | `u8g2gl-e1e/wo2-pipeline` | e1, e6, e8 | Pending |
| WO3 | Saving and the IDE beside it: explicit save, reload, the three-way choice, generated names only on save; XML → canvas selection highlight | `u8g2gl-e1e/wo3-save` | e3, e4, e5 | Pending |
| WO4 | Playwright: e1–e8 end to end, the 16 ms performance test under 4× CPU throttle, three engines, a CI job | `u8g2gl-e1e/wo4-playwright` | e2, e7 (and e1–e8 end to end) | Pending |
| WO5 | Readability review and PA verification | `u8g2gl-e1e/wo5-readability` | all | Pending |

One worker, WO1 to WO4 in order.

## PA rulings

1. **Dependencies, exactly these** (owner-approved), in `designer/package.json` only, never in
   `cli/package.json`: `vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `dockview` (or
   `dockview-react`, whichever is the React binding), `monaco-editor`, `typescript`,
   `@types/react`, `@types/react-dom`, `@playwright/test`. Any other package, including a Monaco
   React wrapper, a state library or a CSS framework: **stop and report**. Exact versions, no
   ranges, and the lockfile committed. **Each version must have been published at least 14 days
   before it is added** (check with `npm view <pkg> time`): for example `vite` 8.3.4
   (2026-10-08), not 8.3.5 (2026-10-21).
2. **Playwright browsers** may be downloaded (owner-approved): Chromium, Firefox and WebKit, to
   Playwright's default cache. Nothing else is downloaded.
3. **`core/` as a library, not a copy.** The designer imports the CLI's isomorphic
   `cli/src/core/` through a Vite alias (or the built `cli/dist/core`), never a copy of its
   files. E-1a's architecture test keeps `core/` browser-safe.
4. **Serving.** `u8g2gl design` serves `designer/dist/` at `/` when it exists beside the CLI's
   source tree, replacing the placeholder page, and serves the project's built editor Wasm from
   E-1d's build cache at a token-checked route. The npm package shipping `designer/dist` is a
   packaging decision recorded as a follow-up (it joins E-1d's ruling 8.3), not E-1e's.
5. **The 16 ms target (e2) is measured, not assumed.** If keystroke-to-canvas p95 exceeds 16 ms
   under 4× throttle, report the stage breakdown; do not weaken the test. This is checkpoint C3.
6. **Boundary:** `designer/**`; `cli/src/node/design/**` for the static route and the Wasm route
   only; `.github/workflows/ci.yml` for one new job; the root `.gitignore` for `designer/`'s
   build output. Any other file: stop and report.
7. **No version bump** for the CLI unless generator output changes (it should not).

## Status log

- **2026-10-27.** Worktree created from E-1d's tip `51482b0`, `extern/u8g2` checked out. WO1
  issued.
