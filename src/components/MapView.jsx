import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { POI_TYPES, dimColor } from '../lib/settings.js';

// ---- Canvas overlay (道路・経路・事物をまとめて描画) ----
const NaviLayer = L.Layer.extend({
  initialize(drawFn) { this._drawFn = drawFn; },
  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create('canvas', 'navi-canvas leaflet-zoom-hide');
    map.getPane('overlayPane').appendChild(this._canvas);
    map.on('moveend zoomend resize', this._reset, this);
    this._reset();
  },
  onRemove(map) {
    map.off('moveend zoomend resize', this._reset, this);
    this._canvas.remove();
  },
  _reset() {
    const m = this._map, size = m.getSize(), dpr = window.devicePixelRatio || 1;
    L.DomUtil.setPosition(this._canvas, m.containerPointToLayerPoint([0, 0]));
    this._canvas.width = size.x * dpr; this._canvas.height = size.y * dpr;
    this._canvas.style.width = size.x + 'px'; this._canvas.style.height = size.y + 'px';
    this._dpr = dpr;
    this.redraw();
  },
  redraw() {
    if (!this._map) return;
    const ctx = this._canvas.getContext('2d');
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    const size = this._map.getSize();
    this._drawFn(ctx, (la, lo) => this._map.latLngToContainerPoint([la, lo]), size);
  },
});

function drawScene(ctx, projRaw, size, sc) {
  const { graph, range, route, progress, pois, settings: st, areaBox, draftBox } = sc;
  const W = size.x, H = size.y;
  // 進行方向上向き: 画面中心まわりに回転
  const rot = sc.rot || 0, cx = W / 2, cy = H / 2, cs = Math.cos(rot), sn = Math.sin(rot);
  const proj = (la, lo) => {
    const p = projRaw(la, lo), dx = p.x - cx, dy = p.y - cy;
    return { x: cx + dx * cs - dy * sn, y: cy + dx * sn + dy * cs };
  };
  for (const [bx, color, dash] of [[areaBox, '#3b82f6', [6, 4]], [draftBox, '#fbbf24', [3, 3]]]) {
    if (!bx) continue;
    ctx.save(); ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    [[bx[2], bx[1]], [bx[2], bx[3]], [bx[0], bx[3]], [bx[0], bx[1]]].forEach(([la, lo], i) => {
      const p = proj(la, lo); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    });
    ctx.closePath(); ctx.stroke(); ctx.restore();
  }
  // 道路
  if (graph) {
    const inR = range?.inR;
    for (const pass of [0, 1]) {
      ctx.beginPath();
      for (let i = 0; i < graph.sa.length; i++) {
        const a = graph.sa[i], b = graph.sb[i];
        const isIn = inR && (inR[a] || inR[b]) ? 1 : 0;
        if (isIn !== pass) continue;
        const p = proj(graph.lat[a], graph.lon[a]), q = proj(graph.lat[b], graph.lon[b]);
        if ((p.x < 0 && q.x < 0) || (p.y < 0 && q.y < 0) || (p.x > W && q.x > W) || (p.y > H && q.y > H)) continue;
        ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
      }
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = pass ? st.road.inColor : st.road.outColor;
      ctx.lineWidth = pass ? st.road.inWidth : st.road.outWidth;
      ctx.stroke();
    }
  }
  // 経路S
  if (route) {
    const g = route.geometry;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.lineWidth = st.road.routeWidth;
    ctx.beginPath();
    g.forEach(([la, lo], i) => { const p = proj(la, lo); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.strokeStyle = st.road.routeColor; ctx.globalAlpha = progress > 0 ? 0.3 : 1; ctx.stroke();
    if (progress > 0) {
      let k = 0; while (k < route.cum.length - 1 && route.cum[k + 1] < progress) k++;
      ctx.beginPath();
      g.slice(k).forEach(([la, lo], i) => { const p = proj(la, lo); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      ctx.globalAlpha = 1; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // 事物
  const labels = [];
  for (const t of POI_TYPES) {
    const cfg = st.poi[t.key];
    const list = pois[t.key];
    if (!cfg?.enabled || !list) continue;
    const colIn = cfg.color, colOut = dimColor(cfg.color, st.poiDim);
    for (const p of list) {
      const inside = range && p.node >= 0 && p.nd <= 250 && range.inR[p.node];
      const sz = inside ? st.poiStyle.in : st.poiStyle.out;
      const c = { color: inside ? colIn : colOut, size: sz.size, blur: sz.blur };
      const q = proj(p.lat, p.lon);
      if (q.x < -50 || q.y < -50 || q.x > W + 50 || q.y > H + 50) continue;
      if (inside && p.name && st.poiLabel.show) labels.push({ x: q.x + c.size / 2 + c.blur / 2 + 4, y: q.y, text: p.name });
      const r0 = Math.max(c.size, 1) / 2, r1 = r0 + Math.max(c.blur, 0);
      if (c.blur > 0) { // 背面: ブラーのある円(中心から外へ滑らかに透明化)
        const gr = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r1);
        gr.addColorStop(0, c.color + 'cc'); gr.addColorStop(1, c.color + '00');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(q.x, q.y, r1, 0, 6.2832); ctx.fill();
      }
      // 前面: ブラーのない円
      ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(q.x, q.y, r0, 0, 6.2832); ctx.fill();
    }
  }
  // 範囲R内の事物の名前(常に正立・重なりは省略)
  if (labels.length) {
    ctx.font = `${st.poiLabel.size}px sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.fillStyle = st.poiLabel.color;
    const used = [], h = st.poiLabel.size;
    for (const l of labels) {
      const w = ctx.measureText(l.text).width;
      const r = [l.x, l.y - h / 2, l.x + w, l.y + h / 2];
      if (used.some((u) => r[0] < u[2] && r[2] > u[0] && r[1] < u[3] && r[3] > u[1])) continue;
      used.push(r);
      ctx.strokeText(l.text, l.x, l.y); ctx.fillText(l.text, l.x, l.y);
    }
  }

  // マーカー(回転に追従させるためキャンバスで描画)
  const COL = { cur: '#16a34a', dest: '#dc2626', via: '#f59e0b', bpt: '#2f7bff', probe: '#a855f7', car: '#111' };
  for (const m of sc.markers || []) {
    const q = proj(m.lat, m.lon);
    ctx.save(); ctx.translate(q.x, q.y);
    if (m.cls === 'car') {
      ctx.rotate(((sc.heading || 0) * Math.PI) / 180 + rot);
      ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(11, 11); ctx.lineTo(0, 5); ctx.lineTo(-11, 11); ctx.closePath();
      ctx.fillStyle = '#2f7bff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    } else {
      const r = m.cls === 'bpt' ? 10 : 13;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.2832);
      ctx.fillStyle = COL[m.cls] || '#888'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(m.label, 0, 1);
    }
    ctx.restore();
  }
}

export default function MapView({ scene, onClick, apiRef, onDragStart }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const tileRef = useRef(null);
  const wasFollow = useRef(false);
  const sceneRef = useRef(scene);
  const clickRef = useRef(onClick);
  const dragRef = useRef(onDragStart);
  sceneRef.current = scene; clickRef.current = onClick; dragRef.current = onDragStart;

  useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: false, preferCanvas: true, touchZoom: 'center', scrollWheelZoom: 'center', doubleClickZoom: 'center' }).setView([35.681, 139.767], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    layerRef.current = new NaviLayer((ctx, proj, size) => drawScene(ctx, proj, size, sceneRef.current)).addTo(map);
    map.on('click', (e) => {
      // 回転を戻してから緯度経度へ
      const rot = sceneRef.current.rot || 0, sz = map.getSize(), cx = sz.x / 2, cy = sz.y / 2;
      const dx = e.containerPoint.x - cx, dy = e.containerPoint.y - cy, c = Math.cos(-rot), sn = Math.sin(-rot);
      const ll = map.containerPointToLatLng([cx + dx * c - dy * sn, cy + dx * sn + dy * c]);
      // タップ位置に近い事物(表示中のもの)を拾う
      const sc = sceneRef.current;
      let best = null, bd = 32;
      for (const t of POI_TYPES) {
        if (!sc.settings.poi[t.key]?.enabled) continue;
        for (const q of sc.pois[t.key] || []) {
          const pp = map.latLngToContainerPoint([q.lat, q.lon]);
          const ex = pp.x - cx, ey = pp.y - cy, c2 = Math.cos(rot), s2 = Math.sin(rot);
          const d = Math.hypot(cx + ex * c2 - ey * s2 - e.containerPoint.x, cy + ex * s2 + ey * c2 - e.containerPoint.y);
          if (d < bd) { bd = d; best = { lat: q.lat, lon: q.lon, name: q.name, type: t.key }; }
        }
      }
      clickRef.current?.({ lat: ll.lat, lon: ll.lng, poi: best });
    });
    map.on('dragstart', () => dragRef.current?.());
    mapRef.current = map;
    if (apiRef) apiRef.current = { panTo: (la, lo) => map.panTo([la, lo]), fitBox: (b) => map.fitBounds([[b[0], b[1]], [b[2], b[3]]]), getBox: () => { const b = map.getBounds(); return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]; } };
    return () => map.remove();
  }, []);

  // 背景/タイル
  useEffect(() => {
    elRef.current.style.background = scene.settings.map.bg;
    const m = mapRef.current;
    if (scene.settings.map.tiles) {
      if (!tileRef.current) tileRef.current = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
      }).addTo(m);
      tileRef.current.setOpacity(scene.settings.map.tileOpacity);
    } else if (tileRef.current) { tileRef.current.remove(); tileRef.current = null; }
  }, [scene.settings.map]);

  // ナビ中は自車を中心に固定(ドラッグ無効)
  useEffect(() => {
    const m = mapRef.current;
    if (scene.follow && scene.pos) {
      const z = wasFollow.current ? m.getZoom() : Math.max(m.getZoom(), 16);
      m.setView(scene.pos, z, { animate: false });
    }
    wasFollow.current = !!scene.follow;
  }, [scene.follow, scene.pos?.[0], scene.pos?.[1]]); // eslint-disable-line

  // 再描画
  useEffect(() => { layerRef.current?.redraw(); });

  // 経路が出来たら全体表示
  useEffect(() => {
    if (scene.route && scene.fitKey) {
      const b = scene.route.geometry;
      mapRef.current.fitBounds(L.latLngBounds(b), { padding: [40, 40] });
    }
  }, [scene.fitKey]); // eslint-disable-line

  return <div ref={elRef} className="map" />;
}
