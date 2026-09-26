# Weather Forecast Pipeline — Architecture Reference

Agent-facing reference. Read this before searching the codebase for anything related to
the forecast page, `geodata-wx`, or weather data. For the human-readable version with
rationale and diagrams, see the primer linked from the team wiki/Slack (ask the user).

## Data flow (3 separate git repos, only this one lives here)

```
Forecasting-Pipeline (club org repo, NOT in this workspace by default)
  runs on an NVIDIA DGX Spark GPU server, scheduled by systemd user timers
  (NOT cron, NOT a laptop — units/*.timer, see its README.md)
  fetches NOAA MRMS/GOES/GLM/HRRR + dynamical.org HRRR, runs local
  StormScope (nowcast) and StormCast (12h GPU forecast) models
  renders webp tiles + latest.json, then force-pushes to →

geodata-wx (github.com/CornellGeoData/geodata-wx, gh-pages branch)
  pure static output, GitHub Pages, https://cornellgeodata.github.io/geodata-wx
  ALWAYS a single force-pushed orphan commit — no real history, this is expected
  latest.json = the manifest; everything else is data (webp/json.gz) it points to

temp_website (THIS repo)
  src/pages/visualizations/WeatherForecast.tsx fetches latest.json every 60s
  and renders it on a hand-rolled Mercator map — no other code in this repo
  talks to geodata-wx
```

**Correction to a common assumption**: this is not "a cron job on a laptop." It's 5
systemd user timers (`units/*.timer` in Forecasting-Pipeline) on a shared DGX Spark
GPU box. If you're told otherwise, that's stale — verify against
`Forecasting-Pipeline/README.md` and `Forecasting-Pipeline/units/`.

## Where things live (this repo only)

| Concern | File |
|---|---|
| Page entry / routing | `src/App.tsx:30`, `src/pages/visualizations/VisualizationsPage.tsx:47-64` — hash router, URL is `#/sensors/forecast`. No react-router. |
| Forecast page component | `src/pages/visualizations/WeatherForecast.tsx` (392 lines) — **all** fetch, state, and most UI logic lives in this one file |
| Manifest fetch + polling | `WeatherForecast.tsx:159-182` — `fetch('${WX_BASE}/latest.json')`, 60s interval, refetch on tab focus |
| Base URL | `WeatherForecast.tsx:7` — `VITE_WX_BASE` env (unset anywhere in repo) falls back to `https://cornellgeodata.github.io/geodata-wx` |
| Layer/group picker UI | `WeatherForecast.tsx:281-335` |
| Time slider | `WeatherForecast.tsx:347-377` |
| Legend / color scale | `WeatherForecast.tsx:56-96, 340-344` — redraws the legend key from manifest `scale` metadata; does NOT recolor pixels (pixels are pre-colored by the pipeline) |
| Point-value probe (click map for a number) | `WeatherForecast.tsx:107-120, 227-249` — fetches companion `.json.gz` grid, gzip-sniffs first 2 bytes since GitHub Pages doesn't send `Content-Encoding` |
| Map engine (pan/zoom/tiles) | `src/pages/visualizations/TileMap.tsx` — fully hand-rolled, **no Leaflet/Mapbox/MapLibre**, no mapping library at all |
| Weather image compositing | `src/pages/visualizations/WeatherOverlay.tsx` — canvas-based, switches single overview image vs. tile grid at 1000px on-screen size |
| Mercator math (shared) | `src/pages/visualizations/mercator.ts` |
| Forecast tile metadata (landing page card, deep link) | `src/data/visualizations.ts:24` |

Stale reference to purge from memory: `src/components/ForecastView.tsx` was the
original filename and no longer exists (renamed to `WeatherForecast.tsx`). There is no
`src/visualizations` directory — it's `src/pages/visualizations/`.

## `latest.json` manifest schema (v2)

Top level: `{ generated, version, status, outlook, layers[] }`. `status`/`outlook` are
verbatim embeds of `nowcast_status.json`/`storm_outlook.json` (also published
standalone). `WeatherForecast.tsx`'s `Manifest` TS interface (line 97) does not model
`outlook` — it's fetched but unused by the frontend today.

Each `layers[]` entry: `id, group, kind, label, source, init, valid_until,
expected_update_at, stale_minutes, resolution_km, opacity, generation, bounds
{n,s,e,w}, values {cols,rows,unit,n,s,e,w}, tiles {width,height,size}, scale
{type:"steps"|"gradient", ...}, frames[] {valid, file, data}`.

Asset path convention (client never hardcodes this — always read `frames[].file`
verbatim from the manifest):
```
assets/v{N}/{layer_id}/{init_timestamp}/{frame_idx}.webp        preview raster
assets/v{N}/{layer_id}/{init_timestamp}/{frame_idx}.json.gz     raw value grid, {"v":[...]}
assets/v{N}/{layer_id}/{init_timestamp}/{frame_idx}/{row}-{col}.webp   512px tiles
```
`{frame_idx}` is a manifest array index, not a real forecast-hour label — always use
`frames[i].valid` for the actual time.

## Adding a new variable to an existing model (e.g. a new HRRR field)

All of this happens in `Forecasting-Pipeline`, not here:
1. `wx/web.py:47-49` — add to `HRRR_VARS` dict.
2. `wx/web.py` `render_hrrr()` (~376-395) — add unit conversion + `emit(...)` call with a
   color scale (new `STOPS`/`*_COLORS` entry if needed, `wx/web.py:33-46`).
3. `wx/web.py:24-25` — add the new layer `id` to `LAYER_ORDER` (unlisted ids are
   silently dropped).

Then check **this repo** — the frontend is manifest-driven and needs no code change
for a purely additive layer, *except* three hardcoded lists in `WeatherForecast.tsx`
that can silently misbehave on a genuinely new group:
- `GROUP_ORDER` (line 190) — must match `Forecasting-Pipeline/wx/web.py:23` or a new
  group sorts last.
- Layer-id exclusion list (line 185) — `['stormcast_rain','stormcast_precip']`, dead
  ids hardcoded out of the UI.
- Default-layer fallback chain (line 187) — hardcoded preference for
  `'stormcast_refc'` / `'radar_refc'`.

## Adding a whole new model

Same as above plus: new fetcher in `Forecasting-Pipeline/wx/fetch.py` (follow
`fetch_mrms`/`fetch_goes` pattern), and if it's a new local GPU model, inference code
goes in `wx/run.py` only (repo convention: it's the sole module importing
torch/earth2studio). Wire into `wx/cycle.py` dispatch + a new systemd unit pair in
`units/` if it needs its own schedule. This repo (`temp_website`) still only needs the
three `WeatherForecast.tsx` lists above touched.

## Changing the page UI

Everything is inline in `WeatherForecast.tsx` — no separate component files per
control. See the file table above for line ranges. Map/basemap/gesture behavior is in
`TileMap.tsx`; overlay tiling/compositing in `WeatherOverlay.tsx`; page chrome
(stage-switcher, header) in `VisualizationsPage.tsx:632-657`. No CSS framework —
everything is inline `style={{}}` objects; small-screen layout branches on a JS
`matchMedia('(max-width: 720px)')` boolean threaded as props, not media queries.

## Known issues worth fixing first

1. **`RENDER_VERSION` mismatch** — `Forecasting-Pipeline/wx/web.py:26` has
   `RENDER_VERSION = "v1"`, but the live `geodata-wx` site is actually serving
   `assets/v5/...`. Redeploying from the current pipeline snapshot as-is would create
   an asset-path collision. Fix before the next redeploy of Forecasting-Pipeline.
2. Duplicated `GROUP_ORDER`/model-group inference between
   `Forecasting-Pipeline/wx/web.py:23,457-458` and `WeatherForecast.tsx:188-190` — no
   compile-time link between the two repos, so they can drift silently.
3. `WeatherForecast.tsx` fetches/decodes each frame image twice — once via a bare
   `Image()` for load detection/prefetch (lines 197-213), again inside
   `WeatherOverlay.tsx:34-42` to actually paint it — two uncoordinated caches for the
   same URL.
4. No shared "weather API client" module — manifest/frame/value fetch logic is all
   inline in the one component; not reusable if a second consumer is ever built.
5. `Forecasting-Pipeline` has no automated tests at all, despite `wx/track.py`'s
   tracking/launch-decision logic being algorithmically dense and safety-relevant.

Full detail and rationale for all of the above, plus pipeline-repo-internal notes
(duplicated regrid code, hardcoded tuning constants, etc.), are in the human-readable
primer — ask the user for the link if you need it; it's not duplicated here to avoid
drift between two copies.
