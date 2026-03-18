"""Tests for resolve_deps.py — transitive dependency resolution."""

import json
import os
import tempfile

from conftest import run_script_json


SERVICES = {
    "api-server": {
        "migrations": {
            "moon_task": "repro/api-server:migrate",
            "resource_deps": ["database-ready", "storage-ready"],
        },
        "seed": {
            "pnpm_package": "@repro/api-server",
            "resource_deps": ["storage-s3-forward"],
        },
        "deps": [],
    },
    "workspace": {
        "migrations": None,
        "deps": ["api-server"],
    },
    "capture": {
        "type": "local",
        "resource_deps": ["dependencies"],
        "deps": [],
    },
    "storybook-ui": {
        "type": "local",
        "resource_deps": ["dependencies"],
        "deps": [],
    },
}


def _write_services(data):
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    json.dump(data, f)
    f.close()
    return f.name


class TestResolveDeps:
    def test_service_with_no_deps(self):
        path = _write_services(SERVICES)
        try:
            data = run_script_json("resolve_deps.py", args=[path, "capture"])
            assert data["targets"] == ["capture"]
            assert sorted(data["deps"]) == ["dependencies"]
        finally:
            os.unlink(path)

    def test_service_with_infra_deps(self):
        path = _write_services(SERVICES)
        try:
            data = run_script_json("resolve_deps.py", args=[path, "api-server"])
            assert data["targets"] == ["api-server"]
            deps = sorted(data["deps"])
            assert "database-ready" in deps
            assert "storage-ready" in deps
            assert "api-server-migrations" in deps
            assert "storage-s3-forward" in deps
        finally:
            os.unlink(path)

    def test_transitive_service_deps(self):
        path = _write_services(SERVICES)
        try:
            data = run_script_json("resolve_deps.py", args=[path, "workspace"])
            assert data["targets"] == ["workspace"]
            deps = sorted(data["deps"])
            assert "api-server" in deps
            assert "api-server-migrations" in deps
            assert "database-ready" in deps
            assert "storage-ready" in deps
        finally:
            os.unlink(path)

    def test_multiple_targets(self):
        path = _write_services(SERVICES)
        try:
            data = run_script_json(
                "resolve_deps.py", args=[path, "api-server", "capture"]
            )
            assert data["targets"] == ["api-server", "capture"]
            deps = sorted(data["deps"])
            assert "database-ready" in deps
            assert "dependencies" in deps
        finally:
            os.unlink(path)

    def test_unknown_service(self):
        path = _write_services(SERVICES)
        try:
            data = run_script_json("resolve_deps.py", args=[path, "nonexistent"])
            assert data["targets"] == ["nonexistent"]
            assert data["deps"] == []
        finally:
            os.unlink(path)

    def test_null_migrations_excluded(self):
        path = _write_services(SERVICES)
        try:
            data = run_script_json("resolve_deps.py", args=[path, "workspace"])
            deps = data["deps"]
            assert "workspace-migrations" not in deps
        finally:
            os.unlink(path)

    def test_no_args_returns_empty(self):
        path = _write_services(SERVICES)
        try:
            data = run_script_json("resolve_deps.py", args=[path])
            assert data["targets"] == []
            assert data["deps"] == []
        finally:
            os.unlink(path)
