#!/usr/bin/env python3
"""Compute the localhost URL for a local service.

Reads services.json, checks if the service is type=local with a port
field, and prints the URL. For worktree contexts, applies the same
polynomial hash port offset as services.Tiltfile._slug_port_offset().

Exits 0 and prints the URL if the service is launchable.
Exits 1 if the service is not found, not local, or has no port.

Usage:
  local_service_url.py <service-name> <services-json-path> [<worktree-slug>]
"""

import json
import sys


def _slug_port_offset(slug):
    h = 0
    for c in slug:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return (h % 999) + 1


def main():
    if len(sys.argv) < 3:
        print(
            "Usage: local_service_url.py <service> <services.json> [slug]",
            file=sys.stderr,
        )
        sys.exit(1)

    service = sys.argv[1]
    services_path = sys.argv[2]
    slug = sys.argv[3] if len(sys.argv) > 3 else ""

    with open(services_path) as f:
        services = json.load(f)

    entry = services.get(service)
    if not entry:
        sys.exit(1)

    if entry.get("type") != "local" or "port" not in entry:
        sys.exit(1)

    port = entry["port"]
    if slug:
        port += _slug_port_offset(slug)

    print("http://localhost:%d" % port)


if __name__ == "__main__":
    main()
