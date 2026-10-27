/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/ui/workspace-context.ts
 * Purpose: Hands the session's `Workspace` to every panel without threading
 *          it through props — Dockview constructs panel components itself, so
 *          there is no parent to pass it down from.
 * Description: A React context and the hook that reads it.
 *
 * Exports:
 * - WorkspaceContext:  The context
 * - useWorkspace():    The workspace; throws outside the provider
 */

import { createContext, useContext } from 'react';
import type { Workspace } from '../workspace';

/** The session's workspace, provided once at the root. */
export const WorkspaceContext = createContext<Workspace | undefined>(undefined);

/** @brief The session's workspace. Throws if rendered outside the provider: a wiring defect. */
export function useWorkspace(): Workspace {
  const workspace = useContext(WorkspaceContext);
  if (workspace === undefined) {
    throw new Error('useWorkspace() outside WorkspaceContext');
  }
  return workspace;
}
