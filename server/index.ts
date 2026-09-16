import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { PROJECT_ROOT, ensureDirs } from './paths.js';
import { validateExportRequest } from './validate.js';
import { startExport, getJob } from './exporter.js';
import { resolveFfmpeg } from './ffmpeg.js';

const PORT = Number(process.env.PORT ?? 5173);
const HOST = '127.0.0.1';

async function main(): Promise<void> {
  ensureDirs();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // One process serves the editor, the headless render host and the export API, so
  // Playwright can always reach the render page at a known URL.
  const vite = await createViteServer({
    root: PROJECT_ROOT,
    server: { middlewareMode: true, hmr: { port: PORT + 1 } },
    appType: 'custom',
  });

  app.get('/api/health', async (_req, res) => {
    let ffmpeg: string | null = null;
    let ffmpegError: string | null = null;
    try {
      const tool = await resolveFfmpeg();
      ffmpeg = `${tool.path} (${tool.source})`;
    } catch (err) {
      ffmpegError = err instanceof Error ? err.message : String(err);
    }
    res.json({ ok: true, ffmpeg, ffmpegError });
  });

  app.post('/api/export', (req, res) => {
    const validated = validateExportRequest(req.body);
    if (!validated.ok) {
      res.status(400).json({ error: validated.errors.join('\n') });
      return;
    }
    const renderUrl = `http://${HOST}:${PORT}/render.html`;
    const job = startExport(validated.value, renderUrl);
    res.status(202).json(job);
  });

  app.get('/api/export/:id', (req, res) => {
    const job = getJob(req.params.id);
    if (!job) {
      res.status(404).json({ error: 'Unknown export job.' });
      return;
    }
    res.json(job);
  });

  app.use(vite.middlewares);

  // Serve the two HTML entry points through Vite's transform pipeline.
  app.use(async (req, res, next) => {
    const url = (req.originalUrl || '/').split('?')[0];
    const page = url === '/render.html' ? 'render.html' : url === '/' || url === '/index.html' ? 'index.html' : null;
    if (!page) return next();
    try {
      const raw = await fs.readFile(path.join(PROJECT_ROOT, page), 'utf-8');
      const html = await vite.transformIndexHtml(url, raw);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });

  app.listen(PORT, HOST, () => {
    console.log(`\n  Chart Animation Studio\n  Editor:      http://${HOST}:${PORT}/\n  Render host: http://${HOST}:${PORT}/render.html\n`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
