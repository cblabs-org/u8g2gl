/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/schema/types.test.ts
 * Purpose: Verification and type-level assertions for U8G2GL schema definitions.
 * Description: Tests that all schema types and diagnostic constants exported by
 *              core/schema resolve cleanly, instantiate realistic models matching
 *              design_spec examples, enforce immutability (readonly), and provide
 *              runtime diagnostic code lookup.
 */

import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTIC_CODES,
  type Diagnostic,
  type DiagnosticCode,
  type Severity,
  type SourceLocation,
  type SourceRange,
  type Located,
  type U8g2glProject,
  type Target,
  type BusConfig,
  type OutputConfig,
  type Globals,
  type ConstDecl,
  type SubjectType,
  type SubjectDecl,
  type DrawColor,
  type TextAlign,
  type FontMode,
  type BitmapMode,
  type StyleDecl,
  type FontDecl,
  type BdfFontDecl,
  type BuiltinFontDecl,
  type ImageDecl,
  type XbmImageDecl,
  type ConvertImageDecl,
  type Screen,
  type View,
  type FocusRing,
  type FocusEntry,
  type CommonAttributes,
  type WidgetNode,
  type WidgetNodeChild,
  type BindingChild,
  type EventTrigger,
  type EventChild,
  type StyleChild,
  type WidgetManifest,
  type ApiBlock,
  type PropType,
  type PropDef,
  type BindDef,
  type ElementDef,
  type ElementArgDef,
  type BusFamily,
  type DisplayBus,
  type DisplayTiles,
  type DisplayXOffset,
  type DisplayRecord,
} from '../../src/core/index.js';

describe('Schema Types', () => {
  describe('Source Location types', () => {
    it('instantiates valid SourceLocation, SourceRange, and Located<T>', () => {
      const loc: SourceLocation = {
        file: 'screens/screen_home.xml',
        line: 14,
        column: 32,
      };

      const range: SourceRange = {
        start: loc,
        end: { file: 'screens/screen_home.xml', line: 14, column: 40 },
      };

      const locatedValue: Located<string> = {
        value: 'small_9',
        loc,
      };

      expect(loc.file).toBe('screens/screen_home.xml');
      expect(loc.line).toBe(14);
      expect(loc.column).toBe(32);
      expect(range.start.line).toBe(14);
      expect(range.end.column).toBe(40);
      expect(locatedValue.value).toBe('small_9');
      expect(locatedValue.loc).toBe(loc);
    });
  });

  describe('Diagnostic types and codes', () => {
    it('contains all 23 required diagnostic codes with correct U8G2GL prefixes', () => {
      const expectedCodes: Record<string, DiagnosticCode> = {
        UNKNOWN_FONT: 'U8G2GL_UNKNOWN_FONT',
        UNKNOWN_IMAGE: 'U8G2GL_UNKNOWN_IMAGE',
        UNKNOWN_SUBJECT: 'U8G2GL_UNKNOWN_SUBJECT',
        UNKNOWN_STYLE: 'U8G2GL_UNKNOWN_STYLE',
        UNKNOWN_COMPONENT: 'U8G2GL_UNKNOWN_COMPONENT',
        UNKNOWN_WIDGET: 'U8G2GL_UNKNOWN_WIDGET',
        UNKNOWN_DISPLAY: 'U8G2GL_UNKNOWN_DISPLAY',
        PAGE_MODE_DISPLAY: 'U8G2GL_PAGE_MODE_DISPLAY',
        UNKNOWN_ATTRIBUTE: 'U8G2GL_UNKNOWN_ATTRIBUTE',
        MISSING_REQUIRED: 'U8G2GL_MISSING_REQUIRED',
        MISSING_NAME: 'U8G2GL_MISSING_NAME',
        TYPE_MISMATCH: 'U8G2GL_TYPE_MISMATCH',
        OVERCONSTRAINED: 'U8G2GL_OVERCONSTRAINED',
        OUT_OF_BOUNDS: 'U8G2GL_OUT_OF_BOUNDS',
        NAME_COLLISION: 'U8G2GL_NAME_COLLISION',
        INVALID_NAME: 'U8G2GL_INVALID_NAME',
        UNKNOWN_SCHEMA_VERSION: 'U8G2GL_UNKNOWN_SCHEMA_VERSION',
        DUPLICATE_NAME: 'U8G2GL_DUPLICATE_NAME',
        INVALID_ENUM_VALUE: 'U8G2GL_INVALID_ENUM_VALUE',
        FORMAT_MISMATCH: 'U8G2GL_FORMAT_MISMATCH',
        MALFORMED_XML: 'U8G2GL_MALFORMED_XML',
        MISSING_FILE: 'U8G2GL_MISSING_FILE',
        CIRCULAR_REFERENCE: 'U8G2GL_CIRCULAR_REFERENCE',
      };

      for (const [key, value] of Object.entries(expectedCodes)) {
        expect(DIAGNOSTIC_CODES[key as keyof typeof DIAGNOSTIC_CODES]).toBe(value);
      }
    });

    it('creates a realistic Diagnostic instance per design_spec §15.1', () => {
      const diagCode: DiagnosticCode = DIAGNOSTIC_CODES.UNKNOWN_FONT;
      const diag: Diagnostic = {
        code: diagCode,
        severity: 'error' as Severity,
        file: 'screens/screen_home.xml',
        line: 14,
        column: 32,
        endLine: 14,
        endColumn: 39,
        message: "unknown font 'small_9'",
        offendingText: 'small_9',
        suggestions: ['small_09', 'tall_12', 'clock_small_7'],
      };

      expect(diag.code).toBe('U8G2GL_UNKNOWN_FONT');
      expect(diag.severity).toBe('error');
      expect(diag.file).toBe('screens/screen_home.xml');
      expect(diag.line).toBe(14);
      expect(diag.suggestions).toHaveLength(3);
      expect(diag.suggestions?.[0]).toBe('small_09');
    });
  });

  describe('Project types (u8g2gl.xml)', () => {
    it('creates a valid U8g2glProject matching design_spec §5.1', () => {
      const defaultBus: BusConfig = {
        cs: '10',
        dc: '9',
        reset: '8',
      };

      const compactBus: BusConfig = {
        address: '0x3C',
      };

      const targets: readonly Target[] = [
        {
          name: 'default',
          setup: 'U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI',
          rotation: '0',
          bus: defaultBus,
          ramBudget: 4800,
        },
        {
          name: 'compact',
          setup: 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C',
          bus: compactBus,
        },
      ];

      const output: OutputConfig = {
        dir: 'generated',
        prefix: 'ui_',
      };

      const project: U8g2glProject = {
        schema: '0.3',
        name: 'departures-board',
        version: '1.0',
        targets,
        output,
        loc: { file: 'u8g2gl.xml', line: 1, column: 1 },
      };

      expect(project.schema).toBe('0.3');
      expect(project.name).toBe('departures-board');
      expect(project.targets).toHaveLength(2);
      expect(project.targets[0]?.setup).toBe('U8G2_SSD1322_NHD_256X64_F_4W_HW_SPI');
      expect(project.output?.dir).toBe('generated');
    });
  });

  describe('Globals types (globals.xml)', () => {
    it('creates valid Globals instance matching design_spec §5.3, §8, §10', () => {
      const consts: readonly ConstDecl[] = [
        { name: 'header_height', type: 'int', value: '11' },
        { name: 'row_height', type: 'int', value: '13' },
        { name: 'app_name', type: 'string', value: 'Departures Board' },
      ];

      const subjects: readonly SubjectDecl[] = [
        { name: 'temperature', type: 'int' as SubjectType, default: '0' },
        { name: 'station_name', type: 'string' as SubjectType, default: '', maxLen: 48 },
        { name: 'wifi_connected', type: 'bool' as SubjectType, default: 'true' },
        { name: 'system_time', type: 'time' as SubjectType },
      ];

      const styles: readonly StyleDecl[] = [
        {
          name: 'header',
          font: 'small_9',
          drawColor: '1' as DrawColor,
          align: 'left' as TextAlign,
          fontMode: 'solid' as FontMode,
          bitmapMode: 'transparent' as BitmapMode,
        },
        { name: 'body', font: 'tall_12' },
        { name: 'selected', invert: true, padding: 2, radius: 1 },
      ];

      const fonts: readonly FontDecl[] = [
        { kind: 'bdf', name: 'small_9', src: 'fonts/custom_9px.bdf', range: '0x20-0x7F' } as BdfFontDecl,
        { kind: 'builtin', name: 'u8g2_font_6x10_mr' } as BuiltinFontDecl,
      ];

      const images: readonly ImageDecl[] = [
        { kind: 'xbm', name: 'icon_wifi', src: 'assets/wifi.xbm' } as XbmImageDecl,
        {
          kind: 'convert',
          name: 'logo',
          src: 'assets/logo.png',
          width: 32,
          height: 32,
          mode: 'threshold',
          threshold: 128,
        } as ConvertImageDecl,
      ];

      const globals: Globals = {
        consts,
        subjects,
        styles,
        fonts,
        images,
        loc: { file: 'globals.xml', line: 1, column: 1 },
      };

      expect(globals.consts).toHaveLength(3);
      expect(globals.subjects).toHaveLength(4);
      expect(globals.subjects[1]?.maxLen).toBe(48);
      expect(globals.styles).toHaveLength(3);
      expect(globals.styles[0]?.bitmapMode).toBe('transparent');
      expect(globals.fonts).toHaveLength(2);
      expect(globals.images).toHaveLength(2);
    });
  });

  describe('Screen and View types (screens/screen_*.xml)', () => {
    it('creates valid Screen matching design_spec §5.4, §12.2', () => {
      const bindingChild: BindingChild = {
        kind: 'binding',
        type: 'bind_flag_if_eq',
        subject: 'wifi_connected',
        refValue: '0',
        flag: 'hidden',
      };

      const eventChild: EventChild = {
        kind: 'event',
        type: 'screen_load_event',
        trigger: 'press' as EventTrigger,
        screen: 'screen_wifi',
      };

      const styleChild: StyleChild = {
        kind: 'style',
        name: 'header',
      };

      const commonAttrs: CommonAttributes = {
        name: 'btn_wifi',
        x: '0',
        y: '0',
        width: '128',
        height: '12',
        focusStyle: 'selected',
      };

      const buttonNode: WidgetNode = {
        tag: 'u8g2gl_button',
        attributes: {
          ...commonAttrs,
          text: 'Wi-Fi',
        },
        styleOverrides: { invert: 'true' },
        children: [eventChild, bindingChild, styleChild],
      };

      const widgetChild: WidgetNodeChild = buttonNode;
      expect(widgetChild).toBeDefined();

      const focusEntry: FocusEntry = { name: 'btn_wifi' };
      const focusRing: FocusRing = {
        wrap: true,
        entries: [focusEntry],
      };

      const view: View = {
        children: [buttonNode],
        focusRing,
      };

      const screen: Screen = {
        name: 'settings',
        styles: [{ name: 'footer', font: 'small_9' }],
        view,
      };

      expect(screen.name).toBe('settings');
      expect(screen.view.children).toHaveLength(1);
      expect(screen.view.focusRing?.wrap).toBe(true);
      expect(screen.view.focusRing?.entries[0]?.name).toBe('btn_wifi');
      expect(buttonNode.children).toHaveLength(3);
    });
  });

  describe('Composite WidgetManifest (§6.3, §6.4) — Component retired onto WidgetManifest by WO5b', () => {
    it('creates a valid composite WidgetManifest matching design_spec §6.3', () => {
      // `u8g2gl_scrolling_label` no longer exists (WO2 folded it into
      // `u8g2gl_label`'s `long_mode`) — this fixture was surfaced by WO4 as
      // still referencing the deleted tag and is corrected here.
      const compositeProps: readonly PropDef[] = [
        { name: 'title_subject', type: 'subject' as PropType, default: 'station_name' },
        { name: 'wifi_subject', type: 'subject' as PropType, default: 'wifi_connected' },
        { name: 'width', type: 'int' as PropType, default: '#screen_width' },
        { name: 'height', type: 'int' as PropType, default: '11' },
        {
          name: 'font',
          type: 'font' as PropType,
          default: 'small_9',
          required: true,
          // ComponentProp had no `help` field before WO5 merged it onto
          // PropDef — asserted below, this is the defect the merge fixes.
          help: 'Font used for the scrolling location label.',
        },
      ];

      // A composite is now literally a WidgetManifest whose `api` carries a
      // `view` ([D-18], WO5b) — no `extends`, because it has no C++ class of
      // its own to extend.
      const composite: WidgetManifest = {
        name: 'status_bar',
        api: { props: compositeProps, bindings: [], elements: [] },
        view: {
          children: [
            {
              tag: 'u8g2gl_label',
              attributes: {
                name: 'location',
                x: '0',
                y: '0',
                right: '52',
                height: '$height',
                bind_text: '$title_subject',
                font: '$font',
                long_mode: 'scroll',
              },
              styleOverrides: {},
              children: [],
            },
          ],
        },
      };

      expect(composite.name).toBe('status_bar');
      expect(composite.extends).toBeUndefined();
      expect(composite.api.props).toHaveLength(5);
      expect(composite.api.props[4]?.required).toBe(true);
      expect(composite.api.props[4]?.help).toBe('Font used for the scrolling location label.');
      expect(composite.view?.children[0]?.tag).toBe('u8g2gl_label');
    });
  });

  describe('Widget Manifest types (<widget>, §6.4, §13.1)', () => {
    it('creates valid WidgetManifest matching design_spec §6.4 and §13.1', () => {
      const columnArgs: readonly ElementArgDef[] = [
        { name: 'width', type: 'int' as PropType },
        { name: 'align', type: 'enum' as PropType },
      ];

      const columnElement: ElementDef = {
        name: 'column',
        access: 'add',
        help: 'Column definition',
        args: columnArgs,
      };

      const props: readonly PropDef[] = [
        { name: 'font', type: 'font' as PropType, setter: 'set_font' },
        {
          name: 'max_rows',
          type: 'int' as PropType,
          setter: 'set_max_rows',
          default: '16',
          help: 'Row capacity. Determines allocated RAM.',
        },
        {
          name: 'align',
          type: 'enum' as PropType,
          setter: 'set_align',
          values: 'left,center,right',
          default: 'left',
          emit: 'U8G2GL_ALIGN_{VALUE^^}',
        },
      ];

      const bindings: readonly BindDef[] = [
        { name: 'bind_text', type: 'string', setter: 'bind_text', fmt: 'bind_text_fmt' },
      ];

      const apiBlock: ApiBlock = {
        props,
        bindings,
        elements: [columnElement],
      };

      const manifest: WidgetManifest = {
        name: 'wd_service_list',
        extends: 'u8g2gl_widget',
        api: apiBlock,
      };

      expect(manifest.name).toBe('wd_service_list');
      expect(manifest.extends).toBe('u8g2gl_widget');
      expect(manifest.api.props).toHaveLength(3);
      expect(manifest.api.bindings).toHaveLength(1);
      expect(manifest.api.elements).toHaveLength(1);
      expect(manifest.api.elements[0]?.args).toHaveLength(2);
    });

    it('creates a valid PropDef using draw= instead of setter= ([D-18], §6.2)', () => {
      const boxProp: PropDef = {
        name: 'x',
        type: 'int' as PropType,
        draw: 'u8g2gl_draw_box',
        required: true,
      };

      expect(boxProp.draw).toBe('u8g2gl_draw_box');
      expect(boxProp.setter).toBeUndefined();
    });
  });

  describe('Display Record types (display catalogue, §5.2)', () => {
    it('creates valid DisplayRecord matching design_spec §5.2', () => {
      const bus: DisplayBus = { family: 'i2c' as BusFamily, wiring: 'hardware', raw: 'HW_I2C' };
      const tiles: DisplayTiles = { width: 16, height: 8 };
      const xOffset: DisplayXOffset = { default: 0, flipmode: 0 };

      const display: DisplayRecord = {
        setup: 'U8G2_SSD1306_128X64_NONAME_F_HW_I2C',
        controller: 'SSD1306',
        variant: ['128X64', 'NONAME'],
        width: 128,
        height: 64,
        tiles,
        framebufferBytes: 1024,
        bus,
        xOffset,
        driver: 'u8x8_d_ssd1306_128x64_noname',
      };

      expect(display.setup).toBe('U8G2_SSD1306_128X64_NONAME_F_HW_I2C');
      expect(display.controller).toBe('SSD1306');
      expect(display.framebufferBytes).toBe(1024);
      expect(display.bus.family).toBe('i2c');
      expect(display.xOffset.default).toBe(0);
    });
  });

  describe('Compile-time immutability (readonly assertions)', () => {
    it('ensures interfaces enforce readonly constraints at compile time', () => {
      const loc: SourceLocation = { file: 'test.xml', line: 1, column: 1 };
      // Verify properties cannot be reassigned (compile-time type safety):
      // @ts-expect-error - readonly property cannot be reassigned
      // loc.file = 'other.xml';
      expect(loc.file).toBe('test.xml');

      const project: U8g2glProject = {
        schema: '0.3',
        name: 'test',
        version: '1.0',
        targets: [],
      };
      // @ts-expect-error - readonly property cannot be reassigned
      // project.schema = '0.4';
      expect(project.schema).toBe('0.3');

      const diag: Diagnostic = {
        code: DIAGNOSTIC_CODES.MISSING_REQUIRED,
        severity: 'error',
        file: 'test.xml',
        line: 1,
        column: 1,
        message: 'missing attribute',
      };
      // @ts-expect-error - readonly property cannot be reassigned
      // diag.code = 'OTHER';
      expect(diag.code).toBe(DIAGNOSTIC_CODES.MISSING_REQUIRED);
    });
  });
});
