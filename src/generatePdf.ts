import { PDFDocument, rgb, PDFFont, PDFPage, RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKundli, type KundliData, type PlanetInfo } from './kundli.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSET_ROOTS = [
  path.join(process.cwd(), 'assets'),
  path.join(HERE, '..', 'assets'),
];
const A = (f: string) => {
  for (const root of ASSET_ROOTS) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) return p;
  }
  return path.join(ASSET_ROOTS[0], f);
};

// ───────────────────────── page + design constants (measured from sample_kundli.pdf) ─────────────────────────
const PAGE_W = 1190.25, PAGE_H = 842.25;
const Y = (top: number) => PAGE_H - top; // top-based pt → pdf y
const MAROON = rgb(0.353, 0, 0.016);
const BLACK = rgb(0, 0, 0);

const PLANET: Record<string, { ab: string; color: RGB }> = {
  Sun: { ab: 'Su', color: rgb(0.796, 0.412, 0.172) },
  Moon: { ab: 'Mo', color: rgb(0.306, 0.498, 0.674) },
  Mars: { ab: 'Ma', color: rgb(0.624, 0.133, 0.157) },
  Mercury: { ab: 'Me', color: rgb(0.176, 0.514, 0.314) },
  Jupiter: { ab: 'Ju', color: rgb(0.867, 0.694, 0.333) },
  Venus: { ab: 'Ve', color: rgb(0.726, 0.126, 0.486) },
  Saturn: { ab: 'Sa', color: rgb(0.267, 0.4, 0.824) },
  Rahu: { ab: 'Ra', color: rgb(0.184, 0.294, 0.228) },
  Ketu: { ab: 'Ke', color: rgb(0.482, 0.255, 0.118) },
  Uranus: { ab: 'Ur', color: rgb(0, 0, 0) },
  Neptune: { ab: 'Ne', color: rgb(0.216, 0.18, 0.122) },
  Pluto: { ab: 'Pl', color: rgb(0.184, 0.145, 0.114) },
};
const NATAL_ORDER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu', 'Uranus', 'Neptune', 'Pluto'];
const GOCHAR_ORDER = NATAL_ORDER.slice(0, 9);

// where the sign number sits inside each house cell: [centre-x px, baseline px] in the 895×847 frame image
const NUM_ANCHOR: Record<number, [number, number]> = {
  1: [452, 246], 2: [256, 100], 3: [133, 226], 4: [255, 447], 5: [138, 641], 6: [256, 737],
  7: [443, 597], 8: [641, 735], 9: [776, 622], 10: [657, 384], 11: [762, 226], 12: [651, 115],
};

export interface GenerateKundliPdfInput {
  name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  place: string;
  latitude: number;
  longitude: number;
  timezone: number; // hours east of UTC
  tzname?: string; // IANA tz name for deterministic dasha formatting
  gochar?: string; // "YYYY-MM-DD HH:MM"
}

export const DEFAULT_PLACES: Record<string, [number, number, number]> = {
  mumbai: [19.076, 72.8777, 5.5],
};

// ───────────────────────── cell mask / packing ─────────────────────────
interface MaskFile { w: number; h: number; step: number; rows: string[]; frame: any; cells: { slot: number; cx: number; cy: number }[]; }
type MaskData = { mask: MaskFile; FW: number; FH: number; PX: number; PY: number; INTEG: Float64Array[] };
let _maskData: MaskData | null = null;
function getMaskData(): MaskData {
  if (_maskData) return _maskData;
  const mask: MaskFile = JSON.parse(fs.readFileSync(A('cell_mask.json'), 'utf8'));
  const FW = mask.frame.w, FH = mask.frame.h;
  const PX = FW / mask.frame.imgW, PY = FH / mask.frame.imgH; // frame px → pt
  const slotAt: Uint8Array[] = mask.rows.map(r => Uint8Array.from(r, c => parseInt(c, 16)));
  // integral images (one per slot) for O(1) "is this rectangle fully inside the cell" tests
  const INTEG: Float64Array[] = [];
  for (let s = 1; s <= 12; s++) {
    const W = mask.w + 1, I = new Float64Array(W * (mask.h + 1));
    for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++)
      I[(y + 1) * W + x + 1] = (slotAt[y][x] === s ? 1 : 0) + I[y * W + x + 1] + I[(y + 1) * W + x] - I[y * W + x];
    INTEG[s] = I;
  }
  _maskData = { mask, FW, FH, PX, PY, INTEG };
  return _maskData;
}

type Rect = { x0: number; y0: number; x1: number; y1: number }; // frame-local pt (origin = frame top-left)
function inside(slot: number, r: Rect): boolean {
  const { mask, PX, PY, INTEG } = getMaskData();
  const k = 1 / (mask.step * PX), ky = 1 / (mask.step * PY);
  const x0 = Math.floor(r.x0 * k), x1 = Math.ceil(r.x1 * k), y0 = Math.floor(r.y0 * ky), y1 = Math.ceil(r.y1 * ky);
  if (x0 < 0 || y0 < 0 || x1 > mask.w || y1 > mask.h) return false;
  const W = mask.w + 1, I = INTEG[slot];
  const sum = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
  return sum === (x1 - x0) * (y1 - y0);
}
const overlap = (a: Rect, b: Rect, gap = 1.5) => a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.y0 < b.y1 + gap && a.y1 > b.y0 - gap;

interface Item { w: number; h: number; draw: (page: PDFPage, cx: number, top: number) => void; } // draw(centre x, top) in page pt
/** Pack items into one house cell. Tries bigger scales first; returns centres (frame-local pt). */
function packCell(slot: number, build: (scale: number) => Item[], obstacle: (scale: number) => Rect | null) {
  const { mask, FW, FH, PX, PY } = getMaskData();
  const cell = mask.cells.find(c => c.slot === slot)!;
  const target = { x: cell.cx * PX, y: cell.cy * PY };
  const tgt = (() => { const o = obstacle(1); return o ? { x: target.x, y: target.y + (slot % 3 === 1 ? 24 : 6) } : target; })();
  for (const scale of [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.45]) {
    const items = build(scale), obs = obstacle(scale);
    const placed: Rect[] = obs ? [obs] : [], out: { item: Item; cx: number; top: number }[] = [];
    let ok = true;
    for (const it of items) {
      let best: { x: number; y: number; d: number } | null = null;
      for (let y = 2; y < FH - it.h; y += 1.5) for (let x = 2; x < FW - it.w; x += 1.5) {
        const r = { x0: x, y0: y, x1: x + it.w, y1: y + it.h };
        const d = (x + it.w / 2 - tgt.x) ** 2 + (y + it.h / 2 - tgt.y) ** 2;
        if (best && d >= best.d) continue;
        if (!inside(slot, r) || placed.some(p => overlap(r, p))) continue;
        best = { x: x + it.w / 2, y, d };
      }
      if (!best) { ok = false; break; }
      placed.push({ x0: best.x - it.w / 2, y0: best.y, x1: best.x + it.w / 2, y1: best.y + it.h });
      out.push({ item: it, cx: best.x, top: best.y });
    }
    if (ok) return { scale, out };
  }
  throw new Error(`Could not fit planets in house cell ${slot}`);
}

// ───────────────────────── drawing helpers ─────────────────────────
interface Fonts { baloo: PDFFont; poppins: PDFFont; noto: PDFFont; }
function text(page: PDFPage, s: string, font: PDFFont, size: number, x: number, baselineTop: number, color: RGB) {
  page.drawText(s, { x, y: Y(baselineTop), size, font, color });
}
const textW = (f: PDFFont, s: string, size: number) => f.widthOfTextAtSize(s, size);
function centered(page: PDFPage, s: string, font: PDFFont, size: number, cx: number, baselineTop: number, color: RGB) {
  text(page, s, font, size, cx - textW(font, s, size) / 2, baselineTop, color);
}
/** shrink font size so text fits maxW */
const fit = (f: PDFFont, s: string, size: number, maxW: number) => Math.min(size, size * maxW / Math.max(textW(f, s, size), 0.001));

function drawTable(page: PDFPage, f: Fonts, xs: [number, number, number], rows: [string, string][], top: number, textDy: number) {
  const rh = (819.34 - 595.62) / 9;
  rows.forEach(([a, b], i) => {
    const t = top + i * rh;
    page.drawRectangle({ x: xs[0], y: Y(t + rh), width: xs[2] - xs[0], height: rh, color: rgb(1, 1, 1), borderColor: BLACK, borderWidth: 0.6 });
    page.drawLine({ start: { x: xs[1], y: Y(t) }, end: { x: xs[1], y: Y(t + rh) }, thickness: 0.6, color: BLACK });
    centered(page, a, f.baloo, 11, (xs[0] + xs[1]) / 2, t + 14.5 + textDy, BLACK);
    centered(page, b, f.baloo, 11, (xs[1] + xs[2]) / 2, t + 14.5 + textDy, BLACK);
  });
}

// ───────────────────────── chart ─────────────────────────
type Placement = { sign: number; name: string; retro: boolean; deg?: number };
function drawChart(page: PDFPage, f: Fonts, which: 'natal' | 'gochar', asc: number, bodies: Placement[]) {
  const { mask, PX, PY } = getMaskData();
  const [fx, fy] = mask.frame[which] as [number, number];
  const slotOfSign = (sign: number) => ((sign - asc + 12) % 12) + 1;
  for (let slot = 1; slot <= 12; slot++) {
    const sign = ((asc - 1 + slot - 1) % 12) + 1;
    const [nx, nb] = NUM_ANCHOR[slot];
    const numStr = String(sign), numSize = 20;
    const ncx = nx * PX, nbase = nb * PY, nw = textW(f.baloo, numStr, numSize);
    const numRect = (): Rect => ({ x0: ncx - nw / 2 - 2, x1: ncx + nw / 2 + 2, y0: nbase - 15, y1: nbase + 3 });
    const mine = bodies.filter(b => slotOfSign(b.sign) === slot);

    const build = (s: number): Item[] => mine.map(b => {
      const P = PLANET[b.name] ?? { ab: b.name.slice(0, 2), color: BLACK };
      const size = (which === 'natal' ? 15 : 20) * s;
      const rW = b.retro ? textW(f.noto, 'ᴿ', size) : 0, nW = textW(f.baloo, P.ab, size);
      const degStr = b.deg != null ? `${b.deg.toFixed(2)}°` : '';
      const w = Math.max(nW + rW, degStr ? textW(f.baloo, degStr, size) : 0) + 2;
      const h = which === 'natal' ? 25 * s + 9 * s : 14.5 * s + 2;
      return {
        w, h, draw: (pg, cx, top) => {
          const base = top + size * 0.74; // cap-height → baseline
          const x0 = cx - (nW + rW) / 2;
          text(pg, P.ab, f.baloo, size, x0, base, P.color);
          if (b.retro) text(pg, 'ᴿ', f.noto, size, x0 + nW, base, P.color);
          if (degStr) centered(pg, degStr, f.baloo, size, cx, base + 21 * s, P.color);
        },
      };
    });
    const { out } = mine.length ? packCell(slot, build, () => numRect()) : { out: [] as { item: Item; cx: number; top: number }[] };
    centered(page, numStr, f.baloo, numSize, fx + ncx, fy + nbase, BLACK);
    for (const o of out) o.item.draw(page, fx + o.cx, fy + o.top);
  }
}

function resolveGochar(input: GenerateKundliPdfInput): { gd: string; gt: string } {
  if (input.gochar) {
    const [gd, gt] = input.gochar.split(/[ T]/);
    return { gd, gt: gt || '00:00' };
  }
  const n = new Date(Date.now() + input.timezone * 3600000);
  const p = (v: number) => String(v).padStart(2, '0');
  return {
    gd: `${n.getUTCFullYear()}-${p(n.getUTCMonth() + 1)}-${p(n.getUTCDate())}`,
    gt: `${p(n.getUTCHours())}:${p(n.getUTCMinutes())}`,
  };
}

export async function generateKundliPdf(input: GenerateKundliPdfInput): Promise<Uint8Array> {
  const prevTz = process.env.TZ;
  process.env.TZ = input.tzname || 'Asia/Kolkata';
  try {
    const natal: KundliData = generateKundli({
      name: input.name,
      date: input.date,
      time: input.time,
      timezone: input.timezone,
      latitude: input.latitude,
      longitude: input.longitude,
      placeName: input.place,
    });

    const { gd, gt } = resolveGochar(input);
    const transit = generateKundli({
      name: 'Gochar',
      date: gd,
      time: gt,
      timezone: input.timezone,
      latitude: input.latitude,
      longitude: input.longitude,
      placeName: input.place,
    });
    const asc = natal.ascendantSign; // gochar uses the SAME lagna as the natal chart

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const f: Fonts = {
      baloo: await doc.embedFont(fs.readFileSync(A('fonts/Baloo2-ExtraBold.ttf')), { subset: true }),
      poppins: await doc.embedFont(fs.readFileSync(A('fonts/Poppins-Regular.ttf')), { subset: true }),
      noto: await doc.embedFont(fs.readFileSync(A('fonts/NotoSans-Regular.ttf')), { subset: true }),
    };
    const page = doc.addPage([PAGE_W, PAGE_H]);

    // background + logo
    page.drawImage(await doc.embedJpg(fs.readFileSync(A('background.jpg'))), { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    const lp = JSON.parse(fs.readFileSync(A('logo_place.json'), 'utf8'));
    page.drawImage(await doc.embedPng(fs.readFileSync(A('logo.png'))), { x: lp.x, y: Y(lp.top + lp.h), width: lp.w, height: lp.h });

    // header row (centred)
    const hdr = [
      { s: input.name, font: f.baloo, size: 30, color: MAROON, base: 72.84 },
      { s: `Date of Birth: ${input.date}`, font: f.poppins, size: 16.62, color: MAROON, base: 70.96 },
      { s: `Birth Time: ${input.time}`, font: f.poppins, size: 16.62, color: MAROON, base: 70.96 },
      { s: `Birth Place: ${input.place}`, font: f.poppins, size: 16.62, color: MAROON, base: 70.96 },
    ];
    const gaps = [55.7, 36, 36];
    let total = hdr.reduce((a, h) => a + textW(h.font, h.s, h.size), 0) + gaps.reduce((a, b) => a + b, 0);
    const k = Math.min(1, 1000 / total);
    if (k < 1) { hdr.forEach(h => (h.size *= k)); total *= k; }
    let hx = 595.1 - total / 2;
    hdr.forEach((h, i) => { text(page, h.s, h.font, h.size, hx, h.base, h.color); hx += textW(h.font, h.s, h.size) + (gaps[i] ?? 0) * k; });

    // titles
    const { mask, FW, FH } = getMaskData();
    const [nfx] = mask.frame.natal, [gfx] = mask.frame.gochar;
    centered(page, 'Janma Lagna Kundli', f.baloo, 42, nfx + FW / 2 - 3.4, 155.29, MAROON);
    centered(page, 'Aaj Ka Graha Gochar', f.baloo, 42, gfx + FW / 2 - 3.4, 155.29, MAROON);

    // chart frames
    const [fnx, fny] = mask.frame.natal as [number, number], [fgx, fgy] = mask.frame.gochar as [number, number];
    page.drawImage(await doc.embedPng(fs.readFileSync(A('frame_natal.png'))), { x: fnx, y: Y(fny + FH), width: FW, height: FH });
    page.drawImage(await doc.embedPng(fs.readFileSync(A('frame_gochar.png'))), { x: fgx, y: Y(fgy + FH), width: FW, height: FH });

    // natal planets WITH degrees (degree-in-sign, 2 dp)  /  gochar planets, names only
    const pick = (kData: KundliData, order: string[]) => order.map(n => kData.planets.find(p => p.key === n)).filter(Boolean) as PlanetInfo[];
    drawChart(page, f, 'natal', asc, pick(natal, NATAL_ORDER).map(p => ({ sign: p.currentSign, name: p.key, retro: p.isRetro, deg: p.normDegree })));
    drawChart(page, f, 'gochar', asc, pick(transit, GOCHAR_ORDER).map(p => ({ sign: p.currentSign, name: p.key, retro: p.isRetro })));

    // Lagna degree — OUTSIDE the kundli (left margin)
    {
      const cx = 92, deg = natal.lagna.longitude % 30, W = 140;
      page.drawLine({ start: { x: cx - 52, y: Y(300) }, end: { x: cx + 52, y: Y(300) }, thickness: 1, color: rgb(0.72, 0.5, 0.2) });
      centered(page, 'Lagna', f.baloo, 20, cx, 328, MAROON);
      centered(page, natal.ascendantSignName, f.baloo, fit(f.baloo, natal.ascendantSignName, 28, W), cx, 358, MAROON);
      centered(page, `${deg.toFixed(2)}°`, f.baloo, 30, cx, 392, MAROON);
      centered(page, `${natal.lagna.nakshatraName} · Pada ${natal.lagna.pada}`, f.poppins, fit(f.poppins, `${natal.lagna.nakshatraName} · Pada ${natal.lagna.pada}`, 12, W), cx, 414, MAROON);
      page.drawLine({ start: { x: cx - 52, y: Y(426) }, end: { x: cx + 52, y: Y(426) }, thickness: 1, color: rgb(0.72, 0.5, 0.2) });
    }

    // dasha
    text(page, 'Maha', f.baloo, 49.98, 84.17, 686.05, MAROON); text(page, 'dasha', f.baloo, 49.98, 84.17, 755.78, MAROON);
    text(page, 'Antar', f.baloo, 49.98, 643.66, 693.81, MAROON); text(page, 'dasha', f.baloo, 49.98, 643.66, 763.54, MAROON);
    const row = (d: { lord: string; startStr: string; endStr: string }): [string, string] => [d.lord, `${d.startStr} → ${d.endStr}`];
    drawTable(page, f, [237.16, 314.51, 558.34], natal.dasha.mahaDasas.slice(0, 9).map(row), 595.62, 0);
    drawTable(page, f, [792.58, 869.93, 1113.75], natal.dasha.antarDasas.slice(0, 9).map(row), 595.62, 0.6);

    doc.setTitle(`Janma Kundli — ${input.name}`);
    doc.setAuthor('Astrochitra');
    doc.setSubject(`Gochar as on ${gd} ${gt} (UTC${input.timezone >= 0 ? '+' : ''}${input.timezone})`);
    return await doc.save();
  } finally {
    if (prevTz === undefined) delete process.env.TZ;
    else process.env.TZ = prevTz;
  }
}

export function defaultPdfFilename(name: string) {
  return `kundli_${name.replace(/\W+/g, '_') || 'chart'}.pdf`;
}
