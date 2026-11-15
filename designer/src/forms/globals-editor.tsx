/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/forms/globals-editor.tsx
 * Purpose: What the `globals.xml` form adds to the generic one (ui_spec §6.4):
 *          the font picker where a `<builtin>` names its font, and the same
 *          picker on "+ Built-in font", so a new font is chosen from what U8G2
 *          bundles instead of typed into an empty box. Everything else in the
 *          file is the generic form's.
 * Description: `useGlobalsEditor` returns the hooks `FormView` takes for
 *              `globals.xml`, as `useProjectEditor` does for `u8g2gl.xml`:
 *              a `fieldControl` for `font-builtin/name`, and an `AddChooser`
 *              for the `font-builtin` kind, whose choice becomes the new
 *              item's `name` in the one add edit. The fonts the project
 *              already declares are read from the form itself, so the marks
 *              follow the text as it is typed, not the last run.
 *
 * Exports:
 * - GlobalsEditorHooks:  The hooks the globals.xml form takes
 * - useGlobalsEditor():  Those hooks, for a form
 */

import { useMemo, type ReactNode } from 'react';
import { BuiltinFontField, FontPicker } from './font-picker';
import { declaredBuiltins } from './font-picker-model';
import type { FormField, FormModel, FormNode } from './form-model';
import type { AddChooser } from './form-view';

/** The hooks the globals.xml form takes. */
export interface GlobalsEditorHooks {
  readonly fieldControl: (field: FormField, node: FormNode, commit: (value: string | undefined) => void) => ReactNode;
  readonly addChooser: AddChooser;
}

/** The vocabulary id of `<builtin>`. */
const BUILTIN = 'font-builtin';

/**
 * @brief The globals.xml form's hooks.
 *
 * @param model  The form as last read, for the fonts it declares.
 */
export function useGlobalsEditor(model: FormModel | undefined): GlobalsEditorHooks {
  const declared = useMemo(() => declaredBuiltins(model), [model]);
  return useMemo<GlobalsEditorHooks>(
    () => ({
      // --- A <builtin>'s name: the picker behind "Change font…" ---
      fieldControl: (field, _node, commit) => (field.elementId === BUILTIN && field.attribute.name === 'name' ? <BuiltinFontField field={field} declared={declared} commit={commit} /> : undefined),
      // --- "+ Built-in font": the picker, and the choice is the new name ---
      addChooser: {
        has: (kind) => kind === BUILTIN,
        render: (_list, kind, choose, cancel) =>
          kind === BUILTIN ? <FontPicker label="Add a built-in font" current={undefined} declared={declared} onChoose={(name) => choose({ name })} onCancel={cancel} /> : null,
      },
    }),
    [declared],
  );
}
