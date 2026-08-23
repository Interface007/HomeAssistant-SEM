# Tooling

Scripts in `tools/`. None of them are part of the Home Assistant runtime.

## Entity maintenance

### [`export_entities.py`](../tools/export_entities.py)

Renders [`status/entities-template.txt`](../status/entities-template.txt)
against the running instance and writes `status/entities.csv`:

```
entity_id;name;area;device;state;unit
```

The output is gitignored — it contains device and person metadata. Use it
to check naming after adopting new hardware, and to find entities that
still carry their vendor-derived name.

### [`rename_entities.py`](../tools/rename_entities.py)

Applies [`renames.csv`](../tools/renames.csv) to the entity registry:

```
sensor.sonoff_th_04_temperature;sensor.storage_room_temperature
```

Run this after adopting a device, before anything starts depending on it.
See [conventions.md](conventions.md#entity-naming).

## PCB design chain

`tools/pcb/` generates the carrier board for the ventilation controllers
without an EDA tool. Everything derives from one source of truth.

| Script | Role |
| --- | --- |
| [`board.py`](../tools/pcb/board.py) | geometry and netlist — the only file to edit |
| [`router.py`](../tools/pcb/router.py) | grid router, Dijkstra on 0.25 mm, two layers with vias |
| [`verify.py`](../tools/pcb/verify.py) | electrical check — clearances, continuity, shorts, ground plane |
| [`preview.py`](../tools/pcb/preview.py) | geometry check and SVG view |
| [`gerber.py`](../tools/pcb/gerber.py) | RS-274X and Excellon output |
| [`check_gerber.py`](../tools/pcb/check_gerber.py) | reads the Gerbers back and checks them |
| [`font.py`](../tools/pcb/font.py) | stroke font — Gerber has no text primitive |
| [`export_bom.py`](../tools/pcb/export_bom.py) | CSV bill of materials |

```bash
cd tools/pcb
python preview.py out/preview.svg     # placement
python verify.py                      # electrical check
python gerber.py out                  # manufacturing data
python check_gerber.py out out/preview.svg
```

`out/` is gitignored — everything in it is reproducible from the sources.

### Why the checks exist

There is no DRC engine here, so each check earns its place by having caught
a real defect:

- overlapping component bodies
- **screw heads under terminal housings** — pad clearance was fine, the M3
  washer was not
- a track passing a pad at 0.245 mm instead of 0.250 — the router only
  tested grid cells, while the diagonal between two cells passes closer
  than either endpoint
- **a connector with no cable route to any board edge** — J3 sat enclosed
  by neighbours

`verify.py` works geometrically rather than by rasterising, so there are no
rounding artefacts. `check_gerber.py` parses the generated files instead of
trusting the writer.

## 3D printing

[`oled_bezel.py`](../tools/3dp/oled_bezel.py) builds a bezel for 0.96″ OLED
modules and writes a binary STL plus an SVG preview.

```bash
python tools/3dp/oled_bezel.py out
```

The module dimensions sit in the `MODULE` dict at the top — the only place
to change for a different display. The mesh is one closed ring of annuli;
the script verifies that every directed edge occurs exactly once, that the
volume is positive, and that it matches an independently computed analytic
value before writing the file.
