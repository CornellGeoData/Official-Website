"""Back-page map: public/art/terrain.webp -> assets/lake.jpg. Rerun if the page 5 text moves.

Also prints the path the CAYUGA LAKE label follows; paste it into packet.html if the crop changes.

The lake stays bright, the land goes to true black like the other pages, and the
contour lines fade around the text blocks listed in ZONES (page points, 612 by 792).
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).parent
ZONES = [(26, 128, 290, 226), (396, 128, 586, 214), (26, 410, 352, 592), (160, 640, 430, 742)]
LEFT, WIDTH, BOTTOM = 106, 1600, 3890  # crop in terrain pixels: just Cayuga, ending at Ithaca
BACKGROUND = (14, 20, 27)  # terrain.webp's land color
FADE_TOP, FADE_BOTTOM = 124, 232  # page points
LABEL_TOP, LABEL_BOTTOM, HALF_CAP = 244, 474, 5.3  # page points; HALF_CAP is half the label's cap height
DEEP_UNTIL, BRIGHT_FROM = 400, 620  # the water deepens to the north, so its white label reads

Image.MAX_IMAGE_PIXELS = None
out_w = 2400
out_h = round(out_w * 792 / 612)
scale = out_w / 612
height = round(WIDTH * 792 / 612)
art = Image.open(HERE / '../../public/art/terrain.webp').convert('RGB')
crop = art.crop((LEFT, BOTTOM - height, LEFT + WIDTH, BOTTOM)).resize((out_w, out_h), Image.LANCZOS)
pixels = np.clip(np.array(crop, float) - BACKGROUND, 0, 255)

water = np.clip((pixels[..., 2] - pixels[..., 0] - 35) / 25, 0, 1) * np.clip((pixels[..., 2] - 70) / 30, 0, 1)
fade = Image.new('L', (out_w, out_h), 255)
for zone in ZONES:
    ImageDraw.Draw(fade).rectangle([v * scale for v in zone], fill=30)
fade = np.array(fade.filter(ImageFilter.GaussianBlur(14 * scale)), float) / 255
rows = np.arange(out_h)[:, None] / scale
depth = np.clip((rows - DEEP_UNTIL) / (BRIGHT_FROM - DEEP_UNTIL), 0, 1)
depth = depth * depth * (3 - 2 * depth)
gain = water * (.8 + .42 * depth) + (1 - water) * 1.3 * fade
# The map rises out of black under the heading and email: 0 at FADE_TOP, full at FADE_BOTTOM.
ramp = np.clip((rows - FADE_TOP) / (FADE_BOTTOM - FADE_TOP), 0, 1)
gain = gain * ramp * ramp * (3 - 2 * ramp)
result = np.clip(pixels * gain[..., None], 0, 255).astype(np.uint8)
Image.fromarray(result).save(HERE / 'assets/lake.jpg', quality=88, subsampling=0)

# The label's path: the water's centerline, smoothed, then shifted so the capitals sit centered on it.
ys = np.arange(LABEL_TOP, LABEL_BOTTOM + 1, 4.0)
middles, widths = [], []
for y in ys:
    edges = np.flatnonzero(np.diff(np.r_[0, water[int(y * scale)] > .5, 0]))
    left, right = max(zip(edges[::2], edges[1::2]), key=lambda run: run[1] - run[0])
    middles.append((left + right) / 2 / scale)
    widths.append((right - left) / scale)
xs = np.polyval(np.polyfit(ys, middles, 5), ys)
slope = np.gradient(xs, ys)
length = np.hypot(1, slope)
path = ' '.join(f'{x - HALF_CAP / n:.1f},{y + HALF_CAP * d / n:.1f}' for x, y, d, n in zip(xs, ys, slope, length))
print('M' + path)
print(f'narrowest water along the label: {min(widths):.0f}pt, furthest the smoothed line strays from center: '
      f'{np.abs(xs - middles).max():.1f}pt', flush=True)
