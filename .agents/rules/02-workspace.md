# Temporary Workspace Files

Never scatter temporary files, test scripts, or intermediate output across the
repository root or source directories.

Use, in order of preference:

1. **The session scratchpad**, if your harness provides one. Claude Code supplies
   a per-session scratchpad directory outside the project — it is isolated, needs
   no `.gitignore` entry, and cannot pollute a commit.
2. **`tmp/` at the repository root** otherwise. It is already in `.gitignore`.

Do **not** use the machine's `/tmp` directly: it is outside the permitted working
area, is shared between unrelated sessions, and its contents are invisible to the
user reviewing your work.

Build output belongs in `build/` (git-ignored), never committed. Verify with
`git status` before committing — a clean status is the check that this rule and
`.gitignore` are both working.
