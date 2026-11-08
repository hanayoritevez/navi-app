import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// sample/maps/*.osm を /sample-maps/ で配信し、一覧(index.json)を自動生成する。ビルド時は dist にコピー。
function sampleMaps() {
  const dir = path.resolve('sample/maps');
  const list = () => (fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.osm')).map((f) => ({ name: f.replace(/\.osm$/, ''), file: f, size: fs.statSync(path.join(dir, f)).size }))
    : []);
  return {
    name: 'sample-maps',
    configureServer(server) {
      server.middlewares.use('/sample-maps', (req, res, next) => {
        const u = decodeURIComponent(req.url.split('?')[0]);
        if (u === '/index.json') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(list())); }
        const f = path.join(dir, path.basename(u));
        if (f.endsWith('.osm') && fs.existsSync(f)) { res.setHeader('Content-Type', 'text/xml; charset=utf-8'); return fs.createReadStream(f).pipe(res); }
        next();
      });
    },
    closeBundle() {
      const out = path.resolve('dist/sample-maps');
      fs.mkdirSync(out, { recursive: true });
      for (const f of list()) fs.copyFileSync(path.join(dir, f.file), path.join(out, f.file));
      fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(list()));
    },
  };
}

export default defineConfig({ plugins: [react(), sampleMaps()], base: './' });
