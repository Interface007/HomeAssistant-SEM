"""
Gitter-Router fuer die Trageplatine.

Untere Lage ist grundsaetzlich Masseflaeche - GND wird daher nicht geroutet,
alle GND-Pads haengen als Durchkontaktierung automatisch am Kupfer. Signale
laufen bevorzugt oben, duerfen aber ueber ein Via nach unten wechseln; die
Masseflaeche wird um solche Bahnen herum freigestellt (siehe gerber.py).

Dijkstra auf einem 0.25-mm-Raster mit 8 Nachbarn und Knickstrafe. Hindernisse
sind fremde Pads, Befestigungsloecher, der Platinenrand und bereits verlegte
Bahnen - jeweils aufgeblasen um halbe Bahnbreite plus Mindestabstand. Findet
der Router keinen Weg, meldet er das statt stillschweigend zu pfuschen.

    python tools/pcb/router.py
"""
import heapq
import itertools
import math

import board as B

GRID = 0.25
BEND_PENALTY = 0.6
EDGE_KEEPOUT = 0.5      # Kupferabstand zur Platinenkante

# Der Router prueft nur Rasterzellen, die Bahn zwischen zwei Zellen ist
# aber eine durchgehende Diagonale und kann naeher an einem Hindernis
# vorbeilaufen als beide Endpunkte. Halbe Rasterdiagonale als Zuschlag auf
# jeden Hindernisradius deckt diesen Fall ab.
SAFETY = GRID * math.sqrt(2) / 2

VIA_DRILL = 0.4
VIA_COPPER = 0.8
VIA_COST = 10.0         # Rastereinheiten - haelt die Zahl der Vias klein
TOP, BOTTOM = 0, 1

NX = int(B.BOARD_W / GRID) + 1
NY = int(B.BOARD_H / GRID) + 1

DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1),
        (1, 1), (1, -1), (-1, 1), (-1, -1)]


def to_grid(x, y):
    return int(round(x / GRID)), int(round(y / GRID))


def to_mm(gx, gy):
    return gx * GRID, gy * GRID


def _disc(blocked, cx, cy, r):
    gx0, gy0 = to_grid(cx - r, cy - r)
    gx1, gy1 = to_grid(cx + r, cy + r)
    r2 = r * r
    for gy in range(max(0, gy0), min(NY, gy1 + 1)):
        for gx in range(max(0, gx0), min(NX, gx1 + 1)):
            x, y = to_mm(gx, gy)
            if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                blocked.add((gx, gy))


def _segment(blocked, x1, y1, x2, y2, r):
    n = max(2, int(math.hypot(x2 - x1, y2 - y1) / (GRID / 2)) + 1)
    for i in range(n + 1):
        t = i / n
        _disc(blocked, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r)


def build_obstacles(net, width, routed, vias):
    """(blocked_top, blocked_bottom, blocked_via) fuer das Routen von `net`.
    blocked_via gilt fuer Zellen, in denen kein Via sitzen darf - ein Via ist
    breiter als die Bahn und braucht daher mehr Platz."""
    half = width / 2
    vhalf = VIA_COPPER / 2
    top, bot, via = set(), set(), set()

    for sink, h in ((top, half), (bot, half), (via, vhalf)):
        m = EDGE_KEEPOUT + h + SAFETY
        for gx in range(NX):
            for gy in range(NY):
                x, y = to_mm(gx, gy)
                if not (m <= x <= B.BOARD_W - m and m <= y <= B.BOARD_H - m):
                    sink.add((gx, gy))

    # Bohrungen und fremde Pads sind Durchkontaktierungen: beide Lagen.
    for hx, hy in B.mount_holes():
        for sink, h in ((top, half), (bot, half), (via, vhalf)):
            _disc(sink, hx, hy, B.MOUNT_HOLE_D / 2 + B.MIN_CLEARANCE + h + SAFETY)

    for ref, idx, p, pnet in B.all_pads():
        if pnet == net:
            continue
        for sink, h in ((top, half), (bot, half), (via, vhalf)):
            _disc(sink, p["x"], p["y"],
                  p["copper"] / 2 + B.MIN_CLEARANCE + h + SAFETY)

    for rnet, path, rw, layer in routed:
        if rnet == net:
            continue
        sinks = [(bot if layer == BOTTOM else top, half), (via, vhalf)]
        for sink, h in sinks:
            r = rw / 2 + B.MIN_CLEARANCE + h + SAFETY
            for i in range(len(path) - 1):
                _segment(sink, path[i][0], path[i][1],
                         path[i + 1][0], path[i + 1][1], r)

    for vnet, vx, vy in vias:
        if vnet == net:
            continue
        for sink, h in ((top, half), (bot, half), (via, vhalf)):
            _disc(sink, vx, vy, VIA_COPPER / 2 + B.MIN_CLEARANCE + h + SAFETY)

    return top, bot, via


def dijkstra(blocked, sources, targets):
    """Kuerzester Weg im Zustandsraum (Zelle, Lage, Richtung).
    `blocked` ist (top, bottom, via); Quellen und Ziele sind Zellen und
    gelten auf beiden Lagen, weil Pads durchkontaktiert sind."""
    btop, bbot, bvia = blocked
    per_layer = (btop, bbot)
    tset = set(targets)
    dist, prev, pq = {}, {}, []
    tie = itertools.count()   # verhindert Vergleich von `direction` im Heap

    for cell, layer in sources:
        if cell in per_layer[layer]:
            continue
        st = (cell, layer, None)
        if st in dist:
            continue
        dist[st] = 0.0
        heapq.heappush(pq, (0.0, next(tie), cell, layer, None))

    while pq:
        d, _, cell, layer, direction = heapq.heappop(pq)
        if d > dist.get((cell, layer, direction), float("inf")):
            continue
        if cell in tset:
            path = [(cell, layer)]
            k = (cell, layer, direction)
            while k in prev:
                k = prev[k]
                path.append((k[0], k[1]))
            return list(reversed(path))

        gx, gy = cell
        for dx, dy in DIRS:
            nb = (gx + dx, gy + dy)
            if not (0 <= nb[0] < NX and 0 <= nb[1] < NY):
                continue
            if nb in per_layer[layer] and nb not in tset:
                continue
            step = math.hypot(dx, dy)
            if direction is not None and (dx, dy) != direction:
                step += BEND_PENALTY
            key = (nb, layer, (dx, dy))
            nd = d + step
            if nd < dist.get(key, float("inf")):
                dist[key] = nd
                prev[key] = (cell, layer, direction)
                heapq.heappush(pq, (nd, next(tie), nb, layer, (dx, dy)))

        # Lagenwechsel per Via
        other = BOTTOM if layer == TOP else TOP
        if cell not in bvia and cell not in per_layer[other]:
            key = (cell, other, None)
            nd = d + VIA_COST
            if nd < dist.get(key, float("inf")):
                dist[key] = nd
                prev[key] = (cell, layer, direction)
                heapq.heappush(pq, (nd, next(tie), cell, other, None))
    return None


def simplify(cells):
    """Kollineare Rasterpunkte zusammenfassen, Ergebnis in mm."""
    if len(cells) < 2:
        return [to_mm(*c) for c in cells]
    out = [cells[0]]
    for i in range(1, len(cells) - 1):
        ax, ay = cells[i - 1]
        bx, by = cells[i]
        cx, cy = cells[i + 1]
        if (bx - ax, by - ay) != (cx - bx, cy - by):
            out.append(cells[i])
    out.append(cells[-1])
    return [to_mm(*c) for c in out]


def default_order(nets):
    """Versorgungsnetze zuerst: sie sind breit, vielpolig und brauchen
    durchgehende Schienen. Danach die Signale, kurze vor langen - so
    weichen die langen Signale aus und nicht umgekehrt."""
    def spread(n):
        xs = [x for _, _, x, _ in nets[n]]
        ys = [y for _, _, _, y in nets[n]]
        return (max(xs) - min(xs)) + (max(ys) - min(ys))

    power = sorted((n for n in nets if n in B.POWER_NETS and n != "GND"),
                   key=lambda n: -B.NET_WIDTH.get(n, B.DEFAULT_NET_WIDTH))
    signal = sorted((n for n in nets if n not in B.POWER_NETS), key=spread)
    return power + signal


def route(max_passes=8, verbose=False):
    """Routet alles; scheitert ein Netz, kommt es im naechsten Durchlauf
    zuerst dran (Rip-up-and-retry). Gibt den besten Versuch zurueck."""
    nets = B.netlist()
    order = default_order(nets)
    best = None
    for p in range(max_passes):
        routed, vias, failed = route_once(order)
        if not failed:
            return routed, vias, failed
        if best is None or len(failed) < len(best[2]):
            best = (routed, vias, failed)
        if verbose:
            print(f"  Durchlauf {p + 1}: {len(failed)} offen "
                  f"({', '.join(n for n, _ in failed)})")
        head = [n for n, _ in failed]
        new_order = head + [n for n in order if n not in head]
        if new_order == order:
            break
        order = new_order
    return best


def route_once(order):
    """Ein Routing-Durchlauf in der gegebenen Netzreihenfolge.
    Rueckgabe: ([(net, path, width, layer), ...], [(net, x, y) vias], failed)"""
    nets = B.netlist()
    routed, vias, failed = [], [], []

    for net in order:
        width = B.NET_WIDTH.get(net, B.DEFAULT_NET_WIDTH)
        pins = [to_grid(x, y) for _, _, x, y in nets[net]]
        connected = {pins[0]}
        for _ in range(len(pins) - 1):
            remaining = [p for p in pins if p not in connected]
            if not remaining:
                break
            blocked = build_obstacles(net, width, routed, vias)

            # Startpunkte: eigene Pads gelten auf beiden Lagen (durch-
            # kontaktiert), bereits verlegte Bahnen nur auf ihrer Lage.
            sources = [(c, L) for c in connected for L in (TOP, BOTTOM)]
            for rnet, path, _w, layer in routed:
                if rnet != net:
                    continue
                for i in range(len(path) - 1):
                    sources += [(c, layer)
                                for c in _cells_on(path[i], path[i + 1])]

            cells = dijkstra(blocked, sources, remaining)
            if cells is None:
                failed.append((net, remaining))
                break

            # Pfad in Abschnitte je Lage zerlegen, Lagenwechsel = Via
            run = [cells[0][0]]
            layer = cells[0][1]
            for cell, L in cells[1:]:
                if L != layer:
                    if len(run) > 1:
                        routed.append((net, simplify(run), width, layer))
                    vias.append((net,) + to_mm(*cell))
                    run = [cell]
                    layer = L
                else:
                    run.append(cell)
            if len(run) > 1:
                routed.append((net, simplify(run), width, layer))
            connected.add(cells[-1][0])
    return routed, vias, failed


def _cells_on(a, b):
    x1, y1 = to_grid(*a)
    x2, y2 = to_grid(*b)
    n = max(abs(x2 - x1), abs(y2 - y1))
    if n == 0:
        return {(x1, y1)}
    return {(round(x1 + (x2 - x1) * i / n), round(y1 + (y2 - y1) * i / n))
            for i in range(n + 1)}


if __name__ == "__main__":
    routed, vias, failed = route(verbose=True)
    total = 0.0
    for net, path, w, layer in routed:
        length = sum(math.dist(path[i], path[i + 1])
                     for i in range(len(path) - 1))
        total += length
        side = "oben " if layer == TOP else "unten"
        print(f"{net:10s} {side}  {w:.2f} mm breit  {length:6.1f} mm  "
              f"{len(path):2d} Punkte")
    print(f"\n{len(routed)} Abschnitte, {total:.1f} mm Kupfer, "
          f"{len(vias)} Via(s)")
    for net, vx, vy in vias:
        print(f"  Via {net} bei ({vx:.2f}, {vy:.2f})")
    if failed:
        print("\nNICHT GEROUTET:")
        for net, pins in failed:
            print(f"  {net}: {pins}")
    else:
        print("Alle Netze ausser GND geroutet (GND liegt auf der Masseflaeche).")
