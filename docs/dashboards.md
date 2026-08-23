# Dashboards

Lovelace runs in `storage` mode with one YAML dashboard alongside it.
Defined in [`configuration.yaml`](../config/configuration.yaml):

```yaml
lovelace:
  mode: storage
  dashboards:
    matzen-home:
      mode: yaml
      filename: dashboards/matzen.yaml
```

| File | Audience |
| --- | --- |
| [`matzen.yaml`](../config/dashboards/matzen.yaml) | the main technical dashboard |
| [`sven.yaml`](../config/dashboards/sven.yaml) | personal view |
| [`claudia.yaml`](../config/dashboards/claudia.yaml) | personal view |
| [`anna.yaml`](../config/dashboards/anna.yaml) | personal view |
| [`lea.yaml`](../config/dashboards/lea.yaml) | personal view |

Only `matzen.yaml` is wired up as a YAML-mode dashboard in
`configuration.yaml`. The others are files in the same folder.

## Matzen dashboard

Four views, `max_columns: 2`, sections layout throughout.

**Übersicht** — room climate as tiles (temperature and humidity per room),
mould and ventilation status per room, windows, and a Kellerlüftung section
with the measured cellar wall temperature and the fan speed.

**Klima** — history graphs: absolute humidity indoor versus outdoor,
24-hour mean wall surface humidity across all rooms, wall temperature
against dew point, and the live `f_Rsi` reference from the living room.

**Energie** — consumption and the Energy dashboard feeds.

**System** — infrastructure health, including the Zigbee2MQTT bridge
connection state.

## Conventions

Cards reference the **convention names**
(`sensor.storage_room_temperature`), never vendor-derived entity IDs. That
is what keeps a hardware swap from breaking the dashboard — see
[conventions.md](conventions.md#entity-naming).

Labels and headings are **German**. They are user-facing text and are
explicitly excluded from the English-only rule.

Comparative values belong in one graph rather than in separate cards. The
wall temperature only means something next to the dew point of the same
room; that pairing is why both were added together when the cellar sensor
went live.

## Editing

`matzen.yaml` is file-only — the UI editor is not available for a
YAML-mode dashboard. After editing, reload the browser, or use Developer
Tools → YAML → Lovelace.
