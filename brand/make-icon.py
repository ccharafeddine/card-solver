"""Draws the Card Solver mark (brand/icon.svg, brand/icon-maskable.svg, public/icon.svg). Run: python3 brand/make-icon.py"""

SPADE = "M 0 -34 C 10 -18 34 -8 34 10 C 34 24 20 30 8 22 C 9 30 12 36 18 40 L -18 40 C -12 36 -9 30 -8 22 C -20 30 -34 24 -34 10 C -34 -8 -10 -18 0 -34 Z"
HEART = "M 0 34 C -12 22 -34 8 -34 -10 C -34 -26 -12 -32 0 -16 C 12 -32 34 -26 34 -10 C 34 8 12 22 0 34 Z"

def card(cx, cy, angle, suit, colour, letter, fill="#f6f2e9"):
    w, h = 170, 238
    return f'''<g transform="translate({cx} {cy}) rotate({angle})">
  <rect x="{-w/2+4}" y="{-h/2+8}" width="{w}" height="{h}" rx="18" fill="#000" opacity=".35"/>
  <rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="18" fill="{fill}"/>
  <rect x="{-w/2}" y="{h/2-12}" width="{w}" height="12" rx="6" fill="#000" opacity=".06"/>
  <text x="{-w/2+16}" y="{-h/2+44}" font-family="Georgia, serif" font-weight="700" font-size="42" fill="{colour}">{letter}</text>
  <path d="{suit}" transform="translate(6 18) scale(1.45)" fill="{colour}"/>
</g>'''

def svg(maskable=False):
    rx = 0 if maskable else 112
    scale = ' transform="translate(256 256) scale(0.8) translate(-256 -256)"' if maskable else ''
    edge = '' if maskable else '<rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="4"/>\n'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<!-- Card Solver mark: an ace of spades and a heart fanned on a felt-dark tile, a chip lit in amber, and the suite's solve arrow. Original artwork. -->
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e2924"/><stop offset="1" stop-color="#15130f"/></linearGradient>
  <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c25f12"/><stop offset="1" stop-color="#f2a04a"/></linearGradient>
  <linearGradient id="lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2a04a"/><stop offset="1" stop-color="#c25f12"/></linearGradient>
  <radialGradient id="glow" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="#f2a04a" stop-opacity=".22"/><stop offset="1" stop-color="#f2a04a" stop-opacity="0"/></radialGradient>
</defs>
<rect width="512" height="512" rx="{rx}" fill="url(#bg)"/>
{edge}<rect width="512" height="512" rx="{rx}" fill="url(#glow)"/>
<g{scale}>
{card(200, 210, -12, HEART, "#c3122f", "K")}
{card(300, 206, 10, SPADE, "#2a2520", "A")}
<circle cx="378" cy="318" r="44" fill="url(#lit)"/>
<circle cx="378" cy="318" r="30" fill="none" stroke="#fff" stroke-width="7" stroke-dasharray="11 8" opacity=".85"/>
<path d="M 96 372 A 190 190 0 0 0 418 362" fill="none" stroke="url(#acc)" stroke-width="22" stroke-linecap="round"/>
<path d="M 446 334 L 426 396 L 382 350 Z" fill="#f2a04a" stroke="#f2a04a" stroke-width="8" stroke-linejoin="round"/>
</g>
</svg>
'''

for path, m in [('brand/icon.svg', False), ('brand/icon-maskable.svg', True), ('public/icon.svg', False)]:
    open(path, 'w').write(svg(m))
