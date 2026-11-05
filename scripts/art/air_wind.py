"""Draw the cached HRRR-driven mass solution in either shared lake frame."""
from pathlib import Path
import numpy as np
from scipy import ndimage as ndi
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, Normalize
from matplotlib import patheffects


def render(background, width, height, meters_per_pixel, ae, an, cx, cy, destination):
    with np.load(Path(__file__).parent / 'data/air-wind.npz') as field:
        u, v = field['u'], field['v']
        cell, left, bottom = float(field['cell']), float(field['xll']), float(field['yll'])
    assert u.shape == v.shape and np.isfinite(u).all() and np.isfinite(v).all()
    assert np.isclose(ae * ae + an * an, 1)
    x = np.linspace(0, width, round(width * meters_per_pixel / cell) + 1)
    y = np.linspace(0, height, round(height * meters_per_pixel / cell) + 1)
    dx, dy = np.meshgrid((x - width / 2) * meters_per_pixel,
                         (y - height / 2) * meters_per_pixel)
    east, north = cx + dx * ae + dy * an, cy + dx * an - dy * ae
    rc = [(bottom + u.shape[0] * cell - north) / cell - .5,
          (east - left) / cell - .5]
    # The unused mobile square corners lie outside the simulation; never invent edge winds.
    eastward = ndi.map_coordinates(u, rc, order=1, mode='constant', cval=np.nan)
    northward = ndi.map_coordinates(v, rc, order=1, mode='constant', cval=np.nan)
    vx = eastward * ae + northward * an
    vy = eastward * an - northward * ae
    speed = np.hypot(eastward, northward)
    visible = dx * dx + dy * dy <= (width * meters_per_pixel / 2) ** 2 if width == height else np.ones(dx.shape, bool)
    assert np.isfinite(speed[visible]).all(), 'Wind must cover the entire visible lake frame'
    assert np.allclose(np.hypot(vx[visible], vy[visible]), speed[visible], atol=1e-5)

    ow, oh = background.size
    fig = plt.figure(figsize=(ow / 100, oh / 100), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(background, extent=[0, width, height, 0], origin='upper')
    colors = LinearSegmentedColormap.from_list('air', ['#6b95bd', '#b3d7f1', '#ecf8ff', '#ffffff'])
    flow = ax.streamplot(x, y, np.ma.masked_invalid(vx), np.ma.masked_invalid(vy),
                         color=np.ma.masked_invalid(speed), cmap=colors, norm=Normalize(0, 10),
                         density=(1.6, 1.0) if width != height else (1.3, 1.3),
                         linewidth=1.2 + .12 * np.clip(speed, 0, 10), arrowsize=1.3, minlength=.1, maxlength=4)
    flow.lines.set_path_effects([patheffects.Stroke(linewidth=3.2, foreground='#08131d', alpha=.9),
                                 patheffects.Normal()])
    ax.set_xlim(0, width)
    ax.set_ylim(height, 0)
    ax.set_aspect('equal')
    ax.axis('off')
    fig.savefig(destination, dpi=100)
    plt.close(fig)
