"""Tests for format_checkhealth.py."""

import json
import os
import tempfile

from conftest import run_script, run_script_json


def _make_item(name, runtime="ok", update="ok", pod_restarts=0, pod_status=""):
    item = {
        "metadata": {"name": name},
        "status": {
            "runtimeStatus": runtime,
            "updateStatus": update,
        },
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


class TestFormatCheckhealthServices:
    def test_empty_items(self):
        data = run_script_json("format_checkhealth.py", stdin=json.dumps({"items": []}))
        assert data["services"] == []
        assert data["issues"] == []

    def test_skips_tiltfile(self):
        data = run_script_json(
            "format_checkhealth.py",
            stdin=json.dumps({"items": [_make_item("(Tiltfile)")]}),
        )
        assert data["services"] == []

    def test_ok_service(self):
        svc_path = _write_json({"web": {}})
        try:
            data = run_script_json(
                "format_checkhealth.py",
                stdin=json.dumps({"items": [_make_item("web")]}),
                env={"SERVICES_JSON": svc_path},
            )
            assert len(data["services"]) == 1
            assert data["services"][0]["name"] == "web"
            assert data["services"][0]["status"] == "ok"
        finally:
            os.unlink(svc_path)

    def test_error_service_creates_issue(self):
        data = run_script_json(
            "format_checkhealth.py",
            stdin=json.dumps({"items": [_make_item("web", runtime="error")]}),
        )
        svc = data["services"][0]
        assert svc["status"] == "error"
        assert len(data["issues"]) == 1
        assert data["issues"][0]["severity"] == "error"
        assert "web" in data["issues"][0]["message"]

    def test_error_with_pod_status_and_restarts(self):
        data = run_script_json(
            "format_checkhealth.py",
            stdin=json.dumps(
                {
                    "items": [
                        _make_item(
                            "web",
                            runtime="error",
                            pod_restarts=5,
                            pod_status="CrashLoopBackOff",
                        )
                    ]
                }
            ),
        )
        svc = data["services"][0]
        assert "5 restart(s)" in svc["detail"]
        assert "CrashLoopBackOff" in svc["detail"]
        issue = data["issues"][0]
        assert "CrashLoopBackOff" in issue["message"]
        assert "5 restart(s)" in issue["message"]

    def test_building_status(self):
        data = run_script_json(
            "format_checkhealth.py",
            stdin=json.dumps(
                {"items": [_make_item("web", runtime="pending", update="in_progress")]}
            ),
        )
        assert data["services"][0]["status"] == "building"
        assert "building" in data["services"][0]["detail"]

    def test_pending_status(self):
        data = run_script_json(
            "format_checkhealth.py",
            stdin=json.dumps(
                {"items": [_make_item("web", runtime="pending", update="pending")]}
            ),
        )
        assert data["services"][0]["status"] == "pending"

    def test_not_applicable_treated_as_ok(self):
        data = run_script_json(
            "format_checkhealth.py",
            stdin=json.dumps(
                {
                    "items": [
                        _make_item("redis", runtime="not_applicable", update="none")
                    ]
                }
            ),
        )
        assert data["services"][0]["status"] == "ok"

    def test_infra_detail(self):
        data = run_script_json(
            "format_checkhealth.py",
            stdin=json.dumps({"items": [_make_item("redis")]}),
        )
        assert "infra" in data["services"][0]["detail"]

    def test_worktree_service_detail(self):
        svc_path = _write_json({"web": {}})
        try:
            data = run_script_json(
                "format_checkhealth.py",
                stdin=json.dumps({"items": [_make_item("web-wt-feat-x")]}),
                env={"SERVICES_JSON": svc_path},
            )
            assert "worktree: feat-x" in data["services"][0]["detail"]
        finally:
            os.unlink(svc_path)

    def test_migrations_job_detail(self):
        data = run_script_json(
            "format_checkhealth.py",
            stdin=json.dumps({"items": [_make_item("api-migrations")]}),
        )
        assert "job" in data["services"][0]["detail"]


class TestFormatCheckhealthConfigured:
    def test_configured_service_missing_from_tilt(self):
        cfg_path = _write_json({"services": [{"name": "web", "slug": ""}]})
        try:
            data = run_script_json(
                "format_checkhealth.py",
                stdin=json.dumps({"items": []}),
                env={"CONFIG_FILE": cfg_path},
            )
            assert len(data["services"]) == 1
            assert data["services"][0]["name"] == "web"
            assert data["services"][0]["status"] == "warn"
            assert "configured but not in Tilt" in data["services"][0]["detail"]
            assert len(data["issues"]) == 1
            assert data["issues"][0]["severity"] == "warning"
        finally:
            os.unlink(cfg_path)

    def test_configured_service_present_in_tilt_no_warning(self):
        cfg_path = _write_json({"services": [{"name": "web", "slug": ""}]})
        try:
            data = run_script_json(
                "format_checkhealth.py",
                stdin=json.dumps({"items": [_make_item("web")]}),
                env={"CONFIG_FILE": cfg_path},
            )
            statuses = [s["status"] for s in data["services"]]
            assert "warn" not in statuses
            assert len(data["issues"]) == 0
        finally:
            os.unlink(cfg_path)

    def test_configured_worktree_service_missing(self):
        cfg_path = _write_json({"services": [{"name": "web", "slug": "feat-x"}]})
        try:
            data = run_script_json(
                "format_checkhealth.py",
                stdin=json.dumps({"items": []}),
                env={"CONFIG_FILE": cfg_path},
            )
            assert data["services"][0]["name"] == "web-wt-feat-x"
            assert data["services"][0]["status"] == "warn"
        finally:
            os.unlink(cfg_path)


class TestFormatCheckhealthUnknownStatus:
    def test_unknown_runtime_maps_to_unknown(self):
        data = run_script_json(
            "format_checkhealth.py",
            stdin=json.dumps(
                {"items": [_make_item("web", runtime="weird", update="ok")]}
            ),
        )
        assert data["services"][0]["status"] == "unknown"
