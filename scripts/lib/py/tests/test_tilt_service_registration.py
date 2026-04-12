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


def _watch_ignores(manifest):
    file_watch_ignores = manifest["DeployTarget"].get("FileWatchIgnores") or []
    return sorted(
        {
            pattern
            for entry in file_watch_ignores
            for pattern in entry.get("patterns", [])
        }
    )


class TestTiltServiceRegistration:
    def test_storybook_worktree_watches_app_root_and_workspace_dependencies(self):
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

        assert str(REPO_ROOT / "apps" / "storybook-ui") in deps
        assert str(REPO_ROOT / "packages" / "design") in deps
        assert ".storybook" not in "\n".join(deps)
        assert "**/node_modules/**" in _watch_ignores(manifest)

    def test_workspace_main_checkout_uses_dependency_aware_watch_paths(self):
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

        assert str(REPO_ROOT / "apps" / "workspace") in deps
        assert str(REPO_ROOT / "packages" / "design") in deps
        assert str(REPO_ROOT / "apps" / "workspace" / "src") not in deps
        assert "**/dist/**" in _watch_ignores(manifest)
