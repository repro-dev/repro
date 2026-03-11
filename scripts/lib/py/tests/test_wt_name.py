"""Tests for wt_name.py — verifies parity with the Starlark wt_name()."""

import subprocess
import sys

import pytest

from conftest import run_script


def _starlark_hash_suffix(s):
    h = 0
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return "%x" % h


def _starlark_wt_name(base, slug, max_len=49):
    full = base + "-wt-" + slug
    if len(full) <= max_len:
        return full
    hash_suffix = _starlark_hash_suffix(slug)[:6]
    budget = max_len - len(base) - len("-wt-") - 1 - 6
    if budget < 1:
        budget = 1
    return base + "-wt-" + slug[:budget] + "-" + hash_suffix


TEST_CASES = [
    ("workspace", "gary-short", 49),
    ("workspace", "gary-rep-237-some-very-long-feature-branch-name-here", 49),
    (
        "api-server",
        "gary-rep-364-reproctl-restartstop-fails-for-worktrees-with-long-branch",
        49,
    ),
    ("gateway", "gary-rep-999-extremely-long-slug-that-exceeds-all-limits-by-far", 49),
    ("a", "b", 49),
    ("workspace", "a", 49),
    ("workspace", "gary-rep-100-just-barely-over-the-limit-xxxxxxxxx", 49),
    ("very-long-base-name", "gary-rep-500-another-long-slug-name-here", 49),
    ("x", "gary-rep-200-slug", 20),
    ("workspace", "rep-361", 49),
    ("api-server", "rep-364", 49),
    ("gateway", "rep-999", 49),
]


class TestWtName:
    @pytest.mark.parametrize("base,slug,max_len", TEST_CASES)
    def test_matches_starlark(self, base, slug, max_len):
        expected = _starlark_wt_name(base, slug, max_len)
        result = run_script("wt_name.py", args=["name", base, slug, str(max_len)])
        assert result.returncode == 0, f"Script failed: {result.stderr}"
        actual = result.stdout.strip()
        assert actual == expected
        assert len(actual) <= max_len

    @pytest.mark.parametrize("base,slug,max_len", TEST_CASES)
    def test_length_constraint(self, base, slug, max_len):
        expected = _starlark_wt_name(base, slug, max_len)
        assert len(expected) <= max_len

    def test_short_name_no_truncation(self):
        result = run_script("wt_name.py", args=["name", "workspace", "gary-short"])
        assert result.returncode == 0
        assert result.stdout.strip() == "workspace-wt-gary-short"

    def test_issue_id_slug(self):
        result = run_script("wt_name.py", args=["name", "workspace", "rep-361"])
        assert result.returncode == 0
        assert result.stdout.strip() == "workspace-wt-rep-361"

    def test_default_max_len(self):
        result = run_script("wt_name.py", args=["name", "workspace", "short"])
        assert result.returncode == 0
        assert result.stdout.strip() == "workspace-wt-short"

    def test_missing_args(self):
        result = run_script("wt_name.py", args=[])
        assert result.returncode == 1

    def test_backward_compat_bare_args(self):
        result = run_script("wt_name.py", args=["workspace", "gary-short"])
        assert result.returncode == 0
        assert result.stdout.strip() == "workspace-wt-gary-short"

    @pytest.mark.parametrize(
        "base,slug",
        [
            (
                "api-server",
                "gary-rep-364-reproctl-restartstop-fails-for-worktrees-with-long-branch",
            ),
            (
                "workspace",
                "gary-rep-363-worktree-service-hostnames-may-not-resolve-depending-on",
            ),
            (
                "gateway",
                "gary-rep-999-extremely-long-slug-that-exceeds-all-limits-by-far",
            ),
        ],
    )
    def test_k8s_label_constraint(self, base, slug):
        result = run_script("wt_name.py", args=["name", base, slug])
        assert result.returncode == 0
        name = result.stdout.strip()
        longest_resource = name + "-ingress-admin"
        assert len(longest_resource) <= 63, (
            f"Resource name {longest_resource!r} ({len(longest_resource)} chars) "
            f"exceeds 63-byte Kubernetes label limit"
        )

    @pytest.mark.parametrize(
        "base,slug",
        [
            ("workspace", "rep-361"),
            ("api-server", "rep-364"),
            ("gateway", "rep-999"),
        ],
    )
    def test_issue_id_slug_k8s_constraint(self, base, slug):
        result = run_script("wt_name.py", args=["name", base, slug])
        assert result.returncode == 0
        name = result.stdout.strip()
        longest_resource = name + "-ingress-admin"
        assert len(longest_resource) <= 63

    @pytest.mark.parametrize(
        "slug",
        [
            "rep-361",
            "rep-364",
            "rep-999",
        ],
    )
    def test_issue_id_dns_label_constraint(self, slug):
        dns_label = "wt-" + slug
        assert len(dns_label) <= 63
