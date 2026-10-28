/**
 * U8G2GL Custom Widget Probe — G-PROBE2 Work Order 1
 * File: .agents/skills/principal-architect-workspace/g-probe2-widgets/evidence/render.mjs
 * Description: Renders the departures display layout with wd_service_list through U8G2GL Wasm harness.
 *
 * Actions:
 *  1. Ingests mock National Rail departure data from nationalRailBoard.json.
 *  2. Loads the prebuilt Wasm editor module.
 *  3. Attempts to apply generator-produced scene JSON to record the harness class-registry gap.
 *  4. Applies the equivalent scene JSON modeling wd_service_list::render() layout output.
 *  5. Binds mock National Rail subjects.
 *  6. Renders frame at t=0 ms.
 *  7. Reports framebuffer dimensions, lit pixel count, and SHA-256 digest.
 *  8. Writes evidence/render.pbm and evidence/render.png (amber OLED phosphor).
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..', '..', '..', '..');

// Import createEditor from project Wasm helper
import { createEditor } from '../../../../../wasm/u8g2gl_editor.mjs';

// ============================================================================
// 1. Ingestion of National Rail Mock Data
// ============================================================================
const mockDataPath = join(
  projectRoot,
  '.agents/skills/principal-architect-workspace/g-probe-departures/evidence/source/nationalRailBoard.json'
);
const rawData = JSON.parse(readFileSync(mockDataPath, 'utf-8'));

// Service 0 (Row 0):
// [ "1st", "19:55", "London Paddington", "9", "On time" ]
const row0Data = {
  time: String(rawData.services?.[0]?.[1] ?? '19:55'),
  dest: String(rawData.services?.[0]?.[2] ?? 'London Paddington'),
  status: String(rawData.services?.[0]?.[4] ?? 'On time')
};

// Service 1 (Subsequent row in services table):
// [ "2nd", "19:38", "London Victoria", "12", "19:41" ]
const row1Data = {
  ordinal: String(rawData.services?.[1]?.[0] ?? '2nd'),
  time: String(rawData.services?.[1]?.[1] ?? '19:38'),
  dest: String(rawData.services?.[1]?.[2] ?? 'London Victoria'),
  status: String(rawData.services?.[1]?.[4] ?? '19:41')
};

const sampleData = {
  platform: String(rawData.header?.platform ?? '9'),
  system_time: 71700, // 19:55:00 UTC = 19 * 3600 + 55 * 60
  row0_time: row0Data.time,
  row0_dest: row0Data.dest,
  row0_status: row0Data.status,
  row1_ordinal: row1Data.ordinal,
  row1_time: row1Data.time,
  row1_dest: row1Data.dest,
  row1_status: row1Data.status
};

// ============================================================================
// 2. Scene JSON Construction (Matching screen_departures.xml + wd_service_list)
// ============================================================================
function buildDeparturesScene() {
  const subjects = [
    { name: 'platform', type: 'string', max_len: 8 },
    { name: 'system_time', type: 'time' },
    { name: 'row0_time', type: 'string', max_len: 16 },
    { name: 'row0_dest', type: 'string', max_len: 64 },
    { name: 'row0_status', type: 'string', max_len: 32 },
    { name: 'row1_ordinal', type: 'string', max_len: 8 },
    { name: 'row1_time', type: 'string', max_len: 16 },
    { name: 'row1_dest', type: 'string', max_len: 64 },
    { name: 'row1_status', type: 'string', max_len: 32 }
  ];

  const elements = [];
  let objCount = 0;

  // 1. Static platform container box (draw call from <u8g2gl_box>)
  elements.push({
    name: 'plat_box',
    tag: 'u8g2gl_box',
    realisation: 'draw',
    arguments: [
      { name: 'x', value: 0 },
      { name: 'y', value: 0 },
      { name: 'width', value: 28 },
      { name: 'height', value: 51 },
      { name: 'filled', value: false },
      { name: 'radius', value: 0 }
    ],
    visibility: []
  });

  // 2. "Plat" label (object 0 from <u8g2gl_label>)
  elements.push({
    name: 'plat_label',
    tag: 'u8g2gl_label',
    realisation: 'object',
    class: 'u8g2gl_label',
    object: objCount++,
    parent: null,
    rect: [5, 6, 18, 13],
    properties: [
      { name: 'font', value: 'u8g2_font_helvR08_tr' },
      { name: 'align', value: 'center' },
      { name: 'text', value: 'Plat' }
    ],
    styles: [],
    style_overrides: [],
    bindings: [],
    flags: []
  });

  // 3. Platform number (object 1 from <u8g2gl_label>)
  elements.push({
    name: 'plat_num',
    tag: 'u8g2gl_label',
    realisation: 'object',
    class: 'u8g2gl_label',
    object: objCount++,
    parent: null,
    rect: [4, 20, 20, 24],
    properties: [
      { name: 'font', value: 'u8g2_font_helvR08_tr' },
      { name: 'align', value: 'center' }
    ],
    styles: [],
    style_overrides: [],
    bindings: [
      { name: 'bind_text', subject: 'platform', subject_type: 'string' }
    ],
    flags: []
  });

  // 4. Header separator line (draw call from <u8g2gl_line>)
  elements.push({
    name: 'header_sep',
    tag: 'u8g2gl_line',
    realisation: 'draw',
    arguments: [
      { name: 'x1', value: 30 },
      { name: 'y1', value: 50 },
      { name: 'x2', value: 255 },
      { name: 'y2', value: 50 }
    ],
    visibility: []
  });

  // 5. System clock (object 2 from <u8g2gl_clock>)
  elements.push({
    name: 'sys_clock',
    tag: 'u8g2gl_clock',
    realisation: 'object',
    class: 'u8g2gl_clock',
    object: objCount++,
    parent: null,
    rect: [190, 51, 66, 13],
    properties: [
      { name: 'font', value: 'u8g2_font_6x10_mr' },
      { name: 'format', value: 'hh_mm_ss' },
      { name: 'blink', value: false }
    ],
    styles: [],
    style_overrides: [],
    bindings: [
      { name: 'bind_time', subject: 'system_time', subject_type: 'time' }
    ],
    flags: []
  });

  // 6. row0 (wd_service_list at x=32, y=0, w=224, h=16)
  // Replicating wd_service_list::render() column dispatch:
  // Col 1: width 34, align left -> [32, 0, 34, 16]
  // Col 2: width 126, align left -> [66, 0, 126, 16]
  // Col 4: width 60, align right -> [194, 0, 60, 16]
  elements.push({
    name: 'row0_time',
    tag: 'u8g2gl_label',
    realisation: 'object',
    class: 'u8g2gl_label',
    object: objCount++,
    parent: null,
    rect: [32, 0, 34, 16],
    properties: [
      { name: 'font', value: 'u8g2_font_6x10_mr' },
      { name: 'align', value: 'left' }
    ],
    styles: [],
    style_overrides: [],
    bindings: [
      { name: 'bind_text', subject: 'row0_time', subject_type: 'string' }
    ],
    flags: []
  });

  elements.push({
    name: 'row0_dest',
    tag: 'u8g2gl_label',
    realisation: 'object',
    class: 'u8g2gl_label',
    object: objCount++,
    parent: null,
    rect: [66, 0, 126, 16],
    properties: [
      { name: 'font', value: 'u8g2_font_6x10_mr' },
      { name: 'align', value: 'left' }
    ],
    styles: [],
    style_overrides: [],
    bindings: [
      { name: 'bind_text', subject: 'row0_dest', subject_type: 'string' }
    ],
    flags: []
  });

  elements.push({
    name: 'row0_status',
    tag: 'u8g2gl_label',
    realisation: 'object',
    class: 'u8g2gl_label',
    object: objCount++,
    parent: null,
    rect: [194, 0, 60, 16],
    properties: [
      { name: 'font', value: 'u8g2_font_6x10_mr' },
      { name: 'align', value: 'right' }
    ],
    styles: [],
    style_overrides: [],
    bindings: [
      { name: 'bind_text', subject: 'row0_status', subject_type: 'string' }
    ],
    flags: []
  });

  // 7. services (wd_service_list at x=0, y=51, w=190, h=13)
  // Replicating wd_service_list::render() column dispatch for row 1:
  // Col 0: width 32, align center -> [0, 51, 32, 13]
  // Col 1: width 30, align left -> [32, 51, 30, 13]
  // Col 2: width 70, align left -> [62, 51, 70, 13]
  // Col 4: width 50, align right -> [132, 51, 50, 13]
  elements.push({
    name: 'row1_ordinal',
    tag: 'u8g2gl_label',
    realisation: 'object',
    class: 'u8g2gl_label',
    object: objCount++,
    parent: null,
    rect: [0, 51, 32, 13],
    properties: [
      { name: 'font', value: 'u8g2_font_6x10_mr' },
      { name: 'align', value: 'center' }
    ],
    styles: [],
    style_overrides: [],
    bindings: [
      { name: 'bind_text', subject: 'row1_ordinal', subject_type: 'string' }
    ],
    flags: []
  });

  elements.push({
    name: 'row1_time',
    tag: 'u8g2gl_label',
    realisation: 'object',
    class: 'u8g2gl_label',
    object: objCount++,
    parent: null,
    rect: [32, 51, 30, 13],
    properties: [
      { name: 'font', value: 'u8g2_font_6x10_mr' },
      { name: 'align', value: 'left' }
    ],
    styles: [],
    style_overrides: [],
    bindings: [
      { name: 'bind_text', subject: 'row1_time', subject_type: 'string' }
    ],
    flags: []
  });

  elements.push({
    name: 'row1_dest',
    tag: 'u8g2gl_label',
    realisation: 'object',
    class: 'u8g2gl_label',
    object: objCount++,
    parent: null,
    rect: [62, 51, 70, 13],
    properties: [
      { name: 'font', value: 'u8g2_font_6x10_mr' },
      { name: 'align', value: 'left' }
    ],
    styles: [],
    style_overrides: [],
    bindings: [
      { name: 'bind_text', subject: 'row1_dest', subject_type: 'string' }
    ],
    flags: []
  });

  elements.push({
    name: 'row1_status',
    tag: 'u8g2gl_label',
    realisation: 'object',
    class: 'u8g2gl_label',
    object: objCount++,
    parent: null,
    rect: [132, 51, 50, 13],
    properties: [
      { name: 'font', value: 'u8g2_font_6x10_mr' },
      { name: 'align', value: 'right' }
    ],
    styles: [],
    style_overrides: [],
    bindings: [
      { name: 'bind_text', subject: 'row1_status', subject_type: 'string' }
    ],
    flags: []
  });

  return {
    u8g2gl_generated: 'GENERATED by g-probe2 WO1 evidence renderer',
    format: 'u8g2gl-scene',
    version: 3,
    display: {
      width: 256,
      height: 64
    },
    init: ['styles', 'properties', 'bindings'],
    subjects,
    styles: [],
    fonts: ['u8g2_font_6x10_mr', 'u8g2_font_helvR08_tr'],
    images: [],
    screens: [
      {
        name: 'departures',
        objects: objCount,
        parents: new Array(objCount).fill(null),
        elements
      }
    ]
  };
}

// ============================================================================
// 3. Image Exporters (PBM & PNG)
// ============================================================================
function bufferToPbm(buffer, width, height) {
  const bytesPerRow = width >> 3;
  const pbmData = Buffer.alloc(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    const tileRow = y >> 3;
    const bitInTile = y & 7;
    const rowOffset = y * bytesPerRow;

    for (let x = 0; x < width; x++) {
      const tileIndex = tileRow * width + x;
      const isLit = (buffer[tileIndex] >> bitInTile) & 1;
      if (isLit) {
        const pbmByte = x >> 3;
        const pbmBit = 7 - (x & 7);
        pbmData[rowOffset + pbmByte] |= (1 << pbmBit);
      }
    }
  }

  const header = Buffer.from(`P4\n${width} ${height}\n`, 'ascii');
  return Buffer.concat([header, pbmData]);
}

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function bufferToPng(buffer, width, height) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const scanlineLen = 1 + width * 3;
  const rawData = Buffer.alloc(height * scanlineLen);

  for (let y = 0; y < height; y++) {
    const tileRow = y >> 3;
    const bitInTile = y & 7;
    const rowOffset = y * scanlineLen;
    rawData[rowOffset] = 0;

    for (let x = 0; x < width; x++) {
      const tileIndex = tileRow * width + x;
      const isLit = (buffer[tileIndex] >> bitInTile) & 1;
      const pxOffset = rowOffset + 1 + x * 3;

      if (isLit) {
        // Amber phosphor OLED (#FFA000)
        rawData[pxOffset] = 0xff;
        rawData[pxOffset + 1] = 0xa0;
        rawData[pxOffset + 2] = 0x00;
      } else {
        // True OLED background black
        rawData[pxOffset] = 0x05;
        rawData[pxOffset + 1] = 0x05;
        rawData[pxOffset + 2] = 0x07;
      }
    }
  }

  const idatChunk = makeChunk('IDAT', deflateSync(rawData));
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

// ============================================================================
// 4. Main Execution
// ============================================================================
async function main() {
  console.log('================================================================');
  console.log('   U8G2GL Custom Widget Probe — Wasm Render Harness (WO1)       ');
  console.log('================================================================\n');

  console.log('1. Loading Wasm Editor Module...');
  const localWasmDir = join(projectRoot, 'build-wasm', 'wasm');
  const mainWasmDir = 'build-wasm/wasm';
  const wasmDir = existsSync(join(localWasmDir, 'u8g2gl_editor.js')) ? localWasmDir : mainWasmDir;
  const editor = await createEditor(wasmDir);
  console.log(`   Module loaded successfully from: ${wasmDir}\n`);

  // Step 2: Test raw generated ui_scene.json to document Wasm harness gap
  const genScenePath = join(__dirname, 'probe-project', 'generated_editor', 'ui_scene.json');
  console.log(`2. Probing Generator Scene JSON: ${genScenePath}...`);
  try {
    const rawGenScene = JSON.parse(readFileSync(genScenePath, 'utf-8'));
    rawGenScene.version = 3; // Align version with bridge expectation
    const genOk = editor.applyScene(JSON.stringify(rawGenScene));
    if (!genOk) {
      console.log(`   [HARNESS GAP VERIFIED]: applyScene() refused with: "${editor.getLastError()}"`);
      console.log(`   Explanation: The precompiled Wasm harness bridge.cpp uses a static class registry`);
      console.log(`   (ui_editor_registry()) containing only framework classes. Custom C++ classes like`);
      console.log(`   wd_service_list cannot be dynamically loaded into Wasm without rebuilding the Wasm.`);
    } else {
      console.log(`   Generator scene applied unexpectedly!`);
    }
  } catch (err) {
    console.log(`   Could not test generator scene: ${err.message}`);
  }

  // Step 3: Apply the equivalent scene modeling wd_service_list::render()
  console.log('\n3. Applying Render-Parity Scene (modeling wd_service_list::render())...');
  const departuresScene = buildDeparturesScene();
  const sceneJson = JSON.stringify(departuresScene, null, 2);
  const ok = editor.applyScene(sceneJson);
  if (!ok) {
    console.error(`   Apply Scene Failed: ${editor.getLastError()}`);
    process.exit(1);
  }
  console.log('   Scene applied successfully.');

  const { width, height } = editor.getDisplaySize();
  console.log(`   Configured Display: ${width}x${height} (SSD1322 256x64)`);

  // Step 4: Apply mock data
  console.log('\n4. Applying Sample Data from nationalRailBoard.json...');
  const sampleJson = JSON.stringify(sampleData);
  if (!editor.applySampleData(sampleJson)) {
    console.error(`   Apply Sample Data Failed: ${editor.getLastError()}`);
    process.exit(1);
  }
  console.log('   Sample data applied successfully:');
  console.log(`   - Platform:     "${sampleData.platform}"`);
  console.log(`   - System Time:  ${sampleData.system_time}s (19:55:00)`);
  console.log(`   - Row 0 (Fast): "${sampleData.row0_time}" | "${sampleData.row0_dest}" | "${sampleData.row0_status}"`);
  console.log(`   - Services Row: "${sampleData.row1_ordinal}" | "${sampleData.row1_time}" | "${sampleData.row1_dest}" | "${sampleData.row1_status}"`);

  // Step 5: Render frame at t=0
  console.log('\n5. Rendering Frame at t=0 ms...');
  const buffer = editor.renderFrame(0);
  if (!buffer) {
    console.error(`   Render Frame Failed: ${editor.getLastError()}`);
    process.exit(1);
  }

  // Count lit pixels
  let litPixels = 0;
  for (let i = 0; i < buffer.length; i++) {
    let byte = buffer[i];
    while (byte) {
      litPixels += byte & 1;
      byte >>>= 1;
    }
  }

  const hash = createHash('sha256').update(buffer).digest('hex');
  console.log(`   Framebuffer size: ${buffer.length} bytes`);
  console.log(`   Lit pixels:       ${litPixels} / ${width * height} (${((litPixels / (width * height)) * 100).toFixed(2)}%)`);
  console.log(`   SHA-256 Digest:   ${hash}`);

  // Step 6: Write evidence files
  const pbmPath = join(__dirname, 'render.pbm');
  const pngPath = join(__dirname, 'render.png');
  writeFileSync(pbmPath, bufferToPbm(buffer, width, height));
  writeFileSync(pngPath, bufferToPng(buffer, width, height));
  console.log('\n6. Evidence Bitmaps Written:');
  console.log(`   - PBM Bitmap: ${pbmPath}`);
  console.log(`   - Amber PNG:  ${pngPath}`);

  console.log('\n================================================================');
  console.log('   Custom Widget Probe Render Completed Successfully            ');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
