const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function overpass(query) {
  let lastErr;
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return await res.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const bb = ([s, w, n, e]) => `${s},${w},${n},${e}`;

export const LEVELS = {
  major: 'motorway|trunk|primary|secondary|tertiary|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link',
  noservice: 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link',
  all: 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link',
};

export async function fetchRoads(box, level = 'noservice') {
  const q = `[out:json][timeout:90];
way["highway"~"^(${LEVELS[level] || LEVELS.noservice})$"]["access"!~"^(private|no)$"]["service"!~"^(parking_aisle|driveway|drive-through)$"](${bb(box)});
out geom;`;
  const json = await overpass(q);
  return json.elements.filter((e) => e.type === 'way' && e.geometry && e.nodes);
}

export async function fetchPois(box, types) {
  if (!types.length) return {};
  const parts = types.map((t) => `nwr${t.q}(${bb(box)});`).join('\n');
  const json = await overpass(`[out:json][timeout:60];(\n${parts}\n);out center tags;`);
  const out = {};
  for (const t of types) out[t.key] = [];
  for (const el of json.elements) {
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null) continue;
    const tags = el.tags || {};
    for (const t of types) {
      if (matches(tags, t.match)) { out[t.key].push({ lat, lon, name: tags.name || '' }); break; }
    }
  }
  return out;
}

export function matches(tags, m) {
  return Object.entries(m).every(([k, v]) => (Array.isArray(v) ? v.includes(tags[k]) : tags[k] === v));
}
