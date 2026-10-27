/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/wasm/editor-module.ts
 * Purpose: The designer's handle on an editor Wasm ([UD-4]): the framework one
 *          bundled with the designer, or a project's own from the design
 *          server's build. Both are Emscripten `MODULARIZE` builds of
 *          `wasm/bridge.cpp` with the same exports, so one wrapper serves
 *          both, and the canvas does not know which it is drawing with.
 * Description: `loadEditorModule` fetches the loader script and the module
 *              with the caller's headers (the project's route needs the
 *              session token), evaluates the loader as a function so two
 *              modules never collide on its global name, and instantiates it
 *              from the fetched bytes. The wrapper marshals strings through
 *              the Wasm heap, and `renderFrame` returns a view of the frame
 *              buffer rather than a copy: it is read once per frame and must not
 *              cost an allocation per frame.
 *
 * Exports:
 * - Placeholder:          An element drawn as a placeholder, and why
 * - EditorModule:         The bridge's API
 *
 *     Scene:
 *     - applyScene():       Build the scene's default screen
 *     - selectScreen():     Switch to another of its screens
 *     - applySampleData():  Set subject values
 *
 *     Frame:
 *     - renderFrame():      Tick and draw; a view of the 1-bit buffer
 *     - displaySize():      The scene's display
 *
 *     Reporting:
 *     - lastError():        Why the last call failed
 *     - placeholders():     Elements the module has no class for
 *     - buildHash():        A project build's input hash; undefined for the framework's
 *
 * - loadEditorModule():   Fetch and instantiate one
 */

/** An element the loaded Wasm drew as a placeholder (EDITOR-DESIGN §5.4). */
export interface Placeholder {
  readonly name: string;
  readonly tag: string;
  readonly class: string;
  /** `[x, y, width, height]`, device pixels. */
  readonly rect: readonly number[];
}

/** One loaded editor Wasm. */
export interface EditorModule {
  /** @brief Parses a scene and builds its default screen; false with `lastError()` on failure. */
  applyScene(json: string): boolean;
  /** @brief Rebuilds the named screen of the applied scene. */
  selectScreen(name: string): boolean;
  /** @brief Sets subject values from a `{ name: value }` object's JSON. */
  applySampleData(json: string): boolean;
  /**
   * @brief Ticks and draws the active screen.
   *
   * @return A view of the U8G2 tile buffer, valid until the next call into the
   *         module; undefined with `lastError()` on failure.
   */
  renderFrame(ms: number): Uint8Array | undefined;
  /** @brief The applied scene's display, in pixels. */
  displaySize(): { readonly width: number; readonly height: number };
  /** @brief Why the last call that failed did. */
  lastError(): string;
  /** @brief The active screen's elements drawn as placeholders. */
  placeholders(): readonly Placeholder[];
  /** @brief The build hash a project editor Wasm carries; undefined for the framework's. */
  buildHash(): string | undefined;
}

/** The Emscripten module object, as far as the wrapper uses it. */
interface EmscriptenModule {
  readonly HEAPU8: Uint8Array;
  lengthBytesUTF8(text: string): number;
  stringToUTF8(text: string, pointer: number, capacity: number): void;
  UTF8ToString(pointer: number): string;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _applyScene(pointer: number): number;
  _selectScreen(pointer: number): number;
  _applySampleData(pointer: number): number;
  _renderFrame(ms: number): number;
  _getBufferSize(): number;
  _getDisplayWidth(): number;
  _getDisplayHeight(): number;
  _getLastError(): number;
  _getPlaceholders(): number;
  _getBuildHash?: () => number;
}

/** The factory a MODULARIZE loader defines. */
type ModuleFactory = (options: { wasmBinary: ArrayBuffer }) => Promise<EmscriptenModule>;

/** The name the loader's factory is exported under (`wasm/CMakeLists.txt`'s EXPORT_NAME). */
const EXPORT_NAME = 'createU8g2glEditor';

/**
 * @brief Fetches and instantiates an editor Wasm.
 *
 * @param loaderUrl `u8g2gl_editor.js`'s URL.
 * @param wasmUrl   `u8g2gl_editor.wasm`'s URL.
 * @param headers   Sent with both requests (the session token, for a project build).
 * @return The module, ready for `applyScene`.
 * @throws Error if either file cannot be fetched or the module will not start.
 */
export async function loadEditorModule(
  loaderUrl: string,
  wasmUrl: string,
  headers: Readonly<Record<string, string>> = {},
): Promise<EditorModule> {
  // --- Step 1: Fetch the loader and the module together ---
  const [loader, binary] = await Promise.all([fetch(loaderUrl, { headers }), fetch(wasmUrl, { headers })]);
  if (!loader.ok || !binary.ok) {
    throw new Error(`could not fetch the editor Wasm (${loader.status}, ${binary.status})`);
  }
  const [source, bytes] = await Promise.all([loader.text(), binary.arrayBuffer()]);

  // --- Step 2: Evaluate the loader in its own scope, and start the module ---
  // As a function rather than a <script>: a script defines the factory as a
  // page global, so loading a project build would silently replace the
  // framework's, and a script URL would need the token in its query.
  const factory = new Function(`${source}\n;return ${EXPORT_NAME};`)() as ModuleFactory;
  const module = await factory({ wasmBinary: bytes });
  return wrap(module);
}

// wrap
// The EditorModule over one started Emscripten module.
//   module — the factory's result
function wrap(module: EmscriptenModule): EditorModule {
  // withString
  // Calls an export taking one C string, freeing the copy afterwards.
  const withString = (call: (pointer: number) => number, text: string): number => {
    const size = module.lengthBytesUTF8(text) + 1;
    const pointer = module._malloc(size);
    module.stringToUTF8(text, pointer, size);
    try {
      return call(pointer);
    } finally {
      module._free(pointer);
    }
  };

  return {
    applyScene: (json) => withString((p) => module._applyScene(p), json) === 1,
    selectScreen: (name) => withString((p) => module._selectScreen(p), name) === 1,
    applySampleData: (json) => withString((p) => module._applySampleData(p), json) === 1,
    renderFrame(ms) {
      const pointer = module._renderFrame(Math.max(0, Math.floor(ms)) >>> 0);
      if (pointer === 0) {
        return undefined;
      }
      // Read HEAPU8 afresh: memory growth replaces the array, and a view taken
      // before growth would read freed memory.
      return module.HEAPU8.subarray(pointer, pointer + module._getBufferSize());
    },
    displaySize: () => ({ width: module._getDisplayWidth(), height: module._getDisplayHeight() }),
    lastError: () => module.UTF8ToString(module._getLastError()),
    placeholders: () => JSON.parse(module.UTF8ToString(module._getPlaceholders())) as Placeholder[],
    buildHash: () => (module._getBuildHash === undefined ? undefined : module.UTF8ToString(module._getBuildHash())),
  };
}
