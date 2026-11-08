const SPEEDS = { motorway: 80, motorway_link: 50, trunk: 60, trunk_link: 40, primary: 45, primary_link: 35,
  secondary: 40, secondary_link: 30, tertiary: 35, tertiary_link: 30, unclassified: 30, residential: 25,
  living_street: 10, service: 15 };

function speedKmh(tags) {
  const ms = tags.maxspeed;
  if (ms) {
    const m = /^(\d+)\s*(mph)?$/.exec(ms);
    if (m) return Number(m[1]) * (m[2] ? 1.609 : 1) * 0.8;
  }
  return SPEEDS[tags.highway] ?? 25;
}

const CELL = 0.001;
const cellKey = (ix, iy) => ix * 200000 + iy;

const mPerLat = 110540;
const mPerLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
function dist(lat1, lon1, lat2, lon2) {
  const dy = (lat1 - lat2) * mPerLat, dx = (lon1 - lon2) * mPerLon(lat1);
  return Math.hypot(dx, dy);
}

export function buildGraph(ways) {
  const idMap = new Map();
  const lat = [], lon = [];
  const sa = [], sb = []; // 描画用セグメント
  const af = [], at = [], atime = []; // 有向弧
  const nodeIdx = (id, g) => {
    let i = idMap.get(id);
    if (i === undefined) { i = lat.length; idMap.set(id, i); lat.push(g.lat); lon.push(g.lon); }
    return i;
  };
  for (const w of ways) {
    const tags = w.tags || {};
    const v = (speedKmh(tags) * 1000) / 3600;
    const ow = tags.oneway;
    const oneway = ow === 'yes' || ow === '1' || ow === 'true' || tags.junction === 'roundabout' ||
      (tags.highway === 'motorway' && ow !== 'no');
    const rev = ow === '-1';
    let prev = nodeIdx(w.nodes[0], w.geometry[0]);
    for (let k = 1; k < w.nodes.length; k++) {
      const cur = nodeIdx(w.nodes[k], w.geometry[k]);
      if (cur !== prev) {
        const t = dist(lat[prev], lon[prev], lat[cur], lon[cur]) / v;
        sa.push(prev); sb.push(cur);
        if (!rev) { af.push(prev); at.push(cur); atime.push(t); }
        if (rev || !oneway) { af.push(cur); at.push(prev); atime.push(t); }
      }
      prev = cur;
    }
  }
  const n = lat.length;
  const csr = (from, to) => {
    const off = new Uint32Array(n + 1);
    for (const f of from) off[f + 1]++;
    for (let i = 0; i < n; i++) off[i + 1] += off[i];
    const pos = off.slice(0, n);
    const dst = new Uint32Array(from.length), tm = new Float32Array(from.length);
    for (let i = 0; i < from.length; i++) { const p = pos[from[i]]++; dst[p] = to[i]; tm[p] = atime[i]; }
    return { off, dst, tm };
  };
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    const k = cellKey(Math.floor((lon[i] + 180) / CELL), Math.floor((lat[i] + 90) / CELL));
    const a = grid.get(k);
    if (a) a.push(i); else grid.set(k, [i]);
  }
  return { n, lat: Float64Array.from(lat), lon: Float64Array.from(lon), sa: Uint32Array.from(sa), sb: Uint32Array.from(sb),
    fwd: csr(af, at), rev: csr(at, af), grid };
}

export function nearestNode(g, la, lo, maxRing = 40) {
  const cx = Math.floor((lo + 180) / CELL), cy = Math.floor((la + 90) / CELL);
  const cellM = Math.min(CELL * mPerLat, CELL * mPerLon(la));
  let best = -1, bd = Infinity;
  for (let r = 0; r <= maxRing; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const a = g.grid.get(cellKey(cx + dx, cy + dy));
        if (!a) continue;
        for (const i of a) {
          const d = dist(la, lo, g.lat[i], g.lon[i]);
          if (d < bd) { bd = d; best = i; }
        }
      }
    }
    if (best >= 0 && bd <= r * cellM) break;
  }
  return best < 0 ? null : { idx: best, d: bd };
}

export function dijkstra(csr, n, src, limit = Infinity, targets = null) {
  let remaining = targets ? new Set(targets) : null;
  const dist = new Float64Array(n).fill(Infinity);
  dist[src] = 0;
  const hd = [0], hn = [src];
  while (hd.length) {
    // pop
    const d = hd[0], u = hn[0];
    const ld = hd.pop(), ln = hn.pop();
    if (hd.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= hd.length) break;
        if (c + 1 < hd.length && hd[c + 1] < hd[c]) c++;
        if (hd[c] >= ld) break;
        hd[i] = hd[c]; hn[i] = hn[c]; i = c;
      }
      hd[i] = ld; hn[i] = ln;
    }
    if (d > dist[u] || d > limit) continue;
    if (remaining && remaining.delete(u) && remaining.size === 0) break;
    for (let e = csr.off[u]; e < csr.off[u + 1]; e++) {
      const v = csr.dst[e], nd = d + csr.tm[e];
      if (nd < dist[v]) {
        dist[v] = nd;
        let i = hd.length;
        hd.push(nd); hn.push(v);
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (hd[p] <= nd) break;
          hd[i] = hd[p]; hn[i] = hn[p]; i = p;
        }
        hd[i] = nd; hn[i] = v;
      }
    }
  }
  return dist;
}

/**
 * A(現在地)->B(P1先)->C(任意)->D(目的地) の所要時間が T+P2 以下となる C の集合 R。
 * 全て同一の道路グラフ上で計算し、基準 T は A->D の最短時間(グラフ上)。
 */
export function computeRange(g, A, B, D, p2) {
  const a = nearestNode(g, A[0], A[1]), b = nearestNode(g, B[0], B[1]), d = nearestNode(g, D[0], D[1]);
  if (!a || !b || !d || a.d > 1000 || d.d > 1000) return { error: '現在地/目的地がグラフ化範囲の外です。範囲を指定してグラフ計算してください' };
  const dA = dijkstra(g.fwd, g.n, a.idx, Infinity, [d.idx, b.idx]);
  const T = dA[d.idx], tAB = dA[b.idx];
  if (!isFinite(T) || !isFinite(tAB)) return { error: 'グラフ上で目的地に到達できません(取得範囲外/不連結)' };
  const budget = T + p2;
  const dB = dijkstra(g.fwd, g.n, b.idx, budget);
  const dD = dijkstra(g.rev, g.n, d.idx, budget);
  const cost = new Float64Array(g.n);
  const inR = new Uint8Array(g.n);
  for (let i = 0; i < g.n; i++) {
    cost[i] = tAB + dB[i] + dD[i];
    inR[i] = cost[i] <= budget ? 1 : 0;
  }
  return { inR, cost, T, tAB, budget, nNodes: g.n, nodes: { a: a.idx, b: b.idx, d: d.idx } };
}
