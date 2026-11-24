/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/generator/emit/facades.ts
 * Purpose: §9.2's generated collection API. Firmware fills a collection
 *          through a small generated object per `<data>` per instance —
 *          `ui_departures_services_rows.begin()`, `.add_row(…)`, `.commit()` —
 *          rather than through the widget's own methods, so the application
 *          stays out of a widget's API and each row's arguments are checked by
 *          the compiler against the `<field>`s the manifest declares. Each call
 *          forwards to the widget's own `begin()`, declared access method and
 *          `commit()`, so the facade adds no behaviour and no RAM: its methods
 *          are `const` and the object is a `const` empty struct.
 *
 *          `ui.hpp` declares a facade (`facadeDeclaration()`) and the screen
 *          unit that owns the object defines it (`facadeDefinition()`); both
 *          spell its signatures from the one model here, so a declaration and
 *          its definition cannot disagree. The parameter types are E-3a's fill
 *          thunk's (`field-types.ts`): one convention, not two.
 *
 * Description: `add_row()` takes the fields in declaration order: an `int` as
 *              `int32_t`, a `bool` as `bool`, a `string` or `enum` as
 *              `const char*`, and a repeated field as a pointer and a count. A
 *              data with a repeated field also gets an overload taking an
 *              `std::initializer_list<const char*>` for each, which forwards
 *              to the pointer-and-count one. `capacity()` is the instance's
 *              declared capacity, a constant. Past it the widget refuses the
 *              row and `add_row()` returns that `false` (`u8g2gl_row_added()`).
 *
 * Exports:
 * - Facade:              One collection's facade, understood but not yet spelled
 * - facadeOf():          The facade of one sized collection
 * - FACADE_HEADERS:      What ui.hpp includes for any facade's signatures
 * - facadeDeclaration(): Its type and object, as ui.hpp declares them
 * - facadeDefinition():  Its object and methods, as the screen unit defines them
 */

import { collectionFacadeIdentifiers, type CollectionStorage } from '../../realise/index.js';
import { objectIdentifier } from '../../resolver/mangle.js';
import { FIELD_ARGUMENT_TYPES, REPEATED_ARGUMENT_TYPES } from './field-types.js';

/** One parameter of `add_row()`. */
interface Parameter {
  readonly type: string;
  readonly name: string;
}

/** One collection's facade, understood but not yet spelled. */
export interface Facade {
  /** The object, `ui_<screen>_<element>_<data>`. */
  readonly object: string;
  /** Its type, the same with `_t`. */
  readonly type: string;
  /** The widget object it forwards to, `ui_obj_<element>`. */
  readonly target: string;
  /** The widget's access method, e.g. `add_row`. */
  readonly access: string;
  /** The instance's declared capacity. */
  readonly capacity: number;
  /** `add_row()`'s parameters, fields in declaration order. */
  readonly parameters: readonly Parameter[];
  /** The repeated fields, by name, in declaration order; empty when there are none. */
  readonly repeated: readonly string[];
  /** The block, for the comment that names it. */
  readonly storage: CollectionStorage;
}

/**
 * @brief The facade of one sized collection (§9.2).
 *
 * @param storage The block, as the capacities sized it.
 * @return The facade.
 * @throws Error for a field type no row carries — Pass 1 refuses such a manifest.
 */
export function facadeOf(storage: CollectionStorage): Facade {
  const names = collectionFacadeIdentifiers(storage.screen, storage.element.identifier, storage.data.name);
  const parameters: Parameter[] = [];
  const repeated: string[] = [];
  for (const field of storage.data.fields) {
    if (field.repeat !== undefined) {
      const [texts, count] = REPEATED_ARGUMENT_TYPES;
      parameters.push({ type: texts, name: field.name }, { type: count, name: `${field.name}_count` });
      repeated.push(field.name);
      continue;
    }
    const type = FIELD_ARGUMENT_TYPES[field.type];
    if (type === undefined) {
      throw new Error(`<field name="${field.name}"> has type '${field.type}'; Pass 1 refuses it.`);
    }
    parameters.push({ type, name: field.name });
  }
  return {
    object: names.object,
    type: names.type,
    target: objectIdentifier(storage.element.identifier),
    access: storage.data.access,
    capacity: storage.capacity,
    parameters,
    repeated,
    storage,
  };
}

/** What `ui.hpp` includes once any facade is declared: `size_t` and `std::initializer_list`. */
export const FACADE_HEADERS: readonly string[] = ['#include <cstddef>', '#include <initializer_list>'];

// listParameters
// The initializer_list overload's parameters: each repeated field's pair
// becomes one list, every other field stays as it is.
//   facade — the facade
function listParameters(facade: Facade): string {
  const out: string[] = [];
  for (const parameter of facade.parameters) {
    if (facade.repeated.includes(parameter.name)) {
      out.push(`std::initializer_list<const char*> ${parameter.name}`);
    } else if (!facade.repeated.some((name) => parameter.name === `${name}_count`)) {
      out.push(`${parameter.type} ${parameter.name}`);
    }
  }
  return out.join(', ');
}

// spelled
// A parameter list as C++.
function spelled(parameters: readonly Parameter[]): string {
  return parameters.map((parameter) => `${parameter.type} ${parameter.name}`).join(', ');
}

/**
 * @brief The facade's type and object, as `ui.hpp` declares them.
 *
 * @param facade The facade.
 * @return The lines, unindented.
 */
export function facadeDeclaration(facade: Facade): string[] {
  const { storage } = facade;
  return [
    `// ${storage.element.identifier} <data name="${storage.data.name}">: begin(), add_row() per row (the widget's ${facade.access}()), commit() (§9.2)`,
    `struct ${facade.type} {`,
    '    /** @brief Start a batch: the widget\'s begin(). */',
    '    void begin() const;',
    `    /** @brief Stage one row through ${facade.access}(); false past capacity(), the widget's own refusal. */`,
    `    bool add_row(${spelled(facade.parameters)}) const;`,
    ...(facade.repeated.length > 0
      ? ['    /** @brief The same row, each repeated field as a list. */', `    bool add_row(${listParameters(facade)}) const;`]
      : []),
    '    /** @brief Publish the batch: the widget\'s commit(). */',
    '    void commit() const;',
    '    /** @brief Rows this instance holds, as its XML declares them. */',
    `    size_t capacity() const { return ${facade.capacity}; }`,
    '};',
    `extern const ${facade.type} ${facade.object};`,
  ];
}

/**
 * @brief The facade's object and methods, as the screen unit that owns the
 *        widget defines them.
 *
 * @param facade The facade.
 * @return The lines, unindented.
 */
export function facadeDefinition(facade: Facade): string[] {
  const forwarded = facade.parameters.map((parameter) => parameter.name).join(', ');
  const lines = [
    `const ${facade.type} ${facade.object}{};`,
    `void ${facade.type}::begin() const { ${facade.target}.begin(); }`,
    `bool ${facade.type}::add_row(${spelled(facade.parameters)}) const {`,
    `    return u8g2gl_row_added([&] { return ${facade.target}.${facade.access}(${forwarded}); });`,
    '}',
  ];
  if (facade.repeated.length > 0) {
    const fromLists = facade.parameters
      .map((parameter) => {
        const list = facade.repeated.find((name) => parameter.name === name || parameter.name === `${name}_count`);
        if (list === undefined) return parameter.name;
        return parameter.name === list ? `${list}.begin()` : `${list}.size()`;
      })
      .join(', ');
    lines.push(`bool ${facade.type}::add_row(${listParameters(facade)}) const {`, `    return add_row(${fromLists});`, '}');
  }
  lines.push(`void ${facade.type}::commit() const { ${facade.target}.commit(); }`);
  return lines;
}
