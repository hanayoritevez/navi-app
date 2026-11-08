// 事前取得した地図ファイル(scripts/fetch-map.mjs の出力)の読み込み
async function getJson(url) {
  try { const r = await fetch(url); return r.ok ? await r.json() : []; } catch { return []; }
}

// プルダウン用の地図一覧: sample/maps の .osm と、public/maps の事前取得JSON
export async function fetchIndex() {
  const [osm, pre] = await Promise.all([getJson('./sample-maps/index.json'), getJson('./maps/index.json')]);
  return [
    ...osm.map((m) => ({ name: m.name, kind: 'osm', url: './sample-maps/' + encodeURIComponent(m.file), size: m.size })),
    ...pre.map((m) => ({ ...m, kind: 'json' })),
  ];
}

export async function loadPrepared(file) {
  const r = await fetch('./maps/' + file);
  if (!r.ok) throw new Error('地図ファイルを読み込めません: ' + file);
  return await r.json();
}

const inBox = (b, la, lo) => la >= b[0] && la <= b[2] && lo >= b[1] && lo <= b[3];

// 指定範囲に掛かる道路(Overpass形式に展開)と事物を切り出す。全て手元データなので瞬時。
export function sliceArea(map, box) {
  const ways = [];
  for (const w of map.ways) {
    const g = w.g;
    let hit = false;
    for (let i = 0; i < g.length; i += 2) if (inBox(box, g[i], g[i + 1])) { hit = true; break; }
    if (!hit) continue;
    const geometry = [];
    for (let i = 0; i < g.length; i += 2) geometry.push({ lat: g[i], lon: g[i + 1] });
    ways.push({ nodes: w.n, geometry, tags: w.t });
  }
  const pois = {};
  for (const p of map.pois) if (inBox(box, p.lat, p.lon)) (pois[p.k] ||= []).push({ lat: p.lat, lon: p.lon, name: p.name });
  return { ways, pois };
}
