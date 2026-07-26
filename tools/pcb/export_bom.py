"""Export a CSV BOM from board.py component definitions.

Usage:
    python tools/pcb/export_bom.py [output_csv]

If no output path is given, the script writes to:
    tools/pcb/out/cellar-fan-01-bom.csv
"""

from __future__ import annotations

import csv
import os
import sys
from collections import defaultdict

import board as B


def _component_pitch_mm(comp: dict) -> str:
    """Infer a nominal pin pitch from the first two pads when possible."""
    pads = comp.get("pads", [])
    if len(pads) < 2:
        return ""
    dx = abs(pads[1]["x"] - pads[0]["x"])
    dy = abs(pads[1]["y"] - pads[0]["y"])
    pitch = max(dx, dy)
    if pitch == 0:
        return ""
    return f"{pitch:.2f}"


def _max_drill_mm(comp: dict) -> str:
    """Return the maximum drill diameter used by this component."""
    drills = [p.get("drill", 0.0) for p in comp.get("pads", [])]
    if not drills:
        return ""
    return f"{max(drills):.2f}"


def _nets_as_text(comp: dict) -> str:
    """Return sorted, unique net names for this component."""
    nets = sorted(set(comp.get("nets", {}).values()))
    return ", ".join(nets)


def export_bom(path: str) -> tuple[int, int]:
    """Write BOM CSV and return (line_count, unique_part_count)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)

    refs = sorted(B.COMPONENTS.keys())

    grouped: dict[str, list[str]] = defaultdict(list)
    for ref in refs:
        desc = B.COMPONENTS[ref].get("desc", "")
        grouped[desc].append(ref)

    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Ref", "Description", "PadCount", "Pitch_mm", "DrillMax_mm", "Nets"])
        for ref in refs:
            comp = B.COMPONENTS[ref]
            w.writerow([
                ref,
                comp.get("desc", ""),
                len(comp.get("pads", [])),
                _component_pitch_mm(comp),
                _max_drill_mm(comp),
                _nets_as_text(comp),
            ])

        w.writerow([])
        w.writerow(["SummaryByDescription"])
        w.writerow(["Qty", "Description", "Refs"])
        for desc in sorted(grouped):
            refs_for_desc = sorted(grouped[desc])
            w.writerow([len(refs_for_desc), desc, ", ".join(refs_for_desc)])

    return len(refs), len(grouped)


def main() -> int:
    default_out = os.path.join(os.path.dirname(__file__), "out", "cellar-fan-01-bom.csv")
    out = sys.argv[1] if len(sys.argv) > 1 else default_out
    out = os.path.abspath(out)

    lines, unique_parts = export_bom(out)
    print(f"Wrote BOM: {out}")
    print(f"Components: {lines}, unique descriptions: {unique_parts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
