import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRef, type PDFRawStream } from 'pdf-lib';
import { generateKundliPdf, type KundliAssets } from '../src/generatePdf.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, '..', 'public', 'assets');

function loadAssets(): KundliAssets {
  const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(ASSETS, p)));
  const readText = (p: string) => fs.readFileSync(path.join(ASSETS, p), 'utf8');
  return {
    frameNatalPng: read('frame_natal.png'),
    frameGocharPng: read('frame_gochar.png'),
    logoPng: read('logo.png'),
    logoPlaceJson: readText('logo_place.json'),
    cellMaskJson: readText('cell_mask.json'),
    balooFont: read('fonts/Baloo2-ExtraBold.ttf'),
    poppinsFont: read('fonts/Poppins-Regular.ttf'),
    notoFont: read('fonts/NotoSans-Regular.ttf'),
  };
}

async function generateDoc(): Promise<PDFDocument> {
  const bytes = await generateKundliPdf({
    name: 'Vinay',
    date: '2004-02-28',
    time: '09:16',
    place: 'Mumbai',
    latitude: 19.076,
    longitude: 72.8777,
    timezone: 5.5,
    gochar: '2026-11-25 09:00',
  }, loadAssets());
  return PDFDocument.load(bytes);
}

function pageContent(doc: PDFDocument): string {
  const contents = doc.getPages()[0].node.Contents() as PDFArray;
  return contents.asArray()
    .map(ref => new TextDecoder().decode(decodePDFRawStream(doc.context.lookup(ref as PDFRef) as PDFRawStream).decode()))
    .join('\n');
}

const content = pageContent(await generateDoc());

test('generated PDF has no full-page background image', () => {
  const fullPageDraw = /1190\.25 0 0 842\.25 0 0 cm[\s\S]{0,120}?\/Image-\d+ Do/;
  assert.equal(fullPageDraw.test(content), false, 'a background image is drawn across the whole page');
});

test('planet labels use only the single brown color #372e1f', () => {
  const colors = [...content.matchAll(/([0-9.]+) ([0-9.]+) ([0-9.]+) rg/g)]
    .map(m => [Number(m[1]), Number(m[2]), Number(m[3])]);

  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.001);
  const brown = [0x37 / 255, 0x2e / 255, 0x1f / 255];
  const nonPlanetColors = [
    [0.353, 0, 0.016], // header/title maroon
    [0, 0, 0],        // grid, sign numbers, lagna/text black
    [1, 1, 1],        // dasha table cells
    [0.72, 0.5, 0.2], // lagna divider lines
    brown,
  ];
  const unexpected = colors.filter(c => !nonPlanetColors.some(allowed => near(c, allowed)));

  assert.deepEqual(unexpected, [], 'unexpected text colors in generated PDF');
  assert.ok(colors.some(c => near(c, brown)), 'planet brown #372e1f is not used');
});
