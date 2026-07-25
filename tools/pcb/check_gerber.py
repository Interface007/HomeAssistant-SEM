"""
Reads generated Gerber files back in and verifies them against the
board definition. This keeps results independent of trust in gerber.py.

    python tools/pcb/check_gerber.py <folder> [preview.svg]

Checks: apertures used only after definition, all coordinates inside the
outline, number of pad flashes per layer, drills against the pad list.
Additionally, an SVG preview is rendered from parsed data - what you see
there is what is actually present in the files.
"""
import os
import re
import sys

import board as B
import router as R

SCALE = 9.0
MARGIN = 24.0
BG = "#f7f6f2"
EDGE_TOL = 0.06     # halbe Umrisslinienbreite plus Rundung

COLORS = {
    "F_Cu": "#c9832b",
    "B_Cu": "#2f6fa8",
    "F_Silkscreen": "#f2f0ea",
    "Edge_Cuts": "#d0342c",
}


def parse(path):
    """(items, problems) - items are ('flash'|'draw'|'region', ...)."""
    items, problems = [], []
    aperture = {}
    current = None
    dark = True
    x = y = 0.0
    scale = None
    seen_use_before_def = False
    region = None

    for raw in open(path, encoding="ascii"):
        line = raw.strip()
        if not line:
            continue
        m = re.fullmatch(r"%FSLAX(\d)(\d)Y(\d)(\d)\*%", line)
        if m:
            scale = 10 ** int(m.group(2))
            continue
        m = re.fullmatch(r"%ADD(\d+)C,([0-9.]+)\*?%", line)
        if m:
            aperture[int(m.group(1))] = float(m.group(2))
            continue
        if line == "%LPD*%":
            dark = True
            continue
        if line == "%LPC*%":
            dark = False
            continue
        if line == "G36*":
            region = []
            continue
        if line == "G37*":
            if region:
                items.append(("region", region, dark))
            region = None
            continue
        m = re.fullmatch(r"D(\d+)\*", line)
        if m:
            code = int(m.group(1))
            if code >= 10:
                if code not in aperture:
                    seen_use_before_def = True
                current = code
            continue
        m = re.fullmatch(r"(?:X(-?\d+))?(?:Y(-?\d+))?D0([123])\*", line)
        if m:
            if scale is None:
                problems.append("no %FSLAX...% line before coordinates")
                scale = 1e6
            if m.group(1) is not None:
                x = int(m.group(1)) / scale
            if m.group(2) is not None:
                y = int(m.group(2)) / scale
            op = m.group(3)
            if region is not None:
                region.append((x, y))
            elif op == "3":
                items.append(("flash", x, y, aperture.get(current, 0.0), dark))
            elif op == "1":
                items.append(("draw", (px, py), (x, y),
                              aperture.get(current, 0.0), dark))
            px, py = x, y
            continue
        if line in ("G01*", "M02*") or line.startswith(("G04", "%TF", "%MO")):
            continue
        problems.append(f"unrecognized line: {line}")

    if seen_use_before_def:
        problems.append("aperture used before definition")
    return items, problems


def bbox(items):
    xs, ys = [], []
    for it in items:
        if it[0] == "flash":
            xs += [it[1] - it[3] / 2, it[1] + it[3] / 2]
            ys += [it[2] - it[3] / 2, it[2] + it[3] / 2]
        elif it[0] == "draw":
            for (ax, ay) in (it[1], it[2]):
                xs += [ax - it[3] / 2, ax + it[3] / 2]
                ys += [ay - it[3] / 2, ay + it[3] / 2]
        else:
            xs += [p[0] for p in it[1]]
            ys += [p[1] for p in it[1]]
    return (min(xs), min(ys), max(xs), max(ys)) if xs else (0, 0, 0, 0)


def parse_drill(path):
    tools, holes = {}, {}
    cur = None
    for line in open(path, encoding="ascii"):
        line = line.strip()
        m = re.fullmatch(r"T(\d+)C([0-9.]+)", line)
        if m:
            tools[int(m.group(1))] = float(m.group(2))
            continue
        m = re.fullmatch(r"T(\d+)", line)
        if m:
            cur = int(m.group(1))
            continue
        m = re.fullmatch(r"X(-?[0-9.]+)Y(-?[0-9.]+)", line)
        if m and cur in tools:
            holes.setdefault(tools[cur], []).append(
                (float(m.group(1)), float(m.group(2))))
    return holes


def svg(layers):
    w = B.BOARD_W * SCALE + 2 * MARGIN
    h = B.BOARD_H * SCALE + 2 * MARGIN

    def X(v):
        return MARGIN + v * SCALE

    def Y(v):
        return MARGIN + (B.BOARD_H - v) * SCALE

    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" '
         f'height="{h:.0f}" viewBox="0 0 {w:.0f} {h:.0f}">',
         f'<rect width="100%" height="100%" fill="{BG}"/>']

    for name in ("B_Cu", "F_Cu", "F_Silkscreen", "Edge_Cuts"):
        if name not in layers:
            continue
        col = COLORS[name]
        op = "0.85" if name == "B_Cu" else "1"
        for it in layers[name]:
            paint = col if it[-1] else BG
            if it[0] == "region":
                pts = " ".join(f"{X(p[0]):.1f},{Y(p[1]):.1f}" for p in it[1])
                o.append(f'<polygon points="{pts}" fill="{paint}" '
                         f'opacity="{op}"/>')
            elif it[0] == "flash":
                o.append(f'<circle cx="{X(it[1]):.1f}" cy="{Y(it[2]):.1f}" '
                         f'r="{it[3] / 2 * SCALE:.1f}" fill="{paint}" '
                         f'opacity="{op}"/>')
            else:
                o.append(f'<line x1="{X(it[1][0]):.1f}" y1="{Y(it[1][1]):.1f}" '
                         f'x2="{X(it[2][0]):.1f}" y2="{Y(it[2][1]):.1f}" '
                         f'stroke="{paint}" stroke-width="{it[3] * SCALE:.1f}" '
                         f'stroke-linecap="round" opacity="{op}"/>')

    for d, pts in parse_drill(os.path.join(sys.argv[1], "cellar-fan-01.drl")).items():
        for x, y in pts:
            o.append(f'<circle cx="{X(x):.1f}" cy="{Y(y):.1f}" '
                     f'r="{d / 2 * SCALE:.1f}" fill="{BG}"/>')

    o.append("</svg>")
    return "\n".join(o)


if __name__ == "__main__":
    d = sys.argv[1]
    ok = True
    layers = {}

    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".gbr"):
            continue
        name = fn.replace("cellar-fan-01-", "").replace(".gbr", "")
        items, problems = parse(os.path.join(d, fn))
        layers[name] = items
        x0, y0, x1, y1 = bbox(items)
        # The outline is centered on the edge and therefore extends by half
        # the line width beyond it - this is correct.
        tol = 0.01 if name != "Edge_Cuts" else EDGE_TOL
        inside = (x0 >= -tol and y0 >= -tol
                  and x1 <= B.BOARD_W + tol and y1 <= B.BOARD_H + tol)
        flash = sum(1 for i in items if i[0] == "flash")
        draw = sum(1 for i in items if i[0] == "draw")
          print(f"{name:14s} {flash:4d} flashes  {draw:4d} lines  "
              f"({x0:5.2f},{y0:5.2f})-({x1:5.2f},{y1:5.2f})"
              f"{'' if inside else '   OUTSIDE'}")
        if not inside:
            ok = False
        for p in problems:
            ok = False
            print("   !", p)

    npads = sum(len(cmp["pads"]) for cmp in B.COMPONENTS.values())
    routed, vias, failed = R.route()
    expect = npads + len(vias)

    for lay in ("F_Cu", "F_Mask", "B_Mask"):
        got = sum(1 for i in layers.get(lay, []) if i[0] == "flash")
        mark = "ok" if got == expect else "MISSING"
        if got != expect:
            ok = False
        print(f"{lay}: {got} pad flashes, expected {expect} -> {mark}")

    holes = parse_drill(os.path.join(d, "cellar-fan-01.drl"))
    nholes = sum(len(v) for v in holes.values())
    expect_h = npads + len(vias) + len(B.mount_holes())
        print(f"Drills: {nholes}, expected {expect_h} -> "
            f"{'ok' if nholes == expect_h else 'MISSING'}")
    if nholes != expect_h:
        ok = False

    pads_by_pos = {(round(p["x"], 3), round(p["y"], 3)): p["drill"]
                   for _, _, p, _ in B.all_pads()}
    for dia, pts in holes.items():
        for x, y in pts:
            key = (round(x, 3), round(y, 3))
            if key in pads_by_pos and abs(pads_by_pos[key] - dia) > 1e-6:
                ok = False
                    print(f"   ! drill {key} is {dia} mm, pad requires "
                      f"{pads_by_pos[key]} mm")

    if len(sys.argv) > 2:
        with open(sys.argv[2], "w", encoding="utf-8") as f:
            f.write(svg(layers))
        print("Preview:", sys.argv[2])

    print("\n" + ("GERBER PLAUSIBLE" if ok else "GERBER INVALID"))
    raise SystemExit(0 if ok else 1)
