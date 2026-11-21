import { useMemo, useState } from 'react';

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

export default function App() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<string | null>(null);

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

      const res = await fetch('/api/generate-kundli', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to generate PDF');
        }
        throw new Error(await res.text() || 'Failed to generate PDF');
      }

      const blob = await res.blob();
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
          <p className="lede">Enter birth details, generate the Janma Lagna Kundli, and download the PDF.</p>
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
              <p className="hint">Defaults match the sample: Vinay, 2004-02-28 09:16, Mumbai.</p>
            </div>

            {error && <div className="status status-error" role="alert">{error}</div>}
            {lastFile && !error && <div className="status status-ok">Downloaded <strong>{lastFile}</strong></div>}
          </form>
        </main>
      </div>
    </div>
  );
}
