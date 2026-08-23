# Conventions

## Entity naming

Every entity that anything else depends on is renamed to:

```
<domain>.<area>_<measurement>
```

Examples: `sensor.storage_room_temperature`,
`binary_sensor.living_room_ventilation_recommended`,
`sensor.outdoor_dew_point`.

The renames are recorded in [`tools/renames.csv`](../tools/renames.csv) and
applied with [`tools/rename_entities.py`](../tools/rename_entities.py):

```
sensor.sonoff_th_04_temperature;sensor.storage_room_temperature
```

Why this matters is explained in [architecture.md](architecture.md#naming-as-an-interface):
the area name, not the hardware, is the stable identifier. Diagnostic
entities (link quality, battery, uptime, firmware) keep their device-derived
names — nothing depends on them.

Template sensors pin their own IDs with `default_entity_id:` so that a
rename in the UI cannot silently break a dependent template.

## Device naming

`<vendor>_<type>_<nn>`, zero-padded, counting up per type:
`sonoff_th_04`, `shelly_dw_05`, `thirdreality_waterleak_02`,
`tadotrv07`.

Self-built ESPHome devices use `<function>-<location>-<nn>`:
`cellar-fan-01`, `presence-livingroom-01`, `ble-proxy-upstairs-01`.

## Areas

17 areas. They are the anchor for the naming scheme above and for the
dynamic member lookups in
[`windows.yaml`](../config/templates/windows.yaml), which resolves group
membership from the area registry rather than from a hand-maintained list.

Not all of them are rooms, and the difference matters when reading a
climate value: only heated indoor rooms have a meaningful dew point
comparison, and only rooms with an outside wall have a condensation risk.

| Kind | Areas |
| --- | --- |
| Living rooms | `living_room`, `bedroom`, `anna_room`, `lea_room` |
| Utility rooms | `kitchen`, `bathroom`, `toilet`, `laundry_room`, `storage_room`, `boiler_room`, `workshop` |
| Circulation | `staircase_ground_floor`, `staircase_basement` |
| Unheated | `attic` |
| Outdoor | `terrace`, `garden_north` |
| Not a place | `virtual` |

`virtual` holds entities that belong to no physical location — router,
internet connection, solar aggregate. `boiler_room` is the technical room
and carries the network and NAS hardware rather than climate sensors.

Roughly half of all entities carry no area at all: integrations, add-ons,
Home Assistant internals and companion apps. Area assignment is
deliberate, not exhaustive — an entity gets an area when its location
means something.

## Language

Defined in [`CLAUDE.md`](../CLAUDE.md) and
[`.github/copilot-instructions.md`](../.github/copilot-instructions.md), and
it is strict:

| Content | Language |
| --- | --- |
| Code, comments, docstrings, commit messages | **English, without exception** |
| Documentation in `docs/` | English |
| Entity names, dashboard labels, UI strings | German — do not translate |
| Automation `alias:` and `description:` | English |

The split exists because the interface is used in German while the code is
maintained in English. When touching a file that still contains non-English
comments, translate the comments you touched.

A quick check before committing:

```bash
grep -rnE "^\s*(#|//).*[äöüßÄÖÜ]" config/ tools/
```

That catches most German comments. It will not catch German written without
umlauts, so read what you write.

## File organisation

| Path | Contents |
| --- | --- |
| `config/templates/` | derived sensors, merged as a list — one file per topic |
| `config/automations/` | file-based automations, merged as a list |
| `config/automations.yaml` | UI-created automations — **do not hand-edit** |
| `config/custom_templates/` | Jinja macros shared across templates |
| `config/esphome/includes/` | shared ESPHome fragments and packages |
| `config/dashboards/` | YAML-mode dashboards |
| `tools/` | maintenance scripts, unrelated to HA runtime |
| `docs/` | this documentation |

`config/automations.yaml` and `config/automations/` are both loaded. The
first is the UI editor's file, the second is merged from
`config/automations/*.yaml` and is editable only in files. Anything in
`config/automations/` shows up in the UI but cannot be edited there —
after changing it, reload via Developer Tools → YAML → Automations.

## Comment style

Comments explain *why*, not *what*. The valuable ones in this repo record
decisions that are not visible in the code: why the tach filter is 100 nF
and not 10 nF, why the solder jumper uses 3.81 mm pitch, why `f_Rsi` is no
longer used for the storage room. Several of those exist because the
obvious choice turned out to be wrong — keeping the reasoning prevents the
same mistake being made again.
