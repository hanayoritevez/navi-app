import { POI_TYPES } from './poitypes.js';
import { LEVELS, matches } from './overpass.js';

// OSM XML(.osm) を、事前取得地図と同じ形式 {name, box, ways, pois} に変換する
export function parseOsmXml(text, name, level = 'noservice') {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('OSM XMLとして読み込めません');
  const allowed = new Set(LEVELS[level].split('|'));
  const tagsOf = (el) => {
    const t = {};
    for (const c of el.children) if (c.tagName === 'tag') t[c.getAttribute('k')] = c.getAttribute('v');
    return t;
  };
  const nodes = new Map();
  const pois = [];
  const addPoi = (tags, lat, lon) => {
    const ty = POI_TYPES.find((p) => matches(tags, p.match));
    if (ty) pois.push({ k: ty.key, lat, lon, name: tags.name || '' });
  };
  for (const el of doc.getElementsByTagName('node')) {
    const lat = +el.getAttribute('lat'), lon = +el.getAttribute('lon');
    nodes.set(el.getAttribute('id'), [lat, lon]);
    if (el.firstElementChild) addPoi(tagsOf(el), lat, lon);
  }
  const ways = [];
  let s = 90, w = 180, n = -90, e = -180;
  for (const el of doc.getElementsByTagName('way')) {
    const t = tagsOf(el);
    const ids = [], g = [];
    for (const nd of el.children) {
      if (nd.tagName !== 'nd') continue;
      const p = nodes.get(nd.getAttribute('ref'));
      if (!p) continue;
      ids.push(nd.getAttribute('ref')); g.push(p[0], p[1]);
    }
    if (ids.length >= 2 && t.highway && allowed.has(t.highway) && !/^(private|no)$/.test(t.access || '') &&
        !/^(parking_aisle|driveway|drive-through)$/.test(t.service || '')) {
      const tt = { highway: t.highway };
      for (const x of ['oneway', 'junction', 'maxspeed']) if (t[x]) tt[x] = t[x];
      ways.push({ n: ids, g, t: tt });
      for (let i = 0; i < g.length; i += 2) {
        if (g[i] < s) s = g[i]; if (g[i] > n) n = g[i];
        if (g[i + 1] < w) w = g[i + 1]; if (g[i + 1] > e) e = g[i + 1];
      }
    } else if (ids.length && Object.keys(t).length) {
      addPoi(t, g[0], g[1]); // 駐車場など面で表される事物は先頭点で代用
    }
  }
  if (!ways.length) throw new Error('取り込める道路が見つかりませんでした');
  const b = doc.querySelector('bounds');
  const box = b ? [+b.getAttribute('minlat'), +b.getAttribute('minlon'), +b.getAttribute('maxlat'), +b.getAttribute('maxlon')] : [s, w, n, e];
  return { name, box, ways, pois };
}
