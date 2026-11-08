const R = 6371000;
const rad = Math.PI / 180;

export function hav(a, b) {
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function cumulative(line) {
  const c = [0];
  for (let i = 1; i < line.length; i++) c.push(c[i - 1] + hav(line[i - 1], line[i]));
  return c;
}

// d[m] 進んだ地点 [lat,lon]
export function pointAt(line, cum, d) {
  const total = cum[cum.length - 1];
  if (d <= 0) return line[0];
  if (d >= total) return line[line.length - 1];
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= d) lo = m; else hi = m;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (d - cum[lo]) / seg;
  return [line[lo][0] + (line[hi][0] - line[lo][0]) * t, line[lo][1] + (line[hi][1] - line[lo][1]) * t];
}

// 点pに最も近いルート頂点の距離位置 (startIdx以降)
export function distAlong(line, cum, p, startIdx = 0) {
  let best = Infinity, bi = startIdx;
  for (let i = startIdx; i < line.length; i++) {
    const d = hav(line[i], p);
    if (d < best) { best = d; bi = i; }
  }
  return { d: cum[bi], idx: bi };
}

export function bounds(points) {
  let s = 90, n = -90, w = 180, e = -180;
  for (const [la, lo] of points) {
    if (la < s) s = la; if (la > n) n = la;
    if (lo < w) w = lo; if (lo > e) e = lo;
  }
  return [s, w, n, e];
}

// a->b の方位[度, 北=0, 時計回り]
export function bearing(a, b) {
  const p1 = a[0] * rad, p2 = b[0] * rad, dl = (b[1] - a[1]) * rad;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / rad) + 360) % 360;
}
