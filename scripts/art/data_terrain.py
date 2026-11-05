"""Fit one geographic terrain classification for both Data artwork crops.

Usage: python3 scripts/art/data_terrain.py <terrain-work-dir> <output-dir>
The output grid uses terrain.py's existing sample coordinates: east=e0+col*cell,
north=n0-row*cell. Renderers must use nearest-neighbor labels and 255 outside it.
"""
import hashlib
import json
from pathlib import Path
import sys
import time

import numpy as np
from scipy import ndimage as ndi
from scipy.cluster.vq import kmeans2, vq

from terrain import CELL, E0, N0, load

CLASSES = 8
NODATA = 255


def categorical_cleanup(labels, land, size=5):
    """Use the neighborhood's unique mode; retain the center on any tie."""
    best = np.zeros(labels.shape, np.uint8)
    winner = np.zeros(labels.shape, np.uint8)
    tied = np.zeros(labels.shape, bool)
    for label in range(CLASSES):
        votes = np.rint(ndi.uniform_filter(
            ((labels == label) & land).astype(np.float32),
            size=size, mode='constant', cval=0,
        ) * size * size).astype(np.uint8)
        greater, equal = votes > best, votes == best
        winner[greater] = label
        tied[greater] = False
        tied[equal] = True
        np.maximum(best, votes, out=best)
    cleaned = labels.copy()
    change = land & ~tied
    cleaned[change] = winner[change]
    cleaned[~land] = NODATA
    return cleaned


def check_cleanup():
    rng = np.random.default_rng(12)
    labels = rng.integers(0, CLASSES, size=(19, 23), dtype=np.uint8)
    land = rng.random(labels.shape) > .2
    labels[~land] = NODATA
    permutation = rng.permutation(CLASSES).astype(np.uint8)
    renamed = labels.copy()
    renamed[land] = permutation[labels[land]]
    expected = categorical_cleanup(labels, land)
    expected[land] = permutation[expected[land]]
    assert np.array_equal(categorical_cleanup(renamed, land), expected)
    assert np.all(expected[~land] == NODATA)


def build(terrain_dir, output_dir):
    started = time.perf_counter()
    check_cleanup()
    terrain_dir, output_dir = Path(terrain_dir), Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    elevation, water = load(str(terrain_dir))
    valid = np.isfinite(elevation)
    assert valid.all(), 'Prepare the DEM with dem_base.py before clustering'
    land = valid & ~water
    assert land.sum() >= 60000

    smoothed_elevation = ndi.gaussian_filter(elevation, 45 / CELL)
    southward, eastward = np.gradient(ndi.gaussian_filter(elevation, 75 / CELL), CELL)
    northward = -southward
    slope = np.hypot(eastward, northward)
    curvature = ndi.gaussian_laplace(elevation, 180 / CELL) / CELL ** 2
    scales = {
        'elevation_mean_m': float(smoothed_elevation[land].mean()),
        'elevation_std_m': float(smoothed_elevation[land].std()),
        'slope_p98_m_per_m': float(np.percentile(slope[land], 98)),
        'abs_curvature_p98_per_m': float(np.percentile(np.abs(curvature[land]), 98)),
        'direction_regularizer_m_per_m': .05 / 15,
    }
    assert all(v > 0 for k, v in scales.items() if k != 'elevation_mean_m')
    direction_denominator = slope + scales['direction_regularizer_m_per_m']
    features = np.stack([
        (smoothed_elevation - scales['elevation_mean_m']) / scales['elevation_std_m'],
        np.clip(slope / scales['slope_p98_m_per_m'], 0, 1) * 2.4,
        np.clip(curvature / scales['abs_curvature_p98_per_m'], -1, 1) * 1.6,
        eastward / direction_denominator * .8,
        northward / direction_denominator * .8,
    ], axis=-1).astype(np.float32)
    land_indices = np.flatnonzero(land)
    sample_indices = np.random.default_rng(3).choice(land_indices, 60000, replace=False)
    assert land.ravel()[sample_indices].all()
    flat_features = features.reshape(-1, 5)
    print(f'Fitting {CLASSES} clusters to 60,000 land samples...', flush=True)
    centers, _ = kmeans2(flat_features[sample_indices].astype(np.float64),
                         CLASSES, minit='++', seed=3, iter=30, missing='raise')
    assert np.isfinite(centers).all()

    labels = np.full(elevation.size, NODATA, np.uint8)
    for offset in range(0, len(land_indices), 250000):
        indices = land_indices[offset:offset + 250000]
        labels[indices] = vq(flat_features[indices], centers.astype(np.float32))[0]
    labels = labels.reshape(elevation.shape)
    cleaned = categorical_cleanup(labels, land)
    changed = int(np.count_nonzero(cleaned[land] != labels[land]))
    assert np.all(cleaned[water] == NODATA)
    assert np.array_equal(np.unique(cleaned[land]), np.arange(CLASSES))

    mean_slopes = np.array([float(slope[cleaned == k].mean()) for k in range(CLASSES)])
    rank = np.argsort(np.argsort(mean_slopes)).astype(np.uint8)
    stats = []
    for label in range(CLASSES):
        cells = cleaned == label
        stats.append({
            'class': label,
            'color_rank': int(rank[label]),
            'land_cells': int(cells.sum()),
            'area_km2': float(cells.sum() * CELL ** 2 / 1e6),
            'mean_elevation_m': float(elevation[cells].mean()),
            'mean_slope_m_per_m': float(mean_slopes[label]),
            'mean_slope_degrees': float(np.degrees(np.arctan(slope[cells])).mean()),
            'mean_curvature_per_m': float(curvature[cells].mean()),
        })
    np.savez_compressed(output_dir / 'data-terrain.npz',
                        labels=cleaned, rank_by_class=rank, centers=centers,
                        e0=E0, n0=N0, cell=CELL, water=water, valid=valid)
    metadata = {
        'description': 'One land-only terrain-shape classification for desktop and mobile Data artwork.',
        'source': 'USGS 3DEP Bare Earth DEM dynamic elevation service',
        'source_url': 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer',
        'source_dem_sha256': hashlib.sha256((terrain_dir / 'z.npy').read_bytes()).hexdigest(),
        'source_processing': 'Existing dem_base.py input cache and terrain.load lake mask; no new source download.',
        'crs': 'EPSG:26918',
        'grid': {'e0': E0, 'n0': N0, 'cell_m': CELL, 'shape': list(elevation.shape),
                 'coordinates': 'easting=e0+column*cell; northing=n0-row*cell; same convention as terrain.py'},
        'method': 'Seeded k-means++ initialization, k-means, eight classes, 60,000 land-only samples, 30 iterations',
        'seed': 3,
        'feature_names': ['standardized elevation', 'clipped slope', 'clipped signed curvature', 'eastward slope direction', 'northward slope direction'],
        'feature_weights': [1, 2.4, 1.6, .8, .8],
        'gaussian_sigma_m': {'elevation': 45, 'slope': 75, 'curvature': 180},
        'feature_scales': scales,
        'centers': centers.tolist(),
        'cleanup': {'window_cells': 5, 'window_m': 5 * CELL, 'method': 'unique neighborhood mode, excluding water; original center retained on ties', 'changed_land_cells': changed},
        'color': 'Shared class order by mean slope; higher rank is brighter purple. Rendering adds boundary emphasis and hillshade.',
        'classes': sorted(stats, key=lambda x: x['color_rank']),
        'limits': ['Exploratory terrain groups, not validated named landform classes.', 'Water labels and out-of-grid coordinates are 255; renderers must not extrapolate.', 'Model and colors are shared by both views; rendering resampling still differs by output resolution.'],
        'elapsed_seconds': round(time.perf_counter() - started, 3),
    }
    (output_dir / 'data-terrain.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps({'elapsed_seconds': metadata['elapsed_seconds'],
                      'land_cells': int(land.sum()), 'water_cells': int(water.sum()),
                      'changed_land_cells': changed, 'classes': metadata['classes']}, indent=2), flush=True)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    build(*sys.argv[1:])
