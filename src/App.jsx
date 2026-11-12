import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from './components/MapView.jsx';
import { POI_TYPES as TYPES } from './lib/settings.js';
import Panel from './components/Panel.jsx';
import { POI_TYPES, useSettings } from './lib/settings.js';
import { fetchRoute } from './lib/osrm.js';
import { fetchRoads, fetchPois } from './lib/overpass.js';
import { buildGraph, computeRange, nearestNode } from './lib/graph.js';
import { bounds, pointAt, bearing } from './lib/geo.js';
import { parseOsmXml } from './lib/osmxml.js';
import { fetchIndex, loadPrepared, sliceArea } from './lib/prepared.js';

const MAX_SPAN = [0.4, 0.5]; // 取得範囲の上限(度)

function graphBox(route, km) {
  const [s, w, n, e] = bounds(route.geometry);
  const mLat = km / 110.54, mLon = km / (111.32 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  return [s - mLat, w - mLon, n + mLat, e + mLon];
}
const contains = (o, i) => i[0] >= o[0] && i[1] >= o[1] && i[2] <= o[2] && i[3] <= o[3];

export default function App() {
  const [settings, setSettings] = useSettings();
  const [cur, setCur] = useState(null);
  const [dest, setDest] = useState(null);
  const [vias, setVias] = useState([]);
  const [mode, setMode] = useState(null); // 'cur' | 'dest' | 'via' | 'probe'
  const [route, setRoute] = useState(null);
  const [fitKey, setFitKey] = useState(0);
  const [gs, setGs] = useState(null); // {graph, box}
  const [poiRaw, setPoiRaw] = useState({ boxKey: '', data: {} });
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const [probe, setProbe] = useState(null);
  const [status, setStatus] = useState('');
  const [area, setArea] = useState(null); // 指定されたグラフ化範囲 [s,w,n,e]
  const [corner, setCorner] = useState(null); // 範囲指定の1点目
  const [building, setBuilding] = useState(false);
  const apiRef = useRef(null);
  const [maps, setMaps] = useState([]); // 事前取得済み地図の一覧
  const [prepared, setPrepared] = useState(null); // 読み込み済みの地図データ
  useEffect(() => { fetchIndex().then(setMaps); }, []);
  const [followUser, setFollowUser] = useState(true); // ナビ中に自車へ追従するか(ドラッグで解除)
  const keepRun = useRef(false); // シミュレーション中の再探索では走行を継続

  // 経路S
  useEffect(() => {
    if (!keepRun.current) { setRunning(false); setProgress(0); }
    if (!cur || !dest) { setRoute(null); return; }
    let cancel = false;
    setStatus('経路探索中…');
    fetchRoute([cur, ...vias, dest]).then((r) => {
      if (cancel) return;
      setRoute(r); setProgress(0); setStatus('');
      if (keepRun.current) { setRunning(true); keepRun.current = false; } else setFitKey((k) => k + 1);
    }).catch((e) => !cancel && setStatus('経路エラー: ' + e.message));
    return () => { cancel = true; };
  }, [cur, dest, vias]);

  // 道路グラフ
  useEffect(() => {
    if (!route || !settings.graph.auto) return;
    const km = settings.graph.marginKm, level = settings.graph.level;
    const key = `${km}|${level}`;
    const need = graphBox(route, km);
    const keep = graphBox(route, km * 0.4);
    if (gs && gs.key === key && contains(gs.box, keep)) return;
    if (need[2] - need[0] > MAX_SPAN[0] || need[3] - need[1] > MAX_SPAN[1]) {
      setStatus('距離が長すぎます(約40km四方以内にしてください)'); return;
    }
    let cancel = false;
    setStatus('道路データ取得中(Overpass)…');
    fetchRoads(need, level).then((ways) => {
      if (cancel) return;
      const t0 = performance.now();
      const graph = buildGraph(ways);
      setGs({ graph, box: need, key, buildMs: performance.now() - t0 });
      setStatus('');
    }).catch((e) => !cancel && setStatus('道路取得エラー: ' + e.message));
    return () => { cancel = true; };
  }, [route, settings.graph.auto, settings.graph.marginKm, settings.graph.level]); // eslint-disable-line

  // 事物
  const enabledKeys = POI_TYPES.filter((t) => settings.poi[t.key].enabled).map((t) => t.key);
  const enabledStr = enabledKeys.join(',');
  useEffect(() => {
    if (!gs) return;
    const boxKey = gs.box.join(',');
    const have = poiRaw.boxKey === boxKey ? poiRaw.data : {};
    const missing = POI_TYPES.filter((t) => enabledKeys.includes(t.key) && !have[t.key]);
    if (poiRaw.boxKey !== boxKey) setPoiRaw({ boxKey, data: {} });
    if (!missing.length) return;
    let cancel = false;
    fetchPois(gs.box, missing).then((res) => {
      if (cancel) return;
      setPoiRaw((p) => ({ boxKey, data: { ...(p.boxKey === boxKey ? p.data : {}), ...res } }));
    }).catch((e) => !cancel && setStatus('事物取得エラー: ' + e.message));
    return () => { cancel = true; };
  }, [gs, enabledStr]); // eslint-disable-line

  // 事物を最寄りノードに紐付け
  const pois = useMemo(() => {
    const out = {};
    if (!gs) return out;
    for (const [k, list] of Object.entries(poiRaw.data)) {
      out[k] = list.map((p) => {
        const n = nearestNode(gs.graph, p.lat, p.lon, 3);
        return { ...p, node: n ? n.idx : -1, nd: n ? n.d : Infinity };
      });
    }
    return out;
  }, [gs, poiRaw]);

  useEffect(() => { if (running) setFollowUser(true); }, [running]);

  // 現在位置(シミュレーション中は経路上)
  const pos = route && progress > 0 ? pointAt(route.geometry, route.cum, progress) : cur ? [cur.lat, cur.lon] : null;
  const nextStop = useMemo(() => {
    if (!dest) return null;
    if (route) {
      const i = route.viaD.findIndex((d) => d > progress + 30);
      if (i >= 0) return { ...vias[i], via: i };
    }
    return dest;
  }, [route, vias, dest, progress]);
  const bucket = Math.floor(progress / 30);

  // 範囲R
  const range = useMemo(() => {
    if (!gs || !route || !pos || !nextStop) return null;
    const B = pointAt(route.geometry, route.cum, progress + settings.p1);
    const t0 = performance.now();
    const r = computeRange(gs.graph, pos, B, [nextStop.lat, nextStop.lon], settings.p2);
    return { ...r, B, ms: performance.now() - t0 };
  }, [gs, route, bucket, settings.p1, settings.p2, nextStop]); // eslint-disable-line
  const rangeOk = range && !range.error ? range : null;

  // 任意の点C
  const probeRes = useMemo(() => {
    if (!probe || !rangeOk || !gs) return null;
    const n = nearestNode(gs.graph, probe.lat, probe.lon);
    if (!n) return null;
    const t = rangeOk.cost[n.idx];
    return { t, T: rangeOk.T, inside: t <= rangeOk.budget, extra: t - rangeOk.T };
  }, [probe, rangeOk, gs]);

  // シミュレーション
  useEffect(() => {
    if (!running || !route) return;
    const v = (route.distance / route.duration) * settings.sim.mult;
    const id = setInterval(() => {
      setProgress((p) => {
        const np = Math.min(p + v * 0.25, route.distance);
        if (np >= route.distance) setRunning(false);
        return np;
      });
    }, 250);
    return () => clearInterval(id);
  }, [running, route, settings.sim.mult]);

  const buildArea = async (box = area, map = prepared) => {
    if (!box) return;
    // 事前取得データが範囲を覆っていれば、手元データから即座に構築
    if (map && contains(map.box, box)) {
      const t0 = performance.now();
      const { ways, pois: pd } = sliceArea(map, box);
      const graph = buildGraph(ways);
      const data = {};
      for (const t of POI_TYPES) data[t.key] = pd[t.key] || [];
      setGs({ graph, box, key: 'local', buildMs: performance.now() - t0, fetchMs: 0 });
      setPoiRaw({ boxKey: box.join(','), data });
      setStatus('');
      return;
    }
    if (box[2] - box[0] > MAX_SPAN[0] || box[3] - box[1] > MAX_SPAN[1]) { setStatus('範囲が広すぎます(約40km四方以内)'); return; }
    setBuilding(true); setStatus('事前取得データの範囲外 → Overpassから取得中(遅い場合があります)…');
    try {
      const t0 = performance.now();
      const ways = await fetchRoads(box, settings.graph.level);
      const t1 = performance.now();
      const graph = buildGraph(ways);
      setGs({ graph, box, key: 'manual', buildMs: performance.now() - t1, fetchMs: t1 - t0 });
      setStatus('');
    } catch (e) { setStatus('道路取得エラー: ' + e.message); }
    setBuilding(false);
  };
  // .osm テキストを解析 → 範囲をグラフ化して表示
  const importOsmText = async (text, name) => {
    setBuilding(true); setStatus(`${name} を解析中…`);
    await new Promise((r) => setTimeout(r, 30)); // 状態表示を先に描画
    try {
      const m = parseOsmXml(text, name, settings.graph.level);
      setPrepared(m); setArea(m.box);
      await buildArea(m.box, m);
      apiRef.current?.fitBox(m.box);
      setStatus(`${name}: 道路${m.ways.length}本 / 事物${m.pois.length}件を取り込みました`);
    } catch (e) { setStatus('インポートエラー: ' + e.message); }
    setBuilding(false);
  };
  const importOsm = async (file) => { if (file) await importOsmText(await file.text(), file.name); };
  // プルダウンで選んだ地図(entry)を読み込む
  const loadMap = async (entry) => {
    if (!entry) { setPrepared(null); return; }
    if (entry.kind === 'osm') {
      setBuilding(true); setStatus(`${entry.name} を読み込み中…`);
      try {
        const r = await fetch(entry.url);
        if (!r.ok) throw new Error('地図ファイルを読み込めません');
        await importOsmText(await r.text(), entry.name);
      } catch (e) { setStatus(e.message); setBuilding(false); }
      return;
    }
    setBuilding(true); setStatus('地図ファイル読み込み中…');
    try {
      const m = await loadPrepared(entry.file);
      setPrepared(m); setStatus('');
      if (!area) setArea(m.box);
    } catch (e) { setStatus(e.message); }
    setBuilding(false);
  };
  const useView = () => { const b = apiRef.current?.getBox(); if (b) { setArea(b); setCorner(null); } };

  // 走行中は車両の現在位置から、未通過の経由地で再探索(走行は継続)
  const changeVias = (fn) => {
    if (route && progress > 0 && pos) {
      keepRun.current = running || keepRun.current;
      const rest = vias.map((v, i) => ({ v, i })).filter(({ i }) => route.viaD[i] > progress + 30);
      setCur({ lat: pos[0], lon: pos[1] });
      setVias(fn(rest.map((x) => x.v), rest.map((x) => x.i)));
    } else setVias(fn(vias, vias.map((_, i) => i)));
  };
  const addVia = (v) => changeVias((list) => [...list, v]);
  const removeVia = (idx) => changeVias((list, idxs) => list.filter((_, k) => idxs[k] !== idx));

  const onMapClick = (p) => {
    if (mode === 'box') {
      if (!corner) { setCorner(p); return; }
      setArea([Math.min(corner.lat, p.lat), Math.min(corner.lon, p.lon), Math.max(corner.lat, p.lat), Math.max(corner.lon, p.lon)]);
      setCorner(null); setMode(null); return;
    }
    if (mode === 'cur') setCur(p);
    else if (mode === 'dest') setDest(p);
    else if (mode === 'via') {
      if (!p.poi) { setStatus('経由地は、表示中の事物(plot)をタップして選んでください。表示オフの種類は開発設定でオンにしてください'); return; }
      setStatus('');
      addVia({ lat: p.poi.lat, lon: p.poi.lon, name: p.poi.name, type: p.poi.type });
    }
    else if (mode === 'probe') setProbe(p);
    else return;
    if (mode !== 'via' && mode !== 'probe') setMode(null);
  };

  const gps = () => {
    if (!navigator.geolocation) return setStatus('このブラウザは位置情報に非対応です');
    navigator.geolocation.getCurrentPosition(
      (p) => setCur({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => setStatus('位置情報エラー: ' + e.message + '(HTTPS接続が必要です)'),
      { enableHighAccuracy: true });
  };

  const markers = [];
  if (cur && progress === 0) markers.push({ ...cur, cls: 'cur', label: 'A' });
  if (pos && progress > 0) markers.push({ lat: pos[0], lon: pos[1], cls: 'car', label: '' });
  vias.forEach((v, i) => markers.push({ ...v, cls: 'via', label: String(i + 1) }));
  if (dest) markers.push({ ...dest, cls: 'dest', label: 'D' });
  if (rangeOk && settings.map.showB) markers.push({ lat: rangeOk.B[0], lon: rangeOk.B[1], cls: 'bpt', label: 'B' });
  if (corner) markers.push({ ...corner, cls: 'probe', label: '□' });
  if (probe) markers.push({ ...probe, cls: 'probe', label: 'C' });

  const navigating = !!(route && (running || progress > 0));
  const follow = navigating && followUser;
  const heading = useMemo(() => {
    if (!route) return 0;
    const d0 = Math.max(0, Math.min(progress, route.distance - 60));
    return bearing(pointAt(route.geometry, route.cum, d0), pointAt(route.geometry, route.cum, d0 + 60));
  }, [route, bucket]); // eslint-disable-line
  const rot = follow && settings.map.headingUp ? (-heading * Math.PI) / 180 : 0;

  const scene = { markers, follow, heading, rot, pos, graph: gs?.graph, range: rangeOk, route, progress, pois, settings, fitKey, areaBox: area, draftBox: null };

  const counts = useMemo(() => {
    const c = { in: 0, out: 0 };
    if (!rangeOk) return c;
    for (const t of POI_TYPES) {
      if (!settings.poi[t.key].enabled) continue;
      for (const p of pois[t.key] || []) (p.node >= 0 && p.nd <= 250 && rangeOk.inR[p.node] ? c.in++ : c.out++);
    }
    return c;
  }, [pois, rangeOk, settings.poi]);

  return (
    <>
      <MapView scene={scene} onClick={onMapClick} apiRef={apiRef} onDragStart={() => navigating && setFollowUser(false)} />
      {(cur || dest || vias.length > 0) && (
        <div className="stopcards">
          {[
            cur && { kind: 'cur', label: '現在地', text: `${cur.lat.toFixed(4)}, ${cur.lon.toFixed(4)}`, ...cur },
            ...vias.map((v, i) => ({
              kind: 'via', label: `経由地${i + 1}`, ...v, passed: !!(route && route.viaD[i] <= progress + 30),
              text: v.name || TYPES.find((t) => t.key === v.type)?.label || `${v.lat.toFixed(4)}, ${v.lon.toFixed(4)}`,
              onRemove: () => removeVia(i),
            })),
            dest && { kind: 'dest', label: '目的地', text: `${dest.lat.toFixed(4)}, ${dest.lon.toFixed(4)}`, ...dest, onRemove: () => setDest(null) },
          ].filter(Boolean).map((c, i) => (
            <div key={i} className={`card ${c.kind}${c.passed ? ' passed' : ''}`}
              onClick={() => { if (navigating) setFollowUser(false); apiRef.current?.panTo(c.lat, c.lon); }}>
              <div className="ct">{c.label}</div>
              <div className="cn">{c.text}</div>
              {c.onRemove && <button className="cx" onClick={(e) => { e.stopPropagation(); c.onRemove(); }}>✕</button>}
            </div>
          ))}
        </div>
      )}
      <div className="mapbtns">
        {navigating && !followUser && <button className="on" onClick={() => setFollowUser(true)}>📍 自車に追従</button>}
        {navigating && (
          <div className="zoombtns">
            <button aria-label="拡大" onClick={() => apiRef.current?.zoomBy(1)}>＋</button>
            <button aria-label="縮小" onClick={() => apiRef.current?.zoomBy(-1)}>－</button>
          </div>
        )}
        {navigating && <button onClick={() => setSettings((s) => ({ ...s, map: { ...s.map, headingUp: !s.map.headingUp } }))}>🧭 {settings.map.headingUp ? '進行方向が上' : '北が上'}</button>}
      </div>
      <Panel
        settings={settings} setSettings={setSettings}
        mode={mode} setMode={setMode}
        cur={cur} dest={dest} vias={vias}
        resetCur={() => { setCur(null); }} resetDest={() => { setDest(null); setVias([]); setProbe(null); }}
        resetVias={() => setVias([])} removeVia={removeVia} removeDest={() => setDest(null)}
        gps={gps}
        route={route} progress={progress} range={range} counts={counts} gs={gs}
        probe={probe} probeRes={probeRes} clearProbe={() => setProbe(null)}
        running={running} setRunning={setRunning}
        resetSim={() => { setRunning(false); setProgress(0); }}
        status={status}
        area={area} clearArea={() => { setArea(null); setCorner(null); }} useView={useView} importOsm={importOsm} maps={maps} prepared={prepared} loadMap={loadMap} buildArea={() => buildArea()} building={building}
      />
    </>
  );
}
