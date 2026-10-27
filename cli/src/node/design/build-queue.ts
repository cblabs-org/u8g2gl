/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/build-queue.ts
 * Purpose: Where the design server runs builds — the editor Wasm, `generate` —
 *          outside the per-edit loop. Builds are slow (seconds), share the
 *          project directory and the toolchain, and must not run two at once,
 *          so they go through one queue that the editor submits to and polls.
 *          The server ships with **no jobs**: a job kind exists only once a
 *          later piece of the designer registers it, so the queue's contract is
 *          settled before the first job that depends on it.
 * Description: A registry of named job runners and a strictly serial FIFO of
 *              submitted jobs. Each submission gets an id and a status record
 *              — queued, running, succeeded or failed — which the server
 *              returns as JSON. A runner that throws fails its job; it never
 *              stops the queue. Finished records beyond the most recent
 *              `MAX_FINISHED` are forgotten, so a long session's memory stays
 *              bounded.
 *
 * Exports:
 * - BuildJobContext:  What a runner is given
 * - BuildJobRunner:   A job kind's implementation
 * - BuildJobStatus:   'queued' | 'running' | 'succeeded' | 'failed'
 * - BuildJobRecord:   One submission's state, as served
 * - BuildQueue:       The registry and queue
 *
 *     Registry:
 *     - register():   Add a job kind
 *     - has():        Whether a kind is registered
 *
 *     Queue:
 *     - submit():     Queue a job; returns its record
 *     - get():        A submission's current record
 *     - idle():       Resolves when nothing is queued or running
 */

/** What a job runner is given. */
export interface BuildJobContext {
  /** Absolute project directory. */
  readonly projectRoot: string;
  /** The JSON body the client posted, or undefined if it posted none. */
  readonly params: unknown;
}

/**
 * A job kind's implementation. Resolves with a JSON-serialisable result, or
 * throws to fail the job with the error's message.
 */
export type BuildJobRunner = (context: BuildJobContext) => Promise<unknown>;

/** Where a job is in its life. */
export type BuildJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** One submission's state, exactly as `GET /api/build/:id` serves it. */
export interface BuildJobRecord {
  readonly id: string;
  readonly job: string;
  readonly status: BuildJobStatus;
  /** The runner's result, once succeeded. */
  readonly result?: unknown;
  /** The failure message, once failed. */
  readonly error?: string;
}

/** Finished records kept for polling; older ones are forgotten. */
const MAX_FINISHED = 100;

/**
 * A registry of build job kinds and a serial queue of submissions.
 */
export class BuildQueue {
  private readonly projectRoot: string;
  private readonly runners = new Map<string, BuildJobRunner>();
  private readonly records = new Map<string, BuildJobRecord>();
  private readonly waiting: Array<{ readonly id: string; readonly params: unknown }> = [];
  private readonly finished: string[] = [];
  private nextId = 1;
  private running = false;
  private readonly idleWaiters: Array<() => void> = [];

  /** @param projectRoot Passed to every runner. */
  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * @brief Registers a job kind.
   *
   * @param job    The name clients post to (`POST /api/build/<job>`).
   * @param runner Its implementation.
   * @throws Error if the name is already registered — two pieces of code
   *         claiming one job name is a defect, and the second silently winning
   *         would hide it.
   */
  register(job: string, runner: BuildJobRunner): void {
    if (this.runners.has(job)) {
      throw new Error(`build job '${job}' is already registered`);
    }
    this.runners.set(job, runner);
  }

  /** @brief Whether a job kind is registered. */
  has(job: string): boolean {
    return this.runners.has(job);
  }

  /**
   * @brief Queues a job of a registered kind.
   *
   * @return Its record (status `queued`), or undefined if the kind is unknown.
   */
  submit(job: string, params: unknown): BuildJobRecord | undefined {
    if (!this.runners.has(job)) {
      return undefined;
    }
    const id = String(this.nextId++);
    const record: BuildJobRecord = { id, job, status: 'queued' };
    this.records.set(id, record);
    this.waiting.push({ id, params });
    void this.drain();
    return record;
  }

  /** @brief A submission's current record, or undefined if unknown or forgotten. */
  get(id: string): BuildJobRecord | undefined {
    return this.records.get(id);
  }

  /** @brief Resolves once nothing is queued or running. */
  idle(): Promise<void> {
    if (!this.running && this.waiting.length === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  // drain
  // Runs queued jobs one at a time until none are left. Re-entrant calls while
  // a job runs return at once; the running loop picks up what they queued.
  private async drain(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    for (let next = this.waiting.shift(); next !== undefined; next = this.waiting.shift()) {
      const queued = this.records.get(next.id);
      if (queued === undefined) {
        continue;
      }
      const runner = this.runners.get(queued.job);
      this.records.set(next.id, { ...queued, status: 'running' });
      try {
        if (runner === undefined) {
          throw new Error(`build job '${queued.job}' is not registered`);
        }
        const result = await runner({ projectRoot: this.projectRoot, params: next.params });
        this.records.set(next.id, { id: next.id, job: queued.job, status: 'succeeded', result });
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : String(cause);
        this.records.set(next.id, { id: next.id, job: queued.job, status: 'failed', error });
      }
      this.retire(next.id);
    }
    this.running = false;
    for (const resolve of this.idleWaiters.splice(0)) {
      resolve();
    }
  }

  // retire
  // Marks a record finished, forgetting the oldest beyond MAX_FINISHED.
  private retire(id: string): void {
    this.finished.push(id);
    while (this.finished.length > MAX_FINISHED) {
      const oldest = this.finished.shift();
      if (oldest !== undefined) {
        this.records.delete(oldest);
      }
    }
  }
}
