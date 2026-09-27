/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/generator/budget-report.test.ts
 * Purpose: Holds §18's report to §1.3's rule — that it never states a figure the
 *          tooling cannot substantiate. The report is the *enforcement* of the
 *          honesty claim v0.1 got wrong, so the tests that matter most here are
 *          the negative ones: no flash byte count, no framebuffer, no widget
 *          `sizeof`, and no percentage of a RAM budget whose numerator is mostly
 *          unknown. A report that quietly estimated one of those would still look
 *          entirely plausible, which is exactly why it needs a test.
 * Description: Builds the report from the WO9 golden fixture through the real
 *              pipeline, and checks: every capacity against the macro the
 *              generated header actually defines; the author's names rather than
 *              the emitted `ui_obj_` ones; the exact derived RAM figure against
 *              `max_len + 1`; that [D-18]'s demotion statement is present
 *              whatever the project contains; and the `Figure` union's shape.
 */

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../../src/core/generator/index.js';
import { buildGenerateReport, MEASURED_KIND, UNMEASURED_KIND } from '../../src/core/generator/report/index.js';
import type { BudgetLine, GenerateReport } from '../../src/core/generator/report/index.js';
import { findTargetDisplay } from '../../src/core/resolver/index.js';
import { loadProject } from '../../src/node/load-project.js';
import { formatBudgetReport } from '../../src/node/format-budget.js';

const GOLDEN_GENERATOR_VERSION = '0.0.0-golden';
const fixtureDir = resolve(__dirname, 'fixtures/emit-project');

/** Generates the fixture and builds its report, exactly as the CLI does. */
function reportFixture(): { readonly report: GenerateReport; readonly configHeader: string } {
  const loaded = loadProject(fixtureDir);
  const result = generate({
    ...loaded.model,
    generatorVersion: GOLDEN_GENERATOR_VERSION,
    assets: loaded.assets,
  });
  expect(result.errors).toBe(0);
  const target = loaded.model.project.targets[0];
  expect(target).toBeDefined();
  const display = findTargetDisplay(target!, loaded.model.catalogue);
  const report = buildGenerateReport({
    globals: loaded.model.globals,
    manifests: loaded.model.manifests,
    realised: result.realised ?? [],
    capacities: result.capacities!,
    target: target!,
    ...(display !== undefined ? { display } : {}),
    generatorVersion: GOLDEN_GENERATOR_VERSION,
    assets: loaded.assets,
  });
  const configHeader = result.files.find((f) => f.path === 'u8g2gl_generated_config.h')?.content ?? '';
  expect(configHeader).not.toBe('');
  return { report, configHeader };
}

const { report, configHeader } = reportFixture();
const line = (lines: readonly BudgetLine[], item: string): BudgetLine => {
  const found = lines.find((l) => l.item === item);
  expect(found, `no budget line '${item}'`).toBeDefined();
  return found!;
};

describe('§18.1 capacities agree with the generated header, exactly ([D-21])', () => {
  // The report and u8g2gl_generated_config.h are two renderings of one
  // Capacities. If they could disagree, a reader checking the budget against the
  // header a build compiles against would be checking it against the wrong
  // number — worse than having no report.
  // This fixture binds six subjects, so no figure hits the one case where the
  // header and the report deliberately differ: U8G2GL_MAX_TOTAL_BINDINGS sizes
  // an array and is floored at 1, because a zero-length array is ill-formed in
  // standard C++, while the budget reports the true 0 (the integration test
  // covers that project). Everywhere else the two must agree exactly.
  for (const entry of report.capacity.entries) {
    it(`${entry.macro} matches the emitted #define`, () => {
      const match = new RegExp(`^#define ${entry.macro} (\\d+)$`, 'm').exec(configHeader);
      expect(match, `${entry.macro} is not defined in the emitted header`).not.toBeNull();
      expect(Number(match?.[1])).toBe(entry.value);
      expect(entry.value).toBeGreaterThan(0);
    });
  }

  it('names the header it was checked against, so a reader can do the same', () => {
    expect(report.capacity.header).toBe('u8g2gl_generated_config.h');
  });

  it('reports the 254-object ceiling on the object row, and on no other ([A-3], §18.1)', () => {
    const [objects, bindingsPerObject, total, styles] = report.capacity.entries;
    expect(objects?.ceiling).toBe(254);
    // §18.1: "the other figures have no fixed ceiling". A ceiling invented for
    // one of them would be read as a limit the project is approaching.
    expect(bindingsPerObject?.ceiling).toBeUndefined();
    expect(total?.ceiling).toBeUndefined();
    expect(styles?.ceiling).toBeUndefined();
  });

  it('names the busiest screen and object as the author wrote them, never as ui_obj_*', () => {
    const names = report.capacity.entries.flatMap((entry) => entry.names);
    expect(names).toContain('home');
    for (const name of names) {
      expect(name.startsWith('ui_')).toBe(false);
    }
  });
});

describe('§1.3 — no figure the tooling cannot substantiate', () => {
  it('reports every flash cost as unmeasured except the arrays it emits itself', () => {
    for (const flashLine of report.budget.flash) {
      if (flashLine.item === 'image data (xbm arrays)') {
        continue;
      }
      expect(flashLine.figure.kind, `${flashLine.item} claims a flash figure`).toBe(UNMEASURED_KIND);
    }
  });

  it('reports the framebuffer as unmeasured, because the application owns the U8G2 instance', () => {
    const framebuffer = line(report.budget.ram, 'framebuffer');
    expect(framebuffer.figure.kind).toBe(UNMEASURED_KIND);
    if (framebuffer.figure.kind === UNMEASURED_KIND) {
      expect(framebuffer.figure.reason).toContain('§13.10');
    }
  });

  it("reports a widget instance's RAM as unmeasured, and names §13.7 as the reason", () => {
    const objects = line(report.budget.ram, 'element objects');
    expect(objects.figure.kind).toBe(UNMEASURED_KIND);
    if (objects.figure.kind === UNMEASURED_KIND) {
      expect(objects.figure.reason).toContain('§13.7');
    }
    // The count is still reported: a count is derivable even when a size is not,
    // and it is what makes the unmeasured line worth printing.
    expect(objects.count).toBe(9);
  });

  it('gives every unmeasured figure a reason, and every measured one a derivation', () => {
    for (const budgetLine of [...report.budget.flash, ...report.budget.ram]) {
      if (budgetLine.figure.kind === UNMEASURED_KIND) {
        expect(budgetLine.figure.reason.length, budgetLine.item).toBeGreaterThan(20);
      } else {
        expect(budgetLine.figure.derivation.length, budgetLine.item).toBeGreaterThan(10);
      }
    }
  });

  it('offers no numeric field to read on an unmeasured figure', () => {
    // A consumer must branch on `kind`. A zero, a null or a -1 would all be read
    // as a cost by something, eventually.
    for (const budgetLine of [...report.budget.flash, ...report.budget.ram]) {
      if (budgetLine.figure.kind === UNMEASURED_KIND) {
        expect(Object.keys(budgetLine.figure).sort()).toEqual(['kind', 'reason']);
      }
    }
  });
});

describe('the derivable RAM figures are exact', () => {
  it("sums a string subject's storage as max_len + 1 (§8.2)", () => {
    // The fixture declares one string subject, max_len="16", which the generator
    // emitted as u8g2gl_subject_string_n<16, 1>: 17 bytes, not 16 and not 18.
    const strings = line(report.budget.ram, 'string subject storage');
    expect(strings.figure).toEqual({
      kind: MEASURED_KIND,
      bytes: 17,
      derivation: 'max_len + 1 bytes per declared string subject (§8.2)',
    });
    expect(strings.names).toEqual(['station_name']);
  });

  it('totals only the measured RAM lines, and calls the total derivable', () => {
    expect(report.budget.ramDerivedBytes).toBe(17);
    expect(formatBudgetReport(report)).toContain('derivable');
    // "total" would be read as the whole static cost, which is not known.
    expect(formatBudgetReport(report)).not.toMatch(/^\s+total\b/m);
  });

  it('counts the observer slots and pool slots the capacities settled, not its own', () => {
    expect(line(report.budget.ram, 'subject observer slots').count).toBe(
      report.capacity.entries.find((e) => e.macro === 'U8G2GL_MAX_TOTAL_BINDINGS')!.value + 1,
    );
    expect(line(report.budget.ram, 'binding pool slots').count).toBe(6);
  });

  it("reports an <xbm>'s bytes exactly, from the asset the build compiled in", () => {
    // 16x16 is 2 bytes a row, 32 bytes — the figure ui_images.cpp states.
    expect(line(report.budget.flash, 'image data (xbm arrays)').figure).toEqual({
      kind: MEASURED_KIND,
      bytes: 32,
      derivation: 'the byte count of the arrays this build emits (§14.2)',
    });
  });
});

describe('§13.5 realisation is reported per element, with its reasons', () => {
  it('names every element as the author wrote it, never as its emitted identifier', () => {
    for (const screen of report.realisation.screens) {
      expect(screen.screen.startsWith('ui_')).toBe(false);
      for (const element of screen.elements) {
        expect(element.name.startsWith('ui_obj_')).toBe(false);
      }
    }
  });

  it('gives each element its outcome and every condition of the rule that held', () => {
    const elements = report.realisation.screens.flatMap((s) => s.elements);
    const rule = elements.find((e) => e.tag === 'u8g2gl_hline');
    expect(rule?.realisation).toBe('draw_calls');
    expect(rule?.reasons).toEqual([]);

    const composite = elements.find((e) => e.reasons.includes('composite'));
    expect(composite?.realisation).toBe('object');
    // Every condition, in REALISATION_REASONS order — not merely the first.
    expect(composite?.reasons).toEqual(['class_backed', 'composite', 'has_children']);
    expect(composite?.requiredByRule).toBe(true);
  });

  it('carries the source position of the declaration, so the cost can be found', () => {
    for (const element of report.realisation.screens.flatMap((s) => s.elements)) {
      expect(element.file).not.toBe('');
      expect(element.line).toBeGreaterThan(0);
      expect(element.column).toBeGreaterThan(0);
    }
  });

  it('totals objects per screen as the object array length (§13.3)', () => {
    const total = report.realisation.screens.reduce((sum, s) => sum + s.objects, 0);
    expect(report.realisation.totalObjects).toBe(total);
    expect(total).toBe(9);
  });
});

describe("[D-18]'s amendment is stated on every run", () => {
  it('says demotion is not delivered, in the data and in the prose', () => {
    expect(report.realisation.demotion.classedElementDemotionDelivered).toBe(false);
    expect(report.realisation.demotion.statement).toContain('not yet delivered');
    expect(report.realisation.demotion.statement).toContain('[D-18]');
  });

  it('names the objects the amendment alone is paying for', () => {
    const { demotion } = report.realisation;
    expect(demotion.objectsNotRequiredByRule).toBe(demotion.names.length);
    for (const name of demotion.names) {
      const element = report.realisation.screens
        .flatMap((s) => s.elements)
        .find((e) => e.name === name);
      expect(element?.realisation).toBe('object');
      expect(element?.requiredByRule).toBe(false);
      expect(element?.reasons).toEqual(['class_backed']);
    }
  });

  it('appears in the human report whether or not it cost this project anything', () => {
    const text = formatBudgetReport(report);
    expect(text).toContain('classed-element demotion is not yet delivered');
    // The amendment's own requirement: the statement is made so that a project
    // it did not bite is not read as the rule's full saving. So it must appear
    // for a project with nothing to demote, too.
    const nothingToDemote: GenerateReport = {
      ...report,
      realisation: {
        ...report.realisation,
        screens: [],
        totalObjects: 0,
        totalDrawCallElements: 0,
        demotion: {
          classedElementDemotionDelivered: false,
          objectsNotRequiredByRule: 0,
          names: [],
          statement: report.realisation.demotion.statement,
        },
      },
    };
    const empty = formatBudgetReport(nothingToDemote);
    expect(empty).toContain('classed-element demotion is not yet delivered');
    expect(empty).toContain('No object in this project is due to the amendment alone.');
  });
});

describe('the RAM budget is reported, never turned into a percentage', () => {
  it('states a declared budget without claiming a fraction of it', () => {
    const withBudget: GenerateReport = {
      ...report,
      budget: { ...report.budget, ramBudget: 4800, overBudget: false },
    };
    const text = formatBudgetReport(withBudget);
    expect(text).toContain('Target RAM budget: 4800 bytes');
    // §18's example prints "48% of this target's declared RAM budget". With the
    // total unmeasured that percentage cannot be computed honestly, and a wrong
    // one is worse than none (§1.3).
    expect(text).not.toMatch(/\d+%/);
    expect(text).toContain('No percentage is reported');
  });

  it('warns only when the derived figures alone already exceed the budget', () => {
    const over: GenerateReport = {
      ...report,
      budget: { ...report.budget, ramBudget: 8, overBudget: true },
    };
    expect(formatBudgetReport(over)).toContain('already exceed that budget');
    expect(formatBudgetReport(report)).not.toContain('already exceed that budget');
  });
});

describe('the report is deterministic (§13.9)', () => {
  it('builds byte-identically twice, including its class lists', () => {
    const again = reportFixture();
    expect(JSON.stringify(again.report)).toBe(JSON.stringify(report));
    expect(formatBudgetReport(again.report)).toBe(formatBudgetReport(report));
  });

  it('sorts the element-class lists by code unit, not by first appearance', () => {
    const framework = line(report.budget.flash, 'framework element classes').names ?? [];
    expect([...framework]).toEqual([...framework].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(framework.length).toBeGreaterThan(1);
  });

  it('carries nothing read from the clock', () => {
    // The report is printed, not committed, so §13.9's no-timestamp rule is not
    // literally binding on it — but a run-dependent figure would make two
    // identical builds report differently, which is the property this whole
    // section is about. The one date it does carry is [D-18]'s amendment date,
    // which is part of the decision's name and is the same on every run.
    const text = formatBudgetReport(report);
    const today = new Date().toISOString().slice(0, 10);
    expect(text).not.toContain(today);
    expect(text).not.toMatch(/\d{2}:\d{2}:\d{2}/);
    const dates = text.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    expect(dates).toEqual(['2026-09-13']);
  });
});

describe('the human report reads as §18 and §18.1 lay it out', () => {
  const text = formatBudgetReport(report);

  it('opens with the generator, the target and its display', () => {
    expect(text.split('\n')[0]).toBe(
      "u8g2gl 0.0.0-golden — target 'primary' (U8G2_SSD1306_128X64_NONAME_F_HW_I2C 128x64)",
    );
  });

  it('has §18’s two tables and §18.1’s capacity table', () => {
    expect(text).toContain('  FLASH');
    expect(text).toContain('  RAM (static)');
    expect(text).toContain('  CAPACITY (generated — see u8g2gl_generated_config.h)');
    expect(text).toContain('objects, busiest screen');
    expect(text).toContain('bindings, busiest object');
    expect(text).toContain('bindings, total');
  });

  it('prints the word unmeasured for every figure it cannot substantiate', () => {
    const unmeasured = [...report.budget.flash, ...report.budget.ram].filter(
      (l) => l.figure.kind === UNMEASURED_KIND,
    );
    expect(unmeasured.length).toBeGreaterThan(5);
    expect(text.match(/unmeasured/g)?.length).toBeGreaterThanOrEqual(unmeasured.length);
  });

  it('leaves no trailing whitespace on any line', () => {
    // The report gets pasted into reviews and work orders, where trailing
    // whitespace is invisible noise nobody can see to remove.
    for (const row of text.split('\n')) {
      expect(row).toBe(row.trimEnd());
    }
  });

  it('is unchanged by --no-color except for the escapes', () => {
    const coloured = formatBudgetReport(report, { color: true });
    expect(coloured.replace(/\x1b\[[0-9;]*m/g, '')).toBe(text);
  });
});
