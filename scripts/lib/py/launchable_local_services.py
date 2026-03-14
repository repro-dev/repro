#!/usr/bin/env python3
"""List local services that have a port field (i.e. are launchable).

Prints one service name per line to stdout.
Exits 0 always (empty output if no launchable local services).

Usage:
  launchable_local_services.py <services-json-path>
"""

import json
import sys


def main():
    if len(sys.argv) < 2:
        print("Usage: launchable_local_services.py <services.json>", file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1]) as f:
        services = json.load(f)

    for name, entry in sorted(services.items()):
        if entry.get("type") == "local" and "port" in entry:
            print(name)


if __name__ == "__main__":
    main()
