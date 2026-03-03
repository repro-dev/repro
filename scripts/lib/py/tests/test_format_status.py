"""Tests for format_status.py."""

import json
import os
import tempfile

from conftest import run_script


def _make_item(name, runtime="ok", update="ok", pod_restarts=0, pod_status=""):
    item = {
        "metadata": {"name": name},
        "status": {"runtimeStatus": runtime, "updateStatus": update},
    }
    if pod_restarts or pod_status:
        item["status"]["k8sResourceInfo"] = {
            "podRestarts": pod_restarts,
            "podStatusMessage": pod_status,
        }
    return item


def _write_json(data):
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
    json.dump(data, f)
    f.close()
    return f.name


class TestFormatStatus:
    def test_empty_items(self):
        result = run_script("format_status.py", stdin=json.dumps({"items": []}))
        assert result.returncode == 0
        assert result.stdout.strip() == "(none)"

    def test_skips_tiltfile(self):
        data = {"items": [_make_item("(Tiltfile)")]}
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert result.returncode == 0
        assert result.stdout.strip() == "(none)"

    def test_ok_status(self):
        data = {"items": [_make_item("redis", "ok", "ok")]}
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert "redis" in result.stdout
        assert "ok" in result.stdout

    def test_not_applicable_treated_as_ok(self):
        data = {"items": [_make_item("redis", "not_applicable", "not_applicable")]}
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert "ok" in result.stdout

    def test_error_status(self):
        data = {"items": [_make_item("web", "error", "ok")]}
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert "error" in result.stdout

    def test_building_status(self):
        data = {"items": [_make_item("web", "pending", "in_progress")]}
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert "building" in result.stdout

    def test_pending_status(self):
        data = {"items": [_make_item("web", "pending", "pending")]}
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert "pending" in result.stdout

    def test_worktree_resource_type(self):
        data = {"items": [_make_item("web-wt-feat-x")]}
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert "service [wt:feat-x]" in result.stdout

    def test_known_service_type(self):
        svc_path = _write_json({"web": {}, "api": {}})
        try:
            data = {"items": [_make_item("web")]}
            result = run_script(
                "format_status.py",
                stdin=json.dumps(data),
                env={"SERVICES_JSON": svc_path},
            )
            assert "service" in result.stdout
            assert "infra" not in result.stdout
        finally:
            os.unlink(svc_path)

    def test_migrations_job_type(self):
        data = {"items": [_make_item("api-migrations")]}
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert "job" in result.stdout

    def test_infra_type_for_unknown(self):
        data = {"items": [_make_item("redis")]}
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert "infra" in result.stdout

    def test_auto_annotation_for_unconfigured_service(self):
        svc_path = _write_json({"web": {}})
        cfg_path = _write_json({"services": []})
        try:
            data = {"items": [_make_item("web")]}
            result = run_script(
                "format_status.py",
                stdin=json.dumps(data),
                env={"SERVICES_JSON": svc_path, "CONFIG_FILE": cfg_path},
            )
            assert "(auto)" in result.stdout
        finally:
            os.unlink(svc_path)
            os.unlink(cfg_path)

    def test_no_auto_for_configured_service(self):
        svc_path = _write_json({"web": {}})
        cfg_path = _write_json({"services": [{"name": "web", "slug": ""}]})
        try:
            data = {"items": [_make_item("web")]}
            result = run_script(
                "format_status.py",
                stdin=json.dumps(data),
                env={"SERVICES_JSON": svc_path, "CONFIG_FILE": cfg_path},
            )
            assert "(auto)" not in result.stdout
        finally:
            os.unlink(svc_path)
            os.unlink(cfg_path)

    def test_column_alignment(self):
        data = {
            "items": [
                _make_item("redis"),
                _make_item("api-server-long-name"),
            ]
        }
        result = run_script("format_status.py", stdin=json.dumps(data))
        lines = [l for l in result.stdout.splitlines() if l.strip()]
        assert len(lines) == 2
        col1_positions = [l.index("ok") for l in lines]
        assert col1_positions[0] == col1_positions[1]

    def test_pod_restarts_shown_when_nonzero(self):
        data = {"items": [_make_item("web-wt-x", pod_restarts=3)]}
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert "3 restart(s)" in result.stdout

    def test_pod_restarts_hidden_when_zero(self):
        data = {"items": [_make_item("web-wt-x", pod_restarts=0)]}
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert "restart" not in result.stdout

    def test_pod_status_reason_shown_for_error(self):
        data = {
            "items": [
                _make_item(
                    "web-wt-x",
                    runtime="error",
                    pod_status="CrashLoopBackOff",
                )
            ]
        }
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert "CrashLoopBackOff" in result.stdout

    def test_pod_status_and_restarts_combined(self):
        data = {
            "items": [
                _make_item(
                    "web-wt-x",
                    runtime="error",
                    pod_restarts=5,
                    pod_status="CrashLoopBackOff",
                )
            ]
        }
        result = run_script("format_status.py", stdin=json.dumps(data))
        assert "CrashLoopBackOff" in result.stdout
        assert "5 restart(s)" in result.stdout
        line = [l for l in result.stdout.splitlines() if "web-wt-x" in l][0]
        assert "CrashLoopBackOff, 5 restart(s)" in line

    def test_configured_but_missing_shows_warning(self):
        cfg_path = _write_json({"services": [{"name": "capture", "slug": "y"}]})
        try:
            data = {"items": [_make_item("redis")]}
            result = run_script(
                "format_status.py",
                stdin=json.dumps(data),
                env={"CONFIG_FILE": cfg_path},
            )
            assert "capture-wt-y" in result.stdout
            assert "warn" in result.stdout
            assert "not in Tilt" in result.stdout
        finally:
            os.unlink(cfg_path)

    def test_configured_service_present_no_warning(self):
        cfg_path = _write_json({"services": [{"name": "web", "slug": "x"}]})
        try:
            data = {"items": [_make_item("web-wt-x")]}
            result = run_script(
                "format_status.py",
                stdin=json.dumps(data),
                env={"CONFIG_FILE": cfg_path},
            )
            assert "not in Tilt" not in result.stdout
        finally:
            os.unlink(cfg_path)

    def test_no_detail_column_when_nothing_notable(self):
        data = {"items": [_make_item("redis"), _make_item("postgres")]}
        result = run_script("format_status.py", stdin=json.dumps(data))
        for line in result.stdout.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            parts = stripped.split()
            assert "restart" not in stripped
            assert "CrashLoopBackOff" not in stripped
            assert "not in Tilt" not in stripped

    def test_column_alignment_with_detail(self):
        svc_path = _write_json({"web": {}, "api": {}})
        try:
            data = {
                "items": [
                    _make_item("web", pod_restarts=3),
                    _make_item("api"),
                    _make_item("redis"),
                ]
            }
            result = run_script(
                "format_status.py",
                stdin=json.dumps(data),
                env={"SERVICES_JSON": svc_path},
            )
            lines = [l for l in result.stdout.splitlines() if l.strip()]
            assert len(lines) == 3
            ok_positions = set()
            for line in lines:
                idx = line.index("ok")
                ok_positions.add(idx)
            assert len(ok_positions) == 1
        finally:
            os.unlink(svc_path)
