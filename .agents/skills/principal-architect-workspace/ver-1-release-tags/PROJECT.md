# VER-1: Release Tags and Channels, on the Foundation's Model

**Status: APPROVED (2026-11-03), revision 3: the foundation model, with U8G2's habits. In progress.**

**Parent:** the release channel in `docs/implementation_plan.md`, now that PKG-1 (#42) makes
the npm package complete. **Model:** `esp32-app-foundation`'s
`docs/developer/versioning-policy.md`. **Base:** `main` @ `7adf628`. **Worktree:**
`../U8G2GL-ver1`.

## Purpose

U8G2GL has never been tagged. The owner wants `esp32-app-foundation`'s scheme, with the
components told apart. That scheme has these parts:
- every build's version carries its channel, `vX.Y.Z-dev.N`, then `-beta.N`, then stable
  `vX.Y.Z`;
- the version comes from the tag, and promotion between channels is a new tag, not a commit;
- PATCH goes up once per merged PR;
- agents tag `dev` themselves, and `beta` and stable are the owner's.

U8G2GL ships two things, so each gets that scheme under its own prefix:

| Component | Released as | Today |
|---|---|---|
| **runtime** | PlatformIO library (`include/`, `src/`, `library.json`) | 0.11.0 |
| **cli** | npm package `u8g2gl`: the generator, the designer, the editor Wasm and the staged framework sources | 0.15.1 |

The designer and the editor Wasm ship only inside the CLI package, and the schema is a
vocabulary version that both check. None of the three is tagged on its own.

## Decomposition

| WO | Topic | Branch |
|---|---|---|
| WO1 | The scheme in rule 03; `scripts/release-version.mjs` (read and check a tag); its tests | `u8g2gl-ver1/wo1-scheme` |
| WO2 | The channel from the tag: the CLI packs as the tag's full version; the tag-push CI workflow | `u8g2gl-ver1/wo2-channel` |
| WO3 | The runtime floor compares PATCH (needed by PATCH-per-PR); runtime 0.11.1, CLI 0.15.2 | `u8g2gl-ver1/wo3-floor` |
| WO4 | `docs/RELEASING.md`, the `ChangeLog`, readability review, PA verification | `u8g2gl-ver1/wo4-docs` |

One worker, in order, one PR. `VERSIONING-OPTIONS.md` (the evaluation behind this scheme) is
committed beside this file.

## PA rulings

1. **Tag format.** The foundation's anatomy, with a component prefix:
   `<component>-v<MAJOR>.<MINOR>.<PATCH>[-<CHANNEL>.<PRE_NUM>]`.
   - The component is `runtime` or `cli`.
   - The channel is `dev`, `beta` or `rc`; no suffix means stable.
   - Precedence is `dev < beta < rc < stable`.

   Examples: `cli-v0.15.2-dev.3`, `cli-v0.15.2-beta.1`, `cli-v0.15.2`, `runtime-v0.11.1-beta.1`.
2. **The three tiers, as in the foundation:**

   | Tier | When | Who tags |
   |---|---|---|
   | `-dev.N` | An in-flight build within a PR, or a downstream pin to an unreleased commit | Agents, without asking |
   | `-beta.N` | After the PR merges; `beta.2` and on for a fix before promotion | The owner |
   | stable | Promoted from beta when validated | The owner, never an agent |

   Once a PATCH has a beta, all its `dev` tags are superseded, and new work targets the next
   PATCH. An agent never creates a `dev` tag in a PATCH that already has a beta or stable tag:
   it stops and asks. **MINOR and MAJOR bumps are the owner's**, as in the foundation. A
   **schema** bump stays the owner's too (rule 03).
3. **PATCH goes up once per merged PR** that changes what a component ships, as in the
   foundation. Rule 03's present meaning, MINOR per capability, is replaced. The numbers carry
   on from 0.11.0 and 0.15.1, and nothing is renumbered.
4. **The channel comes from the tag; the core is committed.** This is the one place U8G2GL
   cannot copy the foundation exactly, and why.
   - **The foundation** reads its whole version from git at build time (`inject_version.py`),
     because it builds its own firmware from its own checkout.
   - **U8G2GL's runtime is built by someone else.** PlatformIO fetches it into a consumer's
     project without its tags, so `MAJOR.MINOR.PATCH` has to be in the files the consumer
     compiles: `library.json`, `CMakeLists.txt` and `u8g2gl_version.h`.
   - **The CLI's core is committed too,** in `cli/package.json`, because CI's determinism
     check (§13.9) compares it with the merge base.

   So each PR sets the core to the next unreleased PATCH, the "next unreleased patch" the
   foundation's dev tags already target. The **channel and PRE_NUM live only in the tag**, so
   promoting `dev` → `beta` → stable is a tag and never a commit, as in the foundation. A
   tag's core must equal its component's files.
5. **The CLI packs as its tag.** `stage-package.mjs` (PKG-1's `prepack`) requires a `cli-v*`
   tag at HEAD whose core matches `cli/package.json`. It writes the tag's full version
   (`0.15.2-beta.1`) into the packed `package.json`, and `postpack` restores the file. So the
   installed CLI reports, and stamps into generated code, the channel it was released on. With
   no tag at HEAD, packing is refused, with the command to tag it. A checkout run reports the
   committed core, as now.
6. **`scripts/release-version.mjs`** does two things.
   - **`check <tag>`** refuses, naming the file and both values:
     - a tag that is not a release tag;
     - a core that differs from the component's files;
     - a runtime whose three files disagree;
     - a CLI whose stamped runtime version lags the header;
     - a `dev` tag in a PATCH that already has a beta or stable tag;
     - a tag that is not at the commit being checked.
   - **`next <component> <channel>`** prints the tag an agent or the owner should create next
     (for `dev`, PRE_NUM + 1 within the files' PATCH).

   Tests cover each refusal, each channel of each component, and a `generate` that stamps a
   pre-release version.
7. **npm channels:** a stable CLI is `npm publish` (`latest`). A `beta` or `rc` CLI is
   `npm publish --tag beta` (or `--tag rc`), so `npx u8g2gl` never picks one up. `dev` is
   never published to npm. A GitHub Release is out of scope for VER-1.
8. **CI on a tag push:** a new `release-tag.yml`, for `runtime-v*` and `cli-v*`.
   - For every release tag, it runs `release-version.mjs check`.
   - For a `cli-v*` tag, it also runs `scripts/check-package.mjs`, which must show the tag's
     full version in the installed CLI.

   It publishes nothing. `ci.yml` is unchanged.
9. **The runtime floor compares PATCH.** Under PATCH-per-PR, new runtime API can arrive in a
   PATCH, so a floor that compares only MAJOR.MINOR would let code compile against a runtime
   that lacks what it calls. That is exactly the silent failure rule 03 exists to prevent.
   - A new `U8G2GL_REQUIRE_RUNTIME_AT_LEAST(major, minor, patch)` compares all three.
   - The generator emits it.
   - The old two-argument macro stays, so code already generated still compiles.

   Every golden's floor line moves, so this is a runtime **0.11.1** and a CLI **0.15.2**: the
   first versions under the new scheme.
10. **Rule 04's squash ban** is restated in terms of tags. A `dev` tag on a pinned commit is a
    ref, so git never collects that commit, however the PR was merged. The ban is
    lifted only by the owner, and VER-1 does not.
11. **`docs/RELEASING.md`** covers the two components, the tiers, and each channel's commands
    in order: tag, push, CI green, then for the CLI `check-package.mjs` and publish. It also
    covers the PlatformIO pin (`u8g2gl.git#runtime-v0.11.1-beta.1`) and a worked example for
    each component. No home paths, and no owner email.
12. **The U8G2 affiliation is kept in substance, not in tag shape** (VERSIONING-OPTIONS.md
    §4). U8G2GL does not match U8G2's numbers, because its compatibility is with its own API
    and schema. Instead:
    - **A `ChangeLog` at the root, per MINOR, in U8G2's own form:** a dated `vX.Y.xx` entry per
      MINOR, listing what each PATCH added, one entry for the runtime and one for the CLI.
      It starts at the current MINORs (runtime 0.11, CLI 0.15) and is not backfilled.
    - **Each release records the U8G2 version it was built and tested against.** That is
      `extern/u8g2`'s tag at the tagged commit. `release-version.mjs check` refuses a runtime
      tag when `library.json`'s `olikraus/U8g2` range does not admit it, and `RELEASING.md`
      puts it in the release notes.
    - **Stable cores stay plain SemVer** (`0.11.1`), as U8G2's are, with the channel only on
      pre-releases.
    - **The Arduino Library Manager is out of scope.** It reads a repository's tags as
      versions, so it would need a generated one-component distribution repository, as
      `U8g2_Arduino` is. If it is ever wanted, that is a separate project.
13. **Boundary:**
    - `.agents/rules/03-versioning.md` and `04-branch-hygiene.md`;
    - `scripts/`;
    - `cli/scripts/stage-package.mjs`;
    - `.github/workflows/release-tag.yml`;
    - `include/u8g2gl/u8g2gl_version.h` and the three runtime version files (ruling 9 only);
    - the generator's floor emission and its goldens (ruling 9 only), and `cli/package.json`'s
      version;
    - `docs/RELEASING.md`, the root `ChangeLog`, and `docs/implementation_plan.md`'s
      release-channel line.

    **Excluded:** no tag created or pushed except the worker's own `dev` tags, which it does
    not push; nothing published; no schema change; no new dependency.

## After VER-1 merges (the owner's)

1. `runtime-v0.11.1-beta.1` and `cli-v0.15.2-beta.1` at `main`'s tip, then
   `npm publish --tag beta`.
2. Stable `runtime-v0.11.1` and `cli-v0.15.2` when you have validated them.
3. `runtime-v0.7.0-dev.1` at `82ec83f`, the commit `esp32-app-foundation`'s held integration
   branch pins. An agent may create this one under ruling 2, since it is a downstream pin.
   Repinning the foundation to it is foundation work.

## Status log

- **2026-11-03, owner:** asked for the foundation's scheme with components told apart; said
  revision 1 did not follow the foundation's dev/beta/stable scheme; asked for a comparison with U8G2's
  pattern (`VERSIONING-OPTIONS.md`) and a recommendation (`RECOMMENDATION.md`).
- **2026-11-03, owner:** "Approved, proceed", given to the ask *"Agree the recommendation and
  approve VER-1 revision 3?"*. The recommendation's nine decisions and this decomposition are
  approved.
