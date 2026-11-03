# Releasing U8G2GL

How to tag, check and publish a release of either U8G2GL component. The policy
behind every step (what the numbers mean, who may tag what, why the channel
lives in the tag) is `.agents/rules/03-versioning.md`; this document is the
procedure.

## The two components

| Component | What it is | Released by | Consumers get it from |
|---|---|---|---|
| **runtime** | The PlatformIO library: `include/`, `src/`, `library.json` | A `runtime-v*` tag | PlatformIO, pinned to the tag |
| **cli** | The npm package `u8g2gl`: the generator, the designer, the editor Wasm and the staged framework sources | A `cli-v*` tag, then `npm publish` | npm (`npx u8g2gl`) |

Each has its own version. The **core**, `MAJOR.MINOR.PATCH`, is committed in
the component's files:

- runtime: `library.json`, `CMakeLists.txt` and
  `include/u8g2gl/u8g2gl_version.h`, which must agree;
- cli: `cli/package.json`.

The **channel** is only in the tag:

```
<component>-v<MAJOR>.<MINOR>.<PATCH>[-<dev|beta|rc>.<N>]
```

So promoting a release from beta to stable is a new tag on the same commit.
It is never a commit.

## The tiers

| Tier | Example | Who tags | npm |
|---|---|---|---|
| dev | `runtime-v0.11.2-dev.1` | Agents, for an in-flight build or a downstream pin | Never published |
| beta | `cli-v0.15.2-beta.1` | The owner, after the PR merges | `npm publish <tarball> --tag beta` |
| rc | `cli-v0.15.2-rc.1` | The owner, optionally | `npm publish <tarball> --tag rc` |
| stable | `cli-v0.15.2` | The owner, once the beta is validated | `npm publish <tarball>` (`latest`) |

Within one PATCH, precedence is `dev < beta < rc < stable`. Once a PATCH has a
beta, its dev tags are superseded and new work targets the next PATCH.

## The tools

```bash
# The tag to create next for a component and channel, from the files at HEAD
# and the tags that exist. Refuses, with the reason, when there is none.
node scripts/release-version.mjs next <runtime|cli> <dev|beta|rc|stable>

# Check a tag at HEAD: its shape, that it is at HEAD, that its core equals the
# files, that the runtime's three files agree, that the CLI's runtime stamp
# matches the header, that a runtime's U8G2 is inside library.json's range,
# and that a dev tag is not in a superseded PATCH.
node scripts/release-version.mjs check <tag>

# Pack the CLI, install it where no source tree is visible, and use it. With a
# cli-v* tag at HEAD it packs this checkout as that tag; without one it packs a
# throwaway clone tagged cli-v<core>-dev.1. Needs the pinned Emscripten (5.0.3)
# on PATH and the designer's dependencies installed.
node scripts/check-package.mjs
```

Pushing a `runtime-v*` or `cli-v*` tag runs `.github/workflows/release-tag.yml`:
the tag check for every tag, and `check-package.mjs` for a `cli-v*` tag. It
publishes nothing.

Both scripts work from git and the committed files. Run them from a checkout
with the submodule checked out, including its tags:

```bash
git submodule update --init --checkout extern/u8g2
```

## Before any release

1. The PR is merged to `main`, and `main`'s CI is green.
2. You are at `main`'s tip, with a clean tree:

   ```bash
   git checkout main && git pull --ff-only
   git status --short            # must print nothing
   git submodule update --init --checkout extern/u8g2
   ```

3. The `ChangeLog` entry for the component's MINOR lists what this PATCH adds
   (see "The ChangeLog" below). If it does not, add it in a PR first, because a
   tag must be at the commit it describes.

## Releasing the runtime

1. **Choose and check the tag:**

   ```bash
   node scripts/release-version.mjs next runtime beta     # prints runtime-vX.Y.Z-beta.N
   git tag -a runtime-vX.Y.Z-beta.N -m "runtime X.Y.Z-beta.N"
   node scripts/release-version.mjs check runtime-vX.Y.Z-beta.N
   ```

   `check` prints the U8G2 release the runtime was built and tested against, as
   `built against U8G2 2.36.18`. Record it in the release notes.

2. **Push the tag, and wait for CI:**

   ```bash
   git push origin runtime-vX.Y.Z-beta.N
   ```

   The "Release tag" workflow must be green before anything pins the tag.

3. **Consumers pin the tag** in `platformio.ini`:

   ```ini
   lib_deps =
       https://github.com/cblabs-org/u8g2gl.git#runtime-vX.Y.Z-beta.N
   ```

   PlatformIO fetches the library without its tags. That is why the core is
   in `library.json`: the consumer's build sees `X.Y.Z`, and the channel is
   only in the ref they pinned.

## Releasing the CLI

1. **Choose and check the tag:**

   ```bash
   node scripts/release-version.mjs next cli beta         # prints cli-vX.Y.Z-beta.N
   git tag -a cli-vX.Y.Z-beta.N -m "cli X.Y.Z-beta.N"
   node scripts/release-version.mjs check cli-vX.Y.Z-beta.N
   ```

2. **Push the tag, and wait for CI:**

   ```bash
   git push origin cli-vX.Y.Z-beta.N
   ```

   The "Release tag" workflow checks the tag, then packs the CLI as it and
   checks the installed package.

3. **Check the package locally, at the tag**, with the pinned Emscripten
   active:

   ```bash
   source <your emsdk>/emsdk_env.sh      # Emscripten 5.0.3
   node scripts/check-package.mjs
   ```

   It must print `packing as cli-vX.Y.Z-beta.N`, `the installed CLI reports
   X.Y.Z-beta.N` and `generate stamps X.Y.Z-beta.N`, and end in `PASS`.

4. **Pack, then publish the tarball:**

   ```bash
   mkdir -p tmp/release
   (cd cli && npm pack --pack-destination ../tmp/release)
   tar -xOzf tmp/release/u8g2gl-X.Y.Z.tgz package/package.json | grep '"version"'
   #   "version": "X.Y.Z-beta.N"
   npm publish tmp/release/u8g2gl-X.Y.Z.tgz --tag beta
   npm view u8g2gl dist-tags
   ```

   **Publish the tarball, never the directory.** Packing writes the tag's full
   version into the packed `package.json` and restores the committed one
   afterwards. A directory `npm publish` reads `package.json` again after that
   restore, so it would register the core version for a tarball that says the
   full one. `prepack` therefore refuses under `npm publish`. Publishing a
   tarball reads the version from inside it and runs no scripts.

   The tarball is named by the core (`u8g2gl-X.Y.Z.tgz`), because npm names it
   before `prepack` runs. Its contents carry the full version, as the `tar`
   line shows.

   **The `--tag` is not optional for a pre-release.** Without it, a beta would
   become `latest` for everyone running `npx u8g2gl`. Use `--tag rc` for an rc.
   A dev tag is never published.

## Promoting to stable

Promotion is a new tag on the commit that carries the beta. Nothing is
committed.

```bash
git checkout --detach runtime-vX.Y.Z-beta.N          # or cli-vX.Y.Z-beta.N
git submodule update --checkout extern/u8g2
node scripts/release-version.mjs next runtime stable  # prints runtime-vX.Y.Z
git tag -a runtime-vX.Y.Z -m "runtime X.Y.Z"
node scripts/release-version.mjs check runtime-vX.Y.Z
git push origin runtime-vX.Y.Z
```

For the CLI, tag and push `cli-vX.Y.Z` the same way, wait for CI, then pack
and publish **again**, without `--tag`. npm versions are immutable and the
channel is in the version string, so the stable package is a fresh pack of the
same commit, and `check-package.mjs` checks it again:

```bash
node scripts/check-package.mjs        # packing as cli-vX.Y.Z
rm -rf tmp/release && mkdir -p tmp/release
(cd cli && npm pack --pack-destination ../tmp/release)
npm publish tmp/release/u8g2gl-X.Y.Z.tgz
npm view u8g2gl dist-tags
```

With both tags at the commit, packing chooses the higher one by precedence,
so it packs as stable.

## A fix before promotion

A fix to a beta that has not been promoted keeps its PATCH and becomes the
next beta, `-beta.2`. The fix PR leaves the component's files at `X.Y.Z`, and
after it merges the owner tags `node scripts/release-version.mjs next
<component> beta`.

There is one exception. If the fix changes generated output, CI's determinism
check (§13.9) requires the CLI version to differ from the merge base. The fix
then takes the next PATCH, and its first release is that PATCH's `-beta.1`.

## Dev tags and downstream pins

A downstream project that needs an unreleased commit pins a `dev` tag, never a
bare SHA (`.agents/rules/04-branch-hygiene.md`):

```bash
node scripts/release-version.mjs next runtime dev     # e.g. runtime-v0.11.2-dev.1
git tag runtime-v0.11.2-dev.1
node scripts/release-version.mjs check runtime-v0.11.2-dev.1
git push origin runtime-v0.11.2-dev.1
```

Agents may do this without asking, but only in a PATCH that has no beta, rc or
stable tag yet; `next` and `check` both refuse otherwise.

To tag an older commit, such as one a downstream branch already pins, run
`check` with that commit checked out. The script itself is newer than the
commit, so run the current copy from the old commit's directory:

```bash
git worktree add --detach ../u8g2gl-pin 82ec83f
git -C ../u8g2gl-pin submodule update --init --checkout extern/u8g2
git -C ../u8g2gl-pin tag runtime-v0.7.0-dev.1
(cd ../u8g2gl-pin && node "$OLDPWD/scripts/release-version.mjs" check runtime-v0.7.0-dev.1)
git worktree remove ../u8g2gl-pin
```

## The ChangeLog

The root `ChangeLog` follows U8G2's own form, per MINOR. Each MINOR has a dated
`vX.Y.xx` entry for each component, and each PATCH adds a line saying what it
added. Add the line in the PR that bumps the PATCH, so the entry is at the
commit the tag points to. A new MINOR starts a new entry. Entries name the
project, never a person's email address.

## Release notes

Each release's notes, wherever they are published, state:

- the component and full version (`runtime 0.11.1-beta.1`);
- the U8G2 release it was built and tested against, from `check`'s output;
- for the CLI, the runtime version it was built beside, which it requires
  (`cli/src/data/runtime-version.json`);
- the `ChangeLog` lines for the PATCH.

A GitHub Release is not part of this procedure yet.

## Worked example: the first pre-releases

VER-1 sets runtime **0.11.1** and CLI **0.15.2**, the first versions under this
scheme. After VER-1 merges, at `main`'s tip:

```bash
git checkout main && git pull --ff-only
git submodule update --init --checkout extern/u8g2

# The runtime
node scripts/release-version.mjs next runtime beta    # runtime-v0.11.1-beta.1
git tag -a runtime-v0.11.1-beta.1 -m "runtime 0.11.1-beta.1"
node scripts/release-version.mjs check runtime-v0.11.1-beta.1

# The CLI
node scripts/release-version.mjs next cli beta        # cli-v0.15.2-beta.1
git tag -a cli-v0.15.2-beta.1 -m "cli 0.15.2-beta.1"
node scripts/release-version.mjs check cli-v0.15.2-beta.1

# Push both, and wait for both "Release tag" runs to go green
git push origin runtime-v0.11.1-beta.1 cli-v0.15.2-beta.1

# Check, pack and publish the CLI beta (pinned Emscripten 5.0.3 active)
node scripts/check-package.mjs
mkdir -p tmp/release
(cd cli && npm pack --pack-destination ../tmp/release)
tar -xOzf tmp/release/u8g2gl-0.15.2.tgz package/package.json | grep '"version"'
npm publish tmp/release/u8g2gl-0.15.2.tgz --tag beta
npm view u8g2gl dist-tags
```

A PlatformIO consumer then pins:

```ini
lib_deps =
    https://github.com/cblabs-org/u8g2gl.git#runtime-v0.11.1-beta.1
```

## Worked example: promotion to stable

When both betas are validated:

```bash
# The runtime
git checkout --detach runtime-v0.11.1-beta.1
git submodule update --checkout extern/u8g2
git tag -a runtime-v0.11.1 -m "runtime 0.11.1"
node scripts/release-version.mjs check runtime-v0.11.1

# The CLI
git checkout --detach cli-v0.15.2-beta.1
git tag -a cli-v0.15.2 -m "cli 0.15.2"
node scripts/release-version.mjs check cli-v0.15.2

git push origin runtime-v0.11.1 cli-v0.15.2

# Re-check, re-pack and publish the stable CLI to latest
node scripts/check-package.mjs
rm -rf tmp/release && mkdir -p tmp/release
(cd cli && npm pack --pack-destination ../tmp/release)
npm publish tmp/release/u8g2gl-0.15.2.tgz
npm view u8g2gl dist-tags

git checkout main
```

The two betas are at the same commit after VER-1, so the two checkouts above
land on one commit. They are written separately because the components are
promoted separately in general.
