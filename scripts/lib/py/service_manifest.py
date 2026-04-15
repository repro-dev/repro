#!/usr/bin/env python3
"""Shared helpers for reading reproctl service manifest data."""

from __future__ import annotations

import json


def load_services(path):
    with open(path, encoding="utf-8") as file:
        return json.load(file)


def iter_services(path):
    services = load_services(path)
    for name in sorted(services):
        yield name, services[name]


def list_service_names(path):
    return [name for name, _entry in iter_services(path)]


def get_launch(entry):
    launch = entry.get("launch")
    if isinstance(launch, dict):
        return launch
    return None


def list_launchable_service_names(path):
    names = []
    for name, entry in iter_services(path):
        if entry.get("type") != "local":
            continue
        if get_launch(entry) is None:
            continue
        names.append(name)
    return names


def describe_service(entry):
    description = entry.get("description")
    if isinstance(description, str) and description:
        return description
    if entry.get("type") == "local":
        return "Local service"
    return "Service"


def list_service_rows(path, *, launchable_only=False):
    rows = []
    for name, entry in iter_services(path):
        launch = get_launch(entry)
        if launchable_only and launch is None:
            continue
        rows.append(
            {
                "name": name,
                "description": describe_service(entry),
                "launch_kind": launch.get("kind", "") if launch else "",
                "launch_detail": describe_launch(entry, launch),
            }
        )
    return rows


def describe_launch(entry, launch):
    if launch is None:
        return ""

    kind = launch.get("kind")
    if kind == "capture":
        return "(Playwright Chromium + --load-extension)"

    portless_name = entry.get("portless_name")
    if isinstance(portless_name, str) and portless_name:
        return f"({portless_name}.localhost)"

    if isinstance(entry.get("port"), int):
        return "(localhost)"

    return ""


def slug_port_offset(slug):
    value = 0
    for char in slug:
        value = (value * 31 + ord(char)) & 0xFFFFFFFF
    return (value % 999) + 1


def portless_name_for_slug(slug: str) -> str:
    """Return a short, stable DNS-safe identifier for a worktree slug.

    Mirrors the Starlark wt_portless_name() in infra/tilt-lib/services.Tiltfile.
    When slug is short (≤60 chars after normalization), return it normalized.
    When longer, derive 'rep-NNN-HHHH' from the Linear issue number in the slug.
    Falls back to a 4-char hash when no issue number is found.
    """
    MAX = 60  # 63 - len('wt-')

    # Normalize: replace . and _ with -, strip leading/trailing hyphens.
    slug = slug.replace(".", "-").replace("_", "-").strip("-") or "wt"

    if len(slug) <= MAX:
        return slug

    # Extract 'rep-NNN' from anywhere in the slug.
    import re

    m = re.search(r"rep-(\d+)", slug)
    issue_part = f"rep-{m.group(1)}" if m else ""

    # Deterministic 4-char hex hash of the original (normalized) slug.
    h = 0
    for c in slug:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    hash4 = ("0000" + format(h, "x"))[-4:]

    if issue_part:
        return f"{issue_part}-{hash4}"
    return hash4


def portless_host(portless_name, slug=""):
    full_host = f"{portless_name}.localhost"

    if not slug:
        return full_host

    dns = portless_name_for_slug(slug)
    label, separator, remainder = full_host.partition(".")
    if separator:
        return f"{label}.wt-{dns}.{remainder}"

    return f"{full_host}.wt-{dns}"


def resolve_local_service_url(service, services_path, slug=""):
    services = load_services(services_path)
    entry = services.get(service)
    if not entry or entry.get("type") != "local":
        return None

    launch = get_launch(entry)
    if launch is None or launch.get("kind") != "url":
        return None

    portless_name = entry.get("portless_name")
    if isinstance(portless_name, str) and portless_name:
        return f"http://{portless_host(portless_name, slug)}:1355"

    port = entry.get("port")
    if isinstance(port, int):
        if slug:
            port += slug_port_offset(slug)
        return f"http://localhost:{port}"

    return None
