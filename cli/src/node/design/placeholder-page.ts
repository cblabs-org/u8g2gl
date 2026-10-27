/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/node/design/placeholder-page.ts
 * Purpose: What `/` serves until the editor application exists. The server,
 *          its token and its file API arrive before the editor that uses them,
 *          and a person who runs `u8g2gl design` in the meantime should see a
 *          page that says so rather than a blank one or a 404.
 * Description: One static HTML string; no framework, no script.
 *
 * Exports:
 * - placeholderPage():  The page, naming the project directory
 */

/**
 * @brief The placeholder page's HTML.
 *
 * @param projectName The project directory's name, shown on the page; escaped here.
 * @return A complete HTML document.
 */
export function placeholderPage(projectName: string): string {
  // The directory name is untrusted: a project folder may be named
  // `<script>…`, and this page is served with the session token in its URL.
  const name = projectName.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>u8g2gl design</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 3rem auto; max-width: 36rem; padding: 0 1rem; }
  code { font-family: ui-monospace, monospace; }
</style>
</head>
<body>
<h1>u8g2gl design</h1>
<p>The design server is running for <code>${name}</code>.</p>
<p>The editor itself is not built yet. Until it is, this server only serves the
project's files to the editor's file API.</p>
</body>
</html>
`;
}
