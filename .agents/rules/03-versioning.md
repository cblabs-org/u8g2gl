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
(design_spec §13.2), and asserts **two** version requirements at compile time (§16):

| Requirement | Pinned to | Comparison |
|---|---|---|
| `U8G2GL_REQUIRE_SCHEMA_VERSION` | The schema the generator wrote for | Equality: major, and minor while the major is 0 |
| `U8G2GL_REQUIRE_RUNTIME_VERSION` | The runtime version the generator was **built beside** | Floor: major equal, runtime minor ≥ the floor's |

The schema requirement is an **equality** — the major, and the minor while the
major is 0. The runtime requirement is a **floor**, compared on the minor at
every version, because API accretes and a newer runtime is fine.

**The runtime floor is not the generator's own version.** These two numbers are
independent by design and have already diverged (CLI 0.10.0, runtime 0.6.0), so
a floor taken from the generator's number would demand a runtime that does not
exist. They ship from one repository at one commit, so the CLI stamps the
runtime version in the tree it was built from and emits that — which is
automatic, and means a CLI can never require API newer than the runtime it
shipped beside.

The runtime floor exists because the generator and the runtime are shipped
separately and consumed together, so a project can sit on a current CLI and a
stale runtime indefinitely. Without it the failure is a missing symbol with no
explanation — or, in a project that happens to use no new API, **no failure at
all until a later edit reaches the gap**. These are the guardrails that stop a
stale `generated/` directory from failing mysteriously — do not weaken them for
convenience.

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

**This is checked as a condition on the diff, not as a test** — a test sees one
commit and the rule is about two. The committed goldens are stamped
`0.0.0-golden`, so they never move on a version bump and move only on a real
output change; the check is therefore "a golden changed, its fixture inputs did
not, so the CLI version must differ from the merge base" (§13.9). It runs in CI,
which PR-06 delivered (§17.3).

### A runtime bump forces a CLI patch bump, and that is intended

A runtime minor bump changes the floor the generator emits
(`U8G2GL_REQUIRE_RUNTIME_VERSION`), so every golden moves. The condition above
sees an output change with no *fixture* input change and fires.

**That is correct, not a false positive, and the right response is a CLI patch
bump.** The runtime version genuinely is an input to generated output; it is
simply not one the diff condition can see, because it lives outside the fixture
directory. The two ship from one repository at one commit, so coupling their
versions costs nothing and keeps the stamp honest.

A **patch** bump, not a minor: the generator did not change, its output did, and
for a reason the next reader can find from the runtime's own version. Observed
first at PR-06 (runtime 0.9.0 → 0.10.0 forcing CLI 0.13.0 → 0.13.1).

## Agent autonomy

| Action | Agent may do it |
|---|---|
| Bump a patch version in a PR that fixes something | ✅ Yes |
| Bump the generator version for a determinism-affecting change | ✅ Yes — it is *required*, not optional |
| Bump the **schema** version | ❌ No — owner decision, see §1.5 |
| Tag a release, publish to npm | ❌ No — owner decision |

Never publish to npm from an agent session. Output the exact command and ask the
owner to run it.
