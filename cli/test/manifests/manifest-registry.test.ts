/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/manifests/manifest-registry.test.ts
 * Purpose: Pins the manifest registry's contract (PR-04 WO1): one namespace for
 *          every element, `extends` resolved into effective manifests in a fixed
 *          declaration order, and diagnostics for shadowing, unknown `extends`
 *          targets and `extends` cycles ([D-17], [D-18]).
 * Description: Declaration order is asserted exactly, because later work orders
 *              emit setter calls in that order; a silent reorder would change
 *              generated code without an input change (§13.9).
 */

import { describe, expect, it } from 'vitest';
import { buildManifestRegistry } from '../../src/core/manifest/index.js';
import { DIAGNOSTIC_CODES } from '../../src/core/schema/diagnostic.js';
import type { BindDef, PropDef, WidgetManifest } from '../../src/core/schema/widget-manifest.js';
import { frameworkRegistry, registryOf } from '../helpers/manifest-registry.js';

/** A plain widget manifest with the given props (by name) and bindings. */
function widget(
  name: string,
  opts: { extends?: string; props?: readonly PropDef[]; bindings?: readonly BindDef[] } = {},
): WidgetManifest {
  return {
    name,
    ...(opts.extends !== undefined ? { extends: opts.extends } : {}),
    api: { props: opts.props ?? [], bindings: opts.bindings ?? [], elements: [] },
    loc: { file: `widgets/${name}/${name}.xml`, line: 2, column: 1 },
  };
}

function prop(name: string, extra: Partial<PropDef> = {}): PropDef {
  return { name, type: 'int', setter: `set_${name}`, ...extra };
}

function bind(name: string): BindDef {
  return { name, type: 'int', setter: name };
}

describe('buildManifestRegistry', () => {
  describe('lookup', () => {
    it('looks up widgets and composites in one namespace', () => {
      const composite: WidgetManifest = {
        name: 'status_bar',
        api: { props: [], bindings: [], elements: [] },
        view: { children: [] },
      };
      const registry = registryOf([widget('wd_meter'), composite]);

      expect(registry.get('wd_meter')?.name).toBe('wd_meter');
      expect(registry.get('status_bar')?.view).toBeDefined();
      expect(registry.has('status_bar')).toBe(true);
      expect(registry.has('nope')).toBe(false);
      expect(registry.tags).toEqual(['wd_meter', 'status_bar']);
      expect(registry.declaredComposites.map((m) => m.name)).toEqual(['status_bar']);
      expect(registry.declaredWidgets.map((m) => m.name)).toEqual(['wd_meter']);
    });

    it('treats a composite with no extends as a root when no u8g2gl_obj is registered', () => {
      const composite: WidgetManifest = {
        name: 'status_bar',
        api: { props: [prop('title')], bindings: [], elements: [] },
        view: { children: [] },
      };
      const registry = registryOf([composite]);
      expect(registry.get('status_bar')?.chain).toEqual(['status_bar']);
      expect(registry.diagnostics).toEqual([]);
    });
  });

  // --- PR-04 WO2 F2: the implicit `extends` default lives here, not in the parser ---
  describe('implicit extends', () => {
    it('gives a composite with no extends u8g2gl_obj as its parent (§13.12)', () => {
      const composite: WidgetManifest = {
        name: 'status_bar',
        api: { props: [prop('title')], bindings: [], elements: [] },
        view: { children: [] },
      };
      const registry = frameworkRegistry([composite]);
      const effective = registry.get('status_bar')!;
      expect(effective.chain).toEqual(['status_bar', 'u8g2gl_obj']);
      expect(effective.api.props.map((p) => p.name)).toContain('draw_color');
      expect(effective.api.props.at(-1)?.name).toBe('title');
      expect(registry.diagnostics).toEqual([]);
    });

    it('gives a plain widget with no extends no parent, leaving the schema pass to report it', () => {
      const registry = frameworkRegistry([widget('wd_meter', { props: [prop('level')] })]);
      expect(registry.get('wd_meter')?.chain).toEqual(['wd_meter']);
      expect(registry.get('wd_meter')?.api.props.map((p) => p.name)).toEqual(['level']);
      expect(registry.diagnostics).toEqual([]);
    });

    it('reports a project manifest that extends itself as a cycle, not a root', () => {
      const registry = registryOf([widget('wd_a', { extends: 'wd_a' })]);
      expect(registry.diagnostics).toHaveLength(1);
      expect(registry.diagnostics[0]).toMatchObject({
        code: DIAGNOSTIC_CODES.CIRCULAR_REFERENCE,
        message: "Manifest 'extends' cycle: wd_a -> wd_a.",
      });
    });
  });

  describe('extends resolution', () => {
    it('includes an inherited prop and records the chain', () => {
      const registry = registryOf([
        widget('wd_base', { props: [prop('speed')] }),
        widget('wd_child', { extends: 'wd_base', props: [prop('label')] }),
      ]);
      const child = registry.get('wd_child');
      expect(child?.api.props.map((p) => p.name)).toContain('speed');
      expect(child?.chain).toEqual(['wd_child', 'wd_base']);
      expect(child?.declared.api.props.map((p) => p.name)).toEqual(['label']);
      expect(registry.diagnostics).toEqual([]);
    });

    it('lets a child override win while keeping the parent position, then appends additions', () => {
      const registry = registryOf([
        widget('wd_base', { props: [prop('a'), prop('b'), prop('c')] }),
        widget('wd_child', {
          extends: 'wd_base',
          props: [prop('b', { required: true, setter: 'set_b_child' }), prop('d')],
        }),
      ]);
      const props = registry.get('wd_child')!.api.props;

      // Pinned exactly: parent order first, override in place, additions after.
      expect(props.map((p) => p.name)).toEqual(['a', 'b', 'c', 'd']);
      expect(props[1]?.required).toBe(true);
      expect(props[1]?.setter).toBe('set_b_child');
    });

    it('orders a three-level chain from the root down', () => {
      const registry = registryOf([
        widget('wd_child', { extends: 'wd_mid', props: [prop('c'), prop('b', { default: 'child' })] }),
        widget('wd_mid', { extends: 'wd_root', props: [prop('b'), prop('a', { default: 'mid' })] }),
        widget('wd_root', { props: [prop('a')] }),
      ]);
      const props = registry.get('wd_child')!.api.props;
      expect(props.map((p) => p.name)).toEqual(['a', 'b', 'c']);
      expect(props[0]?.default).toBe('mid');
      expect(props[1]?.default).toBe('child');
      expect(registry.get('wd_child')?.chain).toEqual(['wd_child', 'wd_mid', 'wd_root']);
    });

    it('merges bindings by the same rule as props', () => {
      const registry = registryOf([
        widget('wd_base', { bindings: [bind('bind_x'), bind('bind_y')] }),
        widget('wd_child', {
          extends: 'wd_base',
          bindings: [{ name: 'bind_x', type: 'string', setter: 'bind_x' }, bind('bind_z')],
        }),
      ]);
      const bindings = registry.get('wd_child')!.api.bindings;
      expect(bindings.map((b) => b.name)).toEqual(['bind_x', 'bind_y', 'bind_z']);
      expect(bindings[0]?.type).toBe('string');
    });

    it('diagnoses an unknown extends target, naming it, with a suggestion', () => {
      const registry = registryOf([
        widget('wd_base'),
        widget('wd_child', { extends: 'wd_bse', props: [prop('own')] }),
      ]);
      const diag = registry.diagnostics.find((d) => d.code === DIAGNOSTIC_CODES.UNKNOWN_WIDGET);
      expect(diag).toBeDefined();
      expect(diag?.severity).toBe('error');
      expect(diag?.message).toContain('wd_child');
      expect(diag?.message).toContain("'wd_bse'");
      expect(diag?.offendingText).toBe('wd_bse');
      expect(diag?.suggestions).toContain('wd_base');
      expect(diag?.file).toBe('widgets/wd_child/wd_child.xml');
      // The element is still usable with its own declarations.
      expect(registry.get('wd_child')?.api.props.map((p) => p.name)).toEqual(['own']);
    });

    it('diagnoses an extends cycle once, naming the chain', () => {
      const registry = registryOf([
        widget('wd_a', { extends: 'wd_b' }),
        widget('wd_b', { extends: 'wd_a' }),
      ]);
      const cycles = registry.diagnostics.filter(
        (d) => d.code === DIAGNOSTIC_CODES.CIRCULAR_REFERENCE,
      );
      expect(cycles).toHaveLength(1);
      expect(cycles[0]?.message).toContain('wd_a -> wd_b -> wd_a');
    });

    it('diagnoses a three-element extends cycle', () => {
      const registry = registryOf([
        widget('wd_a', { extends: 'wd_b' }),
        widget('wd_b', { extends: 'wd_c' }),
        widget('wd_c', { extends: 'wd_a' }),
      ]);
      const cycles = registry.diagnostics.filter(
        (d) => d.code === DIAGNOSTIC_CODES.CIRCULAR_REFERENCE,
      );
      expect(cycles).toHaveLength(1);
      expect(cycles[0]?.message).toContain('wd_a -> wd_b -> wd_c -> wd_a');
    });

    it('is deterministic for the same input', () => {
      const input = [widget('wd_a', { extends: 'wd_b' }), widget('wd_b', { extends: 'wd_a' })];
      expect(registryOf(input).diagnostics).toEqual(registryOf(input).diagnostics);
    });
  });

  describe('framework manifests', () => {
    it('resolves the bundled framework manifests with no diagnostics', () => {
      // u8g2gl_obj.xml declares extends="u8g2gl_obj" (every plain widget must
      // declare `extends`, PR-04 WO2 F2), which must read as the root of the
      // hierarchy, not a self-cycle.
      const registry = frameworkRegistry();
      expect(registry.diagnostics).toEqual([]);
      expect(registry.get('u8g2gl_obj')?.chain).toEqual(['u8g2gl_obj']);
    });

    it('gives u8g2gl_label the props it inherits from u8g2gl_obj, with its own overrides in place', () => {
      const registry = frameworkRegistry();
      const label = registry.get('u8g2gl_label')!;
      const obj = registry.get('u8g2gl_obj')!;
      const names = label.api.props.map((p) => p.name);

      expect(label.chain).toEqual(['u8g2gl_label', 'u8g2gl_obj']);
      expect(names).toContain('draw_color');
      // Inherited declarations come first, in u8g2gl_obj's order.
      expect(names.slice(0, obj.api.props.length)).toEqual(obj.api.props.map((p) => p.name));
      // The label's `font` (required) replaces the object's in the object's position.
      const fontIndex = obj.api.props.findIndex((p) => p.name === 'font');
      expect(label.api.props[fontIndex]?.required).toBe(true);
    });

    it('makes a project manifest shadowing a framework tag a hard error naming both sources', () => {
      const copy = widget('u8g2gl_label', { extends: 'u8g2gl_obj', props: [prop('truncate')] });
      const registry = frameworkRegistry([copy]);

      const diag = registry.diagnostics.find(
        (d) => d.code === DIAGNOSTIC_CODES.SHADOWED_FRAMEWORK_MANIFEST,
      );
      expect(diag).toBeDefined();
      expect(diag?.severity).toBe('error');
      expect(diag?.file).toBe('widgets/u8g2gl_label/u8g2gl_label.xml');
      expect(diag?.message).toContain('widgets/u8g2gl_label/u8g2gl_label.xml');
      expect(diag?.message).toContain('u8g2gl/manifests/u8g2gl_label.xml');
      expect(diag?.message).toContain('delete');

      // The framework manifest wins lookup; the copy is not declared at all.
      expect(registry.get('u8g2gl_label')?.origin).toBe('framework');
      expect(registry.get('u8g2gl_label')?.api.props.map((p) => p.name)).not.toContain('truncate');
      expect(registry.declaredWidgets.filter((m) => m.name === 'u8g2gl_label')).toHaveLength(1);
    });
  });

  it('keeps project-only registration independent of framework manifests', () => {
    const registry = buildManifestRegistry({ framework: [], project: [widget('wd_x')] });
    expect(registry.get('wd_x')?.origin).toBe('project');
  });
});
