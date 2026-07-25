#!/usr/bin/env python3
"""Generate a complete entity export from Home Assistant as CSV.

Replaces the template-editor approach (which truncates output).
Format unchanged: entity_id;name;area;device;state;unit

Usage:
  pip install websockets
  $env:HA_TOKEN = "<Long-lived Access Token>"
    python export_entities.py                # writes ../status/entities.csv
    python export_entities.py my.csv         # custom output path

Configuration: HA_URL (default http://192.168.2.3:8123), HA_TOKEN
"""

import asyncio
import csv
import json
import os
import sys
from pathlib import Path

try:
    import websockets
except ImportError:
    sys.exit("Please run: pip install websockets")

HA_URL = os.environ.get("HA_URL", "http://192.168.2.3:8123")
TOKEN = os.environ.get("HA_TOKEN")
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "status" / "entities.csv"


async def run(out_path: Path) -> None:
    ws_url = HA_URL.replace("http", "ws", 1) + "/api/websocket"
    async with websockets.connect(ws_url, max_size=64 * 1024 * 1024) as ws:
        assert json.loads(await ws.recv())["type"] == "auth_required"
        await ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
        if json.loads(await ws.recv())["type"] != "auth_ok":
            sys.exit("Authentication failed - check HA_TOKEN")

        msg_id = 0

        async def call(msg_type: str) -> list | dict:
            nonlocal msg_id
            msg_id += 1
            await ws.send(json.dumps({"id": msg_id, "type": msg_type}))
            while True:
                resp = json.loads(await ws.recv())
                if resp.get("id") == msg_id:
                    if not resp.get("success", True):
                        sys.exit(f"{msg_type} failed: {resp.get('error')}")
                    return resp["result"]

        entities = await call("config/entity_registry/list")
        devices = await call("config/device_registry/list")
        areas = await call("config/area_registry/list")
        states = await call("get_states")

    area_by_id = {a["area_id"]: a["name"] for a in areas}
    device_by_id = {d["id"]: d for d in devices}
    state_by_eid = {s["entity_id"]: s for s in states}
    registry_by_eid = {e["entity_id"]: e for e in entities}

    rows = []
    all_eids = sorted(set(state_by_eid) | set(registry_by_eid))
    for eid in all_eids:
        reg = registry_by_eid.get(eid, {})
        st = state_by_eid.get(eid, {})
        attrs = st.get("attributes", {})

        device = device_by_id.get(reg.get("device_id"), {})
        area_id = reg.get("area_id") or device.get("area_id")
        area = area_by_id.get(area_id, "") if area_id else ""

        device_name = device.get("name_by_user") or device.get("name") or ""
        name = (reg.get("name") or attrs.get("friendly_name")
                or reg.get("original_name") or "")
        state = st.get("state", "not_loaded")
        unit = attrs.get("unit_of_measurement", "") or ""

        rows.append([eid, name, area, device_name, state, unit])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh, delimiter=";")
        writer.writerow(["entity_id", "name", "area", "device", "state", "unit"])
        writer.writerows(rows)

    print(f"{len(rows)} entities exported to {out_path}.")


if __name__ == "__main__":
    if not TOKEN:
        sys.exit("Set environment variable HA_TOKEN (long-lived access token)")
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    asyncio.run(run(out))
