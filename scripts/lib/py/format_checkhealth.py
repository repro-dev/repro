#!/usr/bin/env python3
"""Format Tilt resource data for `reproctl checkhealth`.

Reads Tilt uiresources JSON from stdin and produces a JSON object with:
  - services: list of {name, status, detail}
  - issues: list of {severity, message}

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

known_services: set[str] = set()
if svc_path and os.path.isfile(svc_path):
    with open(svc_path) as f:
        known_services = set(json.load(f).keys())

configured: set[str] = set()
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

services = []
issues = []

for item in items:
    name = item.get("metadata", {}).get("name", "")
    if name == "(Tiltfile)":
        continue

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
    elif effective_runtime == "pending" or effective_update == "pending":
        display_status = "pending"
    else:
        display_status = "unknown"

    is_service = name in known_services or "-wt-" in name
    is_infra = not is_service and not name.endswith("-migrations")

    detail_parts = []
    if is_service:
        if "-wt-" in name:
            idx = name.index("-wt-")
            detail_parts.append(f"worktree: {name[idx + 4 :]}")
    if is_infra:
        detail_parts.append("infra")
    if name.endswith("-migrations"):
        detail_parts.append("job")
    if pod_restarts > 0:
        detail_parts.append(f"{pod_restarts} restart(s)")
    if pod_status_reason:
        detail_parts.append(pod_status_reason)
    if display_status == "building":
        detail_parts.append("building")

    detail = ", ".join(detail_parts) if detail_parts else ""

    services.append({"name": name, "status": display_status, "detail": detail})

    if display_status == "error":
        hint = f"check logs: reproctl logs {name}"
        if pod_status_reason:
            msg = f"{name} is in {pod_status_reason}"
            if pod_restarts > 0:
                msg += f" ({pod_restarts} restart(s))"
            msg += f" — {hint}"
        else:
            msg = f"{name} is in error state — {hint}"
        issues.append({"severity": "error", "message": msg})

for svc_name in configured:
    found = any(s["name"] == svc_name for s in services)
    if not found:
        services.append(
            {"name": svc_name, "status": "warn", "detail": "configured but not in Tilt"}
        )
        issues.append(
            {
                "severity": "warning",
                "message": f"{svc_name} is configured but not found in Tilt — try: reproctl restart --all",
            }
        )

json.dump({"services": services, "issues": issues}, sys.stdout)
