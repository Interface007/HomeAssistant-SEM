"""
Package facts as data, and the checks that compare a board against them.

Why this file exists: revision A of the ventilation carrier board went to
the fab with Q1's gate and drain swapped. The failure was not a wrong
data sheet - it was that the same fact had been written out twice by
hand, once as a pad-index-to-net mapping and once as three silkscreen
letters, and nothing in the toolchain compared the two with each other or
with the part.

So the data sheet fact is written here once per package, with its source
and the date it was checked. Board files then ask for a net per pin
FUNCTION - "the gate goes to GPIO2" - never per pad index, and both the
netlist and the silkscreen letters are derived from the same declaration
by wire(). A positional slip is no longer expressible.

What is left over, check() catches:

  * a part whose description names a transistor package but that never
    declared one, so its pin order was never checked against anything
  * silkscreen letters that no longer sit over the pads they name
  * a polarity marker nearer the wrong pad, or hidden underneath the body
    it is supposed to describe
  * a drill hole narrower than the lead that has to go through it
  * an axial part whose lead spacing leaves no room to bend the leads

The last two are not what caused the Q1 mistake, but they are the same
kind of mistake: a mechanical fact from a data sheet that nothing in the
chain was comparing against the geometry. Both found a real defect on
the irrigation board the first time they ran.
"""

import math
import re

import font

# Hole diameter minus lead diameter. 0.2 mm is comfortable for hand
# assembly through a plated hole; below about 0.1 mm the part stops
# going in once the plating tolerance goes the wrong way.
FIT_CLEARANCE = 0.2

# Space an axial lead needs on each side of the body to bend down into
# the board. Roughly two lead diameters, and never less than 1.5 mm -
# below that you are straightening the bend against the body.
BEND_ALLOWANCE = 2.0
BEND_MINIMUM = 1.5

# How far a silkscreen letter may sit from the centre of the pad it
# names. Well under half of the smallest pitch in use (2.54 mm).
LABEL_TOLERANCE = 0.8

# gerber.py renders every silk label at size * 0.8; the box below has to
# use the same factor or the overlap test is measuring a different board
# than the one that gets made.
SILK_SIZE_FACTOR = 0.8
# Half the silk stroke width plus air. Two labels closer than this touch
# once the screen is printed, whatever the geometry says.
SILK_MARGIN = 0.15

PACKAGE_HINT = re.compile(r"TO-\d|SOT-\d|DPAK|D2PAK", re.I)
POLARISED_HINT = re.compile(r"elko|electroly|radial|schottky|diode|tantal", re.I)


PACKAGES = {
    "2N7000/TO-92": {
        "pins": ("S", "G", "D"),
        "view": "flat face towards the viewer, leads down, read left to right",
        "lead": 0.45,
        "source": (
            "onsemi/Fairchild 2N7000 data sheet. CAUTION: the January 2022 "
            "revision prints drain and source the wrong way round in its pin "
            "drawing; onsemi support has confirmed S-G-D is the real order. "
            "BS170 shares it. 2N7002 in SOT-23 does NOT - that one is G-S-D."
        ),
        "checked": "2026-09-05",
    },
    "IRLZ34N/TO-220AB": {
        "pins": ("G", "D", "S"),
        "view": "printed face towards the viewer, leads down, read left to right",
        "lead": 0.9,
        "source": (
            "Infineon / Vishay IRLZ34 data sheet, TO-220AB: pin 1 gate, "
            "pin 2 drain, pin 3 source. The tab is internally the drain, so "
            "a heat sink would sit at 12 V and must be isolated."
        ),
        "checked": "2026-09-05",
    },
}


def wire(package, pads, function_nets, label_y, size=0.9):
    """
    Derive the pad->net mapping and the pin letters from one declaration.

    function_nets maps pin FUNCTION to net, e.g. {"G": "GPIO2", ...}. The
    pad order comes from PACKAGES, so the caller never writes a pad index
    and cannot transpose two of them.

    Returns (nets, silk) ready to drop into a component definition.
    """
    spec = PACKAGES[package]
    order = spec["pins"]
    if len(pads) != len(order):
        raise ValueError(f"{package} has {len(order)} pins, got {len(pads)} pads")
    if set(function_nets) != set(order):
        raise ValueError(f"{package} pins {order}, got {sorted(function_nets)}")

    nets = {i: function_nets[fn] for i, fn in enumerate(order)}
    silk = [(pads[i]["x"], label_y, order[i], size, "middle")
            for i in range(len(order))]
    return nets, silk


def _pad_distance(sx, sy, pad):
    return math.hypot(sx - pad["x"], sy - pad["y"])


def _silk_box(sx, sy, text, size, anchor):
    """Bounding box of one label, from font.py's own metrics."""
    h = size * SILK_SIZE_FACTOR
    scale = h / font.GLYPH_H
    adv = (font.GLYPH_W + font.GLYPH_GAP) * scale
    w = adv * len(text) - font.GLYPH_GAP * scale if text else 0.0
    x0 = sx - w / 2 if anchor == "middle" else (sx - w if anchor == "end" else sx)
    return (x0 - SILK_MARGIN, sy - SILK_MARGIN,
            x0 + w + SILK_MARGIN, sy + h + SILK_MARGIN)


def check_silk(components):
    """
    Silkscreen labels that overlap each other.

    Legibility is not cosmetic here: the letters under Q1 are the only
    thing on the board that says which leg goes in which hole, and a
    connector label crossing them is how you end up reading the wrong
    one.
    """
    boxes = []
    for ref, comp in sorted(components.items()):
        for sx, sy, text, size, anchor in comp.get("silk", []):
            boxes.append((ref, text, _silk_box(sx, sy, text, size, anchor)))

    problems = []
    for i in range(len(boxes)):
        ra, ta, a = boxes[i]
        for j in range(i + 1, len(boxes)):
            rb, tb, b = boxes[j]
            if a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]:
                problems.append(
                    f"silkscreen: {ra} '{ta}' overlaps {rb} '{tb}'")

    # A label under a part body is printed, photographed for the fab, and
    # then invisible for the whole life of the board. C1's polarity mark
    # was exactly this before it was caught.
    #
    # Only an explicit "outline" counts as a body. A keepout does NOT: it
    # is a generous reservation, several millimetres larger than the part
    # in every direction, and the pin letters have to sit inside it to be
    # next to the pads at all. Testing against keepouts reported 27 cases
    # across both boards, of which two were real - a check that shouts
    # like that gets ignored, which is worse than not having it.
    for ref, comp in sorted(components.items()):
        shape = comp.get("outline")
        if not shape:
            continue
        for lref, ltext, (x0, y0, x1, y1) in boxes:
            hidden = False
            if shape[0] == "circle":
                _, cx, cy, r = shape
                nx, ny = min(max(cx, x0), x1), min(max(cy, y0), y1)
                hidden = math.hypot(nx - cx, ny - cy) < r
            elif shape[0] == "lines":
                xs = [p[0] for poly in shape[1] for p in poly]
                ys = [p[1] for poly in shape[1] for p in poly]
                hidden = (x0 < max(xs) and min(xs) < x1
                          and y0 < max(ys) and min(ys) < y1)
            if hidden:
                problems.append(
                    f"silkscreen: {lref} '{ltext}' lies under {ref}'s body "
                    f"outline - hidden once the board is populated")
    return problems


def check(components):
    """
    Compare a board's components against the declared package facts.

    Returns hard problems only. Silkscreen overlaps come back separately
    from check_silk() as warnings: they make a board awkward to populate,
    they do not make it wrong, and a board already built and working
    should not be blocked over one.
    """
    problems = []

    for ref, comp in sorted(components.items()):
        desc = comp.get("desc", "")
        pads = comp["pads"]
        silk = comp.get("silk", [])
        package = comp.get("package")

        # --- pin order -------------------------------------------------
        if PACKAGE_HINT.search(desc) and not package:
            problems.append(
                f"{ref}: the description names a transistor package but no "
                f"package is declared - the pin order is unverified")

        if package:
            spec = PACKAGES.get(package)
            if spec is None:
                problems.append(f"{ref}: unknown package {package!r}")
            else:
                for i, fn in enumerate(spec["pins"]):
                    near = [s for s in silk if s[2] == fn
                            and abs(s[0] - pads[i]["x"]) <= LABEL_TOLERANCE]
                    if not near:
                        problems.append(
                            f"{ref}: no '{fn}' silk label over pad {i} "
                            f"(x={pads[i]['x']:.2f}) - letters and pads disagree")

        # --- polarity --------------------------------------------------
        polarity = comp.get("polarity")
        if POLARISED_HINT.search(desc) and polarity is None:
            problems.append(
                f"{ref}: polarised part without a declared polarity marker")

        if polarity is not None:
            idx, marker = polarity
            hits = [(s[0], s[1]) for s in silk if s[2] == marker]
            if not hits:
                problems.append(
                    f"{ref}: declared polarity marker '{marker}' is not on the "
                    f"silkscreen")
            else:
                mx, my = hits[0]
                own = _pad_distance(mx, my, pads[idx])
                others = [_pad_distance(mx, my, p)
                          for j, p in enumerate(pads) if j != idx]
                if others and own >= min(others):
                    problems.append(
                        f"{ref}: polarity marker '{marker}' is no closer to pad "
                        f"{idx} than to another pad - which pad it means is a "
                        f"guess")
                shape = comp.get("outline")
                if shape and shape[0] == "circle":
                    _, cx, cy, r = shape
                    if math.hypot(mx - cx, my - cy) < r:
                        problems.append(
                            f"{ref}: polarity marker '{marker}' sits inside the "
                            f"body outline - hidden as soon as the part is "
                            f"fitted")

        # --- mechanical fit --------------------------------------------
        fit = comp.get("fit")
        if fit is None:
            problems.append(
                f"{ref}: no 'fit' declared - lead diameter and body length are "
                f"unchecked against the drills and the pitch")
            continue

        lead, body = fit
        drill = min(p["drill"] for p in pads)
        if drill < lead + FIT_CLEARANCE:
            problems.append(
                f"{ref}: drill {drill:.2f} mm is too tight for a {lead:.2f} mm "
                f"lead - needs at least {lead + FIT_CLEARANCE:.2f} mm")

        if body is not None and len(pads) >= 2:
            pitch = math.hypot(pads[1]["x"] - pads[0]["x"],
                               pads[1]["y"] - pads[0]["y"])
            gap = (pitch - body) / 2.0
            if gap < BEND_MINIMUM:
                problems.append(
                    f"{ref}: pitch {pitch:.2f} mm leaves {gap:.2f} mm per side "
                    f"for a {body:.2f} mm body - the leads cannot be bent into "
                    f"the holes (want {body + 2 * BEND_ALLOWANCE:.2f} mm)")

    return problems
