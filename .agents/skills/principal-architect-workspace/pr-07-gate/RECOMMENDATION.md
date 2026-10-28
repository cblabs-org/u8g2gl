# PR-07 — the Principal Architect's recommendation

The evidence is in [GATE-DOSSIER.md](GATE-DOSSIER.md). This is the PA's reading of it, so the owner
can disagree with it point by point. **The verdict is the owner's; §6 binds it, not this file.**

## For the owner

**The evidence supports continuing. The PA recommends GO, with three conditions attached to what
comes after the gate, not to its criteria.**
- The new runtime draws the migrated board pixel-identically, as a plain user, on the host and on
  the device at 0.10.0.
- It costs at most 0.6 points of flash and no static RAM.
- It removes every layout decision from the board's C++ without growing it.
- Its own work in the edit loop (0.05 s of generation, a compile 0.71 s faster) is not where the
  loop's +4.9 s comes from.

**The strongest argument against is that this gate certifies very little.** Only criterion 1
passes without a qualification. Both criteria that failed on measurement passed after being reworded.
All four were measured on four static labels, on one board, with no animation, conditional
visibility, collections, input or second screen. And the thing U8G2GL exists for — a visual
designer over the XML — is deliberately untested until E-2. A GO here says "the foundation is not
worse than what it replaces". It does not say "the foundation is worth building an editor on", and
that is the much larger commitment that follows. The case for stopping is that stopping is cheap
now and will not stay cheap.

The PA weighs that, below, and still recommends GO.

---

## How the PA reads each criterion

| # | Dossier result | PA's reading | Weight |
|---|---|---|---|
| 1 | Met | Strongest result the gate has: host and device, byte for byte, at 0.10.0 | Supports GO |
| 2 | Met-with-qualification | The declarative half is the real claim and passes strictly. The inflation half is neutral, which is the right answer for a free abstraction, on thin evidence | Supports GO, weakly |
| 3 | Met-with-qualification | Strong on what was measured. The missing run-time heap figure is a gap, not a doubt | Supports GO |
| 4 | Met-with-qualification | Met on the text as a whole, but the +5 s is real and has an owner | Supports GO only with condition 2 |

### Criterion 4 — where the PA lands on "controls", and why

The PA reads the criterion as **met**, on the text rather than on sympathy. The sentence that
defines it sorts growth into two kinds:

- **"growth attributable to U8G2GL"**, which must be immaterial;
- **"growth from the build tool's dependency resolution"**, which is to be "named, quantified and
  attributed, not absorbed".

The +5.48 s is the second kind by every measurement taken. It is present when nothing is compiled,
it tracks the dependency graph, and it disappears when dependency resolution is switched off. The
criterion's own structure puts it there. Read that way, "not absorbed" means the cost must be
stated, not hidden inside "the framework is fine". This dossier states it.

**The PA does not think that settles the matter, and says so.** U8G2GL chose to be consumed as
three libraries, and the cost is paid by every consumer on default settings, on every build. "Named
and not absorbed" must not become "named and therefore acceptable". That is why condition 2 below
exists. A GO that leaves a 22% slower edit loop as foundation's default, with the fix known and
unadopted, would be absorbing it by another route.

**If the owner reads "controls" to include the packaging, criterion 4 is not met, and §6 says
stop.** The PA would not argue against that reading on the text. It argues only that the text was
written to sort exactly this cost into the second category.

### Weighing the case against

**"Both failing criteria were reworded until they passed."** True, and it should not be explained
away.
- **Criterion 2:** the rewording made the declarative half stricter, so it is not purely a
  softening. The inflation half passes on the per-board reading only, and the dossier names the
  one-off host cost that reading sets aside.
- **Criterion 4:** the rewording moved a build-tool cost out of the framework's column. The owner
  made both rulings on stated arguments, recorded with the original wording, before this PR began.
- The PA's position: the rewordings are defensible, **and a third would not be**. If the conditions
  below fail, the gate should not be reworded again to absorb them.

**"It certifies only the easy case."** True, and limitation 2 says so where the verdict is read.
But the gate was designed that way on purpose (CA-2, resolved 2026-10-05). The owner chose to
prove equivalence first and defer the designer, knowing that a pass would certify only the half
U8G2GL shares with prior art. Discounting the pass for that now would re-decide CA-2 rather than
apply §6. The probes, which are not gate evidence, are where the harder case was tried. There the
architecture held: a real departures screen in 15 lines of XML and two widgets.

**"[Q-19] shows the spec claiming what does not exist."** True, and it matters. It is the first
place a real application screen would overspend RAM without being told. But no criterion depends on
collections, and the fix is additive: generate the storage §9.2 already describes. It bears on
condition 3, not on the verdict.

**"Stopping is cheap now and won't be later."** True, which is why the PA's GO comes with conditions
that keep the expensive steps contingent. On the other side, PR-01–06 are additive and
independently useful, foundation's half never merged, and a NO-GO costs nothing that has shipped.
The PA could recommend NO-GO without loss of face, and has considered it. It does not, because no
criterion fails on its text. A NO-GO would rest on doubting the criteria rather than on the
measurements, and §6's whole value is that the criteria were fixed before the measurement was read.

---

## The conditions

These attach to the work after a GO. None changes a criterion.

1. ~~**Before the verdict is recorded: flash the C1 image.**~~ **Satisfied 2026-10-22:** flashed
   with the owner's permission. Device = host at 0.10.0, and criterion 1 is met outright. No
   measurement remains open.
2. **The cut-over must either remove the +5 s or record its acceptance as an owner decision.** It
   can be removed by U8G2GL needing fewer libraries, or by foundation adopting explicit `lib_deps`
   with `lib_ldf_mode = off` (measured at 0.8.0: 14 s faster than legacy, about 45 lines of
   configuration, about 430 B of image). Not by default.
3. **[Q-19] is resolved before any collection widget ships in foundation**: generated storage per
   §9.2, or §9.2 and §18 corrected to say what actually happens.
4. **PR-10 reports criterion 2's per-board count as each board migrates**, attributed the same way
   as `C2-ANALYSIS.md`, with a stated tripwire. If the second board's authored code, after
   attribution, exceeds its legacy count, the programme stops and reviews before the third. That
   converts limitation 1 from a caveat into a measurement, at no extra cost.

## What a GO does not decide

E-D, the editor design, is gated on PR-07's GO and is the next large commitment. A GO authorises
starting it; it does not show that it will succeed. The cut-over's own requirements (F-LINK,
F-GLOB, F-REGEN, F-PLATFORM, the repin to a tag, the NTP and system-information sources) are
recorded and out of scope here.
