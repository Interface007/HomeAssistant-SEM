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

`tools/pcb/` generates carrier boards without an EDA tool. Everything
derives from one source of truth per board.

| Script | Role |
| --- | --- |
| [`board.py`](../tools/pcb/board.py) | selects which board definition `import board` resolves to |
| [`board_cellar_fan.py`](../tools/pcb/board_cellar_fan.py) | ventilation controller — geometry and netlist |
| [`board_irrigation.py`](../tools/pcb/board_irrigation.py) | irrigation controller — geometry and netlist |
| [`pinout.py`](../tools/pcb/pinout.py) | package pin order as data, plus the checks that compare a board against it |
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
python gerber.py out/cellar           # manufacturing data
python check_gerber.py out/cellar out/preview.svg
python export_bom.py                  # out/<board name>-bom.csv
```

`out/` is gitignored — everything in it is reproducible from the sources.

### Two boards, one chain

The six tools all do `import board as B`. Rather than parameterise every
one of them, `board.py` picks the definition that import resolves to, from
`PCB_BOARD`:

```bash
PCB_BOARD=board_irrigation python verify.py
PCB_BOARD=board_irrigation python gerber.py out/irrigation
```

The default is `board_cellar_fan`, deliberately: that board is built and in
service, and a mistyped variable name must not silently regenerate
manufacturing data for the wrong project. Output file names come from
`BOARD_NAME` in the board definition, so the two boards cannot overwrite
each other's Gerbers even in the same directory.

To dump a netlist, run the board definition itself — `python
board_irrigation.py` — rather than `board.py`, which is only the selector.

### Pin order as data

Revision A of the ventilation board went to the fab with Q1's gate and
drain swapped. The data sheet was not wrong; the same fact had been
written out by hand twice — once as a pad-index-to-net mapping, once as
three silkscreen letters — and nothing compared the two with each other
or with the part.

[`pinout.py`](../tools/pcb/pinout.py) holds each package's pin order once,
with its source and the date it was checked. A board file then states the
*schematic* fact and never a pad index:

```python
_q1_nets, _q1_silk = P.wire("IRLZ34N/TO-220AB", _q1_pads,
                            {"G": "Q1_GATE", "D": "PUMP_DRAIN", "S": "GND"},
                            label_y=13.0)
```

Both the netlist and the pin letters come out of that one call, so they
cannot disagree. Transposing two entries now means writing "the gate goes
to the pump", which does not survive reading the line back.

`verify.py` additionally checks what the derivation cannot: that every
part naming a transistor package declared one, that polarity markers sit
next to the right pad and outside the body, that drills fit their leads,
and that axial pitches leave room to bend them. Silkscreen labels that
overlap are reported as **warnings** — they make a board awkward to
populate rather than wrong, and the ventilation board carries two that
are not worth invalidating built hardware over.

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
- **a 1.2 mm hole for a 1.3 mm lead** — the D1 footprint on the irrigation
  board, found before it was ordered
- **a 10.16 mm lead spacing for a 9.5 mm body** — same diode: 0.33 mm per
  side to bend a lead into the hole, i.e. the part does not go in
- **a keepout narrower than the part it reserves room for** — Q1's TO-220
  is 10 mm wide, the keepout was 8.5
- **a polarity marker printed underneath the capacitor it describes** —
  visible on the bare board, gone as soon as it is populated

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
