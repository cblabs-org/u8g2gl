/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/manifest/index.ts
 * Purpose: Public entry point for the element manifest registry — the one
 *          place the CLI learns what an element tag is ([D-17], [D-18]).
 * Description: Re-exports the registry builder and the framework-manifest
 *              parser. Isomorphic: no Node imports.
 *
 * Exports:
 * - buildManifestRegistry, ManifestRegistry, ManifestRegistryInput,
 *   EffectiveManifest, ManifestOrigin (manifest-registry.ts)
 * - parseFrameworkManifests, ManifestText, FRAMEWORK_MANIFEST_PATH (framework-manifests.ts)
 */

export {
  buildManifestRegistry,
  isDrawingElement,
  BINDING_FLAGS,
  OBJECT_ONLY_FLAGS,
  ROOT_CLASS_MANIFEST,
  type ManifestRegistry,
  type ManifestRegistryInput,
  type EffectiveManifest,
  type ManifestOrigin,
} from './manifest-registry.js';
export {
  parseFrameworkManifests,
  FRAMEWORK_MANIFEST_PATH,
  type ManifestText,
} from './framework-manifests.js';
