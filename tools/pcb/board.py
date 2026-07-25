"""
Board definition for the basement ventilation carrier board (cellar-fan-01).

Single source of truth for geometry and netlist. gerber.py generates
manufacturing files from it, preview.py generates the inspection image.

Coordinates in mm, origin at bottom-left, y upwards.

ASSUMPTION (not yet verified on real module): The diymore clone is
mechanically identical to the Waveshare ESP32-S3-Zero per its 2D drawing -
18.00 x 23.50 mm, 9 pads per side on a 2.54 mm pitch, row spacing of
plated through-holes 15.24 mm. If this differs: adjust MODULE_ROW_PITCH or
MODULE_PIN_PITCH and regenerate.
"""

# ---------------------------------------------------------------- Board

BOARD_W = 60.0
BOARD_H = 55.0
BOARD_CORNER_R = 2.0
MOUNT_HOLE_D = 3.2          # M3
MOUNT_HOLE_INSET = 4.0
MOUNT_WASHER_D = 7.0        # Space needed for screw head/washer - no component
                            # body may be placed here

# Manufacturing limits (JLCPCB 2-layer standard)
COPPER_LAYERS = 2
MIN_TRACE = 0.25
MIN_CLEARANCE = 0.25
ANNULAR_RING = 0.3          # Copper ring around each hole

# ---------------------------------------------------------------- Module

MODULE_PIN_PITCH = 2.54
MODULE_ROW_PITCH = 15.24
MODULE_PINS_PER_ROW = 9
MODULE_BODY_W = 18.0
MODULE_BODY_H = 23.50

# Left pad row of the module, counted from the USB connector.
# All six required nets are here - right row remains unused.
MODULE_LEFT_ROW = ["5V", "GND", "3V3", "GP1", "GP2", "GP3", "GP4", "GP5", "GP6"]
MODULE_RIGHT_ROW = ["TX", "RX", "GP13", "GP12", "GP11", "GP10", "GP9", "GP8", "GP7"]

# ---------------------------------------------------------------- Drill sizes

D_HEADER = 1.0              # Pin/socket header 2.54
D_SCREW_5MM = 1.3           # Screw terminal 5.08 mm pitch
D_SCREW_35MM = 1.1          # Screw terminal 3.50 mm pitch
D_RESISTOR = 0.8            # Axial resistor 1/4 W
D_TO92 = 0.8                # 2N7000
D_ELKO = 0.9


def pad(x, y, drill, ref=""):
    """Plated through-hole pad. Copper diameter = hole + 2x annular ring."""
    return {"x": x, "y": y, "drill": drill, "copper": drill + 2 * ANNULAR_RING,
            "ref": ref}


def inline(x, y, n, pitch, drill, dx=1.0, dy=0.0):
    """n pads in one row, direction given by dx/dy (unit vector)."""
    return [pad(x + i * pitch * dx, y + i * pitch * dy, drill) for i in range(n)]


# ---------------------------------------------------------------- Components
#
# Each component: pads in pin order, plus net mapping.
# "silk" are labels: (x, y, text, size, anchor)

COMPONENTS = {}

# --- U1: ESP32-S3-Zero on 2x9 female headers ---------------------------
# Module sits on the right edge: the used pad row (5V/GND/3V3/GP1..GP6)
# faces west toward components, the unused row faces east toward the
# edge. Otherwise, nine unused pads sit between each signal and
# its destination - leaving no routing corridor.
_u1_x_signal = 40.0
_u1_x_unused = _u1_x_signal + MODULE_ROW_PITCH
_u1_y_top = 44.0

COMPONENTS["U1"] = {
    "desc": "ESP32-S3-Zero on 2x9 female headers, USB facing up",
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

# Height of the three signal pins - pull-ups are placed at the same height.
_y_gp2 = _u1_y_top - 4 * MODULE_PIN_PITCH
_y_gp4 = _u1_y_top - 6 * MODULE_PIN_PITCH
_y_gp6 = _u1_y_top - 8 * MODULE_PIN_PITCH

# --- J1: 12 V input, 2-pin screw terminal 5.08 -------------------------
COMPONENTS["J1"] = {
    "desc": "2-pin screw terminal 5.08 - 12 V input from PSU",
    "pads": inline(12.0, 6.0, 2, 5.08, D_SCREW_5MM),
    "nets": {0: "+12V", 1: "GND"},
    "silk": [(10.0, 10.6, "J1  12V IN", 1.2, "start")],
    "keepout": (8.5, 2.5, 12.5, 7.0),
}

# --- J2: 5 V input from external MINI560 ------------------------------
COMPONENTS["J2"] = {
    "desc": "2-pin screw terminal 5.08 - 5 V input from MINI560 (external)",
    "pads": inline(26.0, 48.0, 2, 5.08, D_SCREW_5MM),
    "nets": {0: "+5V", 1: "GND"},
    "silk": [(24.0, 52.0, "J2  5V IN", 1.2, "start")],
    "keepout": (22.5, 44.5, 12.5, 7.0),
}

# --- J3: DS18B20, 3-pin screw terminal 3.50 ---------------------------
COMPONENTS["J3"] = {
    "desc": "3-pin screw terminal 3.50 - DS18B20 (3V3 / GND / DATA)",
    "pads": inline(14.0, 28.0, 3, 3.5, D_SCREW_35MM, dx=0.0, dy=-1.0),
    "nets": {0: "+3V3", 1: "GND", 2: "GPIO6"},
    "silk": [(10.5, 32.0, "J3  DS18B20", 1.2, "start"),
             (16.5, 28.0, "+", 1.0, "start"),
             (16.5, 21.0, "D", 1.0, "start")],
    "keepout": (10.5, 19.5, 11.0, 11.5),
}

# --- J4 / J5: fans, 4-pin header 2.54 ---------------------------------
# Pin order as on motherboard: 1 GND, 2 +12V, 3 tach, 4 PWM
COMPONENTS["J4"] = {
    "desc": "4-pin header 2.54 - fan 1 (with tach)",
    "pads": inline(24.0, 18.0, 4, 2.54, D_HEADER),
    "nets": {0: "GND", 1: "+12V", 2: "GPIO4", 3: "PWM_OUT"},
    "silk": [(23.0, 21.0, "J4  FAN 1", 1.2, "start"),
             (23.4, 15.2, "1", 1.0, "start")],
    "keepout": (22.5, 15.0, 11.5, 7.0),
}

COMPONENTS["J5"] = {
    "desc": "4-pin header 2.54 - fan 2, tach NOT connected",
    "pads": inline(24.0, 8.0, 4, 2.54, D_HEADER),
    "nets": {0: "GND", 1: "+12V", 3: "PWM_OUT"},
    "silk": [(23.0, 11.0, "J5  FAN 2", 1.2, "start"),
             (23.4, 5.2, "1", 1.0, "start"),
             (29.5, 5.2, "no tach", 0.9, "start")],
    "keepout": (22.5, 5.0, 11.5, 7.0),
}

# --- Pull-ups: 3V3 end to west rail, signal end to east toward U1.
#     Pitch 10.16 (axial resistor 1/4 W horizontal).
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
    "desc": "10k gate pull-up: keeps Q1 conducting until ESP takes control",
    "pads": inline(24.0, _y_gp2, 2, 10.16, D_RESISTOR),
    "nets": {0: "+3V3", 1: "GPIO2"},
    "silk": [(24.0, _y_gp2 + 1.7, "R4 10k", 1.0, "start")],
    "keepout": (23.0, _y_gp2 - 1.5, 12.2, 3.0),
}

# --- Q1 + JP1: PWM driver ---------------------------------------------
# 2N7000 TO-92, pin order with flat side front: 1 source, 2 drain, 3 gate
COMPONENTS["Q1"] = {
    "desc": "2N7000 open-drain driver for PWM",
    "pads": inline(6.0, 39.0, 3, 2.54, D_TO92),
    "nets": {0: "GND", 1: "Q1_DRAIN", 2: "GPIO2"},
    "silk": [(4.5, 43.1, "Q1 2N7000", 1.0, "start"),
             (4.5, 36.7, "S D G", 0.9, "start")],
    "keepout": (4.5, 35.5, 8.0, 7.0),
}

# Solder jumper: center = PWM_OUT. Left-to-center = direct 3.3 V from GPIO.
# Right-to-center = via Q1 (open drain, in ESPHome set inverted: true).
COMPONENTS["JP1"] = {
    "desc": "Solder jumper PWM source: left=direct 3V3, right=via Q1",
    # Pitch 3.81 instead of 2.54: the middle pad is the shared node and
    # therefore surrounded by foreign copper on both sides. At 2.54 there is
    # no corridor left to route PWM_OUT. Bridge with a
    # Solder bridge or wire link - not a jumper-cap pitch.
    "pads": inline(16.0, 39.0, 3, 3.81, D_HEADER),
    "nets": {0: "GPIO2", 1: "PWM_OUT", 2: "Q1_DRAIN"},
    "silk": [(15.0, 36.2, "JP1", 1.0, "start"),
             (14.6, 41.6, "dir        Q1", 0.9, "start")],
    "keepout": (14.5, 36.0, 11.7, 6.0),
}

# --- C1: electrolytic capacitor 100 uF / 25 V -------------------------
COMPONENTS["C1"] = {
    "desc": "100uF/25V radial, pitch 2.5, buffer for 12 V rail",
    "pads": inline(5.0, 14.0, 2, 2.5, D_ELKO, dx=0.0, dy=1.0),
    "nets": {0: "GND", 1: "+12V"},
    "silk": [(1.8, 11.5, "C1 100u", 1.0, "start"),
             (7.5, 16.5, "+", 1.2, "start")],
    "keepout": (1.5, 10.5, 7.5, 10.0),
}

# ---------------------------------------------------------------- Nets

POWER_NETS = {"+12V", "+5V", "+3V3", "GND"}
NET_WIDTH = {"+12V": 1.0, "GND": 1.0, "+5V": 0.8, "+3V3": 0.6}
DEFAULT_NET_WIDTH = 0.4


def netlist():
    """Derive {netname: [(ref, pad_index, x, y), ...]} from COMPONENTS."""
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
    print(f"Board {BOARD_W} x {BOARD_H} mm, {len(COMPONENTS)} components, "
          f"{sum(len(c['pads']) for c in COMPONENTS.values())} Pads")
    for net in sorted(nets):
        pts = nets[net]
        print(f"  {net:10s} {len(pts):2d}  " +
              " ".join(f"{r}.{i}" for r, i, _, _ in pts))
    unrouted = [n for n, p in nets.items() if len(p) < 2]
    if unrouted:
        print("WARNING single-pin nets:", unrouted)
