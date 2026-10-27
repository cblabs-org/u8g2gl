/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/lock-file.ts
 * Purpose: One design server per project (EDITOR-DESIGN §2.1). Two servers on
 *          one project would run two watchers and two build queues racing over
 *          the same files, so a second `u8g2gl design` must find the first and
 *          attach to it — and a lock left by a server that crashed must not lock
 *          the project forever.
 * Description: `.u8g2gl-design.lock` at the project root holds the server's
 *              pid, port, token and URL as JSON. It is created exclusively
 *              (`wx`), so two servers starting in the same instant cannot both
 *              win. A lock is **live** only if its process exists and its
 *              server answers its own token; a dead pid, or a live pid that is
 *              now some other program (pids are reused), is stale and may be
 *              replaced. The lock holds the session token, so it is per-user
 *              state and belongs in the project's `.gitignore`.
 *
 * Exports:
 * - DesignLock:           The lock's content
 * - lockPath():           Where a project's lock lives
 * - readLock():           A project's lock, if it has a well-formed one
 * - isLockLive():         Whether the server a lock names is still running
 * - tryCreateLock():      Create the lock exclusively
 * - removeLockIfOwned():  Delete the lock, only if it is still this server's
 */

import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCK_FILE_NAME } from './ignored-paths.js';

/** The lock's content. */
export interface DesignLock {
  readonly pid: number;
  readonly port: number;
  readonly token: string;
  readonly url: string;
}

/** How long to wait for a locked server to answer before calling it stale. */
const PROBE_TIMEOUT_MS = 1000;

/** @brief Where a project's lock lives. */
export function lockPath(projectRoot: string): string {
  return join(projectRoot, LOCK_FILE_NAME);
}

/**
 * @brief A project's lock, if it has a well-formed one.
 *
 * @return The lock, or undefined if there is none or it cannot be parsed — a
 *         corrupt lock is treated as stale, never as live.
 */
export function readLock(projectRoot: string): DesignLock | undefined {
  try {
    const value = JSON.parse(readFileSync(lockPath(projectRoot), 'utf8')) as Partial<DesignLock>;
    if (
      Number.isInteger(value.pid) &&
      Number.isInteger(value.port) &&
      typeof value.token === 'string' &&
      typeof value.url === 'string'
    ) {
      return value as DesignLock;
    }
  } catch {
    // Absent or unreadable.
  }
  return undefined;
}

/**
 * @brief Whether the server a lock names is still running.
 *
 * Checks the pid first (cheap, and enough for a crashed server), then asks the
 * server for its file list with the lock's token — which only the server that
 * wrote the lock can answer.
 */
export async function isLockLive(lock: DesignLock): Promise<boolean> {
  if (!processExists(lock.pid)) {
    return false;
  }
  try {
    const response = await fetch(`http://127.0.0.1:${lock.port}/api/files`, {
      headers: { Authorization: `Bearer ${lock.token}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * @brief Creates the lock, failing if one already exists.
 *
 * @return True if this call created it; false if a lock was already there.
 * @throws Error for any failure other than an existing lock (permissions).
 */
export function tryCreateLock(projectRoot: string, lock: DesignLock): boolean {
  try {
    writeFileSync(lockPath(projectRoot), `${JSON.stringify(lock, null, 2)}\n`, { flag: 'wx' });
    return true;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'EEXIST') {
      return false;
    }
    throw cause;
  }
}

/**
 * @brief Deletes the lock, only if it still holds `token`.
 *
 * Used for this server's own lock on exit, and for a stale lock being
 * replaced. Comparing the token makes replacement safe when two instances
 * find the same stale lock at once: the first replaces it, and the second's
 * delete then sees a different token and leaves the new lock alone.
 *
 * @param token The token the lock must hold, or undefined to delete a lock
 *              that is malformed (one {@link readLock} cannot parse).
 */
export function removeLockIfOwned(projectRoot: string, token: string | undefined): void {
  if (readLock(projectRoot)?.token !== token) {
    return;
  }
  try {
    unlinkSync(lockPath(projectRoot));
  } catch {
    // Already gone.
  }
}

// processExists
// Whether a process with this pid exists. Signal 0 tests without signalling;
// EPERM means it exists but belongs to someone else, which still counts.
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code === 'EPERM';
  }
}
