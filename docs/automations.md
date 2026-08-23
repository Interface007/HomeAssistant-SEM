# Automations

Two mechanisms are active at once, and the difference matters:

| Source | Editable in the UI | Purpose |
| --- | --- | --- |
| `config/automations.yaml` | yes | automations created through the UI editor |
| `config/automations/*.yaml` | **no** | file-based, merged as a list |

Both are loaded. File-based automations are *visible* in the UI but cannot
be edited there. After changing one: Developer Tools → YAML → Automations.

## File-based automations

### [`air_quality.yaml`](../config/automations/air_quality.yaml)
Pauses the air purifier while the bedroom window is open, resumes five
minutes after it closes.

### [`alerting.yaml`](../config/automations/alerting.yaml)
Water leak push notification, repeated while wet. Weekly Sunday digest of
weak batteries in leak and window sensors. Reminder when a window stays
open in the cold.

### [`cellar_fan.yaml`](../config/automations/cellar_fan.yaml)
Night-time speed limit for the cellar fan. Sets
`number.storage_room_fan01_maximale_lufterleistung` to 40 % in the evening
and back to 100 % in the morning, plus a third automation that re-applies
the value matching the time of day after a Home Assistant restart —
otherwise a restart across a trigger time leaves the limit stale.

The controller itself runs on the ESP; these automations only move the
ceiling. See [projects/cellar-ventilation.md](projects/cellar-ventilation.md).

### [`consumption_history.yaml`](../config/automations/consumption_history.yaml)
Appends the daily water and electricity totals to a 14-day history kept in
`input_text` helpers, for rendering on the ePaper display.

### [`epaper_tag_1.yaml`](../config/automations/epaper_tag_1.yaml)
Feeds an OpenEPaperLink tag with outdoor and living room climate values.

### [`front_door.yaml`](../config/automations/front_door.yaml)
Failsafe that switches the door opener off again — a relay left energised
is both a security and a hardware problem.

### [`heating.yaml`](../config/automations/heating.yaml)
Turns off all TRVs in a room once one of its windows has been open long
enough, and restores the saved state when it closes.

This exists because the tado°X valves run over Matter and therefore have no
native window-open detection. The room-to-window mapping is resolved
dynamically from the area registry via
[`windows.yaml`](../config/templates/windows.yaml) — adding a window to an
area is enough, no automation change needed.

### [`lights.yaml`](../config/automations/lights.yaml)
Aqara Opple button actions. Enforcing `power_on_behavior` on the IKEA
panels so they come back on after a mains outage. Restoring a Shelly Mini
G3 after power returns.

The `power_on_behavior` automation is worth reading before writing a
similar one. It used to trigger on state changes of the very `select`
entities it writes — a feedback loop, with no natural stop because the
selects sit at `unknown` and never reach the target. It now triggers on
Home Assistant start and on the Zigbee bridge coming back online, waits a
minute for routes to establish, and only writes where the value is not
already correct.

## Patterns worth copying

**Do not trigger on what you write.** The `lights.yaml` case above.

**Resolve groups from the area registry**, not from hand-maintained lists.
`windows.yaml` does this; adding a device to an area is then the only step.

**Re-apply scheduled state after a restart.** Any automation that sets a
value at a fixed time needs a companion that fixes up the value on
Home Assistant start, or a restart across the trigger leaves it stale.

**Guard against unavailable sources.** `continue_on_error: true` on actions
that touch devices which may be offline, and `has_value()` checks in
templates.
