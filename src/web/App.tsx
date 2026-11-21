import { useMemo, useState } from 'react';
import { generateKundliPdf, getKundliAssets } from '../generatePdf.js';

type FormState = {
  name: string;
  date: string;
  time: string;
  place: string;
  latitude: string;
  longitude: string;
  timezone: string;
  tzname: string;
  gochar: string;
};

type GeoResult = {
  displayName: string;
  latitude: number;
  longitude: number;
  timezone: number;
  tzname: string;
};

const PLACES: Record<string, { latitude: number; longitude: number; timezone: number }> = {
  mumbai: { latitude: 19.076, longitude: 72.8777, timezone: 5.5 },
};

const INITIAL: FormState = {
  name: 'Vinay',
  date: '2004-02-28',
  time: '09:16',
  place: 'Mumbai',
  latitude: '19.076',
  longitude: '72.8777',
  timezone: '5.5',
  tzname: 'Asia/Kolkata',
  gochar: '',
};

function sanitizeFilename(name: string) {
  const safe = name.replace(/\W+/g, '_').replace(/^_+|_+$/g, '');
  return `kundli_${safe || 'chart'}.pdf`;
}

async function geocodeLocation(q: string): Promise<GeoResult[]> {
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
  const geoRes = await fetch(nominatimUrl, { headers: { Accept: 'application/json' } });
  if (!geoRes.ok) throw new Error('Geocoding service failed');
  const geoData = await geoRes.json() as Array<{ lat: string; lon: string; display_name: string }>;

  return Promise.all(geoData.slice(0, 5).map(async (item) => {
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
    return { displayName: item.display_name, latitude, longitude, timezone, tzname };
  }));
}

export default function App() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);
  const [geoQuery, setGeoQuery] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoResults, setGeoResults] = useState<GeoResult[]>([]);

  const canSubmit = useMemo(() => {
    return Boolean(form.name && form.date && form.time && form.place && form.latitude && form.longitude && form.timezone);
  }, [form]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onPlaceChange(value: string) {
    update('place', value);
    const preset = PLACES[value.trim().toLowerCase()];
    if (preset) {
      setForm((prev) => ({
        ...prev,
        place: value,
        latitude: String(preset.latitude),
        longitude: String(preset.longitude),
        timezone: String(preset.timezone),
      }));
    }
  }

  async function searchLocation() {
    const q = geoQuery.trim();
    if (!q) {
      setGeoError('Enter a location to search.');
      setGeoResults([]);
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    setGeoResults([]);
    try {
      const results = await geocodeLocation(q);
      setGeoResults(results);
      if (results.length === 0) setGeoError('No locations found. Try a more specific name.');
    } catch (err) {
      setGeoError(err instanceof Error ? err.message : 'Failed to find location');
    } finally {
      setGeoLoading(false);
    }
  }

  function applyLocation(result: GeoResult) {
    const shortName = result.displayName.split(',')[0]?.trim() || result.displayName;
    setForm((prev) => ({
      ...prev,
      place: shortName,
      latitude: String(result.latitude),
      longitude: String(result.longitude),
      timezone: String(result.timezone),
      tzname: result.tzname || prev.tzname,
    }));
    setGeoResults([]);
    setGeoError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLastFile(null);
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        date: form.date,
        time: form.time,
        place: form.place.trim(),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        timezone: Number(form.timezone),
        tzname: form.tzname.trim() || 'Asia/Kolkata',
        gochar: form.gochar.trim() || undefined,
      };

      const assets = await getKundliAssets();
      const pdf = await generateKundliPdf(payload, assets);

      const blob = new Blob([new Uint8Array(pdf)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = sanitizeFilename(payload.name);
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setLastFile(filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="shell">
        <header className="header">
          <p className="eyebrow">Astrochitra</p>
          <h1>Kundli PDF Generator</h1>
          <p className="lede">Enter birth details, generate the Janma Lagna Kundli, and download the PDF — entirely in your browser.</p>
        </header>

        <main className="panel">
          <form className="form" onSubmit={onSubmit}>
            <div className="grid">
              <label className="field">
                <span>Name</span>
                <input value={form.name} onChange={(e) => update('name', e.target.value)} required />
              </label>
              <label className="field">
                <span>Birth place</span>
                <input value={form.place} onChange={(e) => onPlaceChange(e.target.value)} required />
              </label>

              <div className="field field-wide">
                <span>Find location by name <small>(auto-fills coordinates & timezone)</small></span>
                <div className="geo-row">
                  <input
                    value={geoQuery}
                    onChange={(e) => setGeoQuery(e.target.value)}
                    placeholder="e.g. New Delhi, India"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchLocation(); } }}
                  />
                  <button type="button" className="btn-secondary" onClick={() => void searchLocation()} disabled={geoLoading}>
                    {geoLoading ? 'Searching…' : 'Find coordinates'}
                  </button>
                </div>
                {geoError && <div className="geo-msg geo-msg-error">{geoError}</div>}
                {geoResults.length > 0 && (
                  <div className="geo-results" role="listbox" aria-label="Location results">
                    {geoResults.map((r, i) => (
                      <button
                        type="button"
                        key={`${r.latitude}-${r.longitude}-${i}`}
                        className="geo-result"
                        onClick={() => applyLocation(r)}
                      >
                        <span className="geo-result-name">{r.displayName}</span>
                        <span className="geo-result-meta">
                          {r.latitude.toFixed(4)}, {r.longitude.toFixed(4)} · UTC{r.timezone >= 0 ? '+' : ''}{r.timezone} · {r.tzname}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="field">
                <span>Birth date</span>
                <input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} required />
              </label>
              <label className="field">
                <span>Birth time</span>
                <input type="time" value={form.time} onChange={(e) => update('time', e.target.value)} required />
              </label>
              <label className="field">
                <span>Latitude</span>
                <input type="number" step="any" value={form.latitude} onChange={(e) => update('latitude', e.target.value)} required />
              </label>
              <label className="field">
                <span>Longitude</span>
                <input type="number" step="any" value={form.longitude} onChange={(e) => update('longitude', e.target.value)} required />
              </label>
              <label className="field">
                <span>Timezone (UTC offset)</span>
                <input type="number" step="0.25" value={form.timezone} onChange={(e) => update('timezone', e.target.value)} required />
              </label>
              <label className="field">
                <span>Timezone name</span>
                <input value={form.tzname} onChange={(e) => update('tzname', e.target.value)} placeholder="Asia/Kolkata" />
              </label>
              <label className="field field-wide">
                <span>Gochar datetime <small>(optional, YYYY-MM-DD HH:MM)</small></span>
                <input value={form.gochar} onChange={(e) => update('gochar', e.target.value)} placeholder="Defaults to current time in birth timezone" />
              </label>
            </div>

            <div className="actions">
              <button type="submit" disabled={!canSubmit || loading}>
                {loading ? 'Generating PDF…' : 'Generate & Download PDF'}
              </button>
              <p className="hint">Everything runs in your browser — no backend required.</p>
            </div>

            {error && <div className="status status-error" role="alert">{error}</div>}
            {lastFile && !error && <div className="status status-ok">Downloaded <strong>{lastFile}</strong></div>}
          </form>
        </main>
      </div>
    </div>
  );
}
