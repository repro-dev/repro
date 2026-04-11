#!/usr/bin/env python3
"""Compute the browser URL for a launchable local service.

Exits 0 and prints the URL if the service has launch.kind=url and a URL
surface in services.json.
Exits 1 if the service is not found, not local, or has no browser URL.

Usage:
  local_service_url.py <service-name> <services-json-path> [<worktree-slug>]
"""

import sys

from service_manifest import resolve_local_service_url


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

    url = resolve_local_service_url(service, services_path, slug)
    if not url:
        sys.exit(1)

    print(url)


if __name__ == "__main__":
    main()
