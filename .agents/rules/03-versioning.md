# Versioning Policy

U8G2GL ships **four independently versioned things**. Confusing them causes silent
incompatibility, because the generator and the runtime are built separately and
consumed together.

| Artefact | Version lives in | Changes when |
|---|---|---|
| **Schema** | `u8g2gl.xml` `schema="0.3"` | The XML vocabulary changes |
| **Generator / CLI** | `package.json`, stamped into generated files | The tool changes |
| **Runtime library** | `CMakeLists.txt` `project(... VERSION)` | The C++ API or behaviour changes |
| **npm package** | `package.json` | Any CLI release |

## The compatibility rule

Generated code records the schema version and generator version that produced it
(design_spec §13.2). The runtime **refuses to compile against a mismatched major
version** (§16). These are the guardrails that stop a stale `generated/` directory
from failing mysteriously — do not weaken them for convenience.

## Schema versions are expensive

Per design_spec §1.5, schema surface is the costly kind of complexity because it
is permanent once authors write XML against it. A schema bump is therefore a
deliberate act, not a side effect:

- **Additive** change (new optional attribute, new widget) — minor bump, and the
  validator must keep accepting the prior version.
- **Breaking** change (removed or re-meaning an attribute) — major bump, and §15.4
  requires the CLI to refuse the old version with a specific migration message.
  Never silent.

Pre-1.0 breaking changes are expected. The requirement is that they are
*diagnosable*, never silent.

## Determinism is a versioning concern

A generator change that alters output **without an input change** is a breaking
change and requires a generator version bump (§13.9). Generated code is committed
and appears in review; an unexplained diff destroys trust in the tool.

## Agent autonomy

| Action | Agent may do it |
|---|---|
| Bump a patch version in a PR that fixes something | ✅ Yes |
| Bump the generator version for a determinism-affecting change | ✅ Yes — it is *required*, not optional |
| Bump the **schema** version | ❌ No — owner decision, see §1.5 |
| Tag a release, publish to npm | ❌ No — owner decision |

Never publish to npm from an agent session. Output the exact command and ask the
owner to run it.
