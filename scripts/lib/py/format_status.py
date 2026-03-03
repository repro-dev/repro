#!/usr/bin/env python3
"""Format Tilt resource status for `reproctl status`.

Reads Tilt uiresources JSON from stdin and prints a formatted table
of resources with their status and type.

Environment variables:
  SERVICES_JSON — path to services.json (for known-service detection)
  CONFIG_FILE   — path to reproctl_services.json (for configured set)
"""

import json
import os
import sys

data = json.load(sys.stdin)
items = data.get("items", [])

svc_path = os.environ.get("SERVICES_JSON", "")
cfg_path = os.environ.get("CONFIG_FILE", "")

known_services = set()
if svc_path and os.path.isfile(svc_path):
    with open(svc_path) as f:
        known_services = set(json.load(f).keys())

configured = set()
if cfg_path and os.path.isfile(cfg_path):
    with open(cfg_path) as f:
        cfg_data = json.load(f)
        for s in cfg_data.get("services", []):
            slug = s.get("slug", "")
            name = s.get("name", "")
            if slug:
                configured.add(name + "-wt-" + slug)
            else:
                configured.add(name)

rows = []
seen_names = set()
for item in items:
    name = item.get("metadata", {}).get("name", "")
    if name == "(Tiltfile)":
        continue

    seen_names.add(name)
    status_obj = item.get("status", {})
    runtime = status_obj.get("runtimeStatus", "")
    update = status_obj.get("updateStatus", "")

    pod_restarts = 0
    pod_status_reason = ""
    k8s_info = status_obj.get("k8sResourceInfo", {})
    if k8s_info:
        pod_restarts = k8s_info.get("podRestarts", 0)
        pod_status_reason = k8s_info.get("podStatusMessage", "")

    effective_runtime = "ok" if runtime in ("ok", "not_applicable") else runtime
    effective_update = "ok" if update in ("ok", "not_applicable", "none") else update

    if effective_runtime == "ok" and effective_update == "ok":
        display_status = "ok"
    elif effective_runtime == "error" or effective_update == "error":
        display_status = "error"
    elif effective_update == "in_progress":
        display_status = "building"
    else:
        display_status = "pending"
    if "-wt-" in name:
        idx = name.index("-wt-")
        wt_slug = name[idx + 4 :]
        res_type = "service [wt:" + wt_slug + "]"
    elif name in known_services:
        res_type = "service"
    elif name.endswith("-migrations"):
        res_type = "job"
    else:
        res_type = "infra"

    auto = ""
    if res_type == "service" and name not in configured:
        auto = " (auto)"

    detail_parts = []
    if pod_status_reason and display_status == "error":
        detail_parts.append(pod_status_reason)
    if pod_restarts > 0:
        detail_parts.append(str(pod_restarts) + " restart(s)")
    detail = ", ".join(detail_parts)

    rows.append((name, display_status, res_type + auto, detail))

for svc_name in sorted(configured):
    if svc_name not in seen_names:
        if "-wt-" in svc_name:
            idx = svc_name.index("-wt-")
            wt_slug = svc_name[idx + 4 :]
            svc_type = "service [wt:" + wt_slug + "]"
        else:
            svc_type = "service"
        rows.append((svc_name, "warn", svc_type, "not in Tilt"))

if not rows:
    print("  (none)")
else:
    col0 = max(len(r[0]) for r in rows)
    col1 = max(len(r[1]) for r in rows)
    col2 = max(len(r[2]) for r in rows)
    for name_val, status_val, type_val, detail_val in rows:
        pad0 = name_val.ljust(col0)
        pad1 = status_val.ljust(col1)
        if detail_val:
            pad2 = type_val.ljust(col2)
            line = "  " + pad0 + "  " + pad1 + "  " + pad2 + "  " + detail_val
        else:
            line = "  " + pad0 + "  " + pad1 + "  " + type_val
        print(line)
