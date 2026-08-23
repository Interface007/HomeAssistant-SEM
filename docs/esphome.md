# ESPHome devices

Ten self-built devices. Each file carries a header comment with hardware,
wiring and the reasoning behind the pin choices — that is the primary
source, this page is the index.

| Device | IP | Board | Purpose |
| --- | --- | --- | --- |
| [`cellar-fan-01`](../config/esphome/cellar-fan-01.yaml) | .41 | ESP32-S3-Zero | dew-point ventilation, storage room |
| [`laundry-fan-01`](../config/esphome/laundry-fan-01.yaml) | .46 | ESP32-S3-Zero | dew-point ventilation, laundry room (two fans) |
| [`presence-livingroom-01`](../config/esphome/presence-livingroom-01.yaml) | .42 | LOLIN S2 Mini | 24 GHz mmWave presence (HLK-LD2410C) |
| [`agent-panel-01`](../config/esphome/agent-panel-01.yaml) | .43 | — | voice assistant panel (xiaozhi-esphome) |
| [`sound-meter-01`](../config/esphome/sound-meter-01.yaml) | .44 | XIAO ESP32-C3 | sound level (INMP441 I²S mic) |
| [`screen-01`](../config/esphome/screen-01.yaml) | .45 | ESP32 | dual OLED info terminal via I²C multiplexer |
| [`temp-sensor-wall-01`](../config/esphome/temp-sensor-wall-01.yaml) | .47 | ESP32 D1 Mini | living room wall temperature (DS18B20) |
| [`display-livingroom-01`](../config/esphome/display-livingroom-01.yaml) | .48 | ESP32 | 7.5″ ePaper status display |
| [`ble-proxy-upstairs-01`](../config/esphome/ble-proxy-upstairs-01.yaml) | .50 | ESP32-C6 | Bluetooth proxy for Shelly BLU sensors |
| [`camera-garden-01`](../config/esphome/camera-garden-01.yaml) | .51 | ESP32-CAM | garden camera |

All use static IPs.

## Shared fragments

`config/esphome/includes/` holds what every device repeats:

| File | Contents |
| --- | --- |
| `api.yaml`, `ota.yaml`, `logger.yaml`, `web.yaml` | one-liners, pulled with `!include` |
| `wifi_common.yaml` | SSID, static IP via `${static_ip}`, AP fallback |
| `wifi_common_display.yaml` | variant for the ePaper device |
| `climate.h` | C++ mirror of `climate.jinja` for on-device calculations |
| `dewpoint_fan.yaml` | the complete ventilation controller as a package |

## The package pattern

`cellar-fan-01` and `laundry-fan-01` are 30-line files. Everything else
lives once in
[`includes/dewpoint_fan.yaml`](../config/esphome/includes/dewpoint_fan.yaml)
and is pulled in with:

```yaml
packages:
  controller: !include ./includes/dewpoint_fan.yaml
```

The device file supplies only substitutions: name, IP, `room_label`, the
four Home Assistant source entities and the three pins.

Two traps worth knowing before writing another package:

**`!include` and `esphome.includes` resolve differently.** A `!include`
path is relative to the file containing it. A path under
`esphome: includes:` is a config *value* resolved relative to the **device
file's** directory. Inside `includes/dewpoint_fan.yaml` that means
`!include ./api.yaml` but `includes: - ./includes/climate.h`.

**`room_label` ends up in entity names** and therefore in Home Assistant
entity IDs. Changing it after adoption breaks the dashboard and the
templates. It is fixed at `Keller` and `Waschkeller`.

## Flashing

```bash
esphome run config/esphome/<device>.yaml
```

Requires `config/esphome/secrets.yaml`, which is gitignored. Keys used:
`wifi_ssid`, `wifi_password`, `ap_fallback_key`, `api_enc_key`,
`ota_password`.

To validate without flashing:

```bash
esphome config config/esphome/<device>.yaml
```

## Board-specific notes

Collected here because they cost time to rediscover:

- **ESP32-S3-Zero** has no USB-serial chip. Logging needs
  `logger: hardware_uart: USB_SERIAL_JTAG`. GPIO0/GPIO3 are strapping pins,
  GPIO19/20 are USB, GPIO21 drives the onboard RGB LED — avoid all five.
  The `5V` pin is wired straight to USB VBUS with no diode, so feeding 5 V
  externally back-feeds the USB port. Do not power both at once.
- **ESP32-C6** has no Arduino support in ESPHome; `esp-idf` is mandatory.
- **ESP32-CAM** browns out under radio load. Feed 5 V at ≥1 A on the `5V`
  pin, never 3V3, and use a short thick cable.
- **LD2410C** needs 5 V, not 3V3.
