# Architecture

How the parts fit together, and — more useful — *why* computation sits where
it sits.

## Layers

```
       physical devices
   Zigbee · Shelly (WiFi) · Matter · ESPHome · REST/cloud
                     |
                     v
            Home Assistant core
                     |
        +------------+------------+
        |                         |
   template layer            automations
   config/templates/         config/automations/
   derived values            reactions
        |                         |
        +------------+------------+
                     |
              dashboards · ePaper · alerts
```

Raw device readings are never consumed directly by dashboards or
automations. Everything goes through the **template layer**, which
normalises names, adds availability guards and derives the physical
quantities that actually matter (dew point, absolute humidity, wall
surface humidity). See [templates.md](templates.md).

## Where the maths happens

**Rule: calculate in Home Assistant, display on the device.**
The ePaper display (`display-livingroom-01`) originally computed absolute
humidity and ventilation advice itself. That was moved into HA so the
formulas exist once and can be changed without reflashing. The ESP now
only renders values that arrive ready-made.

**Exception: the ventilation controllers calculate on the device.**
`cellar-fan-01` and `laundry-fan-01` import raw temperature and humidity
from HA and compute dew points themselves, in
[`includes/climate.h`](../config/esphome/includes/climate.h). The reason is
failure behaviour: a fan that keeps running with stale data can pump humid
outside air into a cellar for hours. The controller must be able to decide
"stop" on its own when HA goes away, and it must do so from values it
computed itself rather than from a derived sensor that froze at its last
value.

The cost of that exception is duplicated formulas. It is contained by
keeping [`climate.h`](../config/esphome/includes/climate.h) a literal
mirror of [`climate.jinja`](../config/custom_templates/climate.jinja) —
same Magnus coefficients, same structure, cross-referenced in both files.
If you change one, change the other.

## Failure behaviour

| Component fails | Effect |
| --- | --- |
| Wi-Fi or HA unreachable | Ventilation controllers see stale values after 15 min and stop the fans |
| Zigbee coordinator crashes | All Zigbee sensors freeze at their last state; the add-on watchdog restarts it |
| A source sensor goes unavailable | Template sensors go unavailable rather than computing with a stale number — every template has an `availability:` guard |
| ESPHome device offline | Its entities go unavailable; nothing else is affected |

The `availability:` guards are not decoration. A dew point computed from a
frozen humidity reading looks perfectly plausible and would silently drive
the wrong decision.

## Home Assistant is not the only way to control the house

Shelly and tado devices stay connected to their vendor clouds and remain
fully operable through the manufacturer apps. This is deliberate, not
leftover configuration: Home Assistant restarts, upgrades and — as the
Zigbee coordinator crash showed — occasionally stays down for hours.
Heating and the important switches must not depend on it.

That is why two devices exist which look pointless from inside Home
Assistant:

| Device | Visible in HA | Actual job |
| --- | --- | --- |
| tado bridge | a `device_tracker`, nothing else | serves the tado app and cloud |
| Shelly BLU gateway | diagnostics only — cloud status, uptime, firmware | feeds the Shelly app |

Neither carries a control entity. Judged by its Home Assistant footprint
each looks like dead weight, which is exactly why the reasoning belongs in
writing.

What follows from this:

- **Do not detach devices from their cloud** to make them local-only, even
  where the integration would allow it.
- **Do not treat Home Assistant as the sole scheduler for heating.** It may
  override; it may not be the only thing that knows the plan.
- The tado°X valves reach Home Assistant over **Matter**, in parallel to
  the cloud path. Both work at the same time.

The cost is two sources of truth. A schedule in the tado app and an
automation in Home Assistant can disagree, and the last writer wins. The
window automations in
[`heating.yaml`](../config/automations/heating.yaml) are written to
tolerate that: they save and restore state rather than asserting a fixed
setpoint.

## Naming as an interface

Entities are renamed to `<area>_<measurement>` on adoption (see
[conventions.md](conventions.md)). That turns the area registry into the
integration point: templates, automations and dashboards refer to
`sensor.storage_room_temperature`, never to `sensor.sonoff_th_04_*`. The
sensor behind it can be swapped for a different brand without touching
anything downstream.

This is what made the cellar wall temperature switch painless: replacing
an estimated value with a real measurement was one edit in
[`rooms.yaml`](../config/templates/rooms.yaml), and five consumers picked
it up without changes.

## Related

- [conventions.md](conventions.md) — naming rules and language policy
- [templates.md](templates.md) — the derived-value layer
- [esphome.md](esphome.md) — the ten self-built devices
- [operations.md](operations.md) — how this repo relates to the running system
