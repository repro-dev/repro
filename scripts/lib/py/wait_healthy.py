#!/usr/bin/env python3
"""Check whether a set of Tilt resources are healthy.

Usage: wait_healthy.py <tilt_port> [--deps <name>...] [--] <target_name>...

Queries the Tilt API for uiresources, filters to the requested resource
names, and outputs a JSON object:

  {
    "healthy": true|false,
    "resources": [
      {"name": "...", "status": "ok|building|pending|error", "detail": "...", "target": true|false}
    ]
  }

healthy is true only when all *target* resources are ok.
Exit code is always 0 — the caller checks the "healthy" field.
"""

import json
import subprocess
import sys


def parse_args(argv):
    targets = []
    deps = []
    i = 1
    tilt_port = argv[i] if len(argv) > 1 else "10350"
    i = 2

    in_deps = False
    while i < len(argv):
        arg = argv[i]
        if arg == "--deps":
            in_deps = True
            i += 1
            continue
        if arg == "--":
            in_deps = False
            i += 1
            continue
        if in_deps:
            deps.append(arg)
        else:
            targets.append(arg)
        i += 1

    return tilt_port, targets, deps


def classify(item):
    status_obj = item.get("status", {})
    runtime = status_obj.get("runtimeStatus", "")
    update = status_obj.get("updateStatus", "")

    effective_runtime = "ok" if runtime in ("ok", "not_applicable") else runtime
    effective_update = "ok" if update in ("ok", "not_applicable", "none") else update

    if effective_runtime == "ok" and effective_update == "ok":
        return "ok", "healthy"
    elif effective_runtime == "error" or effective_update == "error":
        return "error", runtime if runtime == "error" else update
    elif effective_update == "in_progress":
        return "building", "image building or deploying"
    else:
        return "pending", "waiting for ready"


def main():
    tilt_port, targets, deps = parse_args(sys.argv)
    requested_targets = set(targets)
    requested_deps = set(deps)
    all_requested = requested_targets | requested_deps

    if not all_requested:
        print('{"healthy":false,"resources":[]}')
        return

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
        if name not in all_requested:
            continue

        found.add(name)
        display_status, detail = classify(item)
        is_target = name in requested_targets

        resources.append(
            {
                "name": name,
                "status": display_status,
                "detail": detail,
                "target": is_target,
            }
        )

    for name in all_requested:
        if name not in found:
            resources.append(
                {
                    "name": name,
                    "status": "pending",
                    "detail": "not yet in Tilt",
                    "target": name in requested_targets,
                }
            )

    dep_list = [r for r in resources if not r["target"]]
    target_list = [r for r in resources if r["target"]]
    resources = dep_list + target_list

    healthy = (
        all(r["status"] == "ok" for r in resources if r["target"])
        and len(target_list) > 0
    )

    print(json.dumps({"healthy": healthy, "resources": resources}))


if __name__ == "__main__":
    main()
