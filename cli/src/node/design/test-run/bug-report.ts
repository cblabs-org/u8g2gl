/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/test-run/bug-report.ts
 * Purpose: When a test run's frame differs from the live canvas's, that is a
 *          framework bug ([D-9]: one implementation draws both), and the user
 *          is the first to see it. This writes what a maintainer needs to
 *          reproduce it, in one directory, so the user can attach it: both
 *          frames as images, the scene the canvas drew, the text that was
 *          tested, and every version involved.
 * Description: `writeBugReport()` writes `test-runs/<stamp>/` in the build
 *              cache: `live-<t>ms.pbm` and `harness-<t>ms.pbm` (binary PBM,
 *              1 = a lit pixel), `scene.json`, `staged/<path>` for each
 *              document that differed from disk, and `report.json` with the
 *              screen, the time, both hashes, the differing pixel count and
 *              the versions. The harness frame is taken from the run's own
 *              record, never from the request, so a report always holds what
 *              the server actually produced. `testRunReportRoute()` is the
 *              server route (`POST /api/test-run/report`) around it.
 *
 * Exports:
 * - TEST_RUN_REPORT_ROUTE:   The route's path
 * - framePbm():              A frame as binary PBM
 * - differingPixels():       How many pixels two frames differ in
 * - writeBugReport():        Write one report
 * - testRunReportRoute():    The route's handler
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { BuildJobRecord } from '../build-queue.js';
import type { JsonRoute } from '../design-server.js';
import { sha256 } from '../build/compile-units.js';
import { checkStagedDocuments, type StagedDocument } from './stage-project.js';
import { TEST_RUN_JOB, type TestRunResult } from './test-run-job.js';

/** The route the designer posts a bug report to. */
export const TEST_RUN_REPORT_ROUTE = '/api/test-run/report';

/**
 * @brief A frame as binary PBM (P4): rows packed most significant bit first.
 *
 * @param frame  U8G2's vertical_top_lsb buffer: byte (y / 8) * width + x, bit y % 8.
 */
export function framePbm(frame: Uint8Array, width: number, height: number): Uint8Array {
  const header = new TextEncoder().encode(`P4\n${width} ${height}\n`);
  const rowBytes = Math.ceil(width / 8);
  const out = new Uint8Array(header.length + rowBytes * height);
  out.set(header);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((((frame[Math.floor(y / 8) * width + x] ?? 0) >> (y % 8)) & 1) === 1) {
        out[header.length + y * rowBytes + (x >> 3)]! |= 0x80 >> (x & 7);
      }
    }
  }
  return out;
}

/**
 * @brief How many pixels two frames of the same size differ in.
 *
 * A count, for the report. The designer has its own comparison
 * (designer/src/test-run/verdict.ts) that returns where they differ, for the
 * overlay; the two packages share no runtime code, so each keeps its own.
 */
export function differingPixels(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    for (let bits = (a[i] ?? 0) ^ (b[i] ?? 0); bits !== 0; bits &= bits - 1) {
      count++;
    }
  }
  return count;
}

/** What a report is written from. */
interface BugReport {
  readonly cacheRoot: string;
  readonly runId: string;
  readonly result: TestRunResult;
  readonly time: number;
  readonly live: Uint8Array;
  readonly scene: string;
  readonly documents: readonly StagedDocument[];
  /** When the report is written; the directory's stamp. */
  readonly now: Date;
}

/**
 * @brief Writes one bug report directory.
 *
 * @return The directory written, or a sentence saying why the report cannot
 *         be written (no frame at that time, frames of different sizes).
 */
export function writeBugReport(report: BugReport): { readonly dir: string; readonly files: readonly string[] } | string {
  // --- Step 1: The harness frame, from the run's own record ---
  const frame = report.result.frames.find((candidate) => candidate.time === report.time);
  if (frame === undefined) {
    return `the run has no frame at ${report.time} ms`;
  }
  const harness = new Uint8Array(Buffer.from(frame.bytes, 'base64'));
  if (harness.length !== report.live.length) {
    return `the live frame is ${report.live.length} bytes and the harness frame ${harness.length}`;
  }

  // --- Step 2: The directory, stamped by time and run so two never collide ---
  const stamp = `${report.now.toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d+Z$/, '')}-run${report.runId}`;
  const dir = join(report.cacheRoot, 'test-runs', stamp);
  const { width, height } = report.result.display;
  const files: Array<[string, string | Uint8Array]> = [
    [`live-${report.time}ms.pbm`, framePbm(report.live, width, height)],
    [`harness-${report.time}ms.pbm`, framePbm(harness, width, height)],
    ['scene.json', report.scene],
    ...report.documents.map((document): [string, string] => [`staged/${document.path}`, document.content]),
    [
      'report.json',
      `${JSON.stringify(
        {
          screen: report.result.screen,
          time: report.time,
          display: report.result.display,
          sha256: { live: sha256(report.live), harness: frame.sha256 },
          differingPixels: differingPixels(report.live, harness),
          harnessHash: report.result.harnessHash,
          versions: report.result.versions,
        },
        null,
        2,
      )}\n`,
    ],
  ];

  // --- Step 3: Write them ---
  for (const [name, data] of files) {
    const target = join(dir, ...name.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
  }
  return { dir, files: files.map(([name]) => name) };
}

/**
 * @brief The bug-report route's handler.
 *
 * Body: `{ run, time, live, scene, documents }` — the test-run record's id,
 * the frame's time, the live frame (base64), the scene the canvas drew, and
 * the documents the run was posted. Answers `{ path, files }`, or 400/404
 * with `{ code, message }`.
 *
 * @param cacheRoot Resolves the build cache when a report is written.
 * @param record    Looks up a build record (`server.builds.get`).
 * @param now       The clock; tests pass a fixed one.
 */
export function testRunReportRoute(
  cacheRoot: () => string,
  record: (id: string) => BuildJobRecord | undefined,
  now: () => Date = () => new Date(),
): JsonRoute {
  return async (body) => {
    // --- Step 1: The request's shape ---
    const { run, time, live, scene, documents } = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
    const parsedDocuments = Array.isArray(documents) ? (documents as unknown[]) : undefined;
    if (
      typeof run !== 'string' ||
      typeof time !== 'number' ||
      typeof live !== 'string' ||
      typeof scene !== 'string' ||
      parsedDocuments === undefined ||
      !parsedDocuments.every(isDocument)
    ) {
      return { status: 400, body: { code: 'bad-request', message: 'a report needs { run, time, live, scene, documents }' } };
    }
    const refused = checkStagedDocuments(parsedDocuments);
    if (refused !== undefined) {
      return { status: 400, body: { code: 'bad-request', message: refused } };
    }

    // --- Step 2: The run, which must be a succeeded test run ---
    const found = record(run);
    if (found === undefined || found.job !== TEST_RUN_JOB || found.status !== 'succeeded') {
      return { status: 404, body: { code: 'unknown-run', message: 'no succeeded test run with that id' } };
    }

    // --- Step 3: Write ---
    const written = writeBugReport({
      cacheRoot: cacheRoot(),
      runId: run,
      result: found.result as TestRunResult,
      time,
      live: new Uint8Array(Buffer.from(live, 'base64')),
      scene,
      documents: parsedDocuments,
      now: now(),
    });
    if (typeof written === 'string') {
      return { status: 400, body: { code: 'bad-request', message: written } };
    }
    return { status: 200, body: { path: written.dir, files: written.files } };
  };
}

// isDocument
// Whether a posted value is a { path, content, version } of strings.
function isDocument(value: unknown): value is StagedDocument {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { path, content, version } = value as Record<string, unknown>;
  return typeof path === 'string' && typeof content === 'string' && typeof version === 'string';
}
