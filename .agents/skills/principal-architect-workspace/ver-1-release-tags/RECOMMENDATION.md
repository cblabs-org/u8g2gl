# Recommendation: How U8G2GL Is Versioned and Released

*For the owner to review and agree, 2026-11-03. It is based on `VERSIONING-OPTIONS.md`, and
it is carried out by VER-1 (`PROJECT.md`, revision 3).*

## The recommendation

**Adopt `esp32-app-foundation`'s SemVer channel model for U8G2GL's two released components,
and keep U8G2's habits where they cost nothing. Do not copy U8G2's tag shape or its numbers.**

## What you would be agreeing to

| # | Decision | In practice |
|---|---|---|
| 1 | **Two components, each tagged separately** | `runtime-v…` for the PlatformIO library, `cli-v…` for the npm package. The designer, the editor Wasm and the schema ship inside these and are not tagged |
| 2 | **The foundation's tag format and channels** | `-dev.N` → `-beta.N` → stable, with `dev < beta < rc < stable`. For example `cli-v0.15.2-beta.1`, then `cli-v0.15.2` |
| 3 | **The foundation's tiers and who tags** | Agents create `dev` tags themselves, mainly for downstream pins. **`beta`, `rc` and stable are yours.** An agent asks before a `dev` tag in a PATCH that already has a beta |
| 4 | **The foundation's numbering** | PATCH +1 per merged PR that changes a component. MINOR and MAJOR are your decision. Schema bumps stay yours. Today's numbers carry on (runtime 0.11, CLI 0.15) |
| 5 | **The `X.Y.Z` in files, the channel in the tag** | The one forced departure: PlatformIO fetches the runtime without its tags. Promotion between channels is still only a tag. A CI check refuses a tag that disagrees with the files |
| 6 | **The runtime version check compares PATCH** | Needed once features land in PATCH releases. Code already generated keeps compiling. This makes VER-1 itself runtime 0.11.1 and CLI 0.15.2 |
| 7 | **npm channels** | Beta and rc are published with `npm publish --tag beta` (or `rc`), so `npx u8g2gl` only ever gets stable. `dev` is never published |
| 8 | **The U8G2 affiliation, in substance** | A root `ChangeLog` per MINOR in U8G2's own form. Each release records the U8G2 version it was tested against. Stable versions are plain `0.11.1`, as U8G2's are. No matching of U8G2's numbers |
| 9 | **Rule 04's squash ban stays for now** | `dev` tags make pins safe. You lift the ban once the foundation repins to a tag |

## What you would be rejecting, and why

- **U8G2's pattern as it stands** (bare numbers, no channels, `master` as the beta). It gives
  no safe pre-release for a first publish and no way to pin anything but a commit. Its habit
  of adding features in PATCH releases would undermine U8G2GL's compile-time runtime check,
  which U8G2 never has to worry about because it has none.
- **Matching U8G2's numbers** (calling U8G2GL "2.x"). It would imply a compatibility U8G2GL
  does not have. U8G2 is a dependency, and it is declared as one.
- **For now, the Arduino Library Manager.** It would need a separate distribution repository,
  as U8G2's own `U8g2_Arduino` is.

## What happens next if you agree

1. A worker builds VER-1: four work orders in one PR, with my verification. Rule 03 is
   rewritten; `scripts/release-version.mjs` checks a tag and prints the next one; the CLI
   packs as its tag; a CI check runs on every tag push; the runtime check compares PATCH; and
   `docs/RELEASING.md` and the `ChangeLog` are added.
2. After it merges, you tag the first pre-releases, `runtime-v0.11.1-beta.1` and
   `cli-v0.15.2-beta.1`, and run `npm publish --tag beta`. The exact commands will be in
   `RELEASING.md`.
3. When you are satisfied, you promote them to stable: `runtime-v0.11.1`, `cli-v0.15.2`.
4. An agent tags the foundation's pinned commit `82ec83f` as `runtime-v0.7.0-dev.1`.
   Repinning the foundation to that tag is foundation work.
