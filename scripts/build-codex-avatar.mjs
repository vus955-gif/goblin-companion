import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const sourceSvgPath = resolve(projectRoot, 'assets', 'goblin.svg');
const outputDir = resolve(projectRoot, 'assets', 'codex-avatar', 'goblin-companion');
const spritesheetPath = resolve(outputDir, 'spritesheet.png');
const manifestPath = resolve(outputDir, 'avatar.json');
const metadataPath = resolve(outputDir, 'spritesheet.meta.json');

const FRAME_WIDTH = 192;
const FRAME_HEIGHT = 208;
const SHEET_COLUMNS = 8;
const SHEET_ROWS = 9;
const SHEET_WIDTH = FRAME_WIDTH * SHEET_COLUMNS;
const SHEET_HEIGHT = FRAME_HEIGHT * SHEET_ROWS;

const CODEX_STATE_ROWS = Object.freeze({
  idle: 0,
  'running-right': 1,
  'running-left': 2,
  waving: 3,
  jumping: 4,
  failed: 5,
  waiting: 6,
  running: 7,
  review: 8,
});

const MANIFEST = Object.freeze({
  id: 'goblin-companion',
  displayName: 'Goblin Companion',
  description: 'A snarky pixel goblin coding companion for the native Codex avatar overlay.',
  spritesheetPath: 'spritesheet.png',
});

function rgba(hex, alpha = 255) {
  const value = hex.replace('#', '');

  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`Invalid color: ${hex}`);
  }

  return Object.freeze({
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
    a: alpha,
  });
}

const COLOR = Object.freeze({
  transparent: rgba('#000000', 0),
  outline: rgba('#020403'),
  skin: rgba('#a7e03f'),
  skinLight: rgba('#c2f060'),
  skinShadow: rgba('#76a733'),
  skinDeep: rgba('#557d2a'),
  hat: rgba('#5d9c39'),
  hatLight: rgba('#7bbb4a'),
  hatDark: rgba('#305e28'),
  hatDeep: rgba('#1d3d1f'),
  satchel: rgba('#764a2d'),
  satchelLight: rgba('#bd8644'),
  satchelDark: rgba('#3f281f'),
  eye: rgba('#020403'),
  laptop: rgba('#222733'),
  laptopLight: rgba('#6f87a5'),
  laptopScreen: rgba('#9bd2ff'),
  token: rgba('#d9aa3d'),
  tokenLight: rgba('#ffe16a'),
  tokenDark: rgba('#8c6420'),
  puke: rgba('#a6ef4f'),
  pukeDark: rgba('#65b332'),
  alert: rgba('#f04747'),
  white: rgba('#f4f6e8'),
  shadow: rgba('#000000', 58),
});

function applyAlpha(color, alpha) {
  if (alpha === undefined || alpha === null) {
    return color;
  }

  return { ...color, a: Math.max(0, Math.min(255, Math.round(color.a * alpha))) };
}

function createSurface(width, height) {
  return {
    width,
    height,
    pixels: Buffer.alloc(width * height * 4, 0),
  };
}

function blendPixel(surface, x, y, color) {
  if (x < 0 || y < 0 || x >= surface.width || y >= surface.height || color.a <= 0) {
    return;
  }

  const offset = (y * surface.width + x) * 4;

  if (color.a >= 255) {
    surface.pixels[offset] = color.r;
    surface.pixels[offset + 1] = color.g;
    surface.pixels[offset + 2] = color.b;
    surface.pixels[offset + 3] = 255;
    return;
  }

  const sourceAlpha = color.a / 255;
  const destinationAlpha = surface.pixels[offset + 3] / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);

  if (outputAlpha <= 0) {
    surface.pixels[offset] = 0;
    surface.pixels[offset + 1] = 0;
    surface.pixels[offset + 2] = 0;
    surface.pixels[offset + 3] = 0;
    return;
  }

  surface.pixels[offset] = Math.round(
    (color.r * sourceAlpha + surface.pixels[offset] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha,
  );
  surface.pixels[offset + 1] = Math.round(
    (color.g * sourceAlpha + surface.pixels[offset + 1] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha,
  );
  surface.pixels[offset + 2] = Math.round(
    (color.b * sourceAlpha + surface.pixels[offset + 2] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha,
  );
  surface.pixels[offset + 3] = Math.round(outputAlpha * 255);
}

function drawRect(surface, x, y, width, height, color) {
  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const right = Math.min(surface.width, Math.round(x + width));
  const bottom = Math.min(surface.height, Math.round(y + height));

  for (let yy = top; yy < bottom; yy += 1) {
    for (let xx = left; xx < right; xx += 1) {
      blendPixel(surface, xx, yy, color);
    }
  }
}

function createFrameContext(surface, column, row, options = {}) {
  const originX = column * FRAME_WIDTH;
  const originY = row * FRAME_HEIGHT;
  const mirror = Boolean(options.mirror);
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;

  return {
    rect(x, y, width, height, color, alpha) {
      const localX = x + offsetX;
      const localY = y + offsetY;
      const finalX = mirror ? FRAME_WIDTH - localX - width : localX;
      drawRect(surface, originX + finalX, originY + localY, width, height, applyAlpha(color, alpha));
    },
    rawRect(x, y, width, height, color, alpha) {
      drawRect(surface, originX + x, originY + y, width, height, applyAlpha(color, alpha));
    },
  };
}

function shiftedContext(ctx, dx, dy) {
  return {
    rect(x, y, width, height, color, alpha) {
      ctx.rect(x + dx, y + dy, width, height, color, alpha);
    },
    rawRect(x, y, width, height, color, alpha) {
      ctx.rawRect(x + dx, y + dy, width, height, color, alpha);
    },
  };
}

function drawPixelDisk(ctx, x, y, strips, color, shadeColor = null) {
  for (const strip of strips) {
    ctx.rect(x + strip.x, y + strip.y, strip.w, strip.h, color);
  }

  if (shadeColor) {
    const last = strips.at(-1);
    const mid = strips[Math.floor(strips.length / 2)];
    ctx.rect(x + mid.x + mid.w - 8, y + mid.y + 4, 6, mid.h - 6, shadeColor, 0.35);
    ctx.rect(x + last.x + 8, y + last.y, last.w - 16, 4, shadeColor, 0.45);
  }
}

function drawShadow(ctx, y = 0) {
  const strips = [
    { x: 56, y: 186 + y, w: 78, h: 4 },
    { x: 42, y: 190 + y, w: 110, h: 6 },
    { x: 52, y: 196 + y, w: 90, h: 4 },
  ];

  drawPixelDisk(ctx, 0, 0, strips, COLOR.shadow);
}

function drawHat(ctx, pose = {}) {
  const lean = pose.hatLean ?? 0;

  // Czapka jest rysowana z osobnych prostokatow, bo Codex oczekuje bitmapowego
  // spritesheetu, a nie animowanego SVG. Zachowujemy jednak sylwetke ze zrodla.
  ctx.rect(46 + lean, 26, 54, 10, COLOR.outline);
  ctx.rect(38 + lean, 36, 82, 12, COLOR.outline);
  ctx.rect(30 + lean, 48, 104, 12, COLOR.outline);
  ctx.rect(20 + lean, 56, 30, 18, COLOR.outline);
  ctx.rect(40 + lean, 60, 104, 14, COLOR.outline);
  ctx.rect(54 + lean, 72, 106, 16, COLOR.outline);
  ctx.rect(50 + lean, 86, 118, 14, COLOR.outline);

  ctx.rect(50 + lean, 30, 46, 8, COLOR.hatLight);
  ctx.rect(42 + lean, 40, 72, 10, COLOR.hat);
  ctx.rect(34 + lean, 52, 94, 10, COLOR.hat);
  ctx.rect(24 + lean, 58, 24, 12, COLOR.hatLight);
  ctx.rect(46 + lean, 64, 92, 10, COLOR.hat);
  ctx.rect(58 + lean, 76, 96, 10, COLOR.hat);
  ctx.rect(54 + lean, 88, 108, 8, COLOR.hatDark);

  ctx.rect(62 + lean, 42, 36, 8, COLOR.hatLight, 0.55);
  ctx.rect(76 + lean, 54, 32, 8, COLOR.hatLight, 0.45);
  ctx.rect(96 + lean, 66, 30, 8, COLOR.hatDark, 0.35);
  ctx.rect(70 + lean, 72, 46, 14, COLOR.hatDark, 0.35);
  ctx.rect(108 + lean, 82, 36, 6, COLOR.hatDeep, 0.45);
}

function drawLegs(ctx, pose = {}) {
  const step = pose.step ?? 0;
  const hop = pose.hop ?? 0;
  const leftShift = step % 2 === 0 ? -5 : 4;
  const rightShift = step % 2 === 0 ? 5 : -4;

  ctx.rect(64 + leftShift, 154 + hop, 18, 28, COLOR.outline);
  ctx.rect(62 + leftShift, 180 + hop, 26, 10, COLOR.outline);
  ctx.rect(104 + rightShift, 154 + hop, 18, 28, COLOR.outline);
  ctx.rect(104 + rightShift, 180 + hop, 28, 10, COLOR.outline);

  ctx.rect(68 + leftShift, 156 + hop, 12, 26, COLOR.skin);
  ctx.rect(66 + leftShift, 180 + hop, 22, 6, COLOR.skin);
  ctx.rect(108 + rightShift, 156 + hop, 12, 26, COLOR.skin);
  ctx.rect(108 + rightShift, 180 + hop, 24, 6, COLOR.skin);
}

function drawBodyAndHead(ctx, pose = {}) {
  const blink = Boolean(pose.blink);
  const mouth = pose.mouth ?? 'neutral';

  ctx.rect(56, 86, 76, 16, COLOR.outline);
  ctx.rect(50, 98, 96, 24, COLOR.outline);
  ctx.rect(56, 120, 88, 24, COLOR.outline);
  ctx.rect(64, 140, 62, 24, COLOR.outline);
  ctx.rect(68, 152, 50, 18, COLOR.outline);
  ctx.rect(134, 104, 32, 30, COLOR.outline);
  ctx.rect(150, 116, 20, 18, COLOR.outline);
  ctx.rect(46, 116, 18, 22, COLOR.outline);

  ctx.rect(60, 90, 68, 12, COLOR.skin);
  ctx.rect(54, 102, 88, 20, COLOR.skin);
  ctx.rect(60, 124, 80, 18, COLOR.skin);
  ctx.rect(68, 144, 54, 20, COLOR.skin);
  ctx.rect(72, 154, 42, 12, COLOR.skin);
  ctx.rect(134, 108, 28, 22, COLOR.skin);
  ctx.rect(150, 118, 16, 12, COLOR.skin);
  ctx.rect(50, 118, 14, 16, COLOR.skinLight);

  ctx.rect(60, 92, 48, 8, COLOR.skinLight, 0.55);
  ctx.rect(58, 122, 20, 16, COLOR.skinLight, 0.35);
  ctx.rect(112, 126, 28, 14, COLOR.skinShadow, 0.42);
  ctx.rect(70, 144, 18, 20, COLOR.skinShadow, 0.35);
  ctx.rect(134, 126, 22, 4, COLOR.skinShadow, 0.35);

  if (blink) {
    ctx.rect(118, 108, 12, 4, COLOR.eye);
  } else {
    ctx.rect(118, 106, 10, 12, COLOR.eye);
  }

  if (mouth === 'sad') {
    ctx.rect(132, 134, 16, 4, COLOR.outline);
    ctx.rect(128, 138, 6, 4, COLOR.outline);
  } else if (mouth === 'chew') {
    ctx.rect(132, 132, 10, 4, COLOR.outline);
    ctx.rect(142, 136, 8, 4, COLOR.outline);
  } else if (mouth === 'sick') {
    ctx.rect(132, 134, 20, 4, COLOR.outline);
  } else {
    ctx.rect(130, 132, 16, 4, COLOR.outline);
  }
}

function drawDownArms(ctx, pose = {}) {
  const swing = pose.armSwing ?? 0;

  ctx.rect(50 - swing, 130, 18, 42, COLOR.outline);
  ctx.rect(54 - swing, 132, 12, 36, COLOR.skin);
  ctx.rect(126 + swing, 132, 18, 36, COLOR.outline);
  ctx.rect(130 + swing, 134, 12, 30, COLOR.skin);
}

function drawRaisedArms(ctx, pose = {}) {
  const wave = pose.wave ?? 0;
  const rightLift = wave % 2 === 0 ? 0 : -8;

  ctx.rect(56, 118, 16, 18, COLOR.outline);
  ctx.rect(44, 92, 18, 34, COLOR.outline);
  ctx.rect(60, 120, 10, 16, COLOR.skin);
  ctx.rect(48, 94, 12, 30, COLOR.skinLight);

  ctx.rect(124, 118 + rightLift, 16, 18, COLOR.outline);
  ctx.rect(140, 86 + rightLift, 18, 38, COLOR.outline);
  ctx.rect(128, 120 + rightLift, 10, 16, COLOR.skin);
  ctx.rect(144, 88 + rightLift, 12, 34, COLOR.skinLight);
}

function drawTypingArms(ctx, pose = {}) {
  const tap = pose.tap ?? 0;

  ctx.rect(58, 128, 30, 16, COLOR.outline);
  ctx.rect(62, 130, 26, 10, COLOR.skin);
  ctx.rect(112, 128 + tap, 30, 16, COLOR.outline);
  ctx.rect(114, 130 + tap, 24, 10, COLOR.skin);
}

function drawSatchel(ctx) {
  ctx.rect(76, 132, 54, 18, COLOR.satchelDark);
  ctx.rect(78, 134, 50, 14, COLOR.satchelLight);
  ctx.rect(72, 146, 66, 28, COLOR.outline);
  ctx.rect(76, 148, 58, 22, COLOR.satchel);
  ctx.rect(98, 144, 22, 8, COLOR.satchelLight);
  ctx.rect(76, 166, 58, 6, COLOR.satchelDark, 0.45);
}

function drawLaptop(ctx, pose = {}) {
  const glow = pose.tap % 2 === 0 ? 0.75 : 0.45;

  ctx.rect(70, 122, 58, 38, COLOR.outline);
  ctx.rect(74, 126, 50, 30, COLOR.laptop);
  ctx.rect(78, 130, 42, 18, COLOR.laptopScreen, glow);
  ctx.rect(76, 152, 52, 8, COLOR.laptopLight, 0.55);
  ctx.rect(84, 154, 8, 2, COLOR.outline, 0.5);
  ctx.rect(98, 154, 8, 2, COLOR.outline, 0.5);
  ctx.rect(112, 154, 8, 2, COLOR.outline, 0.5);
}

function drawToken(ctx, pose = {}) {
  const lift = pose.tokenLift ?? 0;
  const chew = pose.chew ?? 0;
  const x = 100 + Math.min(12, lift);
  const y = 116 - lift + (chew % 2);
  const strips = [
    { x: 8, y: 0, w: 22, h: 4 },
    { x: 4, y: 4, w: 30, h: 6 },
    { x: 0, y: 10, w: 38, h: 18 },
    { x: 4, y: 28, w: 30, h: 6 },
    { x: 8, y: 34, w: 22, h: 4 },
  ];

  drawPixelDisk(ctx, x, y, strips, COLOR.token, COLOR.tokenDark);
  ctx.rect(x + 12, y + 16, 14, 4, COLOR.tokenDark);
  ctx.rect(x + 17, y + 11, 4, 14, COLOR.tokenDark);
  ctx.rect(x + 8, y + 4, 18, 4, COLOR.tokenLight, 0.7);
}

function drawPuke(ctx, pose = {}) {
  const frame = pose.frame ?? 0;
  const stream = 18 + (frame % 4) * 8;

  ctx.rect(146, 134, stream, 8, COLOR.puke);
  ctx.rect(154, 142, Math.max(8, stream - 12), 8, COLOR.pukeDark);
  ctx.rect(160 + stream * 0.55, 148, 20, 10, COLOR.puke);
  ctx.rect(170 + stream * 0.55, 160, 12, 8, COLOR.pukeDark);
}

function drawTear(ctx) {
  ctx.rect(126, 118, 4, 8, COLOR.laptopScreen);
  ctx.rect(124, 126, 8, 10, COLOR.laptopScreen, 0.82);
}

const GLYPHS = Object.freeze({
  '!': ['1', '1', '1', '0', '1'],
  '+': ['000', '010', '111', '010', '000'],
  '1': ['010', '110', '010', '010', '111'],
  Z: ['111', '001', '010', '100', '111'],
});

function drawGlyph(ctx, glyph, x, y, scale, color) {
  const pattern = GLYPHS[glyph];

  if (!pattern) {
    return 0;
  }

  for (let row = 0; row < pattern.length; row += 1) {
    for (let column = 0; column < pattern[row].length; column += 1) {
      if (pattern[row][column] === '1') {
        ctx.rawRect(x + column * scale, y + row * scale, scale, scale, color);
      }
    }
  }

  return pattern[0].length * scale + scale;
}

function drawPixelText(ctx, text, x, y, scale, color) {
  let cursor = x;

  for (const character of text) {
    cursor += drawGlyph(ctx, character, cursor, y, scale, color);
  }
}

function drawSleepMarks(ctx, frame) {
  const rise = frame % 3;
  drawPixelText(ctx, 'Z', 138, 72 - rise * 2, 4, COLOR.white);
  drawPixelText(ctx, 'Z', 154, 54 - rise * 2, 3, COLOR.white);
  drawPixelText(ctx, 'Z', 168, 40 - rise * 2, 2, COLOR.white);
}

function drawAlertMarks(ctx, frame) {
  const bounce = frame % 2 === 0 ? 0 : -4;
  drawPixelText(ctx, '!', 44, 60 + bounce, 6, COLOR.alert);
  drawPixelText(ctx, '!', 154, 52 - bounce, 5, COLOR.alert);
}

function drawSparkles(ctx, frame) {
  const shift = frame % 2 === 0 ? 0 : 3;
  ctx.rawRect(38, 80 + shift, 6, 18, COLOR.tokenLight);
  ctx.rawRect(32, 86 + shift, 18, 6, COLOR.tokenLight);
  ctx.rawRect(152, 76 - shift, 6, 16, COLOR.tokenLight);
  ctx.rawRect(147, 81 - shift, 16, 6, COLOR.tokenLight);
}

function drawGoblin(ctx, pose = {}) {
  const character = shiftedContext(ctx, pose.x ?? 0, pose.y ?? 0);
  drawShadow(ctx, pose.shadowY ?? 0);
  drawLegs(character, { step: pose.step ?? 0, hop: pose.legHop ?? 0 });
  drawBodyAndHead(character, {
    blink: pose.blink,
    mouth: pose.mouth,
  });

  if (pose.armPose === 'raised') {
    drawRaisedArms(character, pose);
  } else if (pose.armPose === 'typing') {
    drawTypingArms(character, pose);
  } else {
    drawDownArms(character, pose);
  }

  if (pose.laptop) {
    drawLaptop(character, pose);
  } else if (pose.token) {
    drawToken(character, pose);
    drawSatchel(character);
  } else {
    drawSatchel(character);
  }

  drawHat(character, pose);

  if (pose.puke) {
    drawPuke(character, pose);
  }

  if (pose.tear) {
    drawTear(character);
  }
}

function fillRow(surface, row, drawFrame) {
  for (let column = 0; column < SHEET_COLUMNS; column += 1) {
    drawFrame(createFrameContext(surface, column, row), column);
  }
}

function buildSpritesheet() {
  const surface = createSurface(SHEET_WIDTH, SHEET_HEIGHT);

  fillRow(surface, CODEX_STATE_ROWS.idle, (ctx, frame) => {
    const bob = [0, 1, 0, -1, 0, 0, 1, 0][frame];
    drawGoblin(ctx, {
      y: bob,
      blink: frame === 4,
      hatLean: frame === 2 ? 1 : 0,
      mouth: 'neutral',
    });
  });

  fillRow(surface, CODEX_STATE_ROWS['running-right'], (ctx, frame) => {
    drawGoblin(ctx, {
      x: [-3, 0, 3, 2, -2, 0, 3, 1][frame],
      y: [0, -2, 0, 1, 0, -2, 0, 1][frame],
      step: frame,
      armSwing: frame % 2 === 0 ? -4 : 4,
      mouth: 'neutral',
    });
  });

  fillRow(surface, CODEX_STATE_ROWS['running-left'], (ctx, frame) => {
    const mirrored = createFrameContext(surface, frame, CODEX_STATE_ROWS['running-left'], { mirror: true });
    drawGoblin(mirrored, {
      x: [-3, 0, 3, 2, -2, 0, 3, 1][frame],
      y: [0, -2, 0, 1, 0, -2, 0, 1][frame],
      step: frame,
      armSwing: frame % 2 === 0 ? -4 : 4,
      mouth: 'neutral',
    });
  });

  fillRow(surface, CODEX_STATE_ROWS.waving, (ctx, frame) => {
    drawGoblin(ctx, {
      y: [0, -2, -1, 0, 0, -2, -1, 0][frame],
      armPose: frame % 2 === 0 ? 'raised' : 'down',
      wave: frame,
      mouth: frame % 3 === 0 ? 'chew' : 'neutral',
    });
  });

  fillRow(surface, CODEX_STATE_ROWS.jumping, (ctx, frame) => {
    drawGoblin(ctx, {
      y: [0, -8, -16, -9, -2, 0, -7, -12][frame],
      legHop: frame === 2 ? -2 : 0,
      armPose: 'raised',
      wave: frame,
      mouth: 'chew',
      shadowY: frame === 2 ? 4 : 0,
    });
    drawSparkles(ctx, frame);
  });

  fillRow(surface, CODEX_STATE_ROWS.failed, (ctx, frame) => {
    drawGoblin(ctx, {
      y: frame % 2 === 0 ? 1 : 0,
      mouth: 'sick',
      puke: true,
      frame,
      tear: frame > 3,
      hatLean: frame % 2 === 0 ? -1 : 1,
    });
    drawAlertMarks(ctx, frame);
  });

  fillRow(surface, CODEX_STATE_ROWS.waiting, (ctx, frame) => {
    drawGoblin(ctx, {
      y: [2, 3, 2, 1, 2, 3, 2, 1][frame],
      blink: true,
      mouth: frame % 2 === 0 ? 'sad' : 'neutral',
      tear: frame >= 4,
      hatLean: -1,
    });
    drawSleepMarks(ctx, frame);
  });

  fillRow(surface, CODEX_STATE_ROWS.running, (ctx, frame) => {
    drawGoblin(ctx, {
      y: frame % 2 === 0 ? 0 : -1,
      armPose: 'typing',
      laptop: true,
      tap: frame % 2,
      step: frame,
      mouth: 'neutral',
    });
  });

  fillRow(surface, CODEX_STATE_ROWS.review, (ctx, frame) => {
    drawGoblin(ctx, {
      y: [0, -6, -12, -6, 0, -4, 0, -8][frame],
      armPose: 'raised',
      wave: frame + 1,
      mouth: 'chew',
      shadowY: frame === 2 ? 4 : 0,
    });
    drawSparkles(ctx, frame + 1);
  });

  return surface;
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodePng(surface) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(surface.width, 0);
  header.writeUInt32BE(surface.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = surface.width * 4;
  const scanlines = Buffer.alloc((stride + 1) * surface.height);

  // Kazdy wiersz PNG poprzedzamy filtrem 0, zeby zachowac prosty i
  // deterministyczny zapis bez zalezności od bibliotek graficznych.
  for (let y = 0; y < surface.height; y += 1) {
    const targetOffset = y * (stride + 1);
    scanlines[targetOffset] = 0;
    surface.pixels.copy(scanlines, targetOffset + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function hashOptionalSource() {
  try {
    const source = await readFile(sourceSvgPath, 'utf8');
    return createHash('sha256').update(source).digest('hex').slice(0, 16);
  } catch {
    return null;
  }
}

const surface = buildSpritesheet();
const sourceHash = await hashOptionalSource();
const manifest = {
  ...MANIFEST,
};

const metadata = {
  sourceSvg: sourceHash ? `assets/goblin.svg#sha256-${sourceHash}` : 'assets/goblin.svg',
  codexSpritesheet: {
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    columns: SHEET_COLUMNS,
    rows: SHEET_ROWS,
    width: SHEET_WIDTH,
    height: SHEET_HEIGHT,
    stateRows: CODEX_STATE_ROWS,
  },
};

await mkdir(outputDir, { recursive: true });
await writeFile(spritesheetPath, encodePng(surface));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');

console.log(`Built ${relative(projectRoot, spritesheetPath)} (${SHEET_WIDTH}x${SHEET_HEIGHT})`);
console.log(`Wrote ${relative(projectRoot, manifestPath)}`);
console.log(`Wrote ${relative(projectRoot, metadataPath)}`);
