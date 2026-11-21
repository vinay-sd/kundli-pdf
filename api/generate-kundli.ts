import { defaultPdfFilename, generateKundliPdf } from '../src/generatePdf';

type Req = {
  method?: string;
  body?: any;
  on: (event: string, cb: (...args: any[]) => void) => void;
};

type Res = {
  status: (code: number) => Res;
  setHeader: (name: string, value: string) => void;
  json: (body: any) => void;
  send: (body: any) => void;
  end: (body?: any) => void;
};

function readBody(req: Req): Promise<any> {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.resolve({}); }
  }
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readBody(req);
    const pdf = await generateKundliPdf({
      name: String(body.name || 'Kundli'),
      date: String(body.date || ''),
      time: String(body.time || ''),
      place: String(body.place || ''),
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      timezone: Number(body.timezone),
      tzname: body.tzname ? String(body.tzname) : 'Asia/Kolkata',
      gochar: body.gochar ? String(body.gochar) : undefined,
    });

    const filename = defaultPdfFilename(String(body.name || 'Kundli'));
    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(pdf));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate PDF';
    res.status(400).json({ error: message });
  }
}
