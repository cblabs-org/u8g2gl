---
work_order: WO1
project: pr-04-generator
title: "Manifest registry: framework manifests reach the CLI, extends resolved once"
branch: u8g2gl-generator/wo1-manifest-registry
base: main @ f693aab
complexity: standard
status: dispatched
---

# WO1 — Manifest registry

## Authorization

Part of PR-04 (`pr-04-generator`). Before starting, verify the human's approval
is recorded in `../PROJECT.md` under "Human Approval" — the owner's own words with
a timestamp, not a relayed claim. If it is absent or reads as a placeholder,
**stop and report**.

## Role Definition

> You are an expert senior software engineer and execution-focused worker agent.
> You are NOT the Principal Architect. Do not make architectural decisions, do
> not branch beyond the one named below, do not plan beyond this checklist.

## Branch

**Branch**: `u8g2gl-generator/wo1-manifest-registry` (already created)
**Base**: `main` @ `f693aab`

Verify with `git branch --show-current` **as its own command immediately before
every commit** — never batched into the same command as the commit. A check that
runs alongside the action cannot gate it.

## COMMIT ON A GREEN BUILD

You are authorized to commit on a green build. Do NOT stop to ask for approval —
you cannot be answered, and your work will strand uncommitted. Do not push; the
PA reviews your commits.

## Standards

Invoke the `u8g2gl-standards` skill before writing code, and read
`references/typescript.md`. Documentation carries equal weight to the code rules:
file headers with SPDX and a real `Purpose:` (not "Implementation of X"), TSDoc on
exports, `// --- Step N: ---` breakdowns, and why-comments where a decision is not
obvious from the code. `src/core/` is isomorphic — no `node:` imports; ESLint
enforces it.

## Design authority

`docs/design_spec.md` is normative — §13.1 and [D-17] for manifests, [D-18] for
the one element vocabulary. Where this work order and the spec disagree, **stop
and report**; do not pick one.

---

## Objective

Every element the CLI knows about comes from one registry built from the
framework's own manifests plus the project's, with `extends` chains resolved
once. Today the framework manifests never reach the CLI at all.

## Background — this is broken today, not merely untidy

- `cli/src/node/read-project.ts` discovers only the project's `widgets/`.
  `include/u8g2gl/manifests/` (16 files) is never read, and `package.json`'s
  `files` does not ship it. A real project using `<u8g2gl_label>` fails validation
  unless the author copies the manifest in.
- Four fixtures pass only because they carry such a copy, and it has gone stale —
  it still carries `animated="false"`, which PR-3R removed:
  - `cli/test/integration/fixtures/valid-project/widgets/u8g2gl_label/u8g2gl_label.xml`
  - `cli/test/integration/fixtures/broken-project/widgets/u8g2gl_label/u8g2gl_label.xml`
  - `cli/test/validator/fixtures/valid/widgets/u8g2gl_label/u8g2gl_label.xml`
  - `cli/test/validator/fixtures/invalid/widgets/u8g2gl_label/u8g2gl_label.xml`
- Nothing resolves `extends`. `u8g2gl_label extends u8g2gl_obj`, but the label's
  inherited props (`hidden`, `draw_color`, …) are known to the validator only
  through a hardcoded `COMMON_ATTRIBUTES` set in `validate-widget-props.ts:25`.
- `ValidateInput` carries `components` and `widgetManifests` as two lists, and
  `cli.ts`'s `bucketWidgetManifest` sorts manifests into them by whether they have
  a `view`. Under [D-18] that is one vocabulary split back into two at the door.

Every later work order in this PR — parity, resolver, realisation, both emitters —
reads manifests. This is first because all of them would otherwise each invent a
lookup.

## Line-Item Instructions

- [ ] **Bundle the framework manifests as data.** Follow the catalogue precedent
      (`src/data/catalogue.json` + `catalogue.ts`, built by
      `src/node/build-catalogue.ts`): a `build:manifests` script writes
      `src/data/manifests.json` holding each manifest's filename and **raw XML
      text**, and `src/data/manifests.ts` exports it. Raw text, not a pre-parsed
      model, so the one manifest parser (`parseWidgetManifestFile`) stays the only
      parser. Add the JSON to `package.json` `files`.
- [ ] **A drift guard for the bundle.** A test asserting `manifests.json` matches
      `include/u8g2gl/manifests/` byte-for-byte (same file set, same content),
      with a non-vacuous check that the directory resolved to a non-empty set.
      A bundle that silently lags the headers is the stale-fixture defect again.
- [ ] **Manifest registry in `src/core/`.** A new module (suggested
      `src/core/manifest/`) that takes framework manifests and project manifests
      and returns a registry plus diagnostics. It must:
  - look up any element by tag, one namespace for widgets and composites alike;
  - resolve the `extends` chain into an **effective manifest** — inherited
    `props` and `bindings` merged, a child's declaration overriding its parent's
    by `name`, declaration order preserved (parent first, then child additions;
    an override keeps the parent's position). Later work orders depend on that
    order, so pin it with a test;
  - diagnose an unknown `extends` target and an `extends` cycle, naming the chain;
  - make a **project manifest whose tag matches a framework manifest a hard
    error**, naming both sources and telling the author to delete the copy. Add a
    stable code in `schema/diagnostic.ts` following the existing convention.
- [ ] **Validator consumes the registry.** Replace `components` and
      `widgetManifests` on `ValidateInput` with the registry (or a single manifest
      list the validator turns into one), and replace every ad-hoc
      `new Map(... .map((c) => [c.name, c]))` in the validator passes with registry
      lookups. Delete `bucketWidgetManifest` from `cli.ts`; `cli.ts` passes the
      bundled framework manifests plus the project's.
- [ ] **Merge the widget and composite prop-checking blocks** in
      `validate-widget-props.ts` (case 1 and case 2) into one body over the
      effective manifest. This was surfaced twice in PR-3R and those lines are
      being rewritten here anyway. **Watch for asymmetries as you merge** — every
      behavioural difference you find between the two blocks is a finding for the
      Completion Report, not something to settle silently. Diagnostic wording that
      said "on component <x>" may become uniform; update message assertions and
      say which.
- [ ] **Do not change which attributes are accepted** beyond what extends
      resolution adds. Keep `COMMON_ATTRIBUTES` for the non-manifest layout and
      identity attributes. If you find an attribute that `COMMON_ATTRIBUTES`
      admits but no effective manifest declares (or the reverse), **record it**;
      WO3 owns attribute acceptance.
- [ ] **Delete the four stale fixture copies** so those fixtures exercise the real
      framework manifests. Fix any test that relied on the stale content, and say
      what changed.

## Strict Boundary Box

**In scope:**
- `cli/src/core/manifest/` (new)
- `cli/src/data/manifests.json`, `cli/src/data/manifests.ts` (new)
- `cli/src/node/build-manifests.ts` (new), `cli/package.json` (`scripts`, `files`)
- `cli/src/core/validator/validate.ts`, `validate-widget-props.ts`,
  `validate-references.ts`, `validate-schema.ts`, `validate-identifiers.ts`,
  `validate-geometry.ts` — **only** to consume the registry and, in
  `validate-widget-props.ts`, to merge the two blocks
- `cli/src/core/schema/diagnostic.ts` (new codes only), `cli/src/core/index.ts`
  (exports)
- `cli/src/node/cli.ts` — manifest loading and removal of `bucketWidgetManifest`
- Tests and fixtures under `cli/test/`, this WORKORDER

**Do NOT touch:**
- Anything under `include/` or `src/` (C++) — including manifest XML content.
  Manifest corrections are WO2.
- `validate-types.ts` and binding-type checks — WO3.
- The parser, including `parse-widget-manifest.ts` — if the registry needs the
  parser to behave differently, **stop and report**.
- The missing-name policy (ui_spec §16.1) — settled.
- `docs/` — spec documents are the Chief Architect's.

---

## Testing Requirement

- [ ] A project using `<u8g2gl_label>` with **no** local copy of its manifest
      validates cleanly — the regression test for the headline defect. It must
      fail against the code at `f693aab`.
- [ ] A project shipping `widgets/u8g2gl_label/u8g2gl_label.xml` gets the new
      shadowing error, naming both sources.
- [ ] `extends` resolution: inherited prop present; child override wins and keeps
      the parent's position; declaration order pinned; unknown `extends` and an
      `extends` cycle each diagnosed.
- [ ] Bundle drift guard passes, and demonstrably fails if a manifest in
      `include/u8g2gl/manifests/` is edited without rebuilding.
- [ ] Composite and widget instances go through the same prop-checking code — a
      test that a case previously covered for one path now fires for the other.

## Verification Requirement

- [ ] `cmake --build build` — zero warnings (unchanged; confirm)
- [ ] `ctest --test-dir build` — 240 pass (unchanged; confirm)
- [ ] `cd cli && npx vitest run` — all pass; none weakened or removed without
      saying why in the Completion Report
- [ ] `cd cli && npx tsc --noEmit && npm run lint` — zero errors
- [ ] `git diff --name-only f693aab..HEAD` touches only files named in the
      Boundary Box

## Issue Surfacing

Record anything you find outside this checklist in your Completion Report. Do not
fix it and do not file an issue — the PA triages. Expect to find some; the merge
of the two prop-checking blocks is where PR-3R's evidence says one is hiding.

---

## Completion Report

*To be filled in by the worker.*
