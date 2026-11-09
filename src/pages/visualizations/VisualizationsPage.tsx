import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { RESIPLE, MANTI, CLOSE_ICON } from '../../styles/theme';
import SensorMap from './SensorMap';
import { useCompactViewport } from './useCompactViewport';
import { VisualizationList } from './VisualizationList';
import WeatherForecast from './WeatherForecast';
import WeatherVerify from './WeatherVerify';
import BuildingEnergy from './BuildingEnergy';
import { VISUALIZATIONS } from '../../data/visualizations';
import {
  AIR, SOIL, WEATHER, EGGS, SOILMOTES, ARCHIVE, RETIRED, NEWA_STATIONS, RANGES,
  eggSeries, newaSeries, eggTable, soilTable, newaTable, downloadCsv, fmtTime, thin, clip, dm,
  type MapSite, type SensorPoint, type SensorTable, type TimeRange,
} from './sensorData';
import { SensorChart, SoilCharts, WeatherCharts, EggCharts } from './SensorCharts';
import { wholeRowsHeight } from './wholeRows';

// the LiDAR and hexapod X matches their control panel: see .panel in src/viewers/*/style.css
const VIEWER_CLOSE: CSSProperties = { background: 'rgba(14,20,28,.88)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,.15)' };

// square utility button, shared by the card headers and the static sheet
const BTN: CSSProperties = { appearance: 'none', cursor: 'pointer', padding: '9px 11px', minHeight: 44, border: '1px solid rgba(255,255,255,0.22)', background: 'transparent', color: '#a9bcc6', fontFamily: RESIPLE, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 };

// empty state for a window with no samples; the page only fetches on load
const OFFLINE = 'No readings came back for this window. Reload the page to try again.';

// the smallest the corner grip can shrink a card to
const CARD_MIN = { w: 420, h: 120 };

// opening widths: two charts wide, with room for a classic scrollbar. Height comes from the charts; see
// ReadingCard. Retired probes carry a single lifetime plate, just wide enough for the header row.
const CARD_W = 720;
const RETIRED_W = 500;

// a card stays on screen: it parks 68px down, cascades 36px per card, and keeps a 12px margin below
const cardMaxHeight = (index: number) => `calc(100dvh - ${80 + index * 36}px)`;

// the static sheet's tabs wear their family's tone
const TAB_TONE = { air: AIR, soil: SOIL, weather: WEATHER } as const;

export function VisualizationsPage() {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ready'; raw: Record<string, unknown> }
  >({ status: 'loading' });
  const [unit, setUnit] = useState<'C' | 'F'>('F');
  // stages come from the hash: #/sensors/<map|air|soil|weather|forecast|lidar|hexapod>.
  // Bare #/sensors is the landing page
  const stageFromHash = () => window.location.hash.split('/')[2];
  const [mapView, setMapView] = useState(() => stageFromHash() === 'map');
  // the globe is the whole page; readings exist only for picked sensors.
  // Several can be open at once - each gets its own floating card.
  const [open, setOpen] = useState<string[]>([]);
  // phones run the same stages; isMobile only reshapes the chrome (insets,
  // the bottom-sheet card) rather than forking the page
  const isMobile = useCompactViewport();
  useEffect(() => { if (isMobile) setOpen((ids) => ids.slice(-1)); }, [isMobile]);
  // the page footer goes away under a full-screen stage - scrolling onto it
  // reads as jarring. It lives in App, so it's toggled directly.
  // the static sheet: the pre-globe sensors page (Air Quality / Soil Moisture
  // tabs, every chart with its lifetime twin) laid over the map stage. Holds
  // the open tab, or null while closed.
  const tabFromHash = () => { const t = stageFromHash(); return t === 'air' || t === 'soil' || t === 'weather' ? t : null; };
  const [staticView, setStaticView] = useState<'air' | 'soil' | 'weather' | null>(tabFromHash);
  // the forecast stage: regional weather maps over a light basemap, fed by the
  // lab's render pipeline. A full-screen sheet like staticView.
  const [forecastView, setForecastView] = useState(stageFromHash() === 'forecast');
  // the verification stage: the same map, showing what actually happened over
  // Central NY beside what each model forecast for that hour
  const [verifyView, setVerifyView] = useState(stageFromHash() === 'verify');
  // building energy: campus footprints shaded by forecast error (ColdSnaps backtests)
  const [energyView, setEnergyView] = useState(stageFromHash() === 'energy');
  const [lidarView, setLidarView] = useState(stageFromHash() === 'lidar');
  const [hexapodView, setHexapodView] = useState(stageFromHash() === 'hexapod');
  // the landing's links change the hash without remounting this page
  useEffect(() => {
    const onHash = () => {
      setMapView(stageFromHash() === 'map');
      setStaticView(tabFromHash());
      setForecastView(stageFromHash() === 'forecast');
      setVerifyView(stageFromHash() === 'verify');
      setEnergyView(stageFromHash() === 'energy');
      setLidarView(stageFromHash() === 'lidar');
      setHexapodView(stageFromHash() === 'hexapod');
      setOpen([]);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const home = !mapView && !staticView && !forecastView && !verifyView && !energyView && !lidarView && !hexapodView;
  useEffect(() => {
    if (home) return;
    const f = document.getElementById('partners');
    if (f) f.style.display = 'none';
    return () => { if (f) f.style.display = ''; };
  }, [home]);
  // a card's "Show all data" lands on that sensor's section, not the sheet top
  const [staticFocus, setStaticFocus] = useState<string | null>(null);
  const openStatic = (id: string) => {
    setStaticView(EGGS.some((e) => e.id === id) ? 'air' : NEWA_STATIONS.some((s) => s.id === id) ? 'weather' : 'soil');
    setStaticFocus(id);
  };
  useEffect(() => {
    if (!staticView || !staticFocus) return;
    document.getElementById(`static-${staticFocus}`)?.scrollIntoView({ block: 'start' });
    // scrollIntoView also drags the window; the sheet owns the scrolling
    window.scrollTo(0, 0);
    setStaticFocus(null);
  }, [staticView, staticFocus]);
  // the static sheet's time window
  const [range, setRange] = useState<TimeRange>('month');
  // the fixed site header stays for the globe stage and slides away while the
  // imagery (and the static sheet over it) has the screen. It lives in App,
  // so it's styled directly. Each stage's X is the way back to the menu (and
  // the header). The charts sheet is a page, not a map, so it keeps the
  // header outright
  const headerHidden = !staticView && (mapView || forecastView || verifyView || energyView || lidarView || hexapodView);
  useEffect(() => {
    const bar = document.querySelector('.site-header')?.parentElement as HTMLElement | null;
    if (!bar) return;
    bar.style.transition = 'transform 300ms ease';
    bar.style.transform = headerHidden ? 'translateY(-100%)' : 'translateY(0)';
    bar.inert = headerHidden;
    // Close the header menu without firing the stage's hash navigation listener.
    if (headerHidden) window.dispatchEvent(new Event('geodata:hide-header'));
    return () => {
      bar.style.transition = '';
      bar.style.transform = '';
      bar.inert = false;
    };
  }, [headerHidden]);
  // the 3D viewers need WebGL; without it the stage shows its still instead
  const [viewerFailed, setViewerFailed] = useState(false);
  const [viewerAttempt, setViewerAttempt] = useState(0);
  const [noWebGL, setNoWebGL] = useState<boolean | null>(null);
  useEffect(() => {
    if ((lidarView || hexapodView) && noWebGL === null) setNoWebGL(!supportsWebGL2());
  }, [lidarView, hexapodView, noWebGL]);
  useEffect(() => {
    setViewerFailed(false);
    const onFailure = (event: MessageEvent) => {
      const frame = document.querySelector<HTMLIFrameElement>('.geodata-viewer');
      if (event.origin === window.location.origin && event.source === frame?.contentWindow && event.data?.type === 'geodata:viewer-error') setViewerFailed(true);
    };
    window.addEventListener('message', onFailure);
    return () => window.removeEventListener('message', onFailure);
  }, [lidarView, hexapodView]);
  // reflect the current stage into the hash so refresh and copied links land
  // where the reader was (replaceState fires no hashchange, so no loop)
  useEffect(() => {
    const stage = staticView ?? (hexapodView ? 'hexapod' : lidarView ? 'lidar' : forecastView ? 'forecast' : verifyView ? 'verify' : energyView ? 'energy' : mapView ? 'map' : null);
    history.replaceState(null, '', stage ? `#/sensors/${stage}` : '#/sensors');
  }, [mapView, staticView, forecastView, verifyView, energyView, lidarView, hexapodView]);
  // clicking a dot toggles its card: open sensors close on a re-click. On
  // mobile only one sheet fits, so a pick replaces instead of stacking.
  const pick = (id: string | null) => {
    if (id === null) setOpen([]);
    else if (isMobile) setOpen((o) => (o.includes(id) ? [] : [id]));
    else setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  };
  const close = (id: string) => setOpen((o) => o.filter((x) => x !== id));
  // every probe on one globe - the air/soil split is carried by the pin colour
  // rather than by a tab, so the network reads as one network
  const sites: MapSite[] = useMemo(() => [
    ...EGGS.map((e) => ({ id: e.id, name: e.name, sub: e.location, tone: AIR, ...dm(e.coords) })),
    ...SOILMOTES.map((m) => ({ id: m.id, name: m.name, sub: m.location, tone: SOIL, labelBelow: m.labelBelow, ...dm(m.coords) })),
    ...RETIRED.map((r) => ({ id: r.name, name: r.name, sub: `Retired ${r.to}`, tone: SOIL, retired: true, ...dm(r.coords) })),
    ...NEWA_STATIONS.map((s) => ({ id: s.id, name: s.name, sub: s.location, tone: WEATHER, lat: s.lat, lon: s.lon })),
  ], []);
  // Nothing here is fetched until a stage needs it: the menu, the LiDAR
  // stage, and the hexapod stage read no sensors at all. Each feed runs once,
  // guarded by a ref, since its gate can flip more than once in a session.
  // liveData covers the map pins and the charts sheet; the two archives wait
  // for an open card or the sheet, because only those show a lifetime trace.
  const liveData = mapView || !!staticView;
  const soilArchive = (staticView === 'soil' && range === 'life') || open.some((id) => SOILMOTES.some((m) => m.id === id));
  const eggArchive = staticView === 'air' && range !== 'day';
  const alive = useRef(true);
  // set on the way in as well as out: StrictMode's practice unmount would
  // otherwise leave it false and drop every response that lands after it
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const started = useRef<Record<string, boolean>>({});
  // true the first time a gate opens, false forever after: the caller fetches
  // on a true and skips on a false
  const claim = (key: string, gate: boolean) => {
    if (!gate || started.current[key]) return false;
    started.current[key] = true;
    return true;
  };
  const [soil, setSoil] = useState<
    { status: 'loading' } | { status: 'error' } | { status: 'ready'; raw: Record<string, unknown> }
  >({ status: 'loading' });

  useEffect(() => {
    if (!claim('soil', liveData)) return;
    const url =
      `https://zynect.com/api/v2/messages/device/${SOILMOTES.map((m) => m.id).join(',')}` +
      `?dur=P1M&end-date=${new Date().toISOString()}&reduced=1&grouped=1`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => alive.current && setSoil({ status: 'ready', raw: (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown> }))
      .catch(() => alive.current && setSoil({ status: 'error' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData]);

  // NEWA stations, one POST each - absent id = still fetching, [] = offline.
  // station-local (NY) YYYYMMDDHH; the API rejects an edate past the current hour
  const stamp = (t: number) => new Date(t).toLocaleString('sv', { timeZone: 'America/New_York' }).replace(/\D/g, '').slice(0, 10);
  const loadWx = (sdate: string, set: React.Dispatch<React.SetStateAction<Record<string, { key: string; points: SensorPoint[] }[]>>>) => NEWA_STATIONS.forEach((st) => {
    fetch('https://hrly.nrcc.cornell.edu/stnHrly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid: st.sid, sdate, edate: stamp(Date.now()) }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => alive.current && set((m) => ({ ...m, [st.id]: newaSeries(raw) })))
      .catch(() => alive.current && set((m) => ({ ...m, [st.id]: [] })));
  });
  const [wx, setWx] = useState<Record<string, { key: string; points: SensorPoint[] }[]>>({});
  useEffect(() => {
    if (!claim('wx', liveData)) return;
    loadWx(stamp(Date.now() - 31 * 86_400_000), setWx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData]);
  // Lifetime is a set 5 years of hourly rows - ~4MB per station uncompressed,
  // so the archive fetch waits until someone actually picks Lifetime on the
  // weather tab, then runs once; charts show the month feed until it lands.
  // The server proxy keeps the bundle warm and gzipped (~2MB for all five
  // stations vs ~20MB straight from NRCC), so it lands in seconds.
  const [wxLife, setWxLife] = useState<Record<string, { key: string; points: SensorPoint[] }[]>>({});
  useEffect(() => {
    if (!claim('wxLife', staticView === 'weather' && range === 'life')) return;
    fetch('/api/wx-lifetime')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => alive.current && setWxLife(Object.fromEntries(
        NEWA_STATIONS.map((st) => [st.id, newaSeries((raw as Record<string, unknown>)[st.id])]),
      )))
      // no proxy running (plain vite dev): pull each station straight from NRCC
      .catch(() => loadWx(stamp(Date.now() - 5 * 365 * 86_400_000), setWxLife));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticView, range]);

  const [soilLife, setSoilLife] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (!claim('soilLife', soilArchive)) return;
    // the lifetime archive takes Zynect ~a minute to assemble, so it comes through
    // the server proxy (long cache) and the charts pop in when it lands
    fetch('/api/soil-lifetime')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .catch(() => {
        // no proxy running (plain vite dev): fetch the slow archive straight from
        // Zynect. Takes upstream ~a minute; the chart pops in when it lands.
        const url =
          `https://zynect.com/api/v2/messages/device/${SOILMOTES.map((m) => m.id).join(',')}` +
          `?dur=P2Y&end-date=${new Date().toISOString()}&reduced=1&grouped=1`;
        return fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
      })
      .then((raw) => alive.current && setSoilLife((raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soilArchive]);

  useEffect(() => {
    if (!claim('aqi', liveData)) return;
    fetch('/api/aqi')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => alive.current && setState({ status: 'ready', raw: (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown> }))
      .catch(() => alive.current && setState({ status: 'error' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData]);

  // The eggs' year-long archive for the history charts.
  const [eggLife, setEggLife] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!claim('eggLife', eggArchive)) return;
    fetch('/api/aqi-lifetime')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((raw) => alive.current && setEggLife((raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>))
      .catch(() => alive.current && setEggLife({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eggArchive]);

  // parsing the multi-MB feed is expensive - do it once per fetch, not per render
  const parsed = useMemo(
    () => Object.fromEntries(EGGS.map((egg) => [egg.id, state.status === 'ready' ? eggSeries(state.raw[egg.id]) : []])),
    [state],
  );
  const soilParsed = useMemo(
    () => Object.fromEntries(SOILMOTES.map((m) => [m.id, soil.status === 'ready' ? eggSeries(soil.raw[m.id]) : []])),
    [soil],
  );
  const soilLifeParsed = useMemo(
    () => Object.fromEntries(SOILMOTES.map((m) => [m.id, eggSeries(soilLife[m.id])])),
    [soilLife],
  );
  const eggLifeParsed = useMemo(
    () => Object.fromEntries(EGGS.map((egg) => [egg.id, eggLife ? eggSeries(eggLife[egg.id]) : []])),
    [eggLife],
  );

  // everything one sensor's card (or the mobile panel) needs, from its id -
  // several cards can be open at once, so this cannot live in page-level consts
  const deriveFor = (id: string | null) => {
    const site = sites.find((x) => x.id === id) ?? null;
    const egg = EGGS.find((e) => e.id === id) ?? null;
    const mote = SOILMOTES.find((m) => m.id === id) ?? null;
    const ret = RETIRED.find((r) => r.name === id) ?? null;
    const wxSt = NEWA_STATIONS.find((s) => s.id === id) ?? null;
    const accent = ret || mote ? SOIL : wxSt ? WEATHER : AIR;
    // decimal degrees read cleaner than the field notebook's DDM strings
    const metaLines = site
      ? [`${Math.abs(site.lat).toFixed(2)}° ${site.lat >= 0 ? 'N' : 'S'}, ${Math.abs(site.lon).toFixed(2)}° ${site.lon >= 0 ? 'E' : 'W'}`]
      : [];
    // last report time + liveness, shown in the card header
    let status: { live: boolean; t: number } | null = null;
    if (egg) {
      const ss = parsed[egg.id];
      if (ss.length) {
        const newest = Math.max(...ss.map((s) => s.points[s.points.length - 1].t));
        status = { live: Date.now() - newest < 45 * 60_000, t: newest };
      }
    } else if (mote) {
      const pts = soilParsed[mote.id].find((x) => x.key === 'soilmoisture')?.points.filter((q) => q.v !== 0);
      // ~30 min LoRa cadence, 2 missed reports = offline
      if (pts?.length) status = { live: Date.now() - pts[pts.length - 1].t < 75 * 60_000, t: pts[pts.length - 1].t };
    } else if (wxSt) {
      const ss = wx[wxSt.id];
      if (ss?.length) {
        const newest = Math.max(...ss.map((s) => s.points[s.points.length - 1].t));
        // NRCC serves hourly with a 1-2 h lag, so 3 h of silence = offline
        status = { live: Date.now() - newest < 3 * 3600_000, t: newest };
      }
    }
    const readings = !site ? null : (
      <>
        {egg && (
          state.status === 'loading' ? <Note>Contacting the egg&hellip;</Note>
          : parsed[egg.id].length === 0 ? <Note>{OFFLINE}</Note>
          : <EggCharts series={parsed[egg.id]} unit={unit} />
        )}
        {mote && (() => {
          // 0% is a non-reading (probe out of soil), not data
          const pts = soilParsed[mote.id].find((x) => x.key === 'soilmoisture')?.points.filter((q) => q.v !== 0);
          return soil.status === 'loading' ? <Note>Contacting the probe&hellip;</Note>
            : !pts || pts.length < 2 ? <Note>{OFFLINE}</Note>
            : <SoilCharts points={pts} lifetime={soilLifeParsed[mote.id].find((x) => x.key === 'soilmoisture')?.points.filter((q) => q.v !== 0 && q.t >= mote.lifeFrom)} />;
        })()}
        {ret && <SensorChart label="Lifetime" unit="% VWC" points={ARCHIVE[ret.name]} y0={0} minSpan={20} />}
        {wxSt && (() => {
          // the floating card answers "what's it like out": the last day, with
          // the full month behind Show all data
          const day = wxSeriesFor(wxSt.id, 'day');
          return !(wxSt.id in wx) ? <Note>Contacting the station&hellip;</Note>
            : day.length === 0 ? <Note>{OFFLINE}</Note>
            : <WeatherCharts series={day} unit={unit} />;
        })()}
      </>
    );
    return { site, accent, metaLines, readings, status };
  };

  // one egg's series at a time window: the day feed is densest for Day, the
  // year archive for everything longer; each falls back to the other while
  // its fetch is still out
  const eggSeriesFor = (id: string, r: TimeRange) => {
    const life = eggLifeParsed[id];
    const day = parsed[id];
    const src = r === 'day' ? (day.length ? day : life) : (life.length ? life : day);
    return src.map((s) => ({ key: s.key, points: clip(s.points, r) })).filter((s) => s.points.length > 1);
  };
  // one mote's soilmoisture points at a window (0% is a non-reading, not data)
  const soilPtsFor = (id: string, r: TimeRange) => {
    const mote = SOILMOTES.find((m) => m.id === id)!;
    const month = soilParsed[id].find((x) => x.key === 'soilmoisture')?.points.filter((q) => q.v !== 0) ?? [];
    if (r !== 'life') return clip(month, r);
    const life = soilLifeParsed[id].find((x) => x.key === 'soilmoisture')?.points.filter((q) => q.v !== 0 && q.t >= mote.lifeFrom);
    return life?.length ? life : month;
  };

  // one station's channels at a window; Lifetime uses the 5-year archive,
  // falling back to the month feed while that fetch is still out
  const wxSeriesFor = (id: string, r: TimeRange) => {
    const src = r === 'life' && wxLife[id]?.length ? wxLife[id] : wx[id];
    return (src ?? []).map((s) => ({ key: s.key, points: clip(s.points, r) })).filter((s) => s.points.length > 1);
  };

  // all of one sensor's data as rows at a window - feeds the log and the CSV
  const tableFor = (id: string, r: TimeRange): { name: string; table: SensorTable } | null => {
    const s = sites.find((x) => x.id === id);
    if (!s) return null;
    let table: SensorTable | null = null;
    if (EGGS.some((e) => e.id === id)) table = eggTable(eggSeriesFor(id, r), unit);
    else if (SOILMOTES.some((m) => m.id === id)) table = soilTable(soilPtsFor(id, r));
    else if (NEWA_STATIONS.some((s) => s.id === id)) table = newaTable(wxSeriesFor(id, r), unit);
    // retired probes are all history - the window doesn't apply
    else if (RETIRED.some((x) => x.name === id)) table = soilTable(ARCHIVE[id]);
    return table ? { name: s.name, table } : null;
  };
  const download = (id: string, r: TimeRange = range) => {
    const t = tableFor(id, r);
    if (t) downloadCsv(r === 'life' ? t.name : `${t.name} ${r}`, t.table);
  };

  // ---- the globe is the page; each open sensor floats its own card
  // (desktop) or docks as a bottom sheet over the imagery (mobile) ----
  const cardFor = (id: string) => {
    const d = deriveFor(id);
    if (!d.site) return null;
    return (
      <ReadingCard label={`${d.site.name} readings`} bodyPadding={isMobile ? '12px 12px max(16px, env(safe-area-inset-bottom))' : 16} header={
        <div data-drag-handle style={{ padding: isMobile ? '8px 12px 10px' : '12px 16px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.09)', cursor: isMobile ? 'default' : 'grab', userSelect: 'none', touchAction: isMobile ? 'auto' : 'none' }}>
          {/* name and GPS read as one block; on phones Show all data takes its own row and the X keeps the corner */}
          <div style={{ display: 'flex', flexWrap: isMobile ? 'wrap' : 'nowrap', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '8px 12px' : 8 }}>
            <div style={{ flex: '1 1 0', minWidth: 0, marginRight: isMobile ? 0 : 8 }}>
              <h3 style={{ fontFamily: MANTI, fontWeight: 700, fontSize: isMobile ? 20 : 22, lineHeight: 1.2, letterSpacing: '-0.015em', margin: 0, overflowWrap: 'anywhere' }}>{d.site.name}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 12px', marginTop: 2, color: '#a9bcc6', fontSize: 12, lineHeight: 1.4 }}>
                <span>{d.metaLines[0]}</span>
                {d.status && <span style={{ color: d.status.live ? '#84d3ab' : '#a9bcc6' }}>Updated {fmtTime(d.status.t)}</span>}
              </div>
            </div>
            <button onClick={() => openStatic(id)} style={{ ...BTN, minHeight: isMobile ? 44 : 36, height: isMobile ? 44 : 36, padding: '0 11px', order: isMobile ? 1 : 0, flexBasis: isMobile ? '100%' : 'auto' }}>Show all data →</button>
            <button onClick={() => close(id)} aria-label="Close readings" style={{ ...BTN, minHeight: isMobile ? 44 : 36, width: isMobile ? 44 : 36, height: isMobile ? 44 : 36, padding: isMobile ? 13 : 10 }}>{CLOSE_ICON}</button>
          </div>
        </div>
      } style={{
        // the corner grip resizes it to taste; the drag handle is the header bar
        width: d.site.retired ? RETIRED_W : CARD_W,
        maxWidth: 'calc(100vw - 48px)', maxHeight: cardMaxHeight(open.indexOf(id)), display: 'flex', flexDirection: 'column',
        // native corner grip: the card resizes and the charts remeasure to fit
        resize: 'both', overflow: 'hidden', minWidth: CARD_MIN.w, minHeight: CARD_MIN.h,
        // the bottom sheet: full width, no grip, tall enough for one whole chart on short phones, map visible above
        ...(isMobile && { width: '100%', maxWidth: '100%', minWidth: 0, maxHeight: 'min(max(58dvh, 430px), calc(100dvh - 80px))', minHeight: 0, resize: 'none' as const }),
        background: 'rgba(16,23,32,0.95)', backdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
      }}>
        {d.readings}
      </ReadingCard>
    );
  };
  const cards = open.flatMap((id) => {
    const node = cardFor(id);
    return node ? [{ id, node }] : [];
  });

  if (home) return <VisualizationList />;

  return (
    <section style={{ position: 'relative', zIndex: 2, background: '#0e141c', height: '100dvh', overflow: 'hidden' }}>
      {/* the map has the full screen; the header lives above it (z 50) and
          slides in only when summoned to the top edge */}
      {/* zIndex 0 makes this a stacking context, so the cards' ever-growing
          bring-to-front z-indexes can never climb over the page chrome or the
          tabular sheet */}
      {mapView && !staticView && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <SensorMap sites={sites} selectedIds={open} onSelect={pick} cards={cards} />
        </div>
      )}
      {mapView && !staticView && (
        <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', left: 'max(12px, env(safe-area-inset-left))', right: 'max(12px, env(safe-area-inset-right))', zIndex: 40, display: 'flex', gap: 8, alignItems: 'start' }}>
          <select aria-label="Find a sensor station" value={open[open.length - 1] ?? ''} onChange={(e) => pick(e.target.value || null)} style={{ minWidth: 0, width: isMobile ? undefined : 260, flex: isMobile ? 1 : undefined, height: 44, padding: '0 10px', border: '1px solid rgba(255,255,255,.5)', borderRadius: 0, color: '#fff', background: '#141c26', fontFamily: RESIPLE, fontSize: 16 }}>
            <option value="">Find a station</option>
            {sites.map((site) => <option key={site.id} value={site.id}>{isMobile ? site.name.replace(' (NEWA)', '') : site.name}{site.retired ? ' (inactive)' : ''}</option>)}
          </select>
          {!isMobile && <span style={{ flex: 1 }} />}
          <span role="group" aria-label="Temperature units" style={{ display: 'inline-flex', flexShrink: 0, border: '1px solid rgba(255,255,255,.5)', background: '#141c26' }}>
            {(['F', 'C'] as const).map((u) => <button key={u} aria-label={`Degrees ${u === 'F' ? 'Fahrenheit' : 'Celsius'}`} aria-pressed={unit === u} onClick={() => setUnit(u)} style={{ appearance: 'none', border: 0, width: 43, height: 42, padding: 0, fontFamily: RESIPLE, fontSize: 14, cursor: 'pointer', background: unit === u ? '#fff' : 'transparent', color: unit === u ? '#0e141c' : '#fff' }}>°{u}</button>)}
          </span>
          <StageClose />
        </div>
      )}
      {/* ---- the static sheet: the pre-globe sensors page over the stage ---- */}
      {staticView && (
        // top padding clears the fixed site header, which stays for this sheet
        <div style={{ position: 'absolute', inset: 0, top: (document.querySelector('.site-header') as HTMLElement | null)?.offsetHeight ?? 102, zIndex: 30, background: '#0e141c', overflowY: 'auto', overscrollBehavior: 'contain', padding: '16px clamp(16px,5vw,48px) max(48px, env(safe-area-inset-bottom))' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto' }}>
            {/* one line, even at 390px: unlabeled dropdowns (Month / °F speak
                for themselves), compact tabs, launcher on the right */}
            <div style={{ position: 'sticky', top: -16, zIndex: 2, padding: '12px 0', background: '#0e141c', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: isMobile ? 6 : 12 }}>
              <div style={{ display: 'inline-flex', border: `2px solid ${TAB_TONE[staticView]}`, overflow: 'hidden' }}>
                {([['air', isMobile ? 'AQ Egg' : 'Air Quality'], ['weather', 'Weather'], ['soil', isMobile ? 'Soil' : 'Soil Moisture']] as const).map(([id, label]) => (
                  <button key={id} aria-pressed={staticView === id} onClick={() => setStaticView(id)} style={{ appearance: 'none', border: 'none', cursor: 'pointer', minHeight: 44, padding: isMobile ? '10px 12px' : '10px 14px', fontFamily: RESIPLE, fontSize: 13, letterSpacing: isMobile ? '0.06em' : '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', background: staticView === id ? TAB_TONE[id] : 'transparent', color: staticView === id ? '#0e141c' : '#7c909b' }}>
                    {label}
                  </button>
                ))}
              </div>
              <span style={{ flex: 1 }} />
              {/* the °C/°F pick leads the cluster; it applies to the egg and
                  weather panels, so it sits out the soil tab */}
              {staticView !== 'soil' && (
                <select
                  aria-label="Temperature units"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as 'C' | 'F')}
                  style={{ appearance: 'none', cursor: 'pointer', height: 44, padding: isMobile ? '0 8px' : '0 14px', border: '1px solid rgba(255,255,255,0.22)', background: '#141c26', color: '#e6ecf0', fontFamily: RESIPLE, fontSize: 16, letterSpacing: '0.02em', textTransform: 'uppercase' }}
                >
                  {(['F', 'C'] as const).map((u) => <option key={u} value={u}>&deg;{u}</option>)}
                </select>
              )}
              {/* the window every chart and download share */}
              <select
                aria-label="Reading time range"
                value={range}
                onChange={(e) => setRange(e.target.value as TimeRange)}
                style={{ appearance: 'none', cursor: 'pointer', height: 44, padding: isMobile ? '0 8px' : '0 14px', border: '1px solid rgba(255,255,255,0.22)', background: '#141c26', color: '#e6ecf0', fontFamily: RESIPLE, fontSize: 16, letterSpacing: '0.02em', textTransform: 'uppercase' }}
              >
                {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {/* the sheet's X rides the row's right end, styled and sized
                  like the dropdowns beside it */}
              <StageClose style={{ height: 44, width: 44, border: '1px solid rgba(255,255,255,0.22)', background: '#141c26', backdropFilter: 'none' }} />
            </div>
            {staticView === 'air' && EGGS.map((egg) => (
              <details key={egg.id} id={`static-${egg.id}`} open style={{ background: '#141c26', border: `1px solid ${AIR}`, padding: 'clamp(20px,3.5vw,36px)', marginTop: 24, scrollMarginTop: isMobile ? 140 : 90 }}>
                <summary style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 18px' }}>
                  <span className="chev" style={{ color: '#7c909b', alignSelf: 'center' }} />
                  <h3 style={{ fontFamily: MANTI, fontWeight: 700, fontSize: 'clamp(24px,3vw,32px)', letterSpacing: '-0.015em', margin: 0 }}>{egg.name}</h3>
                  <span style={{ fontFamily: RESIPLE, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7c909b' }}>{egg.location}</span>
                  <span style={{ flex: 1 }} />
                  <DownloadButton name={egg.name} onDownload={() => download(egg.id)} />
                </summary>
                <div style={{ marginTop: 28 }}>
                  {(() => {
                    const series = eggSeriesFor(egg.id, range);
                    return state.status === 'loading' ? <Note>Contacting the egg&hellip;</Note>
                      : series.length === 0 ? <Note>{OFFLINE}</Note>
                      : <EggCharts series={series} unit={unit} />;
                  })()}
                </div>
              </details>
            ))}
            {staticView === 'soil' && SOILMOTES.map((mote) => {
              const pts = soilPtsFor(mote.id, range);
              return (
                <details key={mote.id} id={`static-${mote.id}`} open style={{ background: '#141c26', border: `1px solid ${SOIL}`, padding: 'clamp(20px,3.5vw,36px)', marginTop: 24, scrollMarginTop: isMobile ? 140 : 90 }}>
                  <summary style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 18px' }}>
                    <span className="chev" style={{ color: '#7c909b', alignSelf: 'center' }} />
                    <h3 style={{ fontFamily: MANTI, fontWeight: 700, fontSize: 'clamp(24px,3vw,32px)', letterSpacing: '-0.015em', margin: 0 }}>{mote.name}</h3>
                    {/* coords are dead weight on a phone-width summary line */}
                    <span style={{ fontFamily: RESIPLE, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7c909b' }}>{isMobile ? mote.location : `${mote.location} ${mote.coords}`}</span>
                    <span style={{ flex: 1 }} />
                    <DownloadButton name={mote.name} onDownload={() => download(mote.id)} />
                  </summary>
                  <div style={{ marginTop: 28 }}>
                    {soil.status === 'loading' ? <Note>Contacting the probe&hellip;</Note>
                      : pts.length < 2 ? <Note>{OFFLINE}</Note>
                      : <SensorChart label={RANGES.find(([v]) => v === range)![1]} unit="% VWC" points={thin(pts)} y0={0} minSpan={20} />}
                  </div>
                </details>
              );
            })}
            {staticView === 'soil' && (
              <div style={{ marginTop: 40 }}>
                <div style={{ fontFamily: RESIPLE, fontSize: 13, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7c909b' }}>Inactive Sensors</div>
                {RETIRED.map((r) => (
                  <details key={r.name} id={`static-${r.name}`} open style={{ background: '#141c26', border: `1px solid ${SOIL}`, padding: 'clamp(20px,3.5vw,36px)', marginTop: 24, scrollMarginTop: isMobile ? 140 : 90 }}>
                    <summary style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 18px' }}>
                      <span className="chev" style={{ color: '#7c909b', alignSelf: 'center' }} />
                      <h3 style={{ fontFamily: MANTI, fontWeight: 700, fontSize: 'clamp(24px,3vw,32px)', letterSpacing: '-0.015em', margin: 0 }}>{r.name}</h3>
                      {/* phones: bare date range, so name + dates + download share one line */}
                      <span style={{ fontFamily: RESIPLE, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7c909b' }}>{isMobile ? `(${r.from} - ${r.to})` : `Active: (${r.from} - ${r.to}) | Coords: ${r.coords}`}</span>
                      <span style={{ flex: 1 }} />
                      <DownloadButton name={r.name} onDownload={() => download(r.name)} />
                    </summary>
                    <div style={{ marginTop: 28 }}>
                      {/* retired probes are all history - the window doesn't apply */}
                      <SensorChart label="Lifetime" unit="% VWC" points={ARCHIVE[r.name]} y0={0} minSpan={20} />
                    </div>
                  </details>
                ))}
              </div>
            )}
            {staticView === 'weather' && NEWA_STATIONS.map((st) => {
              const series = wxSeriesFor(st.id, range);
              return (
                <details key={st.id} id={`static-${st.id}`} open style={{ background: '#141c26', border: `1px solid ${WEATHER}`, padding: 'clamp(20px,3.5vw,36px)', marginTop: 24, scrollMarginTop: isMobile ? 140 : 90 }}>
                  <summary style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 18px' }}>
                    <span className="chev" style={{ color: '#7c909b', alignSelf: 'center' }} />
                    <h3 style={{ fontFamily: MANTI, fontWeight: 700, fontSize: 'clamp(24px,3vw,32px)', letterSpacing: '-0.015em', margin: 0 }}>{st.name}</h3>
                    <span style={{ fontFamily: RESIPLE, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7c909b' }}>{isMobile ? st.location : `${st.location} ${Math.abs(st.lat).toFixed(2)}° N, ${Math.abs(st.lon).toFixed(2)}° W`}</span>
                    <span style={{ flex: 1 }} />
                    <DownloadButton name={st.name} onDownload={() => download(st.id)} />
                  </summary>
                  <div style={{ marginTop: 28 }}>
                    {!(st.id in wx) ? <Note>Contacting the station&hellip;</Note>
                      : series.length === 0 ? <Note>{OFFLINE}</Note>
                      : (
                        <>
                          {/* the month feed stands in while the archive is out - say so */}
                          {range === 'life' && !(st.id in wxLife) && <Note>Loading the 5-year archive&hellip; showing the last month until it lands.</Note>}
                          <WeatherCharts series={series} unit={unit} />
                        </>
                      )}
                  </div>
                </details>
              );
            })}
            {staticView === 'weather' && (
              <div style={{ fontFamily: RESIPLE, fontSize: 11.5, letterSpacing: '0.06em', color: '#7c909b', marginTop: 28 }}>
                Regional stations courtesy of NEWA and the Northeast Regional Climate Center at Cornell. Hourly readings, typically 1-2 hours behind.
              </div>
            )}
          </div>
        </div>
      )}
      {(lidarView || hexapodView) && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30 }}>
          {noWebGL === null ? (
            <div role="status" style={{ padding: 24, fontFamily: RESIPLE, color: '#a9bcc6' }}>Loading 3D view…</div>
          ) : noWebGL || viewerFailed ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: `#0e141c url(${VISUALIZATIONS.find((v) => v.id === (hexapodView ? 'hexapod' : 'lidar'))?.thumb}) center/cover` }}>
              <div style={{ maxWidth: 420, maxHeight: 'calc(100dvh - 96px)', overflowY: 'auto', padding: 26, background: 'rgba(14,20,28,0.92)', border: '1px solid rgba(255,255,255,0.15)', fontFamily: RESIPLE, fontSize: 15, lineHeight: 1.6, color: '#e6ecf0' }}>
                <h2 style={{ margin: '0 0 12px', fontSize: 24 }}>{hexapodView ? 'Explore the Hexapod MKII' : 'Explore Ithaca in 3D'}</h2>
                <p>The interactive view could not start on this device. You can retry or explore the project below.</p>
                {hexapodView && <video controls playsInline preload="none" poster="/projects/hexapod-walk.webp" src="/projects/hexapod-walk.mp4" style={{ width: '100%', marginBottom: 16 }} />}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button style={BTN} onClick={() => { setNoWebGL(!supportsWebGL2()); setViewerFailed(false); setViewerAttempt((n) => n + 1); }}>Retry 3D</button>
                  <a href={hexapodView ? '#/posts/lidar-hexapod' : '#/sensors'} style={{ ...BTN, display: 'inline-flex', alignItems: 'center' }}>{hexapodView ? 'Read about the project' : 'Explore other data'}</a>
                </div>
              </div>
            </div>
          ) : (
            <iframe key={viewerAttempt} className="geodata-viewer" onError={() => setViewerFailed(true)} src={hexapodView ? '/hexapod/' : '/lidar/'} title={hexapodView ? 'Interactive Hexapod MKII' : 'Ithaca semantic LiDAR viewer'} allow="fullscreen" style={{ width: '100%', height: '100%', border: 0 }} />
          )}
          <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 'max(12px, env(safe-area-inset-right))', zIndex: 5 }}>
            <StageClose style={VIEWER_CLOSE} />
          </div>
        </div>
      )}
      {forecastView && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30 }}>
          <WeatherForecast />
          <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 'max(12px, env(safe-area-inset-right))', zIndex: 5 }}>
            <StageClose />
          </div>
        </div>
      )}
      {verifyView && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30 }}>
          <WeatherVerify />
          <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 'max(12px, env(safe-area-inset-right))', zIndex: 5 }}>
            <StageClose />
          </div>
        </div>
      )}
      {energyView && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30 }}>
          <BuildingEnergy />
          <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top))', right: 'max(12px, env(safe-area-inset-right))', zIndex: 5 }}>
            <StageClose />
          </div>
        </div>
      )}
    </section>
  );
}

// the way out of a stage: an X back to the visualizations menu. A plain
// link, so the hash change resets every stage and closes open cards
function StageClose({ style }: { style?: CSSProperties }) {
  return (
    <a href="#/sensors" aria-label="Back to visualizations" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', width: 44, height: 44, flex: '0 0 auto', alignSelf: 'flex-start', aspectRatio: '1', padding: 13, border: '1px solid rgba(255,255,255,.5)', background: '#141c26', color: '#e6ecf0', ...style }}>{CLOSE_ICON}</a>
  );
}

// A readings card opens on whole charts: it ends at the last row that fits, never partway through one, and the
// rest scroll. It re-fits as charts load in or the window changes, until someone takes the corner grip.
function ReadingCard({ label, style, header, bodyPadding, children }: { label: string; style: CSSProperties; header: ReactNode; bodyPadding: string | number; children: ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const chartsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const card = cardRef.current!, body = bodyRef.current!, charts = chartsRef.current!;
    const fit = () => {
      const top = charts.getBoundingClientRect().top;
      const bottoms = [...charts.querySelectorAll('[data-plate]')].map((plate) => plate.getBoundingClientRect().bottom - top);
      const { paddingTop, paddingBottom } = getComputedStyle(body);
      const chrome = card.offsetHeight - body.clientHeight + parseFloat(paddingTop) + parseFloat(paddingBottom);
      const height = wholeRowsHeight(bottoms, chrome, parseFloat(getComputedStyle(card).maxHeight));
      card.style.height = height === null ? '' : `${height}px`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(charts);
    window.addEventListener('resize', fit);
    const stop = () => { observer.disconnect(); window.removeEventListener('resize', fit); };
    // the grip belongs to the card itself; everything else on it is a child
    const onGrip = (e: PointerEvent) => { if (e.target === card) stop(); };
    card.addEventListener('pointerdown', onGrip);
    return () => { stop(); card.removeEventListener('pointerdown', onGrip); };
  }, []);
  return (
    <div ref={cardRef} className="sensor-reading-card" role="region" aria-label={label} style={style}>
      {header}
      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: bodyPadding }}>
        <div ref={chartsRef}>{children}</div>
      </div>
    </div>
  );
}

// a sensor's CSV download: the icon alone, in the page's square button
function DownloadButton({ name, onDownload }: { name: string; onDownload: () => void }) {
  return (
    <button aria-label={`Download ${name} data`} title="Download CSV" onClick={(e) => { e.preventDefault(); onDownload(); }} style={{ ...BTN, width: 44, height: 44, padding: 12 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}><path d="M12 3v12M6.5 10l5.5 5.5 5.5-5.5M4 20.5h16" /></svg>
    </button>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div style={{ fontFamily: RESIPLE, fontSize: 14.5, color: '#7c909b' }}>{children}</div>;
}

function supportsWebGL2() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}
