/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/index.ts
 * Purpose: Isomorphic entry point for U8G2GL core — schema definitions,
 *          XML parser, validator, and display catalogue queries.
 * Description: Re-exports all core public APIs. This module is strictly
 *              isomorphic and runs in both Node.js and browser environments.
 *
 * Exports:
 * - Schema types and diagnostic codes from ./schema/index.js
 * - XML parser APIs and models from ./parser/index.js
 * - Display catalogue query APIs from ./catalogue/index.js
 * - Element manifest registry from ./manifest/index.js
 * - Validator APIs from ./validator/index.js
 * - Resolver — coordinate arithmetic, anchors, resolved model — from ./resolver/index.js
 * - Generator — checkProject, header stamp, generate() — from ./generator/index.js
 * - Fonts — compileBdf(), the <bdf range> grammar — from ./fonts/index.js
 * - Assets — compileProjectAssets(), the async step before generate() — from ./assets/index.js
 */

export * from './schema/index.js';
export * from './parser/index.js';
export * from './catalogue/index.js';
export * from './manifest/index.js';
export * from './validator/index.js';
export * from './resolver/index.js';
export * from './generator/index.js';
export * from './fonts/index.js';
export * from './assets/index.js';
