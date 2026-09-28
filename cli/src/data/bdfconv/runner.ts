/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/data/bdfconv/runner.ts
 * Purpose: Gives WO1's tests a way to run the committed bdfconv Wasm artefact end to end
 *          without a second implementation of "how do I load this." Both this file and
 *          the browser designer must be able to turn the committed JSON modules back into
 *          a callable Emscripten instance with no `fetch`, no `node:fs` and no
 *          `import.meta.url` resolution (WORKORDER "The artefact" requirements), so the
 *          technique lives here once rather than once per caller. WO2 replaces this with
 *          the real font-compiler API and may delete it; nothing outside WO1's tests
 *          should depend on this file's shape.
 * Description: Decodes the embedded base64 Wasm bytes and dynamically imports the
 *              embedded glue source from a `data:` URL — supported by both Node and
 *              browsers without any network or disk access — then instantiates the
 *              resulting Emscripten module with the decoded bytes supplied directly as
 *              `wasmBinary`, which is what keeps the glue off its own fetch fallback path.
 *
 * Exports:
 * - BdfconvModule:        The instantiated module's FS and callMain surface tests use
 * - BdfconvConversion:    Outcome of one convertBdf() call
 * - instantiateBdfconv(): Boots one bdfconv module instance from the committed artefact
 * - convertBdf():         Runs one BDF-to-C conversion against an instantiated module
 */

import glueData from './bdfconv-glue.json' with { type: 'json' };
import wasmData from './bdfconv-wasm.json' with { type: 'json' };

/** Minimal Emscripten MEMFS surface bdfconv's tests need: whole-file read and write. */
export interface BdfconvFS {
  writeFile(path: string, data: Uint8Array | string): void;
  readFile(path: string, opts: { encoding: 'utf8' }): string;
  readFile(path: string): Uint8Array;
}

/** The instantiated bdfconv module: its virtual filesystem and its `main()` entry point. */
export interface BdfconvModule {
  readonly FS: BdfconvFS;
  /**
   * Runs bdfconv's `main()` with the given argv.
   *
   * Under `-sEXIT_RUNTIME=1`, U8G2's own `exit()` surfaces as a thrown Emscripten
   * `ExitStatus` rather than a normal return (measured during WO1; see the Completion
   * Report). Callers must catch it and inspect `status` instead of treating any throw as
   * a crash. One module instance serves exactly one conversion — do not call this twice
   * on the same instance.
   */
  callMain(args: readonly string[]): void;
}

/** The subset of the Emscripten factory signature this runner relies on. */
type EmscriptenFactory = (moduleArg: {
  readonly wasmBinary: Uint8Array;
  locateFile(path: string): string;
  print(message: string): void;
  printErr(message: string): void;
}) => Promise<BdfconvModule>;

/**
 * @brief Encodes UTF-8 text to base64 without Node's `Buffer` (isomorphic).
 *
 * `Buffer` is Node-only; this artefact must build the same `data:` URL in a browser, so
 * encoding goes through `TextEncoder` and `btoa`, both available in Node 18+ and browsers.
 *
 * @param text Arbitrary UTF-8 text — here, the embedded Emscripten glue source.
 * @return Base64 encoding suitable for a `data:` URL.
 */
function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * @brief Decodes standard base64 to raw bytes without Node's `Buffer` (isomorphic).
 *
 * @param base64 Base64-encoded bytes — here, the committed Wasm artefact.
 * @return The decoded byte array.
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * @brief Instantiates one bdfconv module instance from the committed artefact.
 *
 * @return A ready module whose `FS` and `callMain` are usable immediately.
 */
export async function instantiateBdfconv(): Promise<BdfconvModule> {
  // --- Step 1: Import the embedded glue as an ES module via a data: URL ---
  // The glue's text is already in memory as a committed JSON string (bdfconv-glue.json);
  // turning it back into a callable module without writing it to disk first is exactly
  // what a data: URL import buys, and it works identically in Node and a browser.
  const glueUrl = `data:text/javascript;base64,${utf8ToBase64(glueData.source)}`;
  // @vite-ignore — the specifier is a runtime-built data: URL, not a static module path,
  // so Vite/Vitest's dynamic-import analysis (which does not understand data: URLs) must
  // not try to rewrite or pre-resolve it; this is a hint to the bundler, not a lint rule.
  const imported = (await import(/* @vite-ignore */ glueUrl)) as { readonly default: EmscriptenFactory };

  // --- Step 2: Instantiate with the embedded Wasm bytes supplied directly ---
  // Passing `wasmBinary` explicitly means the glue never reaches its own fetch-based
  // loading path — verified during WO1 measurement (Completion Report, "Node imports in
  // glue") to be present as dead code but never executed. `locateFile` is also required:
  // the glue unconditionally calls `findWasmBinary()` during init to compute a cache key
  // even when `wasmBinary` is supplied, and its fallback does `new URL("bdfconv.wasm",
  // import.meta.url)` — invalid when `import.meta.url` is itself a `data:` URL (measured
  // during WO1: this throws without `locateFile`). Supplying `locateFile` short-circuits
  // that branch; the string it returns is never read, since `wasmBinary` is already set.
  const wasmBinary = base64ToBytes(wasmData.base64);
  return imported.default({
    wasmBinary,
    locateFile: (path) => path,
    print() {},
    printErr() {},
  });
}

/** Outcome of one convertBdf() call. */
export interface BdfconvConversion {
  /** False if bdfconv exited non-zero, or callMain threw something other than a normal exit. */
  readonly ok: boolean;
  /** bdfconv's exit status, when it threw Emscripten's ExitStatus rather than returning. */
  readonly exitStatus?: number;
}

/**
 * @brief Writes a BDF file into the module's virtual filesystem and runs bdfconv on it.
 *
 * @param module    An instance from instantiateBdfconv(). Consumed by this one call —
 *                   `EXIT_RUNTIME=1` means the instance should not be reused afterwards.
 * @param bdfBytes  The BDF file's raw bytes.
 * @param args      bdfconv's argv, excluding argv[0] and the input path, e.g.
 *                  `['-f', '1', '-m', '32-127', '-n', 'my_font', '-o', '/out.c']`. The
 *                  input path is appended automatically as the final argument.
 * @param inputPath Virtual path to write the BDF to. Defaults to `/in.bdf`.
 * @return Whether the run succeeded, and bdfconv's exit status if it threw one.
 */
export function convertBdf(
  module: BdfconvModule,
  bdfBytes: Uint8Array,
  args: readonly string[],
  inputPath = '/in.bdf'
): BdfconvConversion {
  module.FS.writeFile(inputPath, bdfBytes);
  try {
    module.callMain([...args, inputPath]);
    return { ok: true };
  } catch (error) {
    // Emscripten's ExitStatus is not an Error subclass, so duck-type its `status` field
    // rather than checking `instanceof`.
    const status = (error as { readonly status?: number }).status;
    return { ok: status === 0, exitStatus: status };
  }
}
