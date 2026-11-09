# Cornell GeoData

Explore environmental measurements, weather forecasts, and student research from
Cornell GeoData. Our team builds instruments and studies the air, water, and land
around Cayuga Lake and the Finger Lakes.

**[Visit Cornell GeoData](https://cornellgeodata.com)** — the maps, charts, and
forecasts are available in your browser, with no installation or account needed.

## Explore the data

| View | What you can do |
| --- | --- |
| [Sensor Map](https://cornellgeodata.com/#/sensors/map) | Select a station to see available air-quality, soil-moisture, or regional weather readings. |
| [Weather Forecast](https://cornellgeodata.com/#/sensors/forecast) | Compare observed radar with local and NOAA forecasts, explore weather layers, and inspect values at a location. |
| [Sensor Charts](https://cornellgeodata.com/#/sensors/air) | Explore readings over a day, week, month, or the available archive, and download station data as CSV. |
| [Building Energy](https://cornellgeodata.com/#/sensors/energy) | Step through a year of daily electricity forecasts for campus buildings, see where they ran high or low, and compare a building's forecast with its metered load. |
| [Ithaca LiDAR](https://cornellgeodata.com/#/sensors/lidar) | Explore a 3D survey of central Ithaca, filter predicted surface classes, and inspect individual points. |
| [Hexapod](https://cornellgeodata.com/#/sensors/hexapod) | Explore the Hexapod MKII, adjust its joints, and inspect the moving linkages. |

Use the grid button in the upper-right corner of a data view to switch between
the map, forecast, charts, and LiDAR viewer.

## Read the weather forecast

The viewer opens with **StormCast** and its radar layer selected. Each source
opens on radar, with other available layers listed underneath.

| Source | What it shows |
| --- | --- |
| **StormCast** | Local forecasts developed by the team using weather-model inputs and local sensor information: simulated radar, temperature, and wind. |
| **Nowcast** | Short-range radar forecasts from the team's StormScope pipeline. |
| **MRMS** | Observed radar from NOAA. |
| **HRRR** | NOAA forecasts of radar, temperature, wind, gusts, and accumulated precipitation and snowfall. |

1. Choose a source and weather layer.
2. Drag to move the map; scroll or pinch to zoom. Each source initially shows its
   full published coverage.
3. Move the time slider to explore a forecast. **Now** returns to the available
   forecast time closest to the current time. Times use your device's local time.
4. Click or tap the map for a value at that location. The point stays selected
   when you change layers or forecast times; select the point again to clear it.

The color scale gives the units for the selected layer. Radar colors represent
reflectivity in dBZ. HRRR precipitation and snow totals accumulate from the
initialization time shown beneath the source buttons.

## Understand the readings

The source label identifies an observation or a forecast. The forecast's
initialization time is the starting time for that forecast; the time slider shows
when the selected prediction applies. Check these times when comparing sources.

Map clicks report values from the selected radar or forecast grid. Station
measurements are available in the Sensor Map and Sensor Charts. Data availability
varies by station, and archived readings remain useful even when a station has
stopped reporting. Regional weather observations may arrive after the hour they
describe.

GeoData's local forecasts are student research products. They bring together
outside weather data, the team's model tuning, and local observations.

## Meet the team

- [Explore our projects](https://cornellgeodata.com/#projects)
- [Meet our members](https://cornellgeodata.com/#/members)
- [Read project updates](https://cornellgeodata.com/#/posts)
- [Support the team](https://cornellgeodata.com/#support)
- [Become a sponsor](https://cornellgeodata.com/#/sponsors)

Questions or feedback? [Contact the team](mailto:cugeodata@cornell.edu).

## Where things live

Page components stay together by feature:

| Work on | Start here |
| --- | --- |
| Home page and globe | [src/pages/home/](src/pages/home/) |
| Sponsorship page and alumni display | [src/pages/sponsors/](src/pages/sponsors/) |
| Sensor map, charts, and weather forecast | [src/pages/visualizations/](src/pages/visualizations/) |
| Member and blog pages | [MembersPage.tsx](src/pages/MembersPage.tsx), [PostsPage.tsx](src/pages/PostsPage.tsx) |
| Projects, posts, roster, and crowdfunding details | [src/data/](src/data/) |
| Shared fonts, colors, and styles | [src/styles/](src/styles/) |
| Building energy forecasts and footprints | [BuildingEnergy.tsx](src/pages/visualizations/BuildingEnergy.tsx), data in [public/energy/](public/energy/) |
| Ithaca LiDAR viewer | [src/viewers/lidar/](src/viewers/lidar/) |
| Interactive hexapod viewer | [src/viewers/hexapod/](src/viewers/hexapod/) |
| Images, fonts, sponsorship packet, and LiDAR data | [public/](public/) |
