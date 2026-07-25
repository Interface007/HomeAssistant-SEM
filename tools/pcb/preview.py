"""
Sichtpruefung und geometrische Plausibilitaetspruefung der Board-Definition.

    python tools/pcb/preview.py [ausgabe.svg]

Prueft: Bauteile ausserhalb der Platine, ueberlappende Bauteilbereiche,
Pads zu nah an Befestigungsloechern, Pad-Abstand zwischen verschiedenen Netzen.
Erzeugt danach eine SVG-Ansicht von oben.
"""
import sys

import board as B

SCALE = 8.0        # px pro mm
MARGIN = 30.0      # px

_cache = None


def _routes():
    """Routing-Ergebnis, einmal berechnet."""
    global _cache
    if _cache is None:
        import router
        _cache = router.route()
    return _cache


def _rects_overlap(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah


def check():
    problems = []

    for ref, comp in B.COMPONENTS.items():
        for idx, p in enumerate(comp["pads"]):
            r = p["copper"] / 2
            if not (r < p["x"] < B.BOARD_W - r and r < p["y"] < B.BOARD_H - r):
                problems.append(f"{ref}.{idx} liegt ausserhalb der Platine "
                                f"({p['x']:.2f}, {p['y']:.2f})")
        ko = comp.get("keepout")
        if ko and not (ko[0] >= 0 and ko[1] >= 0
                       and ko[0] + ko[2] <= B.BOARD_W
                       and ko[1] + ko[3] <= B.BOARD_H):
            problems.append(f"{ref} Bauteilbereich ragt ueber den Rand")

    refs = sorted(B.COMPONENTS)
    for i, a in enumerate(refs):
        for b in refs[i + 1:]:
            ka, kb = B.COMPONENTS[a].get("keepout"), B.COMPONENTS[b].get("keepout")
            if ka and kb and _rects_overlap(ka, kb):
                problems.append(f"{a} und {b} ueberlappen sich mechanisch")

    wr = B.MOUNT_WASHER_D / 2
    for hx, hy in B.mount_holes():
        washer = (hx - wr, hy - wr, B.MOUNT_WASHER_D, B.MOUNT_WASHER_D)
        for ref, comp in B.COMPONENTS.items():
            ko = comp.get("keepout")
            if ko and _rects_overlap(ko, washer):
                problems.append(f"{ref} steht im Schraubenkopf-Bereich des "
                                f"M3-Lochs bei ({hx:.1f}, {hy:.1f})")

    for hx, hy in B.mount_holes():
        for ref, idx, p, _ in B.all_pads():
            d = ((p["x"] - hx) ** 2 + (p["y"] - hy) ** 2) ** 0.5
            need = B.MOUNT_HOLE_D / 2 + p["copper"] / 2 + 1.0
            if d < need:
                problems.append(f"{ref}.{idx} zu nah an M3-Loch "
                                f"({d:.2f} < {need:.2f} mm)")

    pads = list(B.all_pads())
    for i, (ra, ia, pa, na) in enumerate(pads):
        for rb, ib, pb, nb in pads[i + 1:]:
            if na is not None and na == nb:
                continue
            d = ((pa["x"] - pb["x"]) ** 2 + (pa["y"] - pb["y"]) ** 2) ** 0.5
            gap = d - pa["copper"] / 2 - pb["copper"] / 2
            if gap < B.MIN_CLEARANCE:
                problems.append(f"{ra}.{ia} / {rb}.{ib} Kupferabstand "
                                f"{gap:.3f} mm < {B.MIN_CLEARANCE}")
    return problems


def _y(v):
    return MARGIN + (B.BOARD_H - v) * SCALE


def _x(v):
    return MARGIN + v * SCALE


def svg():
    w = B.BOARD_W * SCALE + 2 * MARGIN
    h = B.BOARD_H * SCALE + 2 * MARGIN
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" '
         f'height="{h:.0f}" viewBox="0 0 {w:.0f} {h:.0f}">',
         '<rect width="100%" height="100%" fill="#f7f6f2"/>',
         f'<rect x="{_x(0):.1f}" y="{_y(B.BOARD_H):.1f}" '
         f'width="{B.BOARD_W * SCALE:.1f}" height="{B.BOARD_H * SCALE:.1f}" '
         f'rx="{B.BOARD_CORNER_R * SCALE:.1f}" fill="#1f6b3a" stroke="#0d3a1f"/>']

    for ref, comp in B.COMPONENTS.items():
        ko = comp.get("keepout")
        if ko:
            o.append(f'<rect x="{_x(ko[0]):.1f}" y="{_y(ko[1] + ko[3]):.1f}" '
                     f'width="{ko[2] * SCALE:.1f}" height="{ko[3] * SCALE:.1f}" '
                     f'fill="none" stroke="#e8e4d8" stroke-width="0.8" '
                     f'stroke-dasharray="3 2" opacity="0.75"/>')

    routed, failed = _routes()
    for net, path, width in routed:
        col = "#ffd24a" if net in B.POWER_NETS else "#d8b25a"
        pts = " ".join(f"{_x(x):.1f},{_y(y):.1f}" for x, y in path)
        o.append(f'<polyline points="{pts}" fill="none" stroke="{col}" '
                 f'stroke-width="{width * SCALE:.1f}" stroke-linecap="round" '
                 f'stroke-linejoin="round"/>')

    # Nicht geroutete Verbindungen bleiben als rote Luftlinie sichtbar.
    nets = B.netlist()
    for net, pins in failed:
        _, _, ax, ay = nets[net][0]
        for gx, gy in pins:
            bx, by = gx * 0.25, gy * 0.25
            o.append(f'<line x1="{_x(ax):.1f}" y1="{_y(ay):.1f}" '
                     f'x2="{_x(bx):.1f}" y2="{_y(by):.1f}" stroke="#ff3b30" '
                     f'stroke-width="1.5" stroke-dasharray="4 3"/>')

    for hx, hy in B.mount_holes():
        o.append(f'<circle cx="{_x(hx):.1f}" cy="{_y(hy):.1f}" '
                 f'r="{B.MOUNT_HOLE_D / 2 * SCALE:.1f}" fill="#f7f6f2" '
                 f'stroke="#0d3a1f"/>')

    for ref, idx, p, net in B.all_pads():
        o.append(f'<circle cx="{_x(p["x"]):.1f}" cy="{_y(p["y"]):.1f}" '
                 f'r="{p["copper"] / 2 * SCALE:.1f}" fill="#d8b25a"/>')
        o.append(f'<circle cx="{_x(p["x"]):.1f}" cy="{_y(p["y"]):.1f}" '
                 f'r="{p["drill"] / 2 * SCALE:.1f}" fill="#f7f6f2"/>')
        if p.get("ref"):
            o.append(f'<text x="{_x(p["x"]) - 4:.1f}" y="{_y(p["y"]) + 2.5:.1f}" '
                     f'font-family="monospace" font-size="7" fill="#eaf5ea" '
                     f'text-anchor="end">{p["ref"]}</text>')

    for ref, comp in B.COMPONENTS.items():
        for sx, sy, text, size, anchor in comp.get("silk", []):
            o.append(f'<text x="{_x(sx):.1f}" y="{_y(sy):.1f}" '
                     f'font-family="sans-serif" font-size="{size * SCALE * 0.7:.1f}" '
                     f'fill="#ffffff" text-anchor="{anchor}">{text}</text>')

    o.append('</svg>')
    return "\n".join(o)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "board-preview.svg"
    problems = check()
    if problems:
        print(f"{len(problems)} Problem(e):")
        for p in problems:
            print("  -", p)
    else:
        print("Geometriepruefung ohne Befund.")
    with open(out, "w", encoding="utf-8") as f:
        f.write(svg())
    print("geschrieben:", out)
