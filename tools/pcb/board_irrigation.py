"""
Board definition for the raised-bed irrigation controller
(irrigation-garden-01).

Single source of truth for geometry and netlist, same contract as
board_cellar_fan.py: gerber.py generates manufacturing files from it,
preview.py generates the inspection image. Select it with

    PCB_BOARD=board_irrigation python verify.py

Coordinates in mm, origin at bottom-left, y upwards.

The module footprint - 2x9 pads, 2.54 pitch, 15.24 row spacing - is taken
unchanged from board_cellar_fan.py, where it has been built and fitted
twice. That reuse is the reason irrigation-garden-01 runs an S3-Zero and
not the ESP32 D1 Mini the first design draft named; see
docs/projects/garden-irrigation.md.

What is different from the ventilation board, and why the layout looks
the way it does:

  * The load is a 4.3 L/min diaphragm pump, not a 12 V case fan. Peak
    current is amps, not milliamps, so +12V, GND and PUMP_DRAIN are
    1.5 mm wide instead of 1.0, and C1 is 1000 uF instead of 100.
  * Q1 is switched on/off, never PWM'd. No solder jumper, no open-drain
    option, no tach filter - the whole JP1/C2 complex of the other board
    disappears.
  * D1 is not optional. A diaphragm pump is an inductive load and the
    flyback path has to exist before the first switch-off, not after the
    first dead MOSFET.
  * Eight cables leave this board (12 V in, 12 V out, 5 V in, pump, two
    soil probes, flow, float). Connectors therefore occupy three edges,
    and the component field is what is left in the middle.
"""

# ---------------------------------------------------------------- Board

import pinout as P

BOARD_NAME = "irrigation-garden-01"   # goes into the Gerber and BOM file names
BOARD_REV = "rev A"

BOARD_W = 80.0
BOARD_H = 70.0
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

MODULE_LEFT_ROW = ["5V", "GND", "3V3", "GP1", "GP2", "GP3", "GP4", "GP5", "GP6"]
MODULE_RIGHT_ROW = ["TX", "RX", "GP13", "GP12", "GP11", "GP10", "GP9", "GP8", "GP7"]

# ---------------------------------------------------------------- Drill sizes

D_HEADER = 1.0              # Pin/socket header 2.54
# Terminal pitch follows the CABLE, not the pin count:
#   5.08 (AKL 101, 2 mm2, 13 A)   -> power. The pump alone draws ~4 A.
#   3.50 (AKL 059, 1.5 mm2, 6 A)  -> signals, i.e. sensor pigtails of
#                                    0.25..0.5 mm2.
# A 2 mm2 cage clamping 0.25 mm2 litz wire is the failure that measures
# fine on the bench: the screw bottoms out while the strands wander to
# one side of the oversized cage, and the joint opens after a winter of
# thermal cycling. That is why J8 is 3.50 although it has two pins like
# J1..J4 - it carries a sensor cable, not power.
D_SCREW_5MM = 1.3           # Screw terminal 5.08 mm pitch
D_SCREW_35MM = 1.1          # Screw terminal 3.50 mm pitch
D_RESISTOR = 0.8            # Axial resistor 1/4 W, ceramic capacitor
D_TO220 = 1.1               # IRLZ34N leads, 0.9 x 0.5 mm
D_AXIAL_PWR = 1.5           # 1N5822 in DO-201AD: lead is 1.20..1.30 mm,
                            # so 1.2 was narrower than the part. See the
                            # fit check in pinout.py.
D_ELKO = 0.9


def pad(x, y, drill, ref=""):
    """Plated through-hole pad. Copper diameter = hole + 2x annular ring."""
    return {"x": x, "y": y, "drill": drill, "copper": drill + 2 * ANNULAR_RING,
            "ref": ref}


def inline(x, y, n, pitch, drill, dx=1.0, dy=0.0):
    """n pads in one row, direction given by dx/dy (unit vector)."""
    return [pad(x + i * pitch * dx, y + i * pitch * dy, drill) for i in range(n)]


# ---------------------------------------------------------------- Components

COMPONENTS = {}

# --- U1: ESP32-S3-Zero on 2x9 female headers ---------------------------
# Signal row (5V/GND/3V3/GP1..GP6) faces west into the component field,
# unused row faces east. Same orientation as the ventilation board and
# for the same reason: with the rows swapped, nine dead pads sit between
# every signal and its destination.
#
# The exception is GP7, the last pin of the EAST row. GP3 is a strapping
# pin and unusable, which leaves the west row one pin short of the six
# signals this board needs. GP7 is the pad furthest from the USB end, so
# its track leaves past the south end of the module instead of having to
# cross the other row - which is why J8 sits on the east edge.
_u1_x_signal = 52.0
_u1_x_unused = _u1_x_signal + MODULE_ROW_PITCH
_u1_y_top = 60.0

COMPONENTS["U1"] = {
    "desc": "ESP32-S3-Zero soldered flat over the pads, USB facing up",
    # No socket and no header. The module is castellated (half holes) and
    # gets soldered straight onto these pads, which is how both
    # ventilation boards were built and what they have survived. A socket
    # would only buy replaceability, and it would cost a tin-plated
    # contact pair in a box that crosses its dew point every night.
    #
    # The pads stay drilled rather than becoming SMD lands: solder wicking
    # into the hole anchors the module far better than a surface fillet,
    # and the 1.6 mm copper ring leaves room for one.
    "fit": (0.64, None),
    "pads": (
        [pad(_u1_x_signal, _u1_y_top - i * MODULE_PIN_PITCH, D_HEADER,
             MODULE_LEFT_ROW[i]) for i in range(MODULE_PINS_PER_ROW)]
        + [pad(_u1_x_unused, _u1_y_top - i * MODULE_PIN_PITCH, D_HEADER,
               MODULE_RIGHT_ROW[i]) for i in range(MODULE_PINS_PER_ROW)]
    ),
    "nets": {
        0: "+5V", 1: "GND", 2: "+3V3",
        3: "SOIL_A", 4: "SOIL_B", 6: "SOIL_PWR", 7: "PUMP_GATE", 8: "FLOW_SIG",
        17: "FLOAT",
    },
    "silk": [
        (_u1_x_signal - 1.0, _u1_y_top + 3.0, "USB", 1.2, "start"),
        (_u1_x_signal - 1.0, _u1_y_top - 20.32 - 3.5, "ESP32-S3-ZERO", 1.2,
         "start"),
    ],
    "keepout": (_u1_x_signal - (MODULE_BODY_W - MODULE_ROW_PITCH) / 2 - 0.5,
                _u1_y_top - 20.32 - 1.6,
                MODULE_BODY_W + 1.0, MODULE_BODY_H + 1.0),
}

_y_gp5 = _u1_y_top - 7 * MODULE_PIN_PITCH      # pump gate, 42.22

# --- J1: 12 V input, bottom edge ---------------------------------------
COMPONENTS["J1"] = {
    "desc": "2-pin screw terminal 5.08 - 12 V input from the PSU",
    "fit": (0.9, None),
    "pads": inline(12.0, 6.0, 2, 5.08, D_SCREW_5MM),
    "nets": {0: "+12V", 1: "GND"},
    "silk": [(12.0, 10.2, "+", 1.1, "middle"),
             (17.08, 10.2, "-", 1.1, "middle"),
             (1.5, 12.6, "J1 12V IN", 1.0, "start")],
    "keepout": (8.5, 1.7, 12.5, 8.6),
}

# --- J2: 12 V pass-through to the external MINI560 ---------------------
# Electrically parallel with J1. Separate terminal rather than two wires
# in one clamp, same decision as on the ventilation board.
COMPONENTS["J2"] = {
    "desc": "2-pin screw terminal 5.08 - 12 V out to the step-down module",
    "fit": (0.9, None),
    "pads": inline(5.0, 43.0, 2, 5.08, D_SCREW_5MM, dx=0.0, dy=-1.0),
    "nets": {0: "+12V", 1: "GND"},
    "silk": [(9.7, 42.6, "+", 1.1, "start"),
             (9.7, 37.5, "-", 1.1, "start"),
             (9.7, 47.3, "J2 12V OUT", 0.9, "start")],
    "keepout": (0.7, 34.5, 8.6, 12.5),
}

# --- J3: 5 V input from the external MINI560 ---------------------------
COMPONENTS["J3"] = {
    "desc": "2-pin screw terminal 5.08 - 5 V in from the step-down module",
    "fit": (0.9, None),
    "pads": inline(5.0, 57.0, 2, 5.08, D_SCREW_5MM, dx=0.0, dy=-1.0),
    "nets": {0: "+5V", 1: "GND"},
    "silk": [(9.7, 56.6, "+", 1.1, "start"),
             (9.7, 51.5, "-", 1.1, "start"),
             (9.7, 61.3, "J3 5V IN", 0.9, "start")],
    "keepout": (0.7, 48.5, 8.6, 12.5),
}

# --- J4: pump, bottom edge --------------------------------------------
# Low-side switched: the pump's negative lead goes to Q1's drain, its
# positive lead straight to +12V. Never wire it the other way round -
# with the MOSFET in the positive lead, its gate would have to sit above
# 12 V to turn on.
COMPONENTS["J4"] = {
    "desc": "2-pin screw terminal 5.08 - pump, low-side switched",
    "fit": (0.9, None),
    "pads": inline(36.0, 6.0, 2, 5.08, D_SCREW_5MM),
    "nets": {0: "+12V", 1: "PUMP_DRAIN"},
    "silk": [(36.0, 10.2, "+", 1.1, "middle"),
             (41.08, 10.2, "-", 1.1, "middle"),
             (33.0, 11.5, "J4 PUMPE", 1.0, "start")],
    "keepout": (32.5, 1.7, 12.5, 8.6),
}

# --- J5 / J6: soil moisture probes, top edge --------------------------
# Pin order matches the SEN0193 cable: VCC / GND / AOUT. VCC is SOIL_PWR,
# the switched GPIO rail - NOT +3V3. Wiring a probe to permanent 3V3
# defeats the duty cycling that keeps it alive for more than one season.
COMPONENTS["J5"] = {
    "desc": "3-pin screw terminal 3.50 - soil probe 10 cm (VCC/GND/AOUT)",
    "fit": (0.9, None),
    "pads": inline(12.0, 63.0, 3, 3.5, D_SCREW_35MM),
    "nets": {0: "SOIL_PWR", 1: "GND", 2: "SOIL_A"},
    "silk": [(12.0, 58.4, "V", 1.0, "middle"),
             (15.5, 58.4, "-", 1.0, "middle"),
             (19.0, 58.4, "A", 1.0, "middle"),
             (10.0, 54.6, "J5 ERDE 10CM", 0.9, "start")],
    "keepout": (10.0, 59.5, 11.0, 7.0),
}

COMPONENTS["J6"] = {
    "desc": "3-pin screw terminal 3.50 - soil probe 20 cm (VCC/GND/AOUT)",
    "fit": (0.9, None),
    "pads": inline(24.0, 63.0, 3, 3.5, D_SCREW_35MM),
    "nets": {0: "SOIL_PWR", 1: "GND", 2: "SOIL_B"},
    "silk": [(24.0, 58.4, "V", 1.0, "middle"),
             (27.5, 58.4, "-", 1.0, "middle"),
             (31.0, 58.4, "A", 1.0, "middle"),
             (22.0, 56.2, "J6 ERDE 20CM", 0.9, "start")],
    "keepout": (22.0, 59.5, 11.0, 7.0),
}

# --- J7: flow sensor, top edge ----------------------------------------
# Fed from +5V, read through the R3/R4 divider. The sensor's output is
# 5 V logic in some batches and open drain in others; the divider is
# correct for both, a pull-up would only be correct for one.
COMPONENTS["J7"] = {
    "desc": "3-pin screw terminal 3.50 - YF-S402 flow sensor (5V/GND/OUT)",
    "fit": (0.9, None),
    "pads": inline(38.0, 63.0, 3, 3.5, D_SCREW_35MM),
    "nets": {0: "+5V", 1: "GND", 2: "FLOW_RAW"},
    "silk": [(38.0, 58.4, "5", 1.0, "middle"),
             (41.5, 58.4, "-", 1.0, "middle"),
             (45.0, 58.4, "S", 1.0, "middle"),
             (36.0, 56.2, "J7 DURCHFLUSS", 0.9, "start")],
    "keepout": (36.0, 59.5, 11.0, 7.0),
}

# --- J8: float switch, east edge --------------------------------------
# Placed here purely because GP7 is on the east pad row. The switch is
# wired normally closed, so a cut cable reads as "canister empty".
#
# 3.50 pitch, not the 5.08 of the other two-pin terminals: see the note
# at D_SCREW_35MM. The float cable is a thin pigtail, and this is the
# terminal the dry-run interlock hangs on.
#
# THREE pins for a two-wire contact, so this board needs only one kind of
# 3.50 terminal instead of two. The spare pin is tied to GND rather than
# left open: an unconnected pad is an isolated island the ground pour has
# to route around, and as a second ground it makes the terminal forgiving
# - the float works in 1+2 or in 1+3. A dry contact has no polarity, and
# every wrong insertion leaves GP7 pulled up, which reads as "canister
# empty" and blocks the pump. There is no mis-wiring of this connector
# that ends with the pump running on an empty canister.
COMPONENTS["J8"] = {
    "desc": "3-pin screw terminal 3.50 - float switch NC, third pin = spare GND",
    "fit": (0.9, None),
    "pads": inline(75.0, 36.0, 3, 3.5, D_SCREW_35MM, dx=0.0, dy=-1.0),
    "nets": {0: "FLOAT", 1: "GND", 2: "GND"},
    "silk": [(70.5, 39.4, "J8 SCHWIMMER", 0.9, "start"),
             (72.5, 35.6, "S", 1.0, "middle"),
             (72.5, 32.1, "-", 1.0, "middle"),
             (72.5, 28.6, "-", 1.0, "middle")],
    "keepout": (71.5, 27.0, 7.0, 11.0),
}

# --- Q1: IRLZ34N low-side switch --------------------------------------
# TO-220 pinout seen from the printed face, legs down: 1 GATE, 2 DRAIN,
# 3 SOURCE. The tab is internally the drain - if this ever gets a heat
# sink, the tab is live at 12 V and must be isolated. It should not need
# one: 4 A through 35 mOhm is 0.6 W, and the pump runs for 15 s at a
# time.
#
# NOTE the difference to the ventilation board's Q1, where a 2N7000 in
# TO-92 is S-G-D. Same schematic position, different leg order, and the
# earlier board shipped a revision with them swapped.
_Q1_X = (36.0, 38.54, 41.08)

_q1_pads = inline(_Q1_X[0], 17.0, 3, 2.54, D_TO220)
_q1_nets, _q1_silk = P.wire("IRLZ34N/TO-220AB", _q1_pads,
                            {"G": "Q1_GATE", "D": "PUMP_DRAIN", "S": "GND"},
                            label_y=13.4)

COMPONENTS["Q1"] = {
    "desc": "IRLZ34N logic-level MOSFET, low-side pump switch (TO-220, G-D-S)",
    "package": "IRLZ34N/TO-220AB",
    "fit": (0.9, None),
    "pads": _q1_pads,
    "nets": _q1_nets,
    # Body outline instead of the generic keepout rectangle, with a second
    # line along the tab edge. The three letters say which pad is which
    # net; only this says which way to turn the part, and reading the
    # letters still needs the viewing convention from pinout.PACKAGES.
    "outline": ("lines", [
        [(33.44, 14.7), (43.64, 14.7), (43.64, 19.4), (33.44, 19.4),
         (33.44, 14.7)],
        [(33.44, 18.9), (43.64, 18.9)],          # tab side, faces north
    ]),
    "silk": [(33.5, 21.1, "Q1 IRLZ34N", 1.0, "start")] + _q1_silk,
    # 10.7 x 5.2, not 8.5 x 5.5: a TO-220 body is 10 mm wide and the old
    # keepout was narrower than the part it was supposed to reserve room
    # for.
    "keepout": (33.2, 14.4, 10.7, 5.2),
}

# --- R1: gate series resistor -----------------------------------------
# 100 Ohm slows the gate edge into the low nanofarads of Ciss. Without
# it the ESP pin drives a capacitive load directly and the current spike
# couples into the ADC lines that run past it - the soil readings are the
# most sensitive signals on this board and they share its ground.
COMPONENTS["R1"] = {
    "desc": "100R gate series resistor: GP5 -> Q1 gate",
    "fit": (0.6, 6.8),
    "pads": inline(38.0, _y_gp5, 2, 10.16, D_RESISTOR),
    "nets": {0: "Q1_GATE", 1: "PUMP_GATE"},
    "silk": [(38.0, _y_gp5 + 1.7, "R1 100R", 1.0, "start")],
    "keepout": (37.0, _y_gp5 - 1.5, 12.2, 3.0),
}

# --- R2: gate pulldown -------------------------------------------------
# The part that keeps the pump off during the roughly 300 ms between
# power-on and ESPHome configuring GP5. Until then the pin is an input
# and the gate floats; a floating logic-level gate at 12 V rail noise is
# enough to turn the MOSFET partly on. This resistor is not a detail.
COMPONENTS["R2"] = {
    "desc": "100k gate pulldown: holds Q1 off while GP5 floats at boot",
    "fit": (0.6, 6.8),
    "pads": inline(30.0, 40.0, 2, 10.16, D_RESISTOR, dx=0.0, dy=-1.0),
    "nets": {0: "Q1_GATE", 1: "GND"},
    "silk": [(31.7, 35.5, "R2 100K", 0.9, "start")],
    "keepout": (28.5, 28.8, 3.0, 12.2),
}

# --- R3 / R4: flow sensor divider --------------------------------------
# 10k over 20k: 5 V in gives 3.33 V out, right at the pin limit but not
# over it, and the same divider reads a 3.3 V push-pull output as 2.2 V,
# still a clean high.
COMPONENTS["R3"] = {
    "desc": "10k divider upper leg: flow sensor output -> GP6",
    "fit": (0.6, 6.8),
    "pads": inline(41.0, 58.0, 2, 10.16, D_RESISTOR, dx=0.0, dy=-1.0),
    "nets": {0: "FLOW_RAW", 1: "FLOW_SIG"},
    "silk": [(42.7, 53.5, "R3 10K", 0.9, "start")],
    "keepout": (39.5, 46.8, 3.0, 12.2),
}

COMPONENTS["R4"] = {
    "desc": "20k divider lower leg: GP6 -> GND",
    "fit": (0.6, 6.8),
    "pads": inline(28.0, 47.84, 2, 10.16, D_RESISTOR),
    "nets": {0: "GND", 1: "FLOW_SIG"},
    "silk": [(28.0, 49.5, "R4 20K", 0.9, "start")],
    "keepout": (27.0, 46.3, 12.2, 3.0),
}

# --- C1: bulk capacitor on the 12 V rail ------------------------------
# 1000 uF, not the 100 uF of the ventilation board. A diaphragm pump
# starts against a stalled rotor and pulls several amps for the first
# tens of milliseconds. Without the buffer that dip reaches the MINI560
# input and reboots the ESP - which looks exactly like a Wi-Fi problem
# and is not one.
COMPONENTS["C1"] = {
    "desc": "1000uF/25V radial, RM5 - inrush buffer on the 12 V rail",
    "fit": (0.6, None),
    "polarity": (1, "+"),
    "pads": inline(13.0, 16.0, 2, 5.0, D_ELKO, dx=0.0, dy=1.0),
    "nets": {0: "GND", 1: "+12V"},
    "silk": [(19.4, 21.5, "+", 1.2, "start"),
             (1.5, 11.0, "C1 1000U 25V", 0.85, "start")],
    # Round outline: 12.5 mm can plus air.
    "outline": ("circle", 13.0, 18.5, 6.6),
    "keepout": (6.0, 11.5, 14.0, 14.0),
}

# --- C2: float switch debounce ----------------------------------------
# The float is a reed contact on a long cable running next to the pump
# lead. 100 nF against the internal pull-up gives about 5 ms, far below
# the 10 s of software delay but enough to stop the pin toggling on every
# pump switch-off.
COMPONENTS["C2"] = {
    "desc": "100nF ceramic - debounce and noise sink on the float input",
    "fit": (0.6, None),
    "pads": inline(72.0, 24.0, 2, 5.08, D_RESISTOR, dx=0.0, dy=-1.0),
    "nets": {0: "FLOAT", 1: "GND"},
    "silk": [(69.0, 25.6, "C2 100N", 0.85, "start")],
    "keepout": (70.5, 17.5, 3.0, 8.0),
}

# --- C3: 3V3 decoupling ------------------------------------------------
COMPONENTS["C3"] = {
    "desc": "100nF ceramic - 3V3 decoupling next to the module",
    "fit": (0.6, None),
    "pads": inline(46.0, 55.0, 2, 5.08, D_RESISTOR, dx=0.0, dy=-1.0),
    "nets": {0: "+3V3", 1: "GND"},
    "silk": [(44.0, 56.6, "C3", 0.85, "start")],
    "keepout": (44.5, 48.5, 3.0, 8.0),
}

# --- D1: flyback diode across the pump --------------------------------
# Cathode to +12V, anode to the drain. Fitted the other way round it is a
# short across the supply the moment power is applied, and the 5 A PSU
# will win that argument.
# Pitch 15.24, not the 10.16 this board was first drawn with. The
# DO-201AD body is up to 9.50 mm long, which left 0.33 mm per side to bend
# a 1.3 mm lead into the hole - the part does not go in. 15.24 mm is the
# next standard axial grid step and leaves 2.87 mm per side.
COMPONENTS["D1"] = {
    "desc": "1N5822 Schottky flyback across the pump (cathode to +12V)",
    "fit": (1.3, 9.5),
    "polarity": (1, "K"),
    "pads": inline(34.0, 26.0, 2, 15.24, D_AXIAL_PWR),
    "nets": {0: "PUMP_DRAIN", 1: "+12V"},
    # Body outline with a band at the cathode end, so the orientation is
    # readable as a shape and not only as the letter K.
    "outline": ("lines", [
        [(36.87, 23.35), (46.37, 23.35), (46.37, 28.65), (36.87, 28.65),
         (36.87, 23.35)],
        [(45.1, 23.35), (45.1, 28.65)],
        [(45.6, 23.35), (45.6, 28.65)],
    ]),
    "silk": [(34.0, 29.6, "D1 1N5822", 0.9, "start"),
             (49.24, 22.2, "K", 1.0, "middle")],
    "keepout": (33.0, 23.0, 17.3, 6.0),
}

# ---------------------------------------------------------------- Copper keepout

# Ceramic antenna clearance. The module is soldered flat, so its antenna -
# at the end away from USB, which points south here - sits directly on
# this board, and Waveshare asks for PCB, metal and plastic to be kept
# clear of it. What a carrier board can actually give it is an opening in
# the ground plane underneath.
#
# The rectangle lies in the corridor BETWEEN the two pad rows, so it costs
# neither a pad nor a track: the area was measured first and the router
# had put nothing there. verify.py fails if a later re-route does.
#
# This is insurance, not a measurement. Nobody has quantified the loss on
# the ventilation boards, which work indoors near the AP. This device sits
# further from it than any other and inside a closed plastic box, so the
# cheap precaution is worth taking - see the Wi-Fi signal check in
# docs/projects/garden-irrigation.md.
COPPER_KEEPOUT = [(53.2, 38.0, 12.8, 4.6)]

# ---------------------------------------------------------------- Nets

POWER_NETS = {"+12V", "+5V", "+3V3", "GND"}

# 1.5 mm on the pump path: the Seaflo draws about 4 A at its pressure
# limit and several more for the first milliseconds after switch-on. At
# 35 um copper, 1.5 mm carries 4 A with roughly a 10 K rise. The
# ventilation board's 1.0 mm was sized for a 0.2 A fan and would run warm
# here.
NET_WIDTH = {"+12V": 1.5, "GND": 1.5, "PUMP_DRAIN": 1.5,
             "+5V": 0.8, "+3V3": 0.6}
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
