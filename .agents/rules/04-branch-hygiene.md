# Branch Hygiene

This rule exists because the same mistake has been made twice in this repository,
both times by an agent that believed it knew which branch it was on.

## Verify the branch before every commit

```bash
git branch --show-current
```

Run it. Do not infer the branch from what you did earlier in the session, and do
not trust a `git checkout` from twenty tool calls ago — a rebase, a worktree
operation, or another session sharing the checkout can move you without any
message that looks like a warning.

## A successful push proves nothing about your commits

```bash
git push origin main     # ← succeeds even when main has nothing new
```

`git push origin <branch>` pushes **that branch**, not your work. If your commits
landed somewhere else, this reports success and pushes an unchanged ref. The
confirmation is true and completely uninformative.

**Verify what you actually pushed:**

```bash
git log --oneline origin/main -3          # is my commit there?
git branch --contains <sha>               # where did it actually land?
```

## Re-verify after anything that moves HEAD

A `git rebase`, `git checkout`, `git switch`, worktree add or remove, or a
parallel session in the same checkout all move HEAD. **Both incidents here
followed exactly this shape:** a rebase or another session left HEAD on a feature
branch, subsequent documentation commits landed there, and `git push origin main`
confirmed success each time.

After any such operation, state the branch explicitly before continuing.

## One working tree, one owner

If another session or agent may be working in this checkout, do not assume you
own HEAD. Prefer `git worktree add` for parallel work — it makes the hazard
structurally impossible instead of something two parties must both remember.

Where a shared tree is unavoidable, verify the branch immediately before each
commit rather than once at the start.

## When you find work on the wrong branch

Do not panic and do not force-push. The commits exist; this is a placement
problem.

1. Check whether the strays reached the remote (`git log --oneline origin/<branch>`).
   If they did not, no force-push will be needed.
2. Confirm what the stray commits actually touch, so you know a cherry-pick is
   clean: `git diff --name-only <base>..<tip>`.
3. Cherry-pick onto the intended branch, verify, and push.
4. Restore the wrong branch with `git branch -f <branch> <original-tip>`.
5. Confirm the restored branch matches its remote.

Say plainly what happened. A quietly repaired mistake is one nobody can learn
from, and this rule exists only because the first incident was written down.

## A downstream pin makes merge strategy load-bearing

`esp32-app-foundation`'s held integration branch pins the U8G2GL runtime by
**git commit** — an intermediate work-order commit, not a release. A commit no
ref reaches is eventually collected, and a squash merge leaves a PR's
intermediate commits reachable from no ref at all, breaking a branch nobody is
currently looking at.

**So: merge U8G2GL PRs with merge commits, not squash, while any downstream
branch pins a bare commit.**

That is a policy, and a policy is a weak guarantee for something a build depends
on. **The robust fix is a tag**, which is a ref and is never collected. Tagging
is an owner action (`.agents/rules/03-versioning.md`).

### Where that stands: the pinned commit is tagged

The owner tagged foundation's pinned commit **`v0.7.0-integration`** (→
`82ec83f`). That tag is now what keeps the commit alive, and it would be even
if every PR were squashed. Check it rather than trust this paragraph:

```bash
git rev-parse 'v0.7.0-integration^{commit}'      # 82ec83f…
git ls-remote --tags origin v0.7.0-integration   # the tag is on the remote
git merge-base --is-ancestor 82ec83f origin/main # exits 1 as of 2026-10-28
```

The last line matters: as of 2026-10-28 `82ec83f` is **not** an ancestor of
`main` at all. The merge-commit policy was never what protected this pin; the
tag is, and nothing else.

**What that changes:** this one pin no longer depends on how PRs are merged.
**What it does not:** the policy stays, because it is about *any* bare-commit
pin, and two remain possible:

1. Foundation still names the bare SHA, not the tag, so nothing on its side
   says which ref keeps that commit alive: moving or deleting the tag would
   break it silently. Until it pins `v0.7.0-integration` by name, treat the tag
   as untouchable.
2. The next pin — the cut-over on a newer runtime — will be another bare
   commit until it, too, is tagged.

So the order is unchanged: the owner tags a commit before anything downstream
pins it, and the downstream pins the tag. When no downstream branch pins a bare
commit, this section can go.
