# S-1: Schema 0.5 — Palette Metadata

**Parent:** E-2's end-of-programme decision on EDITOR-DESIGN §8 (C4 item 1, deferred to E-2d's
end). **Base:** `main` @ `6d3ae16` (E-2d, #39, merged). **Worktree:** `../U8G2GL-s1`.

## Owner decision and approval

At E-2d's end the PA recommended adding no schema feature yet. The owner answered:

> "Add palette metadata"

The PA then proposed this PR in chat on 2026-10-31: three optional attributes on `<api>` (`label`,
`category` and `description`); icons held back; schema 0.4 → 0.5, runtime 0.10.0 → 0.11.0, and
CLI → 0.14.0; `<previews>` deferred to E-3. The owner answered:

> "Approved, proceed"

Rule 03 makes a schema bump the owner's decision; this record is that decision.

## Decomposition

| WO | Topic | Branch | Status |
|---|---|---|---|
| WO1 | Schema 0.5: the parser, the manifest type, the validator, both versions accepted | `u8g2gl-s1/wo1-schema` | ⏳ |
| WO2 | Versions: the runtime schema minor, the runtime and CLI bumps, goldens regenerated | `u8g2gl-s1/wo2-versions` | ⏳ |
| WO3 | Metadata on every framework manifest and the fixture's project widgets | `u8g2gl-s1/wo3-metadata` | ⏳ |
| WO4 | The palette reads it | `u8g2gl-s1/wo4-palette` | ⏳ |
| WO5 | Docs; readability review; screenshots; PA verification | `u8g2gl-s1/wo5-docs-review` | ⏳ |

## PA rulings

1. **The surface: exactly three optional attributes on `<api>`.**
   - `label`: the display name, plain text, at most 32 characters.
   - `category`: plain text, at most 24 characters, compared exactly (case-sensitive).
   - `description`: one line, at most 120 characters, with no line breaks.

   Nothing else is added: no `icon`, no `group=`, no `visible_when`, no `<previews>`. Each
   attribute is **not inherited** through `extends`: a project widget extending `u8g2gl_obj`
   does not become "Object". Values are trimmed. An empty value is a diagnostic, because an
   author who writes the attribute means something by it.
2. **Versions** (rule 03, additive change).
   - **Schema 0.4 → 0.5.** The validator accepts both `0.4` and `0.5`. A `0.4` project that uses
     any of the three attributes gets one diagnostic per attribute, naming `schema="0.5"` as the
     fix; it is never silently accepted. `0.3` keeps its migration refusal unchanged.
   - **Runtime 0.10.0 → 0.11.0.** `U8G2GL_SCHEMA_VERSION_MINOR` goes to 5, because while the
     major is 0 the minor must match exactly. That is the runtime's only change, and its
     comment says why.
   - **CLI → 0.14.0.** Generated code then asserts `REQUIRE_SCHEMA_VERSION(0, 5)` and the new
     runtime floor.
   - **Goldens.** Every one moves, and **only** in the version-stamp lines. Check this by diffing:
     any other golden change stops the work and is reported.
   - **Fixtures.** The repository's own fixtures and example projects move to `schema="0.5"`.
     One 0.4 fixture is kept, to prove 0.4 still validates.
3. **Generator output is unaffected by the metadata.** The three attributes reach no generated
   file, so adding or removing them changes no output byte. Test this.
4. **Data (WO3).** Every framework manifest in `include/u8g2gl/manifests/` gets all three, with
   short, factual wording; drawing elements get category "Drawing". The departures fixture's three
   project widgets get them too, as the worked example. Categories come from a small set that is
   decided once and listed in the WO3 report.
5. **The palette (WO4)** keeps its Framework / Project / Drawing split. Within each group it
   arranges entries by `category`, in first-appearance order in the registry; entries with no
   category come last, under no heading. Each entry shows its `label`, or the tag when there is
   no label; the tag in muted text when a label is shown; and the description beneath it. The
   filter matches the label, the tag and the description. Still generated: no widget is named in
   designer code. The palette must still not re-render on a keystroke or a drag.
6. **Docs (WO5).** Update these:
   - design_spec §15.4: 0.5 is additive, with no migration table.
   - The schema reference, wherever `<api>`'s attributes are listed.
   - ui_spec §15's status column: palette metadata **done (0.5, icons not yet)**; `<previews>`
     **deferred to E-3**; grouping and `visible_when` **declined at C4**.
   - EDITOR-DESIGN §8.
   - The README's or getting-started schema version, if it states one.
7. **Boundary:**
   - `cli/` (schema, parser, validator, manifest, generator stamps, data);
   - `include/u8g2gl/u8g2gl_version.h` and `include/u8g2gl/manifests/`;
   - `CMakeLists.txt`'s version;
   - fixtures and goldens;
   - `designer/src/palette/` and its tests;
   - the docs above.

   Nothing in the runtime's behaviour, and no new dependency. The downstream pin in rule 04 is
   unaffected: this ships as a new version.

8. **The schema guard is the generator's schema** (PA, 2026-10-31, on deviation 1 in the
   worker's report). The generator wrote `REQUIRE_SCHEMA_VERSION` from the project's declared
   version. That made an accepted 0.4 project generate code that runtime 0.11 refuses, which
   would turn an additive bump into a break. Rule 03 already pins the guard to "the schema the
   generator wrote for", meaning the generator's own schema: so the guard always emits the
   current schema (0.5) for any version the validator accepts. The `// schema` provenance stamp
   keeps recording the version the project declared. A test generates a 0.4 project and checks
   that its guard reads `(0, 5)`. design_spec §15.4's note telling 0.4 authors to re-declare is
   replaced by "0.4 projects keep working unchanged". Fixes the version-guard tests if they
   assumed otherwise. The only golden move this adds is the kept 0.4 fixture's guard line, if it
   has one.

## Status log

- **2026-10-31.** #39 merged (`6d3ae16`). Worktree created from `main` @ `6d3ae16`, `extern/u8g2`
  checked out. WO1–WO5 issued to one worker in order.
- **2026-10-31.** WO1–WO5 reported complete (`2511296`). Ruling 8 issued on deviation 1; the worker
  resumed to apply it before PA verification.
