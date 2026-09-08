/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: eslint.config.js
 * Purpose: ESLint configuration enforcing code quality and isomorphic boundaries.
 * Description: Uses flat config with typescript-eslint recommended rules.
 *              Enforces that src/core/ must never import node:* or Node builtin
 *              modules, preserving browser compatibility.
 */

import { builtinModules } from 'node:module';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['**/*.ts', '**/*.js'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // Enforce isomorphic boundary on core modules
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', ...builtinModules],
              message: 'Importing Node.js modules in src/core/ is forbidden to maintain the isomorphic boundary.',
            },
          ],
        },
      ],
    },
  },
];
