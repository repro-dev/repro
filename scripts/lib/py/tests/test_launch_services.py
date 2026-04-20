"""Tests for manifest-driven launch service helpers."""

import json

from conftest import run_repo_script, run_script


def slug_port_offset(slug):
    value = 0
    for char in slug:
        value = (value * 31 + ord(char)) & 0xFFFFFFFF
    return (value % 999) + 1


def write_services_json(tmp_path, services):
    path = tmp_path / "services.json"
    path.write_text(json.dumps(services), encoding="utf-8")
    return path


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


def test_service_names_lists_all_manifest_services_in_sorted_order(tmp_path):
    services_path = write_services_json(
        tmp_path,
        {
            "workspace": local_service("workspace"),
            "admin": local_service("admin"),
            "marketing": local_service("marketing"),
        },
    )

    result = run_script("service_names.py", args=[str(services_path)])

    assert result.returncode == 0
    assert result.stdout.splitlines() == ["admin", "marketing", "workspace"]


def test_launchable_services_follow_manifest_launch_entries(tmp_path):
    services_path = write_services_json(
        tmp_path,
        {
            "marketing": local_service(
                "marketing",
                portless_name="marketing.repro",
                launch={"kind": "url", "description": "Marketing site"},
            ),
            "capture": local_service(
                "capture", launch={"kind": "capture", "description": "Chrome extension"}
            ),
            "dev-toolbar": local_service("dev-toolbar"),
            "storybook-ui": local_service(
                "storybook-ui",
                port=6006,
                launch={"kind": "url", "description": "Storybook UI"},
            ),
        },
    )

    result = run_script("launchable_local_services.py", args=[str(services_path)])

    assert result.returncode == 0
    assert result.stdout.splitlines() == ["capture", "marketing", "storybook-ui"]


def test_local_service_url_uses_portless_host_for_worktree_slug(tmp_path):
    services_path = write_services_json(
        tmp_path,
        {
            "marketing": local_service(
                "marketing",
                portless_name="marketing.repro",
                launch={"kind": "url", "description": "Marketing site"},
            )
        },
    )

    result = run_script(
        "local_service_url.py", args=["marketing", str(services_path), "rep-745"]
    )

    assert result.returncode == 0
    assert result.stdout.strip() == "https://marketing.wt-rep-745.repro.localhost:1355"


def test_local_service_url_uses_port_offset_for_worktree_slug(tmp_path):
    services_path = write_services_json(
        tmp_path,
        {
            "storybook-ui": local_service(
                "storybook-ui",
                port=6006,
                launch={"kind": "url", "description": "Storybook UI"},
            )
        },
    )

    result = run_script(
        "local_service_url.py", args=["storybook-ui", str(services_path), "rep-745"]
    )

    assert result.returncode == 0
    assert (
        result.stdout.strip()
        == f"http://localhost:{6006 + slug_port_offset('rep-745')}"
    )


def test_local_service_url_rejects_start_only_services(tmp_path):
    services_path = write_services_json(
        tmp_path, {"dev-toolbar": local_service("dev-toolbar")}
    )

    result = run_script(
        "local_service_url.py", args=["dev-toolbar", str(services_path)]
    )

    assert result.returncode == 1


def test_validate_services_rejects_url_launch_without_url_surface(tmp_path):
    services_path = write_services_json(
        tmp_path,
        {
            "workspace": local_service(
                "workspace", launch={"kind": "url", "description": "Workspace app"}
            )
        },
    )

    result = run_repo_script(
        "scripts/validate-services.py", args=[str(services_path), str(tmp_path)]
    )

    assert result.returncode == 1
    assert "launch.kind=url requires portless_name or port" in result.stderr


def test_validate_services_allows_capture_launch_without_url_surface(tmp_path):
    services_path = write_services_json(
        tmp_path,
        {
            "capture": local_service(
                "capture", launch={"kind": "capture", "description": "Chrome extension"}
            )
        },
    )

    result = run_repo_script(
        "scripts/validate-services.py", args=[str(services_path), str(tmp_path)]
    )

    assert result.returncode == 0
