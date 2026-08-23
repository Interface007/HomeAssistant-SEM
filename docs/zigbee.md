# Zigbee

Zigbee2MQTT as a Home Assistant add-on, MQTT via the Mosquitto add-on.
Configuration: [`config/zigbee2mqtt/configuration.yaml`](../config/zigbee2mqtt/configuration.yaml).

## Coordinator

| | |
| --- | --- |
| Adapter | SONOFF ZBDongle-E (EFR32MG21, EmberZNet) |
| Driver | `ember` |
| Firmware | NCP 7.4.4 [GA] |
| Baud rate | 115200 |
| Flow control | `rtscts: false` |
| Channel | 25 |

**`rtscts: false` is correct and must stay that way.** The ZBDongle-E
supports software flow control only. Setting it to `true` — which is right
for some other adapters — breaks this one.

Channel 25 sits above the house Wi-Fi on channel 6, so the two do not
overlap. Zigbee2MQTT documentation recommends firmware 7.4.4 or newer for
this adapter; the version linked in SONOFF's own PDF is older than that.

## Devices

24 devices. Naming follows [conventions.md](conventions.md):

| Type | Devices |
| --- | --- |
| Temperature/humidity | `sonoff_th_01` … `sonoff_th_09` |
| Metering plugs | `sonoff_plug_01` … `04`, `nous_plug_01`, `ikea_plug_01` |
| Water leak | `thirdreality_waterleak_01` … `05` |
| Ceiling lights | `ikea_light_01` … `03` |
| Wall remote | `aqaraopple_switch_01` |
| Repeater | `tuya_repeater_01` |

## Known issues

### Coordinator crash under load

Symptom in the log:

```
zh:ember:uart:ash: Received ERROR from adapter,
    code=ERROR_EXCEEDED_MAXIMUM_ACK_TIMEOUT_COUNT
zh:ember:ezsp: Fatal error, status=ASH_NCP_FATAL_ERROR
z2m: Adapter disconnected, stopping
```

The ASH counters printed alongside are what to read. In the observed case:

| Counter | Value | Reading |
| --- | --- | --- |
| CRC errors | 0 | serial link electrically clean |
| Comm errors | 0 | no framing problems |
| Bad lengths / controls | 0 | no corruption |
| Retry dupes RX | 18 | adapter resent frames the host had already seen |

Zero error counters with non-zero retries rules out cable, connector and
interference, and points at **host-side timing**: acknowledgements arriving
too late, not corrupted. Look for CPU load on the Home Assistant host, not
for hardware faults.

Zigbee2MQTT exited with `restart=false` and stayed down for seven hours.
**Enable the add-on watchdog** — it makes this class of failure survivable
regardless of cause.

If the add-on will not reconnect after a crash: unplug the dongle, restart
the host, start Zigbee2MQTT, wait a few seconds, plug the dongle back in.

### `TABLE_FULL` on the water sensors

On every restart, all five Third Reality sensors log:

```
Bind 0x282c02bffff.../1 genOnOff from '<coordinator>/1' failed
    (Status 'TABLE_FULL')
```

The binding table *in the sensor* is full — these devices have very few
slots. It is cosmetic: leak detection runs over the IAS Zone cluster, which
enrols separately and works. All five `binary_sensor.*_water_leak` entities
report correctly. Each restart costs two failed attempts per sensor and
nothing else. Not worth chasing.

### Delivery failures right after start

`Delivery failed` when writing to the IKEA panels immediately after startup
means routes are not established yet, not that the lights are missing. Any
automation that writes to Zigbee devices on Home Assistant start needs a
delay of roughly a minute — see
[`lights.yaml`](../config/automations/lights.yaml).

## Diagnostics

The bridge state is on the Matzen dashboard as
`binary_sensor.zigbee2mqtt_bridge_connection_state`. The frontend runs on
port 8099.

For a recurring crash, set `advanced: log_level: debug` before the next
occurrence — the ASH layer then logs which frames went unanswered.
