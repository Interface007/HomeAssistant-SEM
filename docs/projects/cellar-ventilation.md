# Dew-point controlled cellar ventilation

Two devices — `cellar-fan-01` (storage room) and `laundry-fan-01` (laundry
room) — running the same controller on a self-designed carrier board.

## The problem

Airing a cellar in summer usually makes it wetter. Warm outside air holds
more water than cool cellar air; let it in and it condenses on the cold
walls. The decision cannot be made from relative humidity, and it cannot be
made by a human at a fixed time of day.

The correct criterion compares **water content**, not relative humidity.
Ventilating removes moisture only when the outside air holds less water per
volume than the cellar air.

## Control logic

Ventilate when **all** of these hold:

1. dew point inside − dew point outside > threshold (2.0 K on, 1.0 K off)
2. dew point outside < wall temperature − margin (2.0 K)
3. outdoor temperature > frost limit (1.0 °C)
4. room temperature > minimum (8.0 °C)
5. room humidity above the target (50 %, 3 points hysteresis)
6. all inputs valid and not older than 15 minutes

Condition 2 is the one that prevents the classic summer mistake. Even when
the outside air is drier than the room air, it must not be so humid that it
condenses on a wall that is colder than both.

Fan speed ramps linearly from 30 % at 2.0 K to 100 % at 6.0 K difference,
then gets capped by an upper limit that a Home Assistant schedule drives
for night-time quiet.

All thresholds are `number` entities, adjustable in Home Assistant without
reflashing.

## Where it runs

On the ESP, not in Home Assistant. Home Assistant supplies four raw values
(outdoor and room temperature and humidity); the dew points are computed on
the device by [`climate.h`](../../config/esphome/includes/climate.h). If
Home Assistant or Wi-Fi disappears, the imported values go stale after 15
minutes and the fan stops. A controller that keeps running on frozen data
can pump humid air into a cellar for hours.

Configuration: [`includes/dewpoint_fan.yaml`](../../config/esphome/includes/dewpoint_fan.yaml),
pulled in as a package by both device files. See
[esphome.md](../esphome.md#the-package-pattern).

## Hardware

| | |
| --- | --- |
| Controller | ESP32-S3-Zero (Waveshare / diymore clone, 18 × 23.5 mm) |
| Fan | Arctic P12 PRO PST CO, 4-pin PWM, 12 V |
| Wall sensor | DS18B20, waterproof, glued into a milled groove with thermal paste |
| Supply | 12 V / 2 A for the fan, MINI560 step-down for the ESP |
| Carrier board | self-designed, 60 × 55 mm — see [tooling.md](../tooling.md#pcb-design-chain) |

The laundry room uses **two fans**, mounted back to back in an acrylic
window panel. One blows in, one blows out, both on the same PWM. Equal
speeds mean neither over- nor under-pressure: no suction on the soil, no
cellar air pushed into the stairwell.

One fan alone would not work there. With a single opening and a sealed
door, a case fan works against a closed room — its maximum static pressure
is about 20 Pa. Measured against door-seal leakage that is roughly 10 m³/h
instead of the 60 m³/h a second opening allows, a factor of six in
dehumidification.

## Board notes

Documented here because they are easy to get wrong:

**Q1 pinout.** The 2N7000 in TO-92 is **S-G-D** (flat side towards you,
legs down). Revision A of the board is wired S-D-G — gate and drain are
swapped, and the middle and right legs must be crossed when fitting. Fixed
in revision B.

**JP1 must match the firmware.** Centre+right bridges the PWM through Q1
(open drain) and requires `inverted: true` on the `ledc` output.
Left+centre drives the GPIO directly and requires that line removed. The
wrong combination runs the fan at full speed whenever it should be off.

**Tach filter.** The tach line is a 10 kΩ pull-up sharing a cable with
25 kHz PWM. Without filtering it counted crosstalk and reported 128 000 rpm.
`internal_filter: 1ms` brought that down to 16 000 — still wrong. The fix
is **100 nF** to ground: corner at 159 Hz, which attenuates the 558 Hz
interference by 11 dB while passing the 67 Hz signal. 10 nF puts the corner
*above* the interference and does nothing.

**The 5 V pin is USB VBUS** with no diode. Do not feed the step-down and a
USB cable at the same time.

## What to expect in operation

Continuous running is normal, not a fault. Whenever outside air is drier,
every hour of ventilation removes water.

Observed in the storage room: relative humidity fell from 67.4 % to 54.2 %
in seven hours, then rose to 58.2 % in the evening. That rise was **not**
moisture returning — about 1 K of cooling at constant absolute humidity
accounts for it exactly. Judge progress by dew point, never by relative
humidity.

Equilibrium settles above the theoretical minimum because walls and floor
keep releasing moisture. With a full air exchange the storage room would
reach roughly 43 %; it sits near 58 %. The gap *is* the structural moisture
being driven out, and masonry gives it up over weeks, not hours.

In high summer the controller will refuse to ventilate, correctly: against
an outdoor dew point of 18 °C no amount of airing helps. A laundry room
that dries washing needs a dehumidifier for those weeks — one load releases
2 to 3 litres, against a ventilation capacity of about 4 l/day.

## Entities

Per device, with `room_label` substituted into the names:

| Entity | Meaning |
| --- | --- |
| `fan.*_lufter` | the fan |
| `sensor.*_regelzustand` | why the controller decided what it did |
| `sensor.*_taupunkt_*` | dew points inside and outside |
| `sensor.*_taupunktdifferenz` | the driving quantity |
| `sensor.*_soll_leistung` | commanded speed |
| `sensor.*_wand_temperatur` | measured wall temperature |
| `binary_sensor.*_luften_empfohlen` | recommendation, independent of automatic mode |
| `binary_sensor.*_messwerte_veraltet` | the stale-data failsafe has tripped |
| `number.*` | eight adjustable thresholds |
| `switch.*_automatik` | automatic or manual |
