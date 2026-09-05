# Raised-bed irrigation, garden

Design document for `irrigation-garden-01` — a self-contained ESPHome
controller that keeps a 1 m² strawberry bed evenly moist from a manually
refilled 20 l canister.

Status: **design, not built.** Every number below is a starting value, to be
replaced by a measured one after the calibration week (see
[Commissioning](#commissioning)).

## The problem

The bed is planting soil over a clay-pebble drainage layer, wrapped in a
rigid dimpled membrane that deliberately lets water escape at the sides.
That construction cannot be watered like a pot. It has two properties that
decide the whole design:

**The infiltration rate is the limit, not the volume.** Soil takes up water
at a finite rate. Deliver 4 l in one go and most of it runs sideways
through the membrane and downwards through the pebbles before the substrate
can absorb it. The plants see a fraction of what was pumped, and the sensor
sees a spike that decays within the hour.

**Water that reaches the drainage layer is lost.** There is no reservoir
underneath — the pebbles drain. Anything measured at the bottom of the root
zone is water on its way out.

Both point to the same answer: **short pulses with a swelling pause**,
dosed by time, verified by two sensors at different depths.

Strawberries add one constraint of their own: fruit and leaves must stay
dry. Botrytis (grey mould) needs leaf wetness to establish, and a wet berry
in warm air is the textbook case. Water goes onto the soil at root level,
never over the plant, and in the early morning so that any splash dries
within the hour.

## Control logic

Pump one pulse when **all** of these hold:

1. shallow soil moisture below the on-threshold (hysteresis to the off-threshold)
2. canister float switch not in the empty position
3. outdoor temperature > 3 °C
4. inside the time window (05:00–08:00, optional second window 19:00–20:00)
5. at least 20 min since the end of the last pulse
6. daily pulse budget not exhausted
7. no leak reported by the shed water sensor
8. both soil sensors valid and reading a physically possible value

A pulse is **1.0 litre, measured**, with 30 s of pump time as the backstop —
whichever ends first. Then 20 min of nothing, then measure again. If the
shallow sensor is still below the threshold, pulse again — up to the daily
budget.

Dosing by volume rather than by time is what the flow sensor buys. Pump
delivery is not a constant: it falls as the canister empties and the
suction head grows, it falls again when the filter starts to load, and it
depends on how the six outlet tubes happen to lie. A timed pulse silently
delivers less water every day the filter ages. A metered pulse delivers a
litre or reports that it could not.

### The deep sensor is the runoff detector

The two soil sensors are not redundancy. The shallow one (10 cm) sits in
the root zone and drives the decision. The deep one (20 cm, just above the
pebbles) answers a different question: *did this pulse stay where it was
wanted?*

A pulse that raises the shallow reading and leaves the deep one flat was
absorbed. A pulse that moves the deep sensor sharply within a few minutes
went past the roots into the drainage. That is a reason to shorten the
pulse, not to add another one — so a sharp deep-sensor rise suppresses the
next pulse and is worth an alert. It is also the cheapest way to notice
that the substrate has gone hydrophobic after a dry spell, which shows up
as *both* sensors moving at once.

### Dosing arithmetic

| | |
| --- | --- |
| Bed area | ~1 m² |
| Peak demand, hot summer day | 3–6 l/day, i.e. 3–6 mm |
| Pump delivery, free flow (data sheet) | 4.3 l/min |
| Pulse | 1.0 l ≈ 1 mm, about 15 s |
| Time backstop per pulse | 30 s |
| Daily budget | 6 pulses = 6 l |
| Canister endurance at full budget | ~3.3 days |

Six pulses at the budget limit is the worst case, not the expectation. A
20 l canister will realistically last four to six days. If that rhythm
turns out to be annoying, the same hardware drives a 60–100 l barrel
unchanged — only the level sensing changes.

## Where it runs

On the ESP, not in Home Assistant. Same reasoning as the cellar ventilation
([cellar-ventilation.md](cellar-ventilation.md#where-it-runs)): a controller
that keeps acting on frozen data is worse than one that stops. Here the
failure is more expensive than a fan running at the wrong time — a pump that
is commanded on and never commanded off empties the canister into the shed.

Home Assistant supplies two values and receives everything else:

| Direction | What |
| --- | --- |
| HA → device | outdoor temperature (frost lockout), leak-sensor state (hard block) |
| device → HA | both soil readings, pulse counter, litres consumed, canister state, all thresholds as `number` entities |

Both imported values go stale after 15 min. A stale value disables the
check it feeds — no frost lockout without a fresh temperature, no leak
block without a fresh leak state — but it does not stop watering. The
protections that matter against a flooded shed are all local: the per-pulse
volume, the 30 s cap, the daily budget and the flow plausibility check that
catches a burst hose faster than a floor sensor can. The Home Assistant
leak sensor is the backstop behind those, and a backstop that is only as
good as the Wi-Fi link is still worth having.

If Wi-Fi is gone entirely, the device therefore keeps watering on soil
moisture alone within its time window and budget. That is deliberate — the
soil sensors, the budget and the maximum runtime are all local. A week
without Home Assistant should not kill the strawberries.

## Hardware

| Part | Choice |
| --- | --- |
| Controller | ESP32-S3-Zero, the module the ventilation controllers use |
| Pump | Seaflo 12 V self-priming diaphragm pump, 4.3 l/min, 2.4 bar |
| Soil moisture | 2 × DFRobot SEN0193 capacitive probe |
| Flow | Seeed YF-S402 Hall flow sensor, 0.36–6 l/min |
| Level | reed float switch, side mount |
| Switching | IRLZ34N logic-level MOSFET + 1N5822 Schottky flyback diode |
| Supply | 12 V / 5 A PSU + MINI560 step-down for the ESP |
| Enclosure | IP65 box, M16 cable glands |
| Water path | suction strainer, check valve, inline filter, 4/6 mm tube, six-way manifold |

Prices and availability: [Bill of materials](#bill-of-materials).

### Why the S3-Zero and not the ESP32 D1 Mini

The first draft of this document specified the ESP32 D1 Mini, on the grounds
that `temp-sensor-wall-01` already runs one. The carrier board changed that.

A PCB needs a footprint, and a footprint needs verified dimensions. The
S3-Zero footprint has been built twice and measured once — it is in
[`tools/pcb/board_cellar_fan.py`](../../tools/pcb/board_cellar_fan.py),
whose header records exactly which dimension was an assumption and why.
Deriving a new footprint from a data sheet for a module nobody in this
house has put a caliper on is how a board comes back from the fab
unusable. The module also happens to cost less, is stocked, and means the
irrigation controller and the two ventilation controllers share a spare.

The cost is one pin. GP3 is a strapping pin and stays unused, which leaves
five usable pads on the module's left row for six signals. The float
switch — a slow digital input, the least sensitive of the six — moves to
GP7 on the right row.

### Why a diaphragm pump and not a submersible

The diaphragm pump sits **dry** in the shed and sucks from the canister.
The characteristic failure of a submersible pump in a manually refilled
canister is running dry, and that destroys it in minutes. A diaphragm pump
tolerates the seconds it takes the controller to notice there is no flow.
1.5 m of head is 0.15 bar — the pump is not working hard.

### Why open outlets and not drippers

Pressure-compensating drippers need roughly 0.7–1 bar to regulate. Six
2 l/h drippers pass 12 l/h; the pump delivers 4.3 l/min, about 260 l/h.
The pump would spend the cycle short-cycling on its pressure switch to
feed a trickle, and every dripper is a clogging point fed from a canister
that will grow algae.

Six open 1/4" outlets on **equal-length** tubes from one manifold pass the
pump's full flow, dose by time instead of by pressure, and have nothing to
clog. Equal lengths matter — unequal ones give unequal flow, and on 1 m²
that is visible as a dry corner. Spread them on roughly a 30 cm grid;
lateral spread in this substrate is 15–20 cm radius, so six points cover
the bed.

The inline filter stays regardless. It protects the pump, not the outlets.

### Power

The shed has no socket of its own. The supply is the AC-out socket of the
Anker Solarbank 3 E2700 standing in it — a real backup output that powers a
load, and one that does not switch itself off below a minimum load. That
second property is what made this worth checking: such outputs commonly
drop out under a few watts, an ESP idles at about one, and the resulting
reboot loop looks like a Wi-Fi fault for a week before anyone measures it.
It is not an issue here, so the 12 V PSU hangs directly on that socket with
no buffer battery.

What remains true is that the socket follows the Solarbank. If the unit is
switched off, taken away for the winter or runs its battery flat, the
controller is dead — not degraded. That is acceptable for irrigation and it
fails in the safe direction (a dead controller cannot pump), but it means
the *absence* of watering has no local alarm. Home Assistant notices the
device going unavailable; that is the alarm.

Everything downstream of the PSU is 12 V SELV. No mains enters the wooden
shed except inside the IP65 enclosure.

### Pin plan

ESP32-S3-Zero. **ADC2 is unusable while Wi-Fi is on** — both soil sensors
must land on ADC1, which on the S3 is GPIO1–GPIO10.

| Pin | Row | Function | Note |
| --- | --- | --- | --- |
| GP1 (ADC1_CH0) | left | soil sensor A, 10 cm | |
| GP2 (ADC1_CH1) | left | soil sensor B, 20 cm | |
| GP3 | left | **unused** | strapping pin, JTAG source select |
| GP4 | left | sensor supply, high side | both sensors ~10 mA total, within the 40 mA pin limit |
| GP5 | left | pump MOSFET gate | 100 Ω series, 100 kΩ gate-to-source pulldown |
| GP6 | left | flow sensor pulse | 10k/20k divider from the 5 V sensor output |
| GP7 (ADC1_CH6) | right | float switch | internal pull-up, switch to GND, closed while water is present, 100 nF debounce |

GP7 is the pin furthest from the USB connector on the right row, so its
track leaves past the end of the module rather than crossing the other
row. GPIO0, GPIO19/20 (USB) and GPIO21 (onboard RGB LED) are unavailable
on this module for the reasons listed in
[esphome.md](../esphome.md#board-specific-notes).

### Why the flow sensor gets a divider and not a pull-up

The YF-S402 runs on 5 V, and batches differ in whether the Hall output is
driven to 5 V or open drain with an on-board pull-up to 5 V. A 10k/20k
divider produces a valid 3.3 V high level in both cases; a pull-up to 3V3
would work for one of them and put 5 V on the pin for the other. The one
case the divider does not cover is an open-drain output with no pull-up at
all — that shows up in week 2 as a sensor that never counts, and is fixed
with a pull-up to 5 V ahead of the divider.

Static IP: 192.168.2.52 — verify it is free before flashing; .41–.48, .50
and .51 are taken.

### Powering the soil sensors from a GPIO

The sensors are energised only for the ~200 ms of a measurement, then
switched off. Capacitive probes corrode where the electronics meet the
soil, and continuous excitation accelerates it; duty-cycling the supply
buys a season or two. It also removes the self-heating drift that makes a
continuously powered probe read differently at 07:00 and at 15:00.

Switching must be **high side**. Interrupting the sensor's ground moves the
analog reference and the reading becomes meaningless.

The cable joint is the part that actually fails. Seal the board where the
cable enters — heat-shrink is not enough outdoors, use epoxy or potting
compound and leave the sensing area untouched. Buried, unpotted capacitive
sensors survive about one season.

## Schematic

![Schematic](garden-irrigation-schematic.svg)

Source: [`garden-irrigation-schematic.svg`](garden-irrigation-schematic.svg).
Crossing wires are not connected — only a junction dot is a connection.

Four things in it are worth reading twice:

**The pump is switched low side.** Its positive lead goes straight to
+12 V, its negative lead to Q1's drain. Wired the other way round — MOSFET
in the positive lead — the gate would have to sit above 12 V to turn the
device on, and a 3.3 V pin cannot do that. This is the single most common
way to get a MOSFET switch wrong.

**D1 points up.** Cathode to +12 V, anode to the drain. Fitted the other
way round it is a short across the supply from the moment power is
applied, and a 5 A PSU wins that argument before anyone smells anything.

**J5/J6 pin V is not 3V3.** It is GP4, the switched sensor rail. Wiring a
probe to permanent 3V3 works perfectly and quietly destroys the duty
cycling that keeps the probe alive past one season.

**R2 is not a detail.** It holds Q1's gate low during the ~300 ms between
power-on and ESPHome configuring GP5. Until then the pin is an input and
the gate floats — and a floating logic-level gate next to a 12 V rail is
enough to turn the MOSFET partly on, which means a warm MOSFET and a
pump that hums at every reboot.

## Carrier board

Generated by the existing chain in [`tools/pcb/`](../../tools/pcb), which
now holds two boards:

| File | Board |
| --- | --- |
| [`board_cellar_fan.py`](../../tools/pcb/board_cellar_fan.py) | ventilation controller, built, `rev B` |
| [`board_irrigation.py`](../../tools/pcb/board_irrigation.py) | this one, `rev A`, not yet ordered |

[`board.py`](../../tools/pcb/board.py) became a selector, so the six tools
that all do `import board as B` did not have to change:

```bash
cd tools/pcb
PCB_BOARD=board_irrigation python preview.py out/irrigation-preview.svg
PCB_BOARD=board_irrigation python verify.py
PCB_BOARD=board_irrigation python gerber.py out/irrigation
PCB_BOARD=board_irrigation python check_gerber.py out/irrigation out/irrigation-preview.svg
PCB_BOARD=board_irrigation python export_bom.py
```

The default stays the cellar fan: a mistyped variable must not silently
regenerate manufacturing data for the board that is already in service.

Current state — 80 × 70 mm, 18 components, 56 pads, 60 drills:

```
Geometry check passed without findings.
Copper: 21 track segments, 56 pads, 0 Via(s)
  Clearance:   all >= 0.25 mm
  Continuity:  each net is fully connected
  Short:       none
  Ground:      one island, 5141 mm2, all GND pads connected
GERBER PLAUSIBLE
```

### What differs from the ventilation board

The module footprint is identical — that reuse is the whole reason for the
S3-Zero. Everything around it changed:

- **Trace width.** +12V, GND and PUMP_DRAIN are 1.5 mm, not 1.0. The
  Seaflo draws around 4 A at its pressure limit and more for the first
  milliseconds; 1.0 mm was sized for a 0.2 A case fan and would run warm
  here.
- **C1 is 1000 µF, not 100.** A diaphragm pump starts against a stalled
  rotor. Without the buffer, that dip reaches the MINI560 input and
  reboots the ESP — a failure that looks exactly like a Wi-Fi problem for
  as long as you are willing to believe it is one.
- **No solder jumper, no tach filter.** Q1 is switched on and off, never
  PWM'd, so the whole JP1/C2 complex of the other board disappears.
- **Connectors on three edges.** Eight cables leave this board: 12 V in,
  12 V out and 5 V in for the MINI560, pump, two soil probes, flow and
  float. The component field is what is left in the middle, and J8 sits
  alone on the east edge purely because GP7 is on the module's east pad
  row.

### Before ordering

The footprint carries over one unverified assumption from the ventilation
board, recorded in its header: that the diymore clone matches the
Waveshare S3-Zero drawing at 18.00 × 23.50 mm with 15.24 mm row spacing.
That held for two built boards, but the BOM above buys the **Waveshare
original** (`WS-25081`), so it is the drawing that matters and not the
clone. Put a caliper on the module before sending the Gerbers.

## Bill of materials

Prices and availability checked **2026-09-03**. The build is for next
summer, so a restock date a few weeks out is not a constraint — it is
noted only where it would surprise someone ordering today.

### Reichelt — electronics

| Article | Description | Qty | Unit | Stock |
| --- | --- | --- | --- | --- |
| `IRLZ 34N` | MOSFET N-ch 55 V 30 A, TO-220AB | 1 | 0,56 € | ab Lager |
| `1N 5822` | Schottky 40 V 3 A, DO-201AD — flyback | 1 | 0,15 € | ab Lager |
| `RAD FC 1.000/25` | Elko 1000 µF 25 V low ESR, Ø 12 mm | 1 | 0,57 € | ab Lager |
| `KERKO 100N` | Ceramic 100 nF, RM 5 | 2 | 0,04 € | ab Lager |
| `METALL 100` | 100 Ω 0207 1 % — gate series | 1 | 0,09 € | ab Lager |
| `METALL 10,0K` | 10 kΩ — flow divider, upper leg | 1 | 0,07 € | ab Lager |
| `METALL 20,0K` | 20 kΩ — flow divider, lower leg | 1 | 0,07 € | ab Lager |
| `METALL 100K` | 100 kΩ — gate pulldown | 1 | 0,07 € | ab Lager |
| `AKL 073-02` | Screw terminal 2-pol, RM 5,08 | 4 | 0,79 € | ab Lager |
| `AKL 059-03` | Screw terminal 3-pol, RM 3,5 | 3 | 0,46 € | ab Lager |
| `AKL 059-02` | Screw terminal 2-pol, RM 3,5 | 1 | 0,31 € | from 07.09.2026 |
| `BL 2X10G 2,54` | Female header 2×10, cut to 2×9 | 1 | 0,62 € | ab Lager |
| `SL 2X10G 2,54` | Male header 2×10, cut to 2×9, for the module | 1 | 0,13 € | ab Lager |
| `MW LPV-60-12` | Mean Well 12 V / 5 A, 60 W | 1 | 13,80 € | ab Lager |
| `DELOCK 60445` | Enclosure IP65, 200 × 150 × 100 mm | 1 | 16,95 € | ab Lager |
| `DELOCK 60615` | Cable gland M16 IP68, 4–8 mm, 2 pcs | 3 | 4,80 € | ab Lager |

≈ 52 €. Six glands, because six cables leave the box: mains in from the
Solarbank socket (the PSU sits inside the enclosure), pump, two soil
probes, flow, float.

`AKL 101-02` — the cheaper 5,08 terminal — is out until 16.10.2026, hence
`AKL 073-02`. It is a rising-cage type with a larger body; the footprint
pitch is the same but the keepout in the board file is sized for it.

### BerryBase — modules and sensors

| Article | Description | Qty | Unit | Stock |
| --- | --- | --- | --- | --- |
| `WS-25081` | Waveshare ESP32-S3-Zero, without headers | 1 | 6,90 € | ab Lager |
| `SEN0193` | DFRobot capacitive soil moisture probe, 3-pin analog | 2 | 5,90 € | 20 in stock |
| `SE-314150002` | Seeed YF-S402 flow sensor, G1/4, 0,36–6 l/min | 1 | 7,90 € | 10 in stock |

≈ 27 €.

The MINI560 step-down is not stocked there. There should be spares from
the ventilation boards; if not, BerryBase `REG5V3A` (6–40 V → 5 V / 3 A,
3,80 €, in stock) does the same job with a different footprint — it feeds
J2 by wire either way, so the board does not care.

### Amazon — pump and hydraulics

Availability here is volatile and the listings change identity; treat
these as "this class of part, roughly this price".

| Item | Qty | Price | Stock |
| --- | --- | --- | --- |
| LIGHTEU/Seaflo 12 V diaphragm pump, 4,3 l/min, 2,4 bar, 21S series | 1 | 27,99 € | lieferbar |
| Joycabin horizontal float switch, 5 pcs | 1 | 11,95 € | lieferbar |
| VooGenzek 4/6 mm irrigation kit, 15 m tube, T-pieces, end plugs | 1 | 10,98 € | lieferbar |

≈ 51 €. The float switch pack of five is deliberate — one goes in the
canister, the rest are the spares for the next two seasons.

### Not pinned to an article

Suction strainer, inline filter and check valve are commodity parts where
no single listing was worth citing; budget ~15 € and buy them with the
pump so the hose diameters match. Add the PCB itself, ~10 € for five
boards from the usual fab.

**Total ≈ 155 €**, against the 120 € the first draft estimated. The
difference is the bigger PSU, the enclosure and the glands — the parts
that make it survive a winter outdoors rather than the parts that make it
work.

## Failure modes and what catches them

| Failure | Detection | Reaction |
| --- | --- | --- |
| Canister empty | float switch, plus flow sensor showing no flow while pumping | stop, block further pulses, notify |
| Hose burst, fitting blown | flow far above the expected 4.3 l/min | stop immediately, block until manually released |
| Filter clogged, hose kinked | flow well below expected | finish the pulse, notify — not urgent |
| Soil sensor unplugged or shorted | reading pinned at a rail | treat as invalid, **do not water** |
| Both sensors drifting together | monthly comparison against the dry/wet calibration | recalibrate |
| Controller crash mid-pulse | pump off in `on_boot`, hard 30 s per-pulse cap in the on-device timer | pump cannot stay on |
| Water in the shed | Third Reality 3RWS18BZ leak sensor next to the Solarbank | HA blocks the pump while the link is up, push notification |
| Frost | outdoor temperature < 3 °C | no watering; drain the system before the first frost anyway |

The hard 30 s cap is the one that matters, and it is why the pump was not
chosen smaller than needed but capped in software instead. At 4.3 l/min a
single pulse can move at most ~2.2 l out of a 20 l canister — the worst
single event is a wet patch, not a flooded shed. Without the cap the same
pump empties the canister in under five minutes.

### The Solarbank underneath

Runoff from the bed already misses the Solarbank by design. What this
project adds is a pressurised hose above it. Three things address that, in
order of usefulness: keep every fitting and the canister on the side where
a spill drains away from the unit; the 30 s cap; and the leak sensor as the
backstop that also covers the failure nobody predicted.

## Commissioning

**Week 1 — measure only.** Flash the controller with sensors and no pump
output. Record both soil readings in Home Assistant through at least one
manual watering and one dry-down. This is what turns the guessed thresholds
into real ones.

Calibration per sensor, recorded as a comment in the device file:

- **dry** — sensor in air, indoors, after 10 minutes: the 0 % reference
- **wet** — sensor in a glass of water up to the marked line: the 100 % reference
- **field capacity** — the reading a few hours after a thorough watering,
  once drainage has stopped. This, not "100 %", is what the control aims at.

The on-threshold starts at roughly 60 % of the span between field capacity
and dry, and moves after the first week of real data.

**Week 2 — water path, manual.** Pump, filter, manifold, outlets. Trigger
from a Home Assistant switch and watch where the water actually goes.
Adjust outlet positions.

Then calibrate the flow sensor, which phase 3 depends on for dosing: pump
into a measuring jug, read *Bewässerung Impulse Gesamt* before and after,
and divide. The firmware carries 4380 pulses per litre as a placeholder —
a commonly quoted figure for this sensor, not one from a data sheet in
hand. The raw pulse counter exists precisely so this can be corrected
without reflashing first.

**Week 3 — automation.** The controller package with all thresholds as
`number` entities, then a week of supervised operation before trusting it
with a holiday.

## Files

Exists:

- [`config/esphome/irrigation-garden-01.yaml`](../../config/esphome/irrigation-garden-01.yaml)
  — device file, **phase 1**: sensors only, no pump control. The pump gate
  pin is declared and held low rather than left unconfigured, and the
  switch is `internal` so the pump cannot be started from a dashboard
  during the measurement weeks.
- [`garden-irrigation-schematic.svg`](garden-irrigation-schematic.svg) —
  the schematic above
- [`tools/pcb/board_irrigation.py`](../../tools/pcb/board_irrigation.py) —
  carrier board geometry and netlist, `rev A`

To be created:

- `config/esphome/includes/irrigation.yaml` — the controller as a package,
  following [the package pattern](../esphome.md#the-package-pattern)
- `config/automations/irrigation.yaml` — leak block, empty-canister and
  no-flow notifications
- a dashboard card in `config/dashboards/matzen.yaml` under *Garten*
