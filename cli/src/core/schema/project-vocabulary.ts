/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/schema/project-vocabulary.ts
 * Purpose: The vocabulary of the two project files, `u8g2gl.xml` (§5.1) and
 *          `globals.xml` (§5.3), as data: every element and every attribute
 *          the parsers read, with its type, its default, the bus families it
 *          applies to, every spelling the parser accepts, and help in plain
 *          words. Before this table the vocabulary existed only as parser code
 *          and TypeScript interfaces, which nothing else could enumerate.
 *          The designer builds its project-file forms from it, and tests hold
 *          the parsers and those forms to it, so a schema addition cannot
 *          leave the editor behind ("complete by construction", ui_spec §2
 *          principle 8). It is beside STYLE_PROPERTIES because it is the same
 *          pattern, and a `<style>`'s attributes are that table, folded in by
 *          reference.
 * Description: One `VocabularyElement` per element, keyed by a stable id (a
 *              tag alone is not unique: `<int>` is a constant in `<consts>`
 *              and a subject in `<subjects>`). An element names its parent by
 *              id, and whether it repeats. Each attribute is written once, on
 *              the element where a new value is written (the canonical place,
 *              design_spec §5.1); every other place and spelling the parser
 *              also reads is listed as an alternative of it. `<bus>` is such a
 *              place: read, never written new, so it carries no attributes of
 *              its own. Isomorphic and dependency-free apart from the schema's
 *              own tables and the `<convert>` modes.
 *
 * Exports:
 * - VocabularyFile:         The two project files
 * - ReferenceKind:          What a reference attribute names
 * - VocabularyValueType:    An attribute's type
 * - AttributeSpelling:      Another place or name the parser reads an attribute from
 * - VocabularyAttribute:    One attribute
 * - VocabularyElement:      One element
 * - ROTATION_VALUES:        The rotations a target accepts, as written
 * - ROTATION_DEGREES:       Each rotation's angle in degrees
 * - MAX_STRING_LEN_DEFAULT: A string subject's capacity when `max_len` is absent
 * - PROJECT_VOCABULARY:     Every element of both files
 * - vocabularyElement():    One element by id
 * - vocabularyChildren():   An element's child elements, in table order
 * - vocabularyRoots():      The root element of each file
 * - attributeSpellings():   Every (element, name) an attribute is read from, in the parser's order
 */

import { CONVERT_MODES } from '../images/convert-decl.js';
import { DEFAULT_THRESHOLD } from '../images/png-to-xbm.js';
import type { BusFamily } from './display-record.js';
import {
  BITMAP_MODE_VALUES,
  COLOR_VALUES,
  FONT_MODE_VALUES,
  STYLE_PROPERTIES,
  TEXT_ALIGN_VALUES,
  type StyleProperty,
  type StylePropertyKey,
} from './globals.js';

/** The two project files the vocabulary describes. */
export type VocabularyFile = 'u8g2gl.xml' | 'globals.xml';

/**
 * What a reference attribute names: a catalogued display setup (§5.2), a font,
 * subject, style or image the project declares, or a path inside the project.
 */
export type ReferenceKind = 'display-setup' | 'font' | 'subject' | 'style' | 'image' | 'path';

/** An attribute's value type. */
export type VocabularyValueType =
  | { readonly kind: 'string' }
  | { readonly kind: 'int' }
  | { readonly kind: 'bool' }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'reference'; readonly to: ReferenceKind };

/** Another place, or another name, the parser reads an attribute from. */
export interface AttributeSpelling {
  /** The id of the element it is written on. */
  readonly element: string;
  /** The attribute name as written there. */
  readonly name: string;
  /**
   * True where the parser reads this place before the canonical one: a
   * `<bus>` child, when present, supplies every bus value.
   */
  readonly beforeCanonical?: boolean;
  /**
   * The ids of elements whose presence hides this place from the parser: bus
   * values on `<target>` are read only when the target has neither a
   * `<bus>` nor a `<display>`, since the parser reads those instead.
   */
  readonly unlessPresent?: readonly string[];
}

/** One attribute, at its canonical place. */
export interface VocabularyAttribute {
  /** The canonical spelling: what a new value is written as. */
  readonly name: string;
  readonly type: VocabularyValueType;
  /** Whether the parser or validator refuses a document without it. */
  readonly required: boolean;
  /** What applies when it is absent, as it would be written; undefined when nothing does. */
  readonly default?: string;
  /** What it means, in plain words (design_spec §5.1–§5.3, §8, §10, §14). */
  readonly help: string;
  /** For a bus pin or address: the bus families (§5.2) it applies to. */
  readonly busFamilies?: readonly BusFamily[];
  /** For a bus pin: wirings of those families that have no such pin (3-wire SPI has no `dc`). */
  readonly busWiringsWithout?: readonly string[];
  /** Shown, never edited in a form: changing it is a migration, not an edit (§15.4). */
  readonly readOnly?: boolean;
  /**
   * The ids of elements whose presence hides the canonical place from the
   * parser: a `<bus>` child, when written, supplies every bus value, and the
   * display's own are not read.
   */
  readonly unlessPresent?: readonly string[];
  /**
   * Every other place and spelling the parser accepts for it, in the order
   * the parser prefers them after the canonical one. A form reads all of them
   * and writes an edit where the value already is.
   */
  readonly alternatives?: readonly AttributeSpelling[];
}

/** One element of a project file. */
export interface VocabularyElement {
  /** Stable, unique key: `<int>` in `<consts>` and in `<subjects>` differ. */
  readonly id: string;
  readonly file: VocabularyFile;
  readonly tag: string;
  /** What a form calls one: "Target", "String subject". */
  readonly label: string;
  /** The parent element's id; undefined for a file's root. */
  readonly parent: string | undefined;
  /** Other parents the parser also accepts it under, never written new. */
  readonly alternativeParents?: readonly string[];
  /** Whether a parent may hold more than one. */
  readonly repeats: boolean;
  /** For a repeating element: the fewest a project may have, when that is more than none. */
  readonly minimum?: number;
  /** Why it has that minimum, for a refused removal to say. */
  readonly minimumReason?: string;
  /**
   * False for a place the parser reads but a form never writes into new
   * (`<bus>`): its values are alternatives of attributes declared elsewhere.
   */
  readonly canonical: boolean;
  readonly help: string;
  readonly attributes: readonly VocabularyAttribute[];
}

/**
 * The rotations a target accepts as written (§5.1): U8G2's `U8G2_R0`…`R3`, or
 * the angle in degrees. Pass 1 refuses anything else.
 */
export const ROTATION_VALUES: readonly string[] = ['R0', 'R1', 'R2', 'R3', '0', '90', '180', '270'];

/** Each rotation's clockwise angle in degrees, for showing `R1` as 90°. */
export const ROTATION_DEGREES: Readonly<Record<string, number>> = {
  R0: 0,
  R1: 90,
  R2: 180,
  R3: 270,
  '0': 0,
  '90': 90,
  '180': 180,
  '270': 270,
};

/**
 * A string subject's usable characters when `max_len` is absent (§5.3): the
 * runtime's `U8G2GL_MAX_STRING_LEN`, which the generator names rather than
 * copies, so this is the value shown, not one emitted.
 */
export const MAX_STRING_LEN_DEFAULT = '32';

// --- Shared attribute shapes ------------------------------------------------

// nameAttribute
// The `name` every declaration in globals.xml carries: how screens and styles
// refer to it.
//   what — what is named, for the help ("subject", "font")
function nameAttribute(what: string, referredAs: string): VocabularyAttribute {
  return {
    name: 'name',
    type: { kind: 'string' },
    required: true,
    help: `The ${what}'s name, unique in the project. ${referredAs}`,
  };
}

// --- u8g2gl.xml (§5.1) -------------------------------------------------------

// What every bus field's help ends with: the CLI reads these values but
// nothing uses them yet, and saying so is better than a field that implies
// it configures the display.
const BUS_NOT_YET_USED =
  'It is recorded in the project for your firmware: U8G2GL does not construct the display, so `generate` does not use it yet.';

/** The bus attributes, at their canonical place on `<display>`, with every place the parser reads them. */
function busAttribute(
  name: 'cs' | 'dc' | 'reset' | 'address',
  families: readonly BusFamily[],
  help: string,
  wiringsWithout?: readonly string[],
): VocabularyAttribute {
  return {
    name,
    type: { kind: 'string' },
    required: false,
    help: `${help} ${BUS_NOT_YET_USED}`,
    busFamilies: families,
    ...(wiringsWithout !== undefined ? { busWiringsWithout: wiringsWithout } : {}),
    // parse-project.ts reads a `<bus>` child, if written, for all four; else
    // the attributes on `<display>`, if written; else those on `<target>`.
    unlessPresent: ['bus'],
    alternatives: [
      { element: 'bus', name, beforeCanonical: true },
      { element: 'target', name, unlessPresent: ['bus', 'display'] },
    ],
  };
}

const PROJECT_ELEMENTS: readonly VocabularyElement[] = [
  {
    id: 'project',
    file: 'u8g2gl.xml',
    tag: 'u8g2gl',
    label: 'Project',
    parent: undefined,
    repeats: false,
    canonical: true,
    help: "The project file: the project's identity, the displays it targets, and where generated code goes.",
    attributes: [
      {
        name: 'schema',
        type: { kind: 'string' },
        required: true,
        readOnly: true,
        help:
          'The version of the XML vocabulary this project is written in. The CLI refuses a version it does not know and names ' +
          'the changes an older one needs, so it changes only by migrating the project, never by editing this field (§15.4).',
      },
      {
        name: 'name',
        type: { kind: 'string' },
        required: true,
        help: "The project's name, as the designer's title, the Explorer and generated file headers show it.",
      },
      {
        name: 'version',
        type: { kind: 'string' },
        required: true,
        help: "The project's own version, for you to manage. It is recorded, not interpreted.",
      },
    ],
  },
  {
    id: 'targets',
    file: 'u8g2gl.xml',
    tag: 'targets',
    label: 'Targets',
    parent: 'project',
    repeats: false,
    canonical: true,
    help: 'The hardware this project can be built for. The first target is the default.',
    attributes: [],
  },
  {
    id: 'target',
    file: 'u8g2gl.xml',
    tag: 'target',
    label: 'Target',
    parent: 'targets',
    alternativeParents: ['project'],
    repeats: true,
    minimum: 1,
    minimumReason: 'A project needs at least one target: it is what generate builds for and what the designer draws.',
    canonical: true,
    help:
      'One display the project can be built for. Its geometry, controller and bus all come from the display setup, never ' +
      'typed by hand (§5.1, [D-14]). The first target is the default; the designer can show any of them.',
    attributes: [
      {
        name: 'name',
        type: { kind: 'string' },
        required: true,
        help: 'The target\'s name, unique in the project: what `generate --target` and the designer\'s target switcher use.',
      },
      {
        name: 'ram_budget',
        type: { kind: 'int' },
        required: false,
        help:
          "RAM in bytes this target can spare for the UI. The budget report (§18) compares the project's static RAM with it " +
          'and says when it is over. With none, the report gives the figures without a verdict.',
        alternatives: [
          { element: 'target', name: 'ramBudget' },
          { element: 'display', name: 'ram_budget' },
          { element: 'display', name: 'ramBudget' },
        ],
      },
    ],
  },
  {
    id: 'display',
    file: 'u8g2gl.xml',
    tag: 'display',
    label: 'Display',
    parent: 'target',
    repeats: false,
    canonical: true,
    help: 'The display the target drives, and how it is wired.',
    attributes: [
      {
        name: 'setup',
        type: { kind: 'reference', to: 'display-setup' },
        required: true,
        help:
          "The U8G2 full-buffer constructor for the display, such as U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI. It is the single " +
          'source of truth for the target: width, height, controller and bus are derived from U8G2\'s own tables (§5.1, [D-14]).',
        alternatives: [{ element: 'target', name: 'setup' }],
      },
      {
        name: 'rotation',
        type: { kind: 'enum', values: ROTATION_VALUES },
        required: false,
        default: 'R0',
        help: "How the display is mounted: R0 to R3, or 0, 90, 180 or 270 degrees clockwise. U8G2 cannot know it, so it is yours to set.",
        alternatives: [{ element: 'target', name: 'rotation' }],
      },
      busAttribute('cs', ['spi', 'parallel'], 'The chip-select pin, for an SPI or parallel display.'),
      busAttribute('dc', ['spi', 'parallel'], 'The data/command pin, for a 4-wire SPI or parallel display.', ['3w_hardware', '3w_software']),
      busAttribute('reset', ['spi', 'i2c', 'parallel'], "The display's reset pin, for any bus."),
      busAttribute('address', ['i2c'], 'The I²C device address, such as 0x3C. U8G2 cannot know it, so it is yours to set.'),
    ],
  },
  {
    id: 'bus',
    file: 'u8g2gl.xml',
    tag: 'bus',
    label: 'Bus',
    parent: 'target',
    repeats: false,
    canonical: false,
    help: 'An older place for the bus pins and address. It is still read; new values are written on the display.',
    attributes: [],
  },
  {
    id: 'output',
    file: 'u8g2gl.xml',
    tag: 'output',
    label: 'Output',
    parent: 'project',
    repeats: false,
    canonical: true,
    help: 'Where `generate` writes the C++ it produces.',
    attributes: [
      {
        name: 'dir',
        type: { kind: 'reference', to: 'path' },
        required: false,
        default: 'generated',
        help:
          'The directory generated files go to, inside the project. Generation never writes outside it, and removes stale ' +
          'generated files anywhere beneath it (§13.10). The editor target uses this name with _editor after it.',
      },
      {
        name: 'prefix',
        type: { kind: 'string' },
        required: false,
        default: 'ui_',
        help:
          'The prefix of every generated identifier and file name. It is fixed at ui_ (§13.4), so the generated code reads ' +
          'against your XML; any other value is refused.',
      },
    ],
  },
];

// --- globals.xml (§5.3) ------------------------------------------------------

/**
 * Each §10 style property's help, by key. A `Record` over StylePropertyKey, so
 * a property added to STYLE_PROPERTIES without help does not compile.
 */
const STYLE_PROPERTY_HELP: Readonly<Record<StylePropertyKey, string>> = {
  font: 'The font text is drawn in: one declared in Fonts.',
  drawColor: 'The pixel value drawn: 1 sets pixels, 0 clears them, xor inverts what is beneath.',
  invert: 'Inverts the element\'s whole box, as a selection highlight does.',
  padding: 'Space inside the element\'s box, in pixels.',
  border: 'Draws a one-pixel outline around the element.',
  radius: 'Rounds the corners, in pixels. Twice the radius may not exceed the smaller of the element\'s width and height (§10).',
  align: 'Horizontal alignment of text within the element\'s width.',
  fontMode: 'Text background: solid paints the glyph box, transparent only the glyphs.',
  bitmapMode: 'Bitmap background: solid paints the whole image, transparent only its set pixels.',
};

// styleValueType
// A style property's value type, from how the parser reads it (STYLE_PROPERTIES'
// `kind`) and the one list of values each enumerated one takes.
function styleValueType(property: StyleProperty): VocabularyValueType {
  switch (property.key) {
    case 'font':
      return { kind: 'reference', to: 'font' };
    case 'drawColor':
      return { kind: 'enum', values: COLOR_VALUES };
    case 'align':
      return { kind: 'enum', values: TEXT_ALIGN_VALUES };
    case 'fontMode':
      return { kind: 'enum', values: FONT_MODE_VALUES };
    case 'bitmapMode':
      return { kind: 'enum', values: BITMAP_MODE_VALUES };
    default:
      return property.kind === 'bool' ? { kind: 'bool' } : { kind: 'int' };
  }
}

// styleAttribute
// One §10 property as a `<style>` attribute, read through STYLE_PROPERTIES so
// the vocabulary never holds a second copy of the list.
function styleAttribute(property: StyleProperty): VocabularyAttribute {
  return {
    name: property.attribute,
    type: styleValueType(property),
    required: false,
    help: STYLE_PROPERTY_HELP[property.key],
    ...(property.aliases !== undefined && property.aliases.length > 0
      ? { alternatives: property.aliases.map((alias) => ({ element: 'style', name: alias })) }
      : {}),
  };
}

// subjectElement
// One subject type of §8.1: its tag, the type its value takes, and for a
// string its capacity.
function subjectElement(tag: 'int' | 'string' | 'bool' | 'time', label: string, valueType: VocabularyValueType, valueHelp: string): VocabularyElement {
  const attributes: VocabularyAttribute[] = [
    nameAttribute('subject', 'Bindings name it bare (`bind_text="station"`), and the firmware sets it through ui_set_<name>().'),
    {
      name: 'value',
      type: valueType,
      required: false,
      help: `The value the firmware boots with, compiled in. ${valueHelp}`,
      alternatives: [{ element: `subject-${tag}`, name: 'default' }],
    },
  ];
  if (tag === 'string') {
    attributes.push({
      name: 'max_len',
      type: { kind: 'int' },
      required: false,
      default: MAX_STRING_LEN_DEFAULT,
      help:
        'How many characters the string holds, not counting its terminator. The framework owns the buffer and allocates ' +
        'max_len + 1 bytes, which the budget report counts; a longer value is cut short at run time (§8.2).',
      alternatives: [{ element: 'subject-string', name: 'maxLen' }],
    });
  }
  return {
    id: `subject-${tag}`,
    file: 'globals.xml',
    tag,
    label,
    parent: 'subjects',
    repeats: true,
    canonical: true,
    help: `A ${tag} subject (§8.1): a value the firmware sets at run time, which bound elements redraw from.`,
    attributes,
  };
}

// constElement
// One constant type of §7.2.
function constElement(tag: 'int' | 'string', label: string, valueType: VocabularyValueType): VocabularyElement {
  return {
    id: `const-${tag}`,
    file: 'globals.xml',
    tag,
    label,
    parent: 'consts',
    repeats: true,
    canonical: true,
    help: `A ${tag} constant (§7.2), resolved at build time. Nothing of it ships to the device.`,
    attributes: [
      nameAttribute('constant', 'Any attribute refers to it as #name.'),
      { name: 'value', type: valueType, required: true, help: 'The value #name stands for wherever it is written.' },
    ],
  };
}

// groupElement
// A container directly under `<globals>`.
function groupElement(tag: string, label: string, help: string): VocabularyElement {
  return { id: tag, file: 'globals.xml', tag, label, parent: 'globals', repeats: false, canonical: true, help, attributes: [] };
}

const GLOBALS_ELEMENTS: readonly VocabularyElement[] = [
  {
    id: 'globals',
    file: 'globals.xml',
    tag: 'globals',
    label: 'Globals',
    parent: undefined,
    repeats: false,
    canonical: true,
    help: 'What every screen shares: subjects, fonts, images, styles and constants.',
    attributes: [],
  },
  groupElement('subjects', 'Subjects', 'The values the firmware sets at run time (§8). Each costs RAM, which the budget counts.'),
  subjectElement('int', 'Int subject', { kind: 'int' }, 'A 32-bit signed integer.'),
  subjectElement('string', 'String subject', { kind: 'string' }, 'It must fit max_len.'),
  subjectElement('bool', 'Bool subject', { kind: 'bool' }, 'true or false.'),
  subjectElement('time', 'Time subject', { kind: 'int' }, 'Unix seconds; a clock draws it.'),
  groupElement('fonts', 'Fonts', 'The fonts styles and elements may use (§14.1).'),
  {
    id: 'font-builtin',
    file: 'globals.xml',
    tag: 'builtin',
    label: 'Built-in font',
    parent: 'fonts',
    repeats: true,
    canonical: true,
    help: "One of U8G2's own fonts, linked by name with no compilation step: the default way to get a font (§14.1).",
    attributes: [
      {
        name: 'name',
        type: { kind: 'string' },
        required: true,
        help: "U8G2's name for the font, such as u8g2_font_6x10_mr. Styles and elements refer to it by this name.",
      },
    ],
  },
  {
    id: 'font-bdf',
    file: 'globals.xml',
    tag: 'bdf',
    label: 'BDF font',
    parent: 'fonts',
    repeats: true,
    canonical: true,
    help: "A font of your own, compiled from a BDF file by U8G2's bdfconv (§14.1).",
    attributes: [
      nameAttribute('font', 'Styles and elements refer to it by this name.'),
      {
        name: 'src',
        type: { kind: 'reference', to: 'path' },
        required: true,
        help: 'The BDF file, relative to the project. Any licence file beside it is noted in the generated header.',
      },
      {
        name: 'range',
        type: { kind: 'string' },
        required: false,
        help:
          'Which codepoints to compile: single codepoints and a-b ranges, hexadecimal or decimal, separated by commas ' +
          '(0x20-0x7F,0xE000-0xE01F). Without it every glyph in the file is compiled, and the budget shows the cost.',
      },
    ],
  },
  groupElement('images', 'Images', 'The bitmaps elements may draw (§14.2).'),
  {
    id: 'image-xbm',
    file: 'globals.xml',
    tag: 'xbm',
    label: 'XBM image',
    parent: 'images',
    repeats: true,
    canonical: true,
    help: 'A 1-bit XBM bitmap, used as it is (§14.2).',
    attributes: [
      nameAttribute('image', 'Elements refer to it by this name.'),
      { name: 'src', type: { kind: 'reference', to: 'path' }, required: true, help: 'The .xbm file, relative to the project.' },
    ],
  },
  {
    id: 'image-convert',
    file: 'globals.xml',
    tag: 'convert',
    label: 'Converted image',
    parent: 'images',
    repeats: true,
    canonical: true,
    help: 'A PNG converted to 1-bit at build time, by threshold or by dithering (§14.2).',
    attributes: [
      nameAttribute('image', 'Elements refer to it by this name.'),
      { name: 'src', type: { kind: 'reference', to: 'path' }, required: true, help: 'The PNG file, relative to the project.' },
      {
        name: 'width',
        type: { kind: 'int' },
        required: true,
        help: 'The image\'s width in pixels. It declares what the file is; a PNG of another size is refused, never resampled.',
      },
      {
        name: 'height',
        type: { kind: 'int' },
        required: true,
        help: 'The image\'s height in pixels. It declares what the file is; a PNG of another size is refused, never resampled.',
      },
      {
        name: 'mode',
        type: { kind: 'enum', values: CONVERT_MODES },
        required: false,
        default: 'threshold',
        help: 'threshold sets every pixel darker than the threshold, which suits icons; dither spreads the error, for photographs.',
      },
      {
        name: 'threshold',
        type: { kind: 'int' },
        required: false,
        default: String(DEFAULT_THRESHOLD),
        help: 'For threshold mode: a pixel whose luminance is below this, 0 to 255, is drawn.',
      },
    ],
  },
  groupElement('styles', 'Styles', 'Named sets of the nine style properties, applied with <style name> (§10).'),
  {
    id: 'style',
    file: 'globals.xml',
    tag: 'style',
    label: 'Style',
    parent: 'styles',
    repeats: true,
    canonical: true,
    help: "A named style. An element's own attributes win over it (§10).",
    attributes: [
      nameAttribute('style', 'Elements apply it with a <style name> child.'),
      ...STYLE_PROPERTIES.map(styleAttribute),
    ],
  },
  groupElement('consts', 'Consts', 'Named values resolved at build time (§7.2).'),
  constElement('int', 'Int constant', { kind: 'int' }),
  constElement('string', 'String constant', { kind: 'string' }),
];

/**
 * Every element of `u8g2gl.xml` and `globals.xml`, each file's root first and
 * each child after its parent, in the order a form shows them.
 */
export const PROJECT_VOCABULARY: readonly VocabularyElement[] = [...PROJECT_ELEMENTS, ...GLOBALS_ELEMENTS];

/** Each element by id, built once. */
const BY_ID: ReadonlyMap<string, VocabularyElement> = new Map(PROJECT_VOCABULARY.map((element) => [element.id, element]));

/**
 * @brief One element of the vocabulary by id.
 *
 * @param id An element id, such as `target` or `subject-string`.
 * @return The element, or undefined for an id the vocabulary does not have.
 */
export function vocabularyElement(id: string): VocabularyElement | undefined {
  return BY_ID.get(id);
}

/**
 * @brief An element's children, in vocabulary order: those it is the
 *        canonical parent of, then those it also accepts (`<target>` directly
 *        under `<u8g2gl>`).
 */
export function vocabularyChildren(id: string): readonly VocabularyElement[] {
  return [
    ...PROJECT_VOCABULARY.filter((element) => element.parent === id),
    ...PROJECT_VOCABULARY.filter((element) => element.alternativeParents?.includes(id) === true),
  ];
}

/** @brief The root element of a project file. */
export function vocabularyRoots(): ReadonlyMap<VocabularyFile, VocabularyElement> {
  return new Map(PROJECT_VOCABULARY.filter((element) => element.parent === undefined).map((element) => [element.file, element]));
}

/**
 * @brief Every place an attribute is read from, in the order the parser
 *        prefers them: the canonical one first unless an alternative is read
 *        before it (`<bus>`), then the rest.
 *
 * @param element   The element the attribute is declared on.
 * @param attribute One of its attributes.
 */
export function attributeSpellings(element: VocabularyElement, attribute: VocabularyAttribute): readonly AttributeSpelling[] {
  const alternatives = attribute.alternatives ?? [];
  return [
    ...alternatives.filter((spelling) => spelling.beforeCanonical === true),
    { element: element.id, name: attribute.name, ...(attribute.unlessPresent !== undefined ? { unlessPresent: attribute.unlessPresent } : {}) },
    ...alternatives.filter((spelling) => spelling.beforeCanonical !== true),
  ];
}
