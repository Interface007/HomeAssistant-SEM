"""
Generates manufacturing data from board.py + router.py.

    python tools/pcb/gerber.py [output_folder]

Output (RS-274X, mm, format 4.6, leading zeros omitted):
    *-F_Cu.gbr          top copper layer
    *-B_Cu.gbr          bottom layer: ground plane with clearances
    *-F_Mask.gbr        top solder mask
    *-B_Mask.gbr        bottom solder mask
    *-F_Silkscreen.gbr  top silkscreen
    *-Edge_Cuts.gbr     board outline
    *.drl               Excellon drill file

The ground plane is created as a region (G36/G37) in dark polarity, then
clearances are cut in light polarity (%LPC*%), and finally bottom-side pad
rings, vias, and signal tracks are written back.

Corners in the outline are polygon-approximated (no G02/G03) - supported by
all manufacturers and avoids arc interpretation differences.
"""
import os
import sys

import board as B
import font
import router as R

MASK_EXPANSION = 0.05      # per side
SILK_WIDTH = 0.15
EDGE_WIDTH = 0.10
POUR_INSET = 0.5
CORNER_SEGMENTS = 8
NAME = "cellar-fan-01"


def c(v):
    """mm -> Gerber coordinate in 4.6 format."""
    return f"{round(v * 1e6):d}"


class Gerber:
    def __init__(self, layer, function):
        self.lines = [
            "%FSLAX46Y46*%",
            "%MOMM*%",
            f"G04 {NAME} - {layer}*",
            f"%TF.FileFunction,{function}*%",
            "%TF.GenerationSoftware,HomeAssistant-SEM,tools/pcb*%",
            "%LPD*%",
            "G01*",
        ]
        self.apertures = {}
        self._next = 10

    def ap(self, spec):
        """D-code for an aperture, e.g. 'C,0.400000' - create on demand."""
        if spec not in self.apertures:
            code = self._next
            self._next += 1
            self.apertures[spec] = code
            # Aperture definitions must appear before first use;
            # they are collected here and inserted at the top in write().
        return self.apertures[spec]

    def flash(self, x, y, diameter):
        d = self.ap(f"C,{diameter:.6f}")
        self.lines.append(f"D{d}*")
        self.lines.append(f"X{c(x)}Y{c(y)}D03*")

    def draw(self, points, width):
        if len(points) < 2:
            return
        d = self.ap(f"C,{width:.6f}")
        self.lines.append(f"D{d}*")
        self.lines.append(f"X{c(points[0][0])}Y{c(points[0][1])}D02*")
        for x, y in points[1:]:
            self.lines.append(f"X{c(x)}Y{c(y)}D01*")

    def region(self, points):
        self.lines.append("G36*")
        self.lines.append(f"X{c(points[0][0])}Y{c(points[0][1])}D02*")
        for x, y in points[1:]:
            self.lines.append(f"X{c(x)}Y{c(y)}D01*")
        self.lines.append("G37*")

    def polarity(self, dark=True):
        self.lines.append("%LPD*%" if dark else "%LPC*%")

    def write(self, path):
        defs = [f"%ADD{code}{spec}*%"
                for spec, code in sorted(self.apertures.items(),
                                         key=lambda kv: kv[1])]
        head = self.lines[:6] + defs + self.lines[6:]
        with open(path, "w", encoding="ascii", newline="\n") as f:
            f.write("\n".join(head) + "\nM02*\n")


def outline(inset=0.0):
    """Board outline as polygon, corners approximated polygonally."""
    import math
    r = max(0.0, B.BOARD_CORNER_R - inset)
    x0, y0 = inset, inset
    x1, y1 = B.BOARD_W - inset, B.BOARD_H - inset
    pts = []
    corners = [(x1 - r, y0 + r, -90, 0), (x1 - r, y1 - r, 0, 90),
               (x0 + r, y1 - r, 90, 180), (x0 + r, y0 + r, 180, 270)]
    for cx, cy, a0, a1 in corners:
        for i in range(CORNER_SEGMENTS + 1):
            a = math.radians(a0 + (a1 - a0) * i / CORNER_SEGMENTS)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    pts.append(pts[0])
    return pts


def top_copper(routed, vias):
    g = Gerber("Top Copper", "Copper,L1,Top")
    for net, path, width, layer in routed:
        if layer == R.TOP:
            g.draw(path, width)
    for ref, idx, p, net in B.all_pads():
        g.flash(p["x"], p["y"], p["copper"])
    for net, vx, vy in vias:
        g.flash(vx, vy, R.VIA_COPPER)
    return g


def bottom_copper(routed, vias):
    g = Gerber("Bottom Copper (GND plane)", "Copper,L2,Bot")

    g.region(outline(POUR_INSET))

    g.polarity(dark=False)
    for ref, idx, p, net in B.all_pads():
        if net == "GND":
            continue
        g.flash(p["x"], p["y"], p["copper"] + 2 * B.MIN_CLEARANCE)
    for hx, hy in B.mount_holes():
        g.flash(hx, hy, B.MOUNT_HOLE_D + 2 * B.MIN_CLEARANCE)
    for net, vx, vy in vias:
        g.flash(vx, vy, R.VIA_COPPER + 2 * B.MIN_CLEARANCE)
    for net, path, width, layer in routed:
        if layer == R.BOTTOM:
            g.draw(path, width + 2 * B.MIN_CLEARANCE)

    g.polarity(dark=True)
    for ref, idx, p, net in B.all_pads():
        g.flash(p["x"], p["y"], p["copper"])
    for net, vx, vy in vias:
        g.flash(vx, vy, R.VIA_COPPER)
    for net, path, width, layer in routed:
        if layer == R.BOTTOM:
            g.draw(path, width)
    return g


def mask(side, vias):
    g = Gerber(f"Solder Mask {side}",
               f"Soldermask,{'Top' if side == 'Top' else 'Bot'}")
    for ref, idx, p, net in B.all_pads():
        g.flash(p["x"], p["y"], p["copper"] + 2 * MASK_EXPANSION)
    for net, vx, vy in vias:
        g.flash(vx, vy, R.VIA_COPPER + 2 * MASK_EXPANSION)
    return g


def silkscreen():
    g = Gerber("Top Silkscreen", "Legend,Top")

    for ref, comp in B.COMPONENTS.items():
        ko = comp.get("keepout")
        if ko:
            x, y, w, h = ko
            g.draw([(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)],
                   SILK_WIDTH)
        for sx, sy, text, size, anchor in comp.get("silk", []):
            for poly in font.text_strokes(text, sx, sy, size * 0.8, anchor):
                g.draw(poly, SILK_WIDTH)

    # Pin-1 marker: short line next to pad 0 of each connector
    for ref, comp in B.COMPONENTS.items():
        if not ref.startswith("J"):
            continue
        p = comp["pads"][0]
        r = p["copper"] / 2 + 0.35
        g.draw([(p["x"] - r, p["y"] - r), (p["x"] - r, p["y"] + r)],
               SILK_WIDTH)

    for poly in font.text_strokes(NAME, B.BOARD_W / 2, 1.4, 1.1, "middle"):
        g.draw(poly, SILK_WIDTH)
    return g


def edge_cuts():
    g = Gerber("Board Outline", "Profile,NP")
    g.draw(outline(), EDGE_WIDTH)
    return g


def excellon(vias, path):
    holes = {}
    for ref, idx, p, net in B.all_pads():
        holes.setdefault(round(p["drill"], 3), []).append((p["x"], p["y"]))
    for net, vx, vy in vias:
        holes.setdefault(R.VIA_DRILL, []).append((vx, vy))
    for hx, hy in B.mount_holes():
        holes.setdefault(B.MOUNT_HOLE_D, []).append((hx, hy))

    sizes = sorted(holes)
    out = ["M48", "; Excellon, metric, absolute, decimal", "FMAT,2",
           "METRIC,TZ"]
    for i, d in enumerate(sizes, start=1):
        out.append(f"T{i:02d}C{d:.3f}")
    out += ["%", "G90", "G05", "M71"]
    for i, d in enumerate(sizes, start=1):
        out.append(f"T{i:02d}")
        for x, y in holes[d]:
            out.append(f"X{x:.3f}Y{y:.3f}")
    out += ["T00", "M30"]
    with open(path, "w", encoding="ascii", newline="\n") as f:
        f.write("\n".join(out) + "\n")
    return {d: len(holes[d]) for d in sizes}


if __name__ == "__main__":
    outdir = sys.argv[1] if len(sys.argv) > 1 else "gerber"
    os.makedirs(outdir, exist_ok=True)

    routed, vias, failed = R.route()
    if failed:
          print("ABORT: routing incomplete -",
              ", ".join(n for n, _ in failed))
        raise SystemExit(1)

    files = {
        f"{NAME}-F_Cu.gbr": top_copper(routed, vias),
        f"{NAME}-B_Cu.gbr": bottom_copper(routed, vias),
        f"{NAME}-F_Mask.gbr": mask("Top", vias),
        f"{NAME}-B_Mask.gbr": mask("Bottom", vias),
        f"{NAME}-F_Silkscreen.gbr": silkscreen(),
        f"{NAME}-Edge_Cuts.gbr": edge_cuts(),
    }
    for fname, g in files.items():
        g.write(os.path.join(outdir, fname))
          print(f"  {fname:34s} {len(g.lines):5d} lines, "
              f"{len(g.apertures)} aperture(s)")

    counts = excellon(vias, os.path.join(outdir, f"{NAME}.drl"))
    total = sum(counts.values())
    print(f"  {NAME + '.drl':34s} {total} drill holes")
    for d, n in sorted(counts.items()):
        print(f"      {d:.3f} mm  x{n}")
    print(f"\n{len(files) + 1} files in {outdir}/")
