"""
Board-Definition fuer die Kellerlueftungs-Traegerplatine (cellar-fan-01).

Einzige Quelle der Wahrheit fuer Geometrie und Netzliste. gerber.py erzeugt
daraus die Fertigungsdaten, preview.py das Bild zur Sichtpruefung.

Koordinaten in mm, Ursprung unten links, y nach oben.

ANNAHME (noch nicht am realen Modul verifiziert): Der diymore-Klon ist
mechanisch identisch zum Waveshare ESP32-S3-Zero laut dessen 2D-Zeichnung -
18.00 x 23.50 mm, 9 Pads pro Seite im Raster 2.54 mm, Reihenabstand der
durchkontaktierten Loecher 15.24 mm. Weicht das ab: MODULE_ROW_PITCH bzw.
MODULE_PIN_PITCH anpassen und neu generieren.
"""

# ---------------------------------------------------------------- Board

BOARD_W = 60.0
BOARD_H = 55.0
BOARD_CORNER_R = 2.0
MOUNT_HOLE_D = 3.2          # M3
MOUNT_HOLE_INSET = 4.0
MOUNT_WASHER_D = 7.0        # Platzbedarf Schraubenkopf/Scheibe - hier darf
                            # kein Bauteilgehaeuse stehen

# Fertigungsvorgaben (JLCPCB 2-Layer Standard)
COPPER_LAYERS = 2
MIN_TRACE = 0.25
MIN_CLEARANCE = 0.25
ANNULAR_RING = 0.3          # Kupferring um jedes Loch

# ---------------------------------------------------------------- Modul

MODULE_PIN_PITCH = 2.54
MODULE_ROW_PITCH = 15.24
MODULE_PINS_PER_ROW = 9
MODULE_BODY_W = 18.0
MODULE_BODY_H = 23.50

# Linke Padreihe des Moduls, von der USB-Buchse aus gezaehlt.
# Alle sechs benoetigten Netze liegen hier - rechte Reihe bleibt unbenutzt.
MODULE_LEFT_ROW = ["5V", "GND", "3V3", "GP1", "GP2", "GP3", "GP4", "GP5", "GP6"]
MODULE_RIGHT_ROW = ["TX", "RX", "GP13", "GP12", "GP11", "GP10", "GP9", "GP8", "GP7"]

# ---------------------------------------------------------------- Bohrer

D_HEADER = 1.0              # Stift-/Buchsenleiste 2.54
D_SCREW_5MM = 1.3           # Schraubklemme 5.08 mm Raster
D_SCREW_35MM = 1.1          # Schraubklemme 3.50 mm Raster
D_RESISTOR = 0.8            # Axialwiderstand 1/4 W
D_TO92 = 0.8                # 2N7000
D_ELKO = 0.9


def pad(x, y, drill, ref=""):
    """Durchkontaktiertes Pad. Kupferdurchmesser = Loch + 2x Ringbreite."""
    return {"x": x, "y": y, "drill": drill, "copper": drill + 2 * ANNULAR_RING,
            "ref": ref}


def inline(x, y, n, pitch, drill, dx=1.0, dy=0.0):
    """n Pads in einer Reihe, Richtung ueber dx/dy (Einheitsvektor)."""
    return [pad(x + i * pitch * dx, y + i * pitch * dy, drill) for i in range(n)]


# ---------------------------------------------------------------- Bauteile
#
# Jedes Bauteil: Pads in Pinreihenfolge, dazu die Netzzuordnung.
# "silk" sind Beschriftungen: (x, y, text, groesse, anker)

COMPONENTS = {}

# --- U1: ESP32-S3-Zero auf 2x9 Buchsenleisten -------------------------
# Modul sitzt am rechten Rand: die benutzte Padreihe (5V/GND/3V3/GP1..GP6)
# zeigt nach Westen zu den Bauteilen, die unbenutzte Reihe nach Osten zur
# Kante. Andernfalls liegen neun unbenutzte Pads zwischen jedem Signal und
# seinem Ziel - dort bleibt kein Korridor zum Routen.
_u1_x_signal = 40.0
_u1_x_unused = _u1_x_signal + MODULE_ROW_PITCH
_u1_y_top = 44.0

COMPONENTS["U1"] = {
    "desc": "ESP32-S3-Zero auf 2x9 Buchsenleisten, USB nach oben",
    "pads": (
        [pad(_u1_x_signal, _u1_y_top - i * MODULE_PIN_PITCH, D_HEADER,
             MODULE_LEFT_ROW[i]) for i in range(MODULE_PINS_PER_ROW)]
        + [pad(_u1_x_unused, _u1_y_top - i * MODULE_PIN_PITCH, D_HEADER,
               MODULE_RIGHT_ROW[i]) for i in range(MODULE_PINS_PER_ROW)]
    ),
    "nets": {
        0: "+5V", 1: "GND", 2: "+3V3", 4: "GPIO2", 6: "GPIO4", 8: "GPIO6",
    },
    "silk": [
        (_u1_x_signal - 1.0, _u1_y_top + 3.0, "USB", 1.2, "start"),
        (_u1_x_signal - 1.0, _u1_y_top - 20.32 - 3.5, "ESP32-S3", 1.4, "start"),
    ],
    "keepout": (_u1_x_signal - (MODULE_BODY_W - MODULE_ROW_PITCH) / 2 - 0.5,
                _u1_y_top - 20.32 - 1.6,
                MODULE_BODY_W + 1.0, MODULE_BODY_H + 1.0),
}

# Hoehe der drei Signalpins - die Pull-ups liegen jeweils auf gleicher Hoehe.
_y_gp2 = _u1_y_top - 4 * MODULE_PIN_PITCH
_y_gp4 = _u1_y_top - 6 * MODULE_PIN_PITCH
_y_gp6 = _u1_y_top - 8 * MODULE_PIN_PITCH

# --- J1: 12 V Eingang, Schraubklemme 2-polig 5.08 ---------------------
COMPONENTS["J1"] = {
    "desc": "Schraubklemme 2-pol 5.08 - Eingang 12 V vom Netzteil",
    "pads": inline(12.0, 6.0, 2, 5.08, D_SCREW_5MM),
    "nets": {0: "+12V", 1: "GND"},
    "silk": [(10.0, 10.6, "J1  12V IN", 1.2, "start")],
    "keepout": (8.5, 2.5, 12.5, 7.0),
}

# --- J2: 5 V Eingang vom externen MINI560 ----------------------------
COMPONENTS["J2"] = {
    "desc": "Schraubklemme 2-pol 5.08 - Eingang 5 V vom MINI560 (extern)",
    "pads": inline(26.0, 48.0, 2, 5.08, D_SCREW_5MM),
    "nets": {0: "+5V", 1: "GND"},
    "silk": [(24.0, 52.0, "J2  5V IN", 1.2, "start")],
    "keepout": (22.5, 44.5, 12.5, 7.0),
}

# --- J3: DS18B20, Schraubklemme 3-polig 3.50 -------------------------
COMPONENTS["J3"] = {
    "desc": "Schraubklemme 3-pol 3.50 - DS18B20 (3V3 / GND / DATA)",
    "pads": inline(14.0, 28.0, 3, 3.5, D_SCREW_35MM, dx=0.0, dy=-1.0),
    "nets": {0: "+3V3", 1: "GND", 2: "GPIO6"},
    "silk": [(10.5, 32.0, "J3  DS18B20", 1.2, "start"),
             (16.5, 28.0, "+", 1.0, "start"),
             (16.5, 21.0, "D", 1.0, "start")],
    "keepout": (10.5, 19.5, 11.0, 11.5),
}

# --- J4 / J5: Luefter, 4-Pin-Header 2.54 -----------------------------
# Pinfolge wie am Mainboard: 1 GND, 2 +12V, 3 Tacho, 4 PWM
COMPONENTS["J4"] = {
    "desc": "Stiftleiste 4-pol 2.54 - Luefter 1 (mit Tacho)",
    "pads": inline(24.0, 18.0, 4, 2.54, D_HEADER),
    "nets": {0: "GND", 1: "+12V", 2: "GPIO4", 3: "PWM_OUT"},
    "silk": [(23.0, 21.0, "J4  FAN 1", 1.2, "start"),
             (23.4, 15.2, "1", 1.0, "start")],
    "keepout": (22.5, 15.0, 11.5, 7.0),
}

COMPONENTS["J5"] = {
    "desc": "Stiftleiste 4-pol 2.54 - Luefter 2, Tacho NICHT belegt",
    "pads": inline(24.0, 8.0, 4, 2.54, D_HEADER),
    "nets": {0: "GND", 1: "+12V", 3: "PWM_OUT"},
    "silk": [(23.0, 11.0, "J5  FAN 2", 1.2, "start"),
             (23.4, 5.2, "1", 1.0, "start"),
             (29.5, 5.2, "kein Tacho", 0.9, "start")],
    "keepout": (22.5, 5.0, 11.5, 7.0),
}

# --- Pull-ups: 3V3-Ende nach Westen zur Schiene, Signalende nach Osten
#     zu U1. Rastermass 10.16 (Axialwiderstand 1/4 W liegend).
COMPONENTS["R1"] = {
    "desc": "4k7 Pull-up 1-Wire: GPIO6 -> 3V3",
    "pads": inline(24.0, _y_gp6, 2, 10.16, D_RESISTOR),
    "nets": {0: "+3V3", 1: "GPIO6"},
    "silk": [(24.0, _y_gp6 + 1.7, "R1 4k7", 1.0, "start")],
    "keepout": (23.0, _y_gp6 - 1.5, 12.2, 3.0),
}

COMPONENTS["R2"] = {
    "desc": "10k Pull-up Tacho: GPIO4 -> 3V3",
    "pads": inline(24.0, _y_gp4, 2, 10.16, D_RESISTOR),
    "nets": {0: "+3V3", 1: "GPIO4"},
    "silk": [(24.0, _y_gp4 + 1.7, "R2 10k", 1.0, "start")],
    "keepout": (23.0, _y_gp4 - 1.5, 12.2, 3.0),
}

COMPONENTS["R4"] = {
    "desc": "10k Gate-Pullup: haelt Q1 leitend solange der ESP nicht regelt",
    "pads": inline(24.0, _y_gp2, 2, 10.16, D_RESISTOR),
    "nets": {0: "+3V3", 1: "GPIO2"},
    "silk": [(24.0, _y_gp2 + 1.7, "R4 10k", 1.0, "start")],
    "keepout": (23.0, _y_gp2 - 1.5, 12.2, 3.0),
}

# --- Q1 + JP1: PWM-Treiber ------------------------------------------
# 2N7000 TO-92, Pinfolge flache Seite nach vorn: 1 Source, 2 Drain, 3 Gate
COMPONENTS["Q1"] = {
    "desc": "2N7000 Open-Drain-Treiber fuer PWM",
    "pads": inline(6.0, 39.0, 3, 2.54, D_TO92),
    "nets": {0: "GND", 1: "Q1_DRAIN", 2: "GPIO2"},
    "silk": [(4.5, 43.1, "Q1 2N7000", 1.0, "start"),
             (4.5, 36.7, "S D G", 0.9, "start")],
    "keepout": (4.5, 35.5, 8.0, 7.0),
}

# Loetjumper: Mitte = PWM_OUT. Links auf Mitte = direkt 3.3 V vom GPIO.
# Rechts auf Mitte = ueber Q1 (Open Drain, in ESPHome dann inverted: true).
COMPONENTS["JP1"] = {
    "desc": "Loetjumper PWM-Quelle: links=direkt 3V3, rechts=ueber Q1",
    # Raster 3.81 statt 2.54: das Mittelpad ist der gemeinsame Knoten und
    # damit von beiden Seiten von fremdem Kupfer umgeben. Bei 2.54 bleibt
    # kein Korridor, um PWM_OUT herauszufuehren. Gebrueckt wird mit einem
    # Loetklecks oder Drahtstueck - kein Jumper-Kappenraster.
    "pads": inline(16.0, 39.0, 3, 3.81, D_HEADER),
    "nets": {0: "GPIO2", 1: "PWM_OUT", 2: "Q1_DRAIN"},
    "silk": [(15.0, 36.2, "JP1", 1.0, "start"),
             (14.6, 41.6, "dir        Q1", 0.9, "start")],
    "keepout": (14.5, 36.0, 11.7, 6.0),
}

# --- C1: Elko 100 uF / 25 V -----------------------------------------
COMPONENTS["C1"] = {
    "desc": "100uF/25V radial, Rastermass 2.5, Puffer 12-V-Schiene",
    "pads": inline(5.0, 14.0, 2, 2.5, D_ELKO, dx=0.0, dy=1.0),
    "nets": {0: "GND", 1: "+12V"},
    "silk": [(1.8, 11.5, "C1 100u", 1.0, "start"),
             (7.5, 16.5, "+", 1.2, "start")],
    "keepout": (1.5, 10.5, 7.5, 10.0),
}

# ---------------------------------------------------------------- Netze

POWER_NETS = {"+12V", "+5V", "+3V3", "GND"}
NET_WIDTH = {"+12V": 1.0, "GND": 1.0, "+5V": 0.8, "+3V3": 0.6}
DEFAULT_NET_WIDTH = 0.4


def netlist():
    """{netname: [(ref, pad_index, x, y), ...]} aus COMPONENTS ableiten."""
    nets = {}
    for ref, comp in COMPONENTS.items():
        for idx, net in comp["nets"].items():
            p = comp["pads"][idx]
            nets.setdefault(net, []).append((ref, idx, p["x"], p["y"]))
    return nets


def all_pads():
    for ref, comp in COMPONENTS.items():
        for idx, p in enumerate(comp["pads"]):
            yield ref, idx, p, comp["nets"].get(idx)


def mount_holes():
    i = MOUNT_HOLE_INSET
    return [(i, i), (BOARD_W - i, i), (i, BOARD_H - i), (BOARD_W - i, BOARD_H - i)]


if __name__ == "__main__":
    nets = netlist()
    print(f"Board {BOARD_W} x {BOARD_H} mm, {len(COMPONENTS)} Bauteile, "
          f"{sum(len(c['pads']) for c in COMPONENTS.values())} Pads")
    for net in sorted(nets):
        pts = nets[net]
        print(f"  {net:10s} {len(pts):2d}  " +
              " ".join(f"{r}.{i}" for r, i, _, _ in pts))
    unrouted = [n for n, p in nets.items() if len(p) < 2]
    if unrouted:
        print("WARNUNG einpolige Netze:", unrouted)
