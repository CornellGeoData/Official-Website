# Air wind snapshot

`air-wind.npz` is the tested WindNinja **mass-conservation** output initialized with the full spatial HRRR wind field. `air-wind.json` records the source, time, projection and assumptions. This is a fixed artwork snapshot, not a live weather feed.

The arrays `u` and `v` contain projected east/north wind components in m/s, with rows ordered north to south. `xll`, `yll` and `cell` preserve the ASCII grid's corner georeference. The renderer interpolates these vectors and rotates them into the same lake frame used by every team. Direction arrows follow the field; brighter, thicker lines indicate faster wind on a fixed 0–10 m/s scale. No synthetic curl or shoreline barrier is added.

Render with the existing terrain work directory (NumPy, SciPy, Pillow and Matplotlib required):

```sh
python3 scripts/art/art_lenses.py /path/to/art scripts/art air
python3 scripts/art/art_lenses.py /path/to/art scripts/art --mobile air
node scripts/art/publish.mjs /path/to/art public/art air
node scripts/art/publish.mjs /path/to/art public/art --mobile
```

The mobile publication also reads the other five current mobile masters to preserve the continuous lake. Simulation and plotting run offline; the site loads ordinary AVIF/WebP assets.

# Data terrain snapshot

`data-terrain.npz` contains the approved shared classification of USGS 3DEP elevation around Cayuga Lake. Eight k-means groups use elevation, slope, curvature and east/north slope direction. Training excludes lake cells; categorical neighborhood cleanup preserves class identities. Brighter purple corresponds to groups with steeper average slopes. These are exploratory terrain groups, not validated landform categories.

Desktop and mobile sample the same geographic labels and color order. `data-terrain.json` records the source DEM hash, projection, feature scales, model centers and class statistics. Render the saved snapshot with the matching terrain work directory:

```sh
python3 scripts/art/art_lenses.py /path/to/art scripts/art --data-model=scripts/art/data/data-terrain.npz data
python3 scripts/art/art_lenses.py /path/to/art scripts/art --mobile --data-model=scripts/art/data/data-terrain.npz data
node scripts/art/publish.mjs /path/to/art public/art data
node scripts/art/publish.mjs /path/to/art public/art --mobile
```

To fit a new model from a prepared terrain directory, run `python3 scripts/art/data_terrain.py /path/to/art /path/to/model`, then pass its `data-terrain.npz` to both render commands. The full `fetch.sh` workflow builds one fresh model in its work directory and reuses it for both crops.
