import { useEffect, useState } from 'react';

import { POI_TYPES } from './poitypes.js';
export { POI_TYPES };

export const DEFAULTS = {
  p1: 500, // B = 経路S上 現在地からP1[m]先
  p2: 300, // 許容追加時間[s]
  road: { routeColor: '#2f7bff', routeWidth: 5, inColor: '#ffffff', inWidth: 2, outColor: '#808080', outWidth: 1.5 },
  map: { bg: '#000000', tiles: false, tileOpacity: 0.35, headingUp: true },
  poi: Object.fromEntries(POI_TYPES.map((t) => [t.key, {
    enabled: t.key === 'convenience' || t.key === 'fuel',
    color: t.color, // 種類ごとは色(範囲内)のみ
  }])),
  // 大きさ・ブラーは全種類共通。範囲内/範囲外を個別に設定
  poiStyle: { in: { size: 12, blur: 8 }, out: { size: 6, blur: 4 } },
  poiLabel: { show: true, size: 12, color: '#ffffff' }, // 範囲R内の事物の名前表示
  poiDim: 60, // 範囲外の事物は、範囲内の色から輝度をこの%だけ下げる
  graph: { auto: false, marginKm: 2, level: 'noservice' }, // グラフ化範囲: 経路からの余白[km] / 道路種別
  sim: { mult: 2 }, // 実速度に対する倍率
  // スライダーの [下限, 上限] (開発設定で変更可)
  limits: {
    p1: [0, 3000], p2: [0, 1800], marginKm: [0.3, 10], routeWidth: [1, 20], roadWidth: [0.5, 10],
    tileOpacity: [0, 1], poiSize: [0, 40], poiBlur: [0, 40], poiDim: [0, 100], labelSize: [6, 30], simMult: [0.1, 20],
  },
};

function merge(base, over) {
  if (typeof base !== 'object' || base === null) return over ?? base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(base)) if (over && k in over) out[k] = merge(base[k], over[k]);
  return out;
}

export function useSettings() {
  const [s, setS] = useState(() => {
    try { return merge(DEFAULTS, JSON.parse(localStorage.getItem('navi-settings') || '{}')); } catch { return DEFAULTS; }
  });
  useEffect(() => { try { localStorage.setItem('navi-settings', JSON.stringify(s)); } catch { /* noop */ } }, [s]);
  return [s, setS];
}

// パス指定の不変更新: set(['road','inColor'], '#fff')
export function setPath(obj, path, value) {
  if (!path.length) return value;
  const [h, ...rest] = path;
  return { ...obj, [h]: setPath(obj[h], rest, value) };
}

// '#rrggbb' の輝度を pct% 下げる
export function dimColor(hex, pct) {
  const k = 1 - Math.min(Math.max(pct, 0), 100) / 100;
  const h = (i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0');
  return '#' + h(1) + h(3) + h(5);
}
