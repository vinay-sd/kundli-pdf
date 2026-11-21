type Req = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  on: (event: string, cb: (...args: any[]) => void) => void;
};

type Res = {
  status: (code: number) => Res;
  setHeader: (name: string, value: string) => void;
  json: (body: any) => void;
};

function getQuery(req: Req, key: string): string {
  const v = req.query?.[key];
  if (Array.isArray(v)) return v[0] || '';
  return v || '';
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const q = getQuery(req, 'q').trim();
  if (!q) {
    res.status(400).json({ error: 'Missing q parameter' });
    return;
  }

  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
    const geoRes = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'kundli-pdf-app/1.0 (contact: local-app)',
        'Accept': 'application/json',
      },
    });
    if (!geoRes.ok) {
      res.status(502).json({ error: 'Geocoding service failed' });
      return;
    }
    const geoData = await geoRes.json() as Array<{ lat: string; lon: string; display_name: string }>;

    const results = await Promise.all(geoData.slice(0, 5).map(async (item) => {
      const latitude = Number(item.lat);
      const longitude = Number(item.lon);
      let timezone = 0;
      let tzname = 'UTC';
      try {
        const tzUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code&timezone=auto`;
        const tzRes = await fetch(tzUrl);
        if (tzRes.ok) {
          const tzData = await tzRes.json() as { utc_offset_seconds?: number; timezone?: string };
          if (typeof tzData.utc_offset_seconds === 'number') timezone = tzData.utc_offset_seconds / 3600;
          if (typeof tzData.timezone === 'string') tzname = tzData.timezone;
        }
      } catch {
        // keep defaults
      }
      return {
        displayName: item.display_name,
        latitude,
        longitude,
        timezone,
        tzname,
      };
    }));

    res.status(200).json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Geocoding failed';
    res.status(500).json({ error: message });
  }
}
