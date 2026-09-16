/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/shared-model.ts
 * Purpose: The one expanded, resolved model a validation run shares, and the
 *          target it is built for. Before PR-04 WO8a four passes each expanded
 *          the document for themselves (WO7 F3, WO7b 1) and `generate` resolved
 *          a different, unexpanded tree (WO7 F2): nothing made them agree, and
 *          agreeing is the whole point — `validate` must never pass a document
 *          `generate` refuses.
 * Description: `pipelineOf` hands a pass the run's shared pipeline, building one
 *              only when the caller supplied none. `validate()` always supplies
 *              one, so a full run expands exactly once however many passes ask;
 *              a pass called on its own in a unit test gets its own, which is
 *              why the field is optional rather than required.
 *
 *              It lives here rather than in validate.ts because validate.ts
 *              imports every pass, and a pass importing a value back from it
 *              would be a module cycle.
 *
 * Exports:
 * - checkedTarget(input): The target this run resolves and bounds-checks against
 * - pipelineOf(input):    The run's shared expansion and resolution
 */

import type { Target } from '../schema/project.js';
import { createScreenPipeline, findTargetDisplay, type ScreenPipeline } from '../resolver/index.js';
import type { ValidateInput } from './validate.js';

/**
 * @brief The target geometry is resolved and bounds-checked against.
 *
 * `generate` passes the target it builds, because a screen that fits one display
 * can overflow another (§7.2, §7.3); `validate` passes none, and the project's
 * first declared target is checked, as it always has been.
 *
 * @param input Validator input.
 * @return The target, or undefined when the project declares none.
 */
export function checkedTarget(input: ValidateInput): Target | undefined {
  return input.target ?? input.project?.targets?.[0];
}

/**
 * @brief The expansion and resolution this run shares.
 *
 * @param input Validator input; its `pipeline` is used when present.
 * @return The supplied pipeline, or a new one over the same document and the
 *         same target's display — so a pass judges the same model either way.
 */
export function pipelineOf(input: ValidateInput): ScreenPipeline {
  if (input.pipeline !== undefined) {
    return input.pipeline;
  }
  const display = findTargetDisplay(checkedTarget(input), input.catalogue ?? []);
  return createScreenPipeline({
    globals: input.globals,
    screens: input.screens ?? [],
    manifests: input.manifests,
    ...(display ? { display } : {}),
  });
}
