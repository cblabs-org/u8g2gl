/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/wasm/asset-injector.ts
 * Purpose: Hands the editor Wasm every font and image the project declares.
 *          The editor Wasm compiles in no project font or image (design_spec
 *          §9): before a scene is applied, its bytes are injected by name, so
 *          a font or image edit reaches the canvas in the next frame and never
 *          waits for a rebuild, and a project with no widgets draws any font
 *          on the framework Wasm, with no toolchain at all.
 * Description: The bytes are exactly the firmware's. A `<bdf>` and every image
 *              are what `compileProjectAssets()` produced in the page (the
 *              edit loop's `ProjectAssets`); a `<builtin>` is fetched once per
 *              session from the design server's `/api/font/builtin`, which
 *              reads the packaged `u8g2_fonts.c`, and kept by name. A fetch
 *              that fails is remembered too, so a name U8G2 lacks is asked for
 *              once: the bridge then draws it in its fallback and says so.
 *
 *              Injection lasts until it is cleared, never undone by
 *              `applyScene`, so `prepare()` re-injects only when what the
 *              module holds differs from what the project declares: a
 *              keystroke in a screen compares a key and injects nothing. The
 *              key is per module, since the canvas's module, the impact
 *              preview's spare and a newly built project module each hold
 *              their own table.
 *
 *              A module without the injection exports (a project editor Wasm
 *              built by an older CLI) is left to its own compiled table, as an
 *              older module without hiding is left to draw everything.
 *
 * Exports:
 * - InjectionState:   What `prepare()` found
 * - AssetInjector:    The injector
 *
 *     - prepare():    Inject what the module lacks, now; or say it must wait
 *     - ready():      The same, once every built-in the project names has arrived
 *     - fontBytes():  One font's bytes, as it would be injected
 */

import type { Globals } from '@u8g2gl/core/schema/globals.js';
import type { CompiledAssets } from '../pipeline/live-pipeline';
import type { DesignSession } from '../session';
import type { EditorModule } from './editor-module';

/**
 * What `prepare()` found:
 * - `ready`      the module holds every declared font and image there is;
 * - `waiting`    a built-in font is still being fetched, so drawing now would
 *                show the fallback for a frame; a run is booked when it lands;
 * - `own-table`  the module takes no injection, and draws what it was built with.
 */
export type InjectionState = 'ready' | 'waiting' | 'own-table';

/** The built-in font route (`cli/src/node/design/design-server.ts`). */
const BUILTIN_FONT_ROUTE = '/api/font/builtin';

/** Injects the project's fonts and images into editor modules. */
export class AssetInjector {
  private readonly session: DesignSession;
  private readonly onArrived: () => void;
  private readonly log: (line: string) => void;
  /** Built-in fonts by name: bytes, `null` for one the server refused, or the fetch in flight. */
  private readonly builtins = new Map<string, Uint8Array | null | Promise<void>>();
  /**
   * What each module was last given: the declarations and compile it was
   * prepared from, and a key over names and byte identities. The same
   * declarations and compile (the parse cache keeps an unchanged globals.xml's
   * model) are answered without building the key at all.
   */
  private readonly injected = new WeakMap<EditorModule, { readonly globals: Globals; readonly compiled: CompiledAssets | undefined; readonly key: string }>();
  /** A number per distinct byte array, for the key. */
  private readonly identities = new WeakMap<object, number>();
  /** Each produced image's bytes as the bridge takes them, converted once. */
  private readonly imageBytes = new WeakMap<object, Uint8Array>();
  private nextIdentity = 1;

  /**
   * @param session   The design server and its token, for the built-in route.
   * @param onArrived Called when a built-in font's fetch finishes, to book a run.
   * @param log       Where a refused font is reported (the Output panel).
   */
  constructor(session: DesignSession, onArrived: () => void, log: (line: string) => void) {
    this.session = session;
    this.onArrived = onArrived;
    this.log = log;
  }

  /**
   * @brief Makes `module` hold exactly the declared fonts and images, unless a
   *        built-in is still on its way.
   *
   * Cheap when nothing changed: a key comparison. When something did, the
   * module's table is cleared and every asset injected again.
   *
   * @param module   The module a scene is about to be applied to.
   * @param globals  The project's declarations.
   * @param compiled What `compileProjectAssets()` produced; undefined before the first compile.
   * @return Whether the module is ready to draw the project's assets.
   */
  prepare(module: EditorModule, globals: Globals, compiled: CompiledAssets | undefined): InjectionState {
    if (!module.assetInjection) return 'own-table';
    const last = this.injected.get(module);
    if (last !== undefined && last.globals === globals && last.compiled === compiled) return 'ready';

    // --- Step 1: Every declared font's bytes, fetching a built-in not yet asked for ---
    let waiting = false;
    const fonts: Array<readonly [string, Uint8Array]> = [];
    for (const font of globals.fonts ?? []) {
      if (font.kind === 'builtin') {
        const held = this.builtin(font.name);
        if (held instanceof Promise) waiting = true;
        else if (held !== null) fonts.push([font.name, held]);
      } else {
        const bytes = compiled?.fonts.get(font.name)?.bytes;
        if (bytes !== undefined) fonts.push([font.name, bytes]);
      }
    }
    if (waiting) return 'waiting';
    const images = [...(compiled?.images ?? new Map<string, never>())].map(
      ([name, image]) => [name, image.width, image.height, this.bytesOf(image)] as const,
    );

    // --- Step 2: Inject only when the module holds something else ---
    const key = [
      ...fonts.map(([name, bytes]) => `f:${name}:${this.identity(bytes)}`),
      ...images.map(([name, width, height, bytes]) => `i:${name}:${width}x${height}:${this.identity(bytes)}`),
    ].join('\n');
    if (last?.key === key) {
      this.injected.set(module, { globals, compiled, key });
      return 'ready';
    }
    module.clearInjected();
    for (const [name, bytes] of fonts) {
      if (!module.injectFont(name, bytes)) this.log(`fonts: the editor Wasm refused '${name}': ${module.lastError()}`);
    }
    for (const [name, width, height, bytes] of images) {
      if (!module.injectImage(name, width, height, bytes)) this.log(`images: the editor Wasm refused '${name}': ${module.lastError()}`);
    }
    this.injected.set(module, { globals, compiled, key });
    return 'ready';
  }

  /**
   * @brief `prepare()`, once every built-in font the project names has been fetched.
   *
   * For a module that draws outside the edit loop (the impact preview's), which
   * can wait rather than draw a fallback.
   */
  async ready(module: EditorModule, globals: Globals, compiled: CompiledAssets | undefined): Promise<InjectionState> {
    for (;;) {
      const state = this.prepare(module, globals, compiled);
      if (state !== 'waiting') return state;
      await Promise.all([...this.builtins.values()].filter((held): held is Promise<void> => held instanceof Promise));
    }
  }

  /**
   * @brief One font's bytes, as `prepare()` would inject them: a built-in's
   *        from the server (fetched once, kept), a `<bdf>`'s from the compile.
   *
   * @param kind     `builtin` or `bdf`.
   * @param name     The font's name.
   * @param compiled The project's compiled assets, for a `<bdf>`.
   * @return The bytes, or undefined for a font that cannot be had.
   */
  async fontBytes(kind: 'builtin' | 'bdf', name: string, compiled: CompiledAssets | undefined): Promise<Uint8Array | undefined> {
    if (kind === 'bdf') return compiled?.fonts.get(name)?.bytes;
    const held = this.builtin(name);
    if (held instanceof Promise) await held;
    const bytes = this.builtins.get(name);
    return bytes instanceof Uint8Array ? bytes : undefined;
  }

  // builtin
  // A built-in font's bytes, null if the server refused it, or the fetch in
  // flight, which this starts on the first ask.
  //   name — the U8G2 font name
  private builtin(name: string): Uint8Array | null | Promise<void> {
    const held = this.builtins.get(name);
    if (held !== undefined) return held;
    const fetching = this.fetchBuiltin(name).then((bytes) => {
      this.builtins.set(name, bytes);
      this.onArrived();
    });
    this.builtins.set(name, fetching);
    return fetching;
  }

  // fetchBuiltin
  // One font from the server; null, logged, when it is refused or unreachable.
  //   name — the U8G2 font name
  private async fetchBuiltin(name: string): Promise<Uint8Array | null> {
    try {
      const response = await fetch(`${this.session.origin}${BUILTIN_FONT_ROUTE}?name=${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${this.session.token}` },
      });
      if (!response.ok) {
        const reason = ((await response.json().catch(() => ({}))) as { message?: string }).message ?? `answered ${response.status}`;
        this.log(`fonts: '${name}' is not available: ${reason}`);
        return null;
      }
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      this.log(`fonts: '${name}' could not be fetched: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  // bytesOf
  // A produced image's bytes as a Uint8Array, converted once per image.
  //   image — compileProjectAssets()'s image
  private bytesOf(image: { readonly bytes: readonly number[] }): Uint8Array {
    let bytes = this.imageBytes.get(image);
    if (bytes === undefined) {
      bytes = Uint8Array.from(image.bytes);
      this.imageBytes.set(image, bytes);
    }
    return bytes;
  }

  // identity
  // A stable number for one byte array, so the key changes exactly when an
  // asset's bytes are replaced, without comparing them.
  //   bytes — the array
  private identity(bytes: object): number {
    let id = this.identities.get(bytes);
    if (id === undefined) {
      id = this.nextIdentity++;
      this.identities.set(bytes, id);
    }
    return id;
  }
}
