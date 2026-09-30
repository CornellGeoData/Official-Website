// Client for the site's model-verification API (server/wxVerify.mjs).
//
// The archives cannot be read from the browser at this scale - one panel costs
// several MB of Icechunk chunks - so the server reads, colorizes and serves a
// WebP. Panels are immutable, so every URL here is safe to cache forever.
import type { Scale } from './wxClient';

export interface VerifyModel {
  id: string;
  label: string;
  note: string;
  maxLeadHours: number;
  /** AIFS is 6, so it only ever has a forecast valid at 00/06/12/18Z */
  leadStepHours: number;
  firstInit: number;
  lastInit: number;
}

export interface VerifyField {
  id: string;
  label: string;
  unit: string;
  /** one ramp per field, shared by the observation and every model - panels on
   *  different scales could not be compared by eye, which is the whole point */
  scale: Scale;
  truth: { label: string; start: number; end: number; attribution: string | null };
  models: VerifyModel[];
}

export interface Region { n: number; s: number; e: number; w: number }

/** The ramp is baked into the rendered pixels, so the unit system is a property
 *  of the image, not a client-side relabelling - switching re-renders. */
export type UnitSystem = 'imperial' | 'metric';

export interface VerifyCatalog {
  region: Region;
  runs: number;
  units: UnitSystem;
  fields: VerifyField[];
}

export interface MatrixCell { init: number; leadHours: number }
export interface MatrixRow { model: string; label: string; cells: (MatrixCell | null)[] }
export interface Matrix {
  field: string;
  valid: number;
  region: Region;
  /** rate fields have no value at lead 0, so their first column is always empty */
  minLeadHours: number;
  columns: { init: number; leadHours: number }[];
  truth: { label: string; available: boolean };
  rows: MatrixRow[];
}

async function getJson<T>(url: string, timeout = 60_000): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

export function fetchCatalog(units: UnitSystem): Promise<VerifyCatalog> {
  return getJson<VerifyCatalog>(`/api/wx-verify/fields?units=${units}`, 120_000);
}

export function fetchMatrix(field: string, valid: number): Promise<Matrix> {
  return getJson<Matrix>(`/api/wx-verify/matrix?field=${encodeURIComponent(field)}&valid=${Math.round(valid)}`);
}

/** Which panel is on screen: the observation, or one model run. */
export type Selection = { source: 'obs' } | { source: string; init: number };

export function panelUrl(field: string, valid: number, sel: Selection, units: UnitSystem, px = 768): string {
  const p = new URLSearchParams({ field, valid: String(Math.round(valid)), source: sel.source, units, px: String(px) });
  if (sel.source !== 'obs') p.set('init', String(Math.round((sel as { init: number }).init)));
  return `/api/wx-verify/panel.webp?${p}`;
}

export const sameSelection = (a: Selection, b: Selection) =>
  a.source === b.source && (a.source === 'obs' || (a as { init: number }).init === (b as { init: number }).init);

/** Why a panel failed, in the server's own words. */
export async function panelError(url: string): Promise<string> {
  try {
    const r = await fetch(url);
    if (r.ok) return 'This panel could not be drawn.';
    const body = await r.json().catch(() => null);
    return body?.error ?? `The map service returned HTTP ${r.status}.`;
  } catch {
    return 'The map service is unreachable. Run `node server.mjs` alongside the dev server.';
  }
}
