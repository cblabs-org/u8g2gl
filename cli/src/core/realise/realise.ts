/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: src/core/realise/realise.ts
 * Purpose: §13.5 and §13.3 — decides, for every element in the whole document,
 *          whether it becomes a C++ object or a sequence of draw calls, and
 *          flattens what it decided into the object array and parent table the
 *          runtime walks. This is the analysis every later stage depends on:
 *          WO9 emits the capacities counted from it, WO10 emits the objects and
 *          draw calls it ordered, §18 reports what it decided and why.
 * Description: **Realisation is a whole-document question, not a per-element
 *              predicate.** Whether an instance needs an object depends on who
 *              binds to it, what focus ring names it, what events it carries,
 *              whether it is a composite and what is nested inside it — none of
 *              which is readable from the element alone. So the conditions are
 *              gathered from the screen (its focus ring), from the element's own
 *              directives, from its manifest, and from its position in the
 *              expanded tree (its children, and the composite it was expanded
 *              from), and **every** condition that held is recorded rather than
 *              the first one found. That matters because the reason is reported
 *              to the author (§13.5, [D-16]): "it has children" and "a focus
 *              ring names it" are different facts about the same object, and a
 *              first-match answer would sometimes be the wrong one.
 *
 *              **[D-18]'s 2026-09-13 amendment is interim, and is applied at
 *              the outcome only.** A class-backed element is always an object
 *              for now, because demoting one needs a stateless
 *              `u8g2gl_draw_label` and per-property knowledge of what carries
 *              state between frames, neither of which exists. The pass still
 *              evaluates the whole rule and records `requiredByRule`, so
 *              switching demotion on later changes the outcome, not this
 *              analysis. §18 must state that classed-element demotion is not
 *              yet delivered, and `requiredByRule` is the field that lets it.
 *
 *              Consumes WO8a's single pipeline: the expansion handed in has
 *              already been expanded, resolved and collision-checked once, for
 *              the target being built. Nothing here expands, resolves or mangles
 *              again. Isomorphic; never throws for user input; document order
 *              throughout, and every lookup table is a `Map` that is read but
 *              never iterated (§13.9).
 *
 * Exports:
 * - RealiseInput:      One expanded document, and what realisation reads about it
 * - realiseScreens():  Decide and flatten every screen
 * - walkRealised():    Visit realised elements depth-first in document order
 */

import { DIAGNOSTIC_CODES, type Diagnostic } from '../schema/diagnostic.js';
import type { Globals, SubjectDecl } from '../schema/globals.js';
import type { BindDef } from '../schema/widget-manifest.js';
import {
  isDrawingElement,
  type EffectiveManifest,
  type ManifestRegistry,
} from '../manifest/manifest-registry.js';
import {
  withInstantiation,
  type ExpandedElement,
  type ExpandedScreen,
  type ExpansionResult,
} from '../resolver/index.js';
import {
  REALISATION_REASONS,
  U8G2GL_NO_PARENT,
  type DrawStep,
  type Realisation,
  type RealisationReason,
  type RealisationResult,
  type RealisedBinding,
  type RealisedElement,
  type RealisedScreen,
  type VisibilityTerm,
} from './model.js';

/** Everything {@link realiseScreens} needs. */
export interface RealiseInput {
  /** Declared subjects, for binding types and overload selection. */
  readonly globals: Globals;
  /** Effective manifests: which elements have a class, and what they may bind. */
  readonly manifests: ManifestRegistry;
  /**
   * The document expanded exactly once, for the target being built (WO8a).
   * Realisation never expands: a second expansion would be a second document.
   */
  readonly expansion: ExpansionResult;
}

/** The flag a `<bind_flag_if_*>` directive sets to hide an element (§8.4). */
const HIDDEN_FLAG = 'hidden';

/** What one screen's realisation accumulates. */
interface ScreenState {
  /** Objects by index, filled as each is reached in document order. */
  readonly objects: RealisedElement[];
  /** The parent table, parallel to {@link objects}. */
  readonly parents: number[];
  /** The next object index to hand out. */
  nextObjectIndex: number;
  readonly diagnostics: Diagnostic[];
}

// subjectsByName
// Declared subjects for lookup. Output order never comes from here: every
// caller drives its order from the declaration list (§13.9).
function subjectsByName(globals: Globals | undefined): ReadonlyMap<string, SubjectDecl> {
  return new Map((globals?.subjects ?? []).map((subject) => [subject.name, subject]));
}

// bindingAttributeOrder
// The element's binding attributes in first-declaration order, each with every
// overload declared for it. A binding attribute may be declared once per
// accepted subject type — `bind_text` for `string` and again for `int` (§8.4) —
// and the registry keeps both by merging on (name, type), so an attribute must
// be visited once rather than once per overload (PR-04 WO5a).
//   bindings — the element's effective bindings
function bindingAttributeOrder(bindings: readonly BindDef[]): ReadonlyArray<readonly [string, readonly BindDef[]]> {
  const grouped = new Map<string, BindDef[]>();
  const order: string[] = [];
  for (const binding of bindings) {
    const overloads = grouped.get(binding.name);
    if (overloads === undefined) {
      grouped.set(binding.name, [binding]);
      order.push(binding.name);
    } else {
      overloads.push(binding);
    }
  }
  return order.map((name) => [name, grouped.get(name) ?? []] as const);
}

// bindingsOf
// Every binding one element declares, in attribute-declaration order then
// directive order. Each is one `add_binding()`, one pool slot and one observer —
// the invariant WO2 pinned in the runtime and [D-21] counts capacities against —
// so this list's length *is* the element's binding count.
//
// The overload is chosen here, by the subject's declared type, so WO10 and WO11
// emit from that choice instead of re-selecting by name and taking whichever
// `<bind>` came first (PR-04 WO5a finding 4).
//   element  — the expanded element
//   manifest — its effective manifest, or undefined for an unknown tag
//   subjects — declared subjects (lookup only)
function bindingsOf(
  element: ExpandedElement,
  manifest: EffectiveManifest | undefined,
  subjects: ReadonlyMap<string, SubjectDecl>,
): RealisedBinding[] {
  const found: RealisedBinding[] = [];
  const { node } = element;

  // --- Step 1: `bind_*` attributes the manifest declares ---
  for (const [attribute, overloads] of bindingAttributeOrder(manifest?.api.bindings ?? [])) {
    const value = node.attributes[attribute];
    // A `$`-reference never reached an argument: Pass 2 and expansion report it,
    // and it names no subject to observe.
    if (typeof value !== 'string' || value === '' || value.startsWith('$')) {
      continue;
    }
    const subject = subjects.get(value);
    // The overload whose declared type matches the subject's. Absent when none
    // does — Pass 5's TYPE_MISMATCH, which refuses the build before emission.
    const declaration = subject ? overloads.find((overload) => overload.type === subject.type) : undefined;
    const loc = node.attributeLocs?.[attribute] ?? node.loc;
    found.push({
      kind: 'attribute',
      attribute,
      subject: value,
      ...(subject ? { subjectType: subject.type } : {}),
      ...(declaration ? { declaration } : {}),
      ...(loc ? { loc } : {}),
    });
  }

  // --- Step 2: `<bind_flag_if_*>` directive children (§8.4) ---
  for (const child of node.children) {
    if (!('kind' in child) || child.kind !== 'binding') {
      continue;
    }
    if (child.subject === '' || child.subject.startsWith('$')) {
      continue;
    }
    const subject = subjects.get(child.subject);
    const loc = child.loc ?? node.loc;
    found.push({
      kind: 'flag',
      attribute: child.type,
      subject: child.subject,
      ...(subject ? { subjectType: subject.type } : {}),
      ...(child.flag !== undefined ? { flag: child.flag } : {}),
      directive: child,
      ...(loc ? { loc } : {}),
    });
  }

  return found;
}

/** What deciding one element's realisation needs beyond the element itself. */
interface DecisionContext {
  readonly manifests: ManifestRegistry;
  /** Names the screen's `<focus_ring>` lists (lookup only). */
  readonly focusEntries: ReadonlySet<string>;
  /** The element this one is nested inside, or undefined at view level. */
  readonly parent: ExpandedElement | undefined;
}

// reasonsOf
// Every condition of §13.5's rule that holds for one element, in
// REALISATION_REASONS order.
//
// Conditions that cannot fire in PR-04 are evaluated all the same — a focus ring
// and an event are refused until PR-09, a composite's typed child pointer until
// PR-08 — so that the reason reported is the true one the day they are allowed,
// and so that switching them on needs no change here.
//   element     — the expanded element
//   manifest    — its effective manifest, or undefined for an unknown tag
//   classBacked — whether the element has a C++ class at all
//   bindings    — its bindings, already gathered
//   context     — the screen's focus ring, and its parent in the expanded tree
function reasonsOf(
  element: ExpandedElement,
  manifest: EffectiveManifest | undefined,
  classBacked: boolean,
  bindings: readonly RealisedBinding[],
  context: DecisionContext,
): RealisationReason[] {
  // A binding needs an object only when the element's class is the thing that
  // must observe the subject. A drawing element compiles the binding into its
  // call and reads the value at draw time instead (§13.5), so the condition is
  // a conjunction, exactly as the spec writes it.
  const held: Record<RealisationReason, boolean> = {
    class_backed: classBacked,
    binding: classBacked && bindings.length > 0,
    event: element.node.children.some((child) => 'kind' in child && child.kind === 'event'),
    // A focus ring names elements written in the screen, which is what Pass 2
    // checks its entries against; an element expanded out of a composite's
    // template is not one of them.
    focus_ring_member:
      element.instantiation.length === 0 && element.name !== '' && context.focusEntries.has(element.name),
    composite: manifest?.view !== undefined,
    has_children: element.children.length > 0,
    // The enclosing composite has a C++ class of its own, so its generated code
    // holds a typed member pointer to this child ([D-6] as [D-18] amends it).
    // Only a *direct* child: a deeper element is reached through its own parent,
    // not through the composite. Refused until PR-08, and modelled here.
    typed_child_pointer: hasOwnClass(context.parent, context.manifests),
  };
  return REALISATION_REASONS.filter((reason) => held[reason]);
}

// hasOwnClass
// Whether an element is a composite that also declares a C++ class of its own.
// Read from the **declared** manifest: the registry gives every composite
// `u8g2gl_obj` as its base, so only a declared `extends` means the author wrote
// a class for it — the same test validate-not-yet-supported.ts makes.
function hasOwnClass(element: ExpandedElement | undefined, manifests: ManifestRegistry): boolean {
  if (element === undefined) {
    return false;
  }
  const manifest = manifests.get(element.node.tag);
  return manifest?.view !== undefined && manifest.declared.extends !== undefined;
}

// needsObjectDiagnostic
// A drawing element something requires an object of. It has no class, so there
// is nothing to instantiate, nothing to point at and nothing to focus — the
// build cannot proceed, and saying which condition created the requirement is
// what makes the message actionable (§15.1).
//   element — the expanded element
//   forcing — the reasons that required an object, `class_backed` excluded
function needsObjectDiagnostic(element: ExpandedElement, forcing: readonly RealisationReason[]): Diagnostic {
  const { node } = element;
  const loc = node.attributeLocs?.name ?? node.loc;
  const why = forcing.map((reason) => REASON_PROSE[reason]).join(', and ');
  const label = element.name === '' ? `<${node.tag}>` : `<${node.tag}> '${element.name}'`;
  return withInstantiation(
    {
      code: DIAGNOSTIC_CODES.DRAWING_ELEMENT_NEEDS_OBJECT,
      severity: 'error',
      file: loc?.file ?? '',
      line: loc?.line ?? 1,
      column: loc?.column ?? 1,
      message:
        `${label} needs a C++ object because ${why}, but it is a drawing element (draw= props only) ` +
        `and has no class to instantiate (§13.5, [D-18]). Use an element with a class, or remove ` +
        `what requires the object.`,
      offendingText: element.name === '' ? node.tag : element.name,
    },
    element.instantiation,
  );
}

/** How each condition reads in a diagnostic. */
const REASON_PROSE: Record<RealisationReason, string> = {
  class_backed: 'it is backed by a C++ class',
  binding: 'it binds a subject its class must observe',
  event: 'it carries an event handler',
  focus_ring_member: 'a <focus_ring> names it',
  composite: 'it is a composite',
  has_children: 'it has nested children',
  typed_child_pointer: 'its composite holds a typed pointer to it',
};

// placeElement
// Decides one element's realisation and places it in the flat model, then does
// the same for everything nested inside it — depth-first in document order,
// which is the order §13.3 assigns object indices in and therefore draw order
// ([D-4]).
//
// The index is taken **before** recursing, so a container precedes its children
// in the object array exactly as §13.12's worked example shows.
//   element          — the expanded element
//   state            — the screen being built
//   context          — focus ring, registry and this element's parent
//   subjects         — declared subjects (lookup only)
//   parentObjectIndex — nearest enclosing object, or U8G2GL_NO_PARENT
//   ancestorTerms    — the visibility conjunction inherited from enclosing objects
function placeElement(
  element: ExpandedElement,
  state: ScreenState,
  context: DecisionContext,
  subjects: ReadonlyMap<string, SubjectDecl>,
  parentObjectIndex: number,
  ancestorTerms: readonly VisibilityTerm[],
): RealisedElement {
  // --- Step 1: What is this element, and what does it bind? ---
  const manifest = context.manifests.get(element.node.tag);
  // An unknown tag has neither a class nor a draw function. Pass 2 reports it
  // and the build is refused, so nothing here has to invent an answer; it is
  // carried through as draw calls with no reasons, and never reaches emission.
  const classBacked = manifest !== undefined && !isDrawingElement(manifest.declared);
  const bindings = bindingsOf(element, manifest, subjects);

  // --- Step 2: Evaluate the whole rule, and record every condition that held ---
  const reasons = reasonsOf(element, manifest, classBacked, bindings, context);
  const forcing = reasons.filter((reason) => reason !== 'class_backed');
  const requiredByRule = forcing.length > 0;

  // --- Step 3: The outcome, under [D-18]'s interim amendment ---
  // A class-backed element is always an object for now, even where the rule
  // alone would demote it; `requiredByRule` above keeps the unamended answer.
  // An element with no class that the rule requires an object of cannot be one.
  let realisation: Realisation = 'draw_calls';
  if (classBacked) {
    realisation = 'object';
  } else if (requiredByRule && manifest !== undefined) {
    state.diagnostics.push(needsObjectDiagnostic(element, forcing));
  }

  // --- Step 4: Take this element's place in the flat model (§13.3) ---
  let objectIndex: number | undefined;
  if (realisation === 'object') {
    objectIndex = state.nextObjectIndex;
    state.nextObjectIndex += 1;
    state.parents[objectIndex] = parentObjectIndex;
  }

  // --- Step 5: Children measure and hide against this element when it is an object ---
  const childTerms: readonly VisibilityTerm[] =
    objectIndex === undefined
      ? ancestorTerms
      : [...ancestorTerms, { kind: 'ancestor_visible', objectIndex, identifier: element.identifier }];
  const children = element.children.map((child) =>
    placeElement(child, state, { ...context, parent: element }, subjects, objectIndex ?? parentObjectIndex, childTerms),
  );

  // --- Step 6: A draw-call element's visibility is settled at build time (§13.5) ---
  // It is not in the parent table, so the render-time walk up the parent chain
  // cannot reach it; the conjunction of its ancestors' hidden checks and its own
  // bound flags is emitted instead, which §13.5 notes is strictly cheaper.
  let visibility: VisibilityTerm[] | undefined;
  if (realisation === 'draw_calls') {
    visibility = [...ancestorTerms];
    for (const binding of bindings) {
      if (binding.kind === 'flag' && binding.flag === HIDDEN_FLAG && binding.directive !== undefined) {
        visibility.push({ kind: 'flag_clear', directive: binding.directive, subject: binding.subject });
      }
    }
  }

  const realised: RealisedElement = {
    element,
    identifier: element.identifier,
    realisation,
    reasons,
    requiredByRule,
    bindings,
    ...(objectIndex !== undefined ? { objectIndex } : {}),
    parentIndex: parentObjectIndex,
    ...(visibility !== undefined ? { visibility } : {}),
    children,
  };
  if (objectIndex !== undefined) {
    state.objects[objectIndex] = realised;
  }
  return realised;
}

// drawOrderOf
// The screen's render sequence: every element, depth-first in document order,
// objects and draw calls interleaved. §13.12 renders `rule` between two objects
// and the generator must never reorder to group them ([D-4]).
function drawOrderOf(elements: readonly RealisedElement[]): DrawStep[] {
  const steps: DrawStep[] = [];
  const visit = (nodes: readonly RealisedElement[]): void => {
    for (const node of nodes) {
      steps.push(
        node.objectIndex === undefined
          ? { kind: 'draw_calls', element: node }
          : { kind: 'object', objectIndex: node.objectIndex, element: node },
      );
      visit(node.children);
    }
  };
  visit(elements);
  return steps;
}

// realiseScreen
// One screen: decided, flattened, and put in draw order.
function realiseScreen(
  expanded: ExpandedScreen,
  manifests: ManifestRegistry,
  subjects: ReadonlyMap<string, SubjectDecl>,
  diagnostics: Diagnostic[],
): RealisedScreen {
  const focusEntries = new Set(
    (expanded.screen.view?.focusRing?.entries ?? []).map((entry) => entry.name).filter((name) => name !== ''),
  );
  const state: ScreenState = {
    objects: [],
    parents: [],
    nextObjectIndex: 0,
    diagnostics,
  };
  const context: DecisionContext = { manifests, focusEntries, parent: undefined };
  const elements = expanded.elements.map((element) =>
    placeElement(element, state, context, subjects, U8G2GL_NO_PARENT, []),
  );
  return {
    screen: expanded.screen,
    elements,
    objects: state.objects,
    parents: state.parents,
    drawOrder: drawOrderOf(elements),
  };
}

/**
 * @brief Decides every element's realisation and flattens every screen
 *        (§13.5, §13.3).
 *
 * Consumes the one expansion WO8a's pipeline built for the target being
 * generated. Nothing is expanded, resolved or mangled here.
 *
 * @param input The expanded document, the registry and the declared subjects.
 * @return Screens in input order, each with its object array, parent table and
 *         draw order, and the diagnostics realisation raised. Never throws for
 *         user input; a document that still holds an error simply carries the
 *         diagnostic, because `generate()` refuses the build on it.
 */
export function realiseScreens(input: RealiseInput): RealisationResult {
  const subjects = subjectsByName(input.globals);
  const diagnostics: Diagnostic[] = [];
  const screens = input.expansion.screens.map((screen) =>
    realiseScreen(screen, input.manifests, subjects, diagnostics),
  );
  return { screens, diagnostics };
}

/**
 * @brief Visits realised elements depth-first in document order — objects and
 *        draw-call elements alike, each before its children.
 *
 * The same order the resolver's `walkExpanded` uses over the tree this was built
 * from, so a caller holding both can walk them together.
 */
export function walkRealised(
  elements: readonly RealisedElement[],
  visitor: (element: RealisedElement) => void,
): void {
  for (const element of elements) {
    visitor(element);
    walkRealised(element.children, visitor);
  }
}
