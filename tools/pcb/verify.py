"""
Elektrische Pruefung des Layouts - ersetzt den DRC, den es ohne EDA-Tool
nicht gibt. Prueft das Ergebnis, nicht die Absicht.

Jedes Kupferelement ist ein Kreis (Pad, Via) oder eine Kapsel (Leiterbahn)
und gilt auf einer oder beiden Lagen: Pads und Vias sind durchkontaktiert,
Bahnen liegen nur auf ihrer Lage. Fuer jedes Paar mit gemeinsamer Lage wird
der echte Abstand berechnet - keine Rasterung, keine Rundungsfehler.
  - gleiches Netz, Abstand <= 0            -> verbunden
  - anderes Netz, Abstand < MIN_CLEARANCE  -> Verstoss
Jedes Netz muss danach genau eine Zusammenhangskomponente bilden.

Die Masseflaeche auf der Unterseite kann durch die Freistellungen um fremde
Pads, Vias und Signalbahnen in Inseln zerfallen. Das ist am Paarabstand
nicht zu sehen, deshalb dafuer ein Flutfuellen auf 0.1-mm-Raster.

    python tools/pcb/verify.py
"""
import math

import board as B
import router as R

POUR_GRID = 0.1
BOTH = frozenset((R.TOP, R.BOTTOM))


def _seg_point_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 == 0.0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _seg_seg_dist(a1, a2, b1, b2):
    """Abstand zweier Strecken, inklusive Schnittfall."""
    def cross(o, a, b):
        return ((a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]))

    d1, d2 = cross(b1, b2, a1), cross(b1, b2, a2)
    d3, d4 = cross(a1, a2, b1), cross(a1, a2, b2)
    if ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0)):
        return 0.0
    return min(
        _seg_point_dist(a1[0], a1[1], b1[0], b1[1], b2[0], b2[1]),
        _seg_point_dist(a2[0], a2[1], b1[0], b1[1], b2[0], b2[1]),
        _seg_point_dist(b1[0], b1[1], a1[0], a1[1], a2[0], a2[1]),
        _seg_point_dist(b2[0], b2[1], a1[0], a1[1], a2[0], a2[1]),
    )


def primitives(routed, vias):
    """[(net, kind, geometrie, radius, label, layers), ...]"""
    out = []
    for ref, idx, p, net in B.all_pads():
        out.append((net, "pad", (p["x"], p["y"]), p["copper"] / 2,
                    f"{ref}.{idx}", BOTH))
    for i, (net, vx, vy) in enumerate(vias):
        out.append((net, "pad", (vx, vy), R.VIA_COPPER / 2,
                    f"via{i}", BOTH))
    for i, (net, path, width, layer) in enumerate(routed):
        for k in range(len(path) - 1):
            out.append((net, "seg", (path[k], path[k + 1]), width / 2,
                        f"{net}#{i}.{k}", frozenset((layer,))))
    return out


def distance(a, b):
    _, ka, ga, ra, _, _ = a
    _, kb, gb, rb, _, _ = b
    if ka == "pad" and kb == "pad":
        d = math.hypot(ga[0] - gb[0], ga[1] - gb[1])
    elif ka == "pad":
        d = _seg_point_dist(ga[0], ga[1], gb[0][0], gb[0][1], gb[1][0], gb[1][1])
    elif kb == "pad":
        d = _seg_point_dist(gb[0], gb[1], ga[0][0], ga[0][1], ga[1][0], ga[1][1])
    else:
        d = _seg_seg_dist(ga[0], ga[1], gb[0], gb[1])
    return d - ra - rb


class UF:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, a):
        while self.p[a] != a:
            self.p[a] = self.p[self.p[a]]
            a = self.p[a]
        return a

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb


def check_copper(routed, vias):
    prims = primitives(routed, vias)
    uf = UF(len(prims))
    violations = []

    for i in range(len(prims)):
        for j in range(i + 1, len(prims)):
            a, b = prims[i], prims[j]
            if not (a[5] & b[5]):
                continue          # keine gemeinsame Lage - kann nicht kollidieren
            d = distance(a, b)
            if a[0] == b[0]:
                if d <= 1e-9:
                    uf.union(i, j)
            elif d < B.MIN_CLEARANCE - 1e-9:
                violations.append((a[0], a[4], b[0], b[4], d))

    for hx, hy in B.mount_holes():
        hole = (None, "pad", (hx, hy), B.MOUNT_HOLE_D / 2, "M3", BOTH)
        for pr in prims:
            d = distance(hole, pr)
            if d < B.MIN_CLEARANCE - 1e-9:
                violations.append(("M3", f"({hx:.0f},{hy:.0f})",
                                   pr[0], pr[4], d))

    by_net = {}
    for i, pr in enumerate(prims):
        by_net.setdefault(pr[0], []).append(i)

    opens = []
    for net, idxs in by_net.items():
        if net == "GND":
            continue              # Planlage - check_pour() prueft das getrennt
        if net is None:
            continue              # bewusst unbelegte Pads (U1-Restpins, J5.2)
                                  # muessen nichts verbinden - dass sie auch
                                  # nichts BERUEHREN, prueft `bridged` unten
        groups = {}
        for i in idxs:
            groups.setdefault(uf.find(i), []).append(prims[i][4])
        if len(groups) > 1:
            opens.append((net, list(groups.values())))

    comps = {}
    for i, pr in enumerate(prims):
        comps.setdefault(uf.find(i), set()).add(pr[0])
    bridged = [sorted(nets) for nets in comps.values() if len(nets) > 1]

    return violations, opens, bridged


def check_pour(routed, vias):
    """Masseflaeche unten: eine Insel, und alle GND-Pads liegen darin."""
    nx = int(B.BOARD_W / POUR_GRID) + 1
    ny = int(B.BOARD_H / POUR_GRID) + 1
    cu = bytearray(nx * ny)

    m = 0.5   # Kupferrueckzug von der Platinenkante
    for gy in range(ny):
        y = gy * POUR_GRID
        if not (m <= y <= B.BOARD_H - m):
            continue
        base = gy * nx
        for gx in range(nx):
            if m <= gx * POUR_GRID <= B.BOARD_W - m:
                cu[base + gx] = 1

    def clear(cx, cy, r):
        r2 = r * r
        for gy in range(max(0, int((cy - r) / POUR_GRID)),
                        min(ny, int((cy + r) / POUR_GRID) + 2)):
            base = gy * nx
            dy = gy * POUR_GRID - cy
            for gx in range(max(0, int((cx - r) / POUR_GRID)),
                            min(nx, int((cx + r) / POUR_GRID) + 2)):
                dx = gx * POUR_GRID - cx
                if dx * dx + dy * dy <= r2:
                    cu[base + gx] = 0

    def clear_seg(x1, y1, x2, y2, r):
        n = max(2, int(math.hypot(x2 - x1, y2 - y1) / (POUR_GRID / 2)) + 1)
        for i in range(n + 1):
            t = i / n
            clear(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r)

    for ref, idx, p, net in B.all_pads():
        if net == "GND":
            continue
        clear(p["x"], p["y"], p["copper"] / 2 + B.MIN_CLEARANCE)
    for hx, hy in B.mount_holes():
        clear(hx, hy, B.MOUNT_HOLE_D / 2 + B.MIN_CLEARANCE)
    for net, vx, vy in vias:
        clear(vx, vy, R.VIA_COPPER / 2 + B.MIN_CLEARANCE)
    for net, path, width, layer in routed:
        if layer != R.BOTTOM:
            continue
        for i in range(len(path) - 1):
            clear_seg(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1],
                      width / 2 + B.MIN_CLEARANCE)

    gnd = [(p["x"], p["y"], f"{ref}.{idx}")
           for ref, idx, p, net in B.all_pads() if net == "GND"]

    start = int(gnd[0][1] / POUR_GRID) * nx + int(gnd[0][0] / POUR_GRID)
    if not cu[start]:
        return [f"{gnd[0][2]} liegt nicht auf der Masseflaeche"], 0.0

    seen = bytearray(nx * ny)
    seen[start] = 1
    stack = [start]
    count = 0
    while stack:
        c = stack.pop()
        count += 1
        cy_, cx_ = divmod(c, nx)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                ax, ay = cx_ + dx, cy_ + dy
                if 0 <= ax < nx and 0 <= ay < ny:
                    k = ay * nx + ax
                    if cu[k] and not seen[k]:
                        seen[k] = 1
                        stack.append(k)

    problems = []
    for x, y, label in gnd[1:]:
        if not seen[int(y / POUR_GRID) * nx + int(x / POUR_GRID)]:
            problems.append(f"{label} haengt nicht an der durchgehenden "
                            f"Masseflaeche")
    total = sum(cu)
    stray = total - count
    if stray > 20:      # winzige Restinseln sind unvermeidlich und harmlos
        problems.append(f"Masseflaeche zerfaellt: {stray} von {total} Zellen "
                        f"({stray * POUR_GRID ** 2:.1f} mm2) haengen nicht an "
                        f"der Hauptinsel")
    return problems, count * POUR_GRID ** 2


if __name__ == "__main__":
    routed, vias, failed = R.route()
    ok = True

    if failed:
        ok = False
        print("ROUTING UNVOLLSTAENDIG:")
        for net, pins in failed:
            print(f"  {net}: {pins}")

    npads = sum(len(c["pads"]) for c in B.COMPONENTS.values())
    print(f"Kupfer: {len(routed)} Bahnabschnitte, {npads} Pads, "
          f"{len(vias)} Via(s)")

    violations, opens, bridged = check_copper(routed, vias)

    if violations:
        ok = False
        print(f"\n{len(violations)} ABSTANDSVERSTOSS (< {B.MIN_CLEARANCE} mm):")
        for na, la, nb, lb, d in sorted(violations, key=lambda v: v[4])[:20]:
            print(f"  {na}/{la}  <->  {nb}/{lb}   {d:+.3f} mm")
    else:
        print(f"  Abstaende:   alle >= {B.MIN_CLEARANCE} mm")

    if opens:
        ok = False
        print("\nNETZ NICHT DURCHVERBUNDEN:")
        for net, groups in opens:
            print(f"  {net}: {len(groups)} getrennte Gruppen {groups}")
    else:
        print("  Durchgang:   jedes Netz haengt zusammen")

    if bridged:
        ok = False
        print("\nKURZSCHLUSS:")
        for nets in bridged:
            print(f"  {nets}")
    else:
        print("  Kurzschluss: keiner")

    problems, area = check_pour(routed, vias)
    if problems:
        ok = False
        print("\nMASSEFLAECHE:")
        for p in problems:
            print("  -", p)
    else:
        print(f"  Masse:       eine Insel, {area:.0f} mm2, alle GND-Pads dran")

    print("\n" + ("PRUEFUNG BESTANDEN" if ok else "PRUEFUNG FEHLGESCHLAGEN"))
    raise SystemExit(0 if ok else 1)
