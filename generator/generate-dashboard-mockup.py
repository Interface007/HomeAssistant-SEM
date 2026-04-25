#!/usr/bin/env python3
"""
Generate a B/W SVG mockup of the display-livingroom-01.yaml e-paper dashboard.
Pixel-accurate to the Waveshare 7.50inv2alt (800x480).
Run: python generate-dashboard-mockup.py > dashboard-mockup.svg
"""

import math, sys, os
import io

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "dashboard-mockup.svg")

W, H = 800, 480
margin = 14
gutter = 10

# ── primitive helpers ──────────────────────────────────────────────────────────

def R(x, y, w, h, fill="none", stroke="black", sw=1.5, rx=0):
    r = f' rx="{rx}"' if rx else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{r}/>'

def L(x1, y1, x2, y2, stroke="black", sw=1):
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{sw}"/>'

def T(x, y, msg, size=12, anchor="start", weight="bold", italic=False):
    style = f'font-style="italic"' if italic else ""
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="black" {style}>{msg}</text>'

def G(*children, transform=""):
    t = f' transform="{transform}"' if transform else ""
    return f'<g{t}>' + "".join(c for c in children if c) + "</g>"

# ── weather icons ──────────────────────────────────────────────────────────────

def sun_icon(cx, cy, r, rays=8, stroke_w=2):
    parts = [f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*0.45:.1f}" fill="none" stroke="black" stroke-width="{stroke_w}"/>']
    for i in range(rays):
        a = math.radians(i * 360 / rays)
        x1 = cx + math.cos(a) * r * 0.58; y1 = cy + math.sin(a) * r * 0.58
        x2 = cx + math.cos(a) * r * 0.9;  y2 = cy + math.sin(a) * r * 0.9
        parts.append(L(x1, y1, x2, y2, sw=stroke_w))
    return "".join(parts)

def cloud_shape(cx, cy, r, fill="none", sw=1.5):
    # three overlapping arcs approximating a cloud
    return (
        f'<ellipse cx="{cx:.1f}" cy="{cy+r*0.15:.1f}" rx="{r*0.75:.1f}" ry="{r*0.42:.1f}" fill="{fill}" stroke="black" stroke-width="{sw}"/>'
        f'<circle cx="{cx-r*0.32:.1f}" cy="{cy:.1f}" r="{r*0.32:.1f}" fill="{fill}" stroke="black" stroke-width="{sw}"/>'
        f'<circle cx="{cx+r*0.28:.1f}" cy="{cy-r*0.1:.1f}" r="{r*0.38:.1f}" fill="{fill}" stroke="black" stroke-width="{sw}"/>'
    )

def partly_cloudy(cx, cy, r):
    # small sun top-right, cloud bottom-left with white mask
    sx, sy, sr = cx + r*0.22, cy - r*0.22, r*0.42
    parts = [sun_icon(sx, sy, sr, rays=6, stroke_w=1.5)]
    # white mask behind cloud
    parts.append(f'<rect x="{cx-r*0.9:.1f}" y="{cy-r*0.2:.1f}" width="{r*1.8:.1f}" height="{r:.1f}" fill="white" stroke="none"/>')
    parts.append(cloud_shape(cx - r*0.1, cy + r*0.1, r*0.6, fill="white", sw=1.5))
    return "".join(parts)

def rain_icon(cx, cy, r):
    parts = [cloud_shape(cx, cy - r*0.2, r*0.7, fill="white", sw=1.5)]
    for i in range(3):
        dx = (i - 1) * r * 0.28
        parts.append(L(cx+dx, cy+r*0.35, cx+dx-r*0.12, cy+r*0.7, sw=1.5))
    return "".join(parts)

def snow_icon(cx, cy, r):
    parts = [cloud_shape(cx, cy - r*0.2, r*0.7, fill="white", sw=1.5)]
    for i in range(3):
        dx = (i - 1) * r * 0.28
        parts.append(f'<text x="{cx+dx:.1f}" y="{cy+r*0.7:.1f}" font-size="{r*0.6:.0f}" text-anchor="middle" fill="black">*</text>')
    return "".join(parts)

def weather_icon(state, cx, cy, r):
    if state in ("sunny", "clear-night"):            return sun_icon(cx, cy, r)
    if state in ("cloudy",):                         return cloud_shape(cx, cy, r, fill="white")
    if state in ("partly-cloudy", "partlycloudy",
                 "night-partly-cloudy"):             return partly_cloudy(cx, cy, r)
    if state in ("rainy", "pouring",
                 "lightning-rainy"):                 return rain_icon(cx, cy, r)
    if state in ("snowy", "snowy-heavy",
                 "snowy-rainy"):                     return snow_icon(cx, cy, r)
    return cloud_shape(cx, cy, r, fill="white")   # fallback

# ── domain icons ──────────────────────────────────────────────────────────────

def thermometer_svg(cx, cy, h):
    rT, rB = h*0.09, h*0.18
    tube_top = cy - h*0.38
    tube_bot = cy + h*0.05
    fill_h   = (tube_bot - tube_top) * 0.55
    return (
        f'<rect x="{cx-rT:.1f}" y="{tube_top:.1f}" width="{rT*2:.1f}" height="{tube_bot-tube_top:.1f}" rx="{rT:.1f}" fill="none" stroke="black" stroke-width="1.5"/>'
        f'<rect x="{cx-rT*0.7:.1f}" y="{tube_bot-fill_h:.1f}" width="{rT*1.4:.1f}" height="{fill_h:.1f}" fill="black"/>'
        f'<circle cx="{cx:.1f}" cy="{tube_bot+rB*0.65:.1f}" r="{rB:.1f}" fill="black"/>'
    )

def humidity_drop(cx, cy, h):
    r = h * 0.4
    return f'<path d="M{cx:.1f},{cy-r*1.1:.1f} C{cx+r*0.85:.1f},{cy-r*0.3:.1f} {cx+r:.1f},{cy+r*0.35:.1f} {cx:.1f},{cy+r:.1f} C{cx-r:.1f},{cy+r*0.35:.1f} {cx-r*0.85:.1f},{cy-r*0.3:.1f} {cx:.1f},{cy-r*1.1:.1f}Z" fill="none" stroke="black" stroke-width="1.5"/>'

def wind_lines(cx, cy, w):
    return (
        f'<path d="M{cx-w*0.45:.1f},{cy-4:.1f} Q{cx:.1f},{cy-10:.1f} {cx+w*0.4:.1f},{cy-4:.1f}" fill="none" stroke="black" stroke-width="2"/>'
        f'<path d="M{cx-w*0.45:.1f},{cy+4:.1f} Q{cx:.1f},{cy-2:.1f} {cx+w*0.35:.1f},{cy+4:.1f}" fill="none" stroke="black" stroke-width="2"/>'
    )

def sun_arrow(cx, cy, size, direction_up=True):
    """sunrise / sunset icon: small sun + directional arrow"""
    dy = -1 if direction_up else 1
    return (
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{size*0.35:.1f}" fill="none" stroke="black" stroke-width="1.5"/>'
        f'<line x1="{cx-size*0.5:.1f}" y1="{cy+size*0.55:.1f}" x2="{cx+size*0.5:.1f}" y2="{cy+size*0.55:.1f}" stroke="black" stroke-width="1"/>'
        f'<line x1="{cx:.1f}" y1="{cy+size*0.45:.1f}" x2="{cx:.1f}" y2="{cy+size*0.45+dy*size*0.5:.1f}" stroke="black" stroke-width="1.5"/>'
        f'<polygon points="{cx:.1f},{cy+size*0.45+dy*size*0.7:.1f} {cx-4:.1f},{cy+size*0.45+dy*size*0.45:.1f} {cx+4:.1f},{cy+size*0.45+dy*size*0.45:.1f}" fill="black"/>'
    )

def window_svg(cx, cy, size, is_open):
    s = f'<rect x="{cx-size*0.42:.1f}" y="{cy-size*0.48:.1f}" width="{size*0.84:.1f}" height="{size*0.96:.1f}" rx="2" fill="none" stroke="black" stroke-width="1.5"/>'
    if is_open:
        s += f'<line x1="{cx-size*0.42:.1f}" y1="{cy-size*0.48:.1f}" x2="{cx+size*0.1:.1f}" y2="{cy-size*0.48:.1f}" stroke="black" stroke-width="1.5"/>'
        s += f'<line x1="{cx-size*0.42:.1f}" y1="{cy-size*0.48:.1f}" x2="{cx:.1f}" y2="{cy:.1f}" stroke="black" stroke-width="1.5"/>'
    else:
        s += L(cx, cy-size*0.48, cx, cy+size*0.48, sw=1.2)
        s += L(cx-size*0.42, cy, cx+size*0.42, cy, sw=1.2)
    return s

def fan_svg(cx, cy, r):
    """ventilation / fan icon"""
    parts = [f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*0.18:.1f}" fill="black"/>']
    for i in range(4):
        a = math.radians(i * 90)
        ax = cx + math.cos(a) * r * 0.55; ay = cy + math.sin(a) * r * 0.55
        parts.append(
            f'<path d="M{cx:.1f},{cy:.1f} A{r*0.55:.1f},{r*0.55:.1f} 0 0,1 {ax:.1f},{ay:.1f} A{r*0.3:.1f},{r*0.3:.1f} 0 1,0 {cx:.1f},{cy:.1f}Z" fill="none" stroke="black" stroke-width="1.5"/>'
        )
    return "".join(parts)

def dryer_svg(cx, cy, r):
    return (
        f'<rect x="{cx-r:.1f}" y="{cy-r:.1f}" width="{r*2:.1f}" height="{r*2:.1f}" rx="3" fill="none" stroke="black" stroke-width="1.5"/>'
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*0.6:.1f}" fill="none" stroke="black" stroke-width="1.2"/>'
        f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r*0.2:.1f}" fill="black"/>'
    )

def aurora_svg(cx, cy, w, h):
    """simple aurora / northern-lights wave"""
    ys = [cy + math.sin(math.radians(i*20))*h*0.3 for i in range(19)]
    pts = " ".join(f"{cx-w*0.5+i*w/18:.1f},{y:.1f}" for i, y in enumerate(ys))
    return f'<polyline points="{pts}" fill="none" stroke="black" stroke-width="2" stroke-dasharray="4,3" opacity="0.7"/>'

def battery_svg(cx, cy, w, h, level=0.75, label=""):
    cap_h = h * 0.28
    fill_h = (h - 2) * max(0.05, level)
    s = (
        f'<rect x="{cx-w/2:.1f}" y="{cy-h/2:.1f}" width="{w:.1f}" height="{h:.1f}" rx="1" fill="none" stroke="black" stroke-width="1"/>'
        f'<rect x="{cx-w*0.28:.1f}" y="{cy-h/2-cap_h:.1f}" width="{w*0.56:.1f}" height="{cap_h+1:.1f}" fill="black"/>'
        f'<rect x="{cx-w/2+1:.1f}" y="{cy+h/2-1-fill_h:.1f}" width="{w-2:.1f}" height="{fill_h:.1f}" fill="black"/>'
    )
    if label:
        s += T(cx, cy+h/2+10, label, 8, anchor="middle")
    return s

def wifi_svg(cx, cy, size):
    parts = [f'<circle cx="{cx:.1f}" cy="{cy+size*0.12:.1f}" r="{size*0.1:.1f}" fill="black"/>']
    for i, r in enumerate([0.35, 0.6, 0.85]):
        parts.append(
            f'<path d="M{cx-size*r*0.7:.1f},{cy:.1f} A{size*r:.1f},{size*r:.1f} 0 0,1 {cx+size*r*0.7:.1f},{cy:.1f}" fill="none" stroke="black" stroke-width="1.5"/>'
        )
    return "".join(parts)

def bar_chart_svg(x, y, w, h, values):
    if not values: return ""
    n = len(values); mx = max(values) or 1
    bw = max(1.5, (w - (n-1)*1) / n)
    parts = []
    for i, v in enumerate(values):
        bh = max(1.5, (v / mx) * h)
        bx = x + i * (bw + 1)
        parts.append(f'<rect x="{bx:.1f}" y="{y+h-bh:.1f}" width="{bw:.1f}" height="{bh:.1f}" fill="black"/>')
    return "".join(parts)

# ── layout constants ──────────────────────────────────────────────────────────

header_x = margin;  header_y = 12;  header_w = W - margin*2;  header_h = 140
header_divider_x = header_x + 500  # 514

card_y = 164; card_h = 118
card_w = (W - margin*2 - gutter*3) // 4  # 185
c1x = margin                              # 14
c2x = c1x + card_w + gutter              # 209
c3x = c2x + card_w + gutter              # 404
c4x = c3x + card_w + gutter              # 599

bottom_y = 302; bottom_h = 128
forecast_x = margin; forecast_w = 512
utility_x  = forecast_x + forecast_w + gutter  # 536
utility_w  = W - margin - utility_x            # 250

# ── sample data ───────────────────────────────────────────────────────────────

D = dict(
    condition     = "partly-cloudy",
    outside_temp  = "14.2",
    outside_hum   = "72",
    pressure      = "1013",
    wind          = "18",
    inside_temp   = "21.5",
    inside_hum    = "48",
    radiator      = "22.0",
    bath_temp     = "23.1",
    lea_temp      = "20.8",
    sunrise       = "06:18",
    sunset        = "20:35",
    hum_delta     = "+2.3",
    bath_window   = False,   # closed
    lea_window    = True,    # open
    dryer_state   = "Fertig",
    aurora        = False,   # quiet
    weekday       = "Samstag",
    date          = "26.04.25",
    time          = "09:42",
    ip            = "192.168.2.48",
    wifi_dbm      = -55,
    build         = "2025-04-25 08:30",
    forecast = [
        ("Mo", "cloudy",        "12", "5"),
        ("Di", "rainy",         "10", "4"),
        ("Mi", "sunny",         "15", "8"),
        ("Do", "sunny",         "17", "9"),
        ("Fr", "partly-cloudy", "14", "7"),
    ],
    water_hist = [12, 8, 15, 10, 7, 11, 9, 13, 6, 14, 8, 10, 11, 9, 7, 13, 10, 8, 12, 14, 6, 9, 11, 8],
    power_hist = [4,  6,  8,  5,  7,  9,  6,  8,  5,  7,  6,  8,  7,  5,  9,  8,  6,  7,  5,  8,  9,  6,  7,  8],
    bat_levels = [0.8, 0.6, 0.9, 0.4, 0.7, 0.85, 0.5],
    bat_labels = ["bf", "lf", "ks", "dp", "aq", "bo", "bu"],
)

# ── build SVG elements list ───────────────────────────────────────────────────

els = []

# white background
els.append(R(0, 0, W, H, fill="white", stroke="none"))

# ═══════════════ HEADER ══════════════════════════════════════════════════════

els.append(R(header_x, header_y, header_w, header_h))
els.append(L(header_divider_x, header_y+14, header_divider_x, header_y+header_h-14))

# "Wetter jetzt" label
els.append(T(header_x+22, header_y+26, "Wetter jetzt", 16))

# large weather icon (≈80px area) at (34, 117) baseline → centred ~(74, 65)
wic_cx = header_x + 20 + 44
wic_cy = header_y + 20 + 40
els.append(weather_icon(D["condition"], wic_cx, wic_cy, 40))

# outside temperature
els.append(T(header_x+122, header_y+96, D["outside_temp"], 56))
els.append(T(header_x+292, header_y+96, "°C", 20))

# condition label
condition_labels = {
    "clear-night": "Klare Nacht", "partly-cloudy": "Teilweise wolkig",
    "partlycloudy": "Teilweise wolkig", "sunny": "Sonnig",
    "rainy": "Regen", "pouring": "Starker Regen", "cloudy": "Wolkig",
    "fog": "Nebel", "windy": "Windig", "lightning": "Gewitter",
    "lightning-rainy": "Gewitterregen", "snowy": "Schnee",
}
cond_text = condition_labels.get(D["condition"], D["condition"].replace("-", " "))
els.append(T(header_x+22, header_y+132, cond_text, 16))

# middle column: humidity / pressure / wind  (x = header_x+310 = 324)
mid_ix = header_x + 310
mid_tx = header_x + 350
# humidity
els.append(humidity_drop(mid_ix+14, header_y+36-12, 24))
els.append(T(mid_tx, header_y+36, f'{D["outside_hum"]}%', 16))
# pressure
# pressure: up+down arrows as SVG
els.append(f'<text x="{mid_ix+2}" y="{header_y+72}" font-size="28" font-weight="bold" text-anchor="start" fill="black">&#x2195;</text>')
els.append(T(mid_tx, header_y+72, f'{D["pressure"]} hPa', 16))
# wind
els.append(wind_lines(mid_ix+14, header_y+108-10, 24))
els.append(T(mid_tx, header_y+108, f'{D["wind"]} km/h', 16))

# right column: weekday / date / time / sunrise / sunset / hum-delta  (x = 534)
rcp = header_divider_x + 20  # 534
els.append(T(rcp, header_y+42, D["weekday"], 34))
els.append(T(rcp, header_y+92, D["date"], 46))
els.append(T(rcp, header_y+130, D["time"], 18))

si_x = header_divider_x + 175  # 689
st_x = header_divider_x + 212  # 726
# sunrise
els.append(sun_arrow(si_x+14, header_y+20, 22, direction_up=True))
els.append(T(st_x, header_y+36, D["sunrise"], 16))
# sunset
els.append(sun_arrow(si_x+14, header_y+56, 22, direction_up=False))
els.append(T(st_x, header_y+72, D["sunset"], 16))
# humidity delta with vent icon
vent_up = D["hum_delta"].startswith("+")
els.append(f'<text x="{si_x}" y="{header_y+108}" font-size="26" font-weight="bold" text-anchor="start" fill="black">{"&#x2191;" if vent_up else "&#x2193;"}</text>')
els.append(T(st_x, header_y+108, f'{D["hum_delta"]} g/m³', 16))

# ═══════════════ ROOM CARDS ══════════════════════════════════════════════════

def card(x, y, w, h, title):
    return R(x, y, w, h) + T(x+14, y+22, title, 16)

# Card 1 – Wohnzimmer
els.append(card(c1x, card_y, card_w, card_h, "Wohnzimmer"))
els.append(thermometer_svg(c1x+14+12, card_y+52-14, 32))
els.append(T(c1x+54, card_y+52, f'{D["inside_temp"]} °C', 16))
els.append(humidity_drop(c1x+14+12, card_y+82-12, 24))
els.append(T(c1x+54, card_y+82, f'{D["inside_hum"]} %', 16))
# radiator
rx0 = c1x+14; ry0 = card_y+108-24
els.append(f'<rect x="{rx0}" y="{ry0}" width="26" height="18" rx="2" fill="none" stroke="black" stroke-width="1.5"/>')
for xi in range(4):
    els.append(L(rx0+4+xi*6, ry0+2, rx0+4+xi*6, ry0+16, sw=1))
els.append(T(c1x+54, card_y+108, f'Heizung {D["radiator"]} °C', 12))

# Card 2 – Bad
els.append(card(c2x, card_y, card_w, card_h, "Bad"))
# bathtub icon
btx, bty = c2x+14, card_y+20
els.append(
    f'<path d="M{btx},{bty+30} Q{btx+8},{bty+46} {btx+52},{bty+46} Q{btx+58},{bty+30} {btx+58},{bty+30} L{btx},{bty+30}Z" fill="none" stroke="black" stroke-width="1.5"/>'
    f'<rect x="{btx}" y="{bty+18}" width="7" height="16" rx="2" fill="none" stroke="black" stroke-width="1.5"/>'
    f'<line x1="{btx}" y1="{bty+30}" x2="{btx+58}" y2="{bty+30}" stroke="black" stroke-width="1.5"/>'
)
els.append(T(c2x+78, card_y+56, f'{D["bath_temp"]} °C', 16))
els.append(window_svg(c2x+14+14, card_y+108-14, 26, D["bath_window"]))
els.append(T(c2x+54, card_y+108, "Fenster zu" if not D["bath_window"] else "Fenster offen", 12))

# Card 3 – Lea
els.append(card(c3x, card_y, card_w, card_h, "Lea"))
# child silhouette
pcx, pcy = c3x+14+28, card_y+15
els.append(
    f'<circle cx="{pcx}" cy="{pcy+7}" r="8" fill="none" stroke="black" stroke-width="1.5"/>'
    f'<path d="M{pcx-12},{pcy+22} Q{pcx},{pcy+18} {pcx+12},{pcy+22} L{pcx+10},{pcy+48} L{pcx},{pcy+42} L{pcx-10},{pcy+48}Z" fill="none" stroke="black" stroke-width="1.5"/>'
)
els.append(T(c3x+78, card_y+56, f'{D["lea_temp"]} °C', 16))
els.append(window_svg(c3x+14+14, card_y+108-14, 26, D["lea_window"]))
els.append(T(c3x+54, card_y+108, "Fenster offen" if D["lea_window"] else "Fenster zu", 12))

# Card 4 – Hausstatus
els.append(card(c4x, card_y, card_w, card_h, "Hausstatus"))
vc = c4x+14+14; vr = 14
els.append(fan_svg(vc, card_y+48-14, vr))
vent_label = "Lueften sinnvoll" if vent_up else "Drinnen trockener"
els.append(T(c4x+54, card_y+48, vent_label, 12))
dc = c4x+14+14
els.append(dryer_svg(dc, card_y+76-14, 13))
els.append(T(c4x+54, card_y+76, D["dryer_state"], 12))
ac = c4x+14+14
if D["aurora"]:
    els.append(aurora_svg(ac, card_y+104-10, 28, 10))
else:
    els.append(T(ac-6, card_y+104-4, '&#x223C;', 18, italic=True))
aurora_label = "Aurora moeglich" if D["aurora"] else "Aurora ruhig"
els.append(T(c4x+54, card_y+104, aurora_label, 12))

# ═══════════════ FORECAST STRIP ══════════════════════════════════════════════

els.append(R(forecast_x, bottom_y, forecast_w, bottom_h))
els.append(T(forecast_x+14, bottom_y+22, "5-Tage-Ausblick", 16))

for i, (day, cond, hi, lo) in enumerate(D["forecast"]):
    bx = forecast_x + 18 + i * 98
    ly = bottom_y + 52
    els.append(T(bx, ly, day, 16))
    ic_r = 18; ic_cx = bx + 18; ic_cy = ly + 28
    els.append(weather_icon(cond, ic_cx, ic_cy, ic_r))
    els.append(T(bx, ly+68, f"{hi} / {lo}", 12))
    if i < 4:
        els.append(L(bx+74, bottom_y+36, bx+74, bottom_y+bottom_h-12))

# ═══════════════ UTILITY BOX ═════════════════════════════════════════════════

els.append(R(utility_x, bottom_y, utility_w, bottom_h))
els.append(T(utility_x+14, bottom_y+22, "Verbrauch", 16))

# water
wdrop_cx = utility_x+14+12
els.append(humidity_drop(wdrop_cx, bottom_y+44-10, 20))
els.append(T(utility_x+34, bottom_y+44, "Wasser", 12))
els.append(bar_chart_svg(utility_x+52, bottom_y+50, utility_w-68, 24, D["water_hist"]))

# power
els.append(f'<text x="{utility_x+14}" y="{bottom_y+86}" font-size="20" font-weight="bold" text-anchor="start" fill="black">&#x26A1;</text>')
els.append(T(utility_x+34, bottom_y+92, "Strom", 12))
els.append(bar_chart_svg(utility_x+52, bottom_y+98, utility_w-68, 24, D["power_hist"]))

# ═══════════════ FOOTER ══════════════════════════════════════════════════════

els.append(L(margin, 438, W-margin, 438, sw=1))
els.append(T(margin, 462, f'IP {D["ip"]}', 12))
els.append(wifi_svg(208+12, 452, 18))
els.append(T(244, 462, f'{D["wifi_dbm"]} dBm', 12))
els.append(T(360, 462, f'Build {D["build"]}', 12))

# battery symbols
for i, (lbl, lvl) in enumerate(zip(D["bat_labels"], D["bat_levels"])):
    bx = 594 + 28 + i * 28
    els.append(battery_svg(bx+8, 451, 12, 20, lvl, lbl))

# ── emit SVG ──────────────────────────────────────────────────────────────────

with open(OUTPUT_FILE, "w", encoding="utf-8") as _f:
    _f.write('<?xml version="1.0" encoding="UTF-8"?>\n')
    _f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
             f'viewBox="0 0 {W} {H}" style="background:white;">\n')
    _f.write('<defs><style>text{font-family:Arial,sans-serif;fill:black;}</style></defs>\n')
    for el in els:
        _f.write(el + "\n")
    _f.write('</svg>\n')

print(f"Written: {OUTPUT_FILE}")
