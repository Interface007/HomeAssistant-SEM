"""
Frame (bezel) for 0.96" OLED modules, 4-pin, SSD1306.

    python tools/3dp/oled_bezel.py [output_folder]

Generates a binary STL file for upload to jlc3dp.com and an
SVG preview. All dimensions are derived from mini-screens.avif; module
dimensions are defined below in MODULE and should only be changed there.

Bezel structure, from back side (z=0, resting on the surface) to
front side - values are derived from parameters below:
    z 0.00 .. 3.60   pocket for module (glass + PCB, max 3.50 thick)
    z 3.60 .. 4.60   window wall (FRONT_T)
    z 4.60 .. 5.00   45-degree chamfer at the window (CHAMFER)
    z 5.00           front side

The module is screwed to the surface using its own four Ø2.8 holes,
then the bezel is fitted and glued on. The pocket leaves 2.3 mm clearance
above the bare PCB for screw heads.

The mesh is a single closed ring of ring surfaces: each edge belongs to
exactly two triangles, with consistent orientation throughout.
This is verified below, not assumed.
"""
import math
import os
import struct
import sys

# ------------------------------------------------------- Module (measured)

MODULE = {
    "pcb_w": 24.70,
    "pcb_h": 27.00,
    "pcb_t": 1.20,
    "glass_w": 24.74,           # Panel, slightly wider than PCB
    "glass_top": 5.08,          # from PCB top edge
    "glass_h": 16.90,
    "va_x": 0.98, "va_w": 22.74,        # Viewable area
    "va_y": 6.08, "va_h": 11.86,
    "aa_x": 1.48, "aa_w": 21.74,        # Pixel area
    "aa_y": 6.58, "aa_h": 10.86,
    "total_t": 3.50,            # Glass front to PCB back (max)
    "hole_d": 2.80,
    "hole_x": (2.10, 22.60),
    "hole_y": (2.00, 25.00),
    "pin_y": 2.00,
    "pin_x": (8.54, 11.08, 13.62, 16.16),
}

# ------------------------------------------------------- Bezel

BORDER = 3.00               # Frame width around PCB - requirement: max 3 mm
POCKET_GAP = 0.25           # Clearance per side between PCB and pocket
POCKET_EXTRA = 0.10         # Slightly deeper pocket so the bezel rests on
                            # the surface instead of clamping on the glass
FRONT_T = 1.00              # Front plate thickness at the window
CHAMFER = 0.40              # 45-degree chamfer at the window
CORNER_R = 2.00
CORNER_SEGS = 10

# Window: covers pixel area with margin and still ends on the
# black glass border, not on PCB.
WINDOW_MARGIN_X = 0.38      # extension beyond pixel area per side
WINDOW_MARGIN_Y = 0.37

OUTER_W = MODULE["pcb_w"] + 2 * BORDER
OUTER_H = MODULE["pcb_h"] + 2 * BORDER
POCKET_W = MODULE["glass_w"] + 2 * POCKET_GAP
POCKET_H = MODULE["pcb_h"] + 2 * POCKET_GAP
POCKET_D = MODULE["total_t"] + POCKET_EXTRA
HEIGHT = POCKET_D + FRONT_T + CHAMFER

WINDOW_W = MODULE["aa_w"] + 2 * WINDOW_MARGIN_X
WINDOW_H = MODULE["aa_h"] + 2 * WINDOW_MARGIN_Y

# Window center: pixel area is not centered on the PCB.
_aa_cx = MODULE["aa_x"] + MODULE["aa_w"] / 2
_aa_cy_from_top = MODULE["aa_y"] + MODULE["aa_h"] / 2
WIN_CX = BORDER + _aa_cx
WIN_CY = BORDER + MODULE["pcb_h"] - _aa_cy_from_top     # y points up


# ------------------------------------------------------- Geometry

def rect_loop(cx, cy, w, h, z):
    """Rectangle, counter-clockwise when viewed from front (+z)."""
    x0, x1 = cx - w / 2, cx + w / 2
    y0, y1 = cy - h / 2, cy + h / 2
    return [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]


def rounded_loop(cx, cy, w, h, r, z, segs=CORNER_SEGS):
    """Rectangle with rounded corners, counter-clockwise."""
    x0, x1 = cx - w / 2, cx + w / 2
    y0, y1 = cy - h / 2, cy + h / 2
    pts = []
    for ccx, ccy, a0 in ((x1 - r, y0 + r, -90.0), (x1 - r, y1 - r, 0.0),
                         (x0 + r, y1 - r, 90.0), (x0 + r, y0 + r, 180.0)):
        for i in range(segs + 1):
            a = math.radians(a0 + 90.0 * i / segs)
            pts.append((ccx + r * math.cos(a), ccy + r * math.sin(a), z))
    # Remove duplicate points at segment boundaries
    out = [pts[0]]
    for p in pts[1:]:
        if math.dist(p[:2], out[-1][:2]) > 1e-9:
            out.append(p)
    return out


def zip_annulus(A, B, center):
    """Triangles between two star-shaped loops A and B.

    Both loops are merged by angle around `center`.
    For convex loops sharing a center, this always yields a valid
    tessellation. Order (A then B) defines orientation.
    """
    cx, cy = center

    def prep(loop):
        ang = [(math.atan2(p[1] - cy, p[0] - cx) % (2 * math.pi), p)
               for p in loop]
        k = min(range(len(ang)), key=lambda i: ang[i][0])
        ang = ang[k:] + ang[:k]
        # Make monotonic ascending
        base = ang[0][0]
        return [((a - base) % (2 * math.pi), p) for a, p in ang]

    a = prep(A)
    b = prep(B)
    na, nb = len(a), len(b)
    tris = []
    ia = ib = 0
    while ia < na or ib < nb:
        nxt_a = a[(ia + 1) % na][0] + (2 * math.pi if ia + 1 >= na else 0.0)
        nxt_b = b[(ib + 1) % nb][0] + (2 * math.pi if ib + 1 >= nb else 0.0)
        if ia < na and (ib >= nb or nxt_a <= nxt_b):
            tris.append((a[ia % na][1], a[(ia + 1) % na][1], b[ib % nb][1]))
            ia += 1
        else:
            tris.append((a[ia % na][1], b[(ib + 1) % nb][1], b[ib % nb][1]))
            ib += 1
    return tris


def build():
    cx, cy = OUTER_W / 2, OUTER_H / 2
    z_back, z_ledge = 0.0, POCKET_D
    z_win, z_front = POCKET_D + FRONT_T, HEIGHT

    outer_back = rounded_loop(cx, cy, OUTER_W, OUTER_H, CORNER_R, z_back)
    outer_front = rounded_loop(cx, cy, OUTER_W, OUTER_H, CORNER_R, z_front)
    pock_back = rect_loop(cx, cy, POCKET_W, POCKET_H, z_back)
    pock_ledge = rect_loop(cx, cy, POCKET_W, POCKET_H, z_ledge)
    win_ledge = rect_loop(WIN_CX, WIN_CY, WINDOW_W, WINDOW_H, z_ledge)
    win_top = rect_loop(WIN_CX, WIN_CY, WINDOW_W, WINDOW_H, z_win)
    win_front = rect_loop(WIN_CX, WIN_CY, WINDOW_W + 2 * CHAMFER,
                          WINDOW_H + 2 * CHAMFER, z_front)

    # One closed ring: back side -> pocket -> support -> window
    # -> chamfer -> front side -> outer wall -> back to back side.
    chain = [outer_back, pock_back, pock_ledge, win_ledge,
             win_top, win_front, outer_front]

    tris = []
    for i in range(len(chain)):
        A = chain[i]
        Bnext = chain[(i + 1) % len(chain)]
        # Merge window loops around window center, all others around
        # bezel center - otherwise the star-shape assumption breaks.
        use_win = A in (win_ledge, win_top, win_front) or \
            Bnext in (win_ledge, win_top, win_front)
        centre = (WIN_CX, WIN_CY) if use_win else (cx, cy)
        tris += zip_annulus(A, Bnext, centre)
    # Ring is traversed from back to front; this creates inward normals.
    # Flip once globally.
    return [(a, c, b) for a, b, c in tris]


# ------------------------------------------------------- Validation

def check(tris):
    problems = []
    edges = {}
    for t in tris:
        for k in range(3):
            e = (t[k], t[(k + 1) % 3])
            if e[0] == e[1]:
                problems.append("degenerate triangle (edge length 0)")
                continue
            edges[e] = edges.get(e, 0) + 1

    bad_dir = [e for e, n in edges.items() if n != 1]
    if bad_dir:
        problems.append(f"{len(bad_dir)} directed edge(s) duplicated - "
                f"inconsistent orientation")

    unpaired = [e for e in edges if (e[1], e[0]) not in edges]
    if unpaired:
        problems.append(f"{len(unpaired)} edge(s) without counterpart - "
                f"mesh not closed")

    vol = 0.0
    area = 0.0
    for a, b, cc in tris:
        vol += (a[0] * (b[1] * cc[2] - cc[1] * b[2])
                - a[1] * (b[0] * cc[2] - cc[0] * b[2])
                + a[2] * (b[0] * cc[1] - cc[0] * b[1])) / 6.0
        u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        v = (cc[0] - a[0], cc[1] - a[1], cc[2] - a[2])
        n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
             u[0] * v[1] - u[1] * v[0])
        area += 0.5 * math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2)

    if vol <= 0:
        problems.append(f"Volume {vol:.2f} mm3 not positive - "
                f"normals point inward")

    xs = [p[0] for t in tris for p in t]
    ys = [p[1] for t in tris for p in t]
    zs = [p[2] for t in tris for p in t]
    bbox = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    for got, want, name in zip(bbox, (OUTER_W, OUTER_H, HEIGHT), "XYZ"):
        if abs(got - want) > 1e-6:
            problems.append(f"Extent {name}: {got:.3f} instead of {want:.3f}")

    return problems, vol, area, bbox


def _shoelace(loop):
    a = 0.0
    for i in range(len(loop)):
        x1, y1 = loop[i][0], loop[i][1]
        x2, y2 = loop[(i + 1) % len(loop)][0], loop[(i + 1) % len(loop)][1]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0


def analytic_volume():
    """Target volume from parameters, computed independently of mesh.

    Outer contour uses the area of the actually used polygon,
    not the ideal corner radius - otherwise comparison checks
    arc approximation instead of mesh connectivity.
    """
    outer = _shoelace(rounded_loop(0, 0, OUTER_W, OUTER_H, CORNER_R, 0))
    v = outer * HEIGHT
    v -= POCKET_W * POCKET_H * POCKET_D                     # Pocket
    v -= WINDOW_W * WINDOW_H * (FRONT_T + CHAMFER)          # Window
    # Chamfer: surrounding wedge, cross-section CHAMFER^2/2
    per = 2 * (WINDOW_W + WINDOW_H)
    v -= per * CHAMFER ** 2 / 2 + 4 * CHAMFER ** 3 / 3
    return v


# ------------------------------------------------------- Output

def write_stl(tris, path, name="oled_bezel"):
    with open(path, "wb") as f:
        f.write(struct.pack("<80sI", name.encode()[:80].ljust(80, b" "),
                            len(tris)))
        for a, b, c in tris:
            u = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
            v = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
            n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
                 u[0] * v[1] - u[1] * v[0]]
            L = math.sqrt(sum(k * k for k in n)) or 1.0
            f.write(struct.pack("<3f", *[k / L for k in n]))
            for p in (a, b, c):
                f.write(struct.pack("<3f", *p))
            f.write(b"\0\0")


def write_preview(tris, path):
    """Isometric view using painter's algorithm."""
    ca, sa = math.cos(math.radians(30)), math.sin(math.radians(30))

    def proj(p):
        x, y, z = p
        return ((x - y) * ca, (x + y) * sa - z)

    flat = [(proj(a), proj(b), proj(c), a, b, c) for a, b, c in tris]
    xs = [q[0] for t in flat for q in t[:3]]
    ys = [q[1] for t in flat for q in t[:3]]
    s = 14.0
    pad = 16.0
    w = (max(xs) - min(xs)) * s + 2 * pad
    h = (max(ys) - min(ys)) * s + 2 * pad

    def X(v):
        return pad + (v - min(xs)) * s

    def Y(v):
        return h - pad - (v - min(ys)) * s

    light = (0.4, 0.5, 0.77)
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" '
           f'height="{h:.0f}" viewBox="0 0 {w:.0f} {h:.0f}">',
           '<rect width="100%" height="100%" fill="#f7f6f2"/>']

    def depth(t):
        return sum(p[0] + p[1] + p[2] for p in t[3:]) / 3.0

    for t in sorted(flat, key=depth):
        a3, b3, c3 = t[3:]
        u = (b3[0] - a3[0], b3[1] - a3[1], b3[2] - a3[2])
        v = (c3[0] - a3[0], c3[1] - a3[1], c3[2] - a3[2])
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
             u[0] * v[1] - u[1] * v[0]]
        L = math.sqrt(sum(k * k for k in n)) or 1.0
        lam = max(0.0, sum(n[i] / L * light[i] for i in range(3)))
        g = int(60 + 150 * lam)
        col = f"rgb({g},{g},{min(255, g + 12)})"
        pts = " ".join(f"{X(q[0]):.1f},{Y(q[1]):.1f}" for q in t[:3])
        out.append(f'<polygon points="{pts}" fill="{col}" stroke="{col}" '
                   f'stroke-width="0.3"/>')
    out.append("</svg>")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out))


if __name__ == "__main__":
    outdir = sys.argv[1] if len(sys.argv) > 1 else "out"
    os.makedirs(outdir, exist_ok=True)

    tris = build()
    problems, vol, area, bbox = check(tris)
    want = analytic_volume()

    _win_top = (OUTER_H - POCKET_H) / 2 + POCKET_H - (WIN_CY + WINDOW_H / 2)
    _win_bot = (WIN_CY - WINDOW_H / 2) - (OUTER_H - POCKET_H) / 2

    print(f"Bezel {OUTER_W:.2f} x {OUTER_H:.2f} x {HEIGHT:.2f} mm, "
          f"{len(tris)} triangles")
    print(f"  Pocket       {POCKET_W:.2f} x {POCKET_H:.2f} x {POCKET_D:.2f} mm")
    print(f"  Window       {WINDOW_W:.2f} x {WINDOW_H:.2f} mm, center "
          f"({WIN_CX:.2f}, {WIN_CY:.2f})")
    print(f"  Wall         {(OUTER_W - POCKET_W) / 2:.2f} mm on each side")
    print(f"  Web width    {(POCKET_W - WINDOW_W) / 2:.2f} mm left/right, "
          f"{_win_top:.2f} mm top, {_win_bot:.2f} mm bottom")
    print(f"  Volume       {vol:.2f} mm3 (analytic {want:.2f}, "
          f"deviation {abs(vol - want):.4f})")
    print(f"  Surface area {area:.1f} mm2")

    if abs(vol - want) > 0.01:
        problems.append(f"Mesh volume deviates by {abs(vol - want):.3f} mm3 "
                f"from analytic target value")

    if problems:
        print("\nPROBLEMS:")
        for p in problems:
            print("  -", p)
        raise SystemExit(1)

    print("  Mesh         closed, consistently oriented, positive volume")

    stl = os.path.join(outdir, "oled-bezel-0v96.stl")
    write_stl(tris, stl)
    write_preview(tris, os.path.join(outdir, "oled-bezel-0v96.svg"))
    print(f"\n{stl}  ({os.path.getsize(stl)} Bytes)")
    print(f"{os.path.join(outdir, 'oled-bezel-0v96.svg')}")

    print("\nMilled slot for the pin header, relative to PCB contour:")
    px0, px1 = MODULE["pin_x"][0], MODULE["pin_x"][-1]
        print(f"  centered in X, {MODULE['pin_y']:.2f} mm from PCB top edge")
        print(f"  Pins x {px0:.2f} to {px1:.2f} - recommended 12.0 x 6.0 mm, "
            f"at least 8 mm deep")
