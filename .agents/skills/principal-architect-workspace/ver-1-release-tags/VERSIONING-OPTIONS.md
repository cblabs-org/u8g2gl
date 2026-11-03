# U8G2GL Versioning: the U8G2 Pattern Against the Foundation Pattern

*An evaluation for the owner, 2026-11-03. Evidence for U8G2 is from its own repository (the
`extern/u8g2` submodule) unless marked otherwise. Evidence for the foundation is from
`esp32-app-foundation`'s `docs/developer/versioning-policy.md`.*

## 1. The two patterns, as practised

### U8G2 (olikraus/u8g2)

| Aspect | What U8G2 does |
|---|---|
| **Tag shape** | A bare `MAJOR.MINOR.PATCH`: no `v`, no prefix, no channel. 29 tags, `2.26.1` … `2.37.1` |
| **MAJOR** | A generation number: "u8g2" means u8glib **version 2**. It has been `2` since 2016 and is effectively part of the name |
| **MINOR** | A milestone, every year or two (2.36.2 in October 2024, 2.37.1 in May 2026). The `ChangeLog` is written per MINOR, with an open `v2.36.xx` entry |
| **PATCH** | A release counter. New drivers and fonts land in PATCH releases: 27 commits between 2.36.18 and 2.36.19 |
| **Pre-releases** | None in tags. Users wanting the latest take the `master` branch zip (Arduino forum, see sources) |
| **Where the version lives** | Typed into the release script (`tools/release/print_release.sh`) and the distribution repo's manifest. **No version macro in the headers**, so code cannot check U8G2's version at compile time |
| **Distribution** | A script copies the sources into a separate repository, `U8g2_Arduino`, whose tags feed the Arduino Library Manager and PlatformIO |
| **Components** | One |

### esp32-app-foundation

| Aspect | What the foundation does |
|---|---|
| **Tag shape** | `vMAJOR.MINOR.PATCH[-CHANNEL.N]`: `v0.0.12-dev.93`, `v0.0.12-beta.4`, `v0.1.4` |
| **MAJOR, MINOR** | The owner's decision: a break, or a capability boundary |
| **PATCH** | Once per merged PR with new functionality |
| **Pre-releases** | Three tiers. **`dev`** is for in-flight builds and is tagged by agents. **`beta`** is cut after a PR merges, by the owner. **Stable** is promoted by the owner. `dev < beta < rc < stable` |
| **Where the version lives** | Git tags only. `inject_version.py` reads the tag at build time, and literals are forbidden |
| **Distribution** | Signed GitHub Releases, consumed by devices on OTA channels |
| **Components** | One |

## 2. Where they really differ

| Question | U8G2 | Foundation |
|---|---|---|
| Is maturity visible in the version? | No: every tag is a release, and "beta" is a branch | Yes: the channel is in the version |
| Can a consumer pin something immutable before a release? | Only a commit SHA | Yes: a `dev` tag |
| What does PATCH promise? | Nothing beyond "a later build"; features arrive in PATCH | A merged PR |
| How much ceremony? | Minimal: bump, tag, push | Three tiers, rules on who tags what, and supersession |
| Who is it built for? | A single maintainer and one artefact, for a very large audience of Arduino users | An owner plus agents, a product with OTA subscribers |
| How many components? | One, with a separate distribution repo | One |

Neither pattern has U8G2GL's main complications:
- **Two components in one repository.** The runtime and the CLI are versioned independently,
  so tags need a prefix whichever pattern is chosen.
- **A compile-time contract between them.** Generated code asserts the runtime floor and the
  schema version (rule 03). U8G2 has no equivalent at all, because it has no version macro.
- **An npm package,** whose ecosystem has SemVer pre-releases and dist-tags built in.

## 3. Critical evaluation

### The U8G2 pattern for U8G2GL

**For it:**
- **It is familiar to exactly the people who will use the runtime.** A `platformio.ini` with
  `olikraus/U8g2@^2.36.18` and `u8g2gl@^0.11.1` reads naturally.
- **It is the least ceremony,** and it maps directly onto PlatformIO and the Arduino Library
  Manager, which both expect plain SemVer tags.
- **It is proven over ten years** for a library whose users never wanted pre-release builds.

**Against it, for this project:**
1. **No channel means no safe pre-release.** U8G2GL has never been released or validated in
   the field. The first npm publish should not become `latest` for everyone running
   `npx u8g2gl`. npm can hold a version under a `beta` dist-tag, but the version itself would
   not say it is a beta, and the GitHub tag would look exactly like a release.
2. **"`master` is the beta" is the hazard this repository has already hit.** Rule 04 exists
   because the foundation pinned an intermediate commit that a squash merge would have made
   collectable. U8G2's pattern offers only SHAs for that case. The foundation's `dev` tag is
   the fix.
3. **PATCH-as-counter is incompatible with U8G2GL's floor.** U8G2 can add API in a PATCH
   because nothing checks its version: there is no macro, and consumers use a caret range.
   U8G2GL's generated code *does* check, by MAJOR.MINOR today. Under U8G2's practice,
   features in a PATCH would let generated code compile against a runtime missing what it
   calls. It would then fail with a bare missing symbol, which rule 03 calls the failure it
   exists to prevent. So adopting U8G2's pattern needs the same PATCH-aware floor as the
   foundation pattern, or a discipline U8G2 itself does not keep.
4. **Its shape comes from a separate distribution repository,** where tags carry no prefix
   because the repository holds one thing. U8G2GL holds two, so it would need prefixes anyway,
   and the bare-number look is lost.
5. **Matching U8G2's numbers would be actively misleading.** Calling U8G2GL "2.x", or tracking
   U8G2's MINOR, would imply a compatibility it does not have. U8G2GL's compatibility is with
   its own API and schema. U8G2's version is a dependency, and it is already declared
   correctly, as `"olikraus/U8g2": "^2.36.18"` in `library.json`.

### The foundation pattern for U8G2GL

**For it:**
1. **It shows maturity explicitly,** which this project needs now. The first CLI and runtime
   go out as `beta`, become stable only when you promote them, and are never `latest` by
   accident.
2. **`dev` tags give immutable pins,** which retires rule 04's squash constraint for good.
3. **It is one model across your projects.** You and the agents already work to it, and its
   who-may-tag rules are already written and enforced.
4. **Its PATCH-per-PR rule makes the number mean something.** It is checkable, and it fits a
   floor that compares PATCH.

**Against it, for this project:**
1. **It was designed for firmware with OTA subscribers.** A `dev` channel matters there
   because devices install dev builds. A library has no subscribers. Here `dev` tags are
   useful almost only as downstream pins, so most PRs would never get one, and that is fine.
2. **Its central mechanism cannot be copied in full.** PlatformIO fetches the runtime without
   its tags, so `X.Y.Z` must stay in the files and only the channel can come from the tag
   (revision 2, ruling 4). This half-and-half is a real, if small, cost: two places must
   agree, which a CI check enforces.
3. **Promotion is not byte-identical on npm.** A stable `0.15.2` is a re-pack of the same
   commit as `0.15.2-beta.1`, because npm versions are immutable and the channel is in the
   version string. The firmware model promotes the same binary. So the stable tarball should
   be checked again by `check-package.mjs`, which the drafted CI workflow does.
4. **Ceremony doubles,** with two components and three tiers each. In practice a typical PR
   touches one component, and `release-version.mjs next` prints the tag, so the cost is low.
5. **Numbers climb faster.** The foundation is at `0.0.12` after 93 dev tags. Under
   PATCH-per-PR, U8G2GL's CLI would reach 0.15.20 or more before 1.0. That is harmless, but
   it does not look like U8G2.

## 4. Recommendation

**Use the foundation pattern (VER-1 revision 2), and take U8G2's good habits where they cost
nothing.** The deciding reasons are U8G2's weaknesses 1–3. U8G2GL needs a safe pre-release,
immutable pins, and a PATCH that its compile-time floor can trust. U8G2 has none of those,
because it never needed them. U8G2GL already needs all three.

The affiliation with U8G2 is better expressed in substance than in tag shape:
- **Declare and document the U8G2 version U8G2GL is built and tested against,** in
  `library.json`, as today, and in each release's notes.
- **Keep a `ChangeLog` per MINOR,** as U8G2 does, so a user reading U8G2's history finds
  U8G2GL's in the same form.
- **Plain SemVer cores** (`0.11.1`), with the channel only where it means something, so
  stable releases look as ordinary as U8G2's.
- **If the Arduino Library Manager is ever wanted,** follow U8G2's distribution-repository
  approach. The Library Manager reads a repository's tags as versions, so a two-component
  repository with prefixed tags would need a generated one-component distribution repository,
  exactly as `U8g2_Arduino` is. That is independent of the scheme chosen here, and is not part
  of VER-1.

**If you prefer U8G2's pattern anyway,** the minimum safe form is still these three things:
- prefixed tags, because there are two components;
- a PATCH-aware runtime floor, because features would land in PATCH;
- an agreement never to pin a SHA, which means re-adding the squash ban permanently.

That is most of VER-1's work, without the channels.

## Sources

- U8G2 repository: tags, `ChangeLog`, `tools/release/` (the `extern/u8g2` submodule, 2.36.18).
- [olikraus/u8g2 on GitHub](https://github.com/olikraus/u8g2)
- [U8g2_Arduino releases](https://github.com/olikraus/U8g2_Arduino/releases)
- [Arduino forum thread on U8g2 (master zip as the latest build)](https://forum.arduino.cc/t/u8g2-graphics-library-for-monochrome-oleds-and-lcds/394731?page=3)
- [U8g2 on arduinolibraries.info](https://www.arduinolibraries.info/libraries/u8g2)
- `esp32-app-foundation` `docs/developer/versioning-policy.md` and `.agents/rules/03-versioning.md`.
