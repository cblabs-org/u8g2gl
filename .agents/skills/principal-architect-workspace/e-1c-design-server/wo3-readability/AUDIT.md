---
name: e-1c-wo3-readability
description: Remediate readability, documentation and provenance-pointer defects in the E-1c design-server diff
complexity: mechanical
---

# AUDIT — E-1c readability and documentation

**Scope reviewed:** `git diff origin/main..HEAD -- cli/` on `u8g2gl-e1c/wo2-server` (worktree `.`): `cli/src/core/project-fs/*`, `cli/src/node/design/*`, `cli/src/node/project-path.ts`, edits to `cli/src/node/cli.ts` and `load-project.ts`, and their tests.
**Reviewed:** 2026-10-27
**Standards:** `u8g2gl-standards` skill (SKILL.md, documentation.md, typescript.md). TypeScript naming (PascalCase / camelCase / kebab-case files) was checked against the TS table; no naming defects.

## Objective

The code is well documented: every file has an SPDX header with a real `Purpose:`, `File:` paths are true, and public declarations carry TSDoc. What remains is (a) workspace pointers in comments and test names that the reader cannot follow, and (b) security-relevant checks whose reasoning lives only in the file header, not at the line. No P1 defects; no core/ `node:` imports; no `any`.

## Strict Boundary Box

**Do NOT touch:** behaviour. Comments, test titles, doc text only. Test *assertions* stay (including `toContain('E-1e')` — change only together with the page text, see P2-1).
**Do NOT:** create branches, open PRs, rebase, merge, commit or push (owner decision).
If a fix seems to need a behaviour change (see Observations O-1, O-2), stop and surface it.

## Tooling Constraints

From `cli/`: `npm run build`, `npm test` (sequentially), lint if configured. Zero warnings; all tests pass, none weakened.

## Line-Item Instructions

Rule for pointers (documentation.md §4.1): keep the fact, drop the pointer. Every item below is on added lines, so the "new lines only" limit does not excuse them.

### P1
None.

### P2 — Workspace pointers (per instruction) and security checks with no why-comment at the line

- [x] **Resolved.** **Acceptance-tag pointers in source comments.**
  - `src/node/design/design-server.ts:50` `/** The only address the server binds (c3). */` -> `/** The only address the server binds: loopback, so no other machine can reach it. */`
  - `src/node/design/design-server.ts:133` `// --- Authorisation, before anything else (c1) ---` -> `// --- Authorisation: Host, then token, before anything is parsed or routed ---`
  - `src/node/design/project-watcher.ts:43-45` "short against c4's 200 ms budget from write to event" -> state the fact: "well inside the 200 ms the editor allows from an external write to its event".
- [x] **Resolved.** **Test titles and purposes that use c1-c7.** Replace the tag with the behaviour it names: `test/node/design/design-server.test.ts:7-9` (c1-c4 in Purpose), `:69` `describe('c3 — loopback only'` -> `'loopback only'`, `:78` `'c1 — the token, on every route'` -> `'the token, on every route'`, `:141` `'c2 — no write escapes the project'` -> `'no write escapes the project'`, `:228` `'c4 — an external write yields a changed event within 200 ms (20 runs)'` -> drop `c4 — `, `:252` `c4 timings` -> `external-write timings`; `test/node/design/design-command.test.ts:7` "c7 and the command around the server" -> "The command around the server", `:77` `'c7 — one server per project'` -> `'one server per project'`; `test/project-fs/served.test.ts:7` "c5 — `ServedProjectFileSystem` against..." -> drop `c5 — `.
- [x] **Resolved** (page text approved by PA: "The editor itself is not built yet."; assertion now `'not built yet'`). **"E-1e" pointer in served page text.** `src/node/design/placeholder-page.ts:39` "it arrives with E-1e" (also asserted at `test/node/design/design-server.test.ts:121`). Reword to "the editor itself is not here yet; until it is, this server only serves the project's files to the editor's file API" and change the assertion to the surviving text (e.g. `'not here yet'`). Text change in user-visible HTML is trivial but is not comment-only: confirm with the architect if "documentation and naming only" is read strictly.
- [x] **Resolved.** **Pointers to a workspace document, `EDITOR-DESIGN §2.1/§2.3`** (lives under `.agents/skills/principal-architect-workspace/`, not shipped): `src/core/project-fs/content-version.ts:9`, `project-file-system.ts:11`, `src/node/design/lock-file.ts:7`, `design-command.ts:8`, `disk-project.ts:120`, `project-watcher.ts:8`, `session-token.ts:9`, `test/project-fs/contract.ts:16` and `:287`. Keep the fact each cites and drop the citation, e.g. `content-version.ts:9` -> `("the designer never silently overwrites")` stays as the stated principle; `session-token.ts:8-10` already explains itself; `disk-project.ts:120` -> `// --- Step 3: The version check — the editor must never silently overwrite ---`; `contract.ts:287` title -> drop `(EDITOR-DESIGN §2.3)`.
- [x] **Resolved** per PA ruling: cited as "ui_spec [UD-2], amendment of 2026-10-26" (lands on main with PR #19). **"second amendment" dangling reference.** `src/core/project-fs/served-project-file-system.ts:7-8` ("served-first ruling ([UD-2], second amendment)") and `src/node/design/design-server.ts:7-8` ("ui_spec [UD-2], second amendment"). `docs/ui_spec.md` carries only the 2026-10-05 amendment (defer served mode), which says the opposite; the served-first reversal is not in the published spec on this branch. A reader following the pointer finds a contradiction. Rewrite as the fact: "the served mode of [UD-2]: the editor reaches the project on disk through `u8g2gl design`'s loopback server". Separately, the architect should land the amendment in `docs/ui_spec.md` (Observation O-3).
- [x] **Resolved.** **Host check has no why-comment at the line** (security). `src/node/design/design-server.ts:134-138`. The reason (DNS rebinding: a rebound hostile name arrives as its own Host) is in the file header only. Add at the check: why Host is validated *as well as* the token, why the port is included, and why `localhost` is accepted alongside `127.0.0.1`.
- [x] **Resolved.** **Token check has no why-comment at the line** (security). `design-server.ts:139-142`. Add: runs before routing so an unauthorised caller cannot learn which routes exist; every route including `/` is gated; the 403 body is identical for missing and wrong tokens.
- [x] **Resolved** (the `isInsideProject` comment states the actual fallback: the target resolves first, so the root stays unresolved only when the project directory is gone — not "either path"). **Path-boundary checks without the reason at the line** (security). `src/node/design/disk-project.ts:84-86` (read: why the real-path rule runs *after* the lexical rule and what it catches - a symlink out), `:110-112` (why an ignored path is reported as `outside-project` and not `invalid-path`: it maps to 403, "not yours to write", and why `.git/` matters - the header of `ignored-paths.ts` says a git hook; say it here in one line). `src/node/project-path.ts:53` `target.startsWith(root + sep)`: say that the `+ sep` is what stops `/proj-other` passing as inside `/proj`, and that the `catch` falls back to lexical comparison if *either* path fails to resolve.

### P3 — Documentation gaps

- [x] **Resolved**, including O-1 (lock written `mode: 0o600`, tested on POSIX) and O-2 (malformed percent-encoding in `?path=` or a build route segment answers 400 `invalid-path`, tested), both approved by PA. **Security-adjacent behaviour with no why-comment.**
  - `src/node/design/lock-file.ts:104` `writeFileSync(... { flag: 'wx' })`: the lock holds the live session token and is written with the default mode; add a why-comment on the exposure (any local user able to read the project directory can read the token) - see O-1 for the behaviour question.
  - `lock-file.ts:85` `fetch(...Bearer ${lock.token})`: add why: the probe sends the token to whatever answers on `lock.port`, safe only because it is loopback and a stale token is worthless; also explains why only the real server can return 200.
  - `src/node/design/session-token.ts:41-46`: when an `Authorization` header is present but malformed, the `?token=` fallback is deliberately *not* tried (returns `undefined`). Say so, or a reader will "fix" it.
  - `src/node/design/design-server.ts:172,188` `decodeURIComponent(...)` on the job id can throw `URIError` on `%`-garbage; the outer `.catch` turns that into a 500. Note that this is relied on, or handle it (behaviour: O-2).
  - `src/node/design/placeholder-page.ts:24`: why-comment that the directory name is untrusted (a project folder may be named `<script>…`), hence the escape.
- [x] **Resolved.** **`runDesignCommand` has distinct stages and no `// --- Step N ---` breakdown.** `src/node/design/design-command.ts:129-184` (about 55 lines: check project -> start or attach -> report -> open browser / attached exit -> signal handling). Add Step comments.
- [x] **Resolved.** **`DesignServer` members undocumented.** `src/node/design/design-server.ts:72-73` `port` and `token` have no doc comment (their siblings do). One line each; note that `token` is the session secret and must not be logged.
- [x] **Resolved** (Step 1 / Step 2; routes not extracted). **`handle()` is about 70 lines of route branches** with two labels (`Authorisation`, `Routing`) that are not in `Step N` form. `design-server.ts:133,144`: convert to `// --- Step 1: Authorise ---` / `// --- Step 2: Route ---`. (Extracting routes into functions is a design choice, not required.)
- [x] **Resolved.** **`cli.ts` header edit is malformed.** `src/node/cli.ts:11-14`: the inserted sentence runs the line past the block's wrap, with `validate` text glued on mid-line. Re-wrap the Description paragraph. Also the `Purpose:` (line 8-10) still lists "validation, code generation, display queries, and display catalogue enumeration" with no mention of `design`; add it.
- [x] **Resolved.** **`cli.ts` import placement.** `src/node/cli.ts:63` the `./design/design-command.js` import is appended after `write-generated.js`; place it with the other local imports in the file's existing order.
- [x] **Resolved.** **Undocumented module constant.** `src/core/project-fs/served-project-file-system.ts:85` `ERROR_CODES` has no comment, and duplicates `ProjectFsErrorCode`; add a line saying it must list every member (and why a runtime copy is needed: to narrow an untrusted server reply).
- [x] **Resolved.** **Public constructor undocumented.** `served-project-file-system.ts:99` `constructor(options)`; and `GuardedProjectFileSystem` overrides `read/readBytes/write/list/watch` (`project-file-system.ts:178-218`) with no comment - a one-line `{@inheritDoc ProjectFileSystem.read}` style note each.
- [x] **Resolved.** **Citations of the skill's reference files in a shipped source file.** `project-file-system.ts:8,22` "typescript.md §1/§4" point at `.claude/skills/.../typescript.md`, which a consumer of the package will not have. Replace with the stated rule ("`src/core/` may not import `node:`", "user errors are returned, never thrown").

### P4 — Optional, only if the architect approves

- [x] **Resolved (accepted):** `LOOPBACK` exported from `design-server.ts`, imported by `lock-file.ts`. `design-server.ts:50` and `lock-file.ts:85` each hard-code `127.0.0.1`; `lock-file.ts` could import one exported constant. Opinion only.
- [x] **Resolved (accepted):** `refusedPathMessage()` added to `core/project-fs/project-path-rule.ts`, used by the base class, the in-memory seed check and `DiskProject`. `disk-project.ts` repeats the `"'${path}' is not a project path: ${reason}."` message that `GuardedProjectFileSystem`'s `invalidPath` also builds (`project-file-system.ts:241`). One shared message helper would avoid drift. Opinion only.

## Verification Requirement

- [x] `npm run build` in `cli/` - zero warnings
- [x] `npm test` in `cli/` - all pass, none weakened (run suites sequentially)
- [x] (with the two PA-approved behaviour changes) `git diff` shows only comments, header blocks, test titles and, if approved, the placeholder page sentence plus its one assertion
- [x] `grep -rnE "EDITOR-DESIGN|E-1[a-z]|\bc[1-7]\b|second amendment" cli/src cli/test` returns nothing in the files above

## Issue Surfacing

Anything outside this list goes in your Completion Report. Do not fix it.

## Review Notes

**Severity counts:** P1 0 · P2 8 · P3 10 · P4 2 (items are grouped; each grouped item lists every file/line).

**Files reviewed:** all 30 in the diff stat. Source: every file under `core/project-fs/` and `node/design/`, plus `project-path.ts`, and the `cli.ts` and `load-project.ts` diffs. Tests: headers read in full, titles grepped for pointers; assertions not audited line by line.

**Good, to pattern-match:** `project-path-rule.ts` is exemplary (inline why-comments for backslash, colon and dots; Step breakdown; refusals name their rule). `content-version.ts` explains its limb arithmetic where a reader would otherwise "simplify" it. `disk-project.ts` `writeStaysInside` and the synchronous-write rationale are the right kind of why-comment. `load-project.ts` was changed correctly: the old function and its comment moved to `project-path.ts` with the comment improved, and the `realpathSync` import removed while `sep` is still used.

**Uncertain:** whether the HTML sentence in the placeholder page counts as "documentation" for the boundary box (P2-3 flagged for that reason). EDITOR-DESIGN content could instead be promoted into `docs/` so the citation becomes durable - that is the architect's call; the audit takes the instructed route of dropping pointers.

**Observations (standards silent, or behaviour; do not action without a decision):**
- O-1: `lock-file.ts:104` writes the session token to `.u8g2gl-design.lock` with default permissions (typically 0644). A `mode: 0o600` would keep other local users from reading it. Behavioural, hence not in the checklist.
- O-2: `decodeURIComponent` on a route segment can throw; the result is a 500 with an "internal error" body rather than a 400. Behavioural.
- O-3: `docs/ui_spec.md` has no served-first amendment on this branch (see P2-5); the comments cited one that is not published.
- O-4: `isInsideProject` falls back to a lexical comparison if either `realpathSync` fails; `DiskProject.write` compensates via `writeStaysInside`, but `read` of a nonexistent path under a symlinked directory passes the check and then fails as `not-found`. Harmless for read; worth a sentence in the TSDoc.

## Completion Report

<!-- Written by the remediation worker at task completion -->

**Worker, 2026-10-27.** Branch `u8g2gl-e1c/wo3-readability`, from `u8g2gl-e1c/wo2-server` @ `97c5a22`.

**Commits:** `0aba44a` docs(e-1c): WO3 readability audit (this file, as received);
`3dab1cb` docs(cli): E-1c readability fixes; lock mode 0600; 400 for bad encodings; plus this report.

**Resolved:** every P2 and P3 item, both P4 items (none declined), and observations O-1, O-2 and O-4
(the read-side sentence is in `isInsideProject`'s TSDoc). O-3, landing the amendment in `docs/ui_spec.md`, belongs to the
architect (PR #19), so it is not addressed here.

**Behaviour changes (PA-approved):**
- `tryCreateLock` writes with `{ flag: 'wx', mode: 0o600 }`. The new test checks
  `stat.mode & 0o777 === 0o600` and is skipped on win32.
- `GET`/`PUT /api/file` decode `path` strictly, and so do the `POST`/`GET /api/build/<segment>`
  segments. A malformed encoding now answers 400 `invalid-path`. `+` still decodes as a space,
  and a test covers that. One consequence: until now `URLSearchParams` decoded `%zz` leniently, as the
  literal name `%zz`, so such a path is now refused rather than read as that literal name. The browser half uses `encodeURIComponent` and
  never sends one.

**Counts (`extern/u8g2` now checked out):** before, 1538 passed with 0 failed. After, **1545 passed, 0 failed, 0
skipped**: 7 new tests (1 lock-mode, 5 malformed-encoding, 1 well-formed decode). `npm run build` and
`npm run lint` (eslint plus `tsc -p tsconfig.test.json`) are clean. The pointer grep over the audited files returns nothing.

**Outside the list:** none found.
