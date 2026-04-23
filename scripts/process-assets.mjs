import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const canvasSize = 288;
const sourceDir = 'media/images';
const outputDir = 'media/images/processed';
const expectedRows = 5;
const expectedColumns = 5;
const minComponentPixels = 1_000;
const alphaThreshold = 8;
const framePadding = 8;
const defaultPivot = { x: 0.5, y: 1 };

const sheetFiles = {
  sheet1: join(sourceDir, 'sheet1-no-background.png'),
  sheet2: join(sourceDir, 'sheet2-no-background.png')
};

const animationDefinitions = {
  idle: {
    description: 'Calm standing idle loop.',
    loop: true,
    fps: 5,
    frames: range('sheet1', 0, 0, 5)
  },
  bored: {
    description: 'Bored loop before Amber falls asleep.',
    loop: true,
    fps: 3,
    frames: range('sheet1', 3, 0, 5)
  },
  sleep: {
    description: 'Sleeping loop after the user has been idle for a while.',
    loop: true,
    fps: 2,
    frames: range('sheet1', 4, 0, 5)
  },
  wave: {
    description: 'Greeting animation when the panel opens or Amber spawns.',
    loop: false,
    fps: 5,
    frames: range('sheet1', 2, 0, 5)
  },
  cheering: {
    description: 'Typing reaction with an excited wave.',
    loop: false,
    fps: 7,
    frames: range('sheet1', 2, 0, 5)
  },
  wow: {
    description: 'Typing reaction with a surprised expression.',
    loop: false,
    fps: 6,
    frames: range('sheet2', 2, 0, 5)
  },
  headpat: {
    description: 'Headpat animation when Amber is clicked.',
    loop: false,
    fps: 7,
    frames: range('sheet2', 0, 0, 5)
  },
  dragged: {
    description: 'Animation shown while Amber is being dragged.',
    loop: true,
    fps: 6,
    frames: range('sheet2', 1, 0, 5)
  }
};

const sheets = new Map();
const frameBounds = new Map();
const frameIds = new Map();
const frameManifestEntries = {};
let generatedFrames = 0;

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

for (const [sheetName, path] of Object.entries(sheetFiles)) {
  const png = PNG.sync.read(await readFile(path));
  sheets.set(sheetName, png);
  frameBounds.set(sheetName, detectFrameBounds(sheetName, png));
}

for (const sheetName of Object.keys(sheetFiles)) {
  for (let row = 0; row < expectedRows; row += 1) {
    for (let column = 0; column < expectedColumns; column += 1) {
      const sourceFrame = frame(sheetName, row, column);
      const id = frameId(sourceFrame);

      if (frameIds.has(id)) {
        continue;
      }

      const outputName = `${id}.png`;
      const extractedFrame = extractFrame(sourceFrame);
      await writeFile(join(outputDir, outputName), PNG.sync.write(extractedFrame.png));
      frameIds.set(id, outputName);
      frameManifestEntries[outputName] = {
        file: outputName,
        sheet: sheetName,
        row: row + 1,
        column: column + 1,
        source: extractedFrame.source,
        pivot: extractedFrame.pivot
      };
      generatedFrames += 1;
    }
  }
}

const manifest = {
  version: 1,
  frame: {
    width: canvasSize,
    height: canvasSize,
    defaultPivot
  },
  frames: frameManifestEntries,
  animations: Object.fromEntries(
    Object.entries(animationDefinitions).map(([name, definition]) => [
      name,
      {
        description: definition.description,
        loop: definition.loop,
        fps: definition.fps,
        frames: definition.frames.map((sourceFrame) => frameIds.get(frameId(sourceFrame)))
      }
    ])
  )
};

await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${generatedFrames} transparent Amber Pet frames in ${outputDir}`);

function detectFrameBounds(sheetName, png) {
  const components = findComponents(png)
    .filter((component) => component.count >= minComponentPixels)
    .sort((a, b) => a.centerY - b.centerY);

  const expectedFrames = expectedRows * expectedColumns;

  if (components.length !== expectedFrames) {
    throw new Error(`${sheetName} has ${components.length} sprite components; expected ${expectedFrames}`);
  }

  const rows = [];

  for (let index = 0; index < components.length; index += expectedColumns) {
    rows.push(components.slice(index, index + expectedColumns).sort((a, b) => a.centerX - b.centerX));
  }

  return rows;
}

function findComponents(png) {
  const visited = new Uint8Array(png.width * png.height);
  const components = [];

  for (let index = 0; index < visited.length; index += 1) {
    if (visited[index] || !hasAlpha(png, index)) {
      continue;
    }

    components.push(floodFillComponent(png, visited, index));
  }

  return components;
}

function floodFillComponent(png, visited, startIndex) {
  const queue = [startIndex];
  visited[startIndex] = 1;

  let minX = png.width;
  let minY = png.height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % png.width;
    const y = Math.floor(index / png.width);

    count += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);

    for (const [nextX, nextY] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1]
    ]) {
      if (nextX < 0 || nextX >= png.width || nextY < 0 || nextY >= png.height) {
        continue;
      }

      const nextIndex = nextY * png.width + nextX;

      if (visited[nextIndex] || !hasAlpha(png, nextIndex)) {
        continue;
      }

      visited[nextIndex] = 1;
      queue.push(nextIndex);
    }
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    centerX: minX + (maxX - minX + 1) / 2,
    centerY: minY + (maxY - minY + 1) / 2,
    count
  };
}

function extractFrame(sourceFrame) {
  const sheet = sheets.get(sourceFrame.sheet);
  const rows = frameBounds.get(sourceFrame.sheet);

  if (!sheet || !rows) {
    throw new Error(`Unknown sheet: ${sourceFrame.sheet}`);
  }

  const bounds = rows[sourceFrame.row]?.[sourceFrame.column];

  if (!bounds) {
    throw new Error(`Missing frame ${frameId(sourceFrame)}`);
  }

  const sourceX = Math.max(0, bounds.minX - framePadding);
  const sourceY = Math.max(0, bounds.minY - framePadding);
  const sourceMaxX = Math.min(sheet.width - 1, bounds.maxX + framePadding);
  const sourceMaxY = Math.min(sheet.height - 1, bounds.maxY + framePadding);
  const sourceWidth = sourceMaxX - sourceX + 1;
  const sourceHeight = sourceMaxY - sourceY + 1;

  if (sourceWidth > canvasSize || sourceHeight > canvasSize) {
    throw new Error(`${frameId(sourceFrame)} is ${sourceWidth}x${sourceHeight}; increase canvasSize`);
  }

  const output = transparentPng(canvasSize, canvasSize);
  const targetX = Math.floor((canvasSize - sourceWidth) / 2);
  const targetY = canvasSize - sourceHeight - 4;
  blit(sheet, output, sourceX, sourceY, sourceWidth, sourceHeight, targetX, targetY);
  return {
    png: output,
    source: {
      x: sourceX,
      y: sourceY,
      width: sourceWidth,
      height: sourceHeight
    },
    pivot: {
      x: round((targetX + sourceWidth * defaultPivot.x) / canvasSize),
      y: round((targetY + sourceHeight * defaultPivot.y) / canvasSize)
    }
  };
}

function range(sheet, row, startColumn, count) {
  return Array.from({ length: count }, (_, offset) => frame(sheet, row, startColumn + offset));
}

function frame(sheet, row, column) {
  return { sheet, row, column };
}

function frameId({ sheet, row, column }) {
  return `${sheet}-r${row + 1}-c${column + 1}`;
}

function round(value) {
  return Math.round(value * 10_000) / 10_000;
}

function hasAlpha(png, pixelIndex) {
  return png.data[pixelIndex * 4 + 3] > alphaThreshold;
}

function transparentPng(width, height) {
  return new PNG({
    width,
    height,
    colorType: 6,
    inputColorType: 6
  });
}

function blit(source, target, sourceX, sourceY, width, height, targetX, targetY) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceIndex = ((sourceY + y) * source.width + sourceX + x) * 4;
      const targetIndex = ((targetY + y) * target.width + targetX + x) * 4;

      target.data[targetIndex] = source.data[sourceIndex];
      target.data[targetIndex + 1] = source.data[sourceIndex + 1];
      target.data[targetIndex + 2] = source.data[sourceIndex + 2];
      target.data[targetIndex + 3] = source.data[sourceIndex + 3];
    }
  }
}
