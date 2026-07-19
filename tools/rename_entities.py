#!/usr/bin/env python3
"""Entity-IDs in Home Assistant per CSV umbenennen (Vorher;Nachher).

Nutzung:
  pip install websockets
  python rename_entities.py renames.csv            # Dry-Run (zeigt nur an)
  python rename_entities.py renames.csv --apply    # führt die Umbenennung aus

CSV-Format (Semikolon, eine Zeile pro Umbenennung, # = Kommentar):
  binary_sensor.bthome_sensor_3e90_window;binary_sensor.bedroom_window_north_contact
  sensor.bthome_sensor_3e90_rotation;sensor.bedroom_window_north_tilt_angle

Konfiguration über Umgebungsvariablen:
  HA_URL   (Default: http://192.168.2.3:8123)
  HA_TOKEN (Long-lived Access Token: HA-Profil -> Sicherheit -> Token erstellen)

Hinweis: Referenzen in Automationen/Templates werden NICHT mitgeändert -
IDs daher möglichst korrigieren, bevor sie irgendwo verwendet werden.
"""

import asyncio
import csv
import json
import os
import sys

try:
    import websockets
except ImportError:
    sys.exit("Bitte zuerst: pip install websockets")

HA_URL = os.environ.get("HA_URL", "http://192.168.2.3:8123")
TOKEN = os.environ.get("HA_TOKEN")


def load_renames(path: str) -> list[tuple[str, str]]:
    renames = []
    with open(path, newline="", encoding="utf-8-sig") as fh:
        for lineno, row in enumerate(csv.reader(fh, delimiter=";"), start=1):
            if not row or row[0].lstrip().startswith("#"):
                continue
            if len(row) < 2 or not row[0].strip() or not row[1].strip():
                sys.exit(f"Zeile {lineno}: erwartet 'alt;neu', bekommen: {row}")
            old, new = row[0].strip(), row[1].strip()
            if "." not in old or "." not in new:
                sys.exit(f"Zeile {lineno}: '{old}' / '{new}' ist keine Entity-ID")
            if old.split(".")[0] != new.split(".")[0]:
                sys.exit(f"Zeile {lineno}: Domain-Wechsel {old} -> {new} ist nicht erlaubt")
            renames.append((old, new))
    return renames


async def run(renames: list[tuple[str, str]], apply: bool) -> None:
    ws_url = HA_URL.replace("http", "ws", 1) + "/api/websocket"
    async with websockets.connect(ws_url, max_size=16 * 1024 * 1024) as ws:
        assert json.loads(await ws.recv())["type"] == "auth_required"
        await ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
        if json.loads(await ws.recv())["type"] != "auth_ok":
            sys.exit("Authentifizierung fehlgeschlagen - HA_TOKEN prüfen")

        msg_id = 1

        async def call(payload: dict) -> dict:
            nonlocal msg_id
            payload["id"] = msg_id
            msg_id += 1
            await ws.send(json.dumps(payload))
            while True:
                resp = json.loads(await ws.recv())
                if resp.get("id") == payload["id"]:
                    return resp

        # Bestand laden für Validierung
        resp = await call({"type": "config/entity_registry/list"})
        existing = {e["entity_id"] for e in resp["result"]}

        ok, skipped = 0, 0
        for old, new in renames:
            if old not in existing:
                print(f"SKIP  {old}  (existiert nicht)")
                skipped += 1
                continue
            if new in existing:
                print(f"SKIP  {old} -> {new}  (Ziel-ID bereits vergeben)")
                skipped += 1
                continue
            if not apply:
                print(f"DRY   {old} -> {new}")
                ok += 1
                continue
            resp = await call({
                "type": "config/entity_registry/update",
                "entity_id": old,
                "new_entity_id": new,
            })
            if resp.get("success"):
                print(f"OK    {old} -> {new}")
                existing.discard(old)
                existing.add(new)
                ok += 1
            else:
                print(f"FEHLER {old} -> {new}: {resp.get('error')}")
                skipped += 1

        mode = "umbenannt" if apply else "würden umbenannt (Dry-Run, --apply zum Ausführen)"
        print(f"\n{ok} {mode}, {skipped} übersprungen.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    if not TOKEN:
        sys.exit("Umgebungsvariable HA_TOKEN setzen (Long-lived Access Token)")
    asyncio.run(run(load_renames(sys.argv[1]), apply="--apply" in sys.argv))
