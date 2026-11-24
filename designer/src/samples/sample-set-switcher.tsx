/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/samples/sample-set-switcher.tsx
 * Purpose: The set switcher on the canvas toolbar (ruling 9, ui_spec §11): the
 *          active sample set chosen where its effect is seen, so one layout can
 *          be swept against every set in seconds, by mouse or by keyboard.
 * Description: A dropdown like the toolbar's Zoom: "No sample set" (the
 *              initial values) and each set by name. Its tooltip names the
 *              keyboard cycle, which the shell binds (`app.tsx`) and
 *              `SampleSets.cycle()` performs. A view setting of this browser,
 *              never an edit.
 *
 * Exports:
 * - NEXT_SET_SHORTCUT:     The next-set key, as tooltips write it
 * - PREVIOUS_SET_SHORTCUT: The previous-set key
 * - SampleSetSwitcher:     The dropdown
 */

import { useObservable } from '../ui/use-observable';
import { useWorkspace } from '../ui/workspace-context';

/** The next set: Option or Alt with ], both platforms' spellings. */
export const NEXT_SET_SHORTCUT = '⌥] / Alt+]';

/** The previous set: Option or Alt with [. */
export const PREVIOUS_SET_SHORTCUT = '⌥[ / Alt+[';

/** @brief The canvas toolbar's sample-set dropdown. */
export function SampleSetSwitcher(): React.JSX.Element {
  const workspace = useWorkspace();
  const names = useObservable(workspace.samples.names);
  const active = useObservable(workspace.activeSampleSet.name);
  const value = active !== undefined && names.includes(active) ? active : '';
  return (
    <label className="sample-switcher" title={`The sample set the canvas shows. Next: ${NEXT_SET_SHORTCUT}, previous: ${PREVIOUS_SET_SHORTCUT}`}>
      Data{' '}
      <select aria-label="Sample set" value={value} data-sets={names.length} onChange={(event) => workspace.activeSampleSet.choose(event.target.value === '' ? undefined : event.target.value)}>
        <option value="">no sample set</option>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
