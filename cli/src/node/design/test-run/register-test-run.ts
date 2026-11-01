/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/test-run/register-test-run.ts
 * Purpose: Adds the test run to a design server in one call: the `test-run`
 *          job on its build queue and the bug-report route beside it, sharing
 *          one build cache, so the command that starts the server need not
 *          know the test run is two pieces.
 *
 * Exports:
 * - registerTestRun():  Register the job and the route
 */

import type { DesignServer } from '../design-server.js';
import { TEST_RUN_REPORT_ROUTE, testRunReportRoute } from './bug-report.js';
import { registerTestRunJob, testRunBuildCacheRoot, type TestRunJobOptions } from './test-run-job.js';

/**
 * @brief Registers the `test-run` job and `POST /api/test-run/report` on a server.
 *
 * @param server  A started design server.
 * @param options Overrides for tests; the real machine's otherwise.
 */
export function registerTestRun(server: DesignServer, options: TestRunJobOptions = {}): void {
  registerTestRunJob(server.builds, options);
  server.registerJsonRoute(
    TEST_RUN_REPORT_ROUTE,
    testRunReportRoute(
      () => testRunBuildCacheRoot(options),
      (id) => server.builds.get(id),
    ),
  );
}
