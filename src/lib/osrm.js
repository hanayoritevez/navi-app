import { cumulative, distAlong } from './geo.js';

// points: [{lat,lon}, ...]  (現在地, 経由地..., 目的地)
export async function fetchRoute(points) {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const json = await res.json();
  if (json.code !== 'Ok' || !json.routes?.length) throw new Error('経路が見つかりません');
  const r = json.routes[0];
  const geometry = r.geometry.coordinates.map(([lo, la]) => [la, lo]);
  const cum = cumulative(geometry);
  // 経由地の通過位置[m]
  const viaD = [];
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const a = distAlong(geometry, cum, [points[i].lat, points[i].lon], idx);
    viaD.push(a.d);
    idx = a.idx;
  }
  return { geometry, cum, distance: cum[cum.length - 1], duration: r.duration, viaD };
}
