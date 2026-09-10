# [U-1] Element Identity

**Status**: Decided
**Date**: 2026-09-10
**Decision**: Option (a) — require `name` on every element

## Context

The editor must address an element stably across edits — to select it, to write
back one changed attribute, to keep a selection alive while the user types
elsewhere. Without a name, an element has no identity.

## Options Considered

(a) Require `name` on every element
(b) Synthetic ids from document position
(c) Hybrid: `name` when present, synthetic otherwise, with promotion

## Decision

Option (a). Reasoning:
- XML is an intermediate descriptive format, not hand-authored prose
- The generator needs a name anyway for C++ variable naming (§13.3)
- The agent creating XML will typically generate meaningful names
- Option (c) adds significant complexity for marginal benefit
- The schema is pre-1.0; existing XML is test fixtures, not production

## Graceful Fallback

When the parser encounters an element without `name`, it auto-generates one from
`{tag}_{index}` (e.g. `box_3`) and emits a warning diagnostic. This ensures:
- Existing XML is loadable (not a hard break)
- The warning tells the author to add a meaningful name
- The generator always has a name to emit as a C++ variable
