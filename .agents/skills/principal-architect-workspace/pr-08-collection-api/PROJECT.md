# PR-08: named element handles, generated collection storage and the collection API

**Status: APPROVED by the owner 2026-11-24 ("Approve as recommended"), as refreshed.**

**Base:** `origin/main` @ `8012495` (after #66). Schema 0.7 (unreleased), runtime 0.15.0, CLI 0.26.0.
**Plan:** [REFRESH-PR-08-09.md](REFRESH-PR-08-09.md), findings 1–5 and decisions Q1a, Q2a, Q3a,
Q4a and Q7. **Work orders:** [WORKORDERS-PR-08.md](WORKORDERS-PR-08.md).
**Follows:** PR-09 (`../pr-09-focus-input/PROJECT.md`) runs after this one (Q1a).

## Why

- **The gate's condition 2** (PR-07, 2026-10-22): [Q-19] is resolved before any collection widget
  ships in foundation. Today every collection widget carries its manifest defaults' storage
  (2,304 bytes for a service list) whatever its XML declares, and §18 cannot report it.
- **Firmware can't reach a named element.** Every object is `static` in its screen's `.cpp`, so an
  application has no route to fill `services`. §9.2's generated API doesn't exist.

## PA rulings (binding, settling the approved decisions' detail)

1. **Handles (Q2a).** `ui.hpp` declares, for every named element realised as an object, a typed
   reference `extern <class>& ui_<screen>_<element>;`, where `<screen>` is the screen's name as
   `ui_screen_<screen>` already spells it. A drawing element (realised as a draw call, §13.5) has no
   object and gets no handle. Any collision between two generated identifiers is a diagnostic, never
   a silent overwrite.
2. **Row encoding (Q3a).** A `<data>` block's row has a fixed byte layout, derived only from its
   `<field>`s in declaration order, each repeated `repeat` times (1 when absent):
   - `string`: `max_len + 1` bytes, NUL-terminated, `max_len` resolved per instance from the prop it
     names;
   - `int`: an `int32_t`;
   - `bool`: one byte;
   - `enum`: one byte, the value's index in `values`.
   Fields are aligned to their natural size, and the row is padded to 4 bytes. Because the layout
   follows from the manifest, the generator can compute it exactly, and §13.7's rule (no assumption
   about a class's `sizeof`) still holds. A `string` field with no `max_len` can't be stored, so
   `generate` refuses it with a diagnostic naming the field.
3. **Storage (Q3a).**
   - **Firmware:** the generator emits one `static` buffer per instance per `<data>`, sized
     `capacity × row bytes` from that instance's props.
   - **Editor target:** the registry allocates the same size when it constructs the instance, and
     frees it with the scene. That's editor target only ([UD-4]), so the heap is allowed there.
   - **Hand-over:** at init, after the setters and the static children, each buffer is handed to the
     widget through one new virtual on `u8g2gl_obj`, carrying the `<data>`'s index in declaration
     order and a `u8g2gl_rows` view. The default does nothing.
   - **The view:** `u8g2gl_rows` is a new runtime type, a non-owning view over the buffer and its
     generated layout, with typed per-field accessors and the capacity.
   - **Batches:** one buffer, with no double buffering. A batch writes rows in place, and the widget
     publishes the count at `commit()`, as both widgets already do with their single arrays.
4. **Report.** §18 reports each instance's `<data>` storage exactly, as derived bytes. The designer's
   *RAM cost not reported for project widgets ([Q-19])* line becomes the figure, and each capacity
   prop's `help` "Determines allocated RAM" becomes true.
5. **The facade (Q2a).** Each `<data>` on each instance gets a generated object, for example
   `ui_departures_services_rows`:
   - `begin()`, `add_row(…)` and `commit()`, forwarding to the widget's own `begin()`, the declared
     access method and `commit()`;
   - `capacity()`, returning the declared value;
   - `add_row`'s parameters are the fields in declaration order, with exactly the C++ types E-3a's
     fill thunk passes for each field type (`editor-registry.ts`), so there's one convention, not
     two. A `repeat` field also gets a pointer-and-count overload, and an `initializer_list` one.
   - Past capacity, `add_row` returns `false`.
6. **Composites with their own class (Q4a): deferred.** The refusal stays, and its message names a
   later PR instead of PR-08.
7. **Migration.** Every copy of `wd_service_list` and `wd_train_formation` that declares `<data>`
   moves onto `u8g2gl_rows` and drops its own row arrays:
   - the departures fixture;
   - `test/collection_data`;
   - `test/static_children`;
   - and any other copy the worker finds.
   Their static-child storage (`columns_`) is not `<data>` and stays. The 0.4 widget-probe fixture
   has no `<data>` and stays untouched.
8. **E-3b's test run** moves its firmware half onto the facade, and the `objs[i]` index guard and
   `U8G2GL_TEST_RUN_SAMPLES`'s mismatch case retire.
9. **Versions (Q7).** Runtime 0.15.0 → **0.16.0**, for the new type and virtual. CLI 0.26.0 →
   **0.27.0**: generated output changes, and the goldens move for a reason each diff explains.
   Schema stays **0.7** (unreleased).

## Work orders

| PR | WO | Branch | Scope |
|---|---|---|---|
| PR-08 | WO1 | `u8g2gl-08/wo1-element-handles` | Named element handles (ruling 1) |
| PR-08 | WO2 | `u8g2gl-08/wo2-row-storage` | Row encoding, `u8g2gl_rows`, generated storage, §18, the designer's RAM figure, the migration (rulings 2–4, 7) |
| PR-08 | WO3 | `u8g2gl-08/wo3-collection-facade` | The facade; E-3b's test run moved onto it (rulings 5, 8) |
| PR-08 | WO4 | `u8g2gl-08/wo4-docs-review` | Docs, the classed-composite message (ruling 6), readability, versions (ruling 9) |

## Status log

| Date | Event |
|---|---|
| 2026-11-24 | PA refreshed PR-08 and PR-09 against main @ `8012495`, after #66 merged ([REFRESH-PR-08-09.md](REFRESH-PR-08-09.md)). |
| 2026-11-24 | **Approved by the owner.** Asked "Approve the refresh with Q1a–Q7 as recommended?", the owner replied, in their own words: **"Approve as recommended"**. That approves Q1a (PR-08 first), Q2a (handles and §9.2's facade), Q3a (generated storage per instance), Q4a (classed composites deferred), Q5a and Q6a (PR-09's, recorded there) and Q7 (minor bumps). PA checked schema 0.7 is unreleased: `u8g2gl` isn't on npm and there's no schema tag. Rulings 1–9 above settle the detail without widening the decisions; Q3a needs no manifest change. PA branched `u8g2gl-08/wo1-element-handles` from `origin/main` @ `8012495` in `../U8G2GL-e4`. |
