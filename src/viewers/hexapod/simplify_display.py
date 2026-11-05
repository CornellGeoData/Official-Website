"""Generate phone display meshes; never modifies the canonical robot assets.

Run with Python, numpy and Open3D installed: python3 src/viewers/hexapod/simplify_display.py
"""
import hashlib
import json
import pathlib
import struct
import xml.etree.ElementTree as ET
from collections import Counter

import numpy as np
import open3d as o3d


def main():
    root = pathlib.Path(__file__).resolve().parents[3] / 'public' / 'hexapod'
    source = root / 'model'
    active = json.loads((source / 'active_model.json').read_text())
    urdf = source / active['urdf']['path'].removeprefix('robot/')
    assert hashlib.sha256(urdf.read_bytes()).hexdigest() == active['urdf']['sha256']
    uses = Counter(mesh.attrib['filename'] for mesh in ET.parse(urdf).findall('.//visual/geometry/mesh'))
    output = root / 'display' / active['id']
    (output / 'meshes').mkdir(parents=True, exist_ok=True)
    files = {}
    for name, instances in uses.items():
        original = urdf.parent / name
        mesh = o3d.io.read_triangle_mesh(str(original))
        mesh.remove_duplicated_vertices()
        mesh.remove_degenerate_triangles()
        count = len(mesh.triangles)
        target = min(count, max(120, min(4000, round(count * 0.08))))
        light = mesh.simplify_quadric_decimation(target)
        light.remove_degenerate_triangles()
        light.remove_duplicated_triangles()
        light.remove_unreferenced_vertices()
        light.compute_triangle_normals()
        vertices = np.asarray(light.vertices)
        assert len(light.triangles) > 0 and np.isfinite(vertices).all(), name
        # Reject a damaged silhouette rather than shipping a missing/thin part.
        span = np.maximum(mesh.get_max_bound() - mesh.get_min_bound(), 1e-6)
        drift = np.maximum(np.abs(light.get_min_bound() - mesh.get_min_bound()), np.abs(light.get_max_bound() - mesh.get_max_bound()))
        if np.any(drift > span * 0.025):
            light = mesh
            light.compute_triangle_normals()
        destination = output / 'meshes' / original.name
        assert o3d.io.write_triangle_mesh(str(destination), light, write_ascii=False)
        data = destination.read_bytes()
        triangles = struct.unpack('<I', data[80:84])[0]
        assert len(data) == 84 + triangles * 50
        files[original.name] = {
            'source_sha256': hashlib.sha256(original.read_bytes()).hexdigest(),
            'source_bytes': original.stat().st_size,
            'bytes': len(data),
            'source_triangles': count,
            'triangles': triangles,
            'instances': instances,
        }
    totals = {
        'source_bytes': sum(item['source_bytes'] for item in files.values()),
        'bytes': sum(item['bytes'] for item in files.values()),
        'source_triangle_instances': sum(item['source_triangles'] * item['instances'] for item in files.values()),
        'triangle_instances': sum(item['triangles'] * item['instances'] for item in files.values()),
    }
    manifest = {'model': active['id'], 'urdf_sha256': active['urdf']['sha256'], 'totals': totals, 'files': files}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(totals, indent=2), flush=True)


if __name__ == '__main__':
    main()
