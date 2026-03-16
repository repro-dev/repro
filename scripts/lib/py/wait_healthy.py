#!/usr/bin/env python3
"""Check whether a set of Tilt resources are healthy.

Usage: wait_healthy.py <tilt_port> <resource_name> [<resource_name>...]

Queries the Tilt API for uiresources, filters to the requested resource
names, and outputs a JSON object:

  {
    "healthy": true|false,
    "resources": [
      {"name": "...", "status": "ok|building|pending|error", "detail": "..."}
    ]
  }

Exit code is always 0 — the caller checks the "healthy" field.
"""

import json
import subprocess
import sys


def main():
    if len(sys.argv) < 3:
        print('{"healthy":false,"resources":[]}')
        return

    tilt_port = sys.argv[1]
    requested = set(sys.argv[2:])

    try:
        result = subprocess.run(
            ["tilt", "get", "uiresources", "-o", "json", "--port", tilt_port],
            capture_output=True,
            text=True,
            timeout=10,
        )
        data = json.loads(result.stdout)
    except Exception:
        print('{"healthy":false,"resources":[]}')
        return

    items = data.get("items", [])

    resources = []
    found = set()

    for item in items:
        name = item.get("metadata", {}).get("name", "")
        if name not in requested:
            continue

        found.add(name)
        status_obj = item.get("status", {})
        runtime = status_obj.get("runtimeStatus", "")
        update = status_obj.get("updateStatus", "")

        effective_runtime = "ok" if runtime in ("ok", "not_applicable") else runtime
        effective_update = (
            "ok" if update in ("ok", "not_applicable", "none") else update
        )

        if effective_runtime == "ok" and effective_update == "ok":
            display_status = "ok"
            detail = "healthy"
        elif effective_runtime == "error" or effective_update == "error":
            display_status = "error"
            detail = runtime if runtime == "error" else update
        elif effective_update == "in_progress":
            display_status = "building"
            detail = "image building or deploying"
        else:
            display_status = "pending"
            detail = "waiting for ready"

        resources.append({"name": name, "status": display_status, "detail": detail})

    for name in requested:
        if name not in found:
            resources.append(
                {"name": name, "status": "pending", "detail": "not yet in Tilt"}
            )

    healthy = all(r["status"] == "ok" for r in resources) and len(resources) > 0

    print(json.dumps({"healthy": healthy, "resources": resources}))


if __name__ == "__main__":
    main()
