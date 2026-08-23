# Operations

## How this repository relates to the running system

`config/` is reached over a **Samba share / network drive** pointing at the
Home Assistant host. Editing a file here edits the live configuration; the
Git checkout is this working copy, not something on the host.

Two consequences:

- **A syntax error is live immediately** in the sense that the next reload
  or restart picks it up. Validate before reloading, not after.
- **Home Assistant also writes to these files.** `automations.yaml`,
  `scenes.yaml`, `scripts.yaml` and the Zigbee2MQTT configuration are
  rewritten by the software. Expect unexplained diffs there and do not
  hand-edit them.

## Applying changes

| Changed | How to apply |
| --- | --- |
| `config/templates/*` | Developer Tools → YAML → Template entities |
| `config/custom_templates/*.jinja` | same — macros are re-read with the templates |
| `config/automations/*` | Developer Tools → YAML → Automations |
| `config/sensors.yaml` | full restart (platform sensors) |
| `config/configuration.yaml` | full restart |
| `config/dashboards/*` | browser reload, or Developer Tools → YAML → Lovelace |
| `config/esphome/*` | `esphome run config/esphome/<device>.yaml` |
| Zigbee2MQTT config | restart the add-on |

Check the configuration before restarting: Developer Tools → YAML → Check
configuration.

## Validating without a running instance

ESPHome configurations can be validated from this working copy, provided
`config/esphome/secrets.yaml` exists:

```bash
esphome config config/esphome/cellar-fan-01.yaml
```

Plain YAML syntax, for files using `!include` and `!secret`:

```bash
python - <<'EOF'
import yaml
class L(yaml.SafeLoader): pass
L.add_multi_constructor('!', lambda l, s, n: None)
yaml.load(open('config/templates/rooms.yaml', encoding='utf-8'), Loader=L)
print('ok')
EOF
```

## Secrets

Not in the repository, and gitignored:

| File | Used by |
| --- | --- |
| `config/secrets.yaml` | Home Assistant |
| `config/esphome/secrets.yaml` | ESPHome — `wifi_ssid`, `wifi_password`, `ap_fallback_key`, `api_enc_key`, `ota_password` |

Also excluded: `config/.storage/`, the recorder database, logs, and
`status/entities.csv` (device and person metadata).

## Backups

The OneDrive Backup and Samba add-ons are installed, and the Synology NAS
is available as a target. This repository is **not** a backup: it holds
configuration, not the entity registry, the database or the add-on state. A
restore needs a Home Assistant snapshot as well.

## Recovering from failures

| Symptom | First look at |
| --- | --- |
| Zigbee devices all frozen | [zigbee.md](zigbee.md#known-issues) — coordinator crash, check the add-on watchdog |
| One ESPHome device offline | Wi-Fi signal in its diagnostic entities; the device falls back to its own AP `AP-<name>` |
| Fan runs continuously | Normal when outside air is drier. [projects/cellar-ventilation.md](projects/cellar-ventilation.md) |
| Fan at full speed regardless of setting | JP1 jumper and `inverted:` disagree, see the same page |
| Template sensor unavailable | A source sensor is unavailable — the `availability:` guard is working as intended |
| Implausible fan RPM | Tach interference, see the ventilation page |

## Maintenance tools

| Script | Purpose |
| --- | --- |
| [`tools/export_entities.py`](../tools/export_entities.py) | dump all entities to `status/entities.csv` |
| [`tools/rename_entities.py`](../tools/rename_entities.py) | apply `renames.csv` to the entity registry |

See [tooling.md](tooling.md).

## Open points

- **Host hardware is not documented here.** Fill in the model, storage and
  where the Zigbee dongle is physically plugged in — that last one matters
  after the coordinator crash.
- `f_Rsi` values in `climate.jinja` are placeholders for five rooms; see
  [templates.md](templates.md#wall-temperature-measured-versus-estimated).
- Water meter and power history for the ePaper display still lack sources
  (noted in the `display-livingroom-01` header).
