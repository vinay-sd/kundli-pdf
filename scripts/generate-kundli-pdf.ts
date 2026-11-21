/**
 * Kundli PDF generator — recreates the "Janma Lagna Kundli + Aaj Ka Graha Gochar + Dasha" page.
 *
 *   npx tsx scripts/generate-kundli-pdf.ts --name "Vinay" --date 2004-02-28 --time 09:16 --place Mumbai
 *
 * Optional: --lat --lon --tz (defaults: Mumbai, 5.5)  --gochar "YYYY-MM-DD HH:MM" (default: now)  --out file.pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PLACES, defaultPdfFilename, generateKundliPdf, type KundliAssets } from '../src/generatePdf.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = fs.existsSync(path.join(HERE, '..', 'public', 'assets', 'cell_mask.json'))
  ? path.join(HERE, '..', 'public', 'assets')
  : path.join(HERE, '..', 'assets');

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : def;
}

function loadAssetsFromDisk(): KundliAssets {
  const read = (p: string) => new Uint8Array(fs.readFileSync(path.join(ASSETS, p)));
  const readText = (p: string) => fs.readFileSync(path.join(ASSETS, p), 'utf8');
  return {
    backgroundJpg: read('background.jpg'),
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

async function main() {
  const name = arg('name', 'Vinay')!;
  const date = arg('date', '2004-02-28')!;
  const time = arg('time', '09:16')!;
  const place = arg('place', 'Mumbai')!;
  const pre = DEFAULT_PLACES[place.toLowerCase()] ?? DEFAULT_PLACES.mumbai;
  const lat = parseFloat(arg('lat', String(pre[0]))!);
  const lon = parseFloat(arg('lon', String(pre[1]))!);
  const tz = parseFloat(arg('tz', String(pre[2]))!);
  const gochar = arg('gochar');
  const out = arg('out', path.join(HERE, '..', 'output', defaultPdfFilename(name)))!;

  const assets = loadAssetsFromDisk();
  const pdf = await generateKundliPdf({ name, date, time, place, latitude: lat, longitude: lon, timezone: tz, gochar }, assets);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, pdf);
  console.log('wrote', out);
}

main().catch(e => { console.error(e); process.exit(1); });
