#!/usr/bin/env python3
"""Print the .next output path for a Next local service."""

import sys

from service_manifest import get_next_local_service_output_dir, load_services


def main():
    if len(sys.argv) < 4:
        print(
            "Usage: next_service_output_dir.py <services.json> <repo-root> <service>",
            file=sys.stderr,
        )
        sys.exit(1)

    services_path, repo_root, service_name = sys.argv[1:4]
    services = load_services(services_path)
    entry = services.get(service_name)
    if entry is None:
        sys.exit(1)

    output_dir = get_next_local_service_output_dir(entry, repo_root)
    if output_dir is None:
        sys.exit(1)

    print(output_dir)


if __name__ == "__main__":
    main()
