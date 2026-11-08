# Detour Navi

React + Leaflet(OSM) + OSRM(経路) + Overpass(道路/事物)。サーバ不要の静的Webアプリ。

    npm install
    npm run dev      # http://<PCのIP>:5173 (同一Wi-Fiのスマホから開ける)
    npm run build    # dist/ を静的ホスティングに置けばスマホ公開できる

## スマホからのアクセス
1. 開発中: `npm run dev` (--host 済み) → スマホで `http://PCのLAN-IP:5173`
2. 公開: `npm run build` の dist/ を Cloudflare Pages / Netlify / GitHub Pages に置く(HTTPS)
3. GPS(現在地取得)は HTTPS でのみ動作 → 2、または `tailscale serve` / `cloudflared tunnel` を使う
