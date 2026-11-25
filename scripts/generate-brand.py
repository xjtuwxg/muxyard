"""Generate brand variants from one pane mark and outlined Inter lettering.

Developer prerequisite: pip install fonttools brotli
The website font and OFL license are checked in; no network is used here.
"""
from pathlib import Path
from xml.etree import ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "assets/brand"
source = (BRAND / "mark.svg").read_text()
geometry = source[source.index("  <g"):source.rindex("</svg>")].strip()
font = instantiateVariableFont(TTFont(ROOT / "website/fonts/InterVariable.woff2"), {"wght": 650, "opsz": 32})
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
scale = 64 / font["head"].unitsPerEm
paths = []
x = 99
for char in "muxyard.":
    glyph = glyphs[cmap[ord(char)]]
    pen = SVGPathPen(glyphs)
    glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, x, 74)))
    fill = 'var(--brand-color,#245bd7)' if char == "." else "currentColor"
    paths.append(f'<path fill="{fill}" d="{pen.getCommands()}"/>')
    x += glyph.width * scale - 2.2
width = round(x + 3)
for suffix, text, accent in [("", "#17263d", "#245bd7"), ("-dark", "#edf2fc", "#86afff")]:
    mark = geometry.replace('fill="currentColor"', f'fill="var(--brand-color,{accent})"')
    outlined = "\n  ".join(paths).replace("#245bd7", accent)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 96" width="{width}" height="96" style="color:var(--wordmark-color,{text})">
  <g transform="translate(0 8) scale(1.4)">{mark}</g>
  {outlined}
</svg>
'''
    (BRAND / f"wordmark{suffix}.svg").write_text(svg)
(BRAND / "mark-white.svg").write_text(source.replace("var(--brand-color,#245bd7)", "#ffffff"))
icon = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4f7ff"/><stop offset="1" stop-color="#e7eeff"/></linearGradient></defs>
  <rect x="64" y="64" width="896" height="896" rx="204" fill="url(#tile)"/>
  <rect x="65" y="65" width="894" height="894" rx="203" fill="none" stroke="#cfdbf4" stroke-width="2"/>
  <g transform="translate(198 198) scale(11.2)" color="#245bd7">{geometry}</g>
</svg>
'''
(ROOT / "assets/icon.svg").write_text(icon)
print("Generated outlined wordmarks, white mark, and app icon from assets/brand/mark.svg.")
