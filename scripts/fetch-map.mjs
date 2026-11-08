// 使い方: npm run fetch-map -- --name tokyo --bbox 35.60,139.65,35.75,139.85 [--tile 0.08] [--level noservice]
import fs from 'node:fs';
import { POI_TYPES } from '../src/lib/poitypes.js';
import { LEVELS, matches } from '../src/lib/overpass.js';

const a = Object.fromEntries(process.argv.slice(2).reduce((r, v, i, arr) => (v.startsWith('--') ? [...r, [v.slice(2), arr[i + 1]]] : r), []));
if (!a.name || !a.bbox) { console.error('--name と --bbox s,w,n,e が必要です'); process.exit(1); }
const [S, W, N, E] = a.bbox.split(',').map(Number);
const T = Number(a.tile || 0.08), level = a.level || 'noservice';
const EPS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function op(q) {
  for (let t = 0; t < 6; t++) {
    for (const ep of EPS) {
      try {
        const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
        if (r.ok) return await r.json();
        console.warn(`  ${ep} -> ${r.status}`);
      } catch (e) { console.warn('  ' + e.message); }
    }
    await sleep(5000 * (t + 1));
  }
  throw new Error('Overpass 取得に失敗');
}

const ways = new Map(), pois = new Map();
const tiles = [];
for (let s = S; s < N; s += T) for (let w = W; w < E; w += T) tiles.push([s, w, Math.min(s + T, N), Math.min(w + T, E)]);
let k = 0;
for (const b of tiles) {
  const bb = b.map((x) => x.toFixed(5)).join(',');
  console.log(`tile ${++k}/${tiles.length} ${bb}`);
  const rj = await op(`[out:json][timeout:180];way["highway"~"^(${LEVELS[level]})$"]["access"!~"^(private|no)$"]["service"!~"^(parking_aisle|driveway|drive-through)$"](${bb});out geom;`);
  for (const e of rj.elements) {
    if (e.type !== 'way' || !e.geometry || ways.has(e.id)) continue;
    const t = e.tags || {}, tt = { highway: t.highway };
    for (const x of ['oneway', 'junction', 'maxspeed']) if (t[x]) tt[x] = t[x];
    ways.set(e.id, { n: e.nodes, g: e.geometry.flatMap((p) => [+p.lat.toFixed(6), +p.lon.toFixed(6)]), t: tt });
  }
  const pj = await op(`[out:json][timeout:180];(${POI_TYPES.map((p) => `nwr${p.q}(${bb});`).join('')});out center tags;`);
  for (const e of pj.elements) {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (lat == null) continue;
    const tags = e.tags || {};
    const ty = POI_TYPES.find((p) => matches(tags, p.match));
    if (ty) pois.set(e.type + e.id, { k: ty.key, lat: +lat.toFixed(6), lon: +lon.toFixed(6), name: tags.name || '' });
  }
  await sleep(1500);
}
const out = { name: a.name, box: [S, W, N, E], level, ways: [...ways.values()], pois: [...pois.values()] };
fs.mkdirSync('public/maps', { recursive: true });
fs.writeFileSync(`public/maps/${a.name}.json`, JSON.stringify(out));
const idxPath = 'public/maps/index.json';
const idx = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath)) : [];
const rec = { name: a.name, file: `${a.name}.json`, box: out.box, ways: out.ways.length, pois: out.pois.length };
fs.writeFileSync(idxPath, JSON.stringify([...idx.filter((x) => x.name !== a.name), rec]));
console.log(`保存: public/maps/${a.name}.json (ways ${rec.ways}, pois ${rec.pois}, ${(fs.statSync(`public/maps/${a.name}.json`).size / 1e6).toFixed(1)}MB)`);
