"""Tests for Next local-service detection helpers."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from service_manifest import is_next_local_service


def write_package_json(tmp_path, app_dir, dependencies=None, dev_dependencies=None):
    package_json = tmp_path / app_dir / "package.json"
    package_json.parent.mkdir(parents=True, exist_ok=True)
    package_json.write_text(
        json.dumps(
            {
                "dependencies": dependencies or {},
                "devDependencies": dev_dependencies or {},
            }
        ),
        encoding="utf-8",
    )
    return package_json


def local_service(name, **overrides):
    service = {
        "type": "local",
        "moon_project": f"repro/{name}",
        "app_dir": f"apps/{name}",
        "serve_cmd": f"moon run repro/{name}:dev",
        "deps": [],
    }
    service.update(overrides)
    return service


def test_next_local_service_detects_next_dependency(tmp_path):
    entry = local_service("marketing")
    write_package_json(tmp_path, "apps/marketing", dependencies={"next": "^15.3.1"})

    assert is_next_local_service(entry, tmp_path) is True


def test_next_local_service_rejects_non_next_local_service(tmp_path):
    entry = local_service("dev-toolbar")
    write_package_json(tmp_path, "apps/dev-toolbar", dependencies={"react": "^19.0.0"})

    assert is_next_local_service(entry, tmp_path) is False


def test_next_local_service_rejects_non_local_services(tmp_path):
    entry = {"type": "remote", "app_dir": "apps/marketing"}

    assert is_next_local_service(entry, tmp_path) is False
