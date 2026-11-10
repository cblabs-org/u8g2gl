/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: scripts/update-icons.mjs
 * Purpose: The one way the vendored Lucide icon set changes. U8G2GL carries
 *          the whole set as two generated files — the name list the CLI
 *          validates against (`cli/src/data/icons.json`) and the sprite the
 *          designer draws from (`designer/src/icons/lucide-sprite.svg`) — so
 *          the CLI never carries SVG and nothing fetches icons at run time.
 *          Lucide renames icons from time to time and keeps the old name as an
 *          alias; once authors write `icon=` values, a name that disappears
 *          breaks their projects. So the alias table is kept, and an update
 *          that would drop any name the current list has fails instead.
 * Description: Given a `lucide-static` tarball (`npm pack` output), extracts it
 *              under `tmp/` — never into the source tree — and reads it as
 *              data, running none of its code:
 *              - `icon-nodes.json`: each canonical icon's elements, in order;
 *              - `icons/*.svg`: every name, canonical and alias;
 *              - `dist/esm/lucide-static.mjs`: its export lines, which bind
 *                each alias's PascalCase name to its canonical icon's file.
 *              Writes both files deterministically: names sorted by code unit,
 *              elements and attributes in Lucide's order, one icon per line.
 *              Updating Lucide is a deliberate pull request of its own.
 *              Usage: node scripts/update-icons.mjs <lucide-static-X.Y.Z.tgz>
 *
 * Exports:
 * - ICONS_JSON:         The name list's path, for the validator
 * - SPRITE:             The sprite's path, for the designer
 * - pascalCase():       Lucide's export name for a kebab-case icon name
 * - readLucide():       The icon set from an extracted package directory
 * - droppedNames():     Names in the current list the new set lacks
 * - renderIconsJson():  The name list's text
 * - renderSprite():     The sprite's text
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The name list, for the validator. */
export const ICONS_JSON = join(REPO_ROOT, 'cli', 'src', 'data', 'icons.json');
/** The sprite, for the designer. */
export const SPRITE = join(REPO_ROOT, 'designer', 'src', 'icons', 'lucide-sprite.svg');

/** The SVG elements Lucide draws with; anything else means the format changed. */
const ELEMENTS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);

// compareCodeUnits
// Code-unit order, as the CLI sorts (locale-independent, §13.9).
function compareCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// escapeAttribute
// An attribute value safe inside double quotes.
function escapeAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * @brief Lucide's export name for an icon name: `link-2` → `Link2`.
 *
 * @param name A kebab-case icon name.
 */
export function pascalCase(name) {
  return name
    .split('-')
    .map((part) => (part === '' ? '' : part[0].toUpperCase() + part.slice(1)))
    .join('');
}

/**
 * @brief Reads the icon set from an extracted `lucide-static` package.
 *
 * @param packageDir The package's root (the tarball's `package/`).
 * @return `{ version, icons, aliases }`: the package version; each canonical
 *         name's elements as `[tag, attributes]` pairs; and alias → canonical.
 * @throws Error if the package's shape is not the one this script reads: an
 *         unknown element, or an alias whose canonical icon cannot be found.
 */
export function readLucide(packageDir) {
  // --- Step 1: The version and the canonical icons ---
  const { version, name } = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  if (name !== 'lucide-static') throw new Error(`expected the lucide-static package, found '${name}'`);
  const nodes = JSON.parse(readFileSync(join(packageDir, 'icon-nodes.json'), 'utf8'));
  const icons = new Map();
  for (const iconName of Object.keys(nodes).sort(compareCodeUnits)) {
    for (const [tag] of nodes[iconName]) {
      if (!ELEMENTS.has(tag)) throw new Error(`icon '${iconName}' uses <${tag}>, which this script does not know`);
    }
    icons.set(iconName, nodes[iconName]);
  }

  // --- Step 2: Every exported name, bound to the file it comes from ---
  // `export { default as ActivitySquare, default as SquareActivity } from './icons/square-activity.mjs';`
  const esm = readFileSync(join(packageDir, 'dist', 'esm', 'lucide-static.mjs'), 'utf8');
  const fileOf = new Map();
  for (const match of esm.matchAll(/export\s*\{([^}]*)\}\s*from\s*'\.\/icons\/([a-z0-9-]+)\.mjs'/g)) {
    for (const binding of match[1].matchAll(/default as (\w+)/g)) fileOf.set(binding[1], match[2]);
  }

  // --- Step 3: The aliases — every SVG name that is not a canonical icon ---
  const aliases = new Map();
  const svgNames = readdirSync(join(packageDir, 'icons'))
    .filter((file) => file.endsWith('.svg'))
    .map((file) => file.slice(0, -'.svg'.length))
    .sort(compareCodeUnits);
  for (const svgName of svgNames) {
    if (icons.has(svgName)) continue;
    const canonical = fileOf.get(pascalCase(svgName));
    if (canonical === undefined || !icons.has(canonical)) {
      throw new Error(`the alias '${svgName}' names no canonical icon`);
    }
    aliases.set(svgName, canonical);
  }
  return { version, icons, aliases };
}

/**
 * @brief The names an update would drop: in the current list, but neither an
 *        icon nor an alias of the new set.
 *
 * @param current The current `icons.json`, parsed, or undefined for none.
 * @param next    `readLucide()`'s result.
 * @return The dropped names, sorted; empty when nothing is dropped.
 */
export function droppedNames(current, next) {
  if (current === undefined) return [];
  const known = (name) => next.icons.has(name) || next.aliases.has(name);
  return [...current.names, ...Object.keys(current.aliases)].filter((name) => !known(name)).sort(compareCodeUnits);
}

/**
 * @brief The text of `cli/src/data/icons.json`: names and aliases, sorted.
 *
 * @param set `readLucide()`'s result.
 */
export function renderIconsJson(set) {
  const aliases = Object.fromEntries([...set.aliases].sort(([a], [b]) => compareCodeUnits(a, b)));
  return `${JSON.stringify({ source: 'lucide-static', version: set.version, names: [...set.icons.keys()], aliases }, null, 2)}\n`;
}

/**
 * @brief The text of the designer's sprite: one `<symbol>` per canonical icon,
 *        one per line, with no presentation attributes — the designer's
 *        `<Icon>` sets stroke and fill on the `<svg>` that uses it.
 *
 * @param set `readLucide()`'s result.
 */
export function renderSprite(set) {
  const lines = [
    `<!-- Lucide ${set.version} (lucide-static), ISC licence: see THIRD-PARTY-NOTICES.md. Generated by scripts/update-icons.mjs; do not edit. -->`,
    '<svg xmlns="http://www.w3.org/2000/svg">',
  ];
  for (const [name, elements] of set.icons) {
    const body = elements
      .map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).map(([key, value]) => `${key}="${escapeAttribute(value)}"`).join(' ')}/>`)
      .join('');
    lines.push(`<symbol id="${name}" viewBox="0 0 24 24">${body}</symbol>`);
  }
  lines.push('</svg>', '');
  return lines.join('\n');
}

// main
// Extract, read, refuse a drop, write.
function main() {
  // --- Step 1: The tarball, extracted under tmp/ ---
  const tarball = process.argv[2];
  if (tarball === undefined || !existsSync(tarball)) {
    console.error('usage: node scripts/update-icons.mjs <lucide-static-X.Y.Z.tgz>');
    process.exit(2);
  }
  const work = join(REPO_ROOT, 'tmp', 'update-icons', basename(tarball, '.tgz'));
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const untar = spawnSync('tar', ['-xzf', resolve(tarball), '-C', work], { stdio: 'inherit' });
  if (untar.status !== 0) process.exit(1);

  // --- Step 2: Read it, and refuse to drop a name ---
  const next = readLucide(join(work, 'package'));
  const current = existsSync(ICONS_JSON) ? JSON.parse(readFileSync(ICONS_JSON, 'utf8')) : undefined;
  const dropped = droppedNames(current, next);
  if (dropped.length > 0) {
    console.error(`update-icons: Lucide ${next.version} drops ${dropped.length} name(s) authors may use: ${dropped.join(', ')}`);
    console.error('update-icons: nothing was written. Add the missing names as aliases, or decide the break deliberately.');
    process.exit(1);
  }

  // --- Step 3: Write both files ---
  writeFileSync(ICONS_JSON, renderIconsJson(next));
  mkdirSync(dirname(SPRITE), { recursive: true });
  writeFileSync(SPRITE, renderSprite(next));
  console.log(`update-icons: Lucide ${next.version}: ${next.icons.size} icons, ${next.aliases.size} aliases.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
