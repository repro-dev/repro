#!/usr/bin/env python3
"""Validate infra/services.json for structural correctness.

Exits 0 if valid, 1 with diagnostic messages if not.
Called by reproctl.sh before starting services.

Usage:
  validate-services.py <path-to-services.json> <infra-dir> [<service-name>...]

If service names are provided, also checks that each one exists in the file.
"""

import json
import os
import sys

REQUIRED_KEYS = {
    "moon_project": str,
    "docker_target": str,
    "chart": str,
    "app_dir": str,
    "helm_sets": list,
    "ingress": dict,
    "deps": list,
}

LOCAL_REQUIRED_KEYS = {
    "moon_project": str,
    "app_dir": str,
    "serve_cmd": str,
    "deps": list,
}

MIGRATION_KEYS = {
    "moon_task": str,
    "resource_deps": list,
}

LAUNCH_KEYS = {
    "kind": str,
    "description": str,
}


def validate(services_path, infra_dir, requested_services):
    errors = []

    try:
        with open(services_path) as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        errors.append("Invalid JSON: %s" % e)
        return errors
    except FileNotFoundError:
        errors.append("File not found: %s" % services_path)
        return errors

    if not isinstance(data, dict):
        errors.append("Top-level value must be an object, got %s" % type(data).__name__)
        return errors

    all_service_names = set(data.keys())

    for name, svc in data.items():
        prefix = "[%s]" % name

        if not isinstance(svc, dict):
            errors.append("%s must be an object, got %s" % (prefix, type(svc).__name__))
            continue

        svc_type = svc.get("type", "k8s")

        if svc_type == "local":
            for key, expected_type in LOCAL_REQUIRED_KEYS.items():
                if key not in svc:
                    errors.append("%s missing required key: %s" % (prefix, key))
                elif not isinstance(svc[key], expected_type):
                    errors.append(
                        "%s %s must be %s, got %s"
                        % (prefix, key, expected_type.__name__, type(svc[key]).__name__)
                    )

            if "serve_env" in svc and not isinstance(svc["serve_env"], dict):
                errors.append(
                    "%s serve_env must be dict, got %s"
                    % (prefix, type(svc["serve_env"]).__name__)
                )
            if "description" in svc and not isinstance(svc["description"], str):
                errors.append(
                    "%s description must be str, got %s"
                    % (prefix, type(svc["description"]).__name__)
                )
            if "resource_deps" in svc and not isinstance(svc["resource_deps"], list):
                errors.append(
                    "%s resource_deps must be list, got %s"
                    % (prefix, type(svc["resource_deps"]).__name__)
                )
            if "labels" in svc and not isinstance(svc["labels"], list):
                errors.append(
                    "%s labels must be list, got %s"
                    % (prefix, type(svc["labels"]).__name__)
                )
            if "portless_name" in svc and not isinstance(svc["portless_name"], str):
                errors.append(
                    "%s portless_name must be str, got %s"
                    % (prefix, type(svc["portless_name"]).__name__)
                )
            if "port" in svc and not isinstance(svc["port"], int):
                errors.append(
                    "%s port must be int, got %s" % (prefix, type(svc["port"]).__name__)
                )

            launch = svc.get("launch")
            if launch is not None:
                if not isinstance(launch, dict):
                    errors.append(
                        "%s launch must be an object, got %s"
                        % (prefix, type(launch).__name__)
                    )
                else:
                    for key, expected_type in LAUNCH_KEYS.items():
                        if key not in launch:
                            errors.append(
                                "%s launch missing required key: %s" % (prefix, key)
                            )
                        elif not isinstance(launch[key], expected_type):
                            errors.append(
                                "%s launch.%s must be %s, got %s"
                                % (
                                    prefix,
                                    key,
                                    expected_type.__name__,
                                    type(launch[key]).__name__,
                                )
                            )

                    launch_kind = launch.get("kind")
                    if launch_kind not in ("url", "capture"):
                        errors.append(
                            "%s launch.kind must be one of: url, capture" % prefix
                        )
                    elif (
                        launch_kind == "url"
                        and "portless_name" not in svc
                        and "port" not in svc
                    ):
                        errors.append(
                            "%s launch.kind=url requires portless_name or port" % prefix
                        )

        elif svc_type == "k8s":
            for key, expected_type in REQUIRED_KEYS.items():
                if key not in svc:
                    errors.append("%s missing required key: %s" % (prefix, key))
                elif not isinstance(svc[key], expected_type):
                    errors.append(
                        "%s %s must be %s, got %s"
                        % (prefix, key, expected_type.__name__, type(svc[key]).__name__)
                    )

            chart = svc.get("chart", "")
            if chart:
                chart_path = os.path.join(infra_dir, chart)
                if not os.path.isdir(chart_path):
                    errors.append(
                        "%s chart path does not exist: %s" % (prefix, chart_path)
                    )

            migrations = svc.get("migrations")
            if migrations is not None:
                if not isinstance(migrations, dict):
                    errors.append(
                        "%s migrations must be an object or null, got %s"
                        % (prefix, type(migrations).__name__)
                    )
                else:
                    for key, expected_type in MIGRATION_KEYS.items():
                        if key not in migrations:
                            errors.append(
                                "%s migrations missing required key: %s" % (prefix, key)
                            )
                        elif not isinstance(migrations[key], expected_type):
                            errors.append(
                                "%s migrations.%s must be %s, got %s"
                                % (
                                    prefix,
                                    key,
                                    expected_type.__name__,
                                    type(migrations[key]).__name__,
                                )
                            )

        else:
            errors.append("%s invalid type: %s" % (prefix, svc_type))
            continue

        deps = svc.get("deps", [])
        if isinstance(deps, list):
            for dep in deps:
                if dep not in all_service_names:
                    errors.append(
                        "%s deps references unknown service: %s" % (prefix, dep)
                    )

    for req in requested_services:
        if req not in all_service_names:
            errors.append(
                "Requested service '%s' not found in %s. Available: %s"
                % (
                    req,
                    os.path.basename(services_path),
                    ", ".join(sorted(all_service_names)),
                )
            )

    return errors


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(
            "Usage: validate-services.py <services.json> <infra-dir> [<service>...]",
            file=sys.stderr,
        )
        sys.exit(2)

    services_path = sys.argv[1]
    infra_dir = sys.argv[2]
    requested = sys.argv[3:]

    errors = validate(services_path, infra_dir, requested)

    if errors:
        for err in errors:
            print("  - %s" % err, file=sys.stderr)
        sys.exit(1)
