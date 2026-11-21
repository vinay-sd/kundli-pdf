import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { generateKundliPdf, defaultPdfFilename } from './src/generatePdf';

function kundliApiPlugin(): Plugin {
  return {
    name: 'kundli-api',
    configureServer(server) {
      server.middlewares.use('/api/generate-kundli', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const body = await readJson(req);
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
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          res.end(Buffer.from(pdf));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to generate PDF';
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

function readJson(req: import('node:http').IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export default defineConfig({
  plugins: [react(), kundliApiPlugin()],
});
