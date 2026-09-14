/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/resolver/provenance.ts
 * Purpose: After composite expansion (§13.6) one element written once in a
 *          composite's `<view>` can appear many times — once per instance. A
 *          diagnostic at that element must point at where it is written *and*
 *          say which instance it is about, or an author with two status bars
 *          cannot tell which one is wrong. This module is the single spelling
 *          of "which instance", shared by expansion, mangling and the validator
 *          passes that run on the expanded tree.
 * Description: An instantiation site records one composite instance: its tag,
 *              its name as written, the C++ identifier its children are
 *              prefixed with, and where it is written. A chain of sites,
 *              outermost first, locates an element through nested composites.
 *              Diagnostics keep their own location (the element in its
 *              composite's file) and gain the chain as prose appended to the
 *              message, so the `Diagnostic` contract ([D-16]) is unchanged.
 *              Isomorphic.
 *
 * Exports:
 * - InstantiationSite:    One composite instance an element sits inside
 * - formatLocation():     `file:line:column`, or undefined without a location
 * - formatInstantiation(): Prose naming an instantiation chain, innermost first
 * - withInstantiation():  A diagnostic with its instantiation chain appended
 */

import type { Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';

/** One composite instance that an expanded element sits inside. */
export interface InstantiationSite {
  /** The composite's tag, e.g. `status_bar`. */
  readonly tag: string;
  /** The instance's `name` as written, e.g. `clk`. */
  readonly name: string;
  /** The instance's own C++ identifier, which prefixes its children (§13.4) — e.g. `bar_clk`. */
  readonly identifier: string;
  /** Where the instance element is written. */
  readonly loc?: SourceLocation;
}

/**
 * @brief Spells a source location the way diagnostics print one.
 *
 * @return `file:line:column`, or undefined when there is no location.
 */
export function formatLocation(loc: SourceLocation | undefined): string | undefined {
  return loc ? `${loc.file}:${loc.line}:${loc.column}` : undefined;
}

/**
 * @brief Names an instantiation chain in prose, innermost instance first.
 *
 * `[bar, bar_clk]` gives "in instance 'bar_clk' of <clock_face> at
 * widgets/status_bar/status_bar.xml:12:9, inside instance 'bar' of <status_bar>
 * at screens/screen_home.xml:3:9". Instances are named by identifier, not by
 * the name as written, because the identifier is unique in the screen.
 *
 * @param chain Instances, outermost first.
 * @return The prose, or an empty string for an empty chain.
 */
export function formatInstantiation(chain: readonly InstantiationSite[]): string {
  const parts = [...chain].reverse().map((site) => {
    const at = formatLocation(site.loc);
    return `instance '${site.identifier}' of <${site.tag}>${at ? ` at ${at}` : ''}`;
  });
  return parts.length === 0 ? '' : `in ${parts.join(', inside ')}`;
}

/**
 * @brief Attaches an instantiation chain to a diagnostic raised inside it.
 *
 * The code, location and suggestions are unchanged; only the message gains the
 * chain. An empty chain — an element written directly in a screen — returns the
 * diagnostic as it is, so screen-level messages never change.
 *
 * @param diagnostic A diagnostic located at an element as written.
 * @param chain      The instances that element was expanded through, outermost first.
 */
export function withInstantiation(diagnostic: Diagnostic, chain: readonly InstantiationSite[]): Diagnostic {
  if (chain.length === 0) {
    return diagnostic;
  }
  return { ...diagnostic, message: `${diagnostic.message} (${formatInstantiation(chain)})` };
}
