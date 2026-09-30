"""Make the home-screen icons: a zine cut-out "OC" on yellow (same look as the Range Runner icon)."""
import io, os
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
f = TTFont(os.path.join(HERE, "fonts/dela-gothic-one-400.woff2")); f.flavor = None
buf = io.BytesIO(); f.save(buf); ttf = buf.getvalue()
def icon(size, pad=0.0):
    S = 1024; im = Image.new("RGB", (S, S), "#FFCC00")
    inner = int(S * (1 - pad)); font = ImageFont.truetype(io.BytesIO(ttf), int(inner * 0.44))
    blk = Image.new("RGBA", (S, S), (0, 0, 0, 0)); bd = ImageDraw.Draw(blk)
    w, h = int(inner * 0.8), int(inner * 0.56); x0, y0 = (S - w) // 2, (S - h) // 2
    bd.rectangle([x0, y0, x0 + w, y0 + h], fill="#161616")
    tb = bd.textbbox((0, 0), "OC", font=font); tx = (S - (tb[2] - tb[0])) // 2 - tb[0]; ty = (S - (tb[3] - tb[1])) // 2 - tb[1]
    off = int(inner * 0.03)
    bd.text((tx + off, ty + off), "OC", font=font, fill="#FF3D8B"); bd.text((tx, ty), "OC", font=font, fill="#FBFBF8")
    blk = blk.rotate(-3, resample=Image.BICUBIC); im.paste(blk, (0, 0), blk)
    return im.resize((size, size), Image.LANCZOS)
os.makedirs(os.path.join(HERE, "icons"), exist_ok=True)
for name, sz, pad in [("apple-touch-icon.png", 180, 0), ("icon-192.png", 192, 0), ("icon-512.png", 512, 0), ("icon-maskable-512.png", 512, .2), ("favicon-32.png", 32, 0)]:
    icon(sz, pad).save(os.path.join(HERE, "icons", name))
print("icons done")
