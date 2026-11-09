// Shared projects for the Visualizations list.
export interface Visualization {
  id: 'map' | 'charts' | 'forecast' | 'verify' | 'energy' | 'lidar' | 'hexapod';
  label: string;
  blurb: string;
  thumb: string;
  hash: string; // deep link, e.g. #/sensors/map
}

// Order is display order, newest project first. Thumbnails are a frame from CUPI's own clip (hexapod) and
// U.S. government public-domain images on Wikimedia Commons:
// finger-lakes: NASA, commons.wikimedia.org/wiki/File:New_York's_Finger_Lakes.jpg
// great-lakes-cloud-streets: NASA GSFC, commons.wikimedia.org/wiki/File:Cloud_streets_and_ice_on_the_Great_Lakes_(false_color)_(MODIS_2018-01-11).jpg
// superstorm-model: NASA Goddard, commons.wikimedia.org/wiki/File:Tracking_a_Superstorm_(hd_video)_(8970128995).jpg
// lidar-relief: NOAA Ocean Exploration, commons.wikimedia.org/wiki/File:Airborne_Lidar_Bathymetric_Technology.jpg
// weather-sensor: NOAA NSSL, commons.wikimedia.org/wiki/File:2020_CLAMPS_Norman_OK-7.jpg
// building-energy: a frame of the Building Energy stage itself (Esri imagery, OpenStreetMap footprints)
export const VISUALIZATIONS: Visualization[] = [
  {
    id: 'energy',
    label: 'Building Energy',
    blurb: 'How well can we forecast campus electricity use? Compare each building\'s daily load with forecasts made a week ahead, through a year that includes January\'s cold snaps.',
    thumb: '/visualizations/building-energy.webp',
    hash: '#/sensors/energy',
  },
  {
    id: 'hexapod',
    label: 'Hexapod',
    blurb: 'Explore the Hexapod MKII in 3D. Select a leg, adjust its joints, and inspect each part.',
    thumb: '/visualizations/hexapod-walk.webp',
    hash: '#/sensors/hexapod',
  },
  {
    id: 'map',
    label: 'Sensor Map',
    blurb: 'Environmental sensor locations mapped over satellite imagery. Select a station to inspect its recent measurements.',
    thumb: '/visualizations/finger-lakes.webp',
    hash: '#/sensors/map',
  },
  {
    id: 'forecast',
    label: 'Weather Forecast',
    blurb: 'Radar observations and regional forecasts for the Finger Lakes. Compare precipitation, temperature, and wind across separate model layers.',
    thumb: '/visualizations/great-lakes-cloud-streets.webp',
    hash: '#/sensors/forecast',
  },
  {
    id: 'verify',
    label: 'Model Verification',
    blurb: 'How well did the models do? Compare what actually happened over Central New York against HRRR, GFS, and AIFS forecasts valid at the same hour.',
    thumb: '/visualizations/superstorm-model.webp',
    hash: '#/sensors/verify',
  },
  {
    id: 'lidar',
    label: 'Ithaca LiDAR',
    blurb: 'A 3D point cloud of central Ithaca with predicted surface classes. Inspect individual points and navigate terrain, vegetation, and buildings.',
    thumb: '/visualizations/lidar-relief.webp',
    hash: '#/sensors/lidar',
  },
  {
    id: 'charts',
    label: 'Sensor Charts',
    blurb: 'Time series from the environmental sensor network. Review current and historical measurements, or export records as CSV.',
    thumb: '/visualizations/weather-sensor.webp',
    hash: '#/sensors/air',
  },
];
