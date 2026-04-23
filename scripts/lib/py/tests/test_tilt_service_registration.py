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


def _read_json(path):
  return json.loads(path.read_text())


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

        assert api_server["Name"] == "api-server-wt-rep-397"
        assert workspace["Name"] == "workspace-wt-rep-397"
        assert admin["Name"] == "admin-wt-rep-397"
        assert "dependencies-wt-rep-397" in workspace["ResourceDependencies"]
        assert "dependencies-wt-rep-397" in admin["ResourceDependencies"]

        workspace_env = _serve_env(workspace)
        admin_env = _serve_env(admin)

        assert workspace_env["REPRO_API_URL"] == "https://api.wt-rep-397.repro.localhost:1355"
        assert admin_env["REPRO_API_URL"] == "https://api.wt-rep-397.repro.localhost:1355"
        assert api_server["Name"] == "api-server-wt-rep-397"

    def test_worktree_service_urls_stay_scoped_per_slug(self):
        first_wt = str(REPO_ROOT / "tmp" / "worktree-one")
        second_wt = str(REPO_ROOT / "tmp" / "worktree-two")

        tilt_result = _render_tilt(
            [
                {"name": "workspace", "source": first_wt, "slug": "rep-397"},
                {"name": "api-server", "source": first_wt, "slug": "rep-397"},
                {"name": "admin", "source": first_wt, "slug": "rep-397"},
                {"name": "workspace", "source": second_wt, "slug": "rep-812"},
                {"name": "api-server", "source": second_wt, "slug": "rep-812"},
                {"name": "admin", "source": second_wt, "slug": "rep-812"},
            ]
        )

        first_workspace = _manifest(tilt_result, "workspace-wt-rep-397")
        first_admin = _manifest(tilt_result, "admin-wt-rep-397")
        second_workspace = _manifest(tilt_result, "workspace-wt-rep-812")
        second_admin = _manifest(tilt_result, "admin-wt-rep-812")

        first_env = _serve_env(first_workspace)
        first_admin_env = _serve_env(first_admin)
        second_env = _serve_env(second_workspace)
        second_admin_env = _serve_env(second_admin)

        assert first_env["REPRO_APP_URL"] == "https://app.wt-rep-397.repro.localhost:1355"
        assert first_env["REPRO_API_URL"] == "https://api.wt-rep-397.repro.localhost:1355"
        assert first_admin_env["REPRO_ADMIN_URL"] == "https://admin.wt-rep-397.repro.localhost:1355"
        assert second_env["REPRO_APP_URL"] == "https://app.wt-rep-812.repro.localhost:1355"
        assert second_env["REPRO_API_URL"] == "https://api.wt-rep-812.repro.localhost:1355"
        assert second_admin_env["REPRO_ADMIN_URL"] == "https://admin.wt-rep-812.repro.localhost:1355"

    def test_standalone_worktree_services_do_not_fall_back_to_main_checkout_urls(self):
        tilt_result = _render_tilt(
            [
                {"name": "marketing", "source": str(REPO_ROOT), "slug": "rep-397"},
                {"name": "api-server", "source": str(REPO_ROOT), "slug": "rep-397"},
            ]
        )

        marketing = _manifest(tilt_result, "marketing-wt-rep-397")
        api_server = _manifest(tilt_result, "api-server-wt-rep-397")

        marketing_env = _serve_env(marketing)
        api_server_env = _serve_env(api_server)

        assert marketing_env["REPRO_APP_URL"] == "https://app.wt-rep-397.repro.localhost:1355"
        assert marketing_env["REPRO_MARKETING_URL"] == "https://marketing.wt-rep-397.repro.localhost:1355"
        assert api_server_env["REPRO_APP_URL"] == "https://app.wt-rep-397.repro.localhost:1355"
        assert api_server_env["REPRO_API_URL"] == "https://api.wt-rep-397.repro.localhost:1355"
        assert api_server_env["REPRO_ADMIN_URL"] == "https://admin.wt-rep-397.repro.localhost:1355"

    def test_main_checkout_portless_services_stay_unsuffixed(self):
        tilt_result = _render_tilt(
            [
                {"name": "marketing", "source": ".", "slug": ""},
                {"name": "api-server", "source": ".", "slug": ""},
            ]
        )

        marketing = _manifest(tilt_result, "marketing")
        api_server = _manifest(tilt_result, "api-server")

        assert marketing["Name"] == "marketing"
        assert api_server["Name"] == "api-server"

        marketing_env = _serve_env(marketing)
        api_server_env = _serve_env(api_server)

        assert marketing_env["REPRO_APP_URL"] == "https://app.repro.localhost:1355"
        assert marketing_env["REPRO_MARKETING_URL"] == "https://marketing.repro.localhost:1355"
        assert api_server_env["REPRO_APP_URL"] == "https://app.repro.localhost:1355"
        assert api_server_env["REPRO_API_URL"] == "https://api.repro.localhost:1355"

    def test_codegen_outputs_live_outside_src_and_need_no_tilt_workaround(self):
        domain_package = _read_json(REPO_ROOT / "packages" / "domain" / "package.json")
        domain_moon = (REPO_ROOT / "packages" / "domain" / "moon.yml").read_text()
        domain_tsconfig = _read_json(REPO_ROOT / "packages" / "domain" / "tsconfig.json")
        domain_gitignore = (REPO_ROOT / "packages" / "domain" / ".gitignore").read_text()

        wire_package = _read_json(
            REPO_ROOT / "packages" / "wire-formats" / "package.json"
        )
        wire_moon = (REPO_ROOT / "packages" / "wire-formats" / "moon.yml").read_text()
        wire_tsconfig = _read_json(REPO_ROOT / "packages" / "wire-formats" / "tsconfig.json")
        wire_gitignore = (REPO_ROOT / "packages" / "wire-formats" / ".gitignore").read_text()

        tiltfile_text = (REPO_ROOT / "infra" / "tilt-lib" / "services.Tiltfile").read_text()

        assert domain_package["scripts"]["build"] == "tdlc src --outdir generated"
        assert "generated/**/*" in domain_moon
        assert "generated/**/*.ts" in domain_tsconfig["include"]
        assert domain_tsconfig["compilerOptions"]["rootDir"] == "."
        assert domain_gitignore.splitlines()[0] == "generated"

        assert wire_package["scripts"]["build"] == "tdlc src --outdir generated"
        assert wire_package["scripts"]["clean"] == "rimraf generated"
        assert "generated/**/*" in wire_moon
        assert "generated/**/*.ts" in wire_tsconfig["include"]
        assert wire_tsconfig["compilerOptions"]["rootDir"] == "."
        assert wire_gitignore.splitlines()[0] == "generated"

        assert "REP-873" not in tiltfile_text
        assert "src/generated" not in tiltfile_text
