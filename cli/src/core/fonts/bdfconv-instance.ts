/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/fonts/bdfconv-instance.ts
 * Purpose: Boots one bdfconv Wasm module instance from the committed artefact and runs
 *          one BDF-to-C conversion through it — the low-level glue compileBdf() (WO2 item
 *          2) and the artefact's own smoke test share, so there is exactly one place that
 *          knows how to turn the committed JSON/module pair into a callable instance.
 *          Replaces WO1's `src/data/bdfconv/runner.ts`, which loaded the glue through a
 *          `data:` URL dynamic import; WO2 item 1 made the glue a real, statically
 *          importable ES module, so that indirection is gone.
 * Description: Imports the generated glue module statically (`bdfconv-glue.generated.ts`)
 *              and the embedded Wasm bytes as a JSON module, decodes the bytes, and
 *              instantiates with `wasmBinary` supplied directly so the glue never reaches
 *              its own fetch-based loading path (WO1 finding). `locateFile` is kept for
 *              the same reason WO1 needed it — the glue calls `findWasmBinary()` during
 *              init to compute a cache key even when `wasmBinary` is already supplied.
 *
 * Exports:
 * - BdfconvModule:            The instantiated module's FS and callMain surface
 * - BdfconvConversion:        Outcome of one convertBdf() call
 * - BdfconvInstanceOptions:   Optional stdout/stderr sinks for one instance
 * - instantiateBdfconv():     Boots one bdfconv module instance from the committed artefact
 * - convertBdf():             Runs one BDF-to-C conversion against an instantiated module
 */

// bdfconv-glue.generated.ts is Emscripten's own generated output, marked `// @ts-nocheck`
// at its own header, so its default export comes in as `any`; this file supplies the real
// type for it just below.
import bdfconvFactory from '../../data/bdfconv/bdfconv-glue.generated.js';
import wasmData from '../../data/bdfconv/bdfconv-wasm.json' with { type: 'json' };

/** Minimal Emscripten MEMFS surface bdfconv callers need: whole-file read and write. */
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
   * `ExitStatus` rather than a normal return (WO1 finding). Callers must catch it and
   * inspect `status` instead of treating any throw as a crash. One module instance serves
   * exactly one conversion — do not call this twice on the same instance.
   */
  callMain(args: readonly string[]): void;
}

/** The subset of the Emscripten factory signature this module relies on. */
type EmscriptenFactory = (moduleArg: {
  readonly wasmBinary: Uint8Array;
  locateFile(path: string): string;
  print(message: string): void;
  printErr(message: string): void;
}) => Promise<BdfconvModule>;

const factory = bdfconvFactory as unknown as EmscriptenFactory;

/**
 * @brief Decodes standard base64 to raw bytes without Node's `Buffer` (isomorphic).
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

/** Optional sinks for one instance's stdout/stderr, used to surface bdfconv's own log lines. */
export interface BdfconvInstanceOptions {
  readonly onStdout?: (line: string) => void;
  readonly onStderr?: (line: string) => void;
}

/**
 * @brief Instantiates one bdfconv module instance from the committed artefact.
 *
 * Each call creates an independent module instance with its own memory and virtual
 * filesystem — concurrent calls are safe (compileBdf()'s concurrency test exercises this).
 *
 * @param options Optional stdout/stderr sinks.
 * @return A ready module whose `FS` and `callMain` are usable immediately.
 */
export async function instantiateBdfconv(options: BdfconvInstanceOptions = {}): Promise<BdfconvModule> {
  const wasmBinary = base64ToBytes(wasmData.base64);
  return factory({
    wasmBinary,
    locateFile: (path) => path,
    print: (message) => options.onStdout?.(message),
    printErr: (message) => options.onStderr?.(message),
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
