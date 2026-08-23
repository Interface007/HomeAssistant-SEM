# Device inventory

About 1600 entities in total, of which roughly 860 are assigned to one of
17 areas — eleven indoor rooms, two staircases, the attic, terrace and
garden, plus a `virtual` area for things that have no location. The rest
are integrations, add-ons and Home Assistant internals. See
[conventions.md](conventions.md#areas).

This page lists device *types* and their role; personal devices (phones,
tablets) are deliberately omitted.

For what to buy and where, see
[`components-and-devices.md`](../components-and-devices.md).

## Climate and moisture

| Device | Count | Role |
| --- | --- | --- |
| SONOFF SNZB-02P / SNZB-02D | 9 | temperature and humidity per room, feeds the whole template layer |
| DS18B20 (via ESPHome) | 2 | wall temperature, living room and storage room |
| tado°X TRV | 8 | radiator valves, reached over **Matter** |
| tado bridge | 1 | serves the tado app — see below |
| Xiaomi air purifier | 1 | living room |

Two things about the tado valves.

**No native window-open detection** over Matter. The TRV-off-on-window
automations in [`heating.yaml`](../config/automations/heating.yaml) exist
because of it.

**The bridge is not redundant hardware.** Home Assistant talks to the
valves over Matter; the bridge keeps the tado app and cloud working in
parallel, so heating stays controllable when Home Assistant does not. In
Home Assistant the bridge shows up as a single `device_tracker` and nothing
else, which makes it look superfluous. It is not — see
[architecture.md](architecture.md#home-assistant-is-not-the-only-way-to-control-the-house).

The SNZB-02 sensors resolve humidity in 1 % steps. Fine for display, coarse
for judging drying progress — prefer the dew point sensors of the
ventilation controllers, which resolve 0.1 K.

## Contacts and leaks

| Device | Count | Role |
| --- | --- | --- |
| Shelly BLU Door/Window | 6 | window contacts over BTHome/BLE |
| Shelly Door/Window 2 | 1 | older WiFi contact |
| Third Reality 3RWS18BZ | 5 | water leak, Zigbee |

The BLU contacts are BLE, not Zigbee. They were sitting at about −84 dBm on
the upper floor and losing packets until `ble-proxy-upstairs-01` was added.

The Shelly BLU gateway does not help with *that* problem, because it feeds
the Shelly cloud rather than the Home Assistant Bluetooth stack. It is
still there on purpose: that cloud path is what keeps the contacts visible
in the Shelly app when Home Assistant is unavailable. The two paths are
independent and both are wanted — see
[architecture.md](architecture.md#home-assistant-is-not-the-only-way-to-control-the-house).

## Power and energy

| Device | Count | Role |
| --- | --- | --- |
| Shelly 3EM Pro | 1 | house consumption, three phases, Energy dashboard |
| Shelly Plus Plug / PlusUni / Mini G3 / SHSW-25 | 6 | switching and metering |
| SONOFF S60 smart plug | 4 | switching with power metering, Zigbee |
| Nous A1Z | 1 | metering plug, Zigbee |
| IKEA INSPELNING | 1 | metering plug, Zigbee |
| Anker Solix | 1 | balcony solar with battery |

The metering plugs report frequently. That traffic contributed to the
Zigbee coordinator overload described in [zigbee.md](zigbee.md#known-issues).

## Lighting and control

| Device | Count | Role |
| --- | --- | --- |
| IKEA JETSTROM panel | 3 | ceiling lights, Zigbee |
| Aqara Opple switch | 1 | wall remote, Zigbee |

## Displays and audio

| Device | Role |
| --- | --- |
| Waveshare 7.5″ ePaper | living room status display, driven by `display-livingroom-01` |
| OpenEPaperLink AP + tags | price-tag style displays, three tags in use |
| Dual OLED terminal | `screen-01`, window and mould status |
| Voice assistant panel | `agent-panel-01`, with Piper for text-to-speech |
| Music Assistant + squeezelite | audio distribution |

## Infrastructure

| Device | Role |
| --- | --- |
| FRITZ!Box 7690 | router, WAN throughput read over SNMP |
| UCG Max | second router, double NAT — see [`network.yaml`](../config/templates/network.yaml) |
| Synology DS225 | NAS, storage and backup target |
| Home Assistant Connect ZBT-1 | Thread/OpenThread border router |
| SONOFF ZBDongle-E | Zigbee coordinator — see [zigbee.md](zigbee.md) |

## Special-purpose

| Device | Role |
| --- | --- |
| ESP32-CAM + AI-on-the-edge | reads the water meter dial optically |
| ESP32-CAM (`camera-garden-01`) | garden camera |
| Siemens WT47 dryer | Home Connect |

The water meter reader runs [AI-on-the-edge-device](https://github.com/jomjol/AI-on-the-edge-device),
not ESPHome. Its output feeds the `utility_meter` helpers in
`configuration.yaml` and the consumption history automations.

## Self-built

Ten ESPHome devices, listed in [esphome.md](esphome.md). Two of them —
the ventilation controllers — sit on a self-designed carrier board
documented in [projects/cellar-ventilation.md](projects/cellar-ventilation.md).

## Regenerating the inventory

```bash
python tools/export_entities.py
```

Writes `status/entities.csv`. That file is **gitignored**: it contains
device and person metadata that does not belong in a public repository.
