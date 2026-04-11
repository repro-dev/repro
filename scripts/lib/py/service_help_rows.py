#!/usr/bin/env python3
"""Print tab-separated service rows for reproctl help text."""

import sys

from service_manifest import list_service_rows


def main():
    if len(sys.argv) < 2:
        print(
            "Usage: service_help_rows.py <services.json> [--launchable-only]",
            file=sys.stderr,
        )
        sys.exit(1)

    services_path = sys.argv[1]
    launchable_only = len(sys.argv) > 2 and sys.argv[2] == "--launchable-only"

    for row in list_service_rows(services_path, launchable_only=launchable_only):
        print(
            f"{row['name']}\t{row['description']}\t{row['launch_kind']}\t{row['launch_detail']}"
        )


if __name__ == "__main__":
    main()
