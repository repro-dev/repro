"""Regression tests for Tilt local resource watch registration."""

import json
import os
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
INFRA_DIR = REPO_ROOT / "infra"
CONFIG_PATH = REPO_ROOT / "tmp" / "reproctl_services.json"


def _render_tilt(services):
    previous = CONFIG_PATH.read_text() if CONFIG_PATH.exists() else None

    try:
        CONFIG_PATH.write_text(json.dumps({"services": services}))

        result = subprocess.run(
            ["tilt", "alpha", "tiltfile-result", "-f", "Tiltfile"],
            cwd=INFRA_DIR,
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": ""},
            check=False,
        )

        assert result.returncode == 0, result.stderr
        return json.loads(result.stdout)
    finally:
        if previous is None:
            CONFIG_PATH.unlink(missing_ok=True)
        else:
            CONFIG_PATH.write_text(previous)


def _manifest(tilt_result, name):
    for manifest in tilt_result["Manifests"]:
        if manifest["Name"] == name:
            return manifest

    raise AssertionError(f"Missing manifest: {name}")


def _serve_env(manifest):
    env = {}
    for item in manifest["DeployTarget"]["ServeCmd"]["Env"]:
        key, _, value = item.partition("=")
        env[key] = value
    return env


class TestTiltServiceRegistration:
    def test_storybook_worktree_watches_only_manifest_files(self):
        tilt_result = _render_tilt(
            [
                {
                    "name": "storybook-ui",
                    "source": str(REPO_ROOT),
                    "slug": "rep-397",
                }
            ]
        )

        manifest = _manifest(tilt_result, "storybook-ui-wt-rep-397")
        deps = manifest["DeployTarget"].get("Deps") or []

        # Only manifest files watched — dev server handles source file watching.
        assert str(REPO_ROOT / "pnpm-lock.yaml") in deps
        assert str(REPO_ROOT / "apps" / "storybook-ui" / "package.json") in deps

        # Source dirs and transitive dep packages must not be in watchedPaths;
        # they caused infinite restart loops when codegen ran during startup.
        assert str(REPO_ROOT / "packages" / "design") not in deps
        assert str(REPO_ROOT / "apps" / "storybook-ui") not in deps

    def test_workspace_watches_only_manifest_files(self):
        tilt_result = _render_tilt(
            [
                {
                    "name": "workspace",
                    "source": ".",
                    "slug": "",
                }
            ]
        )

        manifest = _manifest(tilt_result, "workspace")
        deps = manifest["DeployTarget"].get("Deps") or []

        # Only manifest files watched — Vite handles source file watching.
        assert str(REPO_ROOT / "pnpm-lock.yaml") in deps
        assert str(REPO_ROOT / "apps" / "workspace" / "package.json") in deps

        # Source dirs and transitive dep packages must not be in watchedPaths.
        assert str(REPO_ROOT / "packages" / "design") not in deps
        assert str(REPO_ROOT / "apps" / "workspace") not in deps
        assert str(REPO_ROOT / "apps" / "workspace" / "src") not in deps

    def test_worktree_dependency_services_stay_in_worktree(self):
        tilt_result = _render_tilt(
            [
                {
                    "name": "workspace",
                    "source": str(REPO_ROOT),
                    "slug": "rep-397",
                }
            ]
        )

        workspace = _manifest(tilt_result, "workspace-wt-rep-397")
        _manifest(tilt_result, "api-server-wt-rep-397")

        assert "dependencies-wt-rep-397" in workspace["ResourceDependencies"]

        env = _serve_env(workspace)
        assert env["REPRO_APP_URL"] == "https://app.wt-rep-397.repro.localhost:1355"
        assert env["REPRO_API_URL"] == "https://api.wt-rep-397.repro.localhost:1355"

    def test_worktree_dependencies_do_not_get_suppressed_by_main_checkout_services(self):
        tilt_result = _render_tilt(
            [
                {
                    "name": "api-server",
                    "source": ".",
                    "slug": "",
                },
                {
                    "name": "workspace",
                    "source": str(REPO_ROOT),
                    "slug": "rep-397",
                },
                {
                    "name": "admin",
                    "source": str(REPO_ROOT),
                    "slug": "rep-397",
                },
            ]
        )

        api_server = _manifest(tilt_result, "api-server-wt-rep-397")
        workspace = _manifest(tilt_result, "workspace-wt-rep-397")
        admin = _manifest(tilt_result, "admin-wt-rep-397")

        assert "dependencies-wt-rep-397" in workspace["ResourceDependencies"]
        assert "dependencies-wt-rep-397" in admin["ResourceDependencies"]

        workspace_env = _serve_env(workspace)
        admin_env = _serve_env(admin)

        assert workspace_env["REPRO_API_URL"] == "https://api.wt-rep-397.repro.localhost:1355"
        assert admin_env["REPRO_API_URL"] == "https://api.wt-rep-397.repro.localhost:1355"
        assert api_server["Name"] == "api-server-wt-rep-397"
