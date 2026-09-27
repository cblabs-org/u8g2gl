/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/catalogue-builder.ts
 * Purpose: Parses authoritative U8G2 C/C++ source code to generate the display
 *          catalogue and page-mode replacement map (§5.2, [D-14]).
 * Description: Reads u8x8_display_info_t structs from u8x8_d_*.c (the ground truth
 *              for display geometry), joins them with setup functions in u8g2_d_setup.c
 *              and constructor classes in U8g2lib.h. Produces deterministic DisplayRecord
 *              entries for full-buffer displays and a page-mode suggestion map.
 *              Accepts U8G2 in either layout — the Arduino library release
 *              (src/clib, src/U8g2lib.h) or the upstream git repository that
 *              extern/u8g2 pins (csrc, cppsrc/U8g2lib.h) — and reads which commit
 *              a tree is, so the catalogue can record its source (Q-11).
 *
 * Exports:
 * - U8g2Layout: Where a U8G2 tree keeps the driver sources and U8g2lib.h
 * - U8g2Source: The U8G2 tag and commit a tree is checked out at
 * - resolveU8g2Layout(u8g2Path): Locate the inputs in either U8G2 layout
 * - readU8g2Source(u8g2Path): Read the tag and commit of a U8G2 git checkout
 * - ParsedDisplayInfo: Raw geometry and offset info parsed from u8x8 struct
 * - ParsedSetupFunction: Setup function metadata from u8g2_d_setup.c
 * - ParsedConstructor: Class metadata from U8g2lib.h
 * - BuildCatalogueResult: Complete output containing catalogue and page-mode map
 * - classifyBus(raw): Helper normalizing raw bus suffix into DisplayBus
 * - parseDisplayInfoStructs(clibDir): Extracts all 206 u8x8_display_info_t structs
 * - parseDriverFunctionMap(clibDir): Maps driver functions to authoritative struct info
 * - parseSetupFunctions(clibDir): Extracts setup function definitions
 * - parseConstructors(u8g2Path): Extracts U8G2 constructor class declarations
 * - buildCatalogue(u8g2Path): End-to-end catalogue and page-mode builder
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { compareCodeUnits } from '../core/order.js';
import type {
  BusFamily,
  DisplayBus,
  DisplayRecord,
  DisplayTiles,
  DisplayXOffset,
} from '../core/schema/display-record.js';

/**
 * Authoritative display geometry and shift offset extracted from a u8x8_display_info_t struct.
 */
export interface ParsedDisplayInfo {
  readonly structName: string;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly defaultXOffset: number;
  readonly flipmodeXOffset: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly sourceFile: string;
}

/**
 * Setup function metadata extracted from u8g2_d_setup.c.
 */
export interface ParsedSetupFunction {
  readonly name: string;
  readonly driver: string;
  readonly bufferMode: 'f' | '1' | '2' | 'other';
}

/**
 * Constructor class metadata extracted from U8g2lib.h.
 */
export interface ParsedConstructor {
  readonly className: string;
  readonly setupFunction: string;
}

/**
 * Complete result of the catalogue building process.
 */
export interface BuildCatalogueResult {
  /** Deterministically sorted full-buffer display records. */
  readonly catalogue: readonly DisplayRecord[];
  /** Map from page-mode constructor name to full-buffer equivalent name. */
  readonly pageModeMap: Record<string, string>;
  /** Total number of u8x8_display_info_t structs discovered. */
  readonly structCount: number;
  /** Total number of unique driver functions resolved. */
  readonly driverCount: number;
  /** Total number of full-buffer constructor records compiled. */
  readonly fullBufferCount: number;
  /** Total number of page-mode constructors mapped. */
  readonly pageModeCount: number;
}

/**
 * Where a U8G2 source tree keeps the two inputs the builder reads.
 */
export interface U8g2Layout {
  /** Directory holding u8x8_d_*.c and u8g2_d_setup.c. */
  readonly clibDir: string;
  /** Path to the C++ U8g2lib.h holding the constructor classes. */
  readonly headerPath: string;
}

/**
 * The U8G2 commit a catalogue is built from (Q-11). Both fields are null when the
 * tree is not the top of a git checkout, because nothing then identifies it.
 */
export interface U8g2Source {
  /** Tag that names HEAD exactly (e.g. "2.36.18"), or null if none does. */
  readonly tag: string | null;
  /** Full 40-character commit hash of HEAD, or null. */
  readonly commit: string | null;
}

/**
 * @brief Locates the driver sources and U8g2lib.h in either U8G2 layout.
 *
 * The Arduino library release (what PlatformIO installs) flattens U8G2 into
 * src/clib and src/U8g2lib.h; the upstream git repository, which extern/u8g2
 * pins, keeps them in csrc and cppsrc. The file contents are the same kind in
 * both, so only the locations differ.
 *
 * @param u8g2Path Root of a U8G2 tree.
 * @return The resolved locations.
 * @throws Error if the path has neither layout. This is a build script's
 *         precondition failure, not a user diagnostic.
 */
export function resolveU8g2Layout(u8g2Path: string): U8g2Layout {
  // --- Step 1: Arduino library release layout ---
  const releaseClib = join(u8g2Path, 'src', 'clib');
  if (existsSync(releaseClib)) {
    return { clibDir: releaseClib, headerPath: join(u8g2Path, 'src', 'U8g2lib.h') };
  }

  // --- Step 2: Upstream git repository layout (extern/u8g2) ---
  const repoClib = join(u8g2Path, 'csrc');
  const repoHeader = join(u8g2Path, 'cppsrc', 'U8g2lib.h');
  if (existsSync(repoClib) && existsSync(repoHeader)) {
    return { clibDir: repoClib, headerPath: repoHeader };
  }

  throw new Error(
    `Not a U8G2 source tree: ${u8g2Path} has neither src/clib (Arduino release) ` +
      'nor csrc and cppsrc/U8g2lib.h (git repository)'
  );
}

/**
 * @brief Runs one git command in a directory and returns its trimmed output.
 *
 * @param cwd  Directory to run git in.
 * @param args git arguments.
 * @return Trimmed stdout, or null if git failed, is missing, or printed nothing.
 */
function runGit(cwd: string, args: readonly string[]): string | null {
  try {
    const out = execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * @brief Reads the tag and commit a U8G2 tree is checked out at (Q-11).
 *
 * @param u8g2Path Root of a U8G2 tree.
 * @return The source record. Both fields are null unless @p u8g2Path is itself
 *         the top of a git checkout; tag is null when no tag names HEAD exactly.
 */
export function readU8g2Source(u8g2Path: string): U8g2Source {
  // --- Step 1: Only the top of a checkout identifies a U8G2 commit ---
  // `git -C` answers for the nearest enclosing repository, so a plain copy of
  // U8G2 inside another project would otherwise report that project's commit —
  // a confident, wrong record, which is worse than none.
  const unknown: U8g2Source = { tag: null, commit: null };
  if (!existsSync(u8g2Path)) {
    return unknown;
  }
  const topLevel = runGit(u8g2Path, ['rev-parse', '--show-toplevel']);
  if (topLevel === null || realpathSync(topLevel) !== realpathSync(u8g2Path)) {
    return unknown;
  }

  // --- Step 2: Read HEAD, and the tag if one names it exactly ---
  const commit = runGit(u8g2Path, ['rev-parse', 'HEAD']);
  const tag = runGit(u8g2Path, ['describe', '--tags', '--exact-match', 'HEAD']);
  return { tag, commit };
}

/**
 * @brief Classifies a raw constructor bus suffix into a normalized DisplayBus object.
 *
 * Maps U8G2 bus strings (e.g. "HW_I2C", "4W_HW_SPI", "8080") to normalized
 * bus families ('i2c', 'spi', 'parallel') and standardized wiring descriptors (§5.2).
 *
 * @param raw Raw bus string extracted from constructor class name.
 * @return Fully populated DisplayBus structure.
 */
export function classifyBus(raw: string): DisplayBus {
  // --- Step 1: Classify normalized bus family ---
  let family: BusFamily;
  if (raw.includes('I2C')) {
    family = 'i2c';
  } else if (raw.includes('SPI')) {
    family = 'spi';
  } else {
    family = 'parallel';
  }

  // --- Step 2: Assign standardized wiring descriptor ---
  let wiring: string;
  switch (raw) {
    case 'HW_I2C':
    case 'HW_SPI':
      wiring = 'hardware';
      break;
    case 'SW_I2C':
    case 'SW_SPI':
      wiring = 'software';
      break;
    case '2ND_HW_I2C':
    case '2ND_HW_SPI':
      wiring = '2nd_hardware';
      break;
    case '4W_HW_SPI':
      wiring = '4w_hardware';
      break;
    case '4W_SW_SPI':
      wiring = '4w_software';
      break;
    case '2ND_4W_HW_SPI':
      wiring = '2nd_4w_hardware';
      break;
    case '3W_HW_SPI':
      wiring = '3w_hardware';
      break;
    case '3W_SW_SPI':
      wiring = '3w_software';
      break;
    case '8080':
      wiring = '8080';
      break;
    case '6800':
      wiring = '6800';
      break;
    default:
      wiring = raw.toLowerCase();
      break;
  }

  return { family, wiring, raw };
}

/**
 * @brief Parses all u8x8_display_info_t structs from u8x8_d_*.c files.
 *
 * Inspects all driver C files in clibDir and regex-extracts the commented
 * field values (e.g. `/* tile_width = *\/ 16`).
 *
 * @param clibDir Path to U8G2's src/clib directory.
 * @return List of all parsed ParsedDisplayInfo structs (206 expected).
 */
export function parseDisplayInfoStructs(clibDir: string): ParsedDisplayInfo[] {
  const structs: ParsedDisplayInfo[] = [];
  const files = readdirSync(clibDir).filter((file) => file.startsWith('u8x8_d_') && file.endsWith('.c'));

  const structRegex = /static\s+const\s+u8x8_display_info_t\s+([a-zA-Z0-9_]+)\s*=\s*\{([^}]+)\};/gs;

  for (const file of files) {
    const fullPath = join(clibDir, file);
    const content = readFileSync(fullPath, 'utf8');

    let match: RegExpExecArray | null;
    while ((match = structRegex.exec(content)) !== null) {
      const structName = match[1];
      const body = match[2];
      if (!structName || !body) {
        continue;
      }

      const twMatch = body.match(/\/\*\s*tile_width\s*=\s*\*\/\s*([0-9]+)/);
      const thMatch = body.match(/\/\*\s*tile_height\s*=\s*\*\/\s*([0-9]+)/);
      const dxMatch = body.match(/\/\*\s*default_x_offset\s*=\s*\*\/\s*([0-9]+)/);
      const fxMatch = body.match(/\/\*\s*flipmode_x_offset\s*=\s*\*\/\s*([0-9]+)/);
      const pwMatch = body.match(/\/\*\s*pixel_width\s*=\s*\*\/\s*([0-9]+)/);
      const phMatch = body.match(/\/\*\s*pixel_height\s*=\s*\*\/\s*([0-9]+)/);

      if (twMatch?.[1] && thMatch?.[1] && dxMatch?.[1] && fxMatch?.[1] && pwMatch?.[1] && phMatch?.[1]) {
        structs.push({
          structName,
          tileWidth: parseInt(twMatch[1], 10),
          tileHeight: parseInt(thMatch[1], 10),
          defaultXOffset: parseInt(dxMatch[1], 10),
          flipmodeXOffset: parseInt(fxMatch[1], 10),
          pixelWidth: parseInt(pwMatch[1], 10),
          pixelHeight: parseInt(phMatch[1], 10),
          sourceFile: file,
        });
      }
    }
  }

  return structs;
}

/**
 * @brief Parses driver functions in u8x8_d_*.c and maps each directly to its authoritative struct info.
 *
 * Driver functions access file-static `u8x8_display_info_t` structs within the same translation
 * unit. Resolves direct memory setup calls and forwarding functions (`return u8x8_d_*(...);`).
 *
 * @param clibDir Path to U8G2's src/clib directory.
 * @return Map of driver function name (e.g. "u8x8_d_ssd1306_128x64_noname") to ParsedDisplayInfo.
 */
export function parseDriverFunctionMap(clibDir: string): Map<string, ParsedDisplayInfo> {
  const driverToStructInfo = new Map<string, ParsedDisplayInfo>();
  const forwarding = new Map<string, string>();
  const files = readdirSync(clibDir).filter((file) => file.startsWith('u8x8_d_') && file.endsWith('.c'));

  const fnHeaderRegex = /uint8_t\s+(?:U8X8_NOINLINE\s+)?(u8x8_d_[a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{/g;
  const structRegex = /static\s+const\s+u8x8_display_info_t\s+([a-zA-Z0-9_]+)\s*=\s*\{([^}]+)\};/gs;

  for (const file of files) {
    const fullPath = join(clibDir, file);
    const content = readFileSync(fullPath, 'utf8');

    // Parse file-scoped structs
    const fileStructs = new Map<string, ParsedDisplayInfo>();
    let sm: RegExpExecArray | null;
    while ((sm = structRegex.exec(content)) !== null) {
      const name = sm[1];
      const body = sm[2];
      if (!name || !body) {
        continue;
      }

      const twMatch = body.match(/\/\*\s*tile_width\s*=\s*\*\/\s*([0-9]+)/);
      const thMatch = body.match(/\/\*\s*tile_height\s*=\s*\*\/\s*([0-9]+)/);
      const dxMatch = body.match(/\/\*\s*default_x_offset\s*=\s*\*\/\s*([0-9]+)/);
      const fxMatch = body.match(/\/\*\s*flipmode_x_offset\s*=\s*\*\/\s*([0-9]+)/);
      const pwMatch = body.match(/\/\*\s*pixel_width\s*=\s*\*\/\s*([0-9]+)/);
      const phMatch = body.match(/\/\*\s*pixel_height\s*=\s*\*\/\s*([0-9]+)/);

      if (twMatch?.[1] && thMatch?.[1] && dxMatch?.[1] && fxMatch?.[1] && pwMatch?.[1] && phMatch?.[1]) {
        fileStructs.set(name, {
          structName: name,
          tileWidth: parseInt(twMatch[1], 10),
          tileHeight: parseInt(thMatch[1], 10),
          defaultXOffset: parseInt(dxMatch[1], 10),
          flipmodeXOffset: parseInt(fxMatch[1], 10),
          pixelWidth: parseInt(pwMatch[1], 10),
          pixelHeight: parseInt(phMatch[1], 10),
          sourceFile: file,
        });
      }
    }

    // Parse functions in this file
    let fnMatch: RegExpExecArray | null;
    while ((fnMatch = fnHeaderRegex.exec(content)) !== null) {
      const fnName = fnMatch[1];
      if (!fnName) {
        continue;
      }

      const startIndex = fnMatch.index + fnMatch[0].length - 1;
      let depth = 0;
      let endIndex = startIndex;
      for (let i = startIndex; i < content.length; i++) {
        if (content[i] === '{') {
          depth++;
        } else if (content[i] === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i;
            break;
          }
        }
      }

      const fnBody = content.substring(startIndex, endIndex + 1);
      const refMatch = fnBody.match(/&([a-zA-Z0-9_]+display_info)/);
      if (refMatch?.[1] && fileStructs.has(refMatch[1])) {
        const info = fileStructs.get(refMatch[1]);
        if (info) {
          driverToStructInfo.set(fnName, info);
        }
      } else {
        const fwdMatch = fnBody.match(/return\s+(u8x8_d_[a-zA-Z0-9_]+)\s*\(/);
        if (fwdMatch?.[1]) {
          forwarding.set(fnName, fwdMatch[1]);
        }
      }
    }
  }

  // Resolve forwarding functions
  for (const [fn, target] of forwarding) {
    const resolvedStruct = driverToStructInfo.get(target);
    if (resolvedStruct) {
      driverToStructInfo.set(fn, resolvedStruct);
    }
  }

  return driverToStructInfo;
}

/**
 * @brief Parses setup functions from u8g2_d_setup.c.
 *
 * Extracts setup function name, invoked driver function symbol, and buffer mode
 * ('f' for full buffer, '1' or '2' for page mode).
 *
 * @param clibDir Path to U8G2's src/clib directory.
 * @return Map of setup function name to ParsedSetupFunction.
 */
export function parseSetupFunctions(clibDir: string): Map<string, ParsedSetupFunction> {
  const setupMap = new Map<string, ParsedSetupFunction>();
  const content = readFileSync(join(clibDir, 'u8g2_d_setup.c'), 'utf8');

  const setupRegex = /void\s+(u8g2_Setup_([a-zA-Z0-9_]+))\s*\([^)]*\)\s*\{([^}]+)\}/g;

  let match: RegExpExecArray | null;
  while ((match = setupRegex.exec(content)) !== null) {
    const fullName = match[1];
    const body = match[3];
    if (!fullName || !body) {
      continue;
    }

    const dispMatch = body.match(/u8g2_SetupDisplay\s*\(\s*u8g2\s*,\s*([a-zA-Z0-9_]+)/);
    const driver = dispMatch?.[1] ?? '';

    let bufferMode: 'f' | '1' | '2' | 'other' = 'other';
    if (fullName.endsWith('_f')) {
      bufferMode = 'f';
    } else if (fullName.endsWith('_1')) {
      bufferMode = '1';
    } else if (fullName.endsWith('_2')) {
      bufferMode = '2';
    }

    setupMap.set(fullName, {
      name: fullName,
      driver,
      bufferMode,
    });
  }

  return setupMap;
}

/**
 * @brief Parses C++ constructor classes from U8g2lib.h.
 *
 * Extracts class name and the setup function invoked in the constructor initializer.
 *
 * @param u8g2Path Root path to the U8G2 library, in either layout.
 * @return Array of ParsedConstructor objects.
 */
export function parseConstructors(u8g2Path: string): ParsedConstructor[] {
  const { headerPath } = resolveU8g2Layout(u8g2Path);
  const content = readFileSync(headerPath, 'utf8');

  const classRegex = /class\s+(U8G2_[a-zA-Z0-9_]+)\s*:\s*public\s+U8G2\s*\{[^}]*?(u8g2_Setup_[a-zA-Z0-9_]+)\s*\(&u8g2/gs;

  const constructors: ParsedConstructor[] = [];
  let match: RegExpExecArray | null;
  while ((match = classRegex.exec(content)) !== null) {
    const className = match[1];
    const setupFunction = match[2];
    if (className && setupFunction) {
      constructors.push({ className, setupFunction });
    }
  }

  return constructors;
}

/**
 * @brief Parses class name into controller, variant tokens, and raw bus suffix.
 *
 * Handles standard names: `U8G2_<CONTROLLER>_<VARIANT...>_F_<BUS>`
 * as well as legacy bus-less parallel constructors: `U8G2_<CONTROLLER>_<VARIANT...>_F`.
 *
 * @param className Full constructor class name.
 * @return Token breakdown for controller, variant, and bus.
 */
function parseClassNameTokens(className: string): {
  readonly controller: string;
  readonly variant: readonly string[];
  readonly rawBus: string;
} {
  // Check for standard _F_ separator
  if (className.includes('_F_')) {
    const parts = className.split('_F_');
    const prefix = parts[0] ?? '';
    const rawBus = parts[1] ?? 'PARALLEL';

    // Remove leading U8G2_
    const withoutPrefix = prefix.startsWith('U8G2_') ? prefix.slice(5) : prefix;
    const tokens = withoutPrefix.split('_');
    const controller = tokens[0] ?? '';
    const variant = tokens.slice(1);

    return { controller, variant, rawBus };
  }

  // Handle bus-less constructors ending with _F (e.g. U8G2_KS0108_128X64_F)
  const withoutF = className.endsWith('_F') ? className.slice(0, -2) : className;
  const withoutPrefix = withoutF.startsWith('U8G2_') ? withoutF.slice(5) : withoutF;
  const tokens = withoutPrefix.split('_');
  const controller = tokens[0] ?? '';
  const variant = tokens.slice(1);

  return { controller, variant, rawBus: 'PARALLEL' };
}

/**
 * @brief End-to-end catalogue builder function.
 *
 * Parses U8G2 C/C++ source trees, matches constructors with authoritative
 * display_info structs, calculates RAM budgets, and builds the full-buffer
 * catalogue along with the page-mode replacement map.
 *
 * @param u8g2Path Root path to the U8G2 library, in either layout.
 * @return BuildCatalogueResult containing sorted catalogue and page-mode map.
 */
export function buildCatalogue(u8g2Path: string): BuildCatalogueResult {
  const { clibDir } = resolveU8g2Layout(u8g2Path);

  // --- Step 1: Parse authoritative display_info structs ---
  const allStructs = parseDisplayInfoStructs(clibDir);

  // --- Step 2: Parse driver functions and resolve struct links ---
  const driverToStructInfo = parseDriverFunctionMap(clibDir);

  // --- Step 3: Parse setup functions from u8g2_d_setup.c ---
  const setupMap = parseSetupFunctions(clibDir);

  // --- Step 4: Parse constructors from U8g2lib.h ---
  const constructors = parseConstructors(u8g2Path);

  // --- Step 5: Join, filter, and construct DisplayRecord entries ---
  const fullBufferClasses = new Set<string>();
  const pageModeConstructors: ParsedConstructor[] = [];
  const records: DisplayRecord[] = [];

  for (const ctor of constructors) {
    const setupInfo = setupMap.get(ctor.setupFunction);
    if (!setupInfo) {
      continue;
    }

    if (setupInfo.bufferMode === 'f') {
      fullBufferClasses.add(ctor.className);

      const info = driverToStructInfo.get(setupInfo.driver);
      if (!info) {
        continue;
      }

      const { controller, variant, rawBus } = parseClassNameTokens(ctor.className);
      const bus = classifyBus(rawBus);

      const tiles: DisplayTiles = {
        width: info.tileWidth,
        height: info.tileHeight,
      };

      const xOffset: DisplayXOffset = {
        default: info.defaultXOffset,
        flipmode: info.flipmodeXOffset,
      };

      const framebufferBytes = info.tileWidth * info.tileHeight * 8;

      records.push({
        setup: ctor.className,
        controller,
        variant,
        width: info.pixelWidth,
        height: info.pixelHeight,
        tiles,
        framebufferBytes,
        bus,
        xOffset,
        driver: setupInfo.driver,
      });
    } else if (setupInfo.bufferMode === '1' || setupInfo.bufferMode === '2') {
      pageModeConstructors.push(ctor);
    }
  }

  // --- Step 6: Deterministically sort catalogue records by setup name ---
  // By code unit, never by locale (§13.9, PR-04 WO12 follow-up). These records
  // are written into `src/data/catalogue.json`, which is **committed**, so a
  // host-dependent order would make the same U8G2 submodule produce a different
  // committed file on a different machine — §13.9's hazard applied to an artefact
  // the tool ships.
  records.sort((a, b) => compareCodeUnits(a.setup, b.setup));

  // --- Step 7: Build deterministic page-mode replacement map ---
  const pageModeMap: Record<string, string> = {};

  // Sort page-mode constructors by class name for determinism
  pageModeConstructors.sort((a, b) => compareCodeUnits(a.className, b.className));

  for (const ctor of pageModeConstructors) {
    let fullCandidate = ctor.className.replace(/_1_([a-zA-Z0-9_]+)$/, '_F_$1');
    if (fullCandidate === ctor.className) {
      fullCandidate = ctor.className.replace(/_2_([a-zA-Z0-9_]+)$/, '_F_$1');
    }
    if (fullCandidate === ctor.className) {
      fullCandidate = ctor.className.replace(/_1$/, '_F');
    }
    if (fullCandidate === ctor.className) {
      fullCandidate = ctor.className.replace(/_2$/, '_F');
    }

    if (fullBufferClasses.has(fullCandidate)) {
      pageModeMap[ctor.className] = fullCandidate;
    }
  }

  return {
    catalogue: records,
    pageModeMap,
    structCount: allStructs.length,
    driverCount: driverToStructInfo.size,
    fullBufferCount: records.length,
    pageModeCount: Object.keys(pageModeMap).length,
  };
}
