# Versioning Policy

U8G2GL releases **two components**, and each is versioned and tagged on its own.
The scheme is `esp32-app-foundation`'s SemVer channel model, with a component
prefix on every tag. Confusing the components causes silent incompatibility,
because they are built separately and consumed together.

| Component | Released as | Its version lives in |
|---|---|---|
| **runtime** | The PlatformIO library (`include/`, `src/`, `library.json`) | `library.json`, `CMakeLists.txt` `project(... VERSION)` and `include/u8g2gl/u8g2gl_version.h`, which must all agree |
| **cli** | The npm package `u8g2gl`: the generator, the designer, the editor Wasm and the staged framework sources | `cli/package.json` |

Two more version numbers exist, and **neither is tagged**:

- The **schema** (`u8g2gl.xml` `schema="0.5"`) is a vocabulary version that both
  components check. It changes only by the owner's decision (below).
- The **designer and the editor Wasm** ship only inside the CLI package, so they
  carry the CLI's version.

How to cut a release, step by step, is in `docs/RELEASING.md`.

## Tags

```
<component>-v<MAJOR>.<MINOR>.<PATCH>[-<CHANNEL>.<PRE_NUM>]
```

- `<component>` is `runtime` or `cli`.
- `<CHANNEL>` is `dev`, `beta` or `rc`. No suffix means **stable**.
- `<PRE_NUM>` starts at 1 within a PATCH and channel.
- Precedence within one `MAJOR.MINOR.PATCH` is `dev < beta < rc < stable`.

Examples: `cli-v0.15.2-dev.3`, `cli-v0.15.2-beta.1`, `cli-v0.15.2`,
`runtime-v0.11.1-beta.1`.

Stable versions are plain SemVer (`0.11.1`), as U8G2's are. The channel appears
only on pre-releases. Tags in any other shape (`archive/...`, the owner's
`v0.7.0-integration`) are not release tags, and the release tooling ignores
them.

## The three tiers

| Tier | When | Who tags |
|---|---|---|
| `-dev.N` | An in-flight build within a PR, or a downstream pin to an unreleased commit | **Agents, without asking** |
| `-beta.N` | After the PR merges. `beta.2` and on for a fix before promotion | **The owner** |
| `-rc.N` | Optionally, a release candidate after beta | **The owner** |
| stable | Promoted from beta (or rc) once validated | **The owner, never an agent** |

**Once a PATCH has a beta, all its `dev` tags are superseded,** and new work
targets the next PATCH. An agent never creates a `dev` tag in a PATCH that
already has a beta, rc or stable tag: it stops and asks.

A library has no subscribers to a `dev` channel, so most PRs never get a `dev`
tag. Their main use is a **downstream pin**: a consumer that needs an unreleased
commit pins a `dev` tag, never a bare SHA (`04-branch-hygiene.md`).

## Numbering

- **PATCH goes up once per merged PR** that changes what a component ships. A PR
  that touches only one component bumps only that one. Documentation, agent
  files and tests that ship in neither component bump nothing.
- **The PR sets its component's files to the next unreleased PATCH**, once: the
  PATCH after the highest one that has a beta or stable tag, or after the files'
  current PATCH if that has been merged untagged. Every later commit in the PR
  keeps that PATCH.
- **A fix to a beta that has not been promoted keeps its PATCH** and becomes the
  next beta (`-beta.2`), as in the foundation. The exception is a fix that
  changes generated output: the determinism check below then forces a new CLI
  PATCH, whose first release is its `-beta.1`.
- **MINOR and MAJOR bumps are the owner's decision.** Propose one in the plan;
  never make it.
- The numbers carry on from where they were before this scheme (runtime 0.11,
  CLI 0.15). Nothing is renumbered.

## The core is in the files; the channel is in the tag

This is the one place U8G2GL departs from the foundation, which reads its whole
version from git at build time. **U8G2GL's runtime is built by someone else:**
PlatformIO fetches it into a consumer's project without its tags, so
`MAJOR.MINOR.PATCH` has to be in the files the consumer compiles. The CLI's core
is committed too, in `cli/package.json`, because CI's determinism check (§13.9)
compares it with the merge base.

So:

- The core, `MAJOR.MINOR.PATCH`, is committed in the component's files.
- The channel and `PRE_NUM` live **only in the tag**. Promoting `dev` → `beta` →
  stable is a new tag on the same commit, never a commit.
- **A tag's core must equal its component's files.**
  `node scripts/release-version.mjs check <tag>` refuses one that does not, and
  CI runs it on every tag push.
- The packed CLI reports the tag's **full** version (`0.15.2-beta.1`), because
  packing writes it into the packed `package.json`. A CLI run from a checkout
  reports the committed core.

`node scripts/release-version.mjs next <component> <channel>` prints the tag to
create next. Use it rather than counting tags by hand.

## npm channels

| CLI tag | npm command | Reaches `npx u8g2gl`? |
|---|---|---|
| stable `cli-vX.Y.Z` | `npm publish` (dist-tag `latest`) | Yes |
| `cli-vX.Y.Z-beta.N` | `npm publish --tag beta` | No |
| `cli-vX.Y.Z-rc.N` | `npm publish --tag rc` | No |
| `cli-vX.Y.Z-dev.N` | **Never published** | No |

A pre-release published without `--tag` would become `latest` for everyone, so
the dist-tag is not optional.

## The U8G2 affiliation

U8G2GL does **not** match U8G2's version numbers. Its compatibility is with its
own API and schema; U8G2 is a dependency, declared as one in `library.json`
(`"olikraus/U8g2": "^2.36.18"`). The affiliation is kept in substance:

- **A root `ChangeLog`, per MINOR, in U8G2's own form:** a dated `vX.Y.xx` entry
  per MINOR, listing what each PATCH added, one entry for the runtime and one for
  the CLI.
- **Each release records the U8G2 version it was built and tested against:**
  `extern/u8g2`'s tag at the tagged commit. `release-version.mjs check` refuses a
  runtime tag whose U8G2 is outside `library.json`'s `olikraus/U8g2` range, and
  the release notes name it.
- **The Arduino Library Manager is out of scope.** It reads a repository's tags
  as versions, so it would need a generated one-component distribution
  repository, as U8G2's `U8g2_Arduino` is. That would be a separate project.

## The compatibility rule

Generated code records the schema version and generator version that produced it
(design_spec §13.2), and asserts **two** version requirements at compile time (§16):

| Requirement | Pinned to | Comparison |
|---|---|---|
| `U8G2GL_REQUIRE_SCHEMA_VERSION` | The schema the generator wrote for | Equality: major, and minor while the major is 0 |
| `U8G2GL_REQUIRE_RUNTIME_AT_LEAST` | The runtime version the generator was **built beside** | Floor: major equal, and the runtime's `MINOR.PATCH` at least the floor's |

The schema requirement is an **equality**: the major, and the minor while the
major is 0. The runtime requirement is a **floor**, because API accretes and a
newer runtime is fine. **The floor compares PATCH**, because under PATCH per
merged PR new runtime API arrives in a PATCH: a floor on `MAJOR.MINOR` alone
would let code compile against a runtime that lacks what it calls. The older
two-argument `U8G2GL_REQUIRE_RUNTIME_VERSION(major, minor)` stays in the header,
so code generated before the change still compiles.

**The runtime floor is not the generator's own version.** These two numbers are
independent by design and have already diverged (CLI 0.15, runtime 0.11), so a
floor taken from the generator's number would demand a runtime that does not
exist. They ship from one repository at one commit, so the CLI stamps the
runtime version in the tree it was built from (`cli/src/data/runtime-version.json`)
and emits that. That is automatic, and it means a CLI can never require API newer
than the runtime it shipped beside. `release-version.mjs check` refuses a CLI tag
whose stamp differs from the header.

The runtime floor exists because the generator and the runtime are shipped
separately and consumed together, so a project can sit on a current CLI and a
stale runtime indefinitely. Without it the failure is a missing symbol with no
explanation, or, in a project that happens to use no new API, **no failure at
all until a later edit reaches the gap**. These are the guardrails that stop a
stale `generated/` directory from failing mysteriously. Do not weaken them for
convenience.

## Schema versions are expensive

Per design_spec §1.5, schema surface is the costly kind of complexity because it
is permanent once authors write XML against it. A schema bump is therefore a
deliberate act, not a side effect:

- **Additive** change (new optional attribute, new widget): minor bump, and the
  validator must keep accepting the prior version.
- **Breaking** change (removed or re-meaning an attribute): major bump, and §15.4
  requires the CLI to refuse the old version with a specific migration message.
  Never silent.

Pre-1.0 breaking changes are expected. The requirement is that they are
*diagnosable*, never silent.

## Determinism is a versioning concern

A generator change that alters output **without an input change** is a breaking
change and requires a generator version bump (§13.9). Generated code is committed
and appears in review; an unexplained diff destroys trust in the tool.

**This is checked as a condition on the diff, not as a test**: a test sees one
commit and the rule is about two. The committed goldens are stamped
`0.0.0-golden`, so they never move on a version bump and move only on a real
output change. The check is therefore "a golden changed, its fixture inputs did
not, so the CLI version must differ from the merge base" (§13.9). It runs in CI,
which PR-06 delivered (§17.3).

### A runtime bump forces a CLI patch bump, and that is intended

Every runtime version change moves the floor the generator emits
(`U8G2GL_REQUIRE_RUNTIME_AT_LEAST`), so every golden moves. Under PATCH per
merged PR, that is **every PR that bumps the runtime**. The condition above sees
an output change with no *fixture* input change and fires.

**That is correct, not a false positive, and the right response is the CLI's
own once-per-PR PATCH bump.** The runtime version genuinely is an input to
generated output; it is simply not one the diff condition can see, because it
lives outside the fixture directory. The two ship from one repository at one
commit, so coupling their versions costs nothing and keeps the stamp honest. A
PR that bumps the runtime therefore bumps the CLI's PATCH too, even when the
generator itself did not change, and a later reader finds the reason in the
runtime's version.

Observed first at PR-06 (runtime 0.9.0 → 0.10.0 forcing CLI 0.13.0 → 0.13.1),
and again at VER-1 (runtime 0.11.1, CLI 0.15.2).

## Agent autonomy

| Action | Agent may do it |
|---|---|
| Set a component's files to the next unreleased PATCH, once per PR that changes it | ✅ Yes |
| Bump the CLI's PATCH for a determinism-affecting change, or because the runtime moved | ✅ Yes. It is *required*, not optional |
| Create a `dev` tag in a PATCH with no beta, rc or stable tag, and push it for a downstream pin | ✅ Yes, without asking |
| Create a `dev` tag in a PATCH that already has a beta, rc or stable tag | ❌ No. Stop and ask |
| Create a `beta`, `rc` or stable tag | ❌ No. Owner decision |
| Bump MINOR or MAJOR | ❌ No. Owner decision |
| Bump the **schema** version | ❌ No. Owner decision, see §1.5 |
| Publish to npm, on any channel | ❌ No. Owner decision |

Never publish to npm from an agent session. Output the exact command and ask the
owner to run it.
