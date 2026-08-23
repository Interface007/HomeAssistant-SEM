# Template layer

Everything derived lives in `config/templates/`, merged as a list by
`configuration.yaml`. Five files, about 1100 lines.

| File | Purpose |
| --- | --- |
| [`rooms.yaml`](../config/templates/rooms.yaml) | per-room climate block, 7 rooms |
| [`outdoor.yaml`](../config/templates/outdoor.yaml) | combined outdoor values from two sensors |
| [`windows.yaml`](../config/templates/windows.yaml) | window groups resolved from the area registry |
| [`network.yaml`](../config/templates/network.yaml) | WAN throughput, guest network share |
| [`epaper.yaml`](../config/templates/epaper.yaml) | pre-rendered strings for the ePaper display |

## Shared maths

[`custom_templates/climate.jinja`](../config/custom_templates/climate.jinja)
holds the physics. Magnus formula, parameters after Sonntag (1990), valid
roughly −45 … +60 °C:

| Macro | Returns |
| --- | --- |
| `sat_vapor_pressure(t)` | saturation vapour pressure [hPa] |
| `dew_point(t, rh)` | dew point [°C] |
| `abs_humidity(t, rh)` | absolute humidity [g/m³] |
| `wall_surface_rh(t_air, rh_air, t_wall)` | relative humidity at the wall surface [%] |
| `wall_temp_estimate(t_out, t_in, f_rsi)` | wall temperature from the DIN 4108-2 temperature factor |
| `f_rsi(room)` | per-room temperature factor |

The same formulas exist a second time in
[`esphome/includes/climate.h`](../config/esphome/includes/climate.h) for the
ventilation controllers. That duplication is deliberate and explained in
[architecture.md](architecture.md#where-the-maths-happens). **Change one,
change the other.**

## The per-room block

Each room in `rooms.yaml` produces the same six entities:

| Entity | Meaning |
| --- | --- |
| `sensor.<room>_absolute_humidity` | g/m³ — the honest measure of "how much water is in this air" |
| `sensor.<room>_dew_point` | °C |
| `sensor.<room>_wall_temperature` | measured where a sensor exists, otherwise estimated via `f_Rsi` |
| `sensor.<room>_wall_surface_humidity` | % at the coldest surface — the number mould actually responds to |
| `binary_sensor.<room>_condensation_risk` | wall temperature at or below the room dew point |
| `binary_sensor.<room>_mold_risk` | 24 h mean of surface humidity ≥ 80 % (DIN 4108-2) |
| `binary_sensor.<room>_ventilation_recommended` | airing would remove moisture |

Rooms covered: `living_room`, `bedroom`, `storage_room`, `bathroom`,
`lea_room`, `anna_room`, `laundry_room`.

To add a room: copy a block, change the entity references and the room
name, add an `f_Rsi` entry in `climate.jinja`, and add a matching
`statistics` sensor in [`sensors.yaml`](../config/sensors.yaml).

## Why relative humidity is not used for decisions

Relative humidity depends on temperature. The same air at 20.7 °C shows
58 % and at 19.7 °C shows 62 % without a single gram of water having
moved. Every decision in this repo therefore uses **absolute humidity** or
**dew point**, both of which are temperature-independent measures of water
content. Relative humidity appears only where a human reads it.

The mould criterion is the exception, and correctly so: mould responds to
the humidity *at the wall surface*, which is a relative quantity by
definition. That is what `wall_surface_rh` computes, and why it needs the
wall temperature rather than the room temperature.

## Wall temperature: measured versus estimated

Two rooms measure it with a DS18B20 glued into the masonry:

| Room | Source |
| --- | --- |
| `living_room` | `temp-sensor-wall-01` |
| `storage_room` | `cellar-fan-01` |

The rest estimate it from the DIN 4108-2 temperature factor
`f_Rsi = (T_wall − T_out) / (T_in − T_out)`. The values in `climate.jinja`
are **placeholders**. To calibrate: on a winter night with at least 10 K
difference, measure the coldest wall spot with an IR thermometer and
compute the factor. `sensor.living_room_f_rsi_live` shows the measured
reference for a room that has a real sensor.

The estimate is weakest for cellars: the formula works against *outside
air temperature*, while cellar walls border soil. That is why
`storage_room` was switched to a real measurement and why no `f_Rsi Live`
diagnostic exists for it — the value would not be interpretable.

## 24-hour statistics

[`sensors.yaml`](../config/sensors.yaml) defines a `statistics` sensor per
room computing the 24 h mean of surface humidity. `mold_risk` uses the mean,
not the instantaneous value: mould needs sustained humidity, and a shower
spike should not raise an alarm.
