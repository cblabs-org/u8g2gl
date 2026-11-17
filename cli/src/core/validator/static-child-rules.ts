/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/validator/static-child-rules.ts
 * Purpose: The rules for static children (design_spec §6.5): a manifest's
 *          `<element name access>` with typed `<arg>`s, and the `<column>`
 *          children a screen writes against it. The generator calls the
 *          declared access method once per child with the arguments spelled
 *          from these declarations, so anything wrong here would otherwise be a
 *          C++ compile error in the user's build or a silently wrong table.
 *          Kept apart from the passes that call it because both halves read
 *          the same declaration and must agree on which argument types exist.
 * Description: Two checks. `checkElementDeclarations()` runs per declared
 *              manifest in Pass 1: an `<element>` needs a class to call its
 *              access method on, the method must be a C++ identifier, names are
 *              unique, and each `<arg>` must have a type a literal can be
 *              written as, with `values` exactly when it is an enum.
 *              `checkStaticChildren()` runs per element instance in Pass 4: each
 *              static child is held to its `<arg>`s — every argument written, no
 *              other attribute, each value of its type. A `$prop` value inside
 *              a composite is left for substitution, as every attribute is.
 *
 * Exports:
 * - STATIC_ARG_TYPES:           The `<arg>` types a static child can write
 * - checkElementDeclarations(): Pass 1's `<element>` rules, for one manifest
 * - checkStaticChildren():      Pass 4's rules for one element's static children
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { SourceLocation } from '../schema/source-location.js';
import { CPP_KEYWORDS } from '../schema/cpp-keywords.js';
import { DATA_FIELD_TYPES, type ElementArgDef, type ElementDef, type PropType, type WidgetManifest } from '../schema/widget-manifest.js';
import { staticChildrenOf, type WidgetNode } from '../schema/widget-node.js';
import { ROOT_CLASS_MANIFEST, isDrawingElement } from '../manifest/manifest-registry.js';
import { findClosest } from '../catalogue/edit-distance.js';
import { booleanValueError, enumValueError } from './value-rules.js';

/**
 * The `<arg>` types a static child can write: those whose value is a literal
 * in the screen XML. A font, image, subject or style names a project
 * declaration, and colour is a drawing mode, so none is an argument here. The
 * same four a `<data>` field can carry, so the one list is used.
 */
export const STATIC_ARG_TYPES: readonly PropType[] = DATA_FIELD_TYPES;

/** Every `PropType`, so an arg type outside them is unknown rather than merely refused. */
const PROP_TYPES: readonly PropType[] = ['int', 'bool', 'string', 'enum', 'font', 'image', 'subject', 'style', 'color'];

/** A C++ identifier, as an access method must be. */
const CPP_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** An integer literal, as an `int` argument must be. */
const INTEGER = /^-?\d+$/;

// error
// A located error diagnostic.
function error(
  code: string,
  message: string,
  loc: SourceLocation | undefined,
  text: string,
  suggestions?: readonly string[],
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    ...(text !== '' ? { offendingText: text } : {}),
    ...(suggestions !== undefined && suggestions.length > 0 ? { suggestions } : {}),
  };
}

// valuesOf
// An enum argument's values, trimmed, empty entries dropped.
function valuesOf(arg: ElementArgDef): string[] {
  return (arg.values ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
}

// checkArg
// One `<arg>` of an `<element>`: a type a literal can be written as, and
// `values` exactly when it is an enum.
//   arg   — the argument
//   where — "widget 'w' <element name='e'>", for the message
//   out   — collector
function checkArg(arg: ElementArgDef, where: string, out: Diagnostic[]): void {
  const what = `${where} <arg name="${arg.name}">`;
  if (!PROP_TYPES.includes(arg.type)) {
    out.push(
      error(
        DIAGNOSTIC_CODES.INVALID_ENUM_VALUE,
        `Invalid type '${arg.type}' on ${what}. Expected one of: ${STATIC_ARG_TYPES.join(', ')}.`,
        arg.loc,
        arg.type,
        STATIC_ARG_TYPES,
      ),
    );
    return;
  }
  if (!STATIC_ARG_TYPES.includes(arg.type)) {
    out.push(
      error(
        DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
        `${what} is type="${arg.type}", which a static child cannot write as a literal: an argument is one ` +
          `of ${STATIC_ARG_TYPES.join(', ')} (§6.5).`,
        arg.loc,
        arg.type,
      ),
    );
    return;
  }
  if (arg.type === 'enum' && valuesOf(arg).length === 0) {
    out.push(
      error(
        DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
        `${what} is an enum with no values; list them, e.g. values="left,center,right".`,
        arg.loc,
        arg.name,
      ),
    );
  }
  if (arg.type !== 'enum' && (arg.values !== undefined || arg.emit !== undefined)) {
    out.push(
      error(
        DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
        `'${arg.values !== undefined ? 'values' : 'emit'}' on ${what} applies only to enum arguments; this one is type="${arg.type}".`,
        arg.loc,
        arg.name,
      ),
    );
  }
}

/**
 * @brief Checks every `<element>` one manifest declares (Pass 1).
 *
 * @param manifest A declared manifest, plain or composite.
 * @return The diagnostics, in declaration order.
 */
export function checkElementDeclarations(manifest: WidgetManifest): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  const hasClass =
    manifest.view === undefined &&
    !isDrawingElement(manifest) &&
    (manifest.extends !== undefined || manifest.name === ROOT_CLASS_MANIFEST);
  for (const element of manifest.api.elements) {
    const where = `widget '${manifest.name}' <element name="${element.name}">`;

    // --- Step 1: Only a class has a method to call ---
    if (!hasClass) {
      out.push(
        error(
          DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
          `<element name="${element.name}"> on '${manifest.name}', which has no C++ class of its own: an ` +
            `<element> names a method on the widget's class (§6.5).`,
          element.loc,
          'element',
        ),
      );
      continue;
    }

    // --- Step 2: The element's own attributes ---
    if (element.name !== '') {
      if (seen.has(element.name)) {
        out.push(
          error(
            DIAGNOSTIC_CODES.DUPLICATE_NAME,
            `Widget '${manifest.name}' declares <element name="${element.name}"> twice; element names are unique per widget.`,
            element.loc,
            element.name,
          ),
        );
      }
      seen.add(element.name);
    }
    if (!CPP_IDENTIFIER.test(element.access) || CPP_KEYWORDS.has(element.access)) {
      out.push(
        error(
          DIAGNOSTIC_CODES.INVALID_DATA_DECLARATION,
          `access="${element.access}" on ${where} is not a C++ identifier; it names the method called once per child.`,
          element.loc,
          element.access,
        ),
      );
    }

    // --- Step 3: Each argument, names unique ---
    const args = new Set<string>();
    for (const arg of element.args) {
      if (args.has(arg.name)) {
        out.push(
          error(
            DIAGNOSTIC_CODES.DUPLICATE_NAME,
            `${where} declares <arg name="${arg.name}"> twice; argument names are unique per element.`,
            arg.loc,
            arg.name,
          ),
        );
      }
      args.add(arg.name);
      checkArg(arg, where, out);
    }
  }
  return out;
}

// argValueError
// What is wrong with one written argument value, or undefined. A `$prop` is
// left for composite substitution, as every attribute is.
//   arg   — its declaration
//   value — as written
//   owner — "<column> in <wd_service_list> 'services'", for the message
//   loc   — the value's location
function argValueError(arg: ElementArgDef, value: string, owner: string, loc: SourceLocation | undefined): Diagnostic | undefined {
  if (value.startsWith('$')) return undefined;
  switch (arg.type) {
    case 'int':
      return INTEGER.test(value.trim())
        ? undefined
        : error(
            DIAGNOSTIC_CODES.TYPE_MISMATCH,
            `'${arg.name}="${value}"' on ${owner} must be an integer literal.`,
            loc,
            value,
          );
    case 'bool':
      return booleanValueError(value, `'${arg.name}' on ${owner}`, loc);
    case 'enum':
      return enumValueError(value, valuesOf(arg), arg.name, owner, loc);
    case 'string':
      return arg.maxLen !== undefined && Array.from(value).length > arg.maxLen
        ? error(
            DIAGNOSTIC_CODES.STRING_TOO_LONG,
            `'${arg.name}' on ${owner} is ${Array.from(value).length} characters, over its max_len of ${arg.maxLen}.`,
            loc,
            value,
          )
        : undefined;
    default:
      // Pass 1 refuses any other argument type on the declaration itself.
      return undefined;
  }
}

/**
 * @brief Checks an element's static children against its manifest's
 *        `<element>` declarations (Pass 4).
 *
 * Every declared argument must be written — an `<arg>` has no default, because
 * the access method takes every one — no other attribute may be, and each
 * value must be of its type.
 *
 * @param node     The element instance.
 * @param manifest Its effective manifest; static children are declared by
 *                 the element's own `api.elements`, never inherited.
 * @return The diagnostics, in document order.
 */
export function checkStaticChildren(node: WidgetNode, manifest: { readonly api: { readonly elements: readonly ElementDef[] } }): Diagnostic[] {
  const out: Diagnostic[] = [];
  const name = typeof node.attributes.name === 'string' ? node.attributes.name : '';
  for (const child of staticChildrenOf(node)) {
    const owner = `<${child.tag}> in <${node.tag}>${name !== '' ? ` '${name}'` : ''}`;
    const element = manifest.api.elements.find((candidate) => candidate.name === child.tag);
    if (element === undefined) {
      // Parsed as static from a manifest that no longer declares it: the
      // registry and the parse disagree, so say what the element takes.
      const allowed = manifest.api.elements.map((candidate) => candidate.name);
      out.push(
        error(
          DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
          `<${child.tag}> is not a child <${node.tag}> takes; its manifest declares ` +
            `${allowed.length > 0 ? allowed.map((tag) => `<${tag}>`).join(', ') : 'none'}.`,
          child.loc,
          child.tag,
          allowed,
        ),
      );
      continue;
    }
    const declared = element.args.map((arg) => arg.name);
    for (const attribute of Object.keys(child.attributes)) {
      if (declared.includes(attribute)) continue;
      out.push(
        error(
          DIAGNOSTIC_CODES.UNKNOWN_ATTRIBUTE,
          `Unknown attribute '${attribute}' on ${owner}; it takes ${declared.length > 0 ? declared.join(', ') : 'none'}.`,
          child.attributeNameLocs[attribute] ?? child.loc,
          attribute,
          findClosest(attribute, declared),
        ),
      );
    }
    for (const arg of element.args) {
      const value = child.attributes[arg.name];
      if (value === undefined) {
        out.push(
          error(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            `Missing required attribute '${arg.name}' on ${owner}: ${element.access}() takes every argument.`,
            child.loc,
            arg.name,
          ),
        );
        continue;
      }
      const problem = argValueError(arg, value, owner, child.attributeLocs[arg.name] ?? child.loc);
      if (problem !== undefined) out.push(problem);
    }
  }
  return out;
}
