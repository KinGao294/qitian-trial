"""Offline check of a Tripo GLB bind pose: bone tree, joint world positions, skinned bbox.

Replicates three.js skinning (worldPos = meshMatrixWorld * boneMatrixWorld * inverseBind * v)
so stance regressions can be caught without a browser.

Usage: python3 tools/inspect-skin.py public/models/player.glb
"""
import json
import struct
import sys

import numpy as np

COMPONENT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16,
             5125: np.uint32, 5126: np.float32}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load_glb(path):
    with open(path, 'rb') as f:
        magic, ver, total = struct.unpack('<III', f.read(12))
        assert magic == 0x46546C67, 'not a glb'
        gltf, bin_chunk = None, None
        while f.tell() < total:
            clen, ctype = struct.unpack('<II', f.read(8))
            data = f.read(clen)
            if ctype == 0x4E4F534A:
                gltf = json.loads(data)
            elif ctype == 0x004E4942:
                bin_chunk = data
    return gltf, bin_chunk


def accessor(gltf, blob, idx):
    acc = gltf['accessors'][idx]
    view = gltf['bufferViews'][acc['bufferView']]
    dtype = COMPONENT[acc['componentType']]
    n = NCOMP[acc['type']]
    offset = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = view.get('byteStride') or np.dtype(dtype).itemsize * n
    count = acc['count']
    raw = np.frombuffer(blob, dtype=np.uint8, count=stride * count, offset=offset)
    out = np.zeros((count, n), dtype=dtype)
    item = np.dtype(dtype).itemsize * n
    rows = raw.reshape(count, stride)[:, :item]
    out = rows.copy().view(dtype).reshape(count, n)
    return out


def trs(node):
    m = np.eye(4)
    if 'matrix' in node:
        return np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    r = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])
    s = np.array(node.get('scale', [1, 1, 1]), dtype=np.float64)
    m[:3, :3] = r * s
    m[:3, 3] = node.get('translation', [0, 0, 0])
    return m


def main(path):
    gltf, blob = load_glb(path)
    nodes = gltf['nodes']
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children') or []:
            parent[c] = i

    world = {}

    def wm(i):
        if i not in world:
            local = trs(nodes[i])
            p = parent.get(i)
            world[i] = local if p is None else wm(p) @ local
        return world[i]

    print('== bone tree (bind pose, glTF scene space) ==')
    for i, n in enumerate(nodes):
        if 'mesh' in n:
            continue
        w = wm(i)
        print(f'  {i:3d} {n.get("name"):34s} parent={str(parent.get(i)):4s} '
              f'world=({w[0, 3]:+.4f}, {w[1, 3]:+.4f}, {w[2, 3]:+.4f})')

    if not gltf.get('skins'):
        print('\nno skins: static mesh, nothing to check')
        return

    skin = gltf['skins'][0]
    joints = skin['joints']
    ibm = accessor(gltf, blob, skin['inverseBindMatrices']).astype(np.float64)
    ibm = ibm.reshape(-1, 4, 4).transpose(0, 2, 1)

    mesh_node = next(i for i, n in enumerate(nodes) if 'mesh' in n)
    mesh_world = wm(mesh_node)
    print(f'\nmesh node "{nodes[mesh_node]["name"]}" world translation = '
          f'{np.round(mesh_world[:3, 3], 4).tolist()}')

    prim = gltf['meshes'][nodes[mesh_node]['mesh']]['primitives'][0]
    pos = accessor(gltf, blob, prim['attributes']['POSITION']).astype(np.float64)
    ji = accessor(gltf, blob, prim['attributes']['JOINTS_0']).astype(np.int32)
    jw = accessor(gltf, blob, prim['attributes']['WEIGHTS_0']).astype(np.float64)
    print(f'rest POSITION bbox min={np.round(pos.min(0), 4).tolist()} '
          f'max={np.round(pos.max(0), 4).tolist()}')

    joint_mat = np.stack([wm(joints[k]) @ ibm[k] for k in range(len(joints))])
    dev = np.abs(joint_mat - np.eye(4)).max()
    print(f'max |boneWorld*inverseBind - I| over joints = {dev:.5f}')

    homo = np.concatenate([pos, np.ones((len(pos), 1))], axis=1)
    skinned = np.zeros_like(homo)
    for k in range(jw.shape[1]):
        mats = joint_mat[ji[:, k]]
        skinned += jw[:, k, None] * np.einsum('nij,nj->ni', mats, homo)
    print(f'skinned (bindMatrix=I) bbox min={np.round(skinned[:, :3].min(0), 4).tolist()} '
          f'max={np.round(skinned[:, :3].max(0), 4).tolist()}')
    moved = skinned @ mesh_world.T
    print(f'+ mesh node matrixWorld     bbox min={np.round(moved[:, :3].min(0), 4).tolist()} '
          f'max={np.round(moved[:, :3].max(0), 4).tolist()}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'public/models/player.glb')
