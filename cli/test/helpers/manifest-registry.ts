/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/helpers/manifest-registry.ts
 * Purpose: One way for tests to build the element registry the validator takes,
 *          so no test re-implements registry construction and drifts from it.
 * Description: `registryOf` registers hand-written manifests as project manifests
 *              with no framework behind them — for pass-level unit tests that want
 *              only the elements they declare. `frameworkRegistry` puts the real
 *              bundled framework manifests underneath, as the CLI does.
 *
 * Exports:
 * - registryOf(manifests):        Registry of the given manifests only
 * - frameworkRegistry(project):   Registry of the bundled framework manifests plus `project`
 */

import { buildManifestRegistry, parseFrameworkManifests } from '../../src/core/manifest/index.js';
import type { ManifestRegistry } from '../../src/core/manifest/index.js';
import type { WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { FRAMEWORK_MANIFESTS } from '../../src/data/manifests.js';

/**
 * Builds a registry holding exactly `manifests`, registered as project
 * manifests, with no framework manifests.
 */
export function registryOf(manifests: readonly WidgetManifest[] = []): ManifestRegistry {
  return buildManifestRegistry({ framework: [], project: manifests });
}

/**
 * Builds a registry of the real bundled framework manifests plus `project`.
 */
export function frameworkRegistry(project: readonly WidgetManifest[] = []): ManifestRegistry {
  return buildManifestRegistry({
    framework: parseFrameworkManifests(FRAMEWORK_MANIFESTS).manifests,
    project,
  });
}
