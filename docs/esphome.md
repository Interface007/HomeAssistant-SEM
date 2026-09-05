# ESPHome devices

Ten self-built devices in service and one in build. Each file carries a
header comment with hardware,
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
| [`irrigation-garden-01`](../config/esphome/irrigation-garden-01.yaml) | .52 | ESP32 D1 Mini | raised-bed irrigation — **not built yet**, sensors only |

All use static IPs. `irrigation-garden-01` is the eleventh entry and is in
its measurement phase: it has no pump control and its address has not been
claimed on the network yet. See
[garden-irrigation.md](projects/garden-irrigation.md).

## Shared fragments

`config/esphome/includes/` holds what every device repeats:

| File | Contents |
| --- | --- |
| `api.yaml`, `ota.yaml`, `logger.yaml` | one-liners, pulled with `!include` |
| `web.yaml` | web server port and Basic Auth |
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

## Web server authentication

`includes/web.yaml` adds HTTP Basic Auth with one credential pair shared by
all devices, from `web_user` and `web_pw` in `secrets.yaml`. Six of the ten
devices include it; `agent-panel-01`, `ble-proxy-upstairs-01` and
`camera-garden-01` run no web server at all.

**What this does and does not protect.** The UI is plain HTTP, so Basic
Auth transmits the credentials base64-encoded — readable to anyone on the
network path. It keeps casual access out. Transport security comes from the
encrypted API on port 6053 and the OTA password, both already in place.

### Per-device passwords

Possible, but not by deriving a filename or a secret name from `${name}`.
Both `!include` and `!secret` are YAML loader tags, resolved **before**
ESPHome processes substitutions:

```yaml
auth: !include ./web_auth_${name}.yaml
#  -> Error reading file includes/web_auth_${name}.yaml: No such file
password: !secret ${pw_key}
#  -> Secret '${pw_key}' not defined
```

What does work is `!include` with `vars:`, passing the secret **value**
rather than its name:

```yaml
# in the device file
web_server: !include
  file: ./includes/web.yaml
  vars:
    web_pw: !secret web_pw_cellar_fan_01
```

```yaml
# in the included file
password: ${web_pw}
```

The secret stays a secret: `esphome config` shows the reference, not the
value. The cost is three lines in every device file, since the secret name
has to be written out by hand.

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
