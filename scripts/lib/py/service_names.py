#!/usr/bin/env python3
"""Print all service names from services.json in sorted order."""

import sys

from service_manifest import list_service_names


def main():
    if len(sys.argv) < 2:
        print("Usage: service_names.py <services.json>", file=sys.stderr)
        sys.exit(1)

    for name in list_service_names(sys.argv[1]):
        print(name)


if __name__ == "__main__":
    main()
