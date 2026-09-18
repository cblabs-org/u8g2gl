/**
 * U8G2GL — declarative UI for U8G2 monochrome displays
 * Copyright (c) 2026 Matt McNeill (CB Labs)
 * SPDX-License-Identifier: MIT
 *
 * File: test/integration/generate.test.ts
 * Purpose: End-to-end tests of `u8g2gl generate` through the built CLI (PR-04
 *          WO5b): it refuses what `validate` only warns about, with the same code
 *          and location; it never invents a missing name; it writes a stamped,
 *          byte-identical file set into the output directory; and `--check` is
 *          §16's CI check.
 * Description: Runs dist/node/cli.js in a child process against the committed
 *              valid-project fixture (read-only) and throwaway projects under the
 *              git-ignored cli/tmp/.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const cliPath = resolve(__dirname, '../../dist/node/cli.js');
const validProjectDir = resolve(__dirname, 'fixtures/valid-project');
const packageVersion = (
  JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')) as { version: string }
).version;

interface ExecResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface JsonDiagnostic {
  readonly code: string;
  readonly severity: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly suggestions?: string[];
}

interface GenerateJson {
  readonly files: Array<{ path: string; action: string }>;
  readonly diagnostics: JsonDiagnostic[];
  readonly errors: number;
  readonly warnings: number;
}

function runCli(args: readonly string[]): Promise<ExecResult> {
  return new Promise((res) => {
    execFile(process.execPath, [cliPath, ...args], { env: { ...process.env, NO_COLOR: '1' } }, (error, stdout, stderr) => {
      res({
        code: error && typeof error.code === 'number' ? error.code : 0,
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      });
    });
  });
}

const tempDirs: string[] = [];

/**
 * A generatable project: builtin font, no deferred constructs. `wideTarget` adds
 * a second, 256-wide target named `wide`; `width` sets the label's width.
 */
function createProject(options: { outputDir?: string; unnamed?: boolean; wideTarget?: boolean; width?: number } = {}): string {
  mkdirSync(resolve(__dirname, '../../tmp'), { recursive: true });
  const dir = mkdtempSync(resolve(__dirname, '../../tmp/generate-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'screens'));
  const output = options.outputDir === undefined ? '' : `\n    <output dir="${options.outputDir}" />`;
  const wide = options.wideTarget ? '\n        <target name="wide" setup="U8G2_SH1122_256X64_F_3W_HW_SPI" />' : '';
  writeFileSync(
    join(dir, 'u8g2gl.xml'),
    `<u8g2gl schema="0.4" name="gen" version="1.0.0">
    <targets>
        <target name="primary" setup="U8G2_SSD1306_128X64_NONAME_F_HW_I2C" />${wide}
    </targets>${output}
</u8g2gl>
`,
  );
  writeFileSync(join(dir, 'globals.xml'), '<globals><fonts><builtin name="u8g2_font_6x10_mr" /></fonts></globals>\n');
  const name = options.unnamed ? '' : ' name="title"';
  writeFileSync(
    join(dir, 'screens/screen_home.xml'),
    `<screen name="home">
    <view>
        <u8g2gl_label${name} x="0" y="0" width="${options.width ?? 128}" height="12" font="u8g2_font_6x10_mr" text="Hi" />
    </view>
</screen>
`,
  );
  return dir;
}

/** Every file under a directory with its bytes, sorted by path. */
function snapshot(dir: string): Array<[string, string]> {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e): [string, string] => {
      const full = join(e.parentPath, e.name);
      return [full.slice(dir.length + 1), readFileSync(full, 'utf-8')];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('u8g2gl generate (PR-04 WO5b)', () => {
  it('refuses what validate warns about — same code, file, line, column and message — and writes nothing', async () => {
    const validated = JSON.parse((await runCli(['validate', validProjectDir, '--json'])).stdout) as GenerateJson;
    const res = await runCli(['generate', validProjectDir, '--json']);
    const generated = JSON.parse(res.stdout) as GenerateJson;

    const located = (ds: JsonDiagnostic[]): string[] =>
      ds
        .filter((d) => d.code === 'U8G2GL_NOT_YET_SUPPORTED')
        .map((d) => `${d.code} ${d.file}:${d.line}:${d.column} ${d.message}`);

    expect(res.code).toBe(1);
    expect(located(validated.diagnostics)).toHaveLength(3);
    expect(located(generated.diagnostics)).toEqual(located(validated.diagnostics));
    expect(validated.diagnostics.every((d) => d.severity === 'warning')).toBe(true);
    expect(generated.diagnostics.every((d) => d.severity === 'error')).toBe(true);
    expect(generated.errors).toBe(3);
    expect(generated.files).toEqual([]);
    expect(existsSync(join(validProjectDir, 'generated'))).toBe(false);
  });

  it('prints the refusal with source lines, and says nothing was written', async () => {
    const res = await runCli(['generate', validProjectDir]);

    expect(res.code).toBe(1);
    expect(res.stderr).toContain('<focus_ring wrap="true">');
    expect(res.stderr).toContain('PR-09');
    expect(res.stderr).toContain('Generation refused: 3 error(s), 0 warning(s). Nothing was written.');
  });

  it('fails on a missing name with the same diagnostic validate reports, inventing no name', async () => {
    const dir = createProject({ unnamed: true });
    const validated = JSON.parse((await runCli(['validate', dir, '--json'])).stdout) as GenerateJson;
    const res = await runCli(['generate', dir, '--json']);
    const generated = JSON.parse(res.stdout) as GenerateJson;

    const missing = (ds: JsonDiagnostic[]): JsonDiagnostic[] => ds.filter((d) => d.code === 'U8G2GL_MISSING_NAME');
    expect(res.code).toBe(1);
    expect(missing(validated.diagnostics)).toHaveLength(1);
    expect(missing(generated.diagnostics)).toEqual(missing(validated.diagnostics));
    expect(generated.files).toEqual([]);
    expect(existsSync(join(dir, 'generated'))).toBe(false);
    expect(readFileSync(join(dir, 'screens/screen_home.xml'), 'utf-8')).not.toContain('name="label');
  });

  it('writes stamped files into generated/ and reports them in the --json contract', async () => {
    const dir = createProject();
    const res = await runCli(['generate', dir, '--json']);
    const parsed = JSON.parse(res.stdout) as GenerateJson;

    expect(res.code).toBe(0);
    expect(Object.keys(parsed)).toEqual(['files', 'diagnostics', 'errors', 'warnings']);
    expect(parsed.files).toEqual(
      [
        'u8g2gl_generated_config.h',
        'ui.hpp',
        'ui_subjects.cpp',
        'ui_styles.cpp',
        'ui_fonts.cpp',
        'ui_images.cpp',
        'ui.cpp',
        'ui_screen_home.cpp',
      ].map((path) => ({ path, action: 'created' })),
    );
    // The stamp is pinned exactly; since PR-04 WO10 the screen's objects, tables
    // and functions follow it, so the unit starts with the stamp rather than
    // being only the stamp.
    const screenUnit = readFileSync(join(dir, 'generated/ui_screen_home.cpp'), 'utf-8');
    expect(
      screenUnit.startsWith(
        "// GENERATED by u8g2gl. Do not edit: regenerate with 'u8g2gl generate'.\n" +
          '// source: screens/screen_home.xml\n' +
          '// schema: 0.4\n' +
          `// generator: ${packageVersion}\n` +
          '// target: primary\n',
      ),
    ).toBe(true);
    expect(screenUnit).toContain('void ui_screen_home_render(U8G2& display) {');
  });

  it("uses the project's <output dir>, and --out over it", async () => {
    const dir = createProject({ outputDir: 'build_ui' });
    expect((await runCli(['generate', dir])).code).toBe(0);
    expect(existsSync(join(dir, 'build_ui/ui.hpp'))).toBe(true);

    const elsewhere = join(dir, 'elsewhere');
    expect((await runCli(['generate', dir, '--out', elsewhere])).code).toBe(0);
    expect(existsSync(join(elsewhere, 'ui.hpp'))).toBe(true);
  });

  it('produces byte-identical output on two runs', async () => {
    const dir = createProject();
    await runCli(['generate', dir, '--out', join(dir, 'first')]);
    await runCli(['generate', dir, '--out', join(dir, 'second')]);
    const rerun = JSON.parse((await runCli(['generate', dir, '--out', join(dir, 'first'), '--json'])).stdout) as GenerateJson;

    expect(snapshot(join(dir, 'second'))).toEqual(snapshot(join(dir, 'first')));
    expect(rerun.files.every((f) => f.action === 'unchanged')).toBe(true);
  });

  it('--check exits 0 when up to date, and non-zero listing a hand-edited file, writing nothing', async () => {
    const dir = createProject();
    await runCli(['generate', dir]);

    const clean = await runCli(['generate', dir, '--check']);
    expect(clean.code).toBe(0);
    expect(clean.stdout).toContain('are up to date');

    const edited = `${readFileSync(join(dir, 'generated/ui.hpp'), 'utf-8')}// hand edit\n`;
    writeFileSync(join(dir, 'generated/ui.hpp'), edited);
    const drift = await runCli(['generate', dir, '--check']);
    expect(drift.code).toBe(1);
    expect(drift.stdout).toContain('would update: ui.hpp');
    expect(readFileSync(join(dir, 'generated/ui.hpp'), 'utf-8')).toBe(edited);

    const json = JSON.parse((await runCli(['generate', dir, '--check', '--json'])).stdout) as GenerateJson;
    expect(json.files.filter((f) => f.action !== 'unchanged')).toEqual([{ path: 'ui.hpp', action: 'updated' }]);
  });

  it('--check on a never-generated project exits non-zero and creates nothing', async () => {
    const dir = createProject();
    const res = await runCli(['generate', dir, '--check']);

    expect(res.code).toBe(1);
    expect(existsSync(join(dir, 'generated'))).toBe(false);
  });

  it('leaves a hand-written file in the output directory alone', async () => {
    const dir = createProject();
    mkdirSync(join(dir, 'generated'));
    writeFileSync(join(dir, 'generated/app_glue.cpp'), '// mine\n');

    expect((await runCli(['generate', dir])).code).toBe(0);
    expect(readFileSync(join(dir, 'generated/app_glue.cpp'), 'utf-8')).toBe('// mine\n');
  });

  it('checks bounds for the target it builds: a 128-wide and a 256-wide target differ (PR-04 WO7b)', async () => {
    const dir = createProject({ wideTarget: true, width: 200 });

    const wide = await runCli(['generate', dir, '--target', 'wide', '--json']);
    const wideJson = JSON.parse(wide.stdout) as GenerateJson;
    expect(wide.code).toBe(0);
    expect(wideJson.errors).toBe(0);
    expect(wideJson.files.length).toBeGreaterThan(0);

    const narrow = await runCli(['generate', dir, '--target', 'primary', '--json']);
    const narrowJson = JSON.parse(narrow.stdout) as GenerateJson;
    expect(narrow.code).toBe(1);
    expect(narrowJson.files).toEqual([]);
    expect(narrowJson.diagnostics.map((d) => `${d.code} ${d.file}:${d.line}`)).toEqual([
      'U8G2GL_OUT_OF_BOUNDS screens/screen_home.xml:3',
    ]);
    expect(narrowJson.diagnostics[0]?.message).toContain('display is 128px wide');
  });

  it('refuses an unknown --target with a structured suggestion', async () => {
    const res = await runCli(['generate', createProject(), '--target', 'primry', '--json']);
    const parsed = JSON.parse(res.stdout) as GenerateJson;

    expect(res.code).toBe(1);
    expect(parsed.diagnostics.map((d) => [d.code, d.suggestions])).toEqual([['U8G2GL_UNKNOWN_TARGET', ['primary']]]);
  });

  it('rejects an unknown option as a usage error', async () => {
    const res = await runCli(['generate', createProject(), '--fix-names']);

    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Unknown option for generate: --fix-names');
  });

  it('is listed in --help with its --json contract', async () => {
    const res = await runCli(['--help']);

    expect(res.stdout).toContain('generate   Validate a project and write its generated C++ files');
    expect(res.stdout).toContain('{ "files": [{ "path", "action" }], "diagnostics": [...], "errors": N, "warnings": N }');
  });
});
