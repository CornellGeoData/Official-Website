#!/bin/sh
# Downloads what the art scripts render from, then rebuilds the images in public/art.
# usage: scripts/art/fetch.sh <empty work dir>     needs python3 with numpy, scipy, pillow, matplotlib
set -e
HERE=$(cd "$(dirname "$0")" && pwd); PUB="$HERE/../../public/art"
mkdir -p "$1/dem" "$1/census" "$1/art" "$1/nhd" "$1/geology"; cd "$1"
USGS=https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage
dem() { curl -sSf --retry 5 --retry-delay 20 --max-time 280 -G "$USGS" --data-urlencode "bbox=$1" --data-urlencode bboxSR=26918 --data-urlencode imageSR=26918 --data-urlencode "size=$2" --data-urlencode format=tiff --data-urlencode pixelType=F32 --data-urlencode f=image -o "dem/$3"; }
dem 335000,4688000,400000,4768000 2321,2857 cayuga_dem.tiff
dem 170000,4640000,440000,4810000 2700,1700 region_dem.tiff
BMNG=https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/december
for t in A1 B1; do curl -sSf --retry 3 -o "dem/$t.jpg" "$BMNG/world.topo.bathy.200412.3x21600x21600.$t.jpg"; done
for c in 36109 36099 36011 36097 36023 36117 36069 36123 36067 36107; do curl -sSf --retry 3 -o "census/tl_2023_${c}_roads.zip" "https://www2.census.gov/geo/tiger/TIGER2023/ROADS/tl_2023_${c}_roads.zip"; done
python3 -I "$HERE/fetch_nhd.py" nhd                                    # USGS streams and ponds
curl -sSf --retry 3 -o geology/NY.zip https://mrdata.usgs.gov/geology/state/shp/NY.zip  # USGS bedrock
python3 -I -m zipfile -e geology/NY.zip geology
python3 -I "$HERE/dem_base.py" dem/cayuga_dem.tiff art
python3 -I "$HERE/nature.py" nhd geology dem/region_dem.tiff art
python3 -I "$HERE/census_roads.py" census art
python3 "$HERE/data_terrain.py" art art                # one geographic model for both Data crops
python3 -I "$HERE/art_lenses.py" art "$HERE" --data-model=art/data-terrain.npz  # art/lens-<team>.png
python3 -I "$HERE/art_lenses.py" art "$HERE" --mobile --data-model=art/data-terrain.npz air water rock data tech business
python3 -I "$HERE/art_terrain.py" art "$HERE" "$PUB"    # public/art/terrain.webp
python3 -I "$HERE/art_region.py" dem/region_dem.tiff "$PUB" art  # public/art/region.webp
python3 -I "$HERE/art_earth.py" dem/A1.jpg dem/B1.jpg "$PUB/.."     # public/art/earth-ne.webp and earth-ny.webp
node "$HERE/publish.mjs" art "$PUB"                         # public/art/<team>.avif and .webp
node "$HERE/publish.mjs" art "$PUB" --mobile                 # public/art/subteams-mobile.webp
