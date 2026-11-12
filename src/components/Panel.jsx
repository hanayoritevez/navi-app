import { useState } from 'react';
import { POI_TYPES, DEFAULTS, setPath } from '../lib/settings.js';

const fmtT = (s) => (s == null || !isFinite(s) ? '-' : `${Math.floor(s / 60)}分${String(Math.round(s % 60)).padStart(2, '0')}秒`);
const fmtD = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m');

function Num({ label, value, onChange, step = 1, min = 0, max }) {
  return (
    <label className="row">
      <span>{label}</span>
      <input type="number" value={value} step={step} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

// スライダー + 数値入力。⚙で下限/上限を変更できる
function Slide({ label, value, onChange, limId, st, setLim, step = 1 }) {
  const [edit, setEdit] = useState(false);
  const lim = st.limits[limId];
  return (
    <div className="slide">
      <div className="row">
        <span>{label}</span>
        <span>
          <input type="number" value={value} step={step} onChange={(e) => onChange(Number(e.target.value))} />
          <button className="gear" onClick={() => setEdit(!edit)}>⚙</button>
        </span>
      </div>
      <input type="range" min={lim[0]} max={lim[1]} step={step} value={Math.min(Math.max(value, lim[0]), lim[1])} onChange={(e) => onChange(Number(e.target.value))} />
      {edit && (
        <div className="row lim">
          <span>下限</span><input type="number" value={lim[0]} step={step} onChange={(e) => setLim(limId, [Number(e.target.value), lim[1]])} />
          <span>上限</span><input type="number" value={lim[1]} step={step} onChange={(e) => setLim(limId, [lim[0], Number(e.target.value)])} />
        </div>
      )}
    </div>
  );
}

function Col({ label, value, onChange }) {
  return (
    <label className="row"><span>{label}</span><input type="color" value={value} onChange={(e) => onChange(e.target.value)} /></label>
  );
}

export default function Panel(p) {
  const { settings: st, setSettings } = p;
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState('navi');
  const set = (path, v) => setSettings((s) => setPath(s, path, v));
  const setLim = (id, v) => set(['limits', id], v);
  const SL = (label, value, path, limId, step) => <Slide key={path.join('.')} label={label} value={value} onChange={(v) => set(path, v)} limId={limId} st={st} setLim={setLim} step={step} />;
  const modeBtn = (m, label) => (
    <button className={p.mode === m ? 'on' : ''} onClick={() => p.setMode(p.mode === m ? null : m)}>{label}</button>
  );

  return (
    <div className={'panel' + (open ? '' : ' closed')}>
      <div className="head">
        <button className="toggle" onClick={() => setOpen(!open)}>{open ? '▼ 閉じる' : '▲ メニュー'}</button>
        {p.mode && <span className="hint">地図をタップして{{ box: 'グラフ範囲の角(2点)', cur: '現在地', dest: '目的地', via: '経由地にする事物(plot)', probe: '点C' }[p.mode]}を指定</span>}
        {p.status && <span className="status">{p.status}</span>}
      </div>
      {open && (
        <>
          <div className="tabs">
            {[['navi', 'ナビ'], ['dev', '開発設定'], ['sim', 'シミュレーション']].map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          <div className="body">
            {tab === 'navi' && (
              <>
                <h4>設定</h4>
                <div className="btns">
                  {modeBtn('cur', '現在地を設定')}
                  <button onClick={p.gps}>GPSで取得</button>
                  <button onClick={p.resetCur} disabled={!p.cur}>現在地リセット</button>
                </div>
                <div className="btns">
                  {modeBtn('dest', '目的地を設定')}
                  {modeBtn('via', '経由地を追加(走行中も可)')}
                  <button onClick={p.resetVias} disabled={!p.vias.length}>経由地リセット</button>
                  <button onClick={p.resetDest} disabled={!p.dest}>目的地リセット</button>
                </div>
                <h4>許容範囲 P2</h4>
                {SL('P2: 許容追加時間 [秒]', st.p2, ['p2'], 'p2', 5)}
                {p.range && !p.range.error && <p className="muted">許容 T+P2 = {fmtT(p.range.budget)}(走行中に変更すると範囲Rへ即反映)</p>}
                <h4>計算結果</h4>
                {p.route ? (
                  <ul className="info">
                    <li>経路S: {fmtD(p.route.distance)} / T = {fmtT(p.route.duration * (1 - p.progress / p.route.distance))} (OSRM)</li>
                    {p.range?.error && <li className="err">{p.range.error}</li>}
                    {p.range && !p.range.error && (
                      <>
                        <li>グラフ上の基準 T = {fmtT(p.range.T)}、許容 T+P2 = {fmtT(p.range.budget)}</li>
                        <li>A→B 所要 {fmtT(p.range.tAB)}</li>
                        <li>事物: 範囲R内 {p.counts.in} / 範囲外 {p.counts.out}</li>
                      </>
                    )}
                  </ul>
                ) : <p className="muted">現在地と目的地を設定すると経路を探索します。</p>}
                <h4>任意の点C の確認</h4>
                <div className="btns">
                  {modeBtn('probe', '点Cを指定')}
                  <button onClick={p.clearProbe} disabled={!p.probe}>クリア</button>
                </div>
                {p.probeRes && (
                  <p>A→B→C→D = {fmtT(p.probeRes.t)}(基準比 {p.probeRes.extra >= 0 ? '+' : ''}{fmtT(Math.abs(p.probeRes.extra))}) → <b>{p.probeRes.inside ? '範囲R内' : '範囲R外'}</b></p>
                )}
              </>
            )}
            {tab === 'dev' && (
              <>
                <h4>パラメータ</h4>
                {SL('P1: Bまでの距離 [m]', st.p1, ['p1'], 'p1', 10)}
                <label className="row"><span>B点を表示する</span>
                  <input type="checkbox" checked={st.map.showB} onChange={(e) => set(['map', 'showB'], e.target.checked)} /></label>
                <h4>事前取得した地図</h4>
                <label className="row"><span>地図ファイル</span>
                  <select value={p.prepared?.name || ''} onChange={(e) => { const m = p.maps.find((x) => x.name === e.target.value); p.loadMap(m || null); }}>
                    <option value="">(選択してください)</option>
                    {p.maps.map((m) => <option key={m.kind + m.name} value={m.name}>{m.kind === 'osm' ? `${m.name}.osm (${(m.size / 1e6).toFixed(1)}MB)` : `${m.name} (${m.ways}道路/${m.pois}事物)`}</option>)}
                  </select></label>
                <label className="row"><span>.osmファイルを取り込む</span>
                  <input type="file" accept=".osm,.xml,text/xml" disabled={p.building}
                    onChange={(e) => { p.importOsm(e.target.files[0]); e.target.value = ''; }} /></label>
                {!p.maps.length && <p className="muted">sample/maps/ に .osm ファイルを置いてページを再読込すると、ここに出ます。</p>}
                {p.prepared && <p className="muted">読み込み済み。この範囲内なら「グラフ計算」は通信なしで即時です。</p>}
                <h4>グラフ化範囲(手動指定)</h4>
                <div className="btns">
                  {modeBtn('box', '地図を2点タップで指定')}
                  <button onClick={p.useView}>表示中の範囲を使う</button>
                  <button onClick={p.clearArea} disabled={!p.area}>範囲クリア</button>
                </div>
                <div className="btns">
                  <button className="on" disabled={!p.area || p.building} onClick={p.buildArea}>{p.building ? '計算中…' : 'グラフ計算(取得+構築)'}</button>
                </div>
                {p.area && <p className="muted">範囲: 約{((p.area[2] - p.area[0]) * 110.54).toFixed(1)}km × {((p.area[3] - p.area[1]) * 111.32 * Math.cos(p.area[0] * Math.PI / 180)).toFixed(1)}km</p>}
                <label className="row"><span>経路から自動で範囲決定</span>
                  <input type="checkbox" checked={st.graph.auto} onChange={(e) => set(['graph', 'auto'], e.target.checked)} /></label>
                {st.graph.auto && SL('自動時の余白 [km]', st.graph.marginKm, ['graph', 'marginKm'], 'marginKm', 0.1)}
                <label className="row"><span>道路の種類</span>
                  <select value={st.graph.level} onChange={(e) => set(['graph', 'level'], e.target.value)}>
                    <option value="major">幹線のみ(tertiary以上)</option>
                    <option value="noservice">生活道路まで(標準)</option>
                    <option value="all">全て(私道/サービス道路含む)</option>
                  </select></label>
                {p.gs && <p className="muted">ノード数 {p.gs.graph.n.toLocaleString()} / {p.gs.fetchMs != null ? `取得 ${Math.round(p.gs.fetchMs)}ms / ` : ''}構築 {Math.round(p.gs.buildMs)}ms{p.range?.ms != null ? ` / 範囲計算 ${Math.round(p.range.ms)}ms` : ''}</p>}
                <h4>道路</h4>
                <Col label="経路S 色" value={st.road.routeColor} onChange={(v) => set(['road', 'routeColor'], v)} />
                {SL('経路S 太さ', st.road.routeWidth, ['road', 'routeWidth'], 'routeWidth', 0.5)}
                <Col label="範囲R内 色" value={st.road.inColor} onChange={(v) => set(['road', 'inColor'], v)} />
                {SL('範囲R内 太さ', st.road.inWidth, ['road', 'inWidth'], 'roadWidth', 0.1)}
                <Col label="範囲R外 色" value={st.road.outColor} onChange={(v) => set(['road', 'outColor'], v)} />
                {SL('範囲R外 太さ', st.road.outWidth, ['road', 'outWidth'], 'roadWidth', 0.1)}
                <h4>地図</h4>
                <Col label="背景色" value={st.map.bg} onChange={(v) => set(['map', 'bg'], v)} />
                <label className="row"><span>ナビ中は進行方向を上にする</span>
                  <input type="checkbox" checked={st.map.headingUp} onChange={(e) => set(['map', 'headingUp'], e.target.checked)} /></label>
                <label className="row"><span>OSMタイルを重ねる</span>
                  <input type="checkbox" checked={st.map.tiles} onChange={(e) => set(['map', 'tiles'], e.target.checked)} /></label>
                {st.map.tiles && SL('タイル不透明度', st.map.tileOpacity, ['map', 'tileOpacity'], 'tileOpacity', 0.05)}
                <h4>表示する事物</h4>
                {SL('範囲外は輝度を下げる [%]', st.poiDim, ['poiDim'], 'poiDim', 1)}
                <label className="row"><span>範囲R内の事物名を表示</span>
                  <input type="checkbox" checked={st.poiLabel.show} onChange={(e) => set(['poiLabel', 'show'], e.target.checked)} /></label>
                {st.poiLabel.show && SL('名前の文字サイズ[px]', st.poiLabel.size, ['poiLabel', 'size'], 'labelSize', 1)}
                {st.poiLabel.show && <Col label="名前の色" value={st.poiLabel.color} onChange={(v) => set(['poiLabel', 'color'], v)} />}
                <p className="muted">色は種類ごとに範囲内のみ指定し、範囲外は上の%だけ暗くなります。大きさ・ブラーは全種類共通です。</p>
                <h4>plotの大きさ・ブラー(全種類共通)</h4>
                {SL('範囲内 サイズ[px]', st.poiStyle.in.size, ['poiStyle', 'in', 'size'], 'poiSize', 1)}
                {SL('範囲内 ブラー(背面の半径)[px]', st.poiStyle.in.blur, ['poiStyle', 'in', 'blur'], 'poiBlur', 1)}
                {SL('範囲外 サイズ[px]', st.poiStyle.out.size, ['poiStyle', 'out', 'size'], 'poiSize', 1)}
                {SL('範囲外 ブラー(背面の半径)[px]', st.poiStyle.out.blur, ['poiStyle', 'out', 'blur'], 'poiBlur', 1)}
                <h4>種類ごとの色</h4>
                {POI_TYPES.map((t) => {
                  const c = st.poi[t.key];
                  return (
                    <details key={t.key} open={c.enabled}>
                      <summary>
                        <input type="checkbox" checked={c.enabled} onChange={(e) => set(['poi', t.key, 'enabled'], e.target.checked)} /> {t.label}
                      </summary>
                      <Col label="色(範囲内)" value={c.color} onChange={(v) => set(['poi', t.key, 'color'], v)} />
                    </details>
                  );
                })}
                <div className="btns"><button onClick={() => setSettings(DEFAULTS)}>設定を初期化</button></div>
              </>
            )}
            {tab === 'sim' && (
              <>
                <h4>仮想走行</h4>
                <p className="muted">現在地から経路Sに沿って車両を動かし、位置に応じて範囲Rを再計算します。</p>
                {SL(`速度 ×${st.sim.mult}(実速度比)`, st.sim.mult, ['sim', 'mult'], 'simMult', 0.1)}
                <div className="btns">{[0.5, 1, 2, 5, 10].map((m) => <button key={m} className={st.sim.mult === m ? 'on' : ''} onClick={() => set(['sim', 'mult'], m)}>×{m}</button>)}</div>
                <div className="btns">
                  <button disabled={!p.route} onClick={() => p.setRunning(!p.running)}>{p.running ? '一時停止' : '開始 / 再開'}</button>
                  <button disabled={!p.route} onClick={p.resetSim}>最初に戻す</button>
                </div>
                {p.route && <p>進行: {fmtD(p.progress)} / {fmtD(p.route.distance)}</p>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
