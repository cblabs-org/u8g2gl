/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/project/project-assets.ts
 * Purpose: Compiles the project's fonts and images for the scene, the
 *          designer's half of what the CLI's `loadProject()` and
 *          `compileProjectAssets()` do together. Compilation is asynchronous
 *          (PNG decoding) and far slower than an edit, so it runs off the edit
 *          loop: the loop uses the last compiled assets, and asks for a new
 *          compile only when the declarations or an asset file changed.
 * Description: The bytes of every `<bdf>`, `<xbm>` and `<convert>` `src` are
 *              read through the `ProjectFileSystem` — an asset outside the
 *              project is refused by its path rule, as the CLI refuses it — and
 *              handed to the CLI's own `compileProjectAssets()`. A compile is
 *              keyed by the declarations it was of and a counter of asset file
 *              changes, so a keystroke in a screen never recompiles anything.
 *
 * Exports:
 * - ProjectAssets:   The latest compiled assets, and when to recompile
 *
 *     - current:         The compiled assets, once any compile finished
 *     - ensure():        Compile if these declarations are not the compiled ones
 *     - assetChanged():  Note that an asset file changed
 */

import { compileProjectAssets } from '@u8g2gl/core/assets/index.js';
import type { ProjectFileSystem } from '@u8g2gl/core/project-fs/project-file-system.js';
import type { Globals } from '@u8g2gl/core/schema/globals.js';
import type { CompiledAssets } from '../pipeline/live-pipeline';

/** The project's compiled fonts and images. */
export class ProjectAssets {
  private readonly fs: ProjectFileSystem;
  private readonly onCompiled: () => void;
  private compiled: CompiledAssets | undefined;
  private compiledKey: string | undefined;
  private compilingKey: string | undefined;
  private assetGeneration = 0;

  /**
   * @param fs         Where asset bytes are read from.
   * @param onCompiled Called after each compile finishes, to schedule a run.
   */
  constructor(fs: ProjectFileSystem, onCompiled: () => void) {
    this.fs = fs;
    this.onCompiled = onCompiled;
  }

  /** The compiled assets, once a compile has finished. */
  get current(): CompiledAssets | undefined {
    return this.compiled;
  }

  /**
   * @brief Starts a compile unless these declarations were compiled, or are compiling.
   *
   * @param globals The parsed globals the run used.
   * @param text    `globals.xml`'s text, the declarations' identity.
   */
  ensure(globals: Globals, text: string): void {
    const key = `${this.assetGeneration}\n${text}`;
    if (key === this.compiledKey || key === this.compilingKey) {
      return;
    }
    this.compilingKey = key;
    void this.compile(globals).then((result) => {
      // A newer request overtook this one: its result is not the current state.
      if (this.compilingKey !== key) return;
      this.compiled = result;
      this.compiledKey = key;
      this.compilingKey = undefined;
      this.onCompiled();
    });
  }

  /** @brief Notes that an asset file changed, so the next `ensure` recompiles. */
  assetChanged(): void {
    this.assetGeneration += 1;
  }

  // compile
  // Reads every declared asset's bytes and compiles them. An asset that cannot
  // be read is left absent, and compileProjectAssets() reports it against its
  // declaration, exactly as the CLI's loader leaves it.
  //   globals — the declarations
  private async compile(globals: Globals): Promise<CompiledAssets> {
    const sources = new Set<string>();
    for (const image of globals.images ?? []) {
      if (image.src !== '') sources.add(image.src);
    }
    for (const font of globals.fonts ?? []) {
      if (font.kind === 'bdf' && font.src !== '') sources.add(font.src);
    }
    const assets = new Map<string, Uint8Array>();
    await Promise.all(
      [...sources].map(async (src) => {
        const read = await this.fs.readBytes(src);
        if (read.ok) assets.set(src, read.bytes);
      }),
    );
    return compileProjectAssets({ globals, assets });
  }
}
