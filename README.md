# HomeAssistant-SEM

My Home Assistant setup, in the open. A single-family house — eleven indoor
rooms plus attic, terrace and garden — with about 1600 entities, ten
self-built ESPHome devices, and a few projects that got out of hand: a
carrier board designed without an EDA tool, a 3D-printed bezel generated
from a datasheet drawing, and a cellar ventilation controller that decides
by dew point.

This is a work in progress, not a finished product. Maybe it inspires someone
to a similar project.

<img width="1090" alt="image of the epaper display" src="https://github.com/Interface007/HomeAssistant-SEM/assets/995497/25abf4a8-d048-4308-859d-ce0272dd23c6">

## How it started

The idea was a custom ePaper weather station. I found
["Home Assistant – 7,5″ E-Paper Display (Waveshare) mit ESPHome ansteuern"](https://www.it-adviser.net/home-assistant-75-e-paper-display-waveshare-mit-esphome-ansteuern-wetterstation/)
and started with Home Assistant and ESPHome. I already had a few Shelly
devices, so their status went on the display too. Then two SONOFF SNZB-02P
for garden and living room temperature.

[AI-on-the-edge-device](https://github.com/jomjol/AI-on-the-edge-device) was
too good to pass up — an AI reading my own water meter for almost no money.
A garden webcam on an ESP32-CAM followed, then a Shelly 3EM Pro for house
consumption.

Somewhere along the way it stopped being a weather station.

## What is in here

| | |
| --- | --- |
| **Derived climate values** | dew point, absolute humidity, wall surface humidity and mould risk per room, from shared Jinja macros |
| **Ten ESPHome devices** | ePaper display, mmWave presence, sound meter, BLE proxy, garden camera, wall sensors, two ventilation controllers |
| **Dew-point ventilation** | dries a cellar without making it wetter in summer — the calculation runs on the device so it fails safe |
| **A carrier board** | designed in Python: geometry, autorouter, electrical verification and Gerber output, no EDA tool involved |
| **Zigbee, Shelly, Matter, Thread** | 24 Zigbee devices, tado°X valves over Matter, Shelly BLU contacts over a Bluetooth proxy |

## Documentation

Start here:

| Page | Contents |
| --- | --- |
| [Architecture](docs/architecture.md) | how the layers fit, and where the maths runs — and why |
| [Conventions](docs/conventions.md) | entity naming, file layout, language rules |
| [Devices](docs/devices.md) | hardware inventory by role |

By subsystem:

| Page | Contents |
| --- | --- |
| [ESPHome](docs/esphome.md) | the ten self-built devices, shared packages, board traps |
| [Zigbee](docs/zigbee.md) | coordinator setup and its known failure modes |
| [Templates](docs/templates.md) | the derived-value layer and the physics behind it |
| [Automations](docs/automations.md) | what reacts to what, and patterns worth copying |
| [Dashboards](docs/dashboards.md) | five views and what each is for |

Running it:

| Page | Contents |
| --- | --- |
| [Operations](docs/operations.md) | how this repo relates to the live system, applying changes, recovery |
| [Tooling](docs/tooling.md) | entity export and rename, the PCB chain, the 3D generator |

Projects:

| Page | Contents |
| --- | --- |
| [Cellar ventilation](docs/projects/cellar-ventilation.md) | control logic, hardware, board notes, what to expect |

Shopping list: [components-and-devices.md](components-and-devices.md) — what
I actually bought, with links. Home automation parts have short lifetimes
compared to commercial products, so this list dates quickly.

## A note on the code

Comments, commit messages and documentation are English. Entity names,
dashboard labels and anything the household reads are German. The rule is
written down in [CLAUDE.md](CLAUDE.md) and enforced when files are touched.

The comments worth reading are the ones recording *why* — why the tach
filter is 100 nF and not 10 nF, why a solder jumper uses 3.81 mm pitch, why
the cellar wall temperature is no longer estimated. Several of them exist
because the obvious answer was wrong the first time.

## Caveats

Secrets, the entity registry, the database and the entity export are not in
this repository. `config/` mirrors a live system over a network share, so
Home Assistant rewrites some of these files itself — see
[Operations](docs/operations.md).

Nothing here is packaged for reuse. Static IPs, room names and area IDs are
specific to this house. Take ideas, not files.
