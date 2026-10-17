"""Original 16x16 pixel-art textures for the "Blocks" map theme (no third-party art).

    python scripts/themes/generate-blocks.py

Writes assets/themes/blocks/<name>.png (+@2x, @3x, nearest-neighbor) for the app and the @3x copy
to public/themes/blocks/ for the web map.
"""
import os
import random
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'assets', 'themes', 'blocks')
WEB = os.path.join(ROOT, 'public', 'themes', 'blocks')


def noise(base, spread, seed, palette=None):
    rnd = random.Random(seed)
    im = Image.new('RGBA', (16, 16))
    for y in range(16):
        for x in range(16):
            if palette:
                c = rnd.choice(palette)
            else:
                d = rnd.randint(-spread, spread)
                c = tuple(max(0, min(255, v + d)) for v in base)
            im.putpixel((x, y), (*c, 255))
    return im


def grass():
    return noise(None, 0, 1, palette=[(88, 148, 56), (96, 160, 60), (78, 132, 48), (104, 168, 66), (88, 148, 56), (70, 122, 44)])


def concrete():
    return noise((30, 31, 36), 5, 2)


def metal():
    im = noise((200, 203, 208), 6, 3)
    edge, rivet, light = (150, 154, 160, 255), (120, 124, 130, 255), (226, 228, 232, 255)
    for i in range(16):
        im.putpixel((i, 0), light)
        im.putpixel((0, i), light)
        im.putpixel((i, 15), edge)
        im.putpixel((15, i), edge)
    for x, y in ((3, 3), (12, 3), (3, 12), (12, 12)):
        im.putpixel((x, y), rivet)
    return im


def water():
    im = noise(None, 0, 4, palette=[(46, 88, 196), (52, 96, 206), (42, 80, 184), (48, 92, 200)])
    for x, y in ((2, 4), (3, 4), (4, 4), (10, 9), (11, 9), (12, 9), (6, 13), (7, 13)):
        im.putpixel((x, y), (92, 140, 230, 255))
    return im


def sand():
    return noise(None, 0, 5, palette=[(219, 207, 160), (226, 214, 168), (210, 198, 150), (232, 222, 178)])


def dirt():
    return noise(None, 0, 6, palette=[(134, 96, 67), (121, 85, 58), (148, 108, 76), (110, 78, 54)])


def sheep():
    """A side-on pixel sheep (16x16), original art."""
    W, F, L, E, P = (240, 240, 236, 255), (200, 200, 196, 255), (70, 70, 72, 255), (20, 20, 22, 255), (230, 170, 170, 255)
    rows = [
        '................',
        '................',
        '....WWWWWWWW....',
        '...WWWWWWWWWWFF.',
        '..WWWWWWWWWWFFFF',
        '..WWWWWWWWWWFEFF',
        '..WWWWWWWWWWFFFP',
        '..WWWWWWWWWWFFF.',
        '..WWWWWWWWWWW...',
        '...WWWWWWWWWW...',
        '...LL.LL.LL.LL..',
        '...LL.LL.LL.LL..',
        '...LL.LL.LL.LL..',
        '................',
        '................',
        '................',
    ]
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    colors = {'W': W, 'F': F, 'L': L, 'E': E, 'P': P}
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in colors:
                im.putpixel((x, y), colors[ch])
    return im


def save(name, im, base=32):
    for scale, suffix in ((1, ''), (2, '@2x'), (3, '@3x')):
        size = base * scale
        im.resize((size, size), Image.NEAREST).save(os.path.join(OUT, f'{name}{suffix}.png'), optimize=True)
    im.resize((base * 3, base * 3), Image.NEAREST).save(os.path.join(WEB, f'{name}.png'), optimize=True)


os.makedirs(OUT, exist_ok=True)
os.makedirs(WEB, exist_ok=True)
for name, fn in (('grass', grass), ('concrete', concrete), ('metal', metal), ('water', water), ('sand', sand), ('dirt', dirt)):
    save(name, fn())
save('sheep', sheep(), base=48)
print('blocks theme textures written')
