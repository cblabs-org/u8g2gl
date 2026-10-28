/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: designer/test/unit/support/fake-model.ts
 * Purpose: A stand-in for Monaco's text model, for the unit tests of the
 *          canvas's edit path, which run in Node where Monaco cannot. It keeps
 *          Monaco's undo semantics, which are what the tests are about:
 *          `pushEditOperations` joins the open undo stop or opens one,
 *          `pushStackElement` closes it, and `undo` reverts the last stop
 *          whole. The end-to-end suite checks the same against the real model.
 * Description: The text is a string; positions are 1-based lines and columns
 *              over LF line breaks.
 *
 * Exports:
 * - FakeModel:  The model
 */

import type { EditableModel } from '../../../src/editing/canvas-editor';

/** A text with Monaco's undo stops: an open stop takes edits until it is closed. */
export class FakeModel implements EditableModel {
  text: string;
  private readonly stops: string[] = [];
  private open = false;
  private version = 1;
  private nextVersion = 2;
  private readonly versions: number[] = [];
  edits = 0;

  constructor(text: string) {
    this.text = text;
  }
  getValue(): string {
    return this.text;
  }
  getPositionAt(offset: number): { lineNumber: number; column: number } {
    const before = this.text.slice(0, offset).split('\n');
    return { lineNumber: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
  }
  getAlternativeVersionId(): number {
    return this.version;
  }
  pushStackElement(): void {
    this.open = false;
  }
  pushEditOperations(
    _before: null,
    operations: { range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }; text: string }[],
  ): unknown {
    if (!this.open) {
      this.stops.push(this.text);
      this.versions.push(this.version);
      this.open = true;
    }
    const offset = (line: number, column: number): number => {
      const lines = this.text.split('\n');
      let at = 0;
      for (let i = 0; i < line - 1; i++) at += (lines[i]?.length ?? 0) + 1;
      return at + column - 1;
    };
    const spans = operations
      .map((op) => ({ start: offset(op.range.startLineNumber, op.range.startColumn), end: offset(op.range.endLineNumber, op.range.endColumn), text: op.text }))
      .sort((p, q) => q.start - p.start);
    for (const span of spans) this.text = this.text.slice(0, span.start) + span.text + this.text.slice(span.end);
    this.version = this.nextVersion++;
    this.edits += 1;
    return null;
  }
  /** Reverts the last stop whole, as ⌘Z does. */
  undo(): void {
    const text = this.stops.pop();
    const version = this.versions.pop();
    if (text !== undefined && version !== undefined) {
      this.text = text;
      this.version = version;
    }
    this.open = false;
  }
  /** Typing in the editor: an edit with no stop of its own pushed first. */
  type(at: number, text: string): void {
    const position = this.getPositionAt(at);
    this.pushEditOperations(null, [{ range: { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column }, text }]);
  }
  get stopCount(): number {
    return this.stops.length;
  }
}
