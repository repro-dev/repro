"""Tests for is_known_service.py and check_migrations.py."""

import json
import tempfile
import os

from conftest import run_script


class TestIsKnownService:
    def _write_services(self, data):
        f = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        json.dump(data, f)
        f.close()
        return f.name

    def test_known_service_exits_0(self):
        path = self._write_services({"web": {}, "api": {}})
        try:
            result = run_script("is_known_service.py", args=["web", path])
            assert result.returncode == 0
        finally:
            os.unlink(path)

    def test_unknown_service_exits_1(self):
        path = self._write_services({"web": {}, "api": {}})
        try:
            result = run_script("is_known_service.py", args=["unknown", path])
            assert result.returncode == 1
        finally:
            os.unlink(path)


class TestCheckMigrations:
    def _write_services(self, data):
        f = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        json.dump(data, f)
        f.close()
        return f.name

    def test_service_with_migrations(self):
        path = self._write_services({"api": {"migrations": {"path": "migrations/"}}})
        try:
            result = run_script(
                "check_migrations.py",
                env={"SERVICES_JSON": path, "SVC_NAME": "api"},
            )
            assert result.returncode == 0
            assert result.stdout.strip() == "yes"
        finally:
            os.unlink(path)

    def test_service_without_migrations(self):
        path = self._write_services({"api": {}})
        try:
            result = run_script(
                "check_migrations.py",
                env={"SERVICES_JSON": path, "SVC_NAME": "api"},
            )
            assert result.returncode == 0
            assert result.stdout.strip() == "no"
        finally:
            os.unlink(path)

    def test_unknown_service(self):
        path = self._write_services({"api": {}})
        try:
            result = run_script(
                "check_migrations.py",
                env={"SERVICES_JSON": path, "SVC_NAME": "unknown"},
            )
            assert result.returncode == 0
            assert result.stdout.strip() == "no"
        finally:
            os.unlink(path)
