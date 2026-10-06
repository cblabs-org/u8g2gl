# PROJECT — PR-4R2: carried corrections from PR-4R

**Tier 2 · Principal Architect**
**Programme**: U8G2GL
**Parent**: [PROGRAM.md](../PROGRAM.md) — next after PR-04b, before PR-05
**Source**: Chief Architect bridge "PR-4R2: carried corrections from PR-4R" (pasted by the owner,
2026-10-05), carrying PR-4R's findings: [CA-BRIDGE-2026-09-28-PR4R.md](../pr-4r-corrections/CA-BRIDGE-2026-09-28-PR4R.md) items 3, 5, 6 and the radius help text
<!-- Last updated: 2026-10-05 -->

## Mandate

1. **A bound-geometry child of a container must not be observable as draw calls** (§13.5, [D-18]).
   **Priority: must not slip past PR-05.** Owner ruling 1 below decides *how*.
2. **A `time` subject bound to a coordinate** (§13.2): verify before building. Settled by probe; see
   Scoping findings.
3. **Check a radius at build time where the size is literal**, including a radius arriving by style
   (§10, bound `2·radius <= min(width, height)`, measured in PR-4R). Owner ruling 2 below sets *when*.
4. **State the radius bound in the manifest help** ([UD-5]).

**Out of scope:** new schema vocabulary; the schema version; [Q-14]; [Q-16] children following a
container; PR-09's events and focus rings; the spec text itself (the Chief Architect writes it; the
wording this PR needs is proposed below).

**Baselines to hold:** C++ **383** (one known skip, `SizeOfReport.ThirtyTwoBitTarget`), CLI
**1281**, **zero** warnings under `-Wall -Wextra -Wpedantic`. Schema **0.4** (owner decision, do
not bump). CLI **0.9.0**, runtime **0.5.0**, U8G2 **2.36.18** (`d66b49af`).

**Versions expected** (rules/03): CLI → **0.10.0** in WO1 (emitted output changes without an input
change). Runtime → **0.6.0** only if WO1 adds a public runtime helper. Each bumped once, by the
first WO that needs it.

## Branch Strategy

Base: `origin/main` @ `86d3f89`. Worktree `../U8G2GL-4r2` (the main checkout is parked on a stale
merged branch; PR-04b and PR-4R have their own worktrees). Branches `u8g2gl-4r2/wo<N>-<topic>`,
stacked serially, each based on the previous WO's branch by name. WO1's branch has **no upstream**
(it was created from `origin/main` and the tracking was removed so a bare `git push` cannot target
`main`). The stack tip opens as one PR against `main`.

## Scoping findings — PA probes, 2026-10-05

Measured against a build of `86d3f89`; projects and results in [evidence/probes/](evidence/probes/).

- **Item 1 reproduces.** A box with bound `x` inside a composite, and one with bound `width` inside
  a `u8g2gl_obj`, both emit unclipped draw calls; an object child is clipped to its ancestors by
  `u8g2gl_render_object()` → `u8g2gl_effective_clip()`. **But §13.5's text ("gets an object") can
  only refuse:** every class-backed element is already an object under [D-18]'s interim
  amendment, so the condition affects only drawing elements, which have no class, and the outcome
  would be `DRAWING_ELEMENT_NEEDS_OBJECT`. A bound box inside a composite (a level bar in a card)
  would become unwritable. Hence ruling 1.
- **Item 2: the attribute path is enforced; the gap is elsewhere.** `bind_x`/`bind_y` on a box or
  label to a `time` subject, written directly or forwarded through a composite's `type="subject"`
  prop, is refused with `TYPE_MISMATCH`. The finding as carried is stale. **The real gap:** a custom
  element's `<api>` may declare `<bind name="bind_when" type="time" setter="bind_x"/>`. It validates
  with zero errors and generates `ui_obj_w.bind_x(&ui_subject_t);`. Even with `type="int"` that call
  does not compile (missing origin argument), because geometry handling (origin, clamp, the
  bound-container anchor rule) is keyed by the binding's **name** in
  `cli/src/core/resolver/geometry-bindings.ts`, not by its `setter=`. Fails at C++ compile time,
  not silently, but PR-05 brings custom elements to real firmware.
- **Item 3 as written is vacuous.** The box refuses every style form, and button/switch (the only
  classes that read `radius`) declare it with `setter=`, so "radius, width and height all `draw=`"
  never admits a styled radius. A **literal** `radius="10"` on a 20×6 button also passes today.
  Hence ruling 2.

## Human Approval

**Owner, 2026-10-05 23:2x BST, verbatim**, in reply to the PA's scoping report and proposed
decomposition (rulings 1 and 2 as framed there, quoted in full below):

> 1) b is fine
> 2) agreed
> 3) approved ruling 2
> 4) approved decomp.
>
> Please proceed autonomously

### Ruling 1 — option (b), as put to the owner

> Emit the draw call inside the parent object's effective clip — the same
> `u8g2gl_effective_clip`/`u8g2gl_apply_clip` the object path uses, so the pixels match, which is
> what [D-18] actually requires. Needs a §13.5 wording change, CLI 0.10.0, possibly runtime 0.6.0
> if I add a helper. The editor host draws from the scene JSON too, so it needs the same clip.

### Item 2 plan — "agreed"

> Pin the attribute and composite paths with tests, and have the validator refuse a custom
> `<bind>` that points at a geometry setter under another name, or whose type the inherited
> `<bind>` with that `setter=` doesn't accept. Adds checks, not schema.

### Ruling 2 — approved, as put to the owner

> Check any element that declares `radius` (as `draw=` or `setter=`) where the radius (attribute
> or style) and width and height are all literal, against the measured bound as it stands. The
> worker measures button and switch first (the switch has a separate handle rect). The catch:
> labels inherit `radius` but ignore it, so a meaningless oversized radius on a label would also be
> refused.

Item 4 as proposed: the `radius` help in `u8g2gl_box.xml` **and** `u8g2gl_obj.xml` states the bound.

## Work Order Decomposition

- [x] **[WO1 — a bound draw-call child is clipped to its container](wo1-bound-child-clip/WORKORDER.md)** ✅ `68f89b6` · `u8g2gl-4r2/wo1-bound-child-clip` · base `main` @ `86d3f89` · architect · item 1, ruling 1 · CLI 0.10.0, runtime 0.6.0, scene format 3
- [x] **[WO2 — custom `<bind>` declarations are checked](wo2-bind-type-paths/WORKORDER.md)** ✅ `5ea99c6` · `u8g2gl-4r2/wo2-bind-type-paths` · base WO1 · standard · item 2
- [x] **[WO3 — radius checked at build time wherever it is literal](wo3-radius-build-time/WORKORDER.md)** ✅ `85685dd` · `u8g2gl-4r2/wo3-radius-build-time` · base WO2 · standard · items 3, 4, ruling 2
- [ ] **[WO4 — readability review and remediation](wo4-readability/WORKORDER.md)** dispatched · `u8g2gl-4r2/wo4-readability` · base WO3 · standard

WORKORDERs for WO2–WO4 are written at dispatch, against the code as it then stands.

**Ordering.** WO1 first: the priority item, and it carries the CLI bump so goldens move once for
one stated reason. WO2 and WO3 both touch the validator, so they stack rather than run in parallel.

## For the Chief Architect

- **§13.5 wording (ruling 1).** The last bullet of the realisation list cannot say "gets an object"
  — for a drawing element that is a refusal. Proposed: *"A drawing element inside a container whose
  geometry is bound is drawn inside its container's effective clip, exactly as an object child is,
  so an overhang is clipped either way and realisation is not observable ([D-18]). A child whose
  geometry is literal needs no clip: §7.2 already refuses one that overhangs."* Final wording
  after WO1 lands, citing what it emits.
- **Generated code checks the schema version only, never the runtime's** (WO1 finding). A CLI
  0.10.0 project with a bound container child fails against runtime 0.5.0 as a plain compile error
  on `u8g2gl_clip_scope`; one without compiles silently. Rules/03's guardrail covers schema, not
  runtime minimums. Worth a ruling before PR-05 ships generated code to firmware.
- **First test linking the runtime against real U8G2** (WO1 finding): under `ARDUINO`, `u8x8.h`
  adds `pins[]` to `u8x8_t`, so the existing `u8g2gl_u8g2_csrc` target (built without `ARDUINO`)
  had a different struct layout from the runtime's view of it and crashed. WO1 added
  `u8g2gl_u8g2_csrc_arduino`. Relevant to PR-06's pixel tests.
- **Spec debt (WO2):** new diagnostic `U8G2GL_GEOMETRY_BINDING_ALIAS`, not yet in §15. A custom
  `<bind>` may still alias an inherited **non-geometry** setter (`name="bind_foo"
  setter="bind_text"`) when the type matches — intended, and harmless.
- **PR-05:** a custom element may `extends="u8g2gl_box"` (a drawing element) and is accepted; it
  then emits a method call on a class with no such member (probe `d/`). PR-4R's "time above
  INT32_MAX goes negative" is reachable only through the custom-`<bind>` path WO2 closes.

## Session Log

- **2026-10-05** — Bridge received. PA probed all four items against `86d3f89` (findings above),
  put rulings 1 and 2 to the owner with the decomposition, and received approval (quoted). Worktree
  `../U8G2GL-4r2` created on `u8g2gl-4r2/wo1-bound-child-clip` from `origin/main`, upstream
  removed. Rule `00-operating-model.md` identical to the skill's asset.
- **2026-10-05** — **WO1 complete, `68f89b6`.** PA verified from a clean configure, each suite
  alone: C++ **391 / one skip**, 0 warnings; CLI **1288**, `tsc`, lint clean; built CLI reports
  **0.10.0**. Built CLI on probe `one/` plus a literal child: both bound container children emitted
  inside `u8g2gl_clip_scope clip(display, <objs>, <parents>, <parent index>); if (clip.drawable())
  { … }`, the literal child unwrapped, output compiles under `-Wall -Wextra -Wpedantic`. Real-U8G2
  pixel test (`test/test_bound_child_clip.cpp`): base sets 30 pixels outside the right edge and 56
  outside the bottom; tip sets 0; object control 0 at both. `u8g2gl_render_object()` now uses the
  same RAII scope; PA read the diff: same calls, same order, except the state saver now exists on
  the empty-clip return (a no-op restore). Goldens: `track_knob`'s clip block and the scene's
  version 3 and `"clip": 0` only. Carried to WO4: `u8g2gl_state_saver.h` still says clip lifetime
  belongs to `render_object`. Other findings are under "For the Chief Architect". WO2 dispatched on
  `u8g2gl-4r2/wo2-bind-type-paths`.
- **2026-10-05** — **WO2 complete, `c90228a` + `5ea99c6`.** First pass verified (CLI 1298); the
  worker surfaced that composite `<api>` `<bind>`s skip the §5 manifest loop; PA reproduced it
  through the built CLI (validates clean, emits `ui_obj_w.bind_x(&ui_subject_t)`) and amended the
  WO (`2138f7a`); same agent resumed. PA verified the tip: CLI **1301**, `tsc`, lint clean; C++
  untouched; goldens unchanged. Built CLI: probe `d/` and the composite case each refused with the
  alias and type errors at the `<bind>`; `int` variants the alias error alone; the committed
  fixture validates clean. One rule, `checkBindDeclarations()` in `validate-schema.ts`, reached
  from the widget and composite loops. Pin tests for the attribute and composite-prop paths pass
  at base and tip: **the carried finding as worded was stale**. WO3 dispatched.
- **2026-10-06** — **WO3 complete, `84dcbd5` + `85685dd`.** Measured first: over 18 sizes × radius
  0..min/2+2, the button (border layer 0, focused fill) and the switch track pass the requested
  radius to U8G2 unchanged **exactly when `2r <= min(w,h)`**, else `min/2`; pinned as
  `RadiusHonoured.*`. Inner border layers and the switch handle derive their radius from the outer
  one and are not checked. PA verified from a clean configure, each suite alone: C++ **395 / one
  skip**, 0 warnings; CLI **1319**, `tsc`, lint clean; goldens unchanged; `manifests.json` diff
  the two help strings. Built CLI: 20×6 switch with `style="round"` (radius 10) refused, "radius=10
  (from style 'round') … Use radius <= 3"; precedence attribute > `style_radius` > named style
  confirmed end to end; default switch accepted; both fixtures validate clean. One precedence
  function (`validator/configured-radius.ts`) mirrors `styleLines()`. A `setter=` radius's message
  says the runtime clamps it, not that U8G2 draws outside — correct for objects. Carried to WO4:
  `u8g2gl_draw.h` says an over-bound radius is "clamped, not refused", now incomplete.
- **2026-10-06** — Readability review over `86d3f89..HEAD` ([REVIEW.md](wo4-readability/REVIEW.md)):
  **no P1**; §4.1 clean on every added line, no pre-existing citation raised. P2: the stale clip
  ownership comment in `u8g2gl_state_saver.h`; `u8g2gl_draw.h`'s "clamped, not refused". P3:
  "Two rules" → three; step-comment format in `checkBindDeclarations`; the emitted render comment
  does not mention the clip. **PA decisions:** fix the emitted comment now (goldens move once,
  inside unreleased 0.10.0, no further generator bump); unify the radius message's tail on the
  runtime-clamp wording, because `u8g2gl_draw_box` clamps too and "U8G2 draws outside" is no longer
  what happens; P4 banner split skipped. Reviewer noted the main checkout's copy of
  `u8g2gl-standards` lacks §4.1 (this worktree's has it): for the owner. WO4 dispatched.
