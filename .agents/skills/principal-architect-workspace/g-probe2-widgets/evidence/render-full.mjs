/**
 * U8G2GL Full Departures Screen Render — G-PROBE2 Work Order 3
 * File: evidence/render-full.mjs
 * Description: Renders the complete departures screen through the U8G2GL Wasm harness
 *              against National Rail mock data (nationalRailBoard.json).
 *
 * Screen composition (matching screen_departures.xml):
 *  1. plat_box: <u8g2gl_box> [0, 0, 28, 51]
 *  2. plat_label: <u8g2gl_label> [5, 6, 18, 13], "Plat"
 *  3. plat_num: <u8g2gl_label> [4, 20, 20, 24], bound to "platform" ("9")
 *  4. header_sep: <u8g2gl_line> [30, 50, 255, 50]
 *  5. row0: <wd_service_list> [32, 0, 224, 16], primary service (19:55 London Paddington)
 *  6. message_bar: <u8g2gl_label> [30, 17, 226, 13], circular marquee bound to "message_text"
 *  7. formation: <wd_train_formation> [0, 17, 256, 32], 12 carriages with gauges & indicators
 *  8. services: <wd_service_list> [0, 51, 190, 13], secondary service row (19:38 London Victoria)
 *  9. sys_clock: <u8g2gl_clock> [190, 51, 66, 13], bound to "system_time" (19:55:00)
 *
 * Outputs:
 *  - evidence/render-full.pbm (1-bit monochrome P4 bitmap)
 *  - evidence/render-full.png (Amber OLED #FFA000 phosphor preview)
 *  - evidence/render-full.log (Execution and verification log)
 *  - Console metrics: lit pixel count, SHA-256 digest
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

// Captured log buffer for evidence/render-full.log
const logLines = [];
function log(msg = '') {
  console.log(msg);
  logLines.push(msg);
}

// ============================================================================
// 1. Ingestion of National Rail Mock Data
// ============================================================================
const mockDataPath = join(
  projectRoot,
  '.agents/skills/principal-architect-workspace/g-probe-departures/evidence/source/nationalRailBoard.json'
);
const rawData = JSON.parse(readFileSync(mockDataPath, 'utf-8'));

// Service 0 (Row 0 - Primary service):
// ["1st", "19:55", "London Paddington", "9", "On time"]
const row0Data = {
  time: String(rawData.services?.[0]?.[1] ?? '19:55'),
  dest: String(rawData.services?.[0]?.[2] ?? 'London Paddington'),
  status: String(rawData.services?.[0]?.[4] ?? 'On time')
};

// Service 1 (Secondary service in services table):
// ["2nd", "19:38", "London Victoria", "12", "19:41"]
const row1Data = {
  ordinal: String(rawData.services?.[1]?.[0] ?? '2nd'),
  time: String(rawData.services?.[1]?.[1] ?? '19:38'),
  dest: String(rawData.services?.[1]?.[2] ?? 'London Victoria'),
  status: String(rawData.services?.[1]?.[4] ?? '19:41')
};

// All 10 services from services[] array:
const allServices = rawData.services ?? [];

// Formation data (12 carriages):
const formationData = rawData.header?.firstServiceFormation ?? [];

// Message text (first message, HTML stripped, truncated to Wasm bridge limit <= 128 chars):
const rawMessage = rawData.messages?.[0] ?? '';
const cleanMessage = rawMessage.replace(/<[^>]*>/g, '').trim().slice(0, 128);

const sampleData = {
  platform: String(rawData.header?.platform ?? '9'),
  system_time: 71700, // 19:55:00 UTC = 19 * 3600 + 55 * 60
  row0_time: row0Data.time,
  row0_dest: row0Data.dest,
  row0_status: row0Data.status,
  row1_ordinal: row1Data.ordinal,
  row1_time: row1Data.time,
  row1_dest: row1Data.dest,
  row1_status: row1Data.status,
  message_text: cleanMessage
};

// ============================================================================
// 2. Scene JSON Construction
// ============================================================================
function buildFullDeparturesScene() {
  const subjects = [
    { name: 'platform', type: 'string', max_len: 8 },
    { name: 'system_time', type: 'time' },
    { name: 'row0_time', type: 'string', max_len: 16 },
    { name: 'row0_dest', type: 'string', max_len: 64 },
    { name: 'row0_status', type: 'string', max_len: 32 },
    { name: 'row1_ordinal', type: 'string', max_len: 8 },
    { name: 'row1_time', type: 'string', max_len: 16 },
    { name: 'row1_dest', type: 'string', max_len: 64 },
    { name: 'row1_status', type: 'string', max_len: 32 },
    { name: 'message_text', type: 'string', max_len: 128 }
  ];

  const elements = [];
  let objCount = 0;

  // 1. Static platform container box (<u8g2gl_box name="plat_box" x="0" y="0" width="28" height="51" filled="false" />)
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

  // 2. "Plat" label (<u8g2gl_label name="plat_label" x="5" y="6" width="18" height="13" font="u8g2_font_helvR08_tr" text="Plat" align="center" />)
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

  // 3. Platform number (<u8g2gl_label name="plat_num" x="4" y="20" width="20" height="24" font="u8g2_font_helvR08_tr" align="center" bind_text="platform" />)
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

  // 4. Header separator line (<u8g2gl_line name="header_sep" x1="30" y1="50" x2="255" y2="50" />)
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

  // 5. row0 (<wd_service_list name="row0" x="32" y="0" width="224" height="16" font="u8g2_font_6x10_mr" max_rows="1" />)
  // Replicating wd_service_list::render() layout output:
  // Col 1 (time): width 34, align left -> [32, 0, 34, 16]
  // Col 2 (dest): width 126, align left -> [66, 0, 126, 16]
  // Col 4 (status): width 60, align right -> [194, 0, 60, 16]
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

  // 6. message_bar (<u8g2gl_label name="message_bar" x="30" y="17" width="226" height="13" font="u8g2_font_6x10_mr" long_mode="scroll_circular" bind_text="message_text" />)
  elements.push({
    name: 'message_bar',
    tag: 'u8g2gl_label',
    realisation: 'object',
    class: 'u8g2gl_label',
    object: objCount++,
    parent: null,
    rect: [30, 17, 226, 13],
    properties: [
      { name: 'font', value: 'u8g2_font_6x10_mr' },
      { name: 'long_mode', value: 'scroll_circular' }
    ],
    styles: [],
    style_overrides: [],
    bindings: [
      { name: 'bind_text', subject: 'message_text', subject_type: 'string' }
    ],
    flags: []
  });

  // 7. formation (<wd_train_formation name="formation" x="0" y="17" width="256" height="32" font="u8g2_font_6x10_mr" max_carriages="12" />)
  // Replicating wd_train_formation::render() pixel arithmetic (FINDINGS-WO2 §1.2):
  // 12 carriages in [0, 17, 256, 32]: cell_w = 20, gap = 1, total_span = 251, left_margin = 2
  // Vertical: label band [y=17, h=10], carriage boxes [box_y=27, box_h=22], inner [inner_y=28, inner_h=20, inner_w=18]
  const carriageCount = Math.min(formationData.length, 12);
  const leftMargin = 2;
  const cellW = 20;
  const gap = 1;
  const boxY = 27;
  const boxH = 22;
  const innerH = 20;
  const innerW = 18;
  const innerY = 28;

  for (let i = 0; i < carriageCount; i++) {
    const c = formationData[i];
    const boxX = leftMargin + i * (cellW + gap);
    const innerX = boxX + 1;

    // 7a. Coach number label (centered at [boxX, 17, 20, 10])
    elements.push({
      name: `coach_${i}_num`,
      tag: 'u8g2gl_label',
      realisation: 'object',
      class: 'u8g2gl_label',
      object: objCount++,
      parent: null,
      rect: [boxX, 17, cellW, 10],
      properties: [
        { name: 'font', value: 'u8g2_font_6x10_mr' },
        { name: 'align', value: 'center' },
        { name: 'text', value: String(c.number ?? (i + 1)) }
      ],
      styles: [],
      style_overrides: [],
      bindings: [],
      flags: []
    });

    // 7b. Carriage box outline (1px border frame)
    elements.push({
      name: `coach_${i}_frame`,
      tag: 'u8g2gl_box',
      realisation: 'draw',
      arguments: [
        { name: 'x', value: boxX },
        { name: 'y', value: boxY },
        { name: 'width', value: cellW },
        { name: 'height', value: boxH },
        { name: 'filled', value: false },
        { name: 'radius', value: 0 }
      ],
      visibility: []
    });

    // 7c. Loading gauge (filled rectangle proportional to loading percentage)
    const pct = parseInt(String(c.loading ?? '0').replace('%', ''), 10);
    if (pct > 0) {
      let gaugeH = Math.floor((pct * innerH + 50) / 100);
      if (gaugeH === 0) gaugeH = 1;
      if (gaugeH > innerH) gaugeH = innerH;
      const gaugeY = innerY + innerH - gaugeH;

      elements.push({
        name: `coach_${i}_gauge`,
        tag: 'u8g2gl_box',
        realisation: 'draw',
        arguments: [
          { name: 'x', value: innerX },
          { name: 'y', value: gaugeY },
          { name: 'width', value: innerW },
          { name: 'height', value: gaugeH },
          { name: 'filled', value: true },
          { name: 'radius', value: 0 }
        ],
        visibility: []
      });
    }

    // 7d. Indicators (Class, Wheelchair, Bike)
    // First-class indicator: 4x4 filled box at top-left [innerX + 1, innerY + 1]
    if (c.classType === 'first') {
      elements.push({
        name: `coach_${i}_first`,
        tag: 'u8g2gl_box',
        realisation: 'draw',
        arguments: [
          { name: 'x', value: innerX + 1 },
          { name: 'y', value: innerY + 1 },
          { name: 'width', value: 4 },
          { name: 'height', value: 4 },
          { name: 'filled', value: true },
          { name: 'radius', value: 0 }
        ],
        visibility: []
      });
    }

    // Wheelchair indicator: "W" glyph at innerX + 6 with XOR draw color
    if (c.hasWheelchair) {
      const wPos = innerX + 6;
      elements.push({
        name: `coach_${i}_wheelchair`,
        tag: 'u8g2gl_label',
        realisation: 'object',
        class: 'u8g2gl_label',
        object: objCount++,
        parent: null,
        rect: [wPos, innerY + 1, 6, 10],
        properties: [
          { name: 'font', value: 'u8g2_font_6x10_mr' },
          { name: 'text', value: 'W' },
          { name: 'align', value: 'left' },
          { name: 'draw_color', value: 'xor' }
        ],
        styles: [],
        style_overrides: [],
        bindings: [],
        flags: []
      });
    }

    // Bike indicator: "B" glyph at innerX + 12 with XOR draw color
    if (c.hasBike) {
      const bPos = innerX + 12;
      elements.push({
        name: `coach_${i}_bike`,
        tag: 'u8g2gl_label',
        realisation: 'object',
        class: 'u8g2gl_label',
        object: objCount++,
        parent: null,
        rect: [bPos, innerY + 1, 6, 10],
        properties: [
          { name: 'font', value: 'u8g2_font_6x10_mr' },
          { name: 'text', value: 'B' },
          { name: 'align', value: 'left' },
          { name: 'draw_color', value: 'xor' }
        ],
        styles: [],
        style_overrides: [],
        bindings: [],
        flags: []
      });
    }
  }

  // 8. services (<wd_service_list name="services" x="0" y="51" width="190" height="13" font="u8g2_font_6x10_mr" max_rows="10" />)
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

  // 9. sys_clock (<u8g2gl_clock name="sys_clock" x="190" y="51" width="66" height="13" font="u8g2_font_6x10_mr" format="hh_mm_ss" blink="false" bind_time="system_time" />)
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

  return {
    u8g2gl_generated: 'GENERATED by g-probe2 WO3 full-screen evidence renderer',
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
  log('================================================================');
  log('   U8G2GL Full Departures Screen — Wasm Render Harness (WO3)    ');
  log('================================================================\n');

  log('1. Loading Wasm Editor Module...');
  const localWasmDir = join(projectRoot, 'build-wasm', 'wasm');
  const mainWasmDir = 'build-wasm/wasm';
  const wasmDir = existsSync(join(localWasmDir, 'u8g2gl_editor.js')) ? localWasmDir : mainWasmDir;
  const editor = await createEditor(wasmDir);
  log(`   Module loaded successfully from: ${wasmDir}\n`);

  // Step 2: Probing Generator Scene JSON if available to record Wasm harness gap
  const genScenePath = join(__dirname, 'probe-project', 'generated_editor', 'ui_scene.json');
  if (existsSync(genScenePath)) {
    log(`2. Probing Generator Scene JSON: ${genScenePath}...`);
    try {
      const rawGenScene = JSON.parse(readFileSync(genScenePath, 'utf-8'));
      rawGenScene.version = 3;
      const genOk = editor.applyScene(JSON.stringify(rawGenScene));
      if (!genOk) {
        log(`   [HARNESS GAP VERIFIED]: applyScene() refused with: "${editor.getLastError()}"`);
        log(`   Explanation: Custom C++ classes (wd_service_list, wd_train_formation) are compiled`);
        log(`   into native firmware but not registered in the precompiled Wasm harness bridge.`);
      } else {
        log(`   Generator scene applied unexpectedly!`);
      }
    } catch (err) {
      log(`   Could not test generator scene: ${err.message}`);
    }
    log();
  }

  // Step 3: Apply the full screen scene
  log('3. Applying Full Departures Screen Scene JSON...');
  const departuresScene = buildFullDeparturesScene();
  const sceneJson = JSON.stringify(departuresScene, null, 2);
  const ok = editor.applyScene(sceneJson);
  if (!ok) {
    const err = `Apply Scene Failed: ${editor.getLastError()}`;
    log(`   ${err}`);
    console.error(err);
    process.exit(1);
  }
  log('   Scene applied successfully.');

  const { width, height } = editor.getDisplaySize();
  log(`   Configured Display: ${width}x${height} (SSD1322 256x64)\n`);

  // Step 4: Apply mock data
  log('4. Applying Mock Data from nationalRailBoard.json...');
  const sampleJson = JSON.stringify(sampleData);
  if (!editor.applySampleData(sampleJson)) {
    const err = `Apply Sample Data Failed: ${editor.getLastError()}`;
    log(`   ${err}`);
    console.error(err);
    process.exit(1);
  }
  log('   Sample data applied successfully:');
  log(`   - Platform:       "${sampleData.platform}"`);
  log(`   - System Time:    ${sampleData.system_time}s (19:55:00)`);
  log(`   - Row 0 (Fast):   "${sampleData.row0_time}" | "${sampleData.row0_dest}" | "${sampleData.row0_status}"`);
  log(`   - Message Bar:    "${sampleData.message_text.slice(0, 50)}..." (${sampleData.message_text.length} chars)`);
  log(`   - Formation:      ${formationData.length} carriages ingested`);
  log(`   - Services Total: ${allServices.length} services in feed (Service 3 has null time: cancelled/delayed)`);
  log(`   - Services Row:   "${sampleData.row1_ordinal}" | "${sampleData.row1_time}" | "${sampleData.row1_dest}" | "${sampleData.row1_status}"\n`);

  // Step 5: Render frame at t=0
  log('5. Rendering Frame at t=0 ms...');
  const buffer = editor.renderFrame(0);
  if (!buffer) {
    const err = `Render Frame Failed: ${editor.getLastError()}`;
    log(`   ${err}`);
    console.error(err);
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
  log(`   Framebuffer size: ${buffer.length} bytes`);
  log(`   Lit pixels:       ${litPixels} / ${width * height} (${((litPixels / (width * height)) * 100).toFixed(2)}%)`);
  log(`   SHA-256 Digest:   ${hash}\n`);

  // Step 6: Write evidence files
  const pbmPath = join(__dirname, 'render-full.pbm');
  const pngPath = join(__dirname, 'render-full.png');
  const logPath = join(__dirname, 'render-full.log');

  writeFileSync(pbmPath, bufferToPbm(buffer, width, height));
  writeFileSync(pngPath, bufferToPng(buffer, width, height));

  log('6. Evidence Bitmaps Written:');
  log(`   - PBM Bitmap: ${pbmPath}`);
  log(`   - Amber PNG:  ${pngPath}`);
  log(`   - Log File:   ${logPath}\n`);

  log('================================================================');
  log('   Full Screen Render Completed Successfully                    ');
  log('================================================================\n');

  // Persist log file
  writeFileSync(logPath, logLines.join('\n'));
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
