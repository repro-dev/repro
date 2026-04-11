#!/usr/bin/env python3
"""List local services that are explicitly launchable.

Prints one service name per line to stdout.
Exits 0 always (empty output if no launchable local services).

Usage:
  launchable_local_services.py <services-json-path>
"""

import sys

from service_manifest import list_launchable_service_names


def main():
    if len(sys.argv) < 2:
        print("Usage: launchable_local_services.py <services.json>", file=sys.stderr)
        sys.exit(1)

    for name in list_launchable_service_names(sys.argv[1]):
        print(name)


if __name__ == "__main__":
    main()
