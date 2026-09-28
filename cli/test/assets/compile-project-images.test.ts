/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/assets/compile-project-images.test.ts
 * Purpose: Coverage of the image half of compileProjectAssets() (PR-04b WO4
 *          item 3, 5): `<xbm>` and `<convert>` both arriving as one image map,
 *          the `<xbm>` diagnostics keeping the code, text and location they had
 *          when images.ts raised them, the `<convert>` size-mismatch message,
 *          and `failedImages` naming every declaration that produced nothing.
 */

import { describe, expect, it } from 'vitest';
import { compileProjectAssets } from '../../src/core/assets/compile-project-assets.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { Globals, ImageDecl } from '../../src/core/schema/globals.js';
import { buildPng } from '../helpers/png-builder.js';

const XBM_TEXT = ['#define t_width 8', '#define t_height 2', 'static unsigned char t_bits[] = {', '  0x81, 0x18 };', ''].join('\n');

function globalsWith(images: readonly ImageDecl[]): Globals {
  return { consts: [], subjects: [], styles: [], fonts: [], images };
}

const at = (line: number) => ({ file: 'globals.xml', line, column: 9 });

/** A 2x2 opaque PNG: black, white / white, black. */
function checker(): Uint8Array {
  return new Uint8Array(
    buildPng({ width: 2, height: 2, colourType: 0, depth: 8, samples: [0, 255, 255, 0] }),
  );
}

describe('compileProjectAssets() — images', () => {
  it('produces an <xbm> and a <convert> as the one image model, in declaration order', async () => {
    const globals = globalsWith([
      { kind: 'convert', name: 'logo', src: 'a/logo.png', width: 2, height: 2, loc: at(2) },
      { kind: 'xbm', name: 'icon', src: 'a/icon.xbm', loc: at(3) },
    ]);
    const assets = new Map([
      ['a/logo.png', checker()],
      ['a/icon.xbm', new TextEncoder().encode(XBM_TEXT)],
    ]);
    const result = await compileProjectAssets({ globals, assets });

    expect(result.diagnostics).toEqual([]);
    expect(result.failedImages).toEqual(new Set());
    expect([...result.images.keys()]).toEqual(['logo', 'icon']);
    // Black sets its bit: row 0 = x0 set; row 1 = x1 set.
    expect(result.images.get('logo')).toEqual({ width: 2, height: 2, bytes: [0b01, 0b10] });
    expect(result.images.get('icon')).toEqual({ width: 8, height: 2, bytes: [0x81, 0x18] });
  });

  it('a missing <xbm>: MISSING_FILE with the text images.ts used to give, at the declaration', async () => {
    const globals = globalsWith([{ kind: 'xbm', name: 'icon', src: 'a/gone.xbm', loc: at(7) }]);
    const result = await compileProjectAssets({ globals, assets: new Map() });

    expect(result.images.size).toBe(0);
    expect(result.failedImages).toEqual(new Set(['icon']));
    expect(result.diagnostics).toEqual([
      {
        code: DIAGNOSTIC_CODES.MISSING_FILE,
        severity: 'error',
        file: 'globals.xml',
        line: 7,
        column: 9,
        message:
          "Image 'icon' names 'a/gone.xbm', which could not be read relative to the project directory. " +
          'An <xbm> asset is compiled into the generated code (§14.2), so the build cannot proceed without it.',
        offendingText: 'a/gone.xbm',
      },
    ]);
  });

  it('a malformed <xbm>: TYPE_MISMATCH with the text images.ts used to give', async () => {
    const globals = globalsWith([{ kind: 'xbm', name: 'icon', src: 'a/bad.xbm', loc: at(4) }]);
    const assets = new Map([['a/bad.xbm', new TextEncoder().encode('not xbm at all')]]);
    const result = await compileProjectAssets({ globals, assets });

    expect(result.failedImages).toEqual(new Set(['icon']));
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: DIAGNOSTIC_CODES.TYPE_MISMATCH,
      line: 4,
      offendingText: 'a/bad.xbm',
    });
    expect(result.diagnostics[0]?.message).toBe(
      "Image 'icon' names 'a/bad.xbm', which is not a usable XBM file: it declares no '#define ..._width' " +
        "and '#define ..._height' pair, which every XBM file has. Export it as XBM (§14.2).",
    );
  });

  it('a missing <convert> source: MISSING_FILE naming the conversion', async () => {
    const globals = globalsWith([{ kind: 'convert', name: 'logo', src: 'a/none.png', width: 2, height: 2, loc: at(5) }]);
    const result = await compileProjectAssets({ globals, assets: new Map() });

    expect(result.failedImages).toEqual(new Set(['logo']));
    expect(result.diagnostics[0]).toMatchObject({ code: DIAGNOSTIC_CODES.MISSING_FILE, line: 5, offendingText: 'a/none.png' });
    expect(result.diagnostics[0]?.message).toContain('A <convert> source is converted into the generated code');
  });

  it('a size mismatch names the declaration, both sizes and the fix', async () => {
    const globals = globalsWith([
      { kind: 'convert', name: 'logo', src: 'assets/logo.png', width: 32, height: 32, loc: at(9) },
    ]);
    const png = new Uint8Array(
      buildPng({ width: 3, height: 2, colourType: 0, depth: 8, samples: [0, 0, 0, 0, 0, 0] }),
    );
    const result = await compileProjectAssets({ globals, assets: new Map([['assets/logo.png', png]]) });

    expect(result.images.size).toBe(0);
    expect(result.failedImages).toEqual(new Set(['logo']));
    expect(result.diagnostics).toEqual([
      {
        code: DIAGNOSTIC_CODES.IMAGE_CONVERT_FAILED,
        severity: 'error',
        file: 'globals.xml',
        line: 9,
        column: 9,
        message: "Image 'logo' declares 32x32 but 'assets/logo.png' is 3x2; resize the PNG.",
        offendingText: 'assets/logo.png',
      },
    ]);
  });

  it('a refused PNG carries the decoder\'s reason', async () => {
    const globals = globalsWith([{ kind: 'convert', name: 'logo', src: 'a/x.png', width: 2, height: 2, loc: at(1) }]);
    const interlaced = new Uint8Array(
      buildPng({ width: 2, height: 2, colourType: 0, depth: 8, samples: [0, 0, 0, 0], interlace: 1 }),
    );
    const result = await compileProjectAssets({ globals, assets: new Map([['a/x.png', interlaced]]) });

    expect(result.diagnostics[0]?.code).toBe(DIAGNOSTIC_CODES.IMAGE_CONVERT_FAILED);
    expect(result.diagnostics[0]?.message).toBe(
      "Image 'logo' (a/x.png) could not be converted: it is Adam7 interlaced, which is not supported; save it non-interlaced.",
    );
  });

  it('mode and threshold reach the conversion', async () => {
    // Grey 100 and 200 on a 2x1: threshold 50 clears both; threshold 150 sets the dark one.
    const png = new Uint8Array(buildPng({ width: 2, height: 1, colourType: 0, depth: 8, samples: [100, 200] }));
    const assets = new Map([['p.png', png]]);
    const make = (threshold: number) =>
      compileProjectAssets({
        globals: globalsWith([{ kind: 'convert', name: 'g', src: 'p.png', width: 2, height: 1, mode: 'threshold', threshold }]),
        assets,
      });
    expect((await make(50)).images.get('g')?.bytes).toEqual([0]);
    expect((await make(150)).images.get('g')?.bytes).toEqual([0b01]);
  });

  it('a <convert> the validator rejects is neither converted nor diagnosed here, but is failed', async () => {
    // validate() reports these once, from convertDeclProblems(); a second copy from
    // the asset step would double every message. The name still lands in failedImages
    // so generate()'s guard does not add an internal-error diagnostic on top.
    const png = new Uint8Array(buildPng({ width: 2, height: 1, colourType: 0, depth: 8, samples: [1, 2] }));
    const globals = globalsWith([
      { kind: 'convert', name: 'bad_mode', src: 'p.png', width: 2, height: 1, mode: 'sharpen', loc: at(1) },
      { kind: 'convert', name: 'bad_threshold', src: 'p.png', width: 2, height: 1, threshold: 300, loc: at(2) },
      { kind: 'convert', name: 'bad_size', src: 'p.png', width: 0, height: 1, loc: at(3) },
    ]);
    const result = await compileProjectAssets({ globals, assets: new Map([['p.png', png]]) });

    expect(result.diagnostics).toEqual([]);
    expect(result.images.size).toBe(0);
    expect(result.failedImages).toEqual(new Set(['bad_mode', 'bad_threshold', 'bad_size']));
  });
});
