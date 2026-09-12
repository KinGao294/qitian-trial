#!/usr/bin/env python3
"""Assemble captured animation frames into labelled contact sheets and slow-motion clips.

`strip.mjs` freezes the simulation at exact phases and screenshots each stop, so the frames are a
real playback rather than lucky stills. Once the camera has converged its look point is the
warrior's chest, which puts him at the centre of every frame — hence the fixed centre crop.
"""
import glob
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

# WenQuanYi covers the Chinese move names; DejaVu does not.
SANS = '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc'


def font(size):
    try:
        return ImageFont.truetype(SANS, size)
    except OSError:
        return ImageFont.load_default()


def frames(src, label):
    return [Image.open(f) for f in sorted(glob.glob(f'{src}/{label}_*.png'))]


def crop(im, box=None, size=None):
    if box:
        im = im.crop(box)
    elif size:
        w, h = im.size
        im = im.crop((w // 2 - size // 2, h // 2 - size // 2, w // 2 + size // 2, h // 2 + size // 2))
    return im


def sheet(ims, cols, captions, title, path, scale=1.0):
    """Grid of frames, each captioned with the beat it belongs to."""
    w, h = ims[0].size
    tw, th = int(w * scale), int(h * scale)
    pad, bar, head = 4, 26, 40
    rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGB', (cols * (tw + pad) + pad, head + rows * (th + bar + pad) + pad), '#14171a')
    d = ImageDraw.Draw(out)
    d.text((pad + 4, 10), title, font=font(20), fill='#e8dcc0')
    for i, im in enumerate(ims):
        x = pad + (i % cols) * (tw + pad)
        y = head + (i // cols) * (th + bar + pad)
        out.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
        cap = captions[i] if i < len(captions) else ''
        d.text((x + 4, y + th + 5), cap, font=font(14), fill='#b9c0a8')
    out.save(path)
    print('wrote', path, out.size)


def clip(ims, path, fps=6, loops=3, scale=1.0):
    """Slow-motion loop of the same frames, for the beats a still cannot show."""
    tmp = '/tmp/_clip'
    os.makedirs(tmp, exist_ok=True)
    for f in glob.glob(f'{tmp}/*.png'):
        os.remove(f)
    w, h = ims[0].size
    tw, th = int(w * scale) // 2 * 2, int(h * scale) // 2 * 2
    for i, im in enumerate(ims * loops):
        im.resize((tw, th), Image.LANCZOS).save(f'{tmp}/f{i:03d}.png')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(fps), '-i', f'{tmp}/f%03d.png',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', path], check=True)
    print('wrote', path)


def stills(paths, captions, title, path, cols, box=None, scale=1.0):
    ims = [crop(Image.open(p), box=box) for p in paths]
    sheet(ims, cols, captions, title, path, scale=scale)


SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/strips'
DST = sys.argv[2] if len(sys.argv) > 2 else '/tmp/artifacts'
os.makedirs(DST, exist_ok=True)

# 横扫破风, 0.48s in 12 stops of 3 sim frames — 3 frames is 0.05s, so the beats land on their stops.
sw = [crop(im, size=300) for im in frames(SRC, 'sweep')]
if sw:
    caps = ['① 起势 · 无拖影', '② 蓄力 · 手向后', '③ 蓄力 · 定格前', '④ 打击 · 拖影出现',
            '⑤ 挥过', '⑥ 挥过', '⑦ 挥过', '⑧ 跟随',
            '⑨ 吸收', '⑩ 收招', '⑪ 收招', '⑫ 回守']
    sheet(sw, 4, caps, '横扫破风 · 0.48s，每格间隔 0.05s。前三格没有任何拖影：蓄力时手向后收、脚下扬尘',
          f'{DST}/player_sweep_beats.png', scale=1.0)
    clip(sw, f'{DST}/player_sweep_slowmo.mp4', fps=6, loops=3, scale=1.4)

# 定海神针, 0.95s in 13 stops of 5 frames. Cropped left of the gateway post the warrior backed into.
ul = [crop(im, box=(0, 40, 600, 560)) for im in frames(SRC, 'ult')]
if ul:
    caps = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬']
    sheet(ul, 5, caps, '定海神针 · 0.95s，每格间隔 0.083s：聚气（余烬向内收）→ 一整圈发力 → 头顶定格 → 下压落地',
          f'{DST}/ultimate_beats.png', scale=0.62)
    clip(ul, f'{DST}/ultimate_slowmo.mp4', fps=6, loops=3, scale=1.0)

# 巨掌砸地, from the top of the wind-up through the crater.
sl = [crop(im, box=(30, 0, 730, 520)) for im in frames(SRC, 'slam')]
if sl:
    caps = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫']
    sheet(sl, 4, caps, '巨掌砸地 · 每格间隔 0.083s：抬身到顶 → 定格（读圈）→ 落点扬尘 → 三次加速下落 → 落地。此处只看身体节奏，预警窗口时机归 #23',
          f'{DST}/boss_slam_beats.png', scale=0.72)
    clip(sl, f'{DST}/boss_slam_slowmo.mp4', fps=5, loops=3, scale=1.0)

# The boss tells that live in one frame rather than in a sequence.
SHOTS = os.environ.get('SHOTS', SRC)
tells = [f'{SHOTS}/tell_fire_inhale.png', f'{SHOTS}/tell_fire_eruption.png',
         f'{SHOTS}/tell_swipe_coil.png', f'{SHOTS}/tell_slam_top.png']
if all(os.path.exists(p) for p in tells):
    stills(tells,
           ['熔岩吐息 · 吸气：空气环向口部收缩', '熔岩吐息 · 喷发：口部压力环 + 头部后坐',
            '巨爪横扫 · 反向拧转起手', '巨掌砸地 · 顶点定格，内圈将合'],
           'Boss 起手可读性：吐息吸气 / 吐息喷发 / 横扫拧转 / 砸地顶点定格',
           f'{DST}/boss_tells.png', cols=2, box=(0, 40, 900, 620), scale=0.55)
