#!/usr/bin/env python3
"""Format Tilt resource status for `reproctl status`.

Reads Tilt uiresources JSON from stdin and prints a formatted table
of resources with their status and type.

Environment variables:
  SERVICES_JSON  — path to services.json (for known-service detection)
  CONFIG_FILE    — path to reproctl_services.json (for configured set)
  REPROCTL_JSON  — when "true", output JSON instead of a human table
"""

import json
import os
import sys

from wt_name import wt_name

_use_color = "NO_COLOR" not in os.environ and sys.stdout.isatty()

_CLR_GREEN = "\033[32m" if _use_color else ""
_CLR_YELLOW = "\033[33m" if _use_color else ""
_CLR_RED = "\033[31m" if _use_color else ""
_CLR_DIM = "\033[2m" if _use_color else ""
_CLR_RESET = "\033[0m" if _use_color else ""

_STATUS_COLORS = {
    "ok": _CLR_GREEN,
    "warn": _CLR_YELLOW,
    "building": _CLR_YELLOW,
    "pending": _CLR_YELLOW,
    "error": _CLR_RED,
}


def _colorize_status(status):
    clr = _STATUS_COLORS.get(status, "")
    if clr:
        return clr + status + _CLR_RESET
    return status


data = json.load(sys.stdin)
items = data.get("items", [])

svc_path = os.environ.get("SERVICES_JSON", "")
cfg_path = os.environ.get("CONFIG_FILE", "")
output_json = os.environ.get("REPROCTL_JSON", "") == "true"
tilt_running = os.environ.get("TILT_RUNNING", "true") != "false"

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
                configured.add(wt_name(name, slug))
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
        if tilt_running:
            rows.append((svc_name, "warn", svc_type, "not in Tilt"))
        else:
            rows.append((svc_name, "stopped", svc_type, ""))

if output_json:
    json_rows = []
    for name_val, status_val, type_val, detail_val in rows:
        obj = {"name": name_val, "status": status_val, "type": type_val}
        if detail_val:
            obj["detail"] = detail_val
        json_rows.append(obj)
    print(json.dumps(json_rows))
elif not rows:
    print("  (none)")
else:
    col0 = max(len(r[0]) for r in rows)
    col1 = max(len(r[1]) for r in rows)
    col2 = max(len(r[2]) for r in rows)

    show_header = len(rows) >= 3
    if show_header:
        col0 = max(col0, len("NAME"))
        col1 = max(col1, len("STATUS"))
        col2 = max(col2, len("TYPE"))
        has_detail = any(r[3] for r in rows)
        header = "  " + "NAME".ljust(col0) + "  " + "STATUS".ljust(col1) + "  " + "TYPE"
        if has_detail:
            header += " " * (col2 - len("TYPE")) + "  DETAIL"
        print(_CLR_DIM + header + _CLR_RESET)

    for name_val, status_val, type_val, detail_val in rows:
        pad0 = name_val.ljust(col0)
        colored_status = _colorize_status(status_val)
        status_pad = " " * (col1 - len(status_val))
        if detail_val:
            pad2 = type_val.ljust(col2)
            line = (
                "  "
                + pad0
                + "  "
                + colored_status
                + status_pad
                + "  "
                + pad2
                + "  "
                + detail_val
            )
        else:
            line = "  " + pad0 + "  " + colored_status + status_pad + "  " + type_val
        print(line)
