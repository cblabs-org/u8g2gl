/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/resolver/expand.ts
 * Purpose: §13.6 steps 1–3: a screen's tree made into one holding only concrete
 *          elements. A composite's `<view>` is a template ([D-18]); until it is
 *          copied into each instance with the instance's arguments substituted,
 *          nothing downstream can know what a `$title_subject` binds, where
 *          `right="52"` puts an element, or what its mangled name is. Doing it
 *          once, here, is what lets the type checker, the geometry check and —
 *          from WO8 — realisation and flattening all see the same tree.
 * Description: For each composite instance:
 *              1. Bind the instance's attributes to the composite's declared
 *                 `<api>` props: the supplied value, else the declared default; a
 *                 missing required prop is an error. A `type="subject"` argument
 *                 must name a declared subject, reported at the instantiation
 *                 site (§6.4).
 *              2. Copy the `<view>` with every `$prop` substituted. A whole-value
 *                 `$prop` takes the argument as written, of any type; inside an
 *                 expression only an `int` argument is substituted, parenthesised
 *                 so precedence is kept. A `$name` naming no declared prop is an
 *                 error at the reference.
 *              3. Give each copied element an identifier prefixed with the
 *                 instance's (§13.4, mangle.ts), recursively for nested composites.
 *              The copy becomes the instance node's element children, ahead of
 *              any elements written inside the instance itself, so resolve.ts
 *              measures `#parent_*` and anchors inside the instance against the
 *              instance's resolved geometry with no change to the resolver
 *              ([D-20], §13.6 step 4). Every expanded element keeps its source
 *              node — and so its original location — and the instantiation chain
 *              (provenance.ts). Names are never synthesised ([U-1]). A composite
 *              already on the chain is not expanded again: that cycle is Pass 2's
 *              CIRCULAR_REFERENCE. Deterministic: document order throughout.
 *              Isomorphic; never throws for user input.
 *
 *              PR-04 WO7b: every whole-value substitution is recorded on its
 *              element, so the passes that check a value written directly (fonts,
 *              images, styles, enums, `hcenter`) can check a substituted one the
 *              same way; each argument says whether it is fixed by the template
 *              (a default, or a literal written inside another `<view>`), so a
 *              defect in it is reported once rather than once per instance.
 *              `hidden="$p"` substitutes and then takes the parser's boolean rule.
 *              A `$name` inside longer text that cannot be substituted is an error
 *              (interim, until the Chief Architect rules on interpolation).
 *
 * Exports:
 * - PropArgument:      One prop bound on one composite instance
 * - Substitution:      One value whose whole text was replaced by an argument
 * - STYLE_CHILD_VALUE: The `attribute` a `<style name="$s">` substitution records
 * - ExpandedElement:   An element after expansion, with identifier and provenance
 * - ExpandedScreen:    A screen's expanded top-level elements
 * - ExpansionInput, ExpansionResult
 * - expandScreens():   Expand every screen's composite instances
 * - walkExpanded():    Visit expanded elements depth-first in document order
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { Globals } from '../schema/globals.js';
import type { Screen } from '../schema/screen.js';
import type { SourceLocation } from '../schema/source-location.js';
import type { PropDef } from '../schema/widget-manifest.js';
import type { BindingChild, EventChild, StyleChild, WidgetNode, WidgetNodeChild } from '../schema/widget-node.js';
import type { ManifestRegistry } from '../manifest/manifest-registry.js';
import { findClosest } from '../catalogue/edit-distance.js';
import { hiddenAttributeValue } from '../parser/parse-widget-tree.js';
import { childIdentifier } from './mangle.js';
import { withInstantiation, type InstantiationSite } from './provenance.js';

/** One `<api>` prop bound on one composite instance (§13.6 step 1). */
export interface PropArgument {
  /** The prop's name. */
  readonly prop: string;
  /** The prop's declared type. */
  readonly type: PropDef['type'];
  /** The bound value, as written (after any enclosing instance's substitution). */
  readonly value: string;
  /** Supplied on the instance, or the prop's declared default. */
  readonly from: 'argument' | 'default';
  /** The instance attribute for an argument; the instance element for a default. */
  readonly loc?: SourceLocation;
  /**
   * Whether this value is the same in every instantiation of the enclosing
   * template: the prop's declared default, or a literal (or a fixed argument
   * passed through) written on an instance inside another composite's `<view>`.
   * A defect in a fixed value is the template's, so it is reported once, with
   * no instantiation chain; an unfixed one belongs to its instance.
   */
  readonly fixed: boolean;
}

/** One value whose whole text was a `$prop` reference, replaced by an argument. */
export interface Substitution {
  /**
   * The attribute as the node spells it: `font`, `style_font`, `hcenter`. For a
   * `<style>` child it is `'<style> name'`, and {@link styleChild} carries the
   * child itself — the value is not an attribute of the element.
   */
  readonly attribute: string;
  /** The argument that replaced it. */
  readonly argument: PropArgument;
  /**
   * The `<style name="$s">` child this substitution was made on, when it was
   * made on one rather than on an attribute (PR-04 WO7b 6). Pass 2 checks the
   * substituted style name through it; the passes that read attributes skip
   * any substitution carrying it.
   */
  readonly styleChild?: StyleChild;
}

/** The attribute name recorded for a `<style name="$s">` child's substitution. */
export const STYLE_CHILD_VALUE = '<style> name';

/** One element after composite expansion. */
export interface ExpandedElement {
  /**
   * The element with `$prop`s substituted. For a composite instance its element
   * children are the expanded `<view>` followed by any elements written inside
   * the instance; directives (bindings, events, styles) come first, as written.
   * Its element children are exactly `children.map((c) => c.node)`.
   */
  readonly node: WidgetNode;
  /** The element as written, unchanged — its `loc` is in the file it is written in. */
  readonly source: WidgetNode;
  /** The `name` as written; empty when the element has none. */
  readonly name: string;
  /**
   * The mangled name (§13.4): `name`, prefixed by each enclosing instance.
   * Empty without a name. It is **not** the emitted C++ variable — emission
   * prefixes it with `ui_obj_` (`emit/screen.ts`'s `objectIdentifier()`).
   */
  readonly identifier: string;
  /** Composite instances this element was expanded through, outermost first; empty at screen level. */
  readonly instantiation: readonly InstantiationSite[];
  /** Present if and only if this element is an expanded composite instance: its bound props, in declaration order. */
  readonly arguments?: readonly PropArgument[];
  /** Present when any of this element's attributes was a whole `$prop` reference that was substituted, in attribute order. */
  readonly substitutions?: readonly Substitution[];
  /** Nested elements, in the order of `node`'s element children. */
  readonly children: readonly ExpandedElement[];
}

/** A screen after expansion. */
export interface ExpandedScreen {
  readonly screen: Screen;
  /** Top-level elements, in document order. */
  readonly elements: readonly ExpandedElement[];
}

/** Everything {@link expandScreens} needs. */
export interface ExpansionInput {
  /** Declared subjects, for `type="subject"` arguments. */
  readonly globals: Globals;
  readonly screens: readonly Screen[];
  /** Effective manifests: which tags are composites, and their declared props. */
  readonly manifests: ManifestRegistry;
}

/** Expanded screens and the diagnostics expansion raised. */
export interface ExpansionResult {
  /** Screens in input order. */
  readonly screens: readonly ExpandedScreen[];
  /**
   * Missing required props (`U8G2GL_MISSING_REQUIRED`), arguments that are not
   * declared subjects (`U8G2GL_UNKNOWN_SUBJECT`, at the instantiation site) and
   * `$name`s naming no prop (`U8G2GL_UNKNOWN_PROP`, at the reference). Each is
   * reported once however many instances raise it identically.
   */
  readonly diagnostics: readonly Diagnostic[];
}

/** An attribute value that is exactly one prop reference. */
const PROP_REFERENCE = /^\$([A-Za-z_][A-Za-z0-9_]*)$/;
/** A prop reference anywhere in a value — the evaluator's `$` placeholder grammar. */
const EMBEDDED_PROP_REFERENCE = /\$([A-Za-z_][A-Za-z0-9_]*)/g;

/** The props, arguments and instances in force while copying one template. */
interface TemplateScope {
  /** The composite's tag. */
  readonly composite: string;
  /** Its declared props — the template parameters, not the container's inherited attributes. */
  readonly props: readonly PropDef[];
  /** Bound arguments by prop name (lookup only; output never iterates it). */
  readonly args: ReadonlyMap<string, PropArgument>;
  /** Instances down to and including this one, outermost first. */
  readonly chain: readonly InstantiationSite[];
}

/** Shared across one expansion. */
interface ExpansionState {
  readonly manifests: ManifestRegistry;
  /** Declared subject names, in declaration order — the suggestion pool. */
  readonly subjectNames: readonly string[];
  /** The same names, for lookup only. */
  readonly subjects: ReadonlySet<string>;
  readonly diagnostics: Diagnostic[];
  /** Keys of diagnostics already reported (lookup only). */
  readonly reported: Set<string>;
}

/** Where one value being substituted is written. */
interface ValueSite {
  /** Prose naming the value: `'width' on <u8g2gl_label> 'location'`. */
  readonly description: string;
  readonly loc?: SourceLocation;
  /** Whether the value is read as a subject name — a `bind_*` attribute or a directive's `subject`. */
  readonly subjectPosition: boolean;
}

// report
// Records a diagnostic once. An element written once in a template is expanded
// once per instance, and a defect in its own text would otherwise be reported
// once per instance at the same place with the same words.
function report(state: ExpansionState, diagnostic: Diagnostic): void {
  const key = `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}:${diagnostic.code}:${diagnostic.message}`;
  if (!state.reported.has(key)) {
    state.reported.add(key);
    state.diagnostics.push(diagnostic);
  }
}

function createExpansionDiagnostic(
  code: string,
  message: string,
  loc: SourceLocation | undefined,
  offendingText: string,
  suggestions: readonly string[] = [],
): Diagnostic {
  return {
    code,
    severity: 'error',
    file: loc?.file ?? '',
    line: loc?.line ?? 1,
    column: loc?.column ?? 1,
    message,
    offendingText,
    ...(suggestions.length > 0 ? { suggestions } : {}),
  };
}

function isElement(child: WidgetNodeChild): child is WidgetNode {
  return 'tag' in child && typeof child.tag === 'string';
}

// elementLabel
// "<u8g2gl_label> 'location'", or "<u8g2gl_label>" when unnamed.
function elementLabel(node: WidgetNode): string {
  const name = node.attributes.name;
  return typeof name === 'string' && name !== '' ? `<${node.tag}> '${name}'` : `<${node.tag}>`;
}

// isSubjectAttribute
// Whether an attribute's value is a subject name: the same test Pass 2 uses for
// subject references (validate-references.ts, 2e).
function isSubjectAttribute(attribute: string): boolean {
  return attribute.startsWith('bind_') && !attribute.endsWith('_fmt');
}

// checkSubjectArgument
// §6.4: a prop used as a subject name must be given a declared subject, and the
// error belongs at the instantiation site — where the author chose the name —
// not inside the template, which is correct for every other caller.
//   argument — the bound argument
//   scope    — the instance's template scope; its last site is the instance
//   state    — expansion state
function checkSubjectArgument(argument: PropArgument, scope: TemplateScope, state: ExpansionState): void {
  if (argument.value.startsWith('$') || state.subjects.has(argument.value)) {
    return; // Still a reference into an enclosing template, or a real subject.
  }
  const instance = scope.chain[scope.chain.length - 1];
  const how = argument.from === 'default' ? 'defaults to' : 'is given';
  report(
    state,
    withInstantiation(
      createExpansionDiagnostic(
        DIAGNOSTIC_CODES.UNKNOWN_SUBJECT,
        `Prop '${argument.prop}' of <${scope.composite}> '${instance?.name ?? ''}' ${how} '${argument.value}' ` +
          `as a subject name, but globals.xml declares no subject '${argument.value}' (§6.4).`,
        argument.loc,
        argument.value,
        findClosest(argument.value, state.subjectNames),
      ),
      scope.chain.slice(0, -1),
    ),
  );
}

// reportUnknownProp
// A `$name` the composite does not declare. Located at the reference in the
// template and reported once: the defect is in the template's own text.
function reportUnknownProp(name: string, site: ValueSite, scope: TemplateScope, state: ExpansionState): void {
  report(
    state,
    createExpansionDiagnostic(
      DIAGNOSTIC_CODES.UNKNOWN_PROP,
      `'$${name}' in ${site.description} names no prop that composite <${scope.composite}> declares in its <api>.`,
      site.loc,
      `$${name}`,
      findClosest(
        name,
        scope.props.map((prop) => prop.name),
      ).map((candidate) => `$${candidate}`),
    ),
  );
}

// substituteText
// Substitutes the `$prop` references in one value (§13.6 step 2).
//   text  — the value as written in the template
//   site  — where it is written
//   scope — the template scope
//   state — expansion state
// Returns the substituted value, or undefined when the whole value is a
// reference to an optional prop that was given no value — the attribute is then
// simply not set, exactly as if the template had not written it.
function substituteText(text: string, site: ValueSite, scope: TemplateScope, state: ExpansionState): string | undefined {
  // --- Step 1: A whole-value reference takes the argument as written, whatever its type ---
  const whole = PROP_REFERENCE.exec(text);
  if (whole) {
    const name = whole[1] ?? '';
    const declared = scope.props.find((prop) => prop.name === name);
    if (declared === undefined) {
      reportUnknownProp(name, site, scope, state);
      return text;
    }
    const argument = scope.args.get(name);
    if (argument === undefined) {
      return undefined;
    }
    // A subject prop was checked when it was bound; any other prop reaching a
    // subject position is checked here, still at the instantiation site.
    if (site.subjectPosition && declared.type !== 'subject') {
      checkSubjectArgument(argument, scope, state);
    }
    return argument.value;
  }

  // --- Step 2: References inside an expression — only an int argument has a meaning there ---
  // Parenthesised, so `$gap * 2` with gap="#pad + 1" keeps its precedence. A
  // reference to a non-int prop, or to an int prop with no value, cannot be
  // substituted and would reach output literally, so it is an error (WO7b).
  if (!text.includes('$')) {
    return text;
  }
  return text.replace(EMBEDDED_PROP_REFERENCE, (match: string, name: string) => {
    const declared = scope.props.find((prop) => prop.name === name);
    if (declared === undefined) {
      reportUnknownProp(name, site, scope, state);
      return match;
    }
    const argument = scope.args.get(name);
    if (argument !== undefined && declared.type === 'int') {
      return `(${argument.value})`;
    }
    reportUnsubstitutedProp(declared, text, site, scope, state);
    return match;
  });
}

// reportUnsubstitutedProp
// A `$name` inside longer text that expansion cannot substitute (PR-04 WO7 F9,
// interim until the Chief Architect rules). A non-int prop spliced into text is
// a defect in the template's own text, reported once with no chain; an int prop
// that this instance gave no value is the instance's, and names it.
//   prop  — the declared prop referenced
//   text  — the whole value as written
//   site  — where it is written
//   scope — the template scope
//   state — expansion state
function reportUnsubstitutedProp(
  prop: PropDef,
  text: string,
  site: ValueSite,
  scope: TemplateScope,
  state: ExpansionState,
): void {
  const reference = `$${prop.name}`;
  if (prop.type !== 'int') {
    report(
      state,
      createExpansionDiagnostic(
        DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP,
        `'${reference}' in ${site.description} sits inside the longer value '${text}', and a ` +
          `<${prop.type}> prop is substituted only as a whole value, so '${reference}' would reach ` +
          `output literally. Interpolating a prop into text is not supported yet (§13.6).`,
        site.loc,
        reference,
      ),
    );
    return;
  }
  report(
    state,
    withInstantiation(
      createExpansionDiagnostic(
        DIAGNOSTIC_CODES.UNSUBSTITUTED_PROP,
        `'${reference}' in ${site.description} has no value to substitute into '${text}': int prop ` +
          `'${prop.name}' of <${scope.composite}> was not given one and declares no default.`,
        site.loc,
        reference,
      ),
      scope.chain,
    ),
  );
}

// substituteDirective
// A binding, event or style child with its values substituted. Values that are
// not attributes cannot be "left unset", so an unbound reference stays as written.
// A `<style>` child whose whole `name` was a reference records a substitution,
// so Pass 2 can check the style it resolved to (PR-04 WO7b 6).
//   substitutions — appended to; the caller carries them onto the element
function substituteDirective(
  child: BindingChild | EventChild | StyleChild,
  owner: WidgetNode,
  scope: TemplateScope,
  state: ExpansionState,
  substitutions: Substitution[],
): WidgetNodeChild {
  const description = `<${child.kind === 'style' ? 'style' : child.type}> on ${elementLabel(owner)}`;
  const loc = child.loc ?? owner.loc;
  const keep = (text: string, subjectPosition = false): string =>
    substituteText(text, { description, ...(loc ? { loc } : {}), subjectPosition }, scope, state) ?? text;

  switch (child.kind) {
    case 'binding':
      return {
        ...child,
        subject: keep(child.subject, true),
        value: child.value === undefined ? undefined : keep(child.value),
        refValue: child.refValue === undefined ? undefined : keep(child.refValue),
        flag: child.flag === undefined ? undefined : keep(child.flag),
      };
    case 'event':
      return {
        ...child,
        screen: child.screen === undefined ? undefined : keep(child.screen),
        callback: child.callback === undefined ? undefined : keep(child.callback),
      };
    case 'style': {
      const substituted: StyleChild = { ...child, name: keep(child.name) };
      const argument = wholeValueArgument(child.name, scope);
      if (argument !== undefined) {
        substitutions.push({ attribute: STYLE_CHILD_VALUE, argument, styleChild: substituted });
      }
      return substituted;
    }
  }
}

/** A node's own values after substitution. */
interface SubstitutedValues {
  readonly attributes: WidgetNode['attributes'];
  readonly styleOverrides: Readonly<Record<string, string>>;
  /** Binding, event and style children, in written order. */
  readonly directives: readonly WidgetNodeChild[];
  /** Whole-value substitutions made, in attribute order. */
  readonly substitutions: readonly Substitution[];
}

// wholeValueArgument
// The argument a whole-value `$prop` reference is replaced by, or undefined when
// the value is not exactly one reference to a bound prop.
function wholeValueArgument(text: string, scope: TemplateScope): PropArgument | undefined {
  const whole = PROP_REFERENCE.exec(text);
  return whole ? scope.args.get(whole[1] ?? '') : undefined;
}

// substituteNode
// A template node's attributes, style overrides and directives with `$prop`s
// substituted. `name` is identity and is never substituted: a name comes from
// the author, not from an argument ([U-1]). `hidden` takes the parser's boolean
// rule once its placeholder is substituted (PR-04 WO7 F6).
function substituteNode(written: WidgetNode, scope: TemplateScope, state: ExpansionState): SubstitutedValues {
  const label = elementLabel(written);
  const substitutions: Substitution[] = [];

  // --- Step 1: Attributes ---
  const attributes: Record<string, string | boolean | undefined> = {};
  for (const [attribute, value] of Object.entries(written.attributes)) {
    if (typeof value !== 'string' || attribute === 'name') {
      attributes[attribute] = value;
      continue;
    }
    const loc = written.attributeLocs?.[attribute] ?? written.loc;
    const substituted = substituteText(
      value,
      { description: `'${attribute}' on ${label}`, ...(loc ? { loc } : {}), subjectPosition: isSubjectAttribute(attribute) },
      scope,
      state,
    );
    if (substituted === undefined) {
      continue;
    }
    attributes[attribute] = attribute === 'hidden' ? hiddenAttributeValue(substituted) : substituted;
    const argument = wholeValueArgument(value, scope);
    if (argument !== undefined) {
      substitutions.push({ attribute, argument });
    }
  }

  // --- Step 2: `style_*` overrides — the node also carries each as an attribute, recorded above ---
  const styleOverrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(written.styleOverrides)) {
    const loc = written.attributeLocs?.[`style_${key}`] ?? written.loc;
    const substituted = substituteText(
      value,
      { description: `'style_${key}' on ${label}`, ...(loc ? { loc } : {}), subjectPosition: false },
      scope,
      state,
    );
    if (substituted !== undefined) {
      styleOverrides[key] = substituted;
    }
  }

  // --- Step 3: Directives ---
  const directives = written.children
    .filter((child): child is BindingChild | EventChild | StyleChild => !isElement(child))
    .map((child) => substituteDirective(child, written, scope, state, substitutions));

  return { attributes: attributes as WidgetNode['attributes'], styleOverrides, directives, substitutions };
}

// bindArguments
// §13.6 step 1 for one instance: the supplied attribute, else the declared
// default. A missing required prop is reported with the wording Pass 4 uses for
// the same condition, so the two read as one fact.
//   instance  — the instance, its own attributes already substituted
//   written   — the same instance as written, before substitution
//   enclosing — the template the instance is written in, or undefined in a screen
//   props     — the composite's declared props
//   scope     — the scope the instance's template will be copied in
//   state     — expansion state
function bindArguments(
  instance: WidgetNode,
  written: WidgetNode,
  enclosing: TemplateScope | undefined,
  props: readonly PropDef[],
  scope: TemplateScope,
  state: ExpansionState,
): PropArgument[] {
  const args: PropArgument[] = [];
  const outer = scope.chain.slice(0, -1);

  // An argument written in a screen belongs to that instance. One written inside
  // a template is fixed by the template when it is a literal, or passes through
  // an argument that is itself fixed.
  const isFixed = (prop: string): boolean => {
    const raw = written.attributes[prop];
    if (enclosing === undefined || typeof raw !== 'string') {
      return false;
    }
    return raw.includes('$') ? (wholeValueArgument(raw, enclosing)?.fixed ?? false) : true;
  };

  // --- Step 1: Supplied value, then default; required props must have one ---
  for (const prop of props) {
    if (!prop.name) {
      continue;
    }
    const supplied = instance.attributes[prop.name];
    if (typeof supplied === 'string' && supplied !== '') {
      const loc = instance.attributeLocs?.[prop.name] ?? instance.loc;
      args.push({
        prop: prop.name,
        type: prop.type,
        value: supplied,
        from: 'argument',
        ...(loc ? { loc } : {}),
        fixed: isFixed(prop.name),
      });
    } else if (prop.default !== undefined) {
      const loc = instance.loc;
      args.push({
        prop: prop.name,
        type: prop.type,
        value: prop.default,
        from: 'default',
        ...(loc ? { loc } : {}),
        fixed: true,
      });
    } else if (prop.required) {
      report(
        state,
        withInstantiation(
          createExpansionDiagnostic(
            DIAGNOSTIC_CODES.MISSING_REQUIRED,
            `Missing required attribute '${prop.name}' on <${instance.tag}>.`,
            instance.loc,
            prop.name,
          ),
          outer,
        ),
      );
    }
  }

  // --- Step 2: A subject prop's argument must name a declared subject (§6.4) ---
  const bound: TemplateScope = { ...scope, args: new Map(args.map((argument) => [argument.prop, argument])) };
  for (const argument of args) {
    if (argument.type === 'subject') {
      checkSubjectArgument(argument, bound, state);
    }
  }
  return args;
}

// expandNode
// Expands one element and everything under it.
//   written — the element as written
//   scope   — the template being copied, or undefined for an element written in a screen
//   state   — expansion state
function expandNode(written: WidgetNode, scope: TemplateScope | undefined, state: ExpansionState): ExpandedElement {
  // --- Step 1: This element's own values; only a template has anything to substitute ---
  const own: SubstitutedValues = scope
    ? substituteNode(written, scope, state)
    : {
        attributes: written.attributes,
        styleOverrides: written.styleOverrides,
        directives: written.children.filter((child) => !isElement(child)),
        substitutions: [],
      };

  // --- Step 2: Identity — prefixed by the innermost instance, never invented ---
  const name = typeof written.attributes.name === 'string' ? written.attributes.name : '';
  const chain = scope?.chain ?? [];
  const enclosing = chain[chain.length - 1];
  const identifier = name === '' ? '' : enclosing ? childIdentifier(enclosing.identifier, name) : name;
  const substituted: WidgetNode = { ...written, attributes: own.attributes, styleOverrides: own.styleOverrides };

  // --- Step 3: A composite instance binds its arguments and copies its template ---
  const manifest = state.manifests.get(written.tag);
  let args: PropArgument[] | undefined;
  let template: ExpandedElement[] = [];
  if (manifest?.view !== undefined && !chain.some((site) => site.tag === written.tag)) {
    const site: InstantiationSite = { tag: written.tag, name, identifier, ...(written.loc ? { loc: written.loc } : {}) };
    const props = manifest.declared.api.props;
    const inner: TemplateScope = { composite: written.tag, props, args: new Map(), chain: [...chain, site] };
    args = bindArguments(substituted, written, scope, props, inner, state);
    const bound: TemplateScope = { ...inner, args: new Map(args.map((argument) => [argument.prop, argument])) };
    template = manifest.view.children.map((child) => expandNode(child, bound, state));
  }

  // --- Step 4: Elements written inside this one stay in the enclosing scope ---
  const nested = written.children.filter(isElement).map((child) => expandNode(child, scope, state));
  const children = [...template, ...nested];

  return {
    node: { ...substituted, children: [...own.directives, ...children.map((child) => child.node)] },
    source: written,
    name,
    identifier,
    instantiation: chain,
    ...(args !== undefined ? { arguments: args } : {}),
    ...(own.substitutions.length > 0 ? { substitutions: own.substitutions } : {}),
    children,
  };
}

/**
 * @brief Expands every composite instance in every screen (§13.6 steps 1–3).
 *
 * @param input Globals, screens and the manifest registry.
 * @return Expanded screens in input order, each tree in document order, and the
 *         diagnostics expansion raised. Geometry is not resolved: pass each
 *         screen's `elements.map((e) => e.node)` to `resolveElements`.
 */
export function expandScreens(input: ExpansionInput): ExpansionResult {
  const subjectNames = (input.globals?.subjects ?? []).map((subject) => subject.name);
  const state: ExpansionState = {
    manifests: input.manifests,
    subjectNames,
    subjects: new Set(subjectNames),
    diagnostics: [],
    reported: new Set(),
  };
  const screens = input.screens.map((screen) => ({
    screen,
    elements: (screen.view?.children ?? []).map((child) => expandNode(child, undefined, state)),
  }));
  return { screens, diagnostics: state.diagnostics };
}

/**
 * @brief Visits expanded elements depth-first in document order — each element
 *        before its children, the order §13.3 assigns object indices in.
 */
export function walkExpanded(elements: readonly ExpandedElement[], visitor: (element: ExpandedElement) => void): void {
  for (const element of elements) {
    visitor(element);
    walkExpanded(element.children, visitor);
  }
}
