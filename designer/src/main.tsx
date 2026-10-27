/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/src/main.tsx
 * Purpose: The designer's entry point: connect to the design server this page
 *          came from, load the project, and mount the shell. Anything that can
 *          fail here — a page opened without the server, a lost token — is
 *          shown as a sentence on the page, not as a blank one.
 * Description: Reads the session from the URL, connects the served
 *              `ProjectFileSystem` (its event stream must be attached before
 *              the first read, so no external edit between the two is missed),
 *              loads the documents, then renders.
 *
 * Exports: none; runs on load.
 */

import { ServedProjectFileSystem } from '@u8g2gl/core/project-fs/served-project-file-system.js';
import { parseProjectFile } from '@u8g2gl/core/parser/index.js';
import { createRoot } from 'react-dom/client';
import 'dockview-react/dist/styles/dockview.css';
import './styles.css';
import { readSession } from './session';
import { App } from './ui/app';
import { Workspace } from './workspace';

// fail
// Replaces the page with one sentence saying what went wrong.
//   message — what to tell the user
function fail(message: string): void {
  const root = document.getElementById('root');
  if (root !== null) {
    root.className = 'fatal';
    root.textContent = message;
  }
}

// start
// Connects, loads and mounts.
async function start(): Promise<void> {
  // --- Step 1: The session this page belongs to ---
  const session = readSession(location.href);
  if (session === undefined) {
    fail("This page must be opened from the URL 'u8g2gl design' prints.");
    return;
  }

  // --- Step 2: The project, through the server ---
  const fs = new ServedProjectFileSystem({ origin: session.origin, token: session.token });
  await fs.connect();
  const workspace = new Workspace(fs);
  await workspace.documents.load();
  const projectText = workspace.documents.texts().get('u8g2gl.xml');
  const projectName = projectText === undefined ? '' : (parseProjectFile(projectText, 'u8g2gl.xml').value?.name ?? '');
  workspace.projectName.set(projectName);
  document.title = projectName === '' ? 'u8g2gl design' : `${projectName} · u8g2gl design`;

  // --- Step 3: The shell ---
  const root = document.getElementById('root');
  if (root === null) throw new Error('index.html has no #root');
  createRoot(root).render(<App workspace={workspace} />);
  (window as unknown as { __u8g2gl?: Workspace }).__u8g2gl = workspace;
}

start().catch((error: unknown) => fail(`The designer could not start: ${error instanceof Error ? error.message : String(error)}`));
