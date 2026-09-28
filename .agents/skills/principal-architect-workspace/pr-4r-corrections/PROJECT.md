# PROJECT — PR-4R: corrections from PR-04's first emitted code

**Tier 2 · Principal Architect**
**Programme**: U8G2GL
**Parent**: [PROGRAM.md](../PROGRAM.md) (entry "Session — 2026-09-28 · PR-04 merged (#5); rulings; PR-4R raised")
**Source report**: [CA-BRIDGE-2026-09-28.md](../pr-04-generator/CA-BRIDGE-2026-09-28.md), items 3, 4, 5 and 7
<!-- Last updated: 2026-09-28 -->

## Mandate

Four ruled corrections, none open for re-litigation. design_spec is normative for each; where
it and the bridge prompt differ, the spec wins and the Chief Architect is told.

1. **Clamp bound draw-call arguments** exactly as the object path clamps them (§13.5). [D-18]:
   realisation is a generator outcome, never an authoring category, so it must not be observable.
2. **Restrict inline `style_*` to §10's nine properties** (§10).
3. **The runtime clamps a rounded box's radius at draw time**, keeping the build-time check.
4. **Shared lookup tables move to a neutral module.** Refactor, no behaviour change.

**Out of scope:** the font and image pipeline (PR-04b); new schema surface or manifest
vocabulary; [Q-14] dirty tiles; [Q-16] children following a container.

**Versions** (rules/03): runtime 0.4.0 → **0.5.0** (items 1 and 3); CLI 0.7.0 → **0.8.0**
(item 1 changes emitted output without an input change). **Schema stays 0.4.**

## Branch Strategy

Base: `main` @ `92de668`. Branches `u8g2gl-4r/wo<N>-<topic>`, stacked serially. Work happens in
a dedicated worktree, `../U8G2GL-4r`, so a parallel PR-04b session cannot move HEAD under it.

**WO1 ships as its own PR to `main`** ahead of the rest (CA ruling A), so PR-04b starts from a
clean `main`. WO2 onwards stack on `main` after WO1 merges; the Chief Architect releases PR-04b
on WO1's merge.

## Human Approval

**Owner, 2026-09-28 08:48 BST, verbatim:**

> I give you Approval to proceed autonomously for this PR now.

Given together with, and against, the Work-Order decomposition presented the same morning
(WO1 neutral tables · WO2 style overrides · WO3 radius clamp · WO4 bound-argument clamp ·
WO5 readability), and the following rulings, pasted by the owner **verbatim**:

> ADDENDUM to the PR-4R bridge — CA rulings, 2026-09-28
>
> A. A3. Move realise/ to core/realise/ as well as the shared tables. The
>    dependency runs one way: realise <- validator <- generator.
>    WO1 ships as its own PR to main, ahead of the rest of PR-4R, so PR-04b
>    can start from a clean main instead of waiting for the whole PR.
>    Tell me when WO1 is merged and I will release PR-04b.
>
> B. Yes — CPP_KEYWORDS moves in WO1 with the other shared tables.
>
> C. The bound is r <= min(w,h) - 1, for BOTH the validator and the runtime.
>    Derived from u8g2_box.c: xr = x + w - r - 1 in unsigned arithmetic, so
>    underflow needs r + 1 > w. The clean-capsule threshold (2r <= min - 1) is
>    NOT the bound: crossing it overlaps the corner discs, which is what a
>    capsule is.
>    RELAX WO11b's existing check from 2*(r+1) <= w to the bound above. It
>    currently refuses valid capsules. No warning for the capsule range —
>    overlapping corners are the intended look, and warning on them is noise.
>
> D. No exception. The switch stays in WO3: its default r = h/2 is inside the
>    bound for any h >= 2, so the clamp never touches it. Add a test asserting
>    the default switch renders identically before and after, so the next person
>    to tighten this bound finds out immediately.
>    The style-radius-on-a-switch finding closes with this; nothing to carry.
>
> I will add the bound to the spec once WO3 confirms it empirically, so the
> number is written down once and cited by both paths.

## Owner instruction — 2026-09-28 12:07 BST, verbatim

> continue - merge #6 and continue as suggested with radious bound.  Please mae sure you report findings on that to the CE at the end of the implementation

So: **WO1 merged** as #6 (`ca398ac`); **the radius bound is `2r <= min(w,h)`**, the PA's measured
bound, for both the validator and the runtime, in place of ruling C's `r <= min(w,h) - 1`; and the
measurement goes to the Chief Architect in a bridge when PR-4R's implementation is complete.
Ruling C's other parts stand: relax WO11b's check, no capsule warning. Ruling D stands.

## Work Order Decomposition

- [x] **[WO1 — shared tables and the realisation rule move to neutral modules](wo1-neutral-tables/WORKORDER.md)** ✅ `44953ac` · `u8g2gl-4r/wo1-neutral-tables` · base `main` · standard · item 4, rulings A, B · **own PR**
- [x] **[WO2 — inline `style_*` restricted to §10's nine](wo2-style-overrides/WORKORDER.md)** ✅ `e26d623` · `u8g2gl-4r/wo2-style-overrides` · base `main` @ `ca398ac` · standard · item 2
- [ ] **[WO3 — the rounded-box radius bound, in both places](wo3-radius-clamp/WORKORDER.md)** · `u8g2gl-4r/wo3-radius-clamp` · base WO2 · standard · item 3, rulings C, D · runtime 0.5.0 · bound `2r <= min(w,h)` (owner, 12:07)
- [ ] **WO4 — bound draw-call arguments clamp as objects do** · `u8g2gl-4r/wo4-bound-arg-clamp` · base WO3 · standard · item 1 · CLI 0.8.0, goldens move
- [ ] **WO5 — readability review and remediation** · `u8g2gl-4r/wo5-readability` · base WO4 · standard

WORKORDERs for WO2–WO5 are written at dispatch, against the code as it then stands.

**Ordering.** WO1 first because it moves the files WO2 edits and because PR-04b waits on it.
WO3 before WO4 so the runtime minor is bumped once, by the first runtime change. WO4 carries the
CLI bump so the goldens move once, for one stated reason.

## Open with the Chief Architect

### Ruling C's bound does not hold — measured 2026-09-28

The ruling's derivation is right about `xr = x + w - r - 1`, but that is not the first thing to
wrap. The band between the corners is `ww = w - r - r` and `hh = h - r - r` in `u8g2_uint_t`
(`u8g2_box.c:121–123` and the `hh` lines after it, at 2.36.18); it wraps as soon as `2r > w`, and
the `ww >= 3` test that follows then *passes*, so U8G2 draws a box of the wrapped width, clipped
only by the display.

Measured against the pinned submodule (`d66b49af`, 2.36.18), not reasoned: every `r` for
`drawRBox` and `drawRFrame` at 10×10, 11×11, 20×8, 8×20 and 2×2, a 128×64 full buffer, counting
pixels set outside the box. Host: macOS arm64, `U8G2_16BIT` (defined unconditionally by `u8g2.h`
on 32-bit and wider). Harness and full table: [evidence/rbox-bound/](evidence/rbox-bound/).

| Bound | Accepted cases that draw outside the box |
|---|---|
| `r <= min(w,h) - 1` (ruling C) | **30 of 68** — e.g. 10×10 `drawRBox` at r=6..9 sets **1310** pixels outside the box |
| `2r <= min(w,h)` | **0** — and every radius it refuses does draw outside |
| `2(r+1) <= min(w,h)` (WO11b today) | 0, but refuses 10 radii that draw cleanly |

So `2r <= min(w,h)` is the exact boundary: nothing it admits is wrong, nothing it refuses is safe.
It keeps every aim of ruling C: it **relaxes** WO11b (r=5 at 10×10 now passes), admits every
capsule including the switch's default `r = h/2`, and warns on nothing. Only the number differs.

**Resolved by the owner, 12:07:** WO3 uses `2r <= min(w,h)`; the Chief Architect gets the measurement in the closing bridge.

## Status Log

- **2026-09-28 08:48** — Owner approved the decomposition and rulings A–D (quoted above).
  Worktree `../U8G2GL-4r` created at `main` @ `92de668`; ruling C measured and found not to hold
  (above). WO1 dispatched.
- **2026-09-28 08:55** — Baseline measured in the worktree at `92de668`, each suite alone:
  **CLI 1055 tests / 62 files**, `tsc` and lint clean; **C++ 362 tests, one known skip**
  (`SizeOfReport.ThirtyTwoBitTarget`), 0 warnings. The bridge's 361 / 1044 predate WO14 (+1 / +11).
- **2026-09-28** — WO1 worker stopped, correctly, after the tables moved green (`e32830f`): moving
  `realise/` fails exactly one test, `validator-alignment.test.ts` "declares the object ceiling
  once", which pins the declaring file as `'generator/realise/model.ts'`. **PA ruling:** not a
  behaviour change — the assertion's intent is *declared once*, and the path it names is the one
  ruling A moves, so updating the literal implements the ruling. WORKORDER amended to allow
  exactly that class of edit (location literals of files this WO moves), listed in the report.
  Worker resumed. Surfaced to the owner in the same turn.
- **2026-09-28** — **WO1 complete, `44953ac`.** PA verified independently, each suite alone: CLI
  **1059 / 63 files** (1055 + 4 layering tests), `tsc` and lint clean; C++ 0 warnings, **362, one
  known skip**. Test-body edits: the one approved location literal plus one import line. Layering
  test re-proved by the PA (a `schema/` → `validator/` import fails, naming file and edge). No
  difference between table copies. Readability review: no P1–P3; one P4 (header whitespace,
  `resolver/mangle.ts:49`) carried to WO5. Worker findings carried: plain-object colour lookup in
  `emit/value.ts` (unreachable today); location-pinning tests make every move a test edit;
  `schema/index.ts` exports types only (public API deliberately unchanged). WO1 opened as its own PR.
- **2026-09-28 12:07** — Owner merged-on-instruction: #6 merged (`ca398ac`); radius bound set to
  `2r <= min(w,h)` (quoted above). Local `main` fast-forwarded; WO2 branched from `ca398ac` and
  dispatched. PR-04b may be released.
- **2026-09-28** — **WO2 complete, `e26d623`.** PA verified, each suite alone: CLI **1079 / 64**,
  `tsc`, lint clean; C++ 0 warnings, 362 / one skip; goldens unchanged; no existing assertion
  changed. One rule (`isStyleAttribute`, `schema/globals.ts`) used by validator and emission. The
  worker also applied it in `missingRequired()` (a refused override no longer satisfies `required`)
  and the substituted-value check; both follow from the rule and are accepted. Carried to WO5:
  `emit/screen.ts`'s `unknown` message is stale for a non-§10 setter prop (unreachable via the CLI);
  `style_text` suggests `style_font` where the useful remedy is the plain attribute; a `style_*` on a
  drawing element is refused with the setter message rather than §13.5's. WO3 dispatched on
  `u8g2gl-4r/wo3-radius-clamp`.
