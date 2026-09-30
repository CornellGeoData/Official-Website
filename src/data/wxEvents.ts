// Suggested dates for the Model Verification stage.
//
// Drawn from the National Weather Service Binghamton office's archive of past
// events (weather.gov/bgm/pastweather) - their forecast area covers Ithaca,
// Syracuse and Binghamton - cross-checked against the NWS Buffalo lake-effect
// record for the events east of Lake Ontario.
//
// The hour is not a guess. Each one was found by querying dynamical's own
// archives across several points in the region and taking the hour that
// actually peaked: radar reflectivity for convective days, MRMS rain rate for
// flooding and lake effect, and the sharpest three-hour temperature fall for
// frontal passages.
//
// Where an event runs for many hours, the time is nudged to the nearest
// synoptic hour so AIFS - which only ever verifies at 00/06/12/18Z - has a
// forecast too. That nudge was only applied where the signal survives it:
// Debby still runs 18.9 mm/hr at 18Z against 33.4 at its 17Z peak. July 2025's
// flooding collapses from 20.7 mm/hr to 1.0 three hours either side, so it
// keeps its true peak and simply has no AIFS row.

export type EventKind = 'severe' | 'tropical' | 'frontal' | 'winter';

export interface WxEvent {
  id: string;
  /** UTC instant to verify, as an ISO string */
  valid: string;
  label: string;
  blurb: string;
  kind: EventKind;
  /** the field that shows this event best */
  field: string;
}

export const EVENT_KINDS: { id: EventKind; label: string }[] = [
  { id: 'severe', label: 'Severe convection' },
  { id: 'tropical', label: 'Tropical remnants & flooding' },
  { id: 'frontal', label: 'Cold fronts' },
  { id: 'winter', label: 'Lake effect & winter storms' },
];

export const WX_EVENTS: WxEvent[] = [
  // ---- severe convection ----
  {
    id: 'severe-2026-09-02',
    valid: '2026-09-02T15:00:00Z',
    label: 'Seneca County tornadoes',
    blurb: 'EF1 and EF2 tornadoes in Seneca County during a multi-day severe episode.',
    kind: 'severe',
    field: 'precipitation_rate',
  },
  {
    id: 'severe-2026-06-18',
    valid: '2026-06-18T16:00:00Z',
    label: 'Cortland and Yates tornadoes',
    blurb: 'An EF0 in Cortland County and an EF1 in Yates County on a midday severe day.',
    kind: 'severe',
    field: 'precipitation_rate',
  },
  {
    id: 'severe-2025-06-22',
    valid: '2025-06-22T09:00:00Z',
    label: 'Overnight severe complex',
    blurb: 'EF1 tornadoes from a storm cluster that crossed the region before dawn - a hard timing problem for any model.',
    kind: 'severe',
    field: 'precipitation_rate',
  },
  {
    id: 'severe-2023-08-07',
    valid: '2023-08-07T22:00:00Z',
    label: 'Tompkins to Oneida tornadoes',
    blurb: 'EF0 to EF1 tornadoes across Tompkins, Madison and Oneida Counties on a classic late-afternoon severe day.',
    kind: 'severe',
    field: 'precipitation_rate',
  },
  {
    id: 'severe-2023-07-24',
    valid: '2023-07-24T20:00:00Z',
    label: 'Cayuga and Tompkins wind damage',
    blurb: 'Straight-line winds through Cayuga and Tompkins Counties. Worth comparing on wind speed as well as rain.',
    kind: 'severe',
    field: 'wind_speed_10m',
  },

  // ---- tropical remnants and flooding ----
  {
    id: 'trop-2024-08-09',
    valid: '2024-08-09T18:00:00Z',
    label: 'Remnants of Debby',
    blurb: 'Tropical rain over most of the region - rain covered 84% of the domain at up to 91 mm/hr. Models split badly on coverage.',
    kind: 'tropical',
    field: 'precipitation_rate',
  },
  {
    id: 'trop-2025-07-14',
    valid: '2025-07-14T03:00:00Z',
    label: 'July flash flooding',
    blurb: 'An overnight flooding rain. Short-lived enough that it has no AIFS row at its peak hour.',
    kind: 'tropical',
    field: 'precipitation_rate',
  },
  {
    id: 'trop-2021-09-01',
    valid: '2021-09-01T19:00:00Z',
    label: 'Remnants of Hurricane Ida',
    blurb: 'The historic Ida flood. Predates AIFS, so this one is HRRR against GFS.',
    kind: 'tropical',
    field: 'precipitation_rate',
  },

  // ---- cold fronts ----
  {
    id: 'front-2022-12-23',
    valid: '2022-12-23T18:00:00Z',
    label: 'Arctic front and flash freeze',
    blurb: 'The sharpest front in this list: temperature fell 10.8 C in three hours. The best test of whether a model has the timing right.',
    kind: 'frontal',
    field: 'temperature_2m',
  },
  {
    id: 'front-2024-12-23',
    valid: '2024-12-23T00:00:00Z',
    label: 'Pre-Christmas arctic outbreak',
    blurb: 'Snow ahead of a hard cold push, bottoming near -18 C. Watch where each run puts the freezing line.',
    kind: 'frontal',
    field: 'temperature_2m',
  },

  // ---- lake effect and winter storms ----
  {
    id: 'winter-2024-02-28',
    valid: '2024-02-28T22:00:00Z',
    label: 'Lake effect with 59 mph winds',
    blurb: 'Northwest flow snow off Lake Ontario with the strongest gusts in this list. Try it on wind speed.',
    kind: 'winter',
    field: 'wind_speed_10m',
  },
  {
    id: 'winter-2025-01-02',
    valid: '2025-01-02T18:00:00Z',
    label: 'Long-duration lake effect',
    blurb: 'Days of northwest flow banding east of Lake Ontario. The narrow bands are where the coarse models give up.',
    kind: 'winter',
    field: 'precipitation_rate',
  },
  {
    id: 'winter-2024-11-22',
    valid: '2024-11-22T12:00:00Z',
    label: 'Heavy wet snow',
    blurb: 'A heavy, wet November snow with the rain-snow line running through the region.',
    kind: 'winter',
    field: 'temperature_2m',
  },
  {
    id: 'winter-2023-03-15',
    valid: '2023-03-15T03:00:00Z',
    label: 'March nor’easter',
    blurb: 'A synoptic snowstorm rather than a lake-effect one - the case where the global models should do best.',
    kind: 'winter',
    field: 'precipitation_rate',
  },
  {
    id: 'winter-2022-01-11',
    valid: '2022-01-11T03:00:00Z',
    label: 'Oneida County lake effect',
    blurb: 'A narrow overnight band into Oneida County, right at the edge of what a 3 km model resolves.',
    kind: 'winter',
    field: 'precipitation_rate',
  },
];
